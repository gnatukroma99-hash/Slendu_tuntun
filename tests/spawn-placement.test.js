import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createPhysics } from '../src/physics.js';
import { createLocationPhysics } from '../src/locations.js';
import { preparePickupSpawns } from '../src/spawn-placement.js';
import { segmentIntersectsRect } from '../src/collision.js';
import { selectSpawns, seededRandom } from '../src/core.js';
import { Room } from '../server/room.js';

function hollowScene(name = 'RockMesh', collision = false, height = 2, treeInstances = []) {
  const geometry = new THREE.BoxGeometry(8, 4, 8);
  const vertices = geometry.attributes.position.array;
  // Remove the bottom: a literal open, hollow decorative shell, not a solid.
  const indices = new Uint32Array([...geometry.index.array].filter((_, index) => index < 18 || index >= 24));
  const binary = new ArrayBuffer(8 + vertices.byteLength + indices.byteLength);
  new Float32Array(binary, 8, vertices.length).set(vertices);
  new Uint32Array(binary, 8 + vertices.byteLength, indices.length).set(indices);
  const data = {
    worldScale: 1,
    terrain: { position: [50, 0, -50], width: 100, depth: 100, height: 1, resolution: 2, samples: { offset: 0, count: 4 } },
    meshes: { shell: { name, position: { offset: 8, count: vertices.length }, indices: { offset: 8 + vertices.byteLength, count: indices.length } } },
    nodes: [{ name, mesh: 'shell', collision, position: [0, height, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], children: [] }],
    trees: { instances: treeInstances },
  };
  geometry.dispose(); return createPhysics(data, binary);
}

test('spawns reject hollow non-colliding decorations even when a zero-length movement check succeeds', () => {
  const p = hollowScene('DecorativeShell');
  assert.equal(p.canMove({ x: 0, y: 0, z: 0 }, 0, 0), true);
  assert.equal(p.isPickupPositionFree(0, 0), false);
  assert.equal(p.isPickupPositionFree(4.5, 0), false, 'leave clearance for the entire rotating bowl');
  const safe = preparePickupSpawns([[0, 0, 0]], p);
  assert.equal(safe.length, 1); assert.equal(p.isPickupPositionFree(safe[0][0], safe[0][2]), true);
  assert.ok(Math.abs(safe[0][0]) > 4.7 || Math.abs(safe[0][2]) > 4.7);
});

test('hollow rocks block their interior, normal walking and fast movement even without a collider flag', () => {
  const p = hollowScene();
  assert.equal(p.canMove({ x: -6, y: 0, z: 0 }, 6, 0), false);
  assert.equal(p.canMove({ x: -4.5, y: 0, z: 0 }, -4.1, 0), false);
  assert.equal(p.canMove({ x: 0, y: 0, z: 0 }, 0, 0), false);
  assert.equal(p.canMove({ x: -4.5, y: 0, z: 0 }, -4.5, 6), true, 'walking alongside remains possible');
  assert.equal(hollowScene('RockMesh', false, 8).canMove({ x: -6, y: 0, z: 0 }, 6, 0), true, 'a rock above head height is not a ground-level wall');
});

test('pickup checks include trees rendered only on higher quality presets', () => {
  const p = hollowScene('DecorativeShell', false, 8, [
    { position: [30, 0, 30], scale: [1, 1, 1] },
    { position: [0, 0, 0], scale: [1, 1, 1] },
  ]);
  assert.equal(p.canMove({ x: 0, y: 0, z: 0 }, 0, 0), true);
  assert.equal(p.isPickupPositionFree(0, 0), false);
});

test('swept rectangle checks catch tunnelling, endpoints, zero-length overlap and allow parallel paths', () => {
  const box = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  assert.equal(segmentIntersectsRect(-100, 0, 100, 0, box, 0.28), true);
  assert.equal(segmentIntersectsRect(0, 0, 0, 0, box), true);
  assert.equal(segmentIntersectsRect(-2, 1.2, 2, 1.2, box, 0.28), true);
  assert.equal(segmentIntersectsRect(-2, 2, 2, 2, box, 0.28), false);
});

test('unsafe points never fall back inside an obstacle; invalid and duplicate inputs are handled safely', () => {
  const blocked = { groundAt: () => 0, canMove: () => false, isPickupPositionFree: () => false };
  assert.deepEqual(preparePickupSpawns([[0, 0, 0]], blocked), []);
  const flat = { groundAt: () => 0, canMove: () => true, isPickupPositionFree: () => true };
  const safe = preparePickupSpawns([[NaN, 0, 0], null, [0, 0, 0], [0, 0, 0]], flat);
  assert.equal(safe.length, 2); assert.ok(Math.hypot(safe[0][0] - safe[1][0], safe[0][2] - safe[1][2]) >= 1.2);
});

test('original forest: all 25 markers are repaired deterministically and shared with the authoritative room', () => {
  const data = JSON.parse(readFileSync(new URL('../public/assets/scene.json', import.meta.url)));
  const bytes = readFileSync(new URL('../public/assets/scene.bin', import.meta.url));
  const p = createPhysics(data, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const raw = data.collectibleSpawns.map((point) => point.map((v) => v * data.worldScale));
  assert.equal(p.isPickupPositionFree(raw[3][0], raw[3][2]), false, 'reproduce the original rock marker');
  assert.equal(p.isPickupPositionFree(raw[18][0], raw[18][2]), false, 'reproduce overlapping rock decorations');
  const safe = preparePickupSpawns(raw, p);
  assert.equal(safe.length, 25); assert.deepEqual(safe, preparePickupSpawns(raw, p));
  const spawn = { x: data.spawn[0] * data.worldScale, y: data.spawn[1] * data.worldScale, z: data.spawn[2] * data.worldScale };
  assert.ok(Math.min(...safe.map(([x, , z]) => Math.hypot(x - spawn.x, z - spawn.z))) < 1);
  for (const [x, y, z] of safe) { assert.equal(p.isPickupPositionFree(x, z), true); assert.equal(p.canMove({ x, y, z }, x, z), true); }
  for (let seed = 0; seed < 200; seed++) {
    const chosen = selectSpawns(safe, spawn, 10, seededRandom(seed));
    assert.equal(chosen.length, 10); assert.ok(chosen.every(({ x, z }) => p.isPickupPositionFree(x, z)));
  }
  const room = new Room('ABC234', data, p); assert.deepEqual(room.spawns, safe);
  room.addPlayer('host', 'Host', 'one'); room.addPlayer('guest', 'Guest', 'two'); room.start('host');
  assert.ok(room.pickups.every(({ x, z }) => p.isPickupPositionFree(x, z)));
});

for (const id of ['lake', 'outskirts', 'station']) {
  test(`${id}: pickup pool avoids visual decorations; server uses the same safe positions`, () => {
    const p = createLocationPhysics(id), safe = preparePickupSpawns(p.layout.spawns, p);
    assert.ok(safe.length >= 10);
    for (const [x, y, z] of safe) { assert.equal(p.isPickupPositionFree(x, z), true); assert.equal(p.canMove({ x, y, z }, x, z), true); }
    if (id !== 'station') assert.equal(p.canMove({ x: 0, y: 0, z: 35.5 }, 0, 38), false, 'edge rocks must be solid before reaching the map boundary');
    if (id === 'outskirts') assert.equal(p.isPickupPositionFree(31, 28), false, 'dish rock foundation is a decoration but still occupies space');
    if (id === 'station') assert.equal(p.isPickupPositionFree(0, 0), false, 'station beacon is not a spawn surface');
    const data = { worldScale: 1, spawn: [0, 0, 0], collectibleSpawns: safe };
    const room = new Room('ABC234', data, p); room.addPlayer('host', 'Host', 'one'); room.addPlayer('guest', 'Guest', 'two');
    room.setWorld('host', { location: id }); assert.deepEqual(room.spawns, safe);
  });
}
