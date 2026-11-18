import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { CATALOG, LocalProfile, rollCase } from '../src/catalog.js';
import { createLocationPhysics } from '../src/locations.js';
import { BAT_COOLDOWN, BAT_RANGE, BAT_RELEASE, BAT_STUN_DURATION, makeBatShot, stepBat } from '../src/sahur-ability.js';

const at = (x, z, y = 0) => ({ x, y, z });
const flat = { groundAt: () => 0, canMove: () => true, traceProjectile: () => Infinity };
const data = { worldScale: 1, spawn: [0, 0, 0], collectibleSpawns: Array.from({ length: 20 }, (_, i) => [20 + i * 2, 0, 10]) };
function room(mode = 'killer') {
  const r = new Room('WAT234', data, flat, () => 1000);
  r.addPlayer('a', 'Alice', 'a', false); r.addPlayer('b', 'Bob', 'b', false, { skin: 'sahur' }); r.addPlayer('c', 'Carol', 'c', false);
  r.start('a', mode);
  r.elapsed = (r.mode.pvp ? r.mode.hideTime : r.mode.grace) + 1;
  return r;
}
const advance = (r, ticks = 16) => { for (let i = 0; i < ticks; i++) r.tick(0.05); };

test('wardrobe code grants every skin and variant persistently without awarding coins or changing cosmetics', () => {
  let saved;
  const store = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const p = new LocalProfile(store);
  p.choose('hat', 'cap'); p.choose('skin', 'green');
  const balance = p.coins, look = { ...p.appearance }, prior = saved;
  assert.throws(() => p.redeemSkinCode('SAHUR_778')); assert.equal(saved, prior);
  assert.ok(!p.owned.has('skin:sahur-buff'));
  const accessories = [...p.owned].filter((id) => !id.startsWith('skin:'));
  assert.ok(p.redeemSkinCode(' sahur_777 ') > 0);
  const restored = new LocalProfile(store);
  assert.deepEqual(restored.appearance, look);
  assert.deepEqual([...restored.owned].filter((id) => !id.startsWith('skin:')).sort(), accessories.sort());
  assert.equal(restored.redeemSkinCode('SAHUR_777'), 0);
  for (const skin of CATALOG.skin) restored.choose('skin', skin.id);
  assert.equal(restored.coins, balance);
});

test('each legendary has 0.5%, both together 1%; Sahur persists and a repeat refunds 50', () => {
  const counts = {};
  for (let i = 0; i < 10000; i++) {
    const { legendary, id } = rollCase(() => (i + 0.5) / 10000);
    if (legendary) counts[id] = (counts[id] || 0) + 1;
  }
  assert.deepEqual(counts, { hare: 50, sahur: 50 });
  assert.equal(rollCase(() => 0.005).id, 'sahur');
  assert.equal(rollCase(() => 0.01).legendary, false);
  let saved;
  const store = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const profile = new LocalProfile(store);
  assert.throws(() => profile.choose('skin', 'sahur'), /0,5%/);
  assert.equal(profile.openCase(() => 0.007).id, 'sahur'); assert.equal(profile.coins, 20);
  profile.choose('skin', 'sahur');
  const restored = new LocalProfile(store); assert.equal(restored.appearance.skin, 'sahur');
  restored.reward('one', 50); restored.reward('two', 50);
  assert.equal(restored.openCase(() => 0.007).refund, 50); assert.equal(restored.coins, 70);
});

test('the projectile checks height, earliest hostile hit, range and real station geometry', () => {
  const enemy = (x, z, y = 0) => ({ position: at(x,z,y), radius: 0.32, height: 1.8 });
  const aim = (position = at(0,0), pitch = 0) => makeBatShot('id', 'b', position, 0, pitch, 1);
  const close = enemy(0,-1), farther = enemy(0,-2.2), high = enemy(0,-0.8,3);
  assert.equal(stepBat(aim(), 0.1, flat, [farther, close, high]).target, close);
  assert.equal(stepBat(aim(), 0.1, flat, [high]), null);
  const long = aim(); let miss;
  for (let i = 0; i < 10 && !miss; i++) miss = stepBat(long, 0.1, flat, [enemy(0,-18)]);
  assert.equal(long.distance, BAT_RANGE); assert.deepEqual(miss, { target: null, blocked: false });
  const station = createLocationPhysics('station');
  const wall = stepBat(aim(at(0,15)), 0.2, station, [enemy(0,11.9)]);
  assert.deepEqual(wall, { target: null, blocked: true });
  assert.deepEqual(stepBat(aim(at(0,-30), -1.1), 0.1, station, []), { target: null, blocked: true });
});

test('PvP throws need windup, respect grace and cooldown, skip allies and stun a killer exactly ten seconds', () => {
  const r = room(), a = r.players.get('a'), b = r.players.get('b'), c = r.players.get('c');
  r.elapsed = 1;
  assert.throws(() => r.activateAbility('b'), /форы/);
  r.elapsed = 11;
  a.position = at(0,-5); b.position = at(0,0); c.position = at(0,-1.4);
  assert.throws(() => r.activateAbility('c'), /легендарном/);
  const start = r.elapsed;
  r.activateAbility('b');
  assert.equal(b.releaseAt, start + BAT_RELEASE); assert.equal(b.abilityNext, start + BAT_COOLDOWN);
  assert.equal(r.bats.length, 0); advance(r, 4); assert.equal(r.bats.length, 0);
  r.setInput('b', { seq: 1, yaw: 0, pitch: 0 }); // Aim sampled at the release, not from a client hit claim.
  for (let i = 0; i < 20 && !a.stunnedUntil; i++) r.tick(0.05);
  assert.equal(a.stunnedUntil, r.elapsed + BAT_STUN_DURATION); assert.equal(c.stunnedUntil, 0);
  assert.ok(r.events.some((e) => e.type === 'bat-impact' && e.target === 'a'));
  assert.throws(() => r.activateAbility('b'), /перезаряжается/);
  r.setAppearance('a', { skin: 'sahur' });
  assert.throws(() => r.activateAbility('a'), /оглушён/);
  c.position = at(0,-5.7);
  assert.equal(r.attack('a'), false);
  const frozen = { ...a.position };
  r.setInput('a', { seq: 1, x: 1, sprint: true });
  r.elapsed = a.stunnedUntil - 0.06; r.tick(0.05); assert.deepEqual(a.position, frozen);
  r.elapsed = a.stunnedUntil; r.tick(0.05); assert.notDeepEqual(a.position, frozen);
  assert.ok(r.attack('a'));
  r.state = 'won'; r.start('a', 'killer');
  assert.equal(a.stunnedUntil, 0); assert.equal(b.throwAt, null); assert.equal(r.snapshot().bats.length, 0);
});

test('co-op bats do not affect teammates; a stunned AI cannot move or catch', () => {
  const r = room('hunt'), a = r.players.get('a'), b = r.players.get('b');
  const c = r.players.get('c'); a.position = at(0,-1); b.position = at(0,0); c.position = at(0,5);
  r.enemy.x = 0; r.enemy.z = -2; r.enemy.y = 0;
  r.setInput('b', { seq: 1, yaw: 0, pitch: 0 }); r.activateAbility('b');
  for (let i = 0; i < 20 && !r.enemy.stunnedUntil; i++) r.tick(0.05);
  const until = r.enemy.stunnedUntil;
  assert.equal(until, r.elapsed + BAT_STUN_DURATION); assert.equal(a.stunnedUntil, 0);
  const frozen = { ...r.enemy };
  r.elapsed = until - 0.1; r.tick(0.05); assert.deepEqual(r.enemy, frozen);
  r.elapsed = until; r.tick(0.05); assert.notEqual(r.enemy.z, frozen.z);

  const classic = room('classic');
  classic.enemy = { ...classic.enemy, ...classic.players.get('a').position, stunnedUntil: classic.elapsed + BAT_STUN_DURATION };
  classic.tick(0.05); assert.ok([...classic.players.values()].every((p) => p.alive));
  classic.elapsed = classic.enemy.stunnedUntil; classic.tick(0.05); assert.ok([...classic.players.values()].some((p) => !p.alive));
});

test('only the first opposing player is stunned; an invalidated windup cannot launch', () => {
  const r = room('hide'), [a,b,c] = [...r.players.values()];
  a.position = at(0,0); b.position = at(0,-3); c.position = at(0,-6);
  r.setAppearance('a', { skin: 'sahur' }); r.setInput('a', { seq: 1, yaw: 0 }); r.activateAbility('a'); advance(r);
  assert.ok(b.stunnedUntil > r.elapsed); assert.equal(c.stunnedUntil, 0);
  r.state = 'won'; r.start('a', 'hide'); r.elapsed = 25;
  r.activateAbility('a'); r.disconnect('a'); advance(r);
  assert.equal(r.snapshot().bats.length, 0);
  assert.equal(a.releaseAt, null);
  assert.equal(a.throwAt, null);
});

test('challenge skin requires a completed solo-hardcore win as the owned base skin, and both remain selectable', () => {
  let saved;
  const store = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  const profile = new LocalProfile(store);
  const win = { multiplayer: false, mode: 'hardcore', roundSkin: 'sahur', won: true, collected: 10 };
  assert.throws(() => profile.choose('skin', 'sahur-buff'), /Испытание/);
  assert.equal(profile.finishSahurChallenge(win), false);
  profile.openCase(() => 0.006); profile.choose('skin', 'sahur');
  for (const diff of [{ multiplayer: true }, { mode: 'classic' }, { won: false }, { collected: 9 }, { roundSkin: 'hare' }, { roundSkin: null }]) {
    assert.equal(profile.finishSahurChallenge({ ...win, ...diff }), false);
  }
  assert.equal(profile.finishSahurChallenge(win), true); assert.equal(profile.finishSahurChallenge(win), false);
  assert.equal(profile.appearance.skin, 'sahur');
  const again = new LocalProfile(store); const balance = again.coins;
  again.choose('skin', 'sahur-buff'); assert.equal(new LocalProfile(store).appearance.skin, 'sahur-buff');
  again.choose('skin', 'sahur'); assert.equal(again.coins, balance);
});
