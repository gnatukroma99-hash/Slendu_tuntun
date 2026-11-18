import * as THREE from 'three';
import { CASE_COMMON, CASE_COST, CASE_SKIN_ODDS, CATALOG } from './catalog.js';
import { makeAvatar, disposeModel } from './avatars.js';
import { cloneModel } from './asset-library.js';

const ICONS = { skin: '◉', antenna: '⌁', hat: '♜' };
const describe = (drop) => CATALOG[drop.kind].find((item) => item.id === drop.id);
const summary = (drop) => `${drop.legendary ? `ЛЕГЕНДАРНЫЙ · ${CASE_SKIN_ODDS}!` : 'ВЫПАЛО:'} ${describe(drop).name}${drop.duplicate ? ' — повтор, возвращено 50 монет.' : ' — добавлено в гардероб.'}`;

export class CaseOpening {
  constructor(profile, { onUpdate, onEquip, soundEnabled = () => true }) {
    this.profile = profile; this.onUpdate = onUpdate; this.onEquip = onEquip; this.soundEnabled = soundEnabled;
    this.view = document.querySelector('#case-opening');
    this.openButton = document.querySelector('#open-case');
    this.reel = document.querySelector('#case-reel');
    this.animations = []; this.pending = null; this.token = 0;
    document.querySelector('#case-skip').addEventListener('click', () => this.reveal());
    document.querySelector('#case-dismiss').addEventListener('click', () => this.close());
    document.querySelector('#case-done').addEventListener('click', () => this.close());
    document.querySelector('#case-equip').addEventListener('click', () => {
      if (!this.pending || this.view.dataset.phase !== 'revealed') return;
      profile.choose(this.pending.kind, this.pending.id); this.onEquip(profile.appearance); this.onUpdate(); this.close();
    });
    this.view.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const buttons = [...this.view.querySelectorAll('button')].filter((button) => !button.hidden && !button.disabled && button.getClientRects().length);
      if (!buttons.length) return;
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && !this.view.hidden) { event.preventDefault(); event.stopImmediatePropagation(); this.close(); }
    }, true);
  }

  begin(random = () => {
    const sample = new Uint32Array(1); globalThis.crypto.getRandomValues(sample); return sample[0] / 4294967296;
  }) {
    if (!this.view.hidden || this.pending) return false;
    let drop;
    try { drop = this.profile.openCase(random); }
    catch (error) { document.querySelector('#case-result').textContent = error.message; return false; }
    // Commit the outcome and debit exactly once BEFORE animation. Closing,
    // skipping, reloading or losing WebGL can neither lose nor reroll a prize.
    this.pending = drop; this.token++;
    this.onUpdate(); this.openButton.disabled = true;
    this.previousInert = document.querySelector('#shop-screen').inert;
    document.querySelector('#shop-screen').inert = true;
    document.querySelector('#case-opening-cost').textContent = `Потрачено ${CASE_COST} игровых монет`;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.view.dataset.phase = 'charging'; this.view.dataset.rarity = drop.legendary ? 'legendary' : 'normal';
    this.view.hidden = false;
    document.querySelector('#case-opening-result').hidden = true;
    document.querySelector('#case-opening-play').hidden = false;
    document.querySelector('#case-skip').hidden = false;
    document.querySelector('#case-opening-live').textContent = 'Кейс открыт. Награда сохранена, показываем анимацию.';
    document.querySelector('#case-result').textContent = 'Награда уже сохранена. Идёт открытие кейса…';
    document.querySelector('#case-opening-status').textContent = 'ОТКРЫВАЕМ ЗАМОК…';
    this.buildReel(); document.querySelector('#case-skip').focus(); this.cue('open');
    if (!this.reducedMotion) this.renderChest();
    const token = this.token;
    this.run(token).catch(() => { if (token === this.token && !this.view.hidden) this.reveal(); });
    return true;
  }

  buildReel() {
    this.reel.replaceChildren(); this.reel.style.transform = 'translate3d(0,0,0)';
    this.winningIndex = 18;
    for (let index = 0; index < 23; index++) {
      // Filler cards are only decoration, not additional rolls or fake rare
      // near-misses. The single precommitted prize is at the final marker.
      const drop = index === this.winningIndex ? this.pending : CASE_COMMON[index % CASE_COMMON.length];
      const item = describe(drop), card = document.createElement('div'); card.className = 'case-reel-card';
      card.dataset.winner = String(index === this.winningIndex);
      const icon = document.createElement('span'); icon.className = 'case-reel-icon'; icon.textContent = ICONS[drop.kind];
      if (item.color) icon.style.color = item.color;
      const name = document.createElement('span'); name.textContent = item.name; card.append(icon, name); this.reel.append(card);
    }
  }

  async play(element, frames, options, token) {
    if (token !== this.token || this.view.hidden) return false;
    const animation = element.animate(frames, options); this.animations.push(animation);
    try { await animation.finished; } catch { return false; }
    return token === this.token && !this.view.hidden;
  }

  async run(token) {
    if (this.reducedMotion) { this.reveal(); return; }
    const chest = document.querySelector('#case-chest');
    const base = getComputedStyle(chest).transform;
    const transform = (value) => `${base === 'none' ? '' : base} ${value}`;
    if (!await this.play(chest, [
      { transform: transform('rotate(-2deg) translateY(0)') }, { transform: transform('rotate(3deg) translateY(-5px)'), offset: 0.25 },
      { transform: transform('rotate(-4deg) translateY(0)'), offset: 0.5 }, { transform: transform('rotate(3deg) translateY(-3px)'), offset: 0.75 },
      { transform: transform('rotate(0deg) translateY(0)') },
    ], { duration: 650, easing: 'ease-in-out' }, token)) return;
    this.view.dataset.phase = 'opening'; this.lidStarted = performance.now(); this.cue('unlock');
    document.querySelector('#case-opening-status').textContent = 'СМОТРИМ, ЧТО ВНУТРИ…';
    if (!await this.play(document.querySelector('#case-lid'), [{ transform: 'rotateX(0)' }, { transform: 'rotateX(-115deg)' }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }, token)) return;
    this.view.dataset.phase = 'rolling';
    const windowWidth = document.querySelector('#case-reel-window').clientWidth;
    const width = this.reel.firstElementChild.getBoundingClientRect().width;
    const gap = Number.parseFloat(getComputedStyle(this.reel).gap) || 12;
    const end = windowWidth / 2 - width / 2 - this.winningIndex * (width + gap);
    if (!await this.play(this.reel, [{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${end}px,0,0)` }], { duration: 2250, easing: 'cubic-bezier(.12,.72,.12,1)', fill: 'forwards' }, token)) return;
    this.reveal();
  }

  cancelAnimations() { for (const animation of this.animations) animation.cancel(); this.animations = []; }

  reveal() {
    if (!this.pending || this.view.hidden || this.view.dataset.phase === 'revealed') return;
    this.token++; this.cancelAnimations(); this.view.dataset.phase = 'revealed';
    const drop = this.pending, item = describe(drop);
    document.querySelector('#case-opening-play').hidden = true;
    document.querySelector('#case-opening-result').hidden = false;
    document.querySelector('#case-skip').hidden = true;
    document.querySelector('#case-prize-rarity').textContent = drop.legendary ? `ЛЕГЕНДАРНЫЙ · ШАНС ${CASE_SKIN_ODDS}` : 'НОВЫЙ ПРЕДМЕТ';
    if (drop.duplicate && !drop.legendary) document.querySelector('#case-prize-rarity').textContent = 'ПОВТОР ПРЕДМЕТА';
    document.querySelector('#case-prize-name').textContent = item.name;
    document.querySelector('#case-prize-note').textContent = drop.duplicate ? 'Уже есть в гардеробе. Возвращено 50 монет.' : item.abilityNote ? `Способность R: ${item.abilityNote}` : 'Уже сохранён в твоём гардеробе.';
    document.querySelector('#case-equip').textContent = 'НАДЕТЬ ПРЕДМЕТ';
    document.querySelector('#case-result').textContent = summary(drop);
    document.querySelector('#case-opening-live').textContent = summary(drop);
    this.renderPrize(drop); this.cue(drop.legendary ? 'legendary' : 'reveal');
    document.querySelector('#case-equip').focus();
  }

  initRenderer() {
    const canvas = document.querySelector('#case-prize-preview');
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); this.renderer.setSize(320, 220, false); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.scene = new THREE.Scene(); this.scene.add(new THREE.HemisphereLight('#ffffff', '#668279', 2.2));
      const light = new THREE.DirectionalLight('#ffe5bd', 2); light.position.set(2, 3, 4); this.scene.add(light);
      this.camera = new THREE.PerspectiveCamera(36, 320 / 220, 0.1, 15);
    }
    return canvas;
  }

  mountModel(model, stage, width, height) {
    const canvas = this.initRenderer();
    this.renderer.setAnimationLoop(null);
    if (this.model) { this.scene.remove(this.model); disposeModel(this.model); }
    this.model = model; this.scene.add(model); stage.append(canvas); canvas.hidden = false;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    return canvas;
  }

  renderChest() {
    const stage = document.querySelector('#case-model-stage'), fallback = document.querySelector('#case-chest');
    stage.hidden = true; fallback.hidden = false; this.chest = null;
    try {
      const model = cloneModel('case');
      if (!model) return;
      this.mountModel(model, stage, 400, 180); this.chest = model;
      this.camera.position.set(1.65, 1.35, 2.65); this.camera.lookAt(0, 0.52, 0);
      stage.hidden = false; fallback.hidden = true;
      this.renderer.setAnimationLoop((time) => {
        const opening = this.view.dataset.phase === 'opening';
        const progress = this.view.dataset.phase === 'rolling' ? 1 : opening ? Math.min(1, Math.max(0, (time - this.lidStarted) / 480)) : 0;
        model.getObjectByName('Lid_Hinge').rotation.x = -1.88 * (1 - (1 - progress) ** 3);
        model.rotation.z = this.view.dataset.phase === 'charging' ? Math.sin(time / 37) * 0.025 : 0;
        this.renderer.render(this.scene, this.camera);
      });
    } catch { this.renderer?.setAnimationLoop(null); stage.hidden = true; fallback.hidden = false; }
  }

  renderPrize(drop) {
    const canvas = document.querySelector('#case-prize-preview');
    this.renderer?.setAnimationLoop(null); this.chest = null;
    try {
      const appearance = { ...this.profile.appearance, [drop.kind]: drop.id };
      if (drop.kind === 'antenna') appearance.hat = 'none';
      this.mountModel(makeAvatar(appearance), document.querySelector('#case-prize-stage'), 320, 220);
      if (drop.kind !== 'skin') this.model.children.forEach((part) => { if (part.position.y < 1.2) part.visible = false; });
      this.camera.position.set(0, drop.kind === 'skin' ? 1.2 : 1.75, drop.kind === 'skin' ? 4.1 : 2.5);
      this.camera.lookAt(0, drop.kind === 'skin' ? 1.15 : 1.7, 0);
      canvas.hidden = false; document.querySelector('#case-prize-fallback').hidden = true;
      this.renderer.render(this.scene, this.camera);
      if (!this.reducedMotion) this.renderer.setAnimationLoop((time) => { this.model.rotation.y = Math.sin(time / 1600) * 0.45; this.renderer.render(this.scene, this.camera); });
    } catch { canvas.hidden = true; document.querySelector('#case-prize-fallback').hidden = false; document.querySelector('#case-prize-fallback').textContent = ICONS[drop.kind]; }
  }

  cue(stage) {
    if (!this.soundEnabled()) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) return;
      this.sound ||= new AudioContext(); this.sound.resume().catch(() => {});
      const notes = stage === 'legendary' ? [440, 554, 659, 880] : stage === 'reveal' ? [440, 660] : stage === 'unlock' ? [260, 390] : [140];
      notes.forEach((frequency, index) => {
        const oscillator = this.sound.createOscillator(), gain = this.sound.createGain(), start = this.sound.currentTime + index * 0.075;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(0.035, start + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
        oscillator.connect(gain).connect(this.sound.destination); oscillator.start(start); oscillator.stop(start + 0.26);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Audio is optional; it never changes or repeats the roll. */ }
  }

  close({ restoreFocus = true } = {}) {
    if (this.view.hidden && !this.pending) return;
    if (this.pending) document.querySelector('#case-result').textContent = summary(this.pending);
    this.token++; this.cancelAnimations(); this.renderer?.setAnimationLoop(null); this.sound?.suspend().catch(() => {});
    if (this.model) { this.scene.remove(this.model); disposeModel(this.model); this.model = null; }
    this.chest = null;
    this.pending = null; this.view.hidden = true; this.view.dataset.phase = 'closed'; this.openButton.disabled = false;
    document.querySelector('#shop-screen').inert = Boolean(this.previousInert);
    if (restoreFocus && !document.querySelector('#shop-screen').hidden) this.openButton.focus();
  }
}
