// Deterministic map layouts: the renderer and server use the same solids.
import { PICKUP_CLEARANCE } from './spawn-placement.js';
import { segmentBoxEntry, segmentIntersectsRect, terrainImpact } from './collision.js';
export const LOCATIONS = Object.freeze({
  forest: { id: 'forest', title: 'Классический лес', description: 'Оригинальная извлечённая карта. Тинки-Винки уже рядом.', monster: 'tinky', background: '#0d1412' },
  lake: { id: 'lake', title: 'Озеро · Lake', description: 'Болото, мёртвые деревья и мостки. Здесь бродит Озёрный Дипси. Веб-версия по мотивам S2.', monster: 'dipsy', background: '#101d26' },
  outskirts: { id: 'outskirts', title: 'Окраины · Outskirts', description: 'Сухие холмы и руины на закате. Ля-Ля слышит твои шаги. Веб-версия по мотивам S2.', monster: 'laalaa', background: '#322829' },
  station: { id: 'station', title: 'Спутниковая станция', description: 'Холодные коридоры, серверные залы и По. Слушай тиканье. Веб-версия по мотивам S2.', monster: 'po', background: '#090e19' },
});
export function getLocation(id) { return typeof id === 'string' && Object.hasOwn(LOCATIONS, id) ? LOCATIONS[id] : LOCATIONS.forest; }

const box = (x, z, w, d, height = 3, kind = 'wall') => ({ x, z, w, d, height, kind });
export function locationLayout(id) {
  id = getLocation(id).id;
  const solids = [], decorations = [];
  if (id === 'lake') {
    solids.push(box(-4, -9, 24, 14, 0.08, 'water'), box(-4, 9, 24, 14, 0.08, 'water'));
    for (let i = 0; i < 18; i++) {
      const angle = i * 2.4, x = Math.sin(angle) * (22 + i % 3 * 4), z = Math.cos(angle) * (22 + i % 4 * 3);
      if (Math.abs(x) > 5 || z > -22) solids.push(box(x, z, 0.65, 0.65, 4 + i % 4, 'tree'));
    }
    decorations.push(box(-4, 0, 27, 3.6, 0.12, 'bridge'), box(-29, -21, 0.4, 0.4, 13, 'antenna'));
  } else if (id === 'outskirts') {
    for (const [x, z, w, d] of [[-16, -8, 2, 15], [-9, 0, 12, 2], [11, 9, 2, 16], [21, 15, 15, 2], [-22, 22, 12, 2], [21, -20, 2, 12]]) solids.push(box(x, z, w, d, 3.4, 'ruin'));
    for (let i = 0; i < 12; i++) solids.push(box(Math.sin(i * 2.4) * 33, Math.cos(i * 2.4) * 33, 1.4, 1.4, 3 + i % 3, 'rock'));
    decorations.push(box(31, 28, 10, 10, 8, 'dish'));
  } else if (id === 'station') {
    for (const x of [-20, 20]) {
      solids.push(box(x, -22, 1.1, 18, 5), box(x, 22, 1.1, 18, 5), box(x, 0, 1.1, 14, 5));
    }
    for (const z of [-13, 13]) {
      for (const x of [-30, 0, 30]) solids.push(box(x, z, x === 0 ? 14 : 16, 1.1, 5));
    }
    for (const [x, z] of [[-29, -28], [29, -28], [-29, 28], [29, 28], [-11, 3], [11, -3]]) solids.push(box(x, z, 2.2, 3, 3.6, 'server'));
    decorations.push(box(0, 0, 2.6, 2.6, 0.2, 'beacon'));
  }
  if (id === 'lake' || id === 'outskirts') {
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      decorations.push(box(Math.sin(angle) * 43, Math.cos(angle) * 43, 12, 12, 8 + (i % 4) * 2, 'boundary'));
    }
  }
  const spawn = { x: 0, y: 0, z: -30 };
  const footprint = (s) => {
    const halfX = (s.kind === 'rock' || s.kind === 'dish') ? s.w * 0.8 : s.w / 2;
    const halfZ = (s.kind === 'rock' || s.kind === 'dish') ? s.d * 0.8 : s.d / 2;
    return { minX: s.x - halfX, maxX: s.x + halfX, minZ: s.z - halfZ, maxZ: s.z + halfZ };
  };
  const movementVolumes = [...solids, ...decorations.filter((s) => s.kind !== 'bridge' && s.kind !== 'beacon')].map(footprint);
  const blocked = (x, z, radius = 0.28) => movementVolumes.some((s) => segmentIntersectsRect(x, z, x, z, s, radius));
  // Visual rocks are wider than their movement colliders; decorations such as
  // the dish foundation, bridge deck and station beacon also occupy volume.
  const pickupVolumes = [...solids, ...decorations].map(footprint);
  const projectileVolumes = [...solids, ...decorations].map((s) => ({ ...footprint(s), minY: 0, maxY: s.height }));
  if (id === 'station') projectileVolumes.push({ minX: -40, maxX: 40, minZ: -40, maxZ: 40, minY: 6.1, maxY: 6.3 });
  const pickupBlocked = (x, z, radius = PICKUP_CLEARANCE) => pickupVolumes.some((s) => segmentIntersectsRect(x, z, x, z, s, radius));
  const spawns = [[0, 0, -29.2]];
  for (let z = -30; z <= 30; z += 10) for (let x = -30; x <= 30; x += 10) if (!blocked(x, z, 1.4) && !pickupBlocked(x, z) && Math.hypot(x, z + 30) > 3) spawns.push([x, 0, z]);
  return { id, solids, decorations, spawn, spawns, size: 80, blocked, pickupBlocked, movementVolumes, projectileVolumes };
}

export function createLocationPhysics(id) {
  const layout = locationLayout(id);
  const bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
  const groundAt = () => 0;
  return {
    groundAt, bounds, layout,
    traceProjectile(from, to, radius) {
      let first = terrainImpact(from, to, radius, groundAt, bounds);
      for (const box of layout.projectileVolumes) first = Math.min(first, segmentBoxEntry(from, to, box, radius));
      return first;
    },
    isPickupPositionFree(x, z, radius = PICKUP_CLEARANCE) {
      return [x, z, radius].every(Number.isFinite) && radius >= 0 && Math.abs(x) <= 39 - radius && Math.abs(z) <= 39 - radius && !layout.pickupBlocked(x, z, radius);
    },
    canMove(from, x, z, radius = 0.28) {
      if (![from.x, from.z, x, z, radius].every(Number.isFinite) || radius < 0) return false;
      if (Math.abs(x) > 39 - radius || Math.abs(z) > 39 - radius) return false;
      return !layout.movementVolumes.some((box) => segmentIntersectsRect(from.x, from.z, x, z, box, radius));
    },
  };
}
