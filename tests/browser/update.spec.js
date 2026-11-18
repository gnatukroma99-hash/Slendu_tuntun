import { test, expect, devices } from '@playwright/test';

async function ready(page) {
  await page.goto('/?test=1');
  await expect(page.locator('#start')).toBeEnabled();
  await page.waitForFunction(() => window.__gameTest?.snapshot().drawCalls > 0);
  await expect(page.locator('#error-screen')).toBeHidden();
}

async function sprintTouches(page, context) {
  const joystick = await page.locator('#joystick').boundingBox();
  const sprint = await page.locator('#sprint').boundingBox();
  const a = { id: 1, x: joystick.x + joystick.width / 2, y: joystick.y + joystick.height / 2 };
  const b = { id: 2, x: sprint.x + sprint.width / 2, y: sprint.y + sprint.height / 2 };
  const moved = { ...a, y: a.y - 20 };
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [moved, b] });
  await expect.poll(() => page.evaluate(() => window.__gameTest.snapshot().movement.sprint)).toBe(true);
  return { cdp, points: [moved, b] };
}

test('Android automatically picks up custard while two fingers keep running', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, 'Android multi-touch regression');
  await ready(page); await page.locator('#start').tap();
  const { cdp } = await sprintTouches(page, context);
  await expect.poll(() => page.evaluate(() => window.__gameTest.snapshot().collected)).toBe(1);
  const state = await page.evaluate(() => window.__gameTest.snapshot());
  expect(state.movement.sprint).toBe(true); expect(state.stick.y).toBeLessThan(-0.3); expect(state.stamina).toBeLessThan(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await cdp.detach();
});

test('manual pickup works on a third non-primary touch without releasing sprint or joystick', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, 'Android multi-touch regression');
  await ready(page); await page.locator('#auto-pickup').uncheck(); await page.locator('#start').tap();
  const { cdp, points } = await sprintTouches(page, context);
  expect(await page.evaluate(() => window.__gameTest.snapshot().collected)).toBe(0);
  const collect = await page.locator('#collect').boundingBox();
  const third = { id: 3, x: collect.x + collect.width / 2, y: collect.y + collect.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...points, third] });
  await expect.poll(() => page.evaluate(() => window.__gameTest.snapshot().collected)).toBe(1);
  const state = await page.evaluate(() => window.__gameTest.snapshot());
  expect(state.movement.sprint).toBe(true); expect(state.movement.collect).toBe(true); expect(state.stick.y).toBeLessThan(-0.3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  expect(await page.evaluate(() => window.__gameTest.snapshot().movement.collect)).toBe(false);
  await cdp.detach();
});

test('two Android browsers join one room, share a pickup, and leaving removes only that player', async ({ page, browser, isMobile }) => {
  test.skip(!isMobile, 'Cooperative Android integration');
  test.setTimeout(140_000);
  const guestContext = await browser.newContext({ ...devices['Pixel 7 landscape'], deviceScaleFactor: 1, baseURL: 'http://127.0.0.1:4173' });
  try {
    const guest = await guestContext.newPage();
    await ready(page); await ready(guest);
    await page.locator('#open-lan').tap(); await page.locator('#player-name').fill('Лиса'); await page.locator('#create-room').tap();
    await expect(page.locator('#room-code')).toHaveText(/^[A-Z2-9]{6}$/);
    const code = await page.locator('#room-code').textContent();
    await guest.locator('#open-lan').tap(); await guest.locator('#player-name').fill('Волк'); await guest.locator('#join-code').fill(code); await guest.locator('#join-room').tap();
    await expect(page.locator('#room-players li')).toHaveCount(2);
    await expect(page.locator('#start-room')).toBeEnabled();
    await page.locator('#start-room').tap();
    await expect(page.locator('#hud')).toBeVisible(); await expect(guest.locator('#hud')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__gameTest.snapshot().peers)).toBe(1);
    await expect.poll(() => guest.evaluate(() => window.__gameTest.snapshot().peers)).toBe(1);
    expect((await guest.evaluate(() => window.__gameTest.snapshot())).room).toBe(code);
    if (await page.locator('#pause-screen').isVisible()) await page.locator('#resume').tap();
    await page.locator('#collect').tap();
    await expect(page.locator('#collected')).toHaveText('01'); await expect(guest.locator('#collected')).toHaveText('01');
    await guest.reload();
    await guest.waitForFunction(() => window.__gameTest?.snapshot().connected, null, { timeout: 30_000 });
    await expect(guest.locator('#collected')).toHaveText('01');
    await expect.poll(() => guest.evaluate(() => window.__gameTest.snapshot().peers)).toBe(1);
    await page.screenshot({ path: test.info().outputPath('coop.png') });
    // The authoritative world keeps running during reload/screenshots. On slow
    // software graphics the pursuer may already have caught the idle team.
    await page.locator('#result-exit:visible, #leave-spectator:visible, #exit:visible, body:has(#pause-screen[hidden]) #pause:enabled:visible').first().tap();
    if (!(await page.locator('#menu').isVisible())) await page.locator('#exit:visible, #result-exit:visible, #leave-spectator:visible').first().tap();
    await expect(page.locator('#menu')).toBeVisible();
    await expect.poll(() => guest.evaluate(() => window.__gameTest.snapshot().peers)).toBe(0);
    expect((await guest.evaluate(() => window.__gameTest.snapshot())).connected).toBe(true);
  } finally { await guestContext.close(); }
});

test('solo games in different browsers remain independent and do not require a room', async ({ page, browser, isMobile }) => {
  test.skip(!isMobile, 'Public solo independence');
  test.setTimeout(120_000);
  const otherContext = await browser.newContext({ ...devices['Pixel 7 landscape'], deviceScaleFactor: 1, baseURL: 'http://127.0.0.1:4173' });
  try {
    const other = await otherContext.newPage(); await ready(page); await ready(other);
    await page.locator('#start').tap(); await other.locator('#start').tap();
    if (await page.locator('#pause-screen').isVisible()) await page.locator('#resume').tap();
    await page.locator('#collect').tap();
    await expect(page.locator('#collected')).toHaveText('01');
    await expect(other.locator('#collected')).toHaveText('00');
    expect((await page.evaluate(() => window.__gameTest.snapshot())).multiplayer).toBe(false);
    expect((await other.evaluate(() => window.__gameTest.snapshot())).multiplayer).toBe(false);
  } finally { await otherContext.close(); }
});
