// Shared deterministic collision/movement code. Runs in Node and in the browser.
import * as THREE from 'three';
import { clamp, terrainHeightAt } from './core.js';
import { PICKUP_BOTTOM, PICKUP_CLEARANCE, PICKUP_TOP } from './spawn-placement.js';
import { segmentBoxEntry, segmentIntersectsRect, terrainImpact } from './collision.js';

export const PICKUP_RADIUS = 2.1;
export const AUTO_PICKUP_RADIUS = 1.35;
export const WALK_SPEED = 3.3;
export const RUN_SPEED = 5.8;

export function createPhysics(data, binary) {
  const scale = data.worldScale;
  const terrain = data.terrain;
  const heights = new Uint16Array(binary, terrain.samples.offset, terrain.samples.count);
  const groundAt = (x, z) => terrainHeightAt(terrain, heights, scale, x, z);
  const bounds = {
    minX: (terrain.position[0] - terrain.width) * scale,
    maxX: terrain.position[0] * scale,
    minZ: terrain.position[2] * scale,
    maxZ: (terrain.position[2] + terrain.depth) * scale,
  };
  const geometries = new Map();
  const obstacles = [];
  const visibleMeshes = [];
  const rockMeshes = [];
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  function makeNode(spec) {
    const group = new THREE.Group();
    group.position.fromArray(spec.position);
    group.quaternion.fromArray(spec.rotation);
    group.scale.fromArray(spec.scale);
    if (spec.mesh) {
      if (!geometries.has(spec.mesh)) {
        const mesh = data.meshes[spec.mesh];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(binary, mesh.position.offset, mesh.position.count), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(binary, mesh.indices.offset, mesh.indices.count), 1));
        geometry.computeBoundingSphere();
        geometries.set(spec.mesh, geometry);
      }
      const mesh = new THREE.Mesh(geometries.get(spec.mesh), material);
      mesh.name = spec.name;
      group.add(mesh);
      visibleMeshes.push(mesh);
      if (/rock|stone|boulder|cliff|mountain/i.test(`${spec.name} ${data.meshes[spec.mesh].name || ''}`)) rockMeshes.push(mesh);
      if (spec.collision) obstacles.push(mesh);
    }
    spec.children.forEach((child) => group.add(makeNode(child)));
    return group;
  }
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  data.nodes.forEach((spec) => root.add(makeNode(spec)));
  root.updateMatrixWorld(true);
  const collisionBounds = obstacles.map((mesh) => ({ mesh, box: new THREE.Box3().setFromObject(mesh) }));
  // Spawn placement must include decorative/non-colliding and hollow meshes.
  // Conservatively reserve their volume, not merely their raycast surfaces.
  const pickupBounds = visibleMeshes.map((mesh) => new THREE.Box3().setFromObject(mesh));
  const solidRocks = rockMeshes.map((mesh) => {
    const box = new THREE.Box3().setFromObject(mesh);
    return { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, minY: box.min.y, maxY: box.max.y };
  });
  // Identical collision trees on every graphics preset and on the server.
  // Extra trees in medium/high are visual detail only.
  const trees = data.trees.instances.filter((_, index) => index % 4 === 0).map((tree) => ({ x: tree.position[0] * scale, z: tree.position[2] * scale }));
  const projectileTrunks = trees.map(({ x, z }) => {
    const y = groundAt(x, z);
    return { minX: x - 0.22, maxX: x + 0.22, minZ: z - 0.22, maxZ: z + 0.22, minY: y - 0.3, maxY: y + 6 };
  });
  const allTreeTrunks = data.trees.instances.map((tree) => ({ x: tree.position[0] * scale, z: tree.position[2] * scale, radius: 0.22 * Math.max(tree.scale[0], tree.scale[2]) }));
  function isPickupPositionFree(x, z, radius = PICKUP_CLEARANCE) {
    if (![x, z, radius].every(Number.isFinite) || radius < 0) return false;
    if (x < bounds.minX + 1 + radius || x > bounds.maxX - 1 - radius || z < bounds.minZ + 1 + radius || z > bounds.maxZ - 1 - radius) return false;
    for (const tree of allTreeTrunks) if (Math.hypot(x - tree.x, z - tree.z) < radius + tree.radius) return false;
    const y = groundAt(x, z);
    return !pickupBounds.some((box) => box.min.x <= x + radius && box.max.x >= x - radius && box.min.z <= z + radius && box.max.z >= z - radius && box.min.y <= y + PICKUP_TOP && box.max.y >= y + PICKUP_BOTTOM);
  }
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const nearby = [];
  function canMove(from, x, z, radius = 0.28) {
    if (![from.x, from.z, x, z, radius].every(Number.isFinite) || radius < 0) return false;
    if (x < bounds.minX + 1 || x > bounds.maxX - 1 || z < bounds.minZ + 1 || z > bounds.maxZ - 1) return false;
    for (const tree of trees) if (Math.hypot(x - tree.x, z - tree.z) < radius + 0.22) return false;
    const ground = groundAt(x, z);
    if (ground - groundAt(from.x, from.z) > 0.45) return false;
    const fromY = Number.isFinite(from.y) ? from.y : groundAt(from.x, from.z);
    for (const rock of solidRocks) {
      if (rock.maxY < Math.min(fromY, ground) + 0.04 || rock.minY > Math.max(fromY, ground) + 1.3) continue;
      if (segmentIntersectsRect(from.x, from.z, x, z, rock, radius)) return false;
    }
    direction.set(x - from.x, 0, z - from.z);
    const distance = direction.length();
    if (distance < 0.00001) return true;
    direction.divideScalar(distance);
    origin.set(from.x, Math.max(fromY, ground) + 0.32, from.z);
    nearby.length = 0;
    for (const item of collisionBounds) if (item.box.distanceToPoint(origin) < distance + radius + 1) nearby.push(item.mesh);
    raycaster.set(origin, direction);
    raycaster.far = distance + radius;
    return !raycaster.intersectObjects(nearby, false).some((hit) => Math.abs(hit.face?.normal.y || 0) < 0.7);
  }
  function traceProjectile(from, to, radius) {
    let first = terrainImpact(from, to, radius, groundAt, bounds);
    for (const box of solidRocks) first = Math.min(first, segmentBoxEntry(from, to, box, radius));
    const minX = Math.min(from.x, to.x) - radius, maxX = Math.max(from.x, to.x) + radius;
    const minZ = Math.min(from.z, to.z) - radius, maxZ = Math.max(from.z, to.z) + radius;
    for (const box of projectileTrunks) {
      if (box.maxX < minX || box.minX > maxX || box.maxZ < minZ || box.minZ > maxZ) continue;
      first = Math.min(first, segmentBoxEntry(from, to, box, radius));
    }
    direction.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const length = direction.length();
    if (first === 0 || length < 1e-10) return first;
    origin.set(from.x, from.y, from.z);
    nearby.length = 0;
    for (const item of collisionBounds) if (item.box.distanceToPoint(origin) <= length) nearby.push(item.mesh);
    raycaster.set(origin, direction.divideScalar(length));
    raycaster.far = length * Math.min(1, first);
    const wall = raycaster.intersectObjects(nearby, false)[0];
    return wall ? Math.min(first, wall.distance / length) : first;
  }
  return { groundAt, canMove, bounds, isPickupPositionFree, traceProjectile };
}

export function normalizeInput(input = {}) {
  let x = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0;
  let y = Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0;
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  return { x, y, moving: length > 0.08, sprint: input.sprint === true };
}

export function moveActor(physics, position, input, yaw, speed, dt, radius = 0.28) {
  const dx = (input.x * Math.cos(yaw) + input.y * Math.sin(yaw)) * speed * dt;
  const dz = (-input.x * Math.sin(yaw) + input.y * Math.cos(yaw)) * speed * dt;
  const x = position.x, z = position.z;
  if (physics.canMove(position, position.x + dx, position.z, radius)) position.x += dx;
  if (physics.canMove(position, position.x, position.z + dz, radius)) position.z += dz;
  position.y = physics.groundAt(position.x, position.z);
  return Math.hypot(position.x - x, position.z - z);
}
