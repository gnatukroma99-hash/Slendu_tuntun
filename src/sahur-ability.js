import motion from './sahur-throw.json' with { type: 'json' };

export const BAT_STUN_DURATION = 10;
export const BAT_COOLDOWN = 45;
export const BAT_SPEED = 24;
export const BAT_RANGE = 16;
const BAT_RADIUS = 0.14;
export const BAT_RELEASE = motion.release / motion.fps;
export const BAT_THROW_LENGTH = motion.poses.at(-1)[0] / motion.fps;

export function makeBatShot(id, owner, position, yaw, pitch, scale) {
  const horizontal = Math.cos(pitch);
  return {
    id, owner, x: position.x, y: position.y + 1.25 * scale, z: position.z,
    dx: -Math.sin(yaw) * horizontal, dy: Math.sin(pitch), dz: -Math.cos(yaw) * horizontal, distance: 0,
  };
}

export function batMonsterTarget(position, mode, id) {
  const height = mode.funny ? 3.45 : ({ dipsy: 3.6, laalaa: 3.15, po: 3, newborn: 1.45, chainsaw: 2.2 })[id] ?? 2.6;
  return { position, height: height * mode.enemyScale, radius: 0.46 * mode.enemyScale };
}

export function batPlayerTarget(player, mode, elapsed) {
  const rabbit = elapsed < player.abilityUntil;
  return { player, position: player.position, height: (rabbit ? 1.2 : 1.75) * mode.playerScale, radius: (rabbit ? 0.27 : 0.37) * mode.playerScale };
}

// Sweep against a vertical cylinder: intersect the horizontal circle interval
// with the height interval. A fast shot cannot tunnel through a nearby actor.
function targetEntry(from, to, { position, radius, height }) {
  const x = from.x - position.x, z = from.z - position.z;
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  const a = dx * dx + dz * dz, b = x * dx + z * dz, c = x * x + z * z - (radius + BAT_RADIUS) ** 2;
  let enter = 0, exit = 1;
  if (a < 1e-10) { if (c > 0) return Infinity; }
  else {
    const d = b * b - a * c;
    if (d < 0) return Infinity;
    const root = Math.sqrt(d);
    enter = Math.max(enter, (-b - root) / a); exit = Math.min(exit, (-b + root) / a);
  }
  const bottom = position.y - BAT_RADIUS, top = position.y + height + BAT_RADIUS;
  if (Math.abs(dy) < 1e-10) { if (from.y < bottom || from.y > top) return Infinity; }
  else {
    const t0 = (bottom - from.y) / dy, t1 = (top - from.y) / dy;
    enter = Math.max(enter, Math.min(t0, t1)); exit = Math.min(exit, Math.max(t0, t1));
  }
  return enter <= exit ? enter : Infinity;
}

// Both solo and the authoritative server use this. No client hit claims.
export function stepBat(shot, dt, physics, targets) {
  const length = Math.min(BAT_SPEED * dt, BAT_RANGE - shot.distance);
  if (length <= 0) return shot.distance >= BAT_RANGE ? { target: null, blocked: false } : null;
  const end = { x: shot.x + shot.dx * length, y: shot.y + shot.dy * length, z: shot.z + shot.dz * length };
  const wall = physics.traceProjectile(shot, end, BAT_RADIUS);
  let first = wall, target = null;
  for (const actor of targets) {
    const entry = targetEntry(shot, end, actor);
    if (entry < first) { first = entry; target = actor; }
  }
  const travel = length * Math.min(first, 1);
  shot.x += shot.dx * travel; shot.y += shot.dy * travel; shot.z += shot.dz * travel; shot.distance += travel;
  return target || wall <= 1 || shot.distance >= BAT_RANGE ? { target, blocked: !target && wall <= 1 } : null;
}
