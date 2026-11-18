import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, RECONNECT_GRACE_MS } from '../server/room.js';
import { normalizeInput, moveActor, RUN_SPEED } from '../src/physics.js';

const flat = { groundAt: () => 0, canMove: () => true };
const data = { worldScale: 1, spawn: [0, 0, 0], collectibleSpawns: [[0, 0, 0.8], ...Array.from({ length: 24 }, (_, i) => [(i % 6) * 7 + 7, 0, Math.floor(i / 6) * 7 + 7])] };
function fixture() {
  let now = 1000;
  const room = new Room('ABC234', data, flat, () => now);
  room.addPlayer('alice', 'Алиса', 'secret-alice', true);
  room.addPlayer('bob', 'Боб', 'secret-bob', false);
  return { room, advance: (ms) => { now += ms; } };
}

test('rooms have four seats, only the host may start, and two connected players are required', () => {
  const { room } = fixture();
  assert.throws(() => room.start('bob'), /хозяин/);
  room.addPlayer('c', 'С', 'secret-c'); room.addPlayer('d', 'Д', 'secret-d');
  assert.throws(() => room.addPlayer('e', 'Е', 'secret-e'), /заполнена/);
  room.start('alice');
  assert.equal(room.pickups.length, 10);
  assert.equal(room.state, 'playing');
  assert.throws(() => room.addPlayer('new', 'Новый', 'new'), /уже начался/);
  const lonely = new Room('LONELY', data, flat); lonely.addPlayer('a', 'A', 'a');
  assert.throws(() => lonely.start('a'), /2 подключённых/);
});

test('automatic pickup works while sprinting and does not clear held movement or sprint', () => {
  const { room } = fixture(); room.start('alice');
  room.setInput('alice', { seq: 1, x: 0, y: -1, yaw: Math.PI, sprint: true, autoPickup: true });
  room.tick(0.05);
  const alice = room.players.get('alice');
  assert.ok(alice.position.z > 0.25);
  assert.equal(room.collected.size, 1);
  assert.equal(alice.input.sprint, true);
  assert.equal(alice.input.y, -1);
  assert.ok(alice.session.stamina < 1);
});

test('a shared pickup is awarded exactly once when two players collect simultaneously', () => {
  const { room } = fixture(); room.start('alice');
  room.players.get('alice').position = { ...room.pickups[0] };
  room.players.get('bob').position = { ...room.pickups[0] };
  assert.equal(room.collect('alice', 0), true);
  assert.equal(room.collect('bob', 0), false);
  assert.equal(room.collected.size, 1);
  assert.equal(room.events.length, 1);
  assert.equal(room.events[0].by, 'alice');
});

test('server validates pickup range, identifiers, alive status and game state', () => {
  const { room } = fixture();
  assert.equal(room.collect('alice', 0), false);
  room.start('alice');
  for (const id of [-1, 999, NaN, Infinity, '0', null]) assert.equal(room.collect('alice', id), false);
  room.players.get('alice').position = { x: 1000, y: 0, z: 1000 };
  assert.equal(room.collect('alice', 0), false);
  room.players.get('alice').position = { ...room.pickups[0] };
  room.players.get('alice').alive = false;
  assert.equal(room.collect('alice', 0), false);
});

test('all players share victory and a host restart resets the entire room', () => {
  const { room } = fixture(); room.start('alice');
  for (const pickup of room.pickups) {
    room.players.get('alice').position = { ...pickup };
    assert.equal(room.collect('alice', pickup.id), true);
  }
  assert.equal(room.state, 'won');
  assert.equal(room.snapshot().collected.length, 10);
  assert.throws(() => room.start('bob'), /хозяин/);
  room.start('alice');
  assert.equal(room.round, 2);
  assert.equal(room.state, 'playing');
  assert.equal(room.collected.size, 0);
  assert.ok([...room.players.values()].every((p) => p.alive && p.session.stamina === 1));
});

test('one caught player is eliminated but the team loses only when everybody is caught', () => {
  const { room } = fixture(); room.start('alice'); room.elapsed = 16;
  room.players.get('bob').position = { x: 10, y: 0, z: 10 };
  room.enemy = { ...room.players.get('alice').position, active: true, yaw: 0 };
  room.tick(0.05);
  assert.equal(room.players.get('alice').alive, false);
  assert.equal(room.state, 'playing');
  room.enemy = { ...room.players.get('bob').position, active: true, yaw: 0 };
  room.tick(0.05);
  assert.equal(room.state, 'lost');
});

test('disconnect hands off host authority, resume preserves identity, expired slots are removed', () => {
  const { room, advance } = fixture(); room.start('alice');
  room.disconnect('alice');
  assert.equal(room.hostId, 'bob');
  assert.equal(room.resume('secret-alice').id, 'alice');
  assert.equal(room.players.get('alice').connected, true);
  assert.throws(() => room.resume('bad-token'));
  room.disconnect('alice'); advance(RECONNECT_GRACE_MS + 1); room.tick(0.05);
  assert.equal(room.players.has('alice'), false);
  assert.throws(() => room.resume('secret-alice'));
});

test('stale input stops movement and sequence numbers prevent replay', () => {
  const { room, advance } = fixture(); room.start('alice');
  room.setInput('alice', { seq: 5, x: 1, y: 0, yaw: 0, autoPickup: false });
  room.setInput('alice', { seq: 4, x: -1, y: 0 });
  room.tick(0.05);
  const x = room.players.get('alice').position.x;
  assert.ok(x > 0);
  advance(301); room.tick(0.05);
  assert.equal(room.players.get('alice').position.x, x);
});

test('snapshots never reveal resume credentials and rooms have independent counters', () => {
  const a = fixture().room, b = fixture().room;
  a.start('alice'); b.start('alice');
  a.players.get('alice').position = { ...a.pickups[0] }; a.collect('alice', 0);
  assert.equal(a.collected.size, 1); assert.equal(b.collected.size, 0);
  assert.ok(!JSON.stringify(a.snapshot()).includes('secret-'));
});

test('movement normalization rejects non-finite input and diagonal running has bounded speed', () => {
  assert.deepEqual(normalizeInput({ x: NaN, y: Infinity, sprint: 'yes' }), { x: 0, y: 0, moving: false, sprint: false });
  const input = normalizeInput({ x: 100, y: -100, sprint: true });
  const position = { x: 0, y: 0, z: 0 };
  const moved = moveActor(flat, position, input, Math.PI, RUN_SPEED, 0.05);
  assert.ok(Math.abs(moved - RUN_SPEED * 0.05) < 0.00001);
});
