import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, isMobile }) => {
  page.gameErrors = [];
  page.on('pageerror', (error) => page.gameErrors.push(error.message));
  if (process.env.HEADLESS_MESA && !isMobile) {
    // Native pointer lock can stall CDP keyboard events on ARM PRoot/Mesa.
    // Exercise the supported mouse-drag fallback in that test environment.
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new Error('Pointer lock unavailable in this test environment'));
    });
  }
  await page.goto('/?test=1');
  await expect(page.locator('#start')).toBeEnabled();
  await page.waitForFunction(() => window.__gameTest?.snapshot().drawCalls > 0);
  await expect(page.locator('#error-screen')).toBeHidden();
});

test.afterEach(async ({ page }) => {
  expect(page.gameErrors).toEqual([]);
  await expect(page.locator('#error-screen')).toBeHidden();
});

test('original scene loads and menu has no overflow or JavaScript failures', async ({ page, isMobile }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('h1')).toContainText('SLENDY');
  const status = await page.evaluate(() => window.__gameTest.snapshot());
  expect(status.originalMeshes).toBeGreaterThan(50);
  await page.screenshot({ path: test.info().outputPath('menu.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  if (isMobile) expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
});

test('movement, flashlight, pause, resume and menu work', async ({ page, isMobile }) => {
  await page.locator('#quality').selectOption('low');
  await page.locator('#start').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__gameTest.snapshot().state)).toBe('playing');
  const before = await page.evaluate(() => window.__gameTest.snapshot());
  await page.keyboard.down('KeyW');
  await expect.poll(async () => {
    const after = await page.evaluate(() => window.__gameTest.snapshot());
    return Math.hypot(after.player[0] - before.player[0], after.player[2] - before.player[2]);
  }).toBeGreaterThan(0.3);
  await page.keyboard.up('KeyW');
  if (!isMobile && process.env.HEADLESS_MESA) {
    const yaw = await page.evaluate(() => window.__gameTest.snapshot().yaw);
    await page.mouse.move(700, 350);
    await page.mouse.down();
    await page.mouse.move(750, 350);
    await page.mouse.up();
    expect(await page.evaluate(() => window.__gameTest.snapshot().yaw)).not.toBe(yaw);
  }
  if (isMobile) await page.locator('#flashlight').tap();
  else await page.keyboard.press('KeyF');
  expect(await page.evaluate(() => window.__gameTest.snapshot().flashlight)).toBe(false);
  await page.screenshot({ path: test.info().outputPath('playing.png') });
  if (isMobile) await page.locator('#pause').tap();
  else await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
  const paused = await page.evaluate(() => window.__gameTest.snapshot());
  // Polling UI visibility permits a frame to pass without synthetic sleeps.
  await expect(page.locator('#resume')).toBeVisible();
  expect((await page.evaluate(() => window.__gameTest.snapshot())).elapsed).toBe(paused.elapsed);
  await page.locator('#resume').click();
  await expect(page.locator('#pause-screen')).toBeHidden();
  if (isMobile) await page.locator('#pause').tap();
  else await page.keyboard.press('Escape');
  await page.locator('#exit').click();
  await expect(page.locator('#menu')).toBeVisible();
  expect((await page.evaluate(() => window.__gameTest.snapshot())).state).toBe('menu');
});

test('all ten original pickups lead to victory, loss and restart reset the run', async ({ page }) => {
  await page.locator('#start').click();
  // Teleports are a test shortcut, not player movement. Keep them in one frame
  // so a random pickup at the enemy spawn cannot produce an unrelated loss.
  await page.evaluate(() => {
    for (let id = 0; id < 10; id++) {
      window.__gameTest.teleportToCollectible(id);
      document.querySelector('#collect').click();
    }
  });
  await expect(page.locator('#result-title')).toHaveText('Ты выбрался.');
  expect((await page.evaluate(() => window.__gameTest.snapshot())).collected).toBe(10);
  await page.locator('#restart').click();
  expect((await page.evaluate(() => window.__gameTest.snapshot())).collected).toBe(0);
  await page.evaluate(() => window.__gameTest.catchPlayer());
  await expect(page.locator('#result-title')).toHaveText('Он нашёл тебя.');
  await page.locator('#restart').click();
  const fresh = await page.evaluate(() => window.__gameTest.snapshot());
  expect(fresh.state).toBe('playing');
  expect(fresh.stamina).toBe(1);
  expect(fresh.collected).toBe(0);
});

test('Android supports simultaneous movement and look, pointer cancellation stops movement', async ({ page, isMobile, context }) => {
  test.skip(!isMobile, 'Touch-only integration test');
  await page.locator('#start').tap();
  await expect(page.locator('#joystick')).toBeVisible();
  const stick = await page.locator('#joystick').boundingBox();
  const size = page.viewportSize();
  const a = { id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
  const b = { id: 2, x: size.width * 0.7, y: size.height * 0.45 };
  const cdp = await context.newCDPSession(page);
  const before = await page.evaluate(() => window.__gameTest.snapshot());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...a, y: a.y - 34 }, { ...b, x: b.x + 60 }] });
  await expect.poll(() => page.evaluate(() => window.__gameTest.snapshot().stick.y)).toBeLessThan(-0.5);
  await expect.poll(() => page.evaluate(() => window.__gameTest.snapshot().yaw)).not.toBe(before.yaw);
  await expect.poll(async () => {
    const after = await page.evaluate(() => window.__gameTest.snapshot());
    return Math.hypot(after.player[0] - before.player[0], after.player[2] - before.player[2]);
  }).toBeGreaterThan(0.15);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__gameTest.snapshot().stick.y)).toBe(0);
  expect(await page.evaluate(() => window.__gameTest.snapshot().stick.x)).toBe(0);
  await cdp.detach();
});
