import * as THREE from 'three';
import { CASE_SKIN_ODDS, CATALOG } from './catalog.js';
import { makeAvatar, disposeModel } from './avatars.js';
import { CaseOpening } from './case-opening.js';

export class Shop {
  constructor(profile, onChange, soundEnabled = () => true) {
    this.profile = profile; this.onChange = onChange; this.opened = false;
    document.querySelectorAll('[data-open-shop]').forEach((button) => button.addEventListener('click', () => this.open()));
    document.querySelector('#close-shop').addEventListener('click', () => this.close());
    document.querySelector('#close-shop-bottom').addEventListener('click', () => this.close());
    this.caseOpening = new CaseOpening(profile, { onUpdate: () => this.render(), onEquip: (appearance) => { onChange(appearance); this.updateModel(); }, soundEnabled });
    const codeInput = document.querySelector('#skin-code'), codeResult = document.querySelector('#skin-code-result');
    document.querySelector('#skin-code-form').addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const added = profile.redeemSkinCode(codeInput.value);
        if (added) this.render();
        codeResult.textContent = added ? 'Код принят! Теперь можно выбрать любой скин и его вариации.' : 'Все скины и вариации уже открыты.';
        codeInput.value = '';
      } catch (error) { codeResult.textContent = error.message; }
    });
    document.querySelector('#open-case').addEventListener('click', () => this.caseOpening.begin());
    document.querySelector('#shop-items').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-item]'); if (!button) return;
      try {
        profile.choose(button.dataset.kind, button.dataset.item);
        document.querySelector('#shop-message').textContent = 'Надето! Друзья увидят этот образ в комнате.';
        onChange(profile.appearance); this.render(); this.updateModel();
      } catch (error) { document.querySelector('#shop-message').textContent = error.message; }
    });
  }

  render() {
    this.refreshWallet();
    const root = document.querySelector('#shop-items'); root.replaceChildren();
    for (const [kind, items] of Object.entries(CATALOG)) {
      const section = document.createElement('section');
      const title = document.createElement('h3'); title.textContent = { skin: 'СКИНЫ И ОБЛИКИ', antenna: 'АНТЕННА', hat: 'ШАПКА' }[kind]; section.append(title);
      const grid = document.createElement('div'); grid.className = 'shop-grid'; section.append(grid);
      for (const item of items) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.kind = kind; button.dataset.item = item.id;
        const equipped = this.profile.appearance[kind] === item.id;
        const owned = this.profile.owned.has(`${kind}:${item.id}`);
        button.setAttribute('aria-pressed', String(equipped));
        button.className = `shop-item${item.caseOnly || item.challenge ? ' legendary' : ''}${equipped ? ' equipped' : ''}`;
        if (item.abilityNote) button.title = item.challenge && !owned ? item.challenge : item.abilityNote;
        const name = document.createElement('span'); name.textContent = item.name;
        if (item.color) { const swatch = document.createElement('i'); swatch.className = 'skin-swatch'; swatch.style.backgroundColor = item.color; name.prepend(swatch); }
        const price = document.createElement('small'); price.textContent = equipped ? 'НАДЕТО' : owned ? 'НАДЕТЬ' : item.challenge ? item.challenge : item.caseOnly ? `ТОЛЬКО КЕЙС · ${CASE_SKIN_ODDS}` : `${item.price} МОНЕТ`;
        button.append(name, price); grid.append(button);
      }
      root.append(section);
    }
  }

  refreshWallet() { document.querySelectorAll('[data-coins]').forEach((element) => { element.textContent = String(this.profile.coins); }); }

  initPreview() {
    if (this.renderer) return;
    const canvas = document.querySelector('#skin-preview');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); this.renderer.setSize(280, 300, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#78918a', 2.4));
    const light = new THREE.DirectionalLight('#fff3db', 2); light.position.set(2, 3, 4); this.scene.add(light);
    this.camera = new THREE.PerspectiveCamera(38, 280 / 300, 0.1, 20); this.camera.position.set(0, 1.25, 4.2); this.camera.lookAt(0, 1.1, 0);
  }

  updateModel() {
    if (!this.renderer) return;
    if (this.model) { this.scene.remove(this.model); disposeModel(this.model); }
    this.model = makeAvatar(this.profile.appearance); this.scene.add(this.model);
  }

  open() {
    document.exitPointerLock?.(); this.opened = true;
    document.querySelector('#shop-screen').hidden = false; document.querySelector('#shop-message').textContent = '';
    document.querySelector('#skin-code-form').reset(); document.querySelector('#skin-code-result').textContent = '';
    this.render();
    try {
      this.initPreview(); this.updateModel();
      this.renderer.setAnimationLoop((time) => { this.model.rotation.y = Math.sin(time / 2500) * 0.7; this.renderer.render(this.scene, this.camera); });
    } catch { document.querySelector('#shop-message').textContent = '3D-примерка недоступна. Покупки и выбор образа работают.'; }
    document.querySelector('#close-shop').focus();
  }

  close() { this.opened = false; this.caseOpening.close({ restoreFocus: false }); this.renderer?.setAnimationLoop(null); document.querySelector('#shop-screen').hidden = true; }
}
