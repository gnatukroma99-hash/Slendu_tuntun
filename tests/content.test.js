import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalProfile, normalizeAppearance } from '../src/catalog.js';
import { createLocationPhysics, getLocation } from '../src/locations.js';
import { monsterSpeed, getMonster } from '../src/monsters.js';
import { Room } from '../server/room.js';

const data = { worldScale: 1, spawn: [0, 0, 0], collectibleSpawns: Array.from({ length: 20 }, (_, i) => [20 + i, 0, 15]) };
const flat = { groundAt: () => 0, canMove: () => true };
function fixture() {
  let time = 1000;
  const room = new Room('ABC234', data, flat, () => time);
  room.addPlayer('host', 'Host', 'secret-host'); room.addPlayer('guest', 'Guest', 'secret-guest');
  return { room, advance: () => { time += 1001; } };
}

test('shop purchases once, equips owned items for free and prevents negative balances', () => {
  const p = new LocalProfile(); assert.equal(p.coins, 120);
  p.choose('skin', 'green'); p.choose('hat', 'cap'); p.choose('antenna', 'straight');
  assert.equal(p.coins, 30); p.choose('hat', 'cap'); assert.equal(p.coins, 30);
  assert.throws(() => p.choose('hat', 'top'), /Не хватает/); assert.equal(p.coins, 30);
  assert.throws(() => p.choose('__proto__', 'oops'), /Неизвестный/);
});

test('local appearance, coins and reward receipts survive reload; duplicate rewards are ignored', () => {
  const values = new Map(), storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  const p = new LocalProfile(storage); p.choose('skin', 'red');
  assert.equal(p.reward('match:pickup:1', 5), true); assert.equal(p.reward('match:pickup:1', 5), false);
  assert.equal(p.reward('bad', -50), false);
  const restored = new LocalProfile(storage); assert.equal(restored.coins, 95); assert.equal(restored.appearance.skin, 'red');
  assert.equal(restored.reward('match:pickup:1', 5), false);
  assert.doesNotThrow(() => new LocalProfile({ getItem: () => '{"owned":12,"coins":-4}' }));
  assert.doesNotThrow(() => new LocalProfile({ getItem: () => { throw new Error('blocked'); } }));
});

test('cosmetic identifiers are whitelisted on both client and server', () => {
  assert.deepEqual(normalizeAppearance({ skin: '<script>', antenna: {}, hat: '__proto__' }), { skin: 'purple', antenna: 'ring', hat: 'none' });
  const { room } = fixture(); room.setAppearance('host', { skin: 'green', hat: 'crown', antenna: 'straight' });
  assert.equal(room.snapshot().players[0].appearance.hat, 'crown');
  assert.equal(JSON.stringify(room.snapshot()).includes('secret-host'), false);
});

for (const id of ['lake', 'outskirts', 'station']) {
  test(`${id}: every pickup is walkable and reachable from spawn, with segment collision and boundaries`, () => {
    const p = createLocationPhysics(id), { spawn, spawns } = p.layout;
    assert.ok(spawns.length >= 10); assert.equal(p.layout.blocked(spawn.x, spawn.z), false);
    assert.equal(p.canMove(spawn, 100, 100), false);
    for (const [x, , z] of spawns) assert.equal(p.layout.blocked(x, z, 0.3), false);
    const seen = new Set([`${spawn.x},${spawn.z}`]), queue = [spawn];
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = from.x + dx, z = from.z + dz, key = `${x},${z}`;
        if (seen.has(key) || !p.canMove(from, x, z)) continue;
        seen.add(key); queue.push({ x, y: 0, z });
      }
    }
    for (const [x, , z] of spawns.slice(1)) assert.ok(seen.has(`${x},${z}`), `Unreachable pickup ${x},${z}`);
  });
}

test('station walls cannot be skipped by a large step', () => {
  assert.equal(createLocationPhysics('station').canMove({ x: -25, y: 0, z: 0 }, -15, 0), false);
});

test('host-selected location and monster apply to all players; cannot change during play', () => {
  const { room } = fixture(); assert.throws(() => room.setWorld('guest', { location: 'lake' }), /хозяин/);
  room.setWorld('host', { location: 'station', monster: 'po' }); room.start('host');
  assert.equal(room.snapshot().location, 'station'); assert.equal(room.snapshot().monster, 'po');
  assert.equal(room.physics.groundAt(0, 0), 0); assert.equal(room.pickups.length, 10);
  assert.ok([...room.players.values()].every((p) => p.position.z === -30));
  assert.throws(() => room.setWorld('host', { location: 'forest' }), /во время/);
  room.state = 'won'; room.setWorld('host', { location: 'forest', monster: '__proto__' });
  assert.equal(room.physics, flat); assert.equal(room.monster, 'auto');
  assert.equal(getLocation('__proto__').id, 'forest');
});

test('monster traits are deterministic: Laa-Laa hears movement, Dipsy and Po have distinct acceleration', () => {
  assert.equal(getMonster('auto', 'po').id, 'po');
  assert.equal(monsterSpeed('laalaa', 5, 15, false), 0);
  assert.ok(monsterSpeed('laalaa', 5, 15, true) > 0);
  assert.ok(monsterSpeed('dipsy', 5, 10, true) > monsterSpeed('dipsy', 5, 20, true));
  assert.ok(monsterSpeed('po', 9, 10, true) > monsterSpeed('po', 5, 10, true));
});

test('room chat sanitizes input, enforces rate limit and caps history without affecting other rooms', () => {
  const { room, advance } = fixture(), other = fixture().room;
  const m = room.chat('host', '  <img src=x>\nhello\u0000  ');
  assert.equal(m.name, 'Host'); assert.equal(m.text, 'img src=xhello');
  assert.throws(() => room.chat('host', 'spam'), /секунду/);
  room.chat('guest', 'reply');
  for (let i = 0; i < 30; i++) { advance(); room.chat('host', 'x'.repeat(200)); }
  assert.equal(room.chatHistory.length, 25); assert.equal(room.chatHistory.at(-1).text.length, 160);
  assert.equal(other.chatHistory.length, 0);
  advance(); assert.throws(() => room.chat('host', {}), /недоступно/);
  room.disconnect('host'); assert.throws(() => room.chat('host', 'no'), /недоступно/);
});
