import { expect, test } from '@playwright/test';

test('loads the trip planner shell', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' });

  await expect(page).toHaveTitle(/Trip App|Travel With Me/i);
  await expect(page.locator('#status-panel')).toBeVisible();
  await expect(page.locator('body')).toContainText(/行程|旅行|地点/);
});
