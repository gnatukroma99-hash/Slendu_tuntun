import { getMode } from './modes.js';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const distance2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function seededRandom(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleHeight(samples, resolution, u, v, height = 1) {
  const x = clamp(u, 0, 1) * (resolution - 1);
  const z = clamp(v, 0, 1) * (resolution - 1);
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const x1 = Math.min(x0 + 1, resolution - 1), z1 = Math.min(z0 + 1, resolution - 1);
  const a = samples[z0 * resolution + x0] * (1 - (x - x0)) + samples[z0 * resolution + x1] * (x - x0);
  const b = samples[z1 * resolution + x0] * (1 - (x - x0)) + samples[z1 * resolution + x1] * (x - x0);
  return ((a * (1 - (z - z0)) + b * (z - z0)) / 32767) * height;
}

export function terrainHeightAt(terrain, samples, scale, x, z) {
  const u = (terrain.position[0] - x / scale) / terrain.width;
  const v = (z / scale - terrain.position[2]) / terrain.depth;
  // Unity 5.6 serializes this TerrainData in column-major (x * size + z) order.
  return terrain.position[1] * scale + sampleHeight(samples, terrain.resolution, v, u, terrain.height * scale);
}

export function selectSpawns(spawns, spawn, count, random = Math.random) {
  const candidates = spawns.map((position) => ({ x: position[0], y: position[1], z: position[2] }));
  if (candidates.length < count) throw new Error('Недостаточно точек появления крема');
  candidates.sort((a, b) => distance2D(a, spawn) - distance2D(b, spawn));
  const result = [candidates.shift()];
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return result.concat(candidates.slice(0, count - 1));
}

export function formatTime(seconds) {
  const whole = Math.floor(Math.max(0, seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export class GameSession {
  constructor(goal = 10, mode = 'classic') {
    this.goal = goal;
    this.mode = getMode(mode);
    this.reset();
    this.state = 'menu';
  }

  reset() {
    this.collected = new Set();
    this.elapsed = 0;
    this.stamina = 1;
    this.exhausted = false;
    this.state = 'playing';
  }

  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }

  tick(dt, sprintRequested, moving) {
    if (this.state !== 'playing') return false;
    dt = clamp(dt, 0, 0.1);
    this.elapsed += dt;
    const running = sprintRequested && moving && !this.exhausted && this.stamina > 0;
    this.stamina = clamp(this.stamina + (running ? -0.14 * this.mode.drain : 0.09 * this.mode.recovery) * dt, 0, 1);
    if (this.stamina === 0) this.exhausted = true;
    if (this.stamina > 0.25) this.exhausted = false;
    return running;
  }

  collect(id) {
    if (this.state !== 'playing' || this.collected.has(id)) return false;
    this.collected.add(id);
    if (this.collected.size >= this.goal) this.state = 'won';
    return true;
  }

  catchPlayer() { if (this.state === 'playing') this.state = 'lost'; }
}
