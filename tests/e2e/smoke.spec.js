import { expect, test } from '@playwright/test';

test('loads the trip planner shell', async ({ page, isMobile }) => {
  await page.goto('/', { waitUntil: 'commit' });

  await expect(page).toHaveTitle(/Trip App|Travel With Me/i);
  if (isMobile) await expect(page.getByRole('button', { name: '地图' })).toBeVisible();
  else await expect(page.locator('#status-panel')).toBeVisible();
  await expect(page.locator('body')).toContainText(/行程|旅行|地点/);
});

test('mobile can switch between itinerary and map views', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile-only layout behavior');

  await page.goto('/', { waitUntil: 'commit' });

  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.map-container')).toBeHidden();

  await page.getByRole('button', { name: '地图' }).click();
  await expect(page.locator('.map-container')).toBeVisible();
  await expect(page.locator('.sidebar')).toBeHidden();

  await page.getByRole('button', { name: '行程' }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
});
