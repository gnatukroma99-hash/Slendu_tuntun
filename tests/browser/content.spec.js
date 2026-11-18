import { test, expect } from '@playwright/test';

async function ready(page) {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?test=1'); await expect(page.locator('#start')).toBeEnabled(); return errors;
}

test('shop has a 3D preview, purchases and equips cosmetics, and keeps them after reload', async ({ page }) => {
  const errors = await ready(page);
  await page.locator('[data-open-shop]').first().click();
  await expect(page.locator('#skin-preview')).toBeVisible();
  for (const [kind, item] of [['skin', 'green'], ['hat', 'cap'], ['antenna', 'straight']]) await page.locator(`[data-kind="${kind}"][data-item="${item}"]`).click();
  expect((await page.evaluate(() => window.__gameTest.contentSnapshot())).coins).toBe(30);
  await page.locator('[data-kind="hat"][data-item="cap"]').click();
  await page.locator('[data-kind="hat"][data-item="top"]').click();
  await expect(page.locator('#shop-message')).toContainText('Не хватает');
  await page.locator('#shop-screen').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: test.info().outputPath('shop.png') });
  await page.locator('#close-shop').click(); await page.reload();
  await expect(page.locator('#start')).toBeEnabled();
  const state = await page.evaluate(() => window.__gameTest.contentSnapshot());
  expect(state.appearance).toEqual({ skin: 'green', hat: 'cap', antenna: 'straight' }); expect(state.coins).toBe(30);
  expect(errors).toEqual([]);
});

for (const [location, monster] of [['lake', 'dipsy'], ['outskirts', 'laalaa'], ['station', 'po']]) {
  test(`${location}: distinct map, correct monster, movement, victory and earned coins`, async ({ page }) => {
    const errors = await ready(page);
    await page.locator('#game-location').selectOption(location); await page.locator('#start').click();
    await expect(page.locator('#hud')).toBeVisible();
    const state = await page.evaluate(() => window.__gameTest.contentSnapshot());
    expect(state.location).toBe(location); expect(state.monster).toBe(monster);
    await page.keyboard.down('KeyW');
    await expect.poll(() => page.evaluate(() => window.__gameTest.snapshot().player[2])).toBeGreaterThan(-29.7);
    await page.keyboard.up('KeyW');
    await page.screenshot({ path: test.info().outputPath(`${location}.png`) });
    await page.evaluate(() => { for (let i = 0; i < 10; i++) { window.__gameTest.teleportToCollectible(i); document.querySelector('#collect').click(); } });
    await expect(page.locator('#result-title')).toHaveText('Ты выбрался.');
    expect((await page.evaluate(() => window.__gameTest.contentSnapshot())).coins).toBe(220);
    expect(errors).toEqual([]);
  });
}

test('co-op shares map, monster, cosmetics and safe chat; chat history survives reconnect', async ({ page, browser }) => {
  const errors = await ready(page), otherContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    await page.locator('[data-open-shop]').first().click();
    await page.locator('[data-kind="skin"][data-item="green"]').click();
    await page.locator('[data-kind="hat"][data-item="cap"]').click();
    await page.locator('#close-shop').click();
    const guest = await otherContext.newPage(); const guestErrors = await ready(guest);
    await page.locator('#game-location').selectOption('lake');
    await page.locator('#open-lan').click(); await page.locator('#create-room').click();
    await expect(page.locator('#room-code')).toHaveText(/^[A-Z2-9]{6}$/);
    const code = await page.locator('#room-code').textContent();
    await guest.locator('#open-lan').click(); await guest.locator('#join-code').fill(code); await guest.locator('#join-room').click();
    await expect(guest.locator('#room-location')).toHaveValue('lake'); await expect(guest.locator('#room-monster')).toBeDisabled();
    await page.locator('#chat-toggle').click(); await page.locator('#chat-input').fill('<img src=x onerror=alert(1)> hello'); await page.locator('#chat-form button').click();
    await guest.locator('#chat-toggle').click(); await expect(guest.locator('#chat-messages')).toContainText('hello');
    await expect(guest.locator('#chat-messages img')).toHaveCount(0);
    await guest.locator('#chat-input').fill('Понял, иду к мосту!'); await guest.locator('#chat-form button').click();
    await expect(page.locator('#chat-messages')).toContainText('иду к мосту');
    await page.locator('#chat-close').click(); await guest.locator('#chat-close').click();
    await page.locator('#room-location').selectOption('station'); await page.locator('#room-monster').selectOption('po');
    await expect(guest.locator('#room-location')).toHaveValue('station');
    await expect(page.locator('#start-room')).toBeEnabled(); await page.locator('#start-room').click();
    await expect(guest.locator('#hud')).toBeVisible();
    await expect.poll(() => guest.evaluate(() => window.__gameTest.contentSnapshot().peerLooks[0]?.hat)).toBe('cap');
    expect((await guest.evaluate(() => window.__gameTest.contentSnapshot())).monster).toBe('po');
    await guest.reload(); await expect(guest.locator('#chat-toggle')).toBeVisible();
    await guest.locator('#chat-toggle').click(); await expect(guest.locator('#chat-messages')).toContainText('иду к мосту');
    await expect.poll(() => guest.evaluate(() => window.__gameTest.contentSnapshot().location)).toBe('station');
    await guest.screenshot({ path: test.info().outputPath('chat.png') });
    expect(errors).toEqual([]); expect(guestErrors).toEqual([]);
  } finally { await otherContext.close(); }
});
