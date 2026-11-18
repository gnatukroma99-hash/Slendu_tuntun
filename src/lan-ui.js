import { MODES, getMode } from './modes.js';
import { LOCATIONS, getLocation } from './locations.js';
import { MONSTERS, monsterChoice } from './monsters.js';
const $ = (selector) => document.querySelector(selector);

export class LanMenu {
  constructor(client, { onGesture, onStart, onLeave, autoPickup, appearance }) {
    this.client = client;
    this.appearance = appearance;
    for (const location of Object.values(LOCATIONS)) $('#room-location').add(new Option(location.title, location.id));
    $('#room-monster').add(new Option('По карте', 'auto'));
    for (const monster of Object.values(MONSTERS)) $('#room-monster').add(new Option(monster.title, monster.id));
    for (const selector of ['#room-location', '#room-monster']) $(selector).addEventListener('change', () => client.send({ type: 'world', location: $('#room-location').value, monster: $('#room-monster').value }));
    for (const mode of Object.values(MODES)) $('#room-mode').add(new Option(mode.title, mode.id));
    $('#room-mode').addEventListener('change', () => {
      $('#room-mode-description').textContent = getMode($('#room-mode').value).description;
      client.send({ type: 'mode', mode: $('#room-mode').value });
    });
    $('#open-lan').addEventListener('click', () => this.open());
    $('#lan-back').addEventListener('click', () => { this.hide(); onLeave(); });
    $('#leave-room').addEventListener('click', onLeave);
    $('#create-room').addEventListener('click', () => this.enter('create', onGesture, autoPickup));
    $('#join-room').addEventListener('click', () => this.enter('join', onGesture, autoPickup));
    $('#start-room').addEventListener('click', () => { onStart(); client.send({ type: 'start', mode: $('#room-mode').value, location: $('#room-location').value, monster: $('#room-monster').value }); });
    $('#join-code').addEventListener('input', () => { $('#join-code').value = $('#join-code').value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6); });
    $('#copy-invite').addEventListener('click', async () => {
      const input = $('#invite-url');
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(input.value);
        else { input.focus(); input.select(); if (!document.execCommand('copy')) throw new Error(); }
        this.error('Ссылка скопирована. Отправь её другу.');
      } catch { input.focus(); input.select(); this.error('Удерживай ссылку и выбери «Копировать».'); }
    });
    $('#join-code').value = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
    try { $('#player-name').value = localStorage.getItem('slendytubbies-player-name') || ''; } catch { /* Optional. */ }
  }

  async open() {
    $('#lan-screen').hidden = false;
    $('#lan-setup').hidden = Boolean(this.client.membership);
    $('#room-lobby').hidden = !this.client.membership;
    try {
      const response = await fetch('/api/info');
      if (!response.ok) throw new Error();
      const info = await response.json();
      $('#lan-addresses').textContent = info.lanHosts.length ? `По одному Wi-Fi: ${info.lanHosts.map((host) => `http://${host}:${location.port || (location.protocol === 'https:' ? '4175' : '80')}`).join(' или ')} — затем тот же код комнаты.` : 'Откройте игру на адресе сервера в одной сети Wi-Fi и введите одинаковый код комнаты.';
    } catch { $('#lan-addresses').textContent = 'Для кооператива нужен запущенный сервер игры. Обычный статический хостинг поддерживает только одиночную игру.'; }
  }

  async enter(type, onGesture, autoPickup) {
    if (type === 'join' && $('#join-code').value.length !== 6) { this.error('Введи 6 символов кода комнаты.'); return; }
    onGesture();
    const name = $('#player-name').value.trim().slice(0, 18) || 'Игрок';
    try { localStorage.setItem('slendytubbies-player-name', name); } catch { /* Optional. */ }
    $('#create-room').disabled = $('#join-room').disabled = true;
    this.error('Подключение…');
    try { await this.client.enter(type, name, $('#join-code').value, autoPickup(), $('#game-mode').value, { location: $('#game-location').value, monster: $('#game-monster').value, appearance: this.appearance() }); }
    catch (error) { this.error(error.message); }
    finally { $('#create-room').disabled = $('#join-room').disabled = false; }
  }

  render(state) {
    const me = this.client.membership?.yourId;
    $('#room-code').textContent = state.code;
    $('#invite-url').value = `${location.origin}/?room=${state.code}`;
    const list = $('#room-players'); list.replaceChildren();
    for (const player of state.players) {
      const row = document.createElement('li');
      const name = document.createElement('span'); name.textContent = `${player.name}${player.id === me ? ' (ты)' : ''}`;
      const role = document.createElement('span'); role.textContent = !player.connected ? 'ПЕРЕПОДКЛЮЧЕНИЕ' : player.id === state.hostId ? 'ХОЗЯИН' : 'ГОТОВ';
      row.append(name, role); list.append(row);
    }
    const host = state.hostId === me;
    $('#room-location').disabled = $('#room-monster').disabled = !host;
    $('#room-location').value = getLocation(state.location).id;
    $('#room-monster').value = monsterChoice(state.monster);
    $('#room-mode').disabled = !host;
    $('#room-mode').value = getMode(state.mode).id;
    $('#room-mode-description').textContent = getMode(state.mode).description;
    $('#start-room').disabled = !host || state.players.filter((p) => p.connected).length < 2;
    $('#start-room').textContent = host ? 'НАЧАТЬ ОБЩИЙ РАУНД →' : 'ЖДЁМ НАЧАЛА ОТ ХОЗЯИНА';
    $('#lan-setup').hidden = true;
    $('#room-lobby').hidden = false;
    if (state.state === 'lobby') $('#lan-screen').hidden = false;
    else this.hide();
    $('#network-status').textContent = `${state.code} · ${state.players.filter((p) => p.connected).length}/4 · ${getLocation(state.location).title}`;
  }

  hide() { $('#lan-screen').hidden = true; }
  error(text) { $('#lan-message').textContent = text; }
}
