import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { resolve, sep, extname } from 'node:path';
import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { createPhysics } from '../src/physics.js';
import { Room, MAX_PLAYERS } from './room.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.bin': 'application/octet-stream', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' };
const PRIVATE_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const cleanName = (value) => typeof value === 'string' ? value.replace(/[\p{C}<>]/gu, '').trim().slice(0, 18) || 'Игрок' : 'Игрок';
const send = (socket, value) => { if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 256 * 1024) socket.send(JSON.stringify(value)); };

export async function createGameServer({ root = resolve('dist'), assets = resolve(root, 'assets'), publicOrigin = '', autoTick = true } = {}) {
  root = resolve(root);
  const data = JSON.parse(await readFile(resolve(assets, 'scene.json'), 'utf8'));
  const bytes = await readFile(resolve(assets, 'scene.bin'));
  const physics = createPhysics(data, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const rooms = new Map();
  const connections = new Map();
  function lanHosts() {
    try { return [...new Set(Object.values(networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal && PRIVATE_IP.test(i.address)).map((i) => i.address))]; } catch { return []; }
  }
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { response.writeHead(400); response.end(); return; }
    if (pathname === '/api/health' || pathname === '/api/info') {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ version: '0.2.0', protocol: 1, maxPlayers: MAX_PLAYERS, lanHosts: pathname === '/api/info' ? lanHosts() : undefined }));
      return;
    }
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (pathname.includes('\0') || (file !== root && !file.startsWith(root + sep))) { response.writeHead(403); response.end(); return; }
    try {
      const info = await stat(file);
      if (!info.isFile()) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
      response.setHeader('Content-Length', info.size);
      response.setHeader('Cache-Control', extname(file) === '.html' ? 'no-store' : 'public, max-age=300');
      if (request.method === 'HEAD') { response.end(); return; }
      createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws' || connections.size >= 48) { socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n'); return; }
    const origin = request.headers.origin;
    let validOrigin = !origin || origin === publicOrigin;
    try { const host = new URL(origin).hostname; validOrigin ||= host === 'localhost' || host === '[::1]' || (isIP(host) === 4 && PRIVATE_IP.test(host)); } catch { /* Invalid origins are rejected. */ }
    if (!validOrigin) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });
  function broadcast(room) {
    const events = room.events.splice(0);
    const snapshot = room.snapshot();
    for (const client of connections.values()) {
      if (client.room !== room) continue;
      events.forEach((event) => send(client.socket, event));
      send(client.socket, { ...snapshot, tvSignal: room.signalFor(client.id) });
    }
  }
  function leave(client, disconnected = false) {
    if (!client.room) return;
    const room = client.room;
    client.room = null;
    if (disconnected) room.disconnect(client.id);
    else room.remove(client.id);
    if (!room.players.size) rooms.delete(room.code);
    else broadcast(room);
  }
  wss.on('connection', (socket) => {
    const client = { id: randomUUID(), socket, room: null, rateStart: Date.now(), messages: 0, alive: true };
    connections.set(socket, client);
    send(socket, { type: 'hello', protocol: 1 });
    socket.on('pong', () => { client.alive = true; });
    socket.on('error', () => {});
    socket.on('message', (raw) => {
      if (Date.now() - client.rateStart > 1000) { client.messages = 0; client.rateStart = Date.now(); }
      if (++client.messages > 60) { socket.close(1008, 'Rate limit'); return; }
      try {
        const message = JSON.parse(raw.toString());
        if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Некорректное сообщение.');
        if (message.type === 'create' || message.type === 'join') {
          if (client.room) throw new Error('Сначала выйди из текущей комнаты.');
          let room;
          if (message.type === 'create') {
            if (rooms.size >= 12) throw new Error('Сервер заполнен. Попробуй позже.');
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let code;
            do { code = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join(''); } while (rooms.has(code));
            room = new Room(code, data, physics);
          } else {
            const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
            room = /^[A-Z2-9]{6}$/.test(code) ? rooms.get(code) : null;
            if (!room) throw new Error('Комната не найдена. Проверь код и Wi-Fi.');
          }
          const token = randomBytes(24).toString('hex');
          room.addPlayer(client.id, cleanName(message.name), token, message.autoPickup !== false, message.appearance);
          if (message.type === 'create') { room.setMode(client.id, message.mode); room.setWorld(client.id, message); }
          rooms.set(room.code, room);
          client.room = room;
          send(socket, { type: 'joined', code: room.code, yourId: client.id, token });
          send(socket, { type: 'chat-history', messages: room.chatHistory });
          broadcast(room);
        } else if (message.type === 'resume') {
          if (client.room) throw new Error('Соединение уже находится в комнате.');
          const room = rooms.get(message.code);
          if (!room || typeof message.token !== 'string') throw new Error('Комната больше не существует.');
          const player = room.resume(message.token);
          for (const other of connections.values()) {
            if (other !== client && other.room === room && other.id === player.id) { other.room = null; other.socket.close(1000, 'Session resumed'); }
          }
          client.id = player.id;
          client.room = room;
          send(socket, { type: 'joined', code: room.code, yourId: player.id, token: player.token });
          send(socket, { type: 'chat-history', messages: room.chatHistory });
          broadcast(room);
        } else if (message.type === 'leave') {
          leave(client);
          send(socket, { type: 'left' });
        } else if (message.type === 'emote') {
          if (client.room?.emitEmote(client.id, message.round)) broadcast(client.room);
        } else if (message.type === 'rescue') {
          if (client.room?.rescue(client.id, message.station, message.round, message.trapped)) broadcast(client.room);
          else send(socket, { type: 'error', message: 'Нет ответа. Проверь канал и подойди к экрану ближе.' });
        } else if (message.type === 'attack') {
          if (client.room?.attack(client.id)) broadcast(client.room);
        } else if (message.type === 'ability') {
          if (!client.room) throw new Error('Сначала войди в комнату.');
          client.room.activateAbility(client.id); broadcast(client.room);
        } else if (message.type === 'world') {
          if (!client.room) throw new Error('Сначала войди в комнату.');
          client.room.setWorld(client.id, message); broadcast(client.room);
        } else if (message.type === 'appearance') {
          if (!client.room) throw new Error('Сначала войди в комнату.');
          client.room.setAppearance(client.id, message.appearance); broadcast(client.room);
        } else if (message.type === 'chat') {
          if (!client.room) throw new Error('Сначала войди в комнату.');
          client.room.chat(client.id, message.text); broadcast(client.room);
        } else if (message.type === 'mode') {
          if (!client.room) throw new Error('Сначала войди в комнату.');
          client.room.setMode(client.id, message.mode);
          broadcast(client.room);
        } else if (message.type === 'start') {
          if (!client.room) throw new Error('Сначала войди в комнату.');
          client.room.start(client.id, message.mode, message);
          broadcast(client.room);
        } else if (message.type === 'input') {
          client.room?.setInput(client.id, message);
        } else if (message.type === 'collect') {
          if (client.room?.collect(client.id, message.id)) broadcast(client.room);
        } else throw new Error('Неизвестная команда.');
      } catch (error) { send(socket, { type: 'error', message: error.message }); }
    });
    socket.on('close', () => { leave(client, true); connections.delete(socket); });
  });
  let frame = 0;
  function tick(dt = 0.05) {
    frame++;
    for (const room of rooms.values()) {
      room.tick(dt);
      if (!room.players.size || (room.state === 'lobby' && Date.now() - room.createdAt > 30 * 60_000)) {
        for (const client of connections.values()) if (client.room === room) { send(client.socket, { type: 'expired' }); client.room = null; }
        rooms.delete(room.code);
      } else if (frame % 2 === 0) broadcast(room);
    }
  }
  const timer = autoTick ? setInterval(() => tick(), 50) : null;
  const heartbeat = setInterval(() => {
    for (const client of connections.values()) {
      if (!client.alive) client.socket.terminate();
      else { client.alive = false; client.socket.ping(); }
    }
  }, 15_000);
  heartbeat.unref();
  timer?.unref();
  return {
    server, rooms, physics, tick,
    async listen(port = 0, host = '0.0.0.0') {
      await new Promise((done, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); done(); }); });
      return server.address().port;
    },
    async close() {
      clearInterval(timer); clearInterval(heartbeat);
      for (const socket of connections.keys()) socket.terminate();
      await new Promise((done) => wss.close(done));
      if (server.listening) await new Promise((done) => server.close(done));
    },
  };
}
