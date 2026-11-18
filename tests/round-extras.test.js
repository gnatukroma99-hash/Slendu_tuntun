import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { photoCast, newRoundStats } from '../src/round-extras.js';

const flat = {groundAt:()=>0, canMove:()=>true, isPickupPositionFree:()=>true};
function room(mode='classic') {
  const r=new Room('TVTEST',{worldScale:1,spawn:[0,0,0],collectibleSpawns:Array.from({length:25},(_,i)=>[i*3,0,23])},flat,()=>1000);
  for(const [id,skin] of [['a','sahur'],['b','sahur-buff'],['c','hare']]) r.addPlayer(id,id,id,false,{skin});
  r.start('a',mode); return r;
}

test('one real rescue: private clue, range, sight, stale round, wrong set and disconnected state are checked',()=>{
  const r=room(), a=r.players.get('a'), b=r.players.get('b'), c=r.players.get('c');
  assert.equal(r.tv.stations.length,3); r.catchPlayer(b);
  const channel=r.signalFor('b'), set=r.tv.stations.find((s)=>s.id===channel), wrong=r.tv.stations.find((s)=>s.id!==channel);
  assert.equal(typeof channel,'number'); assert.equal(r.signalFor('a'),null); assert.ok(!Object.hasOwn(r.snapshot().tv,'channel'));
  const tune=(round=r.round)=>r.rescue('a',channel,round,'b');
  assert.equal(tune(),false); a.position={...wrong}; assert.equal(r.rescue('a',wrong.id,r.round,'b'),false);
  a.position={...set}; assert.equal(tune(r.round+1),false);
  r.physics={...flat,canMove:()=>false}; assert.equal(tune(),false); r.physics=flat;
  r.disconnect('b'); assert.equal(tune(),false); r.resume('b'); assert.equal(r.signalFor('b'),channel);
  b.abilityNext=38; assert.equal(tune(),true); assert.equal(b.alive,true); assert.equal(b.session.state,'playing'); assert.equal(b.abilityNext,38);
  assert.equal(tune(),false); assert.equal(a.stats.rescues,1); assert.equal(a.stats.pickups,0); assert.equal(r.collected.size,0);
  r.catchPlayer(c); assert.equal(r.tv.trapped,null); assert.equal(r.tv.used,true);
  r.state='won'; r.start('a'); assert.equal(r.tv.used,false); assert.equal(r.tv.trapped,null);
  for(const mode of ['hide','killer','hunt']) assert.equal(room(mode).tv,null);
});

test('a departing trapped player releases the channel to a second trapped teammate',()=>{
  const r=room(); r.catchPlayer(r.players.get('b')); r.catchPlayer(r.players.get('c'));
  assert.equal(r.tv.trapped,'b'); r.remove('b'); assert.equal(r.tv.trapped,'c');
});

test('server derives signature from worn skin, throttles repeats, preserves ability/economy and includes spectators in the final photo',()=>{
  const r=room(), a=r.players.get('a'), b=r.players.get('b');
  assert.equal(r.emitEmote('a',r.round+1),false);
  for(const [id,kind] of [['a','taps'],['b','flex'],['c','ears']]) {
    assert.equal(r.emitEmote(id,r.round),true); assert.equal(r.snapshot().players.find((p)=>p.id===id).emote.kind,kind);
    assert.equal(r.emitEmote(id,r.round),false);
  }
  r.elapsed=3; assert.equal(r.snapshot().players[0].emote,null); assert.equal(a.abilityNext,0);
  r.catchPlayer(b); r.elapsed=5; assert.equal(r.emitEmote('b',r.round),false);
  r.remove('b');
  for(const pickup of r.pickups) {a.position={...pickup};assert.equal(r.collect('a',pickup.id),true);}
  const photo=r.snapshot().photo;
  assert.equal(photo.length,3); assert.equal(photo[0].title,'Молочник'); assert.equal(photo[0].stats.pickups,10);
  assert.equal(photo[1].appearance.skin,'sahur-buff'); assert.ok(photo.every((p)=>!('token' in p)));
  r.setAppearance('a',{skin:'pink'}); assert.equal(r.snapshot().photo[0].appearance.skin,'sahur');
  r.start('a'); assert.equal(r.snapshot().photo,null); assert.equal(a.stats.pickups,0);
});

test('photo captions reflect the actual leading numbers rather than attributing another player’s award',()=>{
  const stats=(v)=>({...newRoundStats(),...v});
  const cast=photoCast([{name:'Р',stats:stats({rescues:1})},{name:'М',stats:stats({pickups:7})},{name:'Т',stats:stats({idle:7.3})},{name:'Х',stats:stats({meters:25})}]);
  assert.deepEqual(cast.map((p)=>p.title),['Мастер телеэфира','Молочник','Местная достопримечательность','Лесной марафонец']);
});
