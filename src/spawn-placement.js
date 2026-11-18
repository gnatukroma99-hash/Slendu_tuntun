// A rotating pickup is up to 0.8 m wide; leave room for its mesh and approach.
export const PICKUP_CLEARANCE = 0.7;
export const PICKUP_BOTTOM = 0.04;
export const PICKUP_TOP = 1.05;

export function preparePickupSpawns(spawns, physics) {
  const result = [];
  const free = (x, z) => {
    const y = physics.groundAt(x, z);
    if (!Number.isFinite(y)) return false;
    if (physics.isPickupPositionFree && !physics.isPickupPositionFree(x, z)) return false;
    if (result.some(([px, , pz]) => Math.hypot(px - x, pz - z) < 1.2)) return false;
    // Reject steep patches: placing at the centre height must not bury an edge.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (Math.abs(physics.groundAt(x + dx * 0.45, z + dz * 0.45) - y) > 0.22) return false;
    }
    // At least two approaches must be walkable, not just the zero-length move
    // which incorrectly succeeds inside a hollow rock.
    let approaches = 0;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const from = { x: x + Math.cos(angle) * 1.15, z: z + Math.sin(angle) * 1.15 };
      from.y = physics.groundAt(from.x, from.z);
      if (physics.canMove(from, x, z) && physics.canMove({ x, y, z }, from.x, from.z) && ++approaches >= 2) return true;
    }
    return false;
  };
  for (const point of spawns) {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[2])) continue;
    const [x, , z] = point;
    let found = null;
    if (free(x, z)) found = [x, physics.groundAt(x, z), z];
    // Fixed order and distances keep the browser and authoritative server equal.
    for (let radius = 0.75; !found && radius <= 12; radius += 0.75) {
      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12, nx = x + Math.cos(angle) * radius, nz = z + Math.sin(angle) * radius;
        if (free(nx, nz)) { found = [nx, physics.groundAt(nx, nz), nz]; break; }
      }
    }
    // Never fall back to an obstructed position if no safe replacement exists.
    if (found) result.push(found);
  }
  return result;
}
