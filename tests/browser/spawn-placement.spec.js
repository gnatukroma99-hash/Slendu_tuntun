import { test, expect } from '@playwright/test';

for (const location of ['forest', 'lake', 'outskirts', 'station']) {
  test(`${location}: cream has free space, can be collected, and rocks block movement`, async ({ page }) => {
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?test=1'); await expect(page.locator('#start')).toBeEnabled();
    await page.locator('#game-location').selectOption(location); await page.locator('#start').click();
    const pickups = await page.evaluate(() => window.__gameTest.pickupAudit());
    expect(pickups).toHaveLength(10);
    expect(pickups.every((pickup) => pickup.free && pickup.walkable && pickup.extraClear)).toBe(true);
    if (location === 'lake' || location === 'outskirts') {
      expect(await page.evaluate(() => window.__gameTest.probeMovement([0, 35.5], [0, 38]))).toBe(false);
    }
    if (location === 'forest') {
      expect(await page.evaluate(() => window.__gameTest.probeMovement([40.106, -51.608], [40.106, -51.608]))).toBe(false);
    }
    await page.evaluate(() => { for (let i = 0; i < 10; i++) { window.__gameTest.teleportToCollectible(i); document.querySelector('#collect').click(); } });
    await expect(page.locator('#result-title')).toHaveText('Ты выбрался.');
    expect(errors).toEqual([]);
  });
}
