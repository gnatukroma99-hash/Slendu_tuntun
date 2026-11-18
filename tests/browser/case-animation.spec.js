import { test, expect } from '@playwright/test';

async function ready(page) {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?test=1'); await expect(page.locator('#start')).toBeEnabled();
  await page.locator('[data-open-shop]').first().click(); return errors;
}

test('case opens with a reel and 3D reward; double click does not spend or roll twice', async ({ page }) => {
  const errors = await ready(page);
  expect(await page.evaluate(() => window.__gameTest.animateCaseWithRoll(0.5))).toBe(true);
  await expect(page.locator('#case-opening')).toBeVisible();
  await expect(page.locator('#open-case')).toBeDisabled();
  expect((await page.evaluate(() => window.__gameTest.contentSnapshot())).coins).toBe(20);
  expect(await page.evaluate(() => window.__gameTest.animateCaseWithRoll(0))).toBe(false);
  await expect(page.locator('#case-opening')).toHaveAttribute('data-phase', 'rolling');
  await page.screenshot({ path: test.info().outputPath('case-rolling.png') });
  await expect(page.locator('#case-opening')).toHaveAttribute('data-phase', 'revealed');
  await expect(page.locator('#case-prize-name')).toHaveText('Ведро знаний');
  await expect(page.locator('#case-prize-preview')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('case-reward.png') });
  await page.locator('#case-equip').click();
  await expect(page.locator('#case-opening')).toBeHidden();
  const state = await page.evaluate(() => window.__gameTest.contentSnapshot());
  expect(state.coins).toBe(20); expect(state.appearance.hat).toBe('bucket'); expect(errors).toEqual([]);
});

test('skip immediately reveals the one precommitted legendary prize without another debit', async ({ page }) => {
  const errors = await ready(page);
  await page.evaluate(() => window.__gameTest.animateCaseWithRoll(0));
  await page.locator('#case-skip').click();
  await expect(page.locator('#case-opening')).toHaveAttribute('data-rarity', 'legendary');
  await expect(page.locator('#case-prize-name')).toHaveText('Легендарный заяц');
  await expect(page.locator('#case-prize-rarity')).toContainText('0,5%');
  await page.screenshot({ path: test.info().outputPath('case-legendary.png') });
  await page.locator('#case-done').click();
  expect((await page.evaluate(() => window.__gameTest.contentSnapshot())).coins).toBe(20);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('slendytubbies-profile')).owned.includes('skin:hare'))).toBe(true);
  expect(errors).toEqual([]);
});

test('Escape during opening keeps the prize and saved balance after reload', async ({ page }) => {
  await ready(page); await page.evaluate(() => window.__gameTest.animateCaseWithRoll(0.5));
  await page.keyboard.press('Escape'); await expect(page.locator('#case-opening')).toBeHidden();
  await expect(page.locator('#case-result')).toContainText('Ведро знаний');
  await expect(page.locator('#open-case')).toBeEnabled();
  await page.reload(); await expect(page.locator('#start')).toBeEnabled();
  expect((await page.evaluate(() => window.__gameTest.contentSnapshot())).coins).toBe(20);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('slendytubbies-profile')).owned.includes('hat:bucket'))).toBe(true);
});

test('duplicate refund is applied once and closing does not repeat it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('slendytubbies-profile', JSON.stringify({ coins: 250, owned: ['skin:hare'] })));
  await ready(page); await page.evaluate(() => window.__gameTest.animateCaseWithRoll(0));
  await page.locator('#case-skip').click();
  await expect(page.locator('#case-prize-note')).toContainText('50 монет');
  expect((await page.evaluate(() => window.__gameTest.contentSnapshot())).coins).toBe(200);
  await page.locator('#case-dismiss').click();
  expect((await page.evaluate(() => window.__gameTest.contentSnapshot())).coins).toBe(200);
});

test('reduced-motion skips spinning; insufficient coins do not open a modal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await ready(page);
  await page.evaluate(() => window.__gameTest.animateCaseWithRoll(0.5));
  await expect(page.locator('#case-opening')).toHaveAttribute('data-phase', 'revealed');
  expect(await page.locator('#case-opening').evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)).toBe(0);
  await page.locator('#case-done').click();
  await page.locator('#open-case').click();
  await expect(page.locator('#case-opening')).toBeHidden();
  await expect(page.locator('#case-result')).toContainText('Нужно 100');
});
