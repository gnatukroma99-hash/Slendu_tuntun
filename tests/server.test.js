import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/app.js';

class Client {
  constructor(url) {
    this.socket = new WebSocket(url, { origin: 'http://127.0.0.1' });
    this.messages = []; this.waiters = [];
    this.socket.on('error', () => {});
    this.socket.on('message', (raw) => {
      const message = JSON.parse(raw);
      const i = this.waiters.findIndex((waiter) => waiter.match(message));
      if (i >= 0) { const waiter = this.waiters.splice(i, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(message); }
      else this.messages.push(message);
    });
  }
  next(type, predicate = () => true) {
    const match = (message) => message.type === type && predicate(message);
    const i = this.messages.findIndex(match);
    if (i >= 0) return Promise.resolve(this.messages.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve, timer: setTimeout(() => { this.waiters = this.waiters.filter((w) => w !== waiter); reject(new Error(`Timed out waiting for ${type}`)); }, 4000) };
      this.waiters.push(waiter);
    });
  }
  send(message) { this.socket.send(JSON.stringify(message)); }
}

async function setup(t) {
  const app = await createGameServer({ autoTick: false, publicOrigin: 'https://example.trycloudflare.com' });
  const port = await app.listen();
  const clients = [];
  t.after(async () => { clients.forEach((c) => c.socket.terminate()); await app.close(); });
  return {
    app, port,
    async client() { const c = new Client(`ws://127.0.0.1:${port}/ws`); clients.push(c); await c.next('hello'); return c; },
  };
}

test('HTTP server serves only release files, health and safe LAN connection information', async (t) => {
  const { port } = await setup(t);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
  assert.equal(health.version, '0.2.0'); assert.equal(health.maxPlayers, 4);
  assert.equal((await fetch(`http://127.0.0.1:${port}/package.json`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`, { method: 'POST' })).status, 405);
});

test('two real WebSocket clients join, start, share an atomic pickup and resume after disconnect', async (t) => {
  const { app, client } = await setup(t);
  const alice = await client(), bob = await client();
  alice.send({ type: 'create', name: 'Алиса' });
  const joined = await alice.next('joined');
  bob.send({ type: 'join', code: joined.code.toLowerCase(), name: 'Боб' });
  const bobJoined = await bob.next('joined');
  await alice.next('state', (s) => s.players.length === 2);
  bob.send({ type: 'start' }); assert.match((await bob.next('error')).message, /хозяин/);
  alice.send({ type: 'start' });
  const first = await alice.next('state', (s) => s.state === 'playing');
  const second = await bob.next('state', (s) => s.state === 'playing');
  assert.deepEqual(first.pickups, second.pickups);
  const room = app.rooms.get(joined.code);
  room.players.get(joined.yourId).position = { ...room.pickups[0] };
  room.players.get(bobJoined.yourId).position = { ...room.pickups[0] };
  alice.send({ type: 'collect', id: 0 }); bob.send({ type: 'collect', id: 0 });
  await alice.next('state', (s) => s.collected.length === 1);
  await bob.next('state', (s) => s.collected.length === 1);
  assert.equal(room.collected.size, 1);
  alice.socket.close(); await once(alice.socket, 'close');
  await bob.next('state', (s) => s.players.some((p) => p.id === joined.yourId && !p.connected));
  const resumed = await client(); resumed.send({ type: 'resume', code: joined.code, token: joined.token });
  assert.equal((await resumed.next('joined')).yourId, joined.yourId);
  const snapshot = await resumed.next('state');
  assert.equal(snapshot.collected.length, 1);
  assert.ok(snapshot.players.every((p) => !('token' in p)));
});

test('malformed input is rejected without taking down the game server', async (t) => {
  const { client } = await setup(t);
  const c = await client(); c.socket.send('{');
  assert.ok((await c.next('error')).message);
  c.send({ type: 'join', code: 'BAD', name: 'x' }); assert.match((await c.next('error')).message, /не найдена/);
  c.send({ type: 'create', name: '<script>\u0000Player' });
  await c.next('joined');
  const snapshot = await c.next('state');
  assert.equal(snapshot.players[0].name, 'scriptPlayer');
});

test('cross-site WebSocket requests from unapproved origins are rejected', async (t) => {
  const { port } = await setup(t);
  for (const origin of ['https://unapproved.example', 'https://192.168.0.1.attacker.example', 'https://10.attacker.example']) {
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
    socket.on('error', () => {});
    socket.on('open', () => { socket.terminate(); reject(new Error('Unapproved origin was accepted')); });
    socket.on('unexpected-response', (_, response) => { assert.equal(response.statusCode, 403); socket.terminate(); resolve(); });
  });
  }
});

test('oversized WebSocket messages are closed and do not crash the server', async (t) => {
  const { client, port } = await setup(t);
  const c = await client();
  const closed = once(c.socket, 'close'); c.socket.send('x'.repeat(6000));
  const [code] = await closed; assert.equal(code, 1009);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
});
