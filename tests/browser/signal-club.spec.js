import { test, expect } from '@playwright/test';
import { createGameServer } from '../../server/app.js';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

// Test on the real release, with two real sockets. Only the test-owned Room is
// driven directly to reproducibly place the monster and the surviving actor.
test('team signal, remote gestures, revival and PNG souvenir survive an entire round', async ({page,browser},info)=>{
  const app=await createGameServer({root:resolve(process.env.SIGNAL_TEST_DIST||'dist'),autoTick:false});
  const port=await app.listen(0,'127.0.0.1'), url=`http://127.0.0.1:${port}/`;
  const other=await browser.newContext(), guest=await other.newPage();
  const errors=[]; for(const p of [page,guest]) p.on('pageerror',(e)=>errors.push(e.message));
  try {
    for(const [p,skin,name] of [[page,'sahur-buff','Силач'],[guest,'hare','Заяц']]) {
      await p.addInitScript((skin)=>{localStorage.setItem('slendytubbies-profile',JSON.stringify({owned:[`skin:${skin}`],appearance:{skin,antenna:'none'}}));},skin);
      await p.goto(url); await expect(p.locator('#start')).toBeEnabled(); await p.locator('#open-lan').click(); await p.locator('#player-name').fill(name);
    }
    await page.locator('#create-room').click(); await expect(page.locator('#room-code')).toHaveText(/^[A-Z2-9]{6}$/);
    const code=await page.locator('#room-code').textContent(); await guest.locator('#join-code').fill(code); await guest.locator('#join-room').click();
    await expect(page.locator('#start-room')).toBeEnabled(); await page.locator('#start-room').click();
    const room=app.rooms.get(code); const [host,friend]=[...room.players.values()];
    await expect(page.locator('#emote-button')).toBeVisible();
    if(info.project.name==='desktop') await page.keyboard.press('KeyG'); else await page.locator('#emote-button').tap();
    await expect(page.locator('#emote-inset')).toBeVisible(); await expect(page.locator('#emote-inset strong')).toHaveText('Покажи бицепс');
    expect(room.snapshot().players.find((p)=>p.id===host.id).emote.kind).toBe('flex');
    room.elapsed=18; room.enemy={...room.enemy,...friend.position}; host.position.x+=5; app.tick(.05); app.tick(.05);
    await expect(guest.locator('#share-signal')).toBeVisible(); await guest.locator('#share-signal').click();
    await expect.poll(()=>room.chatHistory.at(-1)?.text).toContain('Мой сигнал на ТВ');
    const station=room.tv.stations.find(s=>s.id===room.tv.channel); host.position={x:station.x,y:station.y,z:station.z+.25}; room.enemy.x+=32;
    app.tick(.05); app.tick(.05);
    if(await page.locator('#pause-screen').isVisible()) await page.locator('#resume').click();
    await expect(page.locator('#collect')).toHaveAttribute('aria-label','Настроить телевизор · E');
    await page.evaluate(()=>document.querySelector('#collect').click());
    await expect(guest.locator('#spectator-banner')).toBeHidden(); expect(friend.alive).toBe(true); expect(room.tv.used).toBe(true);
    for(const pickup of room.pickups) { friend.position={...pickup}; room.collect(friend.id,pickup.id); }
    app.tick(.05); app.tick(.05);
    for (const p of [page,guest]) { await expect(p.locator('#save-photo')).toBeVisible(); await expect(p.locator('#team-photo')).toHaveAttribute('aria-label',/Силач — Мастер телеэфира.*Заяц — Молочник/); }
    const downloadPromise=page.waitForEvent('download'); await page.locator('#save-photo').click(); const download=await downloadPromise;
    const path=info.outputPath('team-round.png'); await download.saveAs(path); const png=await readFile(path);
    expect(png.subarray(1,4).toString()).toBe('PNG'); expect(png.readUInt32BE(16)).toBe(960); expect(png.readUInt32BE(20)).toBe(558); expect(png.length).toBeGreaterThan(12000);
    expect(errors).toEqual([]);
  } finally { await other.close(); await page.goto('about:blank'); await app.close(); }
});
