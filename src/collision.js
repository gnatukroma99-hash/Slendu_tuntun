// Swept circle vs. conservative rectangle. Handles zero-length moves and fast
// movement/corrections, rather than only testing the destination or mesh shell.
export function segmentIntersectsRect(fromX, fromZ, toX, toZ, box, radius = 0) {
  let enter = 0, exit = 1;
  for (const [start, end, min, max] of [
    [fromX, toX, box.minX - radius, box.maxX + radius],
    [fromZ, toZ, box.minZ - radius, box.maxZ + radius],
  ]) {
    const delta = end - start;
    if (Math.abs(delta) < 1e-10) { if (start < min || start > max) return false; continue; }
    let near = (min - start) / delta, far = (max - start) / delta;
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near); exit = Math.min(exit, far);
    if (enter > exit) return false;
  }
  return true;
}

// Earliest contact along a 3D segment. Infinity means clear.
export function segmentBoxEntry(from, to, box, radius = 0) {
  let enter = 0, exit = 1;
  for (const axis of ['X', 'Y', 'Z']) {
    const key = axis.toLowerCase(), start = from[key], delta = to[key] - start;
    const min = box[`min${axis}`] - radius, max = box[`max${axis}`] + radius;
    if (Math.abs(delta) < 1e-10) { if (start < min || start > max) return Infinity; continue; }
    const a = (min - start) / delta, b = (max - start) / delta;
    enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) return Infinity;
  }
  return enter;
}

// Terrain is not a flat slab in the forest, so sample and refine the first crossing.
export function terrainImpact(from, to, radius, groundAt, bounds) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const blocked = (t) => {
    const x = from.x + dx * t, z = from.z + dz * t;
    return x < bounds.minX + radius || x > bounds.maxX - radius || z < bounds.minZ + radius || z > bounds.maxZ - radius
      || from.y + dy * t - radius <= groundAt(x, z);
  };
  if (blocked(0)) return 0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / 0.2));
  for (let i = 1; i <= steps; i++) {
    if (!blocked(i / steps)) continue;
    let lo = (i - 1) / steps, hi = i / steps;
    for (let j = 0; j < 8; j++) {
      const mid = (lo + hi) / 2;
      if (blocked(mid)) hi = mid; else lo = mid;
    }
    return hi;
  }
  return Infinity;
}
