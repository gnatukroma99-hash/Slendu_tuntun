export const HUNT_HEALTH = 10;
export const ATTACK_RANGE = 1.85;
export const ATTACK_COOLDOWN = 0.8;
export const BUNNY_DURATION = 10;
export const BUNNY_COOLDOWN = 45;

export function roleSpeed(mode, role, elapsed) {
  if (mode.pvp && role === 'killer') return elapsed < mode.hideTime ? 0 : 1.12;
  return 1;
}

export function createRabbitDecoys(physics, position, owner, expires) {
  const result = [];
  for (let i = 0; i < 6; i++) {
    let point = null;
    for (const radius of [3, 4.5, 6, 1.5]) {
      const angle = i * Math.PI / 3, x = position.x + Math.sin(angle) * radius, z = position.z + Math.cos(angle) * radius;
      if (physics.isPickupPositionFree && !physics.isPickupPositionFree(x, z, 0.4)) continue;
      if (!physics.canMove(position, x, z, 0.25)) continue;
      point = { x, y: physics.groundAt(x, z), z }; break;
    }
    // Even in a cramped room the ability still makes a group near its owner.
    point ||= { x: position.x, y: physics.groundAt(position.x, position.z), z: position.z };
    result.push({ ...point, id: `${owner}:${expires}:${i}`, owner, expires });
  }
  return result;
}
