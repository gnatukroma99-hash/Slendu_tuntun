const STORAGE_KEY = 'slendytubbies-room-session';

export class LanClient {
  constructor({ onState, onEvent, onStatus, onError, onJoined, onEnded }) {
    Object.assign(this, { onState, onEvent, onStatus, onError, onJoined, onEnded });
    this.socket = null;
    this.membership = null;
    this.seq = 0;
    this.intentional = false;
    this.connected = false;
    this.retryCount = 0;
  }

  save() {
    try {
      if (this.membership) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.membership));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* Session persistence is optional. */ }
  }

  tryResume() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && /^[A-Z2-9]{6}$/.test(saved.code) && typeof saved.token === 'string') {
        this.membership = saved;
        this.reconnect();
      }
    } catch { /* Ignore invalid or unavailable storage. */ }
  }

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.openPromise) return this.openPromise;
    this.intentional = false;
    this.onStatus('connecting');
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    this.socket = socket;
    this.openPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('Сервер не отвечает. Проверь Wi-Fi.')); socket.close(); }, 8000);
      socket.onopen = () => { clearTimeout(timeout); this.openPromise = null; resolve(); };
      socket.onerror = () => { clearTimeout(timeout); this.openPromise = null; reject(new Error('Не удалось подключиться к серверу игры.')); };
      socket.onclose = (event) => {
        clearTimeout(timeout);
        this.openPromise = null;
        reject(new Error('Соединение закрыто.'));
        if (this.socket !== socket) return;
        this.connected = false;
        if (event.code === 1000 && event.reason === 'Session resumed') {
          this.leave(); this.onEnded('Эта игровая сессия открыта в другой вкладке.'); return;
        }
        if (!this.intentional && this.membership) this.reconnect();
        else this.onStatus('offline');
      };
      socket.onmessage = (event) => {
        if (this.socket !== socket) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'joined') {
          this.membership = { code: message.code, token: message.token, yourId: message.yourId };
          this.save();
          this.connected = true;
          this.resuming = false;
          this.retryCount = 0;
          this.retryStarted = null;
          this.onStatus('connected');
          this.onJoined(message);
        } else if (message.type === 'state' && message.protocol === 1 && message.code === this.membership?.code) {
          const me = message.players.find((player) => player.id === this.membership.yourId);
          this.seq = Math.max(this.seq, me?.seq ?? 0);
          this.onState(message);
        } else if (['pickup', 'caught', 'chat', 'chat-history', 'hit', 'ability', 'bat-impact', 'rescue'].includes(message.type)) this.onEvent(message);
        else if (message.type === 'error') {
          if (this.resuming) { this.leave(); this.onEnded(message.message); }
          this.onError(message.message);
        } else if (message.type === 'expired') { this.leave(); this.onEnded('Комната закрыта из-за долгого ожидания.'); }
      };
    });
    return this.openPromise;
  }

  reconnect() {
    if (!this.membership || this.intentional || this.retryTimer) return;
    this.retryStarted ||= Date.now();
    if (Date.now() - this.retryStarted > 30_000) { this.leave(); this.onEnded('Не удалось восстановить связь. Войди в комнату заново.'); return; }
    this.onStatus('reconnecting');
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      try {
        await this.connect();
        if (this.membership) { this.resuming = true; this.send({ type: 'resume', ...this.membership }); }
      } catch { this.reconnect(); }
    }, Math.min(500 * 2 ** this.retryCount++, 3000));
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 65536) this.socket.send(JSON.stringify(message));
  }

  async enter(type, name, code, autoPickup, mode, options = {}) {
    await this.connect();
    this.send({ type, name, code, autoPickup, mode, ...options });
  }

  input(movement, yaw, pitch, flashlight, autoPickup) {
    if (!this.connected) return;
    this.send({ type: 'input', seq: ++this.seq, x: movement.x, y: movement.y, sprint: movement.sprint, yaw, pitch, flashlight, autoPickup });
  }

  leave() {
    this.intentional = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.send({ type: 'leave' });
    this.membership = null;
    this.connected = false;
    this.resuming = false;
    this.retryStarted = null;
    this.save();
    this.socket?.close(1000, 'Left room');
    this.socket = null;
  }
}
