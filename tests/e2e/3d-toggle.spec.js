import { expect, test } from '@playwright/test';

const SEEDED_WORKSPACE = {
  trips: [
    {
      id: 'trip-3d-toggle',
      title: '3D Toggle Test',
      city: '北京',
      locations: {
        loc_a: {
          name: '地点A',
          query: '地点A',
          addr: '北京市东城区A路 1 号',
          lnglat: [116.397, 39.908],
          resolved: true,
          photo: '',
          type: '风景名胜'
        },
        loc_b: {
          name: '地点B',
          query: '地点B',
          addr: '北京市东城区B路 2 号',
          lnglat: [116.405, 39.912],
          resolved: true,
          photo: '',
          type: '餐饮服务'
        }
      },
      days: [
        {
          id: 'day_1',
          title: 'Day 1',
          events: [
            {
              id: 'e1',
              title: 'A',
              icon: 'place',
              locationId: 'loc_a',
              routeToNext: { mode: 'walking' }
            },
            { id: 'e2', title: 'B', icon: 'coffee', locationId: 'loc_b' }
          ]
        }
      ],
      unscheduled: []
    }
  ],
  activeTripId: 'trip-3d-toggle'
};

async function installMockAMap(page) {
  await page.addInitScript(() => {
    const toPair = v => {
      if (Array.isArray(v)) return [Number(v[0]), Number(v[1])];
      if (v?.getLng) return [v.getLng(), v.getLat()];
      return [Number(v?.lng ?? 116.401), Number(v?.lat ?? 39.91)];
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
      constructor() {
        this.zoom = 16;
        this.center = [116.401, 39.91];
        this.handlers = new Map();
      }
      addControl() {}
      add() {}
      remove() {}
      resize() {}
      on(e, h) {
        const arr = this.handlers.get(e) || [];
        arr.push(h);
        this.handlers.set(e, arr);
      }
      getZoom() {
        return this.zoom;
      }
      getCenter() {
        return new MockLngLat(this.center[0], this.center[1]);
      }
      setZoomAndCenter(z, c) {
        this.zoom = Number(z);
        this.center = toPair(c);
      }
      setFitView(markers, immediately, padding, maxZoom) {
        const first = markers?.[0]?.getPosition?.();
        if (first) this.center = toPair(first);
        this.zoom = Math.min(maxZoom || 17, 17);
      }
    }

    const AMap = {
      Map: MockMap,
      ToolBar: class {},
      InfoWindow: class {
        setContent() {}
        open() {}
        close() {}
      },
      Pixel: class {
        constructor(x, y) {
          this.x = x;
          this.y = y;
        }
      },
      Marker: class {
        constructor(o = {}) {
          this.position = o.position || [116.401, 39.91];
        }
        setPosition(p) {
          this.position = p;
        }
        getPosition() {
          const [lng, lat] = toPair(this.position);
          return new MockLngLat(lng, lat);
        }
        on() {}
        show() {}
        hide() {}
      },
      Polyline: class {
        constructor() {}
        setOptions() {}
        show() {}
        hide() {}
      },
      LngLat: MockLngLat,
      PlaceSearch: class {
        search(k, cb) {
          cb('complete', { info: 'OK', poiList: { pois: [] } });
        }
        searchNearBy() {}
      },
      Geocoder: class {
        getLocation(k, cb) {
          cb('complete', { info: 'OK', geocodes: [{ location: new MockLngLat(116.401, 39.91) }] });
        }
        getAddress() {}
      },
      Driving: class {
        search(o, d, cb) {
          cb('complete', {
            info: 'OK',
            routes: [{ distance: 800, time: 600, path: [toPair(o), toPair(d)] }]
          });
        }
        clear() {}
      },
      Walking: class {
        search(o, d, cb) {
          cb('complete', {
            info: 'OK',
            routes: [{ distance: 800, time: 600, path: [toPair(o), toPair(d)] }]
          });
        }
        clear() {}
      },
      Riding: class {
        search() {}
        clear() {}
      },
      Transfer: class {
        search() {}
        clear() {}
      },
      DrivingPolicy: { LEAST_TIME: 0 },
      TransferPolicy: { LEAST_TIME: 0 }
    };

    window.AMapLoader = { load: () => Promise.resolve(AMap) };
  });
}

async function seedWorkspace(page) {
  await page.addInitScript(ws => {
    window.localStorage.setItem(
      'trip-app:workspace',
      JSON.stringify({ version: 5, savedAt: Date.now(), workspace: ws })
    );
  }, SEEDED_WORKSPACE);
}

test.describe('@archived-3d 3D mode toggle', () => {
  test('toggle button appears after map loads on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only');
    await installMockAMap(page);
    await seedWorkspace(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#map-3d-toggle')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#map-3d-toggle')).toContainText('3D');
  });

  test('clicking toggle enters selection mode then cancel', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only');
    await installMockAMap(page);
    await seedWorkspace(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#map-3d-toggle')).toBeVisible({ timeout: 15_000 });

    await page.locator('#map-3d-toggle').click();
    await expect(page.locator('.map-3d-selection-pin')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#map-3d-toggle')).toHaveAttribute(
      'data-state',
      'selecting-3d-center'
    );

    await page.locator('#map-3d-toggle').click();
    await expect(page.locator('.map-3d-selection-pin')).toBeHidden({ timeout: 5_000 });
  });

  test('enter 3D and exit back to 2D', async ({ page, isMobile }) => {
    test.setTimeout(60_000);
    test.skip(isMobile, 'desktop-only');
    await installMockAMap(page);
    await seedWorkspace(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.route('**/_elevation**', async route => {
      const url = new URL(route.request().url());
      const count =
        (url.searchParams.get('latitude') || '').split(',').filter(Boolean).length || 1600;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ elevation: Array.from({ length: count }, () => 42) })
      });
    });

    await expect(page.locator('#map-3d-toggle')).toBeVisible({ timeout: 15_000 });
    await page.locator('#map-3d-toggle').click();
    await expect(page.locator('.map-3d-selection-pin')).toBeVisible({ timeout: 5_000 });

    await page.evaluate(
      center => {
        const map = document.querySelector('#map')?.__mapInstance;
        if (map) {
          map.containerToLngLat = () => ({
            lng: center[0],
            lat: center[1],
            getLng: () => center[0],
            getLat: () => center[1]
          });
          map.unproject = () => center;
        }
      },
      [116.401, 39.91]
    );

    const mapBox = await page.locator('#map').boundingBox();
    await page.mouse.click(
      Math.round((mapBox?.x || 0) + (mapBox?.width || 800) / 2),
      Math.round((mapBox?.y || 0) + (mapBox?.height || 600) / 2)
    );

    await expect(page.locator('#map-3d canvas')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#map-3d-toggle')).toContainText('2D');

    await page.locator('#map-3d-toggle').click();
    await expect(page.locator('#map-3d')).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('#map-3d-toggle')).toContainText('3D');
  });
});
