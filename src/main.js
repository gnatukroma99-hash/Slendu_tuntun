import * as THREE from 'three';
import { GameSession, clamp, distance2D, formatTime, selectSpawns } from './core.js';
import { loadWorld } from './world.js';
import { Controls } from './controls.js';
import { GameAudio } from './audio.js';
import { AUTO_PICKUP_RADIUS, PICKUP_RADIUS, RUN_SPEED, WALK_SPEED, moveActor } from './physics.js';
import { LanClient } from './network.js';
import { LanMenu } from './lan-ui.js';
import { Peers } from './peers.js';
import { MODES, getMode } from './modes.js';
import { FunExtras } from './fun.js';
import { LocalProfile, skinAbility } from './catalog.js';
import { Shop } from './shop.js';
import { RoomChat } from './chat.js';
import { LOCATIONS, getLocation } from './locations.js';
import { MONSTERS, getMonster, monsterChoice, monsterSpeed } from './monsters.js';
import { createLocationWorld } from './location-world.js';
import { MonsterModels } from './monster-models.js';
import { preloadModels, modelStatus } from './asset-library.js';
import { HardcoreDistractions } from './distractions.js';
import { HUNT_HEALTH, ATTACK_RANGE, ATTACK_COOLDOWN, BUNNY_DURATION, BUNNY_COOLDOWN, createRabbitDecoys, roleSpeed } from './round-rules.js';
import { BAT_COOLDOWN, BAT_RELEASE, BAT_STUN_DURATION, batMonsterTarget, makeBatShot, stepBat } from './sahur-ability.js';
import { SahurEffects } from './sahur-effects.js';
import { EMOTES, EMOTE_TIME, EMOTE_COOLDOWN, TV_RANGE, TV_NAMES, signature, photoCast, newRoundStats, recordMovement } from './round-extras.js';
import { TAP_TIMES } from './emote-pose.js';
import { FieldStudio } from './field-studio.js';
import { RescueTelevisions } from './rescue-tv.js';
import './style.css';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#game');
const session = new GameSession();
const audio = new GameAudio();
let profileStorage = null;
try { profileStorage = localStorage; } catch { /* In-memory shop if storage is disabled. */ }
const profile = new LocalProfile(profileStorage);
const coarse = matchMedia('(pointer: coarse)').matches;
const qualitySelect = $('#quality');
const sensitivity = $('#sensitivity');
const autoPickup = $('#auto-pickup');
const hardcoreEffects = $('#hardcore-effects');
const modeSelect = $('#game-mode');
const locationSelect = $('#game-location'), monsterSelect = $('#game-monster');
for (const location of Object.values(LOCATIONS)) locationSelect.add(new Option(location.title, location.id));
monsterSelect.add(new Option('По карте', 'auto'));
for (const monster of Object.values(MONSTERS)) monsterSelect.add(new Option(monster.title, monster.id));
for (const mode of Object.values(MODES)) modeSelect.add(new Option(mode.title, mode.id));
const describeMode = () => {
  $('#mode-description').textContent = getMode(modeSelect.value).description;
  $('#location-description').textContent = getLocation(locationSelect.value).description;
  $('#monster-description').textContent = getMode(modeSelect.value).funny ? 'В шуточном режиме охотится Ушастый; выбор монстра применяется в классике и хардкоре.' : getMonster(monsterSelect.value, getLocation(locationSelect.value).monster).description;
};
modeSelect.addEventListener('change', () => { describeMode(); saveSettings(); });
for (const select of [locationSelect, monsterSelect]) select.addEventListener('change', () => { describeMode(); saveSettings(); });
qualitySelect.value = coarse ? 'low' : 'medium';
try {
  const saved = JSON.parse(localStorage.getItem('slendytubbies-web-settings') || '{}');
  if (['low', 'medium', 'high'].includes(saved.quality)) qualitySelect.value = saved.quality;
  if (Number.isFinite(saved.sensitivity)) sensitivity.value = clamp(saved.sensitivity, 0.5, 2);
  if (typeof saved.autoPickup === 'boolean') autoPickup.checked = saved.autoPickup;
  if (typeof saved.hardcoreEffects === 'boolean') hardcoreEffects.checked = saved.hardcoreEffects;
  modeSelect.value = getMode(saved.mode).id;
  locationSelect.value = getLocation(saved.location).id;
  monsterSelect.value = monsterChoice(saved.monster);
} catch { /* Storage may be disabled in private browsers. */ }
describeMode();
function saveSettings() {
  try { localStorage.setItem('slendytubbies-web-settings', JSON.stringify({ quality: qualitySelect.value, sensitivity: Number(sensitivity.value), autoPickup: autoPickup.checked, hardcoreEffects: hardcoreEffects.checked, mode: modeSelect.value, location: locationSelect.value, monster: monsterSelect.value })); } catch { /* Optional persistence. */ }
}
qualitySelect.addEventListener('change', saveSettings);
sensitivity.addEventListener('change', saveSettings);
autoPickup.addEventListener('change', saveSettings);
hardcoreEffects.addEventListener('change', saveSettings);

let renderer, world, fun;
let baseWorld, monsterModels, activeLocation = getLocation(), activeMonster = getMonster();
let roundReceipt = '', monsterTickClock = 0;
let soloChallengeSkin = null;
let myRole = 'survivor', soloHealth = HUNT_HEALTH, lastAttack = -Infinity;
let rabbitUntil = 0, rabbitNext = 0, localDecoys = [];
let soloBatNext = 0, soloThrowAt = null, soloReleaseAt = null, soloStunnedUntil = 0, localBats = [];
const worlds = new Map();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d1412');
scene.fog = new THREE.FogExp2('#0d1412', 0.033);
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.06, 110);
camera.rotation.order = 'YXZ';
scene.add(camera);
const sahur = new SahurEffects(scene, camera);
const studio = new FieldStudio(), televisions = new RescueTelevisions(scene, studio);
let soloStats = newRoundStats(), soloEmote = null, soloEmoteNext = 0, ownBeat = '', tunerIndex = 0, sharedClue = '';
const hemisphere = new THREE.HemisphereLight('#c4d1cb', '#293022', 1.05);
scene.add(hemisphere);
const moon = new THREE.DirectionalLight('#9fbbb4', 0.85);
moon.position.set(30, 60, -25);
scene.add(moon);
const flashlight = new THREE.SpotLight('#f2f0cc', 45, 28, Math.PI / 5.8, 0.6, 1.1);
flashlight.position.set(0.16, -0.18, -0.12);
flashlight.target.position.set(0, -0.12, -12);
camera.add(flashlight, flashlight.target);
const player = new THREE.Vector3();
let yaw = Math.PI, pitch = 0, flashlightOn = true;
let collectibles = [], closest = null, toastUntil = 0;
let stepClock = 0, heartbeatClock = 0, lostAt = 0, lastUi = 0;
const enemyDirection = new THREE.Vector3();
let controls;
let multiplayer = false, networkRound = 0, resultRound = 0, roomState = null, roomReceivedAt = 0;
let lastNetworkSend = 0, lastCollectRequest = 0, networkScareUntil = 0;
const correction = new THREE.Vector3();
const enemyTarget = new THREE.Vector3();
const peers = new Peers(scene);
const network = new LanClient({
  onState: receiveRoomState,
  onEvent: receiveRoomEvent,
  onJoined: () => { multiplayer = true; chat.setActive(true); lanMenu.error('Комната готова. Пригласи друга.'); },
  onStatus: (status) => {
    const reconnecting = status === 'reconnecting' || status === 'connecting';
    $('#network-banner').hidden = !(multiplayer && reconnecting);
    if (multiplayer && reconnecting && session.state === 'playing') pauseGame();
    if (status === 'connected') $('#network-banner').hidden = true;
  },
  onError: (message) => { lanMenu.error(message); if (chat.isOpen) chat.notice(message); if (session.state === 'playing') toast(message); },
  onEnded: (message) => { showMenu(); lanMenu.open().then(() => lanMenu.error(message)); },
});
const lanMenu = new LanMenu(network, {
  onGesture: () => audio.start(),
  onStart: () => { audio.start(); requestImmersion(); },
  onLeave: showMenu,
  autoPickup: () => autoPickup.checked,
  appearance: () => profile.appearance,
});
const chat = new RoomChat(network, () => { if (session.state === 'playing') pauseGame(); });
const shop = new Shop(profile, (appearance) => {
  if (!multiplayer && ['playing', 'paused'].includes(session.state) && appearance.skin !== soloChallengeSkin) soloChallengeSkin = null;
  if (network.membership) network.send({ type: 'appearance', appearance });
}, () => audio.enabled);
const distractions = new HardcoreDistractions();
shop.refreshWallet();
const meInRoom = () => roomState?.players.find((p) => p.id === network.membership?.yourId);
const rabbitActive = () => multiplayer ? Boolean(meInRoom()?.rabbit) : session.elapsed < rabbitUntil;
const activeAbility = () => skinAbility((multiplayer ? meInRoom()?.appearance : profile.appearance)?.skin);
const myStunRemaining = () => multiplayer ? (meInRoom()?.stunnedUntil || 0) - (roomState?.elapsed || 0) : 0;
const monsterProfile = () => batMonsterTarget(world.enemy.position, session.mode, activeMonster.id);
const abilityButton = $('#ability-button');
const emoteButton = $('#emote-button'), tunerButton = $('#tv-tuner');
const skinLook = () => multiplayer ? meInRoom()?.appearance || profile.appearance : profile.appearance;

function gestureAllowed() {
  const me = meInRoom(), now = multiplayer ? roomState?.elapsed || 0 : session.elapsed;
  const kind = signature(skinLook().skin, myRole), lastThrow = multiplayer ? me?.throwAt : soloThrowAt;
  return session.state === 'playing' && !chat.isOpen && (!multiplayer || (network.connected && me?.alive)) && !rabbitActive() && myStunRemaining() <= 0
    && now >= (multiplayer ? me?.emoteNext || 0 : soloEmoteNext) && (lastThrow == null || now-lastThrow >= .7)
    && (kind !== 'taps' || now >= (multiplayer ? me?.abilityNext || 0 : soloBatNext));
}
function useEmote() {
  if (!gestureAllowed()) return;
  if (multiplayer) { network.send({ type:'emote', round:roomState.round }); return; }
  soloEmote = {kind:signature(skinLook().skin, myRole), at:session.elapsed}; soloEmoteNext=session.elapsed+EMOTE_COOLDOWN; soloStats.emotes++;
}
function drawEmote(time) {
  const e = multiplayer ? meInRoom()?.emote : soloEmote;
  const visible = session.state === 'playing' && e && time >= e.at && time-e.at < EMOTE_TIME && myStunRemaining() <= 0;
  studio.selfEmote(visible ? e : null, time, skinLook(), session.mode.id === 'pig', sahur.reduced.matches);
  if (visible && e.kind==='taps') {
    const age=time-e.at, i=TAP_TIMES.findIndex((t)=>age>=t && age-t<.16), key=`${e.at}:${i}`;
    if(i>=0 && ownBeat!==key) { ownBeat=key; audio.woodTap(); }
  }
}
emoteButton.addEventListener('click',useEmote);
function cycleChannel() { const tv=roomState?.tv; if(session.state==='playing' && tv?.trapped && tv.stations.length) { tunerIndex=(tunerIndex+1)%tv.stations.length; updateNearest(); } }
tunerButton.addEventListener('click',cycleChannel);
document.addEventListener('keydown',(e)=>{
  if(e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if(e.code==='KeyG') useEmote(); if(e.code==='KeyV') cycleChannel();
});
$('#share-signal').addEventListener('click',()=>{
  const id=roomState?.tvSignal, me=meInRoom();
  if(id == null || !me || roomState.tv?.trapped!==me.id || !network.connected) return;
  network.send({type:'chat', text:`Мой сигнал на ТВ «${TV_NAMES[id]}»! Выбери этот канал на V, подойди к телевизору и нажми E.`});
  sharedClue=`${roomState.round}:${me.id}:${id}`; $('#share-signal').disabled=true;
});
function receiverInReach() {
  const tv=roomState?.tv;
  if(!multiplayer || session.state!=='playing' || !tv?.trapped) return null;
  return tv.stations.find((s)=>distance2D(player,s)<=TV_RANGE && Math.abs(player.y-s.y)<=1.5 && world.canMove(player,s.x,s.z,.14));
}

function useAbility() {
  if (session.state !== 'playing' || abilityButton.disabled) return;
  const ability = activeAbility();
  if (!ability || (ability === 'rabbit' && myRole === 'killer')) return;
  if (multiplayer) {
    if (ability === 'bat') network.input(controls.movement(), yaw, pitch, flashlightOn, autoPickup.checked);
    network.send({ type: 'ability' }); return;
  }
  if (ability === 'rabbit' && session.elapsed >= rabbitNext) {
    soloEmote=null;
    rabbitUntil = session.elapsed + BUNNY_DURATION; rabbitNext = session.elapsed + BUNNY_COOLDOWN;
    localDecoys = createRabbitDecoys(world, player, 'solo', rabbitUntil); audio.rabbit(); toast('Ты — заяц! Приманки отвлекают монстра 10 секунд.');
  } else if (ability === 'bat' && session.elapsed >= soloBatNext) {
    soloEmote=null;
    soloThrowAt = session.elapsed; soloReleaseAt = session.elapsed + BAT_RELEASE; soloBatNext = session.elapsed + BAT_COOLDOWN;
  }
  updateRoundInterface();
}
abilityButton.addEventListener('click', useAbility);
document.addEventListener('keydown', (event) => { if (event.code === 'KeyR' && !event.repeat && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) useAbility(); });

function showBatImpact({ hit, blocked, target, name, by }) {
  const localId = multiplayer ? network.membership?.yourId : 'solo';
  if (hit) {
    if (by === localId || target === localId || !target) audio.batHit();
    if (target === localId) toast(`Ты оглушён на ${BAT_STUN_DURATION} секунд!`, 3);
    else if (by === localId || !target) toast(`${target ? name : 'Монстр'} · оглушение на ${BAT_STUN_DURATION} секунд.`, 3);
  } else if (by === localId) toast(blocked ? 'Бита ударилась о препятствие.' : 'Промах.', 2);
}

function updateSoloBats(dt) {
  const time = session.elapsed, enemy = world.enemy;
  const active = time >= session.mode.grace || session.collected.size > 0;
  if (soloReleaseAt !== null && time >= soloReleaseAt) {
    const shot = makeBatShot(`solo:${soloThrowAt}`, 'solo', player, yaw, pitch, session.mode.playerScale);
    shot.releasedAt = soloReleaseAt; soloReleaseAt = null; localBats.push(shot); audio.throwBat();
  }
  if (localBats.length) {
    const targets = active ? [monsterProfile()] : [];
    localBats = localBats.filter((shot) => {
      const result = stepBat(shot, Math.min(dt, time - shot.releasedAt), world, targets);
      if (!result) return true;
      if (result.target) { soloStunnedUntil = time + BAT_STUN_DURATION; soloStats.stuns++; }
      showBatImpact({ by: 'solo', hit: !!result.target, blocked: result.blocked });
      return false;
    });
  }
  sahur.updateShots(localBats);
  sahur.updateMonster(enemy, monsterProfile().height, active ? soloStunnedUntil - time : 0, time);
}

function attack() {
  if (multiplayer) { if (performance.now() - lastCollectRequest > 80) { network.send({ type: 'attack' }); lastCollectRequest = performance.now(); } return; }
  if (!session.mode.hunt || session.elapsed - lastAttack < ATTACK_COOLDOWN || distance2D(player, world.enemy.position) > ATTACK_RANGE || !world.canMove(player, world.enemy.position.x, world.enemy.position.z, 0.12)) return;
  lastAttack = session.elapsed; soloStats.tags++; soloEmote=null; soloHealth = Math.max(0, soloHealth - 1); audio.pickup(); toast(`Попадание! Осталось ${soloHealth}/10.`, 2);
  if (!soloHealth) { session.state = 'won'; finishGame(true); }
}

function activateLocation(id) {
  if (!baseWorld) return;
  if (world?.group) world.group.visible = false;
  if (world?.enemy) world.enemy.visible = false;
  monsterModels.hide();
  activeLocation = getLocation(id);
  if (!worlds.has(activeLocation.id)) worlds.set(activeLocation.id, createLocationWorld(scene, activeLocation.id, baseWorld));
  world = worlds.get(activeLocation.id); world.group.visible = true;
  scene.background.set(activeLocation.background); scene.fog.color.set(activeLocation.background);
}

function showError(error) {
  console.error(error);
  renderer?.setAnimationLoop(null);
  audio.pause();
  sendNeutral();
  $('#error-message').textContent = error.message || 'Не удалось загрузить игру. Проверь подключение и попробуй снова.';
  $('#error-screen').hidden = false;
}
$('#retry').addEventListener('click', () => location.reload());

function resize() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', resize);
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  session.pause();
  controls?.reset();
  showError(new Error('Потеряно соединение с графическим устройством. Закрой другие вкладки, обнови браузер и повтори запуск с экономной графикой.'));
});

function toast(message, duration = 4) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastUntil = performance.now() + duration * 1000;
}

function requestImmersion() {
  if (coarse) {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    screen.orientation?.lock?.('landscape').catch(() => {});
  } else {
    try {
      const promise = canvas.requestPointerLock?.();
      promise?.catch(() => toast('Если мышь не захватилась, удерживай её кнопку для обзора.'));
    } catch { toast('Удерживай кнопку мыши для обзора.'); }
  }
}

function clearCollectibles() {
  collectibles.forEach((item) => {
    scene.remove(item.group);
    item.glow.material.dispose();
    item.glow.geometry.dispose();
  });
  collectibles = [];
}

function beginRound(points = null, spawn = null) {
  if (!world) return;
  studio.endEmote(); studio.clearPhoto(); televisions.clear();
  soloStats=newRoundStats(); soloEmote=null; soloEmoteNext=0; tunerIndex=0; ownBeat=sharedClue=''; tunerButton.hidden=true;
  audio.start();
  saveSettings();
  activateLocation(multiplayer ? roomState?.location : locationSelect.value);
  activeMonster = getMonster(multiplayer ? roomState?.monster : monsterSelect.value, activeLocation.monster);
  world.classicEnemy = monsterModels.get(activeMonster.id);
  roundReceipt = multiplayer ? roomState.matchId : `solo:${globalThis.crypto?.randomUUID?.() || `${Date.now()}:${Math.random()}`}`;
  monsterTickClock = 0;
  world.setQuality(qualitySelect.value);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, { low: 1, medium: 1.35, high: 1.75 }[qualitySelect.value]));
  resize();
  session.mode = getMode(multiplayer ? roomState?.mode : modeSelect.value);
  soloChallengeSkin = !multiplayer && session.mode.id === 'hardcore' ? profile.appearance.skin : null;
  $('#challenge-reward').hidden = true;
  const mode = session.mode;
  myRole = multiplayer ? meInRoom()?.role || 'survivor' : mode.hunt ? 'hunter' : 'survivor';
  soloHealth = HUNT_HEALTH; lastAttack = -Infinity; rabbitUntil = rabbitNext = 0; localDecoys = [];
  soloBatNext = soloStunnedUntil = 0; soloThrowAt = soloReleaseAt = null; localBats = [];
  sahur.clear();
  fun.syncDecoys([], 0); monsterModels.setScale(activeMonster.id, mode.enemyScale);
  distractions.reset(mode.hardcore && hardcoreEffects.checked);
  $('#seeker-cover').hidden = true;
  const scareUrl = mode.funny ? monsterModels.scare('rabbit', fun.enemy) : activeMonster.id === 'tinky' ? baseWorld.scareUrl : monsterModels.scare(activeMonster.id);
  $('#jumpscare').style.backgroundImage = scareUrl ? `url("${scareUrl}")` : 'none';
  world.classicEnemy.visible = fun.enemy.visible = false;
  world.enemy = mode.funny ? fun.enemy : world.classicEnemy;
  world.enemy.rotation.x = world.enemy.rotation.z = 0;
  hemisphere.intensity = mode.hardcore ? 0.25 : 1.05;
  moon.intensity = mode.hardcore ? 0.22 : 0.85;
  scene.fog.density = mode.hardcore ? 0.05 : 0.033;
  flashlight.distance = mode.hardcore ? 17 : 28;
  flashlight.intensity = mode.hardcore ? 30 : 45;
  document.body.classList.toggle('pig-mode', mode.id === 'pig');
  $('#objective-label').textContent = mode.funny ? 'СОБЕРИ МОРКОВКИ' : 'СОБЕРИ КРЕМ';
  if (mode.hunt) $('#objective-label').textContent = 'ПОЙМАЙ МОНСТРА · E';
  if (mode.hide || myRole === 'killer') $('#objective-label').textContent = myRole === 'killer' ? 'ПОЙМАЙ ИГРОКОВ · E' : 'СПРЯЧЬСЯ И ВЫЖИВИ';
  $('#objective-total').textContent = mode.pvp ? '' : ' / 10';
  $('#location-name').textContent = { classic: 'CLASSIC / NIGHT', hardcore: 'HARDCORE / NO SIGNAL', rabbits: 'RABBIT CONSPIRACY', pig: 'OPERATION: ХРЮ' }[mode.id];
  $('#location-name').textContent = `${mode.title} · ${activeLocation.title}`;
  $('.look-hint').textContent = mode.funny ? 'МОРКОВКИ ПОДБИРАЮТСЯ НА ХОДУ · ОБЗОР СПРАВА' : 'КРЕМ ПОДБИРАЕТСЯ НА ХОДУ · ОБЗОР СПРАВА';
  $('#signal-hint').hidden = mode.hardcore || mode.pvp;
  $('#pickup-prompt').firstChild.textContent = mode.funny ? 'МОРКОВКА РЯДОМ ' : 'КРЕМ РЯДОМ ';
  $('#mode-badge').textContent = `${mode.title} · пасхалки 0/${fun.bunnies.length}`;
  peers.mode = mode.id;
  session.reset();
  controls.reset();
  clearCollectibles();
  if (spawn) player.fromArray(spawn);
  else player.copy(world.spawn);
  player.y = world.groundAt(player.x, player.z);
  yaw = Math.PI; pitch = 0;
  stepClock = heartbeatClock = lostAt = lastUi = 0;
  lastCollectRequest = lastNetworkSend = networkScareUntil = 0;
  correction.set(0, 0, 0);
  flashlightOn = true;
  updateFlashlight();
  const chosen = points || selectSpawns(world.spawns, player, session.goal);
  for (const [id, point] of chosen.entries()) {
    if (mode.hide || mode.hunt) continue;
    const group = new THREE.Group();
    const model = (mode.funny ? fun.carrot : world.collectibleTemplate).clone(true);
    group.add(model);
    group.position.set(point.x, world.groundAt(point.x, point.z) + 0.08, point.z);
    // A subtle beacon makes tiny original collectibles legible on a phone.
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: '#d6f8a7', transparent: true, opacity: 0.85 }));
    glow.position.y = 0.7;
    group.add(glow);
    glow.visible = !mode.hardcore;
    scene.add(group);
    collectibles.push({ id, group, model, glow, baseY: group.position.y });
  }
  fun.reset(mode, chosen, player, world);
  const farPoints = world.spawns.map((p) => new THREE.Vector3(...p)).sort((a, b) => Math.abs(distance2D(a, player) - 48) - Math.abs(distance2D(b, player) - 48));
  world.enemy.position.copy(farPoints[0]);
  world.enemy.position.y = world.groundAt(world.enemy.position.x, world.enemy.position.z);
  world.enemy.visible = false;
  $('#menu').hidden = $('#pause-screen').hidden = $('#result-screen').hidden = $('#jumpscare').hidden = true;
  lanMenu.hide();
  chat.close(); shop.close();
  $('#spectator-banner').hidden = true;
  $('#pause').disabled = false;
  $('#network-status').hidden = !multiplayer;
  $('#restart').disabled = false;
  $('#restart').textContent = 'ЕЩЁ ОДНА ПОПЫТКА →';
  $('#hud').hidden = false;
  document.body.classList.add('playing');
  document.body.classList.remove('spectating');
  $('#collected').textContent = '00';
  $('#timer').textContent = '00:00';
  $('#danger').style.opacity = 0;
  $('#pickup-prompt').hidden = true;
  toast(mode.id === 'classic' ? (multiplayer ? 'Найдите 10 порций вместе. Не оставляйте друзей одних.' : 'Собери 10 порций. Но если встретишь кролика — вопросов не задавай.') : mode.description, 6);
  updateCamera(0);
  updateNearest();
  updateRoundInterface();
}

function startGame() {
  if (!world) return;
  if (getMode(modeSelect.value).multiplayerOnly) { lanMenu.open(); lanMenu.error('Этот режим — для 2–4 игроков. Создай комнату и пригласи друга.'); return; }
  network.leave();
  chat.setActive(false);
  multiplayer = false; networkRound = resultRound = 0; roomState = null;
  peers.clear();
  $('#network-banner').hidden = true;
  requestImmersion();
  beginRound();
}

function sendNeutral() {
  network.input({ x: 0, y: 0, sprint: false }, yaw, pitch, flashlightOn, autoPickup.checked);
}

function updateFlashlight() {
  flashlight.visible = flashlightOn;
  $('#flashlight').classList.toggle('active', flashlightOn);
  $('#flashlight').setAttribute('aria-pressed', String(flashlightOn));
}
function toggleFlashlight() {
  if (session.state !== 'playing') return;
  flashlightOn = !flashlightOn;
  updateFlashlight();
}

function pauseGame() {
  if (session.state !== 'playing') return;
  session.pause();
  studio.endEmote();
  controls.reset();
  sendNeutral();
  audio.pause();
  document.exitPointerLock?.();
  $('#pause-screen').hidden = false;
  $('#pause-description').textContent = multiplayer ? 'В кооперативе мир не останавливается. Друзья и преследователь продолжают движение — даже когда ты на паузе.' : 'Лес подождёт. Сделай вдох.';
  $('#resume').focus();
}

function resumeGame() {
  if (session.state !== 'paused') return;
  if (multiplayer && !network.connected) { toast('Дождись восстановления связи.'); return; }
  session.resume();
  controls.reset();
  audio.resume();
  $('#pause-screen').hidden = true;
  requestImmersion();
}

function showMenu() {
  studio.endEmote(); studio.clearPhoto(); televisions.clear();
  network.leave();
  chat.setActive(false); shop.close();
  distractions.reset(false); $('#seeker-cover').hidden = true;
  multiplayer = false; networkRound = resultRound = 0; roomState = null;
  peers.clear();
  sahur.clear();
  lanMenu.hide();
  session.state = 'menu';
  controls.reset();
  audio.pause();
  document.exitPointerLock?.();
  $('#hud').hidden = $('#pause-screen').hidden = $('#result-screen').hidden = $('#jumpscare').hidden = true;
  $('#menu').hidden = false;
  $('#danger').style.opacity = 0;
  $('#network-banner').hidden = $('#network-status').hidden = $('#spectator-banner').hidden = true;
  document.body.classList.remove('playing');
  document.body.classList.remove('spectating');
  if (!world) return;
  fun.hide();
  document.body.classList.remove('pig-mode');
  hemisphere.intensity = 1.05; moon.intensity = 0.85; scene.fog.density = 0.033;
  world.enemy.visible = false;
  clearCollectibles();
  activateLocation(locationSelect.value);
  setMenuCamera();
}

function updateNearest() {
  const tv=roomState?.tv;
  tunerButton.hidden=!(multiplayer && session.state==='playing' && tv?.trapped && tv.stations.length);
  if(!tunerButton.hidden) {
    const station=tv.stations[tunerIndex%tv.stations.length];
    const dx=station.x-player.x,dz=station.z-player.z;
    const angle=Math.atan2(-dx,-dz)-yaw, normalized=Math.atan2(Math.sin(angle),Math.cos(angle));
    const arrow=Math.abs(normalized)<.42?'↑':Math.abs(normalized)>2.65?'↓':normalized<0?'→':'←';
    tunerButton.textContent=`ТВ «${TV_NAMES[station.id]}» ${arrow} ${Math.round(Math.hypot(dx,dz))} м · V ↻`;
    const near=receiverInReach();
    if(near) {
      $('#pickup-prompt').firstChild.textContent=`НАСТРОИТЬ ТВ «${TV_NAMES[near.id]}» `; $('#pickup-prompt').hidden=false;
      $('#collect').classList.add('in-reach'); $('#collect').setAttribute('aria-label','Настроить телевизор · E'); return;
    }
  }
  $('#pickup-prompt').firstChild.textContent=session.mode.funny?'МОРКОВКА РЯДОМ ':'КРЕМ РЯДОМ ';
  if (session.mode.hunt || session.mode.hide || myRole === 'killer') {
    closest = null; $('#pickup-prompt').hidden = true;
    $('#signal-hint').textContent = session.mode.hunt ? `МОНСТР · ${Math.round(distance2D(player, world.enemy.position))} м · E ДЛЯ ПОИМКИ` : '';
    $('#collect').setAttribute('aria-label', 'Поймать · E'); return;
  }
  closest = null;
  let nearestDistance = Infinity;
  for (const item of collectibles) {
    if (session.collected.has(item.id)) continue;
    const distance = distance2D(player, item.group.position);
    if (distance < nearestDistance) { closest = item; nearestDistance = distance; }
  }
  const inReach = nearestDistance < PICKUP_RADIUS;
  $('#pickup-prompt').hidden = !inReach;
  $('#collect').classList.toggle('in-reach', inReach);
  $('#collect').setAttribute('aria-label', session.mode.funny ? 'Подобрать морковку' : (inReach ? 'Подобрать крем рядом' : 'Подобрать крем'));
  if (closest) {
    const dx = closest.group.position.x - player.x, dz = closest.group.position.z - player.z;
    let angle = Math.atan2(-dx, -dz) - yaw;
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    const arrow = Math.abs(angle) < 0.35 ? '↑' : Math.abs(angle) > 2.6 ? '↓' : angle < 0 ? '→' : '←';
    $('#signal-hint').textContent = `СЛАБЫЙ СИГНАЛ ${arrow} · ${Math.round(nearestDistance)} м`;
  }
}

function collect() {
  if (!world || session.state !== 'playing' || myStunRemaining() > 0) return;
  const tv=receiverInReach();
  if(tv) {
    if(performance.now()-lastCollectRequest>450) { network.send({type:'rescue', station:tv.id, trapped:roomState.tv.trapped, round:roomState.round}); lastCollectRequest=performance.now(); }
    return;
  }
  if (session.mode.hunt || myRole === 'killer') { attack(); return; }
  if (session.mode.hide) return;
  updateNearest();
  if (!closest || distance2D(player, closest.group.position) >= PICKUP_RADIUS) return;
  if (multiplayer) {
    if (performance.now() - lastCollectRequest > 80) { network.send({ type: 'collect', id: closest.id }); lastCollectRequest = performance.now(); }
    return;
  }
  if (!session.collect(closest.id)) return;
  soloStats.pickups++;
  profile.reward(`${roundReceipt}:pickup:${closest.id}`, 5); shop.refreshWallet();
  closest.group.visible = false;
  audio.pickup();
  if (session.mode.id === 'pig') audio.oink();
  if (coarse && navigator.vibrate) navigator.vibrate(30);
  $('#collected').textContent = String(session.collected.size).padStart(2, '0');
  toast(session.mode.id === 'pig' ? `ХРЮ! Морковок ${session.collected.size}/10. Порося идёт к успеху.` : session.mode.id === 'rabbits' ? `Морковок ${session.collected.size}/10. Ушастый уже вызвал охрану.` : session.collected.size === 1 ? 'Он услышал тебя. Не стой на месте.' : `Найдено ${session.collected.size} из ${session.goal}. Продолжай.`, 3);
  updateNearest();
  if (session.state === 'won') finishGame(true);
}

function finishGame(won) {
  studio.endEmote(); televisions.clear();
  distractions.reset(false); $('#seeker-cover').hidden = true;
  const unlocked = profile.finishSahurChallenge({ multiplayer, mode: session.mode.id, won: won && session.state === 'won', collected: session.collected.size, roundSkin: soloChallengeSkin });
  $('#challenge-reward').hidden = !unlocked;
  soloChallengeSkin = null;
  if (won) { profile.reward(`${roundReceipt}:win`, 50); shop.refreshWallet(); }
  controls.reset();
  document.exitPointerLock?.();
  $('#hud').hidden = true;
  $('#pause-screen').hidden = true;
  $('#jumpscare').hidden = true;
  fun.pig.visible = fun.rabbitPaws.visible = false;
  sahur.clear();
  $('#result-label').textContent = won ? 'ВСЕ ПОРЦИИ НАЙДЕНЫ' : 'СИГНАЛ ПОТЕРЯН';
  $('#result-title').textContent = multiplayer ? (won ? 'Команда выбралась.' : 'Он нашёл всех.') : (won ? 'Ты выбрался.' : 'Он нашёл тебя.');
  $('#result-description').textContent = won ? 'На этот раз лес отпустил тебя. Но он всё ещё там.' : 'В следующий раз не задерживайся на одном месте. Береги выносливость для побега.';
  $('#result-stats').textContent = `${session.collected.size} / ${session.goal} порций · ${formatTime(session.elapsed)}`;
  if (session.mode.funny) {
    $('#result-label').textContent = won ? 'МОРКОВНАЯ ОПЕРАЦИЯ ЗАВЕРШЕНА' : 'УШАСТЫЙ ВЫЗВАЛ ПОДКРЕПЛЕНИЕ';
    $('#result-title').textContent = session.mode.id === 'pig' ? (won ? 'Порося — легенда.' : 'Порося спалился.') : (won ? 'Морковки конфискованы.' : 'Кролики здесь главные.');
    $('#result-description').textContent = won ? 'Кролики составляют заявление о пропаже овощей. Ты ничего не видел.' : 'План был надёжный. Как швейцарский хрюк.';
    $('#result-stats').textContent = `${session.collected.size}/10 морковок · пасхалки ${fun.bunnies.filter((bunny) => bunny.found).length}/${fun.bunnies.length} · ${formatTime(session.elapsed)}`;
  }
  if (session.mode.pvp || session.mode.hunt) {
    $('#result-label').textContent = won ? 'ПОБЕДА' : 'РАУНД ЗАВЕРШЁН';
    $('#result-title').textContent = session.mode.hunt ? (won ? 'Монстр пойман!' : 'Монстр ускользнул.') : myRole === 'killer' ? (won ? 'Ты поймал всех.' : 'Игроки спаслись.') : (won ? 'Вы спаслись!' : 'Убийца победил.');
    $('#result-description').textContent = session.mode.hunt ? 'Охотники тоже иногда меняются местами с добычей.' : 'В следующем раунде роль водящего переходит следующему игроку.';
    $('#result-stats').textContent = `${session.mode.title} · ${formatTime(session.elapsed)}`;
  }
  $('#result-screen').hidden = false;
  const cast=multiplayer ? roomState.photo || [] : photoCast([{ name:$('#player-name').value.trim().slice(0,18)||'Игрок', appearance:profile.appearance, stats:soloStats }],session.mode.funny);
  const outcome=session.mode.pvp ? (roomState?.state==='lost'?'Водящий победил':'Игроки спаслись') : won?'Победа':'Сигнал потерян';
  studio.takePhoto(cast,{map:activeLocation.title,mode:session.mode.title,round:multiplayer?roomState.round:1,clock:formatTime(session.elapsed),outcome,pig:session.mode.id==='pig'});
  $('#danger').style.opacity = 0;
  if (won) audio.pickup();
  audio.pause();
  $('#restart').focus();
}

function receiveRoomState(state) {
  if (!world) return;
  const me = state.players.find((p) => p.id === network.membership?.yourId);
  if (!me) return;
  multiplayer = true;
  roomState = state;
  roomReceivedAt = performance.now();
  lanMenu.render(state);
  if (state.state === 'lobby') { session.state = 'lobby'; return; }
  if (state.round !== networkRound) {
    networkRound = state.round;
    resultRound = 0;
    peers.clear();
    beginRound(state.pickups, me.position);
    yaw = me.yaw; pitch = me.pitch;
    world.enemy.position.set(state.enemy.x, state.enemy.y, state.enemy.z);
  }
  session.elapsed = state.elapsed;
  myRole = me.role || 'survivor';
  session.stamina = me.stamina;
  session.exhausted = me.exhausted;
  session.collected = new Set(state.collected);
  for (const item of collectibles) item.group.visible = !session.collected.has(item.id);
  $('#collected').textContent = String(session.mode.hunt ? HUNT_HEALTH - state.enemy.health : session.mode.pvp ? state.players.filter((p) => p.alive && p.role !== 'killer').length : state.collected.length).padStart(2, '0');
  correction.fromArray(me.position).sub(player);
  if (correction.length() < 0.35) correction.set(0, 0, 0);
  if (myStunRemaining() > 0 || correction.length() > 2.5 || session.state !== 'playing') {
    player.fromArray(me.position); correction.set(0, 0, 0);
    if (session.state !== 'spectating') updateCamera(0);
  }
  enemyTarget.set(state.enemy.x, state.enemy.y, state.enemy.z);
  world.enemy.visible = state.enemy.active;
  peers.sync(state.players, me.id);
  televisions.sync(state,world.spawn);
  if (!me.alive && state.state === 'playing' && session.state !== 'spectating') {
    session.state = 'spectating';
    controls.reset(); sendNeutral(); document.exitPointerLock?.();
    $('#pause-screen').hidden = true;
    $('#spectator-banner').hidden = false;
    $('#pause').disabled = true;
    $('#danger').style.opacity = 0;
    flashlight.visible = false;
    fun.pig.visible = fun.rabbitPaws.visible = false;
    document.body.classList.add('spectating');
    $('#jumpscare').hidden = false; networkScareUntil = performance.now() + 900;
    audio.scare();
  }
  if (session.state==='spectating' && state.state==='playing') {
    if (me.alive) {
      session.state='playing'; document.body.classList.remove('spectating'); $('#spectator-banner').hidden=true;
      $('#pause').disabled=false; $('#jumpscare').hidden=true; networkScareUntil=0; chat.close();
      controls.reset(); player.fromArray(me.position); yaw=me.yaw; pitch=me.pitch; correction.set(0,0,0);
      flashlightOn=me.flashlight; updateFlashlight(); updateCamera(0); audio.resume(); updateNearest();
      toast('Ты снова в игре! После спасения у тебя 3 секунды форы.',4);
    } else {
      const trapped=state.tv?.trapped===me.id && state.tvSignal!=null;
      $('#spectator-note').textContent=trapped?`Ты в эфире ТВ «${TV_NAMES[state.tvSignal]}». Передай друзьям канал, чтобы они тебя вернули.`:'Тебя поймали. Команда продолжает — наблюдай за друзьями.';
      $('#share-signal').hidden=!trapped; $('#share-signal').disabled=sharedClue===`${state.round}:${me.id}:${state.tvSignal}`;
    }
  }
  if (!state.tv?.trapped || !me.alive) tunerButton.hidden=true;
  if (['won', 'lost'].includes(state.state)) {
    if (resultRound !== state.round) { resultRound = state.round; const won = session.mode.pvp && myRole === 'killer' ? state.state === 'lost' : state.state === 'won'; session.state = won ? 'won' : 'lost'; finishGame(won); }
    const host = state.hostId === me.id;
    $('#restart').disabled = !host || state.players.filter((p) => p.connected).length < 2;
    $('#restart').textContent = host ? 'НОВЫЙ ОБЩИЙ РАУНД →' : 'ЖДЁМ НОВОГО РАУНДА ОТ ХОЗЯИНА';
  }
}

function receiveRoomEvent(event) {
  if (event.type === 'chat' || event.type === 'chat-history') { chat.receive(event); return; }
  if (!multiplayer) return;
  if(event.type==='rescue') { toast(`${event.by} настроил телевизор. ${event.name} снова в игре!`,4); return; }
  if (event.type === 'ability') {
    if (event.ability === 'bat') { if (event.by === network.membership?.yourId) audio.throwBat(); }
    else { audio.rabbit(); toast(`${event.name} превратился в зайца!`, 3); }
    return;
  }
  if (event.type === 'bat-impact') { showBatImpact(event); return; }
  if (event.type === 'hit') { audio.pickup(); toast(`${event.name} попал! Осталось ${event.health}/10.`, 2); return; }
  if (event.type === 'pickup') {
    if (event.by === network.membership?.yourId) { profile.reward(`${event.matchId}:pickup:${event.id}`, 5); shop.refreshWallet(); audio.pickup(); if (session.mode.id === 'pig') audio.oink(); if (coarse) navigator.vibrate?.(25); }
    toast(`${event.name} ${session.mode.funny ? 'утащил морковку. Ушастый недоволен.' : 'нашёл крем. Продолжайте вместе.'}`, 2.5);
  } else if (event.type === 'caught' && event.id !== network.membership?.yourId) toast(`${event.name} пойман. Команда ещё может спастись.`, 4);
}

function updateNetworkWorld(dt) {
  if (!roomState || roomState.state === 'lobby') return;
  const lead = network.connected && roomState.state === 'playing' ? clamp((performance.now() - roomReceivedAt) / 1000, 0, 0.10) : 0;
  const visualTime = roomState.elapsed + lead;
  peers.update(dt, visualTime, (position)=>{ const distance=distance2D(player,position); if(distance<10 && session.state==='playing') audio.woodTap(.55*(1-distance/10)); });
  drawEmote(visualTime);
  fun.syncDecoys(roomState.decoys || [], roomState.elapsed);
  updateRoundInterface();
  world.enemy.position.lerp(enemyTarget, 1 - Math.exp(-dt * 14));
  world.enemy.rotation.y = roomState.enemy.yaw;
  world.enemy.rotation.z = Math.sin(session.elapsed * 6) * 0.045;
  if (roomState.state === 'playing') {
    sahur.updateShots(roomState.bats || [], lead);
    sahur.updateMonster(world.enemy, monsterProfile().height, roomState.enemy.active ? (roomState.enemy.stunnedUntil || 0) - visualTime : 0, visualTime);
  }
  if (session.state === 'spectating') {
    const target = roomState.players.find((p) => p.alive && p.id !== network.membership?.yourId);
    if (target) {
      const [x, y, z] = target.position;
      const view = new THREE.Vector3(x + Math.sin(target.yaw) * 3, y + 2.3, z + Math.cos(target.yaw) * 3);
      camera.position.lerp(view, 1 - Math.exp(-dt * 5));
      camera.lookAt(x, y + 1.1, z);
    }
  }
}

function catchPlayer() {
  if (session.state !== 'playing') return;
  session.catchPlayer();
  controls.reset();
  document.exitPointerLock?.();
  audio.scare();
  $('#jumpscare').hidden = false;
  if (coarse && navigator.vibrate) navigator.vibrate([80, 40, 80]);
  lostAt = performance.now();
}

function updateCamera(bob) {
  camera.position.copy(player);
  camera.position.y += (rabbitActive() ? 0.6 : 1.25 * session.mode.playerScale) + bob;
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
}

function updateEnemy(dt, moving) {
  if (multiplayer) {
    const distance = distance2D(player, world.enemy.position);
    const danger = world.enemy.visible && !session.mode.hunt && !session.mode.pvp ? clamp(1 - distance / 18, 0, 0.72) : 0;
    $('#danger').style.opacity = danger;
    heartbeatClock += dt;
    if (danger > 0.05 && heartbeatClock > 0.45 + distance / 25) { audio.heartbeat(); heartbeatClock = 0; }
    return;
  }
  if (session.elapsed < session.mode.grace && session.collected.size === 0) return;
  const enemy = world.enemy;
  enemy.visible = true;
  if (session.elapsed < soloStunnedUntil) { $('#danger').style.opacity = 0; return; }
  const decoy = localDecoys.slice().sort((a, b) => distance2D(a, enemy.position) - distance2D(b, enemy.position))[0];
  const target = decoy || player, distance = distance2D(target, enemy.position);
  if (decoy && distance < 0.8) return;
  if (!session.mode.hunt && !decoy && distance < 1.15 + (session.mode.enemyScale - 1) * 0.35 && Math.abs(enemy.position.y - player.y) < 2.5) { catchPlayer(); return; }
  const speed = session.mode.hunt && !decoy ? 3.7 : (1.7 + session.collected.size * 0.19) * session.mode.enemySpeed * (session.mode.funny || decoy ? 1 : monsterSpeed(activeMonster.id, session.elapsed, distance, moving));
  enemyDirection.set(target.x - enemy.position.x, 0, target.z - enemy.position.z).normalize();
  if (session.mode.hunt && !decoy) enemyDirection.negate();
  // Try progressively wider steering angles to avoid the original solid geometry.
  for (const angle of [0, 0.5, -0.5, 1, -1, 1.55, -1.55, 2.3, -2.3, Math.PI]) {
    const dx = (enemyDirection.x * Math.cos(angle) - enemyDirection.z * Math.sin(angle)) * speed * dt;
    const dz = (enemyDirection.x * Math.sin(angle) + enemyDirection.z * Math.cos(angle)) * speed * dt;
    if (world.canMove(enemy.position, enemy.position.x + dx, enemy.position.z + dz, Math.min(0.6, 0.3 * session.mode.enemyScale))) {
      enemy.position.x += dx;
      enemy.position.z += dz;
      break;
    }
  }
  enemy.position.y = world.groundAt(enemy.position.x, enemy.position.z);
  enemy.rotation.y = Math.atan2(player.x - enemy.position.x, player.z - enemy.position.z);
  enemy.rotation.z = Math.sin(session.elapsed * 6) * 0.045;
  const danger = session.mode.hunt ? 0 : clamp(1 - distance / 18, 0, 0.72);
  $('#danger').style.opacity = danger;
  heartbeatClock += dt;
  if (danger > 0.05 && heartbeatClock > 0.45 + distance / 25) { audio.heartbeat(); heartbeatClock = 0; }
}

function update(dt, now) {
  const movement = controls.movement();
  const roleMultiplier = myStunRemaining() > 0 ? 0 : roleSpeed(session.mode, myRole, session.elapsed);
  const sprinting = session.tick(dt, movement.sprint, movement.moving && roleMultiplier > 0);
  const speed = (sprinting ? RUN_SPEED : WALK_SPEED) * session.mode.speed * roleMultiplier;
  localDecoys = localDecoys.filter((decoy) => decoy.expires > session.elapsed);
  if (!multiplayer) fun.syncDecoys(localDecoys, session.elapsed);
  let actualMovement = 0;
  if (movement.moving && roleMultiplier > 0) {
    actualMovement = moveActor(world, player, movement, yaw, speed, dt, session.mode.radius);
    stepClock += actualMovement;
    if (stepClock > (sprinting ? 1.3 : 1.1)) { audio.step(); stepClock = 0; }
  }
  if (!multiplayer) { recordMovement(soloStats,actualMovement,dt); drawEmote(session.elapsed); }
  if (multiplayer) {
    const fraction = 1 - Math.exp(-dt * 8);
    const dx = correction.x * fraction, dz = correction.z * fraction;
    if (world.canMove(player, player.x + dx, player.z + dz, session.mode.radius)) { player.x += dx; player.z += dz; correction.multiplyScalar(1 - fraction); }
    player.y = world.groundAt(player.x, player.z);
    if (now - lastNetworkSend >= 50) { network.input(movement, yaw, pitch, flashlightOn, autoPickup.checked); lastNetworkSend = now; }
  }
  // Walking or running over a pickup requires no third finger or stop.
  if (!multiplayer && actualMovement > 0.00001 && autoPickup.checked) {
    updateNearest();
    if (closest && distance2D(player, closest.group.position) < AUTO_PICKUP_RADIUS) collect();
  }
  if (movement.collect && now - lastCollectRequest > 100) { collect(); lastCollectRequest = now; }
  updateCamera(actualMovement > 0.001 ? Math.sin(session.elapsed * (sprinting ? 13 : 9)) * 0.035 : 0);
  collectibles.forEach((item) => {
    if (!item.group.visible) return;
    item.model.rotation.y += dt * 0.35;
    item.group.position.y = item.baseY + Math.sin(session.elapsed * 2 + item.id) * 0.035;
  });
  if (!multiplayer) updateSoloBats(dt);
  updateEnemy(dt, movement.moving);
  if (activeMonster.id === 'po' && !session.mode.funny) {
    monsterTickClock += dt;
    if (monsterTickClock > (session.elapsed % 10 >= 8 ? 0.18 : 0.65)) { audio.tick(); monsterTickClock = 0; }
  }
  const secrets = fun.update(dt, session.elapsed, player, actualMovement > 0.001, audio, toast);
  for (const [index, egg] of fun.bunnies.entries()) if (egg.found) profile.reward(`${roundReceipt}:secret:${index}`, 5);
  shop.refreshWallet();
  $('#mode-badge').textContent = `${session.mode.title}${session.mode.id === 'pig' ? ' · ТЫ ПОРОСЯ' : ''} · пасхалки ${secrets}/${fun.bunnies.length}`;
  distractions.update(session.elapsed); updateRoundInterface();
  if (!multiplayer && session.mode.hunt) { $('#collected').textContent = String(HUNT_HEALTH - soloHealth).padStart(2, '0'); if (session.elapsed >= session.mode.timeLimit && session.state === 'playing') { session.state = 'lost'; finishGame(false); } }
  if (now - lastUi > 100) {
    $('#stamina-fill').style.transform = `scaleX(${session.stamina})`;
    $('#stamina-fill').classList.toggle('exhausted', session.exhausted);
    $('#timer').textContent = formatTime(session.mode.timeLimit ? Math.max(0, session.mode.timeLimit - session.elapsed) : session.elapsed);
    updateNearest();
    lastUi = now;
  }
}

function updateRoundInterface() {
  const active = session.state === 'playing' || session.state === 'paused';
  emoteButton.hidden=!active; emoteButton.disabled=!gestureAllowed();
  const gestureLabel=`${EMOTES[signature(skinLook().skin,myRole)]} · G`;
  if (emoteButton.title!==gestureLabel) { emoteButton.title=gestureLabel; emoteButton.setAttribute('aria-label',`Эмоция: ${gestureLabel}`); }
  const rabbit = active && rabbitActive();
  fun.rabbitPaws.visible = rabbit; fun.pig.visible = active && session.mode.id === 'pig' && !rabbit;
  const ability = activeAbility(), me = meInRoom(), remaining = myStunRemaining();
  const time = multiplayer ? roomState?.elapsed || 0 : session.elapsed;
  const next = multiplayer ? me?.abilityNext || 0 : ability === 'bat' ? soloBatNext : rabbitNext;
  const throwAt = multiplayer ? me?.throwAt : soloThrowAt;
  const throwAge = throwAt == null ? -1 : time - throwAt;
  const ready = time >= next;
  const grace = ability === 'bat' && session.mode.pvp && time < session.mode.hideTime;
  abilityButton.hidden = !active || !ability || (ability === 'rabbit' && myRole === 'killer');
  abilityButton.disabled = session.state !== 'playing' || remaining > 0 || grace || !ready;
  abilityButton.dataset.ability = ability || '';
  const label = ability === 'bat' ? 'Бросить биту · R' : 'Способность зайца · R';
  const hint = grace ? 'Бросок доступен после форы' : !ready ? `${label} · перезарядка` : label;
  if (abilityButton.title !== hint) { abilityButton.title = hint; abilityButton.setAttribute('aria-label', hint); }
  const display = rabbit ? String(Math.max(1, Math.ceil((multiplayer ? me.abilityUntil : rabbitUntil) - time))) : !ready ? String(Math.ceil(next - time)) : 'R';
  if (abilityButton.textContent !== display) abilityButton.textContent = display;
  sahur.updateHeld(active && ability === 'bat' && (ready || (throwAge >= 0 && throwAge < BAT_RELEASE)), time, throwAge);
  $('#crosshair').classList.toggle('bat-ready', active && ability === 'bat' && !abilityButton.disabled);
  const hiding = active && session.mode.pvp && myRole === 'killer' && session.elapsed < session.mode.hideTime;
  $('#seeker-cover').hidden = !hiding;
  $('#seeker-countdown').textContent = `${Math.ceil(session.mode.hideTime - session.elapsed)} секунд`;
  $('#round-status').textContent = remaining > 0 ? `ОГЛУШЕНИЕ · ${Math.ceil(remaining)} С` : session.mode.pvp ? `${myRole === 'killer' ? (session.mode.hide ? 'ТЫ ВОДЯЩИЙ · ЛОВИ НА E' : 'ТЫ УБИЙЦА · ЛОВИ НА E') : 'ТЫ ПРЯЧЕШЬСЯ / СПАСАЕШЬСЯ'}${session.elapsed < session.mode.hideTime ? ' · ФОРА ИГРОКАМ' : ''}` : rabbit ? 'ЗАЯЦ · ПРИМАНКИ АКТИВНЫ' : session.mode.hunt ? 'ДОГОНИ МОНСТРА И НАЖМИ E' : '';
}

function setMenuCamera() {
  camera.position.set(world.spawn.x + 12, world.groundAt(world.spawn.x + 12, world.spawn.z + 10) + 5, world.spawn.z + 10);
  camera.lookAt(world.spawn.x, world.groundAt(world.spawn.x, world.spawn.z + 30) + 1, world.spawn.z + 30);
  flashlight.visible = false;
}

$('#start').addEventListener('click', startGame);
$('#pause').addEventListener('click', pauseGame);
$('#resume').addEventListener('click', resumeGame);
$('#exit').addEventListener('click', showMenu);
$('#leave-spectator').addEventListener('click', showMenu);
$('#result-exit').addEventListener('click', showMenu);
$('#restart').addEventListener('click', () => {
  if (multiplayer) { audio.start(); requestImmersion(); network.send({ type: 'start', mode: roomState.mode }); }
  else startGame();
});
$('#sound').addEventListener('click', () => {
  const enabled = audio.toggle();
  $('#sound').setAttribute('aria-pressed', String(enabled));
  $('#sound').setAttribute('aria-label', enabled ? 'Выключить звук' : 'Включить звук');
  $('#sound').textContent = enabled ? '♪' : '×';
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

async function init() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    resize();
  } catch {
    throw new Error('Для игры нужен WebGL 2. Открой страницу в свежем Chrome для Android и включи аппаратное ускорение.');
  }
  controls = new Controls(canvas, {
    isPlaying: () => session.state === 'playing',
    onLook: (dx, dy) => { yaw -= dx; pitch = clamp(pitch - dy, -1.35, 1.35); },
    onPause: pauseGame, onCollect: collect, onFlashlight: toggleFlashlight,
    sensitivity: () => Number(sensitivity.value),
  });
  const forestGroup = new THREE.Group(); scene.add(forestGroup);
  await preloadModels();
  world = await loadWorld(forestGroup, (progress, status) => {
    $('#load-progress').style.width = `${Math.round(progress * 100)}%`;
    $('#load-status').textContent = status;
  });
  world.group = forestGroup; world.location = 'forest'; baseWorld = world;
  scene.attach(world.enemy);
  world.classicEnemy = world.enemy;
  monsterModels = new MonsterModels(scene, world.enemy);
  worlds.set('forest', world);
  fun = new FunExtras(scene, camera);
  activateLocation(locationSelect.value);
  if (world.scareUrl) {
    const image = new Image(); image.src = world.scareUrl;
    $('#jumpscare').style.backgroundImage = `url("${world.scareUrl}")`;
  }
  $('#start').disabled = false;
  $('#open-lan').disabled = false;
  $('#start-label').textContent = 'ИГРАТЬ ОДНОМУ';
  setMenuCamera();
  let lastFrame = performance.now(), lastRender = 0;
  renderer.setAnimationLoop((now) => {
    const interval = session.state === 'playing' ? (qualitySelect.value === 'low' ? 1000 / 30 : 1000 / 60) : 1000 / 12;
    if (now - lastRender < interval) return;
    const dt = Math.min((now - lastFrame) / 1000, 0.08);
    lastFrame = now;
    lastRender = now;
    if (session.state === 'playing') update(dt, now);
    if (multiplayer) updateNetworkWorld(dt);
    if (networkScareUntil && now > networkScareUntil) { $('#jumpscare').hidden = true; networkScareUntil = 0; }
    if (session.state === 'lost' && lostAt && now - lostAt > 900) { lostAt = 0; finishGame(false); }
    if (now > toastUntil) $('#toast').classList.remove('visible');
    renderer.render(scene, camera);
  });

  // Explicit development-only hooks for browser integration tests, never production.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
    window.__gameTest = {
      modelStatus,
      modelSnapshot: () => ({ avatar: shop.model?.userData.assetSource || null, rabbit: fun.rabbit.userData.assetSource || null, chest: shop.caseOpening.chest?.userData.assetSource || null, lidAngle: shop.caseOpening.chest?.getObjectByName('Lid_Hinge')?.rotation.x ?? null, prize: shop.caseOpening.model?.userData.assetId || null, previewDrawCalls: shop.caseOpening.renderer?.info.render.calls || 0 }),
      roundSnapshot: () => ({ mode: session.mode.id, role: myRole, health: multiplayer ? roomState?.enemy.health : soloHealth, rabbit: rabbitActive(), decoys: multiplayer ? roomState?.decoys.length : localDecoys.length, enemyScale: world.enemy.scale.toArray(), playerScale: session.mode.playerScale, secrets: fun.bunnies.filter((egg) => egg.found).length, secretTotal: fun.bunnies.length }),
      openCaseWithRoll: (roll) => { const result = profile.openCase(() => roll); shop.render(); return result; },
      animateCaseWithRoll: (roll) => shop.caseOpening.begin(() => roll),
      sahurPreview: () => shop.model?.userData.assetId,
      sahurSnapshot: () => ({ throwAt: multiplayer ? meInRoom()?.throwAt : soloThrowAt, inFlight: sahur.shots.size, holdingBat: !!sahur.held?.visible, stunned: !!sahur.marker?.visible, stunnedFor: myStunRemaining(), enemyTilt: world.enemy.rotation.z, elapsed: session.elapsed }),
      setupSoloBatLane: (direction = Math.PI) => {
        if (multiplayer || activeLocation.id !== 'station') return;
        player.set(3, 0, -30); world.enemy.position.set(3, 0, -23);
        yaw = direction; pitch = 0; session.elapsed = Math.max(session.elapsed, session.mode.grace); updateCamera(0);
      },
      advanceSoloTime: (seconds) => { if (!multiplayer) session.elapsed += seconds; },
      teleportToEnemy: () => { player.copy(world.enemy.position); player.z += 1; player.y = world.groundAt(player.x, player.z); updateCamera(0); },
      pickupAudit: () => collectibles.map(({ id, group }) => ({ id, position: group.position.toArray(), free: world.isPickupPositionFree(group.position.x, group.position.z), walkable: world.canMove(group.position, group.position.x, group.position.z), extraClear: fun.bunnies.every((egg) => !egg.group.visible || distance2D(group.position, egg.group.position) >= 1.4) })),
      probeMovement: (from, to) => world.canMove({ x: from[0], y: world.groundAt(from[0], from[1]), z: from[1] }, to[0], to[1]),
      contentSnapshot: () => ({ location: activeLocation.id, monster: activeMonster.id, appearance: { ...profile.appearance }, coins: profile.coins, peerLooks: [...peers.players.values()].map((peer) => peer.group.userData.appearance), chatMessages: chat.messages.map(({ name, text }) => ({ name, text })), roomMatch: roomState?.matchId }),
      modeSnapshot: () => ({ mode: session.mode.id, pigVisible: fun.pig.visible, rabbitEnemy: world.enemy === fun.enemy, beacons: collectibles.some((item) => item.glow.visible), secrets: fun.bunnies.filter((bunny) => bunny.found).length, moon: moon.intensity }),
      teleportToRabbit: (id) => { player.copy(fun.bunnies[id].group.position); player.z += 2.4; player.y = world.groundAt(player.x, player.z); yaw = 0; pitch = -0.2; updateCamera(0); },
      snapshot: () => ({ state: session.state, collected: session.collected.size, elapsed: session.elapsed, stamina: session.stamina, player: player.toArray(), yaw, pitch, flashlight: flashlightOn, stick: { ...controls.joystick }, movement: controls.movement(), multiplayer, room: roomState?.code, connected: network.connected, peers: peers.players.size, enemy: world.enemy.position.toArray(), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, originalMeshes: Object.keys(world.data.meshes).length }),
      teleportToCollectible: (id) => { const item = collectibles[id]; player.copy(item.group.position); player.y = world.groundAt(player.x, player.z); updateCamera(0); updateNearest(); },
      catchPlayer,
    };
  }
  network.tryResume();
}
init().catch(showError);
