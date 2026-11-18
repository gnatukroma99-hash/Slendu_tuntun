import { test, expect } from '@playwright/test';
async function ready(page) { await page.goto('/?test=1'); await expect(page.locator('#start')).toBeEnabled(); }

test('legendary case drop equips a rabbit; ability makes six decoys and expires after ten seconds', async ({ page }) => {
  await ready(page); await page.locator('[data-open-shop]').first().click();
  expect((await page.evaluate(() => window.__gameTest.openCaseWithRoll(0))).legendary).toBe(true);
  await page.locator('[data-kind="skin"][data-item="hare"]').click(); await page.locator('#close-shop').click();
  await page.locator('#start').click(); await expect(page.locator('#ability-button')).toBeVisible();
  await page.evaluate(() => document.querySelector('#ability-button').click());
  await expect.poll(() => page.evaluate(() => window.__gameTest.roundSnapshot().decoys)).toBe(6);
  expect((await page.evaluate(() => window.__gameTest.roundSnapshot())).rabbit).toBe(true);
  await page.screenshot({ path: test.info().outputPath('rabbit-ability.png') });
  await page.evaluate(() => window.__gameTest.advanceSoloTime(11));
  await expect.poll(() => page.evaluate(() => window.__gameTest.roundSnapshot().rabbit)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__gameTest.roundSnapshot().decoys)).toBe(0);
});

test('tiny mode has a low camera and giant monster; fifteen easter eggs include a plush toy', async ({ page }) => {
  await ready(page); await page.locator('#game-mode').selectOption('tiny'); await page.locator('#start').click();
  const state = await page.evaluate(() => window.__gameTest.roundSnapshot());
  expect(state.playerScale).toBe(0.45); expect(state.enemyScale[0]).toBeGreaterThan(2); expect(state.secretTotal).toBeGreaterThanOrEqual(15);
  await page.evaluate(() => { window.__gameTest.teleportToRabbit(3); window.__gameTest.advanceSoloTime(3); });
  await expect(page.locator('#toast')).toContainText('Плюшевый');
});

test('reverse hunt lets the player tag the fleeing monster and win; hardcore fake ad can be dismissed', async ({ page }) => {
  await ready(page); await page.locator('#game-location').selectOption('station'); await page.locator('#game-mode').selectOption('hunt'); await page.locator('#start').click();
  await page.evaluate(() => { for (let i = 0; i < 10; i++) { window.__gameTest.advanceSoloTime(1); window.__gameTest.teleportToEnemy(); document.querySelector('#collect').click(); } });
  await expect(page.locator('#result-title')).toHaveText('Монстр пойман!'); await page.locator('#result-exit').click();
  await page.locator('#game-mode').selectOption('hardcore'); await page.locator('#start').click();
  await page.evaluate(() => window.__gameTest.advanceSoloTime(36)); await expect(page.locator('#fake-ad')).toBeVisible();
  await page.keyboard.press('KeyX'); await expect(page.locator('#fake-ad')).toBeHidden();
});

test('killer is player-controlled, starts frozen, then catches another player after the grace period', async ({ page, browser }) => {
  await ready(page); await page.locator('#game-mode').selectOption('killer');
  const otherContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    const guest = await otherContext.newPage(); await ready(guest);
    await page.locator('#open-lan').click(); await page.locator('#create-room').click(); await expect(page.locator('#room-code')).toHaveText(/^[A-Z2-9]{6}$/);
    await guest.locator('#open-lan').click(); await guest.locator('#join-code').fill(await page.locator('#room-code').textContent()); await guest.locator('#join-room').click();
    await expect(page.locator('#start-room')).toBeEnabled(); await page.locator('#start-room').click();
    await expect(page.locator('#seeker-cover')).toBeVisible(); expect((await page.evaluate(() => window.__gameTest.roundSnapshot())).role).toBe('killer');
    await expect.poll(() => page.evaluate(() => window.__gameTest.snapshot().elapsed), { timeout: 20000 }).toBeGreaterThan(10);
    await page.bringToFront(); if (await page.locator('#pause-screen').isVisible()) await page.locator('#resume').click();
    await page.evaluate(() => document.querySelector('#collect').click());
    await expect(page.locator('#result-title')).toHaveText('Ты поймал всех.'); await expect(guest.locator('#result-title')).toHaveText('Убийца победил.');
  } finally { await otherContext.close(); }
});
