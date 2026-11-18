import { resolve } from 'node:path';
import { createGameServer } from './app.js';

const root = resolve(process.env.GAME_DIST || 'dist');
const app = await createGameServer({ root, publicOrigin: process.env.PUBLIC_ORIGIN || '' });
const port = await app.listen(Number(process.env.PORT || 4175));
console.log(`Slendytubbies Web 0.2 · HTTP + WebSocket · http://0.0.0.0:${port}`);
console.log(`Static release: ${root}`);
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
});
