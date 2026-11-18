import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { GameSession, clamp, distance2D, formatTime, sampleHeight, seededRandom, selectSpawns, terrainHeightAt } from '../src/core.js';

test('heightmap bilinear interpolation, handedness-independent sampling and edge clamping', () => {
  const grid = [0, 32767, 32767, 0];
  assert.equal(sampleHeight(grid, 2, 0, 0, 100), 0);
  assert.equal(sampleHeight(grid, 2, 1, 0, 100), 100);
  assert.equal(sampleHeight(grid, 2, 0.5, 0.5, 100), 50);
  assert.equal(sampleHeight(grid, 2, -1, 2, 100), 100);
});

test('seeded random sources are deterministic and remain in [0, 1)', () => {
  const a = seededRandom(123), b = seededRandom(123);
  for (let i = 0; i < 100; i++) {
    const n = a();
    assert.equal(n, b());
    assert.ok(n >= 0 && n < 1);
  }
});

test('the original Unity heightmap uses column-major samples and mirrored X coordinates', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/assets/scene.json', import.meta.url)));
  const binary = readFileSync(new URL('../public/assets/scene.bin', import.meta.url));
  const t = manifest.terrain;
  const samples = new Uint16Array(binary.buffer, binary.byteOffset + t.samples.offset, t.samples.count);
  const scale = manifest.worldScale;
  const spawn = manifest.spawn;
  const ground = terrainHeightAt(t, samples, scale, spawn[0] * scale, spawn[2] * scale);
  assert.ok(Math.abs(ground - spawn[1] * scale) < 0.5, 'spawn must be on the original valley floor, not the transposed mountain');
  assert.ok(ground > 0 && ground < 0.5);
});

test('collectible selection is unique, seeded and includes a nearby introductory pickup', () => {
  const spawns = Array.from({ length: 25 }, (_, i) => [i + 1, 0, i]);
  const chosen = selectSpawns(spawns, { x: 0, z: 0 }, 10, seededRandom(7));
  assert.equal(chosen.length, 10);
  assert.equal(new Set(chosen.map((p) => `${p.x},${p.z}`)).size, 10);
  assert.equal(chosen[0].x, 1);
  assert.deepEqual(chosen, selectSpawns(spawns, { x: 0, z: 0 }, 10, seededRandom(7)));
  assert.throws(() => selectSpawns([], { x: 0, z: 0 }, 10));
});

test('collection cannot be duplicated or performed from the menu or pause screen', () => {
  const game = new GameSession(2);
  assert.equal(game.collect(0), false);
  game.reset();
  assert.equal(game.collect(0), true);
  assert.equal(game.collect(0), false);
  game.pause();
  assert.equal(game.collect(1), false);
  game.resume();
  assert.equal(game.collect(1), true);
  assert.equal(game.state, 'won');
  assert.equal(game.collect(2), false);
});

test('pausing freezes elapsed time, stamina and loss; reset starts a fresh run', () => {
  const game = new GameSession();
  game.reset();
  game.tick(0.1, true, true);
  game.pause();
  const before = [game.elapsed, game.stamina];
  game.tick(10, true, true);
  game.catchPlayer();
  assert.deepEqual([game.elapsed, game.stamina], before);
  assert.equal(game.state, 'paused');
  game.resume(); game.catchPlayer();
  assert.equal(game.state, 'lost');
  game.reset();
  assert.deepEqual([game.elapsed, game.stamina, game.collected.size, game.state], [0, 1, 0, 'playing']);
});

test('sprinting exhausts stamina, cannot jitter at zero and recovers when resting', () => {
  const game = new GameSession(); game.reset();
  for (let i = 0; i < 72; i++) game.tick(0.1, true, true);
  assert.equal(game.exhausted, true);
  assert.equal(game.tick(0.1, true, true), false);
  for (let i = 0; i < 29; i++) game.tick(0.1, false, false);
  assert.equal(game.exhausted, false);
  assert.equal(game.tick(0.1, true, true), true);
  const before = game.stamina;
  game.tick(0.1, true, false);
  assert.ok(game.stamina > before, 'holding sprint while stationary must not drain stamina');
});

test('formatting, distance and simulation delta are bounded', () => {
  assert.equal(formatTime(125.9), '02:05');
  assert.equal(formatTime(-5), '00:00');
  assert.equal(distance2D({ x: 0, z: 0 }, { x: 3, z: 4 }), 5);
  assert.equal(clamp(-9, 0, 1), 0);
  const game = new GameSession(); game.reset(); game.tick(100, false, false);
  assert.equal(game.elapsed, 0.1);
});

test('all original asset references and packed buffer ranges are valid', () => {
  const root = new URL('../public/assets/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('scene.json', root)));
  const binary = readFileSync(new URL('scene.bin', root));
  assert.equal(manifest.map, 'Slendytubbies (Classic)');
  assert.equal(manifest.warnings.length, 0);
  assert.ok(Object.keys(manifest.meshes).length >= 50);
  assert.ok(manifest.collectibleSpawns.length >= 10);
  const sizes = { f: 4, I: 4, H: 2 };
  for (const mesh of Object.values(manifest.meshes)) {
    for (const descriptor of [mesh.position, mesh.normal, mesh.uv, mesh.indices].filter(Boolean)) {
      assert.equal(descriptor.offset % 4, 0);
      assert.ok(descriptor.offset + descriptor.count * sizes[descriptor.type] <= binary.length);
    }
    assert.equal(mesh.groups.reduce((sum, group) => sum + group.count, 0), mesh.indices.count);
    const indices = new Uint32Array(binary.buffer, binary.byteOffset + mesh.indices.offset, mesh.indices.count);
    assert.ok(indices.every((index) => index < mesh.position.count / 3), `out-of-range index in ${mesh.name}`);
  }
  for (const spec of Object.values(manifest.textures)) assert.ok(existsSync(new URL(spec.url, root)));
  for (const material of Object.values(manifest.materials)) {
    if (material.texture) assert.ok(manifest.textures[material.texture]);
  }
});
