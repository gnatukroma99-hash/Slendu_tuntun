import { distance2D } from './core.js';

export const EMOTE_TIME = 2.2, EMOTE_COOLDOWN = 4, TV_RANGE = 2.15;
export const EMOTES = Object.freeze({ taps: 'Тун-тун-тун!', flex: 'Покажи бицепс', ears: 'Я в домике!', wave: 'Привет из леса' });
export const TV_NAMES = ['Ель', 'Луна', 'Сова'];
export const signature = (skin, role) => skin === 'sahur' ? 'taps' : skin === 'sahur-buff' ? 'flex' : skin === 'hare' && role !== 'killer' ? 'ears' : 'wave';
export const newRoundStats = () => ({ pickups: 0, rescues: 0, tags: 0, stuns: 0, emotes: 0, meters: 0, idle: 0 });
export function recordMovement(stats, meters, dt) {
  if (meters > 0.0001) stats.meters += meters; else stats.idle += dt;
}

// Build accessible channels near the round entrance, outside all pickup footprints.
export function placeTelevisions(physics, spawn, pickups) {
  const result = [];
  for (let slot = 0; slot < TV_NAMES.length; slot++) {
    let found = false;
    for (const radius of [9 + slot * 2, 7, 5, 14, 3.5]) {
      for (let i = 0; i < 24 && !found; i++) {
        const a = (slot / 3 + i / 24) * Math.PI * 2 + 0.32;
        const x = spawn.x + Math.cos(a) * radius, z = spawn.z + Math.sin(a) * radius, y = physics.groundAt(x, z);
        const p = { id: slot, x, y, z };
        if (!Number.isFinite(y) || result.some((v) => distance2D(v, p) < 4) || pickups.some((v) => distance2D(v, p) < 2.2)) continue;
        if (physics.isPickupPositionFree && !physics.isPickupPositionFree(x, z, 0.82)) continue;
        if (Math.abs(physics.groundAt(x + 0.5, z) - y) > .20 || Math.abs(physics.groundAt(x - 0.5, z) - y) > .20 || Math.abs(physics.groundAt(x, z + 0.4) - y) > .20 || Math.abs(physics.groundAt(x, z - 0.4) - y) > .20) continue;
        let from = spawn, ok = true;
        for (let j = 1, steps = Math.ceil(radius / 0.65); j <= steps; j++) {
          const nx = spawn.x + (x - spawn.x) * j / steps, nz = spawn.z + (z - spawn.z) * j / steps;
          if (!physics.canMove(from, nx, nz, 0.3)) { ok = false; break; }
          from = { x: nx, y: physics.groundAt(nx, nz), z: nz };
        }
        if (ok) { result.push(p); found = true; }
      }
      if (found) break;
    }
  }
  return result;
}

// Real end-of-round stats only. Pick leaders before giving out fallback captions.
export function photoCast(players, funny = false) {
  const rows = players.map((p) => ({ name: p.name, appearance: { ...p.appearance }, stats: { ...p.stats }, title: '', detail: '' }));
  const award = (key, minimum, title, format) => {
    const high = Math.max(0, ...rows.map((r) => r.stats[key]));
    const row = rows.find((r) => !r.title && r.stats[key] === high);
    if (row && high >= minimum) { row.title = title; row.detail = format(high); }
  };
  award('rescues', 1, 'Мастер телеэфира', (n) => `Спасений: ${n}`);
  award('pickups', 1, funny ? 'Морковный магнат' : 'Молочник', (n) => `Собрано порций: ${n}`);
  award('tags', 1, 'Догонялкин', (n) => `Удачных поимок: ${n}`);
  award('stuns', 1, 'Точный бросок', (n) => `Оглушений: ${n}`);
  award('emotes', 1, 'Звезда эфира', (n) => `Эмоций: ${n}`);
  award('meters', 4, 'Лесной марафонец', (n) => `Пройдено: ${Math.floor(n)} м`);
  award('idle', 2, 'Местная достопримечательность', (n) => `Без движения: ${Math.floor(n)} с`);
  for (const row of rows) if (!row.title) {
    row.title = row.stats.meters >= 1 ? 'Следопыт' : 'Очевидец';
    row.detail = `Пройдено: ${Math.floor(row.stats.meters)} м`;
  }
  return rows;
}
