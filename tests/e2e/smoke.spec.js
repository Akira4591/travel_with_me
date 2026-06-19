import { expect, test } from '@playwright/test';

const SEEDED_WORKSPACE = {
  trips: [
    {
      id: 'trip-s1-desktop',
      title: 'S1 桌面验收行程',
      subtitle: '桌面端核心路径回归',
      city: '北京',
      locations: {
        loc_hotel: {
          name: '老城酒店',
          query: '老城酒店',
          addr: '北京市东城区旅居路 1 号',
          lnglat: [116.397, 39.908],
          resolved: true,
          photo: '',
          type: '住宿服务'
        },
        loc_cafe: {
          name: '胡同咖啡',
          query: '胡同咖啡',
          addr: '北京市东城区胡同 12 号',
          lnglat: [116.405, 39.912],
          resolved: true,
          photo: '',
          type: '餐饮服务;咖啡厅'
        }
      },
      days: [
        {
          id: 'day_1',
          title: '抵达与散步',
          events: [
            {
              id: 'event_hotel',
              title: '住进老城酒店',
              icon: 'hotel',
              note: '确认前台寄存行李',
              locationId: 'loc_hotel',
              routeToNext: { mode: 'driving' }
            },
            {
              id: 'event_cafe',
              title: '胡同咖啡休息',
              icon: 'coffee',
              timeSlot: 'evening',
              note: '靠窗位置适合整理照片',
              locationId: 'loc_cafe'
            }
          ]
        }
      ],
      unscheduled: []
    }
  ],
  activeTripId: 'trip-s1-desktop'
};

async function openSeededDesktop(page, isMobile) {
  test.skip(isMobile, 'desktop S1 path');
  await page.addInitScript(seed => {
    window.localStorage.setItem(
      'trip-app:workspace',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        workspace: seed
      })
    );
  }, SEEDED_WORKSPACE);
  await page.goto('/', { waitUntil: 'load', timeout: 30_000 });
  await expect(page.locator('#trip-title-text')).toHaveText('S1 桌面验收行程', {
    timeout: 15_000
  });
}

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

  await page.getByRole('button', { name: '行程', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('desktop can create and rename a trip', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop S1 path');

  await page.goto('/', { waitUntil: 'commit' });

  await page.getByRole('button', { name: '新建行程' }).click();
  await expect(page.getByRole('dialog', { name: '新建旅行路线' })).toBeVisible();
  await page.locator('.trip-title-input').fill('S1 新建桌面路线');
  await page.getByRole('button', { name: '确定' }).click();

  await expect(page.locator('#trip-title-text')).toHaveText('S1 新建桌面路线');

  await page.getByRole('button', { name: '行程菜单' }).click();
  await page.getByRole('button', { name: '修改名称' }).click();
  await expect(page.getByRole('dialog', { name: '修改旅行标题' })).toBeVisible();
  await page.locator('.trip-title-input').fill('S1 已重命名路线');
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page.locator('#trip-title-text')).toHaveText('S1 已重命名路线');
  await expect(page.locator('#status-panel')).toContainText('旅行标题已更新');
});

test('desktop can edit day, event, and route settings', async ({ page, isMobile }) => {
  await openSeededDesktop(page, isMobile);

  const dayGroup = page.locator('.day-group', { hasText: 'Day 1 · 抵达与散步' }).first();
  await dayGroup.locator('.day-title-main .day-edit-btn').click();
  await expect(page.getByRole('dialog', { name: '编辑这一天' })).toBeVisible();
  await page.locator('.day-title-input').fill('S1 桌面编辑日');
  await page.locator('.day-editor-modal .modal-submit').click();
  await expect(page.getByText('Day 1 · S1 桌面编辑日')).toBeVisible();

  const eventCard = page.locator('.card', { hasText: '住进老城酒店' }).first();
  await eventCard.locator('.event-add-time-btn').click();
  await expect(page.getByRole('dialog', { name: '编辑日程' })).toBeVisible();
  await page.locator('.editor-title-input').fill('S1 桌面编辑事件');
  await page.locator('.editor-note-input').fill('S1 桌面备注已保存');
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page.getByText('S1 桌面编辑事件')).toBeVisible();
  await expect(page.getByText('S1 桌面备注已保存')).toBeVisible();

  await page.getByRole('button', { name: 'Day 1' }).click();
  await page.locator('.route-card').first().locator('.route-edit-btn').click({ force: true });
  await expect(page.getByRole('dialog', { name: '编辑路线' })).toBeVisible();
  await page.getByRole('radio', { name: '步行' }).click();
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page.locator('.route-card').first()).toContainText('步行');
});

test('desktop can open share image preview from seeded trip', async ({ page, isMobile }) => {
  await openSeededDesktop(page, isMobile);

  await page.getByRole('button', { name: '分享长图' }).click();
  await expect(page.getByRole('dialog', { name: '分享长图' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.share-image-preview img')).toHaveAttribute('src', /^data:image\/png/);
  await expect(page.getByRole('button', { name: '下载长图' })).toBeVisible();
});
