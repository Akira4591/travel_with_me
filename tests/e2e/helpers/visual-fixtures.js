import { readFile } from 'node:fs/promises';

import { expect } from '@playwright/test';

const FIXTURE_ROOT = new URL('../../fixtures/scenes/', import.meta.url);
const WORKSPACE_KEY = 'trip-app:workspace';

export async function loadSceneFixture(sceneId) {
  const root = new URL(`${sceneId}/`, FIXTURE_ROOT);
  const [trip, route, geoAssets, demGrid, cameraPresets, expectations] = await Promise.all([
    readJson(new URL('trip.json', root)),
    readJson(new URL('route.json', root)),
    readJson(new URL('geo-assets.json', root)),
    readJson(new URL('dem-grid.json', root)),
    readJson(new URL('camera-presets.json', root)),
    readJson(new URL('expectations.json', root))
  ]);
  return {
    id: sceneId,
    trip: {
      ...normalizeFixtureTripRoutes(trip),
      geoAssets,
      visualFixture: {
        id: sceneId,
        routeHash: route.hash,
        cameraPresets
      }
    },
    route,
    geoAssets,
    demGrid,
    cameraPresets,
    expectations
  };
}

export async function openVisualFixture(page, fixture) {
  await installMockAMap(page);
  await installFixtureElevation(page, fixture.demGrid);
  await seedFixtureWorkspace(page, fixture);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await expect(page.locator('#trip-title-text')).toHaveText(fixture.trip.title, {
    timeout: 15_000
  });
  await page.locator('#map-3d-toggle').click();
  await expect(page.locator('#map-3d canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => page.evaluate(() => window.__threeDebug__?.phase)).toBe('steady');
  await page.evaluate(expectations => {
    window.__visualFixtureExpectations = expectations;
  }, fixture.expectations);
}

export async function exportVisualQa(page, fixture, capturePoint) {
  const visual = await measureRouteVisualMetrics(page);
  const qa = await page.evaluate(
    ({ fixtureId, point, visualMetrics }) => {
      const debug = window.__threeDebug__ || {};
      return {
        capturePoint: point,
        fixtureId,
        phase: debug.phase,
        fixture: debug.fixture || {},
        camera: debug.camera || {},
        qa: debug.qa || {},
        counts: debug.counts || {},
        geoAssetCounts: debug.geoAssetCounts || {},
        routeHashes: debug.routeHashes || [],
        routeEndpointKeys: debug.routeEndpointKeys || [],
        provenanceSourceCount: debug.provenanceSourceCount || 0,
        expectations: window.__visualFixtureExpectations || {},
        visual: visualMetrics
      };
    },
    { fixtureId: fixture.id, point: capturePoint, visualMetrics: visual }
  );
  return qa;
}

export async function measureRouteVisualMetrics(page) {
  return page.evaluate(() => {
    function isIndustrialRouteYellow(pixel) {
      const [r, g, b, a] = pixel;
      return a > 10 && r >= 145 && g >= 90 && g <= 230 && b <= 105 && r >= g && g >= b * 1.3;
    }
    function ratio(numerator, denominator) {
      const bottom = Number(denominator) || 0;
      if (bottom <= 0) return 0;
      return Number(((Number(numerator) || 0) / bottom).toFixed(5));
    }

    const canvas = document.querySelector('#map-3d canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    if (!canvas || !gl) {
      return {
        readable: false,
        sampledPixels: 0,
        opaquePixelRatio: 0,
        routeYellowPixelRatio: 0,
        yellowPixelCount: 0
      };
    }
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const xMin = Math.floor(width * 0.18);
    const xMax = Math.floor(width * 0.92);
    const yMin = Math.floor(height * 0.12);
    const yMax = Math.floor(height * 0.88);
    const stride = Math.max(3, Math.floor(Math.min(width, height) / 180));
    const pixel = new Uint8Array(4);
    let sampledPixels = 0;
    let opaquePixels = 0;
    let yellowPixels = 0;

    for (let y = yMin; y < yMax; y += stride) {
      for (let x = xMin; x < xMax; x += stride) {
        gl.readPixels(x, height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        sampledPixels += 1;
        if (pixel[3] > 10) opaquePixels += 1;
        if (isIndustrialRouteYellow(pixel)) yellowPixels += 1;
      }
    }

    return {
      readable: yellowPixels > 0,
      sampledPixels,
      opaquePixelRatio: ratio(opaquePixels, sampledPixels),
      routeYellowPixelRatio: ratio(yellowPixels, sampledPixels),
      yellowPixelCount: yellowPixels
    };
  });
}

export async function attachVisualEvidence(testInfo, { fixture, capturePoint, qa, screenshot }) {
  await testInfo.attach(`${fixture.id}-${capturePoint}-qa.json`, {
    body: JSON.stringify(qa, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach(`${fixture.id}-${capturePoint}-fixture.json`, {
    body: JSON.stringify(
      {
        trip: fixture.trip,
        route: fixture.route,
        expectations: fixture.expectations
      },
      null,
      2
    ),
    contentType: 'application/json'
  });
  await testInfo.attach(`${fixture.id}-${capturePoint}-camera.json`, {
    body: JSON.stringify(fixture.cameraPresets, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach(`${fixture.id}-${capturePoint}.png`, {
    body: screenshot,
    contentType: 'image/png'
  });
}

export function visualRoiFor(capturePoint) {
  const rois = {
    'foundation-rise': { x: 280, y: 80, width: 560, height: 360 },
    'water-road-bridge': { x: 300, y: 90, width: 620, height: 390 },
    'route-highlight': { x: 260, y: 90, width: 620, height: 400 },
    'building-massing': { x: 250, y: 70, width: 620, height: 420 },
    inspect: { x: 310, y: 80, width: 560, height: 390 }
  };
  return rois[capturePoint] || rois['route-highlight'];
}

async function seedFixtureWorkspace(page, fixture) {
  await page.addInitScript(
    ({ storageKey, trip }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 5,
          savedAt: Date.now(),
          workspace: {
            trips: [trip],
            activeTripId: trip.id
          }
        })
      );
    },
    { storageKey: WORKSPACE_KEY, trip: fixture.trip }
  );
}

async function installFixtureElevation(page, demGrid) {
  const values = (demGrid.heights || []).flat();
  await page.route('**/_elevation**', async route => {
    const url = new URL(route.request().url());
    const count =
      (url.searchParams.get('latitude') || '').split(',').filter(Boolean).length ||
      values.length ||
      1;
    const elevation = Array.from(
      { length: count },
      (_, index) => values[index % values.length] || 40
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ elevation })
    });
  });
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
        this.zoom = options.zoom || 16;
        this.center = options.center || [116.397, 39.908];
        this.handlers = new Map();
      }
      addControl() {}
      add() {}
      remove() {}
      resize() {}
      on(event, handler) {
        this.handlers.set(event, handler);
      }
      setFitView() {}
      setCenter(center) {
        this.center = center;
      }
      setZoomAndCenter(zoom, center) {
        this.zoom = zoom;
        this.center = center;
      }
      getZoom() {
        return this.zoom;
      }
      getCenter() {
        const [lng, lat] = toPair(this.center);
        return new MockLngLat(lng, lat);
      }
      destroy() {}
    }

    class MockMarker {
      constructor(options = {}) {
        this.options = options;
      }
      on() {}
      setMap() {}
      setPosition(position) {
        this.options.position = position;
      }
    }

    class MockPolyline {
      constructor(options = {}) {
        this.options = options;
      }
      setMap() {}
      setPath(path) {
        this.options.path = path;
      }
    }

    window.AMap = {
      __mock: true,
      Map: MockMap,
      Marker: MockMarker,
      Polyline: MockPolyline,
      LngLat: MockLngLat,
      Pixel: class MockPixel {},
      Size: class MockSize {},
      Scale: class MockScale {},
      ToolBar: class MockToolBar {},
      ControlBar: class MockControlBar {},
      Geocoder: class MockGeocoder {
        getAddress(_lnglat, callback) {
          callback('complete', { regeocode: { formattedAddress: 'Fixture address' } });
        }
      },
      plugin(_plugins, callback) {
        callback?.();
      }
    };
    window.AMapLoader = {
      load: () => Promise.resolve(window.AMap)
    };
  });
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

function normalizeFixtureTripRoutes(trip) {
  return {
    ...trip,
    days: (trip.days || []).map(day => ({
      ...day,
      events: (day.events || []).map(event => {
        const route = event.routeToNext;
        if (!route?.geometry || !Array.isArray(route.geometry)) return event;
        return {
          ...event,
          routeToNext: {
            ...route,
            geometry: {
              source: route.source || 'fixture',
              mode: route.mode || 'walking',
              paths: [route.geometry],
              fetchedAt: route.fetchedAt || '2026-06-22T00:00:00.000Z'
            }
          }
        };
      })
    }))
  };
}
