import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalProfile, rollCase, CATALOG } from '../src/catalog.js';
import { Room } from '../server/room.js';
import { getMode } from '../src/modes.js';
import { HUNT_HEALTH } from '../src/round-rules.js';
import { monsterSpeed } from '../src/monsters.js';

const data = { worldScale: 1, spawn: [0, 0, 0], collectibleSpawns: Array.from({ length: 25 }, (_, i) => [20 + i * 3, 0, 15]) };
const flat = { groundAt: () => 0, canMove: () => true, isPickupPositionFree: () => true };
function fixture(mode = 'classic', third = false) {
  const room = new Room('ABC234', data, flat, () => 1000);
  room.addPlayer('a', 'Alice', 'secret-a', false); room.addPlayer('b', 'Bob', 'secret-b', false);
  if (third) room.addPlayer('c', 'Carol', 'secret-c', false);
  room.start('a', mode); return room;
}

test('case odds have an exact 1% legendary interval and do not use a misleading pity guarantee', () => {
  assert.equal(rollCase(() => 0).legendary, true); assert.equal(rollCase(() => 0.0099999).legendary, true);
  assert.equal(rollCase(() => 0.01).legendary, false); assert.equal(rollCase(() => 0.999999).legendary, false);
  let legendary = 0; for (let i = 0; i < 10000; i++) if (rollCase(() => (i + 0.5) / 10000).legendary) legendary++;
  assert.equal(legendary, 100); assert.throws(() => rollCase(() => 1));
});

test('cases spend only local coins, persist their drop, refund duplicates and cannot overdraw', () => {
  const p = new LocalProfile(); assert.throws(() => p.choose('skin', 'hare'), /кейса/);
  assert.equal(p.openCase(() => 0).id, 'hare'); assert.equal(p.coins, 20); p.choose('skin', 'hare');
  assert.throws(() => p.openCase(() => 0), /монет/); assert.equal(p.coins, 20);
  p.reward('one', 50); p.reward('two', 50);
  const duplicate = p.openCase(() => 0); assert.equal(duplicate.duplicate, true); assert.equal(p.coins, 70);
  assert.equal(p.appearance.skin, 'hare');
  assert.ok(CATALOG.antenna.some((item) => item.id === 'none' && item.price === 0));
  assert.ok(CATALOG.skin.some((item) => item.price === 1000));
  assert.ok(CATALOG.hat.some((item) => item.price >= 100 && item.price <= 1000));
});

test('hide and killer are actual player-versus-player modes: role rotation, grace, authority and cooldown', () => {
  for (const mode of ['hide', 'killer']) {
    const r = fixture(mode, true), a = r.players.get('a'), b = r.players.get('b');
    assert.equal(a.role, 'killer'); assert.equal(b.role, 'survivor');
    assert.equal(r.attack('a'), false); assert.equal(r.attack('b'), false);
    const before = { ...a.position }; r.setInput('a', { seq: 1, x: 1, y: 0 }); r.tick(0.1); assert.deepEqual(a.position, before);
    assert.equal(r.enemy.active, false); assert.equal(r.collect('a', 0), false);
    r.elapsed = r.mode.hideTime + 0.1;
    assert.equal(r.attack('a'), true); assert.equal(b.alive, false); assert.equal(r.attack('a'), false);
    r.elapsed += 1; assert.equal(r.attack('a'), true); assert.equal(r.state, 'lost'); assert.equal(r.winner, 'killer');
    r.start('a', mode); assert.equal(r.players.get('b').role, 'killer');
    assert.equal(r.snapshot().killerId, 'b');
  }
});

test('hiders win by surviving the timer; killer mode survivors win by collecting; missing killer ends round', () => {
  const hide = fixture('hide'); hide.elapsed = 150; hide.tick(0.05); assert.equal(hide.state, 'won');
  const killer = fixture('killer');
  for (const pickup of killer.pickups) { killer.players.get('b').position = { ...pickup }; assert.equal(killer.collect('b', pickup.id), true); }
  assert.equal(killer.state, 'won');
  const missing = fixture('killer'); missing.remove('a'); missing.tick(0.05); assert.equal(missing.state, 'won');
  const timeout = fixture('killer'); timeout.elapsed = 180; timeout.tick(0.05); assert.equal(timeout.state, 'won');
});

test('PvP attacks validate range and line of sight rather than trusting a target supplied by the client', () => {
  const r = fixture('killer'); r.elapsed = 11; r.players.get('b').position.x = 50; assert.equal(r.attack('a'), false);
  r.players.get('b').position.x = 0.8; r.physics = { ...flat, canMove: () => false }; assert.equal(r.attack('a'), false);
});

test('reverse hunt flees from hunters, needs ten server-validated tags and has a timeout', () => {
  const r = fixture('hunt'); r.enemy = { x: 3, y: 0, z: 0, health: HUNT_HEALTH, active: true, yaw: 0 };
  r.players.get('b').position = { x: 20, y: 0, z: 20 }; r.tick(0.1); assert.ok(r.enemy.x > 3);
  for (let i = 0; i < HUNT_HEALTH; i++) { r.players.get('a').position = { ...r.enemy, x: r.enemy.x - 1 }; r.elapsed += 1; assert.equal(r.attack('a'), true); }
  assert.equal(r.state, 'won'); assert.equal(r.enemy.health, 0);
  const timeout = fixture('hunt'); timeout.elapsed = 180; timeout.tick(0.1); assert.equal(timeout.state, 'lost');
});

test('legendary rabbit transforms for ten seconds, makes six decoys, attracts AI and respects server cooldown', () => {
  const r = fixture(); r.elapsed = 16;
  assert.throws(() => r.activateAbility('a'), /легендарном/);
  r.setAppearance('a', { skin: 'hare' }); r.activateAbility('a');
  assert.equal(r.decoys.length, 6); assert.equal(r.snapshot().players[0].rabbit, true);
  assert.throws(() => r.activateAbility('a'), /перезаряжается/);
  r.enemy = { x: 0.5, y: 0, z: 0, active: true, health: 10, yaw: 0 }; r.tick(0.1);
  assert.equal(r.players.get('a').alive, true, 'AI chooses rabbits even with a nearby real player');
  r.elapsed = 26; r.tick(0.01); assert.equal(r.decoys.length, 0); assert.equal(r.snapshot().players[0].rabbit, false);
  r.elapsed = 62; r.players.get('a').alive = true; r.activateAbility('a'); assert.equal(r.decoys.length, 6);
  const pvp = fixture('killer'); pvp.setAppearance('a', { skin: 'hare' }); assert.throws(() => pvp.activateAbility('a'), /живому/);
});

test('tiny mode changes authoritative movement radius and scale; additional monsters have distinct traits', () => {
  const mode = getMode('tiny'); assert.ok(mode.radius < 0.28 && mode.playerScale < 1 && mode.enemyScale > 1);
  const r = fixture('tiny'); const radii = []; r.physics = { ...flat, canMove: (from, x, z, radius) => { radii.push(radius); return true; } };
  r.setInput('a', { seq: 1, x: 1, y: 0 }); r.tick(0.1); assert.ok(radii.includes(0.16));
  assert.ok(monsterSpeed('chainsaw', 4, 5, true) > monsterSpeed('chainsaw', 4, 20, true));
  assert.ok(monsterSpeed('newborn', 4, 10, true) > 1);
});
