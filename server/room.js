import { GameSession, clamp, distance2D, selectSpawns } from '../src/core.js';
import { getMode } from '../src/modes.js';
import { createLocationPhysics, getLocation } from '../src/locations.js';
import { getMonster, monsterChoice, monsterSpeed } from '../src/monsters.js';
import { normalizeAppearance, skinAbility } from '../src/catalog.js';
import { EMOTE_TIME, EMOTE_COOLDOWN, TV_RANGE, signature, newRoundStats, photoCast, placeTelevisions, recordMovement } from '../src/round-extras.js';
import { preparePickupSpawns } from '../src/spawn-placement.js';
import { HUNT_HEALTH, ATTACK_RANGE, ATTACK_COOLDOWN, BUNNY_DURATION, BUNNY_COOLDOWN, createRabbitDecoys, roleSpeed } from '../src/round-rules.js';
import { AUTO_PICKUP_RADIUS, PICKUP_RADIUS, RUN_SPEED, WALK_SPEED, moveActor, normalizeInput } from '../src/physics.js';
import { BAT_COOLDOWN, BAT_RELEASE, BAT_STUN_DURATION, batMonsterTarget, batPlayerTarget, makeBatShot, stepBat } from '../src/sahur-ability.js';

export const MAX_PLAYERS = 4;
export const RECONNECT_GRACE_MS = 30_000;

export class Room {
  constructor(code, data, physics, now = Date.now) {
    this.code = code;
    this.data = data;
    this.physics = physics;
    this.now = now;
    this.players = new Map();
    this.hostId = null;
    this.state = 'lobby';
    this.mode = getMode();
    this.round = 0;
    this.elapsed = 0;
    this.collected = new Set();
    this.pickups = [];
    this.events = [];
    this.enemy = { x: 0, y: 0, z: 0, yaw: 0, active: false, stunnedUntil: 0 };
    this.createdAt = now();
    const scale = data.worldScale;
    this.spawn = { x: data.spawn[0] * scale, y: 0, z: data.spawn[2] * scale };
    this.spawn.y = physics.groundAt(this.spawn.x, this.spawn.z);
    this.spawns = preparePickupSpawns(data.collectibleSpawns.map((p) => p.map((value) => value * scale)), physics);
    this.baseWorld = { physics, spawn: { ...this.spawn }, spawns: this.spawns };
    this.location = getLocation(); this.monster = 'auto';
    this.chatHistory = []; this.chatSeq = 0;
    this.decoys = []; this.bats = []; this.killerId = null; this.winner = '';
    this.tv = null; this.roster = []; this.photo = null;
  }

  addPlayer(id, name, token, autoPickup = true, appearance = null) {
    if (this.state !== 'lobby') throw new Error('Раунд уже начался. Дождись следующего или создай свою комнату.');
    if (this.players.size >= MAX_PLAYERS) throw new Error('Комната заполнена: максимум 4 игрока.');
    const color = [0, 1, 2, 3].find((color) => ![...this.players.values()].some((p) => p.color === color));
    const player = {
      id, name, token, color, connected: true, disconnectedAt: null,
      alive: true, position: { ...this.spawn }, yaw: Math.PI, pitch: 0,
      flashlight: true, autoPickup, session: new GameSession(),
      input: normalizeInput(), lastInputAt: 0, seq: -1,
      appearance: normalizeAppearance(appearance), lastChatAt: -Infinity,
      role: 'survivor', lastAttack: -Infinity, abilityUntil: 0, abilityNext: 0, stunnedUntil: 0,
      throwAt: null, releaseAt: null,
      stats: newRoundStats(), lastEmoteAt: -Infinity, emote: null, safeUntil: 0, caught: false,
    };
    this.players.set(id, player);
    this.hostId ||= id;
    return player;
  }

  disconnect(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.connected = false;
    player.disconnectedAt = this.now();
    player.input = normalizeInput();
    player.emote = null;
    this.transferHost();
  }

  remove(id) {
    this.players.delete(id);
    if (this.tv?.trapped === id) { this.tv.trapped = null; this.tuneSignal(); }
    this.transferHost();
  }

  transferHost() {
    if (!this.players.get(this.hostId)?.connected) this.hostId = [...this.players.values()].find((p) => p.connected)?.id || this.players.keys().next().value || null;
  }

  resume(token) {
    const player = [...this.players.values()].find((p) => p.token === token);
    if (!player || (player.disconnectedAt !== null && this.now() - player.disconnectedAt > RECONNECT_GRACE_MS)) throw new Error('Время переподключения истекло. Войди в комнату заново.');
    player.connected = true;
    player.disconnectedAt = null;
    player.input = normalizeInput();
    player.lastInputAt = 0;
    this.transferHost();
    this.tuneSignal();
    return player;
  }

  setMode(id, mode) {
    if (id !== this.hostId) throw new Error('Режим выбирает только хозяин комнаты.');
    if (this.state === 'playing') throw new Error('Нельзя менять режим во время раунда.');
    this.mode = getMode(mode);
  }

  setWorld(id, options = {}) {
    if (id !== this.hostId) throw new Error('Карту и монстра выбирает только хозяин комнаты.');
    if (this.state === 'playing') throw new Error('Нельзя менять карту во время раунда.');
    if (!options || typeof options !== 'object') return;
    if (Object.hasOwn(options, 'monster')) this.monster = monsterChoice(options.monster);
    if (!Object.hasOwn(options, 'location')) return;
    this.location = getLocation(options.location);
    if (this.location.id === 'forest') {
      this.physics = this.baseWorld.physics; this.spawn = { ...this.baseWorld.spawn }; this.spawns = this.baseWorld.spawns;
    } else {
      this.physics = createLocationPhysics(this.location.id);
      this.spawn = { ...this.physics.layout.spawn }; this.spawns = preparePickupSpawns(this.physics.layout.spawns, this.physics);
    }
  }

  setAppearance(id, appearance) {
    const player = this.players.get(id);
    if (!player) return;
    player.appearance = normalizeAppearance(appearance);
  }

  chat(id, text) {
    const player = this.players.get(id);
    if (!player?.connected || typeof text !== 'string') throw new Error('Сообщение недоступно.');
    const clean = text.replace(/[\p{C}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!clean) throw new Error('Напиши сообщение.');
    if (this.now() - player.lastChatAt < 1000) throw new Error('Не чаще одного сообщения в секунду.');
    player.lastChatAt = this.now();
    const message = { type: 'chat', id: ++this.chatSeq, by: id, name: player.name, text: clean, time: this.now() };
    this.chatHistory.push(message); if (this.chatHistory.length > 25) this.chatHistory.shift();
    this.events.push(message); return message;
  }

  start(id, mode = this.mode.id, options = {}) {
    if (id !== this.hostId) throw new Error('Начать раунд может только хозяин комнаты.');
    if (this.state === 'playing') throw new Error('Раунд уже идёт.');
    if ([...this.players.values()].filter((p) => p.connected).length < 2) throw new Error('Для кооператива нужны хотя бы 2 подключённых игрока.');
    this.setWorld(id, options);
    this.mode = getMode(mode);
    this.round++;
    this.state = 'playing';
    this.elapsed = 0;
    this.decoys = []; this.bats = []; this.winner = '';
    const connected = [...this.players.values()].filter((p) => p.connected);
    this.roster = connected; this.photo = null;
    this.killerId = this.mode.pvp ? connected[(this.round - 1) % connected.length].id : null;
    this.collected.clear();
    this.events.length = 0;
    this.pickups = selectSpawns(this.spawns, this.spawn, 10).map((p, id) => ({ id, x: p.x, y: this.physics.groundAt(p.x, p.z) + 0.08, z: p.z }));
    this.tv = !this.mode.pvp && !this.mode.hunt ? { stations: placeTelevisions(this.physics, this.spawn, this.pickups), used: false, trapped: null, channel: null } : null;
    const offsets = [[0, 0], [0.8, 0], [-0.8, 0], [0, -0.8]];
    [...this.players.values()].forEach((p, index) => {
      const [dx, dz] = offsets[index];
      p.position = { x: this.spawn.x + dx, y: 0, z: this.spawn.z + dz };
      p.position.y = this.physics.groundAt(p.position.x, p.position.z);
      p.alive = p.connected;
      p.role = p.id === this.killerId ? 'killer' : this.mode.hunt ? 'hunter' : 'survivor';
      p.lastAttack = -Infinity; p.abilityUntil = p.abilityNext = p.stunnedUntil = 0;
      p.throwAt = p.releaseAt = null;
      p.stats = newRoundStats(); p.emote = null; p.lastEmoteAt = -Infinity; p.safeUntil = 0; p.caught = false;
      p.session.mode = this.mode;
      p.session.reset();
      p.input = normalizeInput();
      p.seq = -1;
      p.yaw = Math.PI; p.pitch = 0;
    });
    const far = this.spawns.map(([x, y, z]) => ({ x, y, z })).sort((a, b) => Math.abs(distance2D(a, this.spawn) - 48) - Math.abs(distance2D(b, this.spawn) - 48))[0];
    this.enemy = { ...far, y: this.physics.groundAt(far.x, far.z), yaw: 0, active: false, health: HUNT_HEALTH, stunnedUntil: 0 };
  }

  setInput(id, message) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.state !== 'playing') return;
    if (!Number.isSafeInteger(message.seq) || message.seq <= p.seq || message.seq > 1_000_000_000) return;
    p.seq = message.seq;
    p.input = normalizeInput(message);
    if (Number.isFinite(message.yaw)) p.yaw = Math.atan2(Math.sin(message.yaw), Math.cos(message.yaw));
    if (Number.isFinite(message.pitch)) p.pitch = clamp(message.pitch, -1.35, 1.35);
    if (typeof message.flashlight === 'boolean') p.flashlight = message.flashlight;
    if (typeof message.autoPickup === 'boolean') p.autoPickup = message.autoPickup;
    p.lastInputAt = this.now();
  }

  collect(playerId, pickupId, radius = PICKUP_RADIUS) {
    const player = this.players.get(playerId);
    const pickup = this.pickups[pickupId];
    if (this.mode.hide || this.mode.hunt || player?.role === 'killer') return false;
    if (this.state !== 'playing' || !player?.alive || !player.connected || this.elapsed < player.stunnedUntil || !Number.isInteger(pickupId) || !pickup || this.collected.has(pickupId)) return false;
    if (distance2D(player.position, pickup) >= radius || Math.abs(player.position.y - pickup.y) > 2.5) return false;
    this.collected.add(pickupId);
    player.stats.pickups++;
    this.events.push({ type: 'pickup', id: pickupId, by: playerId, name: player.name, round: this.round, matchId: this.matchId });
    if (this.collected.size === 10) this.state = 'won';
    return true;
  }

  activateAbility(id) {
    const player = this.players.get(id);
    const ability = skinAbility(player?.appearance.skin);
    if (this.state !== 'playing' || !player?.connected || !player.alive || !ability || (ability === 'rabbit' && player.role === 'killer')) throw new Error('Способность доступна живому игроку в подходящем легендарном скине.');
    if (this.elapsed < player.stunnedUntil) throw new Error('Нельзя применить способность, пока ты оглушён.');
    if (ability === 'bat' && this.mode.pvp && this.elapsed < this.mode.hideTime) throw new Error('Бросок доступен после форы.');
    if (this.elapsed < player.abilityNext) throw new Error('Способность перезаряжается.');
    player.emote = null;
    if (ability === 'rabbit') {
      player.abilityUntil = this.elapsed + BUNNY_DURATION; player.abilityNext = this.elapsed + BUNNY_COOLDOWN;
      this.decoys.push(...createRabbitDecoys(this.physics, player.position, id, player.abilityUntil));
    } else {
      player.abilityNext = this.elapsed + BAT_COOLDOWN;
      player.throwAt = this.elapsed; player.releaseAt = this.elapsed + BAT_RELEASE;
    }
    this.events.push({ type: 'ability', ability, by: id, name: player.name, until: player.abilityUntil });
  }

  updateBats(dt) {
    for (const p of this.players.values()) {
      if (p.releaseAt === null) continue;
      if (!p.alive || !p.connected || this.elapsed < p.stunnedUntil) { p.releaseAt = null; p.throwAt = null; continue; }
      if (this.elapsed < p.releaseAt) continue;
      const shot = makeBatShot(`${p.id}:${p.throwAt}`, p.id, p.position, p.yaw, p.pitch, this.mode.playerScale);
      shot.releasedAt = p.releaseAt;
      this.bats.push(shot);
      p.releaseAt = null;
    }
    if (!this.bats.length) return;
    const ai = this.enemy.active ? [batMonsterTarget(this.enemy, this.mode, getMonster(this.monster, this.location.monster).id)] : [];
    this.bats = this.bats.filter((shot) => {
      const owner = this.players.get(shot.owner);
      if (!owner) return false;
      const targets = this.mode.pvp ? [...this.players.values()]
        .filter((p) => p.alive && p.connected && (p.role === 'killer') !== (owner.role === 'killer'))
        .map((p) => batPlayerTarget(p, this.mode, this.elapsed)) : ai;
      const result = stepBat(shot, Math.min(dt, this.elapsed - shot.releasedAt), this.physics, targets);
      if (!result) return true;
      const target = result.target?.player;
      if (result.target) { (target || this.enemy).stunnedUntil = this.elapsed + BAT_STUN_DURATION; owner.stats.stuns++; if (target) target.emote = null; }
      this.events.push({ type: 'bat-impact', by: shot.owner, target: target?.id ?? null, name: target?.name, hit: !!result.target, blocked: result.blocked });
      return false;
    });
  }

  attack(id) {
    const player = this.players.get(id);
    if (this.state !== 'playing' || !player?.connected || !player.alive || this.elapsed < player.stunnedUntil || this.elapsed - player.lastAttack < ATTACK_COOLDOWN) return false;
    let target;
    if (this.mode.pvp && player.role === 'killer' && this.elapsed >= this.mode.hideTime) {
      target = [...this.players.values()].filter((p) => p.alive && p.role !== 'killer').sort((a, b) => distance2D(player.position, a.position) - distance2D(player.position, b.position))[0];
    } else if (this.mode.hunt) target = { position: this.enemy };
    if (!target || distance2D(player.position, target.position) > ATTACK_RANGE || Math.abs(player.position.y - target.position.y) > 2.5 || !this.physics.canMove(player.position, target.position.x, target.position.z, 0.12)) return false;
    player.lastAttack = this.elapsed;
    player.stats.tags++; player.emote = null;
    if (this.mode.hunt) {
      this.enemy.health = Math.max(0, this.enemy.health - 1);
      this.events.push({ type: 'hit', by: id, name: player.name, health: this.enemy.health });
      if (!this.enemy.health) { this.state = 'won'; this.winner = 'hunters'; }
    } else {
      this.catchPlayer(target);
      if (![...this.players.values()].some((p) => p.alive && p.role !== 'killer')) { this.state = 'lost'; this.winner = 'killer'; }
    }
    return true;
  }

  catchPlayer(player) {
    player.alive = false; player.session.catchPlayer(); player.input = normalizeInput();
    player.caught = true; player.emote = null; player.abilityUntil = 0; player.releaseAt = null;
    this.tuneSignal();
    this.events.push({ type: 'caught', id: player.id, name: player.name, round: this.round });
  }

  tuneSignal() {
    if (this.state !== 'playing' || !this.tv?.stations.length || this.tv.used || this.tv.trapped) return;
    if (![...this.players.values()].some((p) => p.alive)) return;
    const target = [...this.players.values()].find((p) => p.caught && !p.alive && p.connected);
    if (!target) return;
    this.tv.trapped = target.id;
    this.tv.channel = this.tv.stations[Math.floor(Math.random() * this.tv.stations.length)].id;
  }

  signalFor(id) {
    if (this.state !== 'playing' || !this.tv?.trapped || this.tv.used) return null;
    const player = this.players.get(id), tv = this.tv.stations.find((s) => s.id === this.tv.channel);
    if (id === this.tv.trapped || (player?.alive && distance2D(player.position, tv) <= 4 && Math.abs(player.position.y - tv.y) < 1.5 && this.physics.canMove(player.position, tv.x, tv.z, .14))) return tv.id;
    return null;
  }

  rescue(id, station, round, trapped) {
    const p = this.players.get(id), tv = this.tv;
    if (this.state !== 'playing' || round !== this.round || !tv || tv.used || !tv.trapped || tv.trapped !== trapped || !p?.alive || !p.connected || this.elapsed < p.stunnedUntil) return false;
    const target = this.players.get(trapped), set = tv.stations.find((s) => s.id === station);
    if (!target?.connected || target.alive || !set || station !== tv.channel || distance2D(p.position, set) > TV_RANGE || Math.abs(p.position.y - set.y) > 1.5 || !this.physics.canMove(p.position, set.x, set.z, .14)) return false;
    tv.used = true; tv.trapped = tv.channel = null;
    target.alive = true; target.caught = false; target.session.state = 'playing'; target.position = { ...p.position }; target.yaw = p.yaw; target.pitch = 0;
    target.safeUntil = this.elapsed + 3; target.input = normalizeInput(); target.lastInputAt = 0; target.stunnedUntil = 0;
    p.stats.rescues++;
    this.events.push({ type: 'rescue', by: p.name, name: target.name, id: target.id, round });
    return true;
  }

  emitEmote(id, round) {
    const p = this.players.get(id);
    if (this.state !== 'playing' || round !== this.round || !p?.connected || !p.alive || this.elapsed < p.stunnedUntil || this.elapsed < p.abilityUntil || (p.throwAt !== null && this.elapsed - p.throwAt < .7) || this.elapsed - p.lastEmoteAt < EMOTE_COOLDOWN) return false;
    const kind = signature(p.appearance.skin, p.role);
    if (kind === 'taps' && this.elapsed < p.abilityNext) return false;
    p.emote = { kind, at: this.elapsed }; p.lastEmoteAt = this.elapsed; p.stats.emotes++; return true;
  }

  tick(dt) {
    const now = this.now();
    for (const player of this.players.values()) {
      if (!player.connected && now - player.disconnectedAt > RECONNECT_GRACE_MS) this.remove(player.id);
    }
    if (this.state !== 'playing') return;
    dt = clamp(dt, 0, 0.1);
    this.elapsed += dt;
    this.decoys = this.decoys.filter((decoy) => decoy.expires > this.elapsed);
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const input = p.connected && this.elapsed >= p.stunnedUntil && now - p.lastInputAt < 300 ? p.input : normalizeInput();
      const roleMultiplier = roleSpeed(this.mode, p.role, this.elapsed);
      const running = p.session.tick(dt, input.sprint, input.moving && roleMultiplier > 0);
      const moved = input.moving ? moveActor(this.physics, p.position, input, p.yaw, (running ? RUN_SPEED : WALK_SPEED) * this.mode.speed * roleMultiplier, dt, this.mode.radius) : 0;
      if (p.connected) recordMovement(p.stats, moved, dt);
      if (moved > 0.00001 && p.autoPickup) {
        for (const pickup of this.pickups) this.collect(p.id, pickup.id, AUTO_PICKUP_RADIUS);
      }
    }
    if (this.state !== 'playing') return;
    this.enemy.active = !this.mode.pvp && (this.elapsed >= this.mode.grace || this.collected.size > 0);
    this.updateBats(dt);
    if (this.mode.pvp) {
      if (!this.players.has(this.killerId)) { this.state = 'won'; this.winner = 'survivors'; }
      else if (![...this.players.values()].some((p) => p.alive && p.role !== 'killer')) { this.state = 'lost'; this.winner = 'killer'; }
      else if (this.elapsed >= this.mode.timeLimit) { this.state = 'won'; this.winner = 'survivors'; }
      return;
    }
    if (this.mode.hunt && this.elapsed >= this.mode.timeLimit) { this.state = 'lost'; return; }
    const survivors = [...this.players.values()].filter((p) => p.alive);
    if (!survivors.length) { this.state = 'lost'; return; }
    const alive = survivors.filter((p) => this.elapsed >= p.safeUntil);
    if (!alive.length) return;
    if (!this.enemy.active || this.elapsed < this.enemy.stunnedUntil) return;
    const monster = getMonster(this.monster, this.location.monster);
    const moving = (p) => p.connected && now - p.lastInputAt < 300 && p.input.moving;
    const audible = monster.id === 'laalaa' && !this.mode.funny ? alive.filter(moving) : [];
    const decoy = this.decoys.slice().sort((a, b) => distance2D(a, this.enemy) - distance2D(b, this.enemy))[0];
    const target = decoy ? { position: decoy, decoy: true } : (audible.length ? audible : alive).sort((a, b) => distance2D(a.position, this.enemy) - distance2D(b.position, this.enemy))[0];
    const distance = distance2D(target.position, this.enemy);
    if (target.decoy && distance < 0.8) return;
    if (!this.mode.hunt && !target.decoy && distance < 1.15 + (this.mode.enemyScale - 1) * 0.35 && Math.abs(this.enemy.y - target.position.y) < 2.5) {
      this.catchPlayer(target);
      if (survivors.length === 1) this.state = 'lost';
      return;
    }
    const sign = this.mode.hunt && !target.decoy ? -1 : 1;
    const ux = (target.position.x - this.enemy.x) / Math.max(distance, 0.001) * sign;
    const uz = (target.position.z - this.enemy.z) / Math.max(distance, 0.001) * sign;
    const speed = this.mode.hunt && !target.decoy ? 3.7 : (1.7 + this.collected.size * 0.19) * this.mode.enemySpeed * (this.mode.funny || target.decoy ? 1 : monsterSpeed(monster.id, this.elapsed, distance, moving(target)));
    for (const angle of [0, 0.5, -0.5, 1, -1, 1.55, -1.55, 2.3, -2.3, Math.PI]) {
      const dx = (ux * Math.cos(angle) - uz * Math.sin(angle)) * speed * dt;
      const dz = (ux * Math.sin(angle) + uz * Math.cos(angle)) * speed * dt;
      if (this.physics.canMove(this.enemy, this.enemy.x + dx, this.enemy.z + dz, Math.min(0.6, 0.3 * this.mode.enemyScale))) { this.enemy.x += dx; this.enemy.z += dz; break; }
    }
    this.enemy.y = this.physics.groundAt(this.enemy.x, this.enemy.z);
    this.enemy.yaw = Math.atan2(target.position.x - this.enemy.x, target.position.z - this.enemy.z);
  }

  get matchId() { return `${this.code}:${this.createdAt}:${this.round}`; }

  snapshot() {
    const finished = ['won', 'lost'].includes(this.state);
    if (finished && !this.photo) this.photo = photoCast(this.roster, this.mode.funny);
    return {
      type: 'state', protocol: 1, code: this.code, hostId: this.hostId, state: this.state, round: this.round,
      elapsed: this.elapsed, mode: this.mode.id, location: this.location.id, monster: this.monster, matchId: this.matchId, collected: [...this.collected], pickups: this.pickups,
      enemy: this.enemy, decoys: this.decoys, bats: this.state === 'playing' ? this.bats : [], killerId: this.killerId, winner: this.winner,
      tv: this.tv && this.state === 'playing' ? { stations: this.tv.stations, trapped: this.tv.trapped, used: this.tv.used } : null, photo: finished ? this.photo : null,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, connected: p.connected, alive: p.alive,
        position: [p.position.x, p.position.y, p.position.z], yaw: p.yaw, pitch: p.pitch,
        flashlight: p.flashlight, stamina: p.session.stamina, exhausted: p.session.exhausted, seq: p.seq, appearance: p.appearance,
        role: p.role, rabbit: this.elapsed < p.abilityUntil, abilityUntil: p.abilityUntil, abilityNext: p.abilityNext,
        stunnedUntil: p.stunnedUntil, throwAt: p.throwAt,
        emote: p.emote && this.elapsed - p.emote.at < EMOTE_TIME ? p.emote : null, emoteNext: Number.isFinite(p.lastEmoteAt) ? p.lastEmoteAt + EMOTE_COOLDOWN : 0,
      })),
    };
  }
}
