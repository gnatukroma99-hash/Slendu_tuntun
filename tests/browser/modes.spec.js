import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?test=1');
  await expect(page.locator('#start')).toBeEnabled();
});

for (const mode of ['hardcore', 'rabbits', 'pig']) {
  test(`${mode}: playable, correct visuals, rabbit easter egg and clean restart`, async ({ page }) => {
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.locator('#game-mode').selectOption(mode);
    await page.locator('#start').click();
    await expect(page.locator('#hud')).toBeVisible();
    const info = await page.evaluate(() => window.__gameTest.modeSnapshot());
    expect(info.mode).toBe(mode);
    expect(info.pigVisible).toBe(mode === 'pig');
    expect(info.rabbitEnemy).toBe(mode !== 'hardcore');
    expect(info.beacons).toBe(mode !== 'hardcore');
    if (mode === 'hardcore') await expect(page.locator('#signal-hint')).toBeHidden();
    else await expect(page.locator('#objective-label')).toHaveText('СОБЕРИ МОРКОВКИ');
    await page.evaluate(() => window.__gameTest.teleportToRabbit(0));
    await expect.poll(() => page.evaluate(() => window.__gameTest.modeSnapshot().secrets)).toBe(1);
    await expect(page.locator('#toast')).toContainText('ОТКУДА ЗДЕСЬ КРОЛИКИ');
    await page.screenshot({ path: test.info().outputPath(`${mode}.png`) });
    await page.evaluate(() => { for (let id = 0; id < 10; id++) { window.__gameTest.teleportToCollectible(id); document.querySelector('#collect').click(); } });
    await expect(page.locator('#result-screen')).toBeVisible();
    await page.locator('#restart').click();
    expect((await page.evaluate(() => window.__gameTest.modeSnapshot())).secrets).toBe(0);
    await page.keyboard.press('Escape');
    await page.locator('#exit').click();
    await page.locator('#game-mode').selectOption('classic');
    await page.locator('#start').click();
    expect((await page.evaluate(() => window.__gameTest.modeSnapshot())).rabbitEnemy).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('co-op host controls the shared mode and both clients become pigs', async ({ page, browser }) => {
  const otherContext = await browser.newContext();
  try {
    const guest = await otherContext.newPage();
    await guest.goto('http://127.0.0.1:4173/?test=1');
    await expect(guest.locator('#start')).toBeEnabled();
    await page.locator('#game-mode').selectOption('hardcore');
    await page.locator('#open-lan').click();
    await page.locator('#create-room').click();
    await expect(page.locator('#room-code')).toHaveText(/^[A-Z2-9]{6}$/);
    await expect(page.locator('#room-mode')).toHaveValue('hardcore');
    expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true);
    const code = await page.locator('#room-code').textContent();
    await guest.locator('#open-lan').click();
    await guest.locator('#join-code').fill(code);
    await guest.locator('#join-room').click();
    await expect(guest.locator('#room-mode')).toBeDisabled();
    await page.locator('#room-mode').selectOption('pig');
    await expect(guest.locator('#room-mode')).toHaveValue('pig');
    await expect(page.locator('#start-room')).toBeEnabled();
    await page.locator('#start-room').click();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(guest.locator('#hud')).toBeVisible();
    for (const client of [page, guest]) {
      const state = await client.evaluate(() => window.__gameTest.modeSnapshot());
      expect(state.mode).toBe('pig'); expect(state.pigVisible).toBe(true);
      await expect.poll(() => client.evaluate(() => window.__gameTest.snapshot().peers)).toBe(1);
    }
    await guest.reload();
    await expect.poll(() => guest.evaluate(() => window.__gameTest?.modeSnapshot().mode)).toBe('pig');
    await expect(guest.locator('#objective-label')).toHaveText('СОБЕРИ МОРКОВКИ');
  } finally { await otherContext.close(); }
});
