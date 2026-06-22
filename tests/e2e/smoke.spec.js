import { Buffer } from 'node:buffer';
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
      ],
      annotations: [
        {
          id: 'ann_view_cafe',
          type: 'viewpoint',
          lnglat: [116.405, 39.912],
          elevation: 42,
          title: '胡同视角',
          note: '适合作为 3D 标记回归点',
          createdAt: '2026-06-19T00:00:00.000Z'
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

function createGeoAssetWorkspace() {
  const workspace = JSON.parse(JSON.stringify(SEEDED_WORKSPACE));
  workspace.trips[0].geoAssets = {
    buildings: [],
    landcover: [],
    landmarks: [],
    waterways: [
      {
        id: 'test-canal',
        centerline: [
          [116.397, 39.908],
          [116.405, 39.912]
        ],
        widthMeters: 14,
        provenance: {
          source: 'test-open-data',
          licence: 'ODbL',
          attribution: 'Test open data',
          updatedAt: '2026-06-21T00:00:00.000Z'
        }
      }
    ],
    roads: [
      {
        id: 'test-road',
        kind: 'local',
        centerline: [
          [116.397, 39.908],
          [116.405, 39.912]
        ],
        widthMeters: 6,
        provenance: {
          source: 'test-open-data',
          licence: 'ODbL',
          attribution: 'Test open data',
          updatedAt: '2026-06-21T00:00:00.000Z'
        }
      }
    ],
    bridges: [
      {
        id: 'test-bridge',
        centerline: [
          [116.4005, 39.909],
          [116.4015, 39.911]
        ],
        widthMeters: 8,
        deckHeightMeters: 5,
        provenance: {
          source: 'test-open-data',
          licence: 'ODbL',
          attribution: 'Test open data',
          updatedAt: '2026-06-21T00:00:00.000Z'
        }
      }
    ]
  };
  return workspace;
}

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

async function installMockAmapPlaceText(page) {
  await page.route('**/_AMapService/v3/place/text**', async route => {
    const url = new URL(route.request().url());
    const keyword = url.searchParams.get('keywords') || '';
    const poi = buildMockBffPoi(keyword);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: '1',
        info: 'OK',
        count: '1',
        pois: [poi]
      })
    });
  });
}

function buildMockBffPoi(keyword) {
  if (keyword.includes('书店')) {
    return {
      id: 'mock-bff-bookstore',
      name: 'S1 测试书店',
      address: '北京市东城区 S1 测试路 8 号',
      pname: '北京市',
      cityname: '北京市',
      adname: '东城区',
      type: '购物服务;书店',
      location: '116.409,39.914',
      biz_ext: { rating: '4.8', cost: '42' },
      photos: []
    };
  }
  if (keyword.includes('鼓楼')) {
    return {
      id: 'mock-bff-gulou',
      name: '鼓楼',
      address: '北京市东城区钟鼓楼广场',
      pname: '北京市',
      cityname: '北京市',
      adname: '东城区',
      type: '风景名胜',
      location: '116.397,39.940',
      biz_ext: { rating: '4.7' },
      photos: []
    };
  }
  return {
    id: 'mock-bff-summer-palace',
    name: keyword || '颐和园',
    address: '北京市海淀区新建宫门路 19 号',
    pname: '北京市',
    cityname: '北京市',
    adname: '海淀区',
    type: '风景名胜',
    location: '116.275,39.999',
    biz_ext: { rating: '4.9' },
    photos: []
  };
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
  if (options.forceAmapFailure) {
    await page.addInitScript(() => {
      window.AMapLoader = {
        load: () => Promise.reject(new Error('AMAP_E2E_FORCED_FAILURE'))
      };
    });
  }
  if (options.blockAmapLoader) {
    await page.route('https://webapi.amap.com/loader.js', async route => route.abort('failed'));
  }
  await seedWorkspace(page, options.workspace || SEEDED_WORKSPACE);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
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
  await installMockAmapPlaceText(page);

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
  await installMockAmapPlaceText(page);
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
  await expect(page.locator('.card', { hasText: '鼓楼' })).toBeVisible();
  await page.getByRole('button', { name: 'Day 2' }).click();
  await expect(page.getByText('晚上')).toBeVisible();
});

test('desktop can enter and exit nonblank 3D map view', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  await openSeededDesktop(page, isMobile);

  await page.route('**/_elevation**', async route => {
    const url = new URL(route.request().url());
    const count =
      (url.searchParams.get('latitude') || '').split(',').filter(Boolean).length || 1600;
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
  await expect(page.locator('#map-3d')).toHaveAttribute('data-terrain-mode', 'citywalk');
  await expect(page.locator('#map-3d')).toHaveAttribute(
    'data-terrain-confidence',
    /sampled|low-relief|flat-fallback/
  );
  await expect(page.locator('#map-3d')).toHaveAttribute('data-elevation-range', /^\d+$/);
  await expect(page.locator('.terrain-insight-panel')).toBeVisible();
  await expect(page.locator('#map-3d')).toHaveAttribute('data-annotation-count', '1');
  await page.locator('#map-3d canvas').click({ position: { x: 360, y: 260 } });
  await expect(page.getByRole('dialog', { name: '添加 3D 标记' })).toBeVisible({
    timeout: 10_000
  });
  await page.locator('.annotation-type-input').selectOption('risk');
  await page.locator('.annotation-title-input').fill('坡道路口');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.locator('#map-3d')).toHaveAttribute('data-annotation-count', '2');
  await expect
    .poll(async () =>
      page.locator('#map-3d canvas').evaluate(canvas => {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return 0;
        let drawnSamples = 0;
        const pixel = new Uint8Array(4);
        const samples = [
          [0.5, 0.5],
          [0.34, 0.44],
          [0.66, 0.44],
          [0.42, 0.62],
          [0.58, 0.62]
        ];
        for (const [xRatio, yRatio] of samples) {
          gl.readPixels(
            Math.floor(canvas.width * xRatio),
            Math.floor(canvas.height * yRatio),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel
          );
          if (pixel[3] > 0) drawnSamples += 1;
        }
        return drawnSamples;
      })
    )
    .toBeGreaterThan(3);

  await page.locator('#map-3d-toggle').click();
  await expect(page.locator('#map-3d')).toBeHidden({ timeout: 15_000 });
});

test('desktop 3D renders attributable water, roads, and deck-first bridges', async ({
  page,
  isMobile
}) => {
  test.setTimeout(75_000);
  await openSeededDesktop(page, isMobile, { workspace: createGeoAssetWorkspace() });

  await page.getByRole('button', { name: 'Day 1' }).click();
  await page.locator('#map-3d-toggle').click();

  await expect(page.locator('#map-3d canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#map-3d')).toHaveAttribute('data-water-carve-count', '1');
  await expect(page.locator('#map-3d')).toHaveAttribute('data-waterway-count', '1');
  await expect(page.locator('#map-3d')).toHaveAttribute('data-road-count', '1');
  await expect(page.locator('#map-3d')).toHaveAttribute('data-bridge-count', '1');

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const debug = window.__threeDebug__ || {};
        return {
          waterwayCount: debug.geoAssetCounts?.waterways || 0,
          roadCount: debug.geoAssetCounts?.roads || 0,
          bridgeCount: debug.geoAssetCounts?.bridges || 0,
          waterMeshes: debug.counts?.waterMeshes || 0,
          roadMeshes: debug.counts?.roadMeshes || 0,
          bridgeDecks: debug.counts?.bridgeDecks || 0,
          bridgePiers: debug.counts?.bridgePiers || 0,
          providers: debug.provenance?.providers || []
        };
      })
    )
    .toMatchObject({
      waterwayCount: 1,
      roadCount: 1,
      bridgeCount: 1,
      waterMeshes: 1,
      roadMeshes: 1,
      bridgeDecks: 1,
      bridgePiers: 0
    });
  const geoDebug = await page.evaluate(() => window.__threeDebug__ || {});
  expect(geoDebug.provenance?.providers || []).toContain('test-open-data');
});

test('desktop 3D camera supports unlocked WASD translation with terrain y clamp', async ({
  page,
  isMobile
}) => {
  test.setTimeout(75_000);
  await openSeededDesktop(page, isMobile);

  await page.getByRole('button', { name: 'Day 1' }).click();
  await page.locator('#map-3d-toggle').click();

  await expect(page.locator('#map-3d canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => page.evaluate(() => window.__threeDebug__?.phase)).toBe('steady');

  const before = await page.evaluate(() => window.__threeDebug__?.camera);
  const metrics = await page.evaluate(() => window.__threeDebug__?.geometryMetrics || {});
  expect(metrics.routeClearanceP95Meters).toBeGreaterThan(0);
  expect(metrics.routeClearanceP95Meters).toBeLessThanOrEqual(0.3);
  expect(metrics.buildingBaseTerrainErrorP95Meters).toBeLessThanOrEqual(0.25);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyW');
  const afterForward = await page.evaluate(() => window.__threeDebug__?.camera);

  expect(afterForward.position.x).not.toBe(before.position.x);
  expect(afterForward.position.z).not.toBe(before.position.z);
  expect(afterForward.clearance).toBeGreaterThanOrEqual(afterForward.minClearance);
  expect(afterForward.clearance).toBeLessThanOrEqual(afterForward.maxClearance);

  await page.keyboard.down('KeyD');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyD');
  const afterRight = await page.evaluate(() => window.__threeDebug__?.camera);

  expect(afterRight.position.x).not.toBe(afterForward.position.x);
  expect(afterRight.position.z).not.toBe(afterForward.position.z);
  expect(afterRight.clearance).toBeGreaterThanOrEqual(afterRight.minClearance);
  expect(afterRight.clearance).toBeLessThanOrEqual(afterRight.maxClearance);
});

test('desktop falls back to local 2D map when AMap JS SDK fails', async ({ page, isMobile }) => {
  test.setTimeout(60_000);
  await openSeededDesktop(page, isMobile, {
    mockAMap: false,
    forceAmapFailure: true,
    blockAmapLoader: true
  });

  await expect(page.locator('#map')).toHaveAttribute('data-map-provider', 'local-fallback', {
    timeout: 20_000
  });
  await expect(page.locator('#status-panel')).toContainText(/本地 2D|已完成|路线/);
  await expect(page.locator('.fallback-map')).toBeVisible();
});

test('desktop 3D stays open after 60 seconds idle', async ({ page, isMobile }) => {
  test.setTimeout(110_000);
  await openSeededDesktop(page, isMobile);

  await page.getByRole('button', { name: 'Day 1' }).click();
  await page.locator('#map-3d-toggle').click();

  await expect(page.locator('#map-3d canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#map-3d-toggle')).toContainText('2D');
  await expect.poll(async () => page.evaluate(() => window.__threeDebug__?.phase)).toBe('steady');

  await page.waitForTimeout(61_000);

  await expect(page.locator('#map-3d')).toBeVisible();
  await expect(page.locator('#map-3d-toggle')).toContainText('2D');
  await expect.poll(async () => page.evaluate(() => window.__threeDebug__?.phase)).toBe('steady');
});

test('desktop can open share image preview from seeded trip', async ({ page, isMobile }) => {
  await openSeededDesktop(page, isMobile);

  await page.getByRole('button', { name: '分享长图' }).click();
  await expect(page.getByRole('dialog', { name: '分享长图' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.share-image-preview img')).toHaveAttribute('src', /^data:image\/png/);
  await expect(page.locator('.share-include-notes')).toBeChecked();
  await expect(page.locator('.share-include-routes')).not.toBeChecked();
  await expect(page.locator('.share-include-unscheduled')).not.toBeChecked();
  await expect(page.locator('.share-include-annotations')).not.toBeChecked();

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
  const thirdSrc = await page.locator('.share-image-preview img').getAttribute('src');
  await page.locator('.share-include-annotations').check();
  await expect(page.locator('.share-image-loading')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('.share-image-preview img')).not.toHaveAttribute('src', thirdSrc || '');
  await expect(page.getByRole('button', { name: '下载长图' })).toBeVisible();
});
