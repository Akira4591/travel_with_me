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
        },
        loc_unscheduled: {
          name: '备选书店',
          query: '备选书店',
          addr: '北京市东城区备选路 8 号',
          lnglat: [116.409, 39.91],
          resolved: true,
          photo: '',
          type: '购物服务;书店'
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
      unscheduled: [
        {
          id: 'event_unscheduled',
          title: '备选书店',
          icon: 'bookstore',
          note: '只在空闲时考虑',
          locationId: 'loc_unscheduled'
        }
      ]
    }
  ],
  activeTripId: 'trip-s1-desktop'
};

const IMPORT_WORKSPACE = {
  trips: [
    {
      id: 'trip-s1-imported',
      title: 'S1 导入路线',
      subtitle: '导入导出回归',
      city: '北京',
      locations: {
        loc_imported: {
          name: '导入地点',
          query: '导入地点',
          addr: '北京市东城区导入路 9 号',
          lnglat: [116.411, 39.916],
          resolved: true,
          photo: '',
          type: '风景名胜'
        }
      },
      days: [
        {
          id: 'day_imported',
          title: '导入日程',
          events: [
            {
              id: 'event_imported',
              title: '导入事件',
              icon: 'place',
              note: '来自 JSON 导入',
              locationId: 'loc_imported'
            }
          ]
        }
      ],
      unscheduled: []
    }
  ],
  activeTripId: 'trip-s1-imported'
};

async function installMockAMap(page) {
  await page.addInitScript(() => {
    const toPair = value => {
      if (Array.isArray(value)) return [Number(value[0]), Number(value[1])];
      if (value && typeof value.getLng === 'function') return [value.getLng(), value.getLat()];
      return [Number(value?.lng ?? 116.397), Number(value?.lat ?? 39.908)];
    };

    class MockLngLat {
      constructor(lng, lat) {
        this.lng = Number(lng);
        this.lat = Number(lat);
      }
      getLng() {
        return this.lng;
      }
      getLat() {
        return this.lat;
      }
    }

    class MockMap {
      constructor(id, options = {}) {
        this.id = id;
        this.zoom = 16;
        this.center = options.center || [116.397, 39.908];
        this.handlers = new Map();
      }
      addControl() {}
      add() {}
      remove() {}
      resize() {}
      on(event, handler) {
        const handlers = this.handlers.get(event) || [];
        handlers.push(handler);
        this.handlers.set(event, handlers);
      }
      emit(event) {
        (this.handlers.get(event) || []).forEach(handler => handler());
      }
      getZoom() {
        return this.zoom;
      }
      getCenter() {
        return new MockLngLat(this.center[0], this.center[1]);
      }
      setZoomAndCenter(zoom, center) {
        this.zoom = Number(zoom);
        this.center = toPair(center);
        this.emit('zoomchange');
        this.emit('zoomend');
      }
      setFitView(markers, immediately, padding, maxZoom) {
        const first = markers?.[0]?.getPosition?.();
        if (first) this.center = toPair(first);
        this.zoom = Math.min(maxZoom || 17, 17);
        this.emit('zoomchange');
        this.emit('zoomend');
      }
    }

    class MockMarker {
      constructor(options = {}) {
        this.position = options.position || [116.397, 39.908];
        this.handlers = new Map();
      }
      setPosition(position) {
        this.position = position;
      }
      getPosition() {
        const [lng, lat] = toPair(this.position);
        return new MockLngLat(lng, lat);
      }
      on(event, handler) {
        this.handlers.set(event, handler);
      }
      show() {}
      hide() {}
    }

    class MockPolyline {
      constructor(options = {}) {
        this.options = options;
      }
      setOptions(options = {}) {
        this.options = { ...this.options, ...options };
      }
      show() {}
      hide() {}
    }

    class MockInfoWindow {
      setContent() {}
      open() {}
      close() {}
    }

    const buildPoi = (keyword, index = 0) => ({
      id: `mock-poi-${index}`,
      name: index === 0 ? `S1 测试${keyword}` : `备选${keyword}`,
      address: index === 0 ? '北京市东城区 S1 测试路 8 号' : '北京市东城区备选路 2 号',
      pname: '北京市',
      cityname: '北京市',
      adname: '东城区',
      type: '餐饮服务;咖啡厅',
      location: { lng: 116.409 + index * 0.001, lat: 39.914 + index * 0.001 },
      rating: '4.8',
      biz_ext: { cost: '42' },
      photos: []
    });

    class MockPlaceSearch {
      search(keyword, callback) {
        callback('complete', { info: 'OK', poiList: { pois: [buildPoi(keyword, 0)] } });
      }
      searchNearBy(keyword, center, radius, callback) {
        callback('complete', { info: 'OK', poiList: { pois: [buildPoi(keyword, 0)] } });
      }
    }

    class MockGeocoder {
      getLocation(keyword, callback) {
        callback('complete', {
          info: 'OK',
          geocodes: [
            {
              location: new MockLngLat(116.407, 39.913),
              formattedAddress: `北京市东城区${keyword}`,
              addressComponent: {
                province: '北京市',
                city: '北京市',
                district: '东城区'
              }
            }
          ]
        });
      }
      getAddress(lnglat, callback) {
        callback('complete', {
          info: 'OK',
          regeocode: {
            formattedAddress: '北京市东城区测试地址',
            addressComponent: {
              province: '北京市',
              city: '北京市',
              district: '东城区'
            }
          }
        });
      }
    }

    class MockRouteService {
      search(origin, destination, optionsOrCallback, maybeCallback) {
        const callback =
          typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
        const [fromLng, fromLat] = toPair(origin);
        const [toLng, toLat] = toPair(destination);
        callback('complete', {
          info: 'OK',
          routes: [
            {
              distance: 1200,
              time: 900,
              path: [
                [fromLng, fromLat],
                [toLng, toLat]
              ],
              steps: []
            }
          ]
        });
      }
      clear() {}
    }

    const AMap = {
      Map: MockMap,
      ToolBar: class {},
      InfoWindow: MockInfoWindow,
      Pixel: class {
        constructor(x, y) {
          this.x = x;
          this.y = y;
        }
      },
      Marker: MockMarker,
      Polyline: MockPolyline,
      LngLat: MockLngLat,
      PlaceSearch: MockPlaceSearch,
      Geocoder: MockGeocoder,
      Driving: MockRouteService,
      Walking: MockRouteService,
      Riding: MockRouteService,
      Transfer: MockRouteService,
      DrivingPolicy: { LEAST_TIME: 0 },
      TransferPolicy: { LEAST_TIME: 0 }
    };

    window.AMapLoader = {
      load: () => Promise.resolve(AMap)
    };
  });
}

async function seedWorkspace(page, workspace = SEEDED_WORKSPACE) {
  await page.addInitScript(seed => {
    window.localStorage.setItem(
      'trip-app:workspace',
      JSON.stringify({
        version: 5,
        savedAt: Date.now(),
        workspace: seed
      })
    );
  }, workspace);
}

async function openSeededDesktop(page, isMobile, options = {}) {
  test.skip(isMobile, 'desktop S1 path');
  if (options.mockAMap !== false) await installMockAMap(page);
  await seedWorkspace(page, options.workspace || SEEDED_WORKSPACE);
  await page.goto('/', { waitUntil: 'load', timeout: 30_000 });
  await expect(page.locator('#trip-title-text')).toHaveText(
    options.workspace?.trips?.[0]?.title || 'S1 桌面验收行程',
    { timeout: 15_000 }
  );
}

async function openTripMenu(page) {
  await page.getByRole('button', { name: '行程菜单' }).click();
}

test('loads the trip planner shell', async ({ page, isMobile }) => {
  await installMockAMap(page);
  await page.goto('/', { waitUntil: 'commit' });

  await expect(page).toHaveTitle(/Trip App|Travel With Me/i);
  if (isMobile) await expect(page.getByRole('button', { name: '地图' })).toBeVisible();
  else await expect(page.locator('#status-panel')).toBeVisible();
  await expect(page.locator('body')).toContainText(/行程|旅行|地点/);
});

test('mobile can switch between itinerary and map views', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile-only layout behavior');
  await installMockAMap(page);

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
  await installMockAMap(page);

  await page.goto('/', { waitUntil: 'commit' });

  await page.getByRole('button', { name: '新建行程' }).click();
  await expect(page.getByRole('dialog', { name: '新建旅行路线' })).toBeVisible();
  await page.locator('.trip-title-input').fill('S1 新建桌面路线');
  await page.getByRole('button', { name: '确定' }).click();

  await expect(page.locator('#trip-title-text')).toHaveText('S1 新建桌面路线');

  await openTripMenu(page);
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

test('desktop can add a searched place to the itinerary', async ({ page, isMobile }) => {
  await openSeededDesktop(page, isMobile);

  await page.getByRole('button', { name: 'Day 1' }).click();
  const dayGroup = page.locator('.day-group', { hasText: 'Day 1 · 抵达与散步' }).first();
  await dayGroup.locator('.day-add-btn').click();
  await expect(page.getByRole('dialog', { name: '搜索并添加地点' })).toBeVisible();

  await page.locator('.modal-search-input').fill('书店');
  await page.locator('.modal-search-btn').click();
  await expect(page.locator('.modal-result-item').first()).toContainText('S1 测试书店');
  await page.locator('.modal-result-item').first().click();

  await page.locator('.modal-event-title').fill('S1 新增搜索地点');
  await page.locator('.modal-event-note').fill('S1 添加地点搜索回归');
  await page.locator('.modal-event-form .modal-submit').click();

  await expect(page.getByText('S1 新增搜索地点')).toBeVisible();
  await expect(page.getByText('S1 添加地点搜索回归')).toBeVisible();
});

test('desktop can export and import workspace JSON', async ({ page, isMobile }) => {
  await openSeededDesktop(page, isMobile);
  page.on('dialog', dialog => dialog.accept());

  await openTripMenu(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出工作区 JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^travel-with-me-workspace-\d{4}-\d{2}-\d{2}\.json$/
  );

  await openTripMenu(page);
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '导入工作区 JSON' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 's1-import-workspace.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'travel-with-me.workspace',
        formatVersion: 1,
        schemaVersion: 5,
        exportedAt: new Date().toISOString(),
        workspace: IMPORT_WORKSPACE
      })
    )
  });

  await expect(page.locator('#trip-title-text')).toHaveText('S1 导入路线');
  await expect(page.getByText('导入事件')).toBeVisible();
});

test('desktop can import an AI guide through the preview flow', async ({ page, isMobile }) => {
  await openSeededDesktop(page, isMobile);
  await page.route('**/_ai/status', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: true })
    });
  });
  await page.route('**/_ai/extract-guide', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        guide_type: 'daily_itinerary',
        city: '北京',
        title_suggestion: 'S1 AI 导入路线',
        warnings: [],
        events: [
          {
            day: 1,
            place_name: '颐和园',
            note: '上午游览昆明湖和长廊',
            source_quote: '上午去颐和园'
          },
          {
            day: 1,
            place_name: '鼓楼',
            note: '傍晚看老城街区',
            source_quote: '傍晚去鼓楼'
          }
        ]
      })
    });
  });

  await page.getByRole('button', { name: '从攻略导入' }).click();
  await expect(page.getByRole('dialog', { name: '从攻略导入' })).toBeVisible();
  await page.locator('.guide-import-city').fill('北京');
  await page
    .locator('.guide-import-textarea')
    .fill(
      '第一天上午去颐和园，从东宫门进入，沿着昆明湖和长廊慢慢逛。下午可以回到老城休息，傍晚去鼓楼附近看看街区和小店，晚上找一家附近餐厅吃饭。'
    );
  await page.locator('.guide-import-submit').click();

  await expect(page.getByRole('dialog', { name: '导入预览' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.guide-preview-event')).toHaveCount(2);

  const previewEvents = page.locator('.guide-preview-event');
  await previewEvents.nth(0).locator('.guide-preview-event-title-input').fill('S2 改名颐和园');
  await previewEvents.nth(0).locator('.guide-preview-event-note-input').fill('S2 预览备注已修正');
  await previewEvents.nth(1).locator('.guide-preview-action-toggle').click();
  await previewEvents.nth(1).locator('.guide-preview-day-select').selectOption('2');
  await page.locator('.guide-preview-event').nth(1).locator('.guide-preview-action-toggle').click();
  await page
    .locator('.guide-preview-event')
    .nth(1)
    .locator('.guide-preview-time-slot-select')
    .selectOption('evening');

  await page.locator('.guide-preview-confirm').click();

  await expect(page.locator('#trip-title-text')).toHaveText('S1 AI 导入路线');
  await expect(page.getByText('S2 改名颐和园')).toBeVisible();
  await expect(page.getByText('S2 预览备注已修正')).toBeVisible();
  await expect(page.getByText('鼓楼', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Day 2' }).click();
  await expect(page.getByText('晚上')).toBeVisible();
});

test('desktop can enter and exit nonblank 3D map view', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  await openSeededDesktop(page, isMobile);

  await page.route('https://api.open-meteo.com/**', async route => {
    const url = new URL(route.request().url());
    const count =
      (url.searchParams.get('locations') || '').split('|').filter(Boolean).length || 1600;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ elevation: Array.from({ length: count }, (_, i) => 40 + (i % 8)) })
    });
  });

  await expect(page.locator('#map-3d-toggle')).toBeVisible();
  await page.locator('#map-3d-toggle').click();

  await expect(page.locator('#map-3d canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#map-3d-toggle')).toContainText('2D');
  await expect
    .poll(async () =>
      page.locator('#map-3d canvas').evaluate(canvas => {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return 0;
        const pixels = new Uint8Array(4);
        gl.readPixels(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels
        );
        return pixels[0] + pixels[1] + pixels[2] + pixels[3];
      })
    )
    .toBeGreaterThan(0);

  await page.locator('#map-3d-toggle').click();
  await expect(page.locator('#map-3d')).toBeHidden({ timeout: 15_000 });
});

test('desktop can open share image preview from seeded trip', async ({ page, isMobile }) => {
  await openSeededDesktop(page, isMobile);

  await page.getByRole('button', { name: '分享长图' }).click();
  await expect(page.getByRole('dialog', { name: '分享长图' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.share-image-preview img')).toHaveAttribute('src', /^data:image\/png/);
  await expect(page.locator('.share-include-notes')).toBeChecked();
  await expect(page.locator('.share-include-routes')).not.toBeChecked();
  await expect(page.locator('.share-include-unscheduled')).not.toBeChecked();

  const firstSrc = await page.locator('.share-image-preview img').getAttribute('src');
  await page.locator('.share-include-notes').uncheck();
  await expect(page.locator('.share-image-loading')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('.share-image-preview img')).not.toHaveAttribute('src', firstSrc || '');

  const secondSrc = await page.locator('.share-image-preview img').getAttribute('src');
  await page.locator('.share-include-unscheduled').check();
  await expect(page.locator('.share-image-loading')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('.share-image-preview img')).not.toHaveAttribute(
    'src',
    secondSrc || ''
  );
  await expect(page.getByRole('button', { name: '下载长图' })).toBeVisible();
});
