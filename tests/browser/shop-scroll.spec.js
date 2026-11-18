import { test, expect } from '@playwright/test';

test('shop heading scrolls away instead of covering hats; bottom close stays available', async ({ page }) => {
  await page.goto('/?test=1'); await expect(page.locator('#start')).toBeEnabled();
  await page.locator('[data-open-shop]').first().click();
  await page.locator('[data-kind="antenna"][data-item="none"]').click();
  expect((await page.evaluate(() => window.__gameTest.contentSnapshot())).appearance.antenna).toBe('none');
  await page.locator('#shop-screen').evaluate((element) => { element.scrollTop = 0; });
  const heading = page.locator('.shop-heading');
  const before = await heading.boundingBox();
  await page.locator('#shop-screen').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(async () => (await heading.boundingBox()).y).toBeLessThan(before.y - 100);
  expect(await heading.evaluate((element) => getComputedStyle(element).position)).toBe('static');
  await page.locator('[data-kind="hat"][data-item="pan"]').click();
  await expect(page.locator('[data-kind="hat"][data-item="pan"]')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: test.info().outputPath('shop-scrolled.png') });
  await page.locator('#close-shop-bottom').click();
  await expect(page.locator('#shop-screen')).toBeHidden();
});
