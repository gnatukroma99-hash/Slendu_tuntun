import { test, expect } from '@playwright/test';

test('Blender models render in the wardrobe and reusable case canvas on desktop/mobile', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('slendytubbies-profile', JSON.stringify({ coins: 1000 })));
  await page.goto('/?test=1'); await expect(page.locator('#start')).toBeEnabled();
  expect(await page.evaluate(() => window.__gameTest.modelStatus())).toEqual({ player: 'ready', rabbit: 'ready', case: 'ready', sahur: 'ready', 'sahur-bat': 'ready', 'sahur-buff': 'ready' });
  await page.locator('[data-open-shop]').first().click();
  expect(await page.evaluate(() => window.__gameTest.modelSnapshot())).toMatchObject({ avatar: 'blender-v1', rabbit: 'blender-v1' });
  await page.screenshot({ path: test.info().outputPath('blender-wardrobe.png') });
  for (let index = 0; index < 2; index++) {
    await page.evaluate(() => window.__gameTest.animateCaseWithRoll(0.5));
    await expect(page.locator('#case-model-stage')).toBeVisible();
    await expect(page.locator('#case-chest')).toBeHidden();
    await expect(page.locator('#case-model-stage canvas')).toHaveCount(1);
    expect((await page.evaluate(() => window.__gameTest.modelSnapshot())).chest).toBe('blender-v1');
    await expect.poll(() => page.evaluate(() => window.__gameTest.modelSnapshot().lidAngle)).toBeLessThan(-1.8);
    expect((await page.evaluate(() => window.__gameTest.modelSnapshot())).previewDrawCalls).toBeLessThanOrEqual(7);
    if (index === 0) await page.screenshot({ path: test.info().outputPath('blender-open-case.png') });
    await page.locator('#case-skip').click();
    await expect(page.locator('#case-opening-result')).toBeVisible();
    await expect(page.locator('#case-prize-stage canvas')).toHaveCount(1);
    expect((await page.evaluate(() => window.__gameTest.modelSnapshot())).prize).toBe('player');
    if (index === 0) await page.screenshot({ path: test.info().outputPath('blender-prize.png'), animations: 'disabled' });
    await page.locator('#case-done').click();
    expect((await page.evaluate(() => window.__gameTest.modelSnapshot())).prize).toBe(null);
  }
  expect(errors).toEqual([]);
});

test('unavailable GLBs retain the procedural models and safe CSS case animation', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/models/blender-v1/*.glb', (route) => route.abort());
  await page.goto('/?test=1'); await expect(page.locator('#start')).toBeEnabled();
  expect(await page.evaluate(() => window.__gameTest.modelStatus())).toEqual({ player: 'fallback', rabbit: 'fallback', case: 'fallback', sahur: 'fallback', 'sahur-bat': 'fallback', 'sahur-buff': 'fallback' });
  await page.locator('[data-open-shop]').first().click();
  await page.evaluate(() => window.__gameTest.animateCaseWithRoll(0));
  await expect(page.locator('#case-chest')).toBeVisible();
  await expect(page.locator('#case-model-stage')).toBeHidden();
  await page.locator('#case-skip').click();
  await expect(page.locator('#case-prize-name')).toHaveText('Легендарный заяц');
  expect((await page.evaluate(() => window.__gameTest.contentSnapshot())).coins).toBe(20);
  await page.locator('#case-done').click(); expect(errors).toEqual([]);
});
