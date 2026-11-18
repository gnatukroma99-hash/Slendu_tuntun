import test from 'node:test';
import assert from 'node:assert/strict';
import { getMode, MODES } from '../src/modes.js';
import { GameSession } from '../src/core.js';
import { Room } from '../server/room.js';

const data = { worldScale: 1, spawn: [0, 0, 0], collectibleSpawns: Array.from({ length: 20 }, (_, i) => [20 + i * 2, 0, 15]) };
const physics = { groundAt: () => 0, canMove: () => true };
function room() {
  const r = new Room('ABC234', data, physics, () => 1000);
  r.addPlayer('host', 'Host', 'one', false); r.addPlayer('guest', 'Guest', 'two', false);
  return r;
}

test('mode lookup rejects untrusted keys and tuning objects', () => {
  for (const value of ['__proto__', 'constructor', 'oops', null, {}, { speed: 999 }]) assert.equal(getMode(value).id, 'classic');
  assert.equal(Object.keys(MODES).length, 8);
});

test('hardcore drains stamina faster and recovers more slowly', () => {
  const normal = new GameSession(), hard = new GameSession(10, 'hardcore');
  normal.reset(); hard.reset();
  normal.tick(0.1, true, true); hard.tick(0.1, true, true);
  assert.ok(hard.stamina < normal.stamina);
  normal.stamina = hard.stamina = 0.5;
  normal.tick(0.1, false, false); hard.tick(0.1, false, false);
  assert.ok(hard.stamina < normal.stamina);
});

test('only host chooses a mode, mode is shared and cannot change during a round', () => {
  const r = room();
  assert.throws(() => r.setMode('guest', 'pig'), /хозяин/);
  r.setMode('host', 'pig'); assert.equal(r.snapshot().mode, 'pig');
  r.start('host');
  assert.ok([...r.players.values()].every((p) => p.session.mode.id === 'pig'));
  assert.throws(() => r.setMode('host', 'classic'), /во время/);
  assert.throws(() => r.start('guest', 'hardcore'), /хозяин/);
  assert.equal(r.mode.id, 'pig');
});

test('hardcore enemy activates earlier and moves faster on the server', () => {
  const normal = room(), hard = room();
  normal.start('host'); hard.start('host', 'hardcore');
  normal.elapsed = hard.elapsed = 5;
  normal.tick(0.1); hard.tick(0.1);
  assert.equal(normal.enemy.active, false); assert.equal(hard.enemy.active, true);
  normal.elapsed = hard.elapsed = 20;
  normal.enemy = { x: 20, y: 0, z: 0 }; hard.enemy = { x: 20, y: 0, z: 0 };
  normal.tick(0.1); hard.tick(0.1);
  assert.ok(hard.enemy.x < normal.enemy.x);
});

test('pig movement bonus is authoritative and mode resets safely on invalid input', () => {
  const normal = room(), pig = room();
  normal.start('host'); pig.start('host', 'pig');
  for (const r of [normal, pig]) { r.setInput('host', { seq: 1, x: 1, y: 0, yaw: 0 }); r.tick(0.1); }
  assert.ok(Math.abs(pig.players.get('host').position.x / normal.players.get('host').position.x - 1.12) < 1e-6);
  pig.state = 'won'; pig.start('host', '__proto__'); assert.equal(pig.mode.id, 'classic');
});
