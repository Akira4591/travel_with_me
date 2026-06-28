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

export async function openVisualFixture(page, fixture, { freezeEmergence = false } = {}) {
  await installMockAMap(page);
  await installFixtureElevation(page, fixture.demGrid);
  if (freezeEmergence) await installFrozenEmergence(page);
  await seedFixtureWorkspace(page, fixture);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await expect(page.locator('#trip-title-text')).toHaveText(fixture.trip.title, {
    timeout: 15_000
  });
  await enter3DFrom2DSelection(page, getFixtureWorkAreaCenter(fixture));
  await expect(page.locator('#map-3d canvas')).toBeVisible({ timeout: 30_000 });
  if (freezeEmergence) {
    await expect
      .poll(async () =>
        page.evaluate(() => typeof window.__threeDebugControls?.setEmergenceProgress)
      )
      .toBe('function');
  } else {
    await expect.poll(async () => page.evaluate(() => window.__threeDebug__?.phase)).toBe('steady');
  }
  await page.evaluate(expectations => {
    window.__visualFixtureExpectations = expectations;
  }, fixture.expectations);
}

export async function enter3DFrom2DSelection(page, lnglat = null) {
  await page.locator('#map-3d-toggle').click();
  await expect(page.locator('.map-3d-selection-pin')).toBeVisible({ timeout: 5_000 });
  if (lnglat) {
    await page.evaluate(center => {
      const toLngLat = () => ({
        lng: center[0],
        lat: center[1],
        getLng: () => center[0],
        getLat: () => center[1]
      });
      const patchMap = map => {
        if (!map) return;
        map.setCenter?.(center);
        map.containerToLngLat = toLngLat;
        map.unproject = () => center;
      };
      const map = document.querySelector('#map')?.__mapInstance;
      patchMap(map);
      patchMap(window.__mockAMapLastMap);
      (window.__mockAMapMaps || []).forEach(patchMap);
    }, lnglat);
  }
  const map = page.locator('#map');
  const box = await map.boundingBox();
  const x = Math.round((box?.x || 0) + (box?.width || 800) / 2);
  const y = Math.round((box?.y || 0) + (box?.height || 600) / 2);
  await page.mouse.click(x, y);
}

function getFixtureWorkAreaCenter(fixture) {
  const routePaths = fixture.route?.paths || fixture.route?.geometry?.paths || [];
  const routePoints = [
    ...(Array.isArray(fixture.route?.points) ? fixture.route.points : []),
    ...routePaths.flat()
  ].filter(isLngLat);
  if (routePoints.length) return averageLngLat(routePoints);
  const locationPoints = Object.values(fixture.trip?.locations || {})
    .map(location => location.lnglat)
    .filter(isLngLat);
  return locationPoints.length ? averageLngLat(locationPoints) : null;
}

function averageLngLat(points) {
  const sum = points.reduce(
    (total, point) => [total[0] + Number(point[0]), total[1] + Number(point[1])],
    [0, 0]
  );
  return [sum[0] / points.length, sum[1] / points.length];
}

function isLngLat(point) {
  return (
    Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
  );
}

export async function setEmergenceProgress(page, progress) {
  return page.evaluate(value => window.__threeDebugControls?.setEmergenceProgress(value), progress);
}

export async function finishFrozenEmergence(page) {
  return page.evaluate(() => window.__threeDebugControls?.finishEmergence());
}

export async function focusFrozenRoute(page, segmentId) {
  return page.evaluate(value => window.__threeDebugControls?.focusRoute(value), segmentId);
}

export async function setVisualCameraPreset(page, name, preset) {
  return page.evaluate(
    ({ modeName, cameraPreset }) =>
      window.__threeDebugControls?.setCameraPreset(modeName, cameraPreset),
    { modeName: name, cameraPreset: preset }
  );
}

export async function exportVisualQa(page, fixture, capturePoint) {
  const visual = await measureRouteVisualMetrics(page);
  const waterVisual = await measureWaterVisualMetrics(page);
  const qa = await page.evaluate(
    ({ fixtureId, point, visualMetrics, waterMetrics }) => {
      const debug = window.__threeDebug__ || {};
      return {
        capturePoint: point,
        fixtureId,
        phase: debug.phase,
        terrainMode: debug.terrainMode,
        terrainConfidence: debug.terrainConfidence,
        elevationRange: debug.elevationRange,
        fixture: debug.fixture || {},
        camera: debug.camera || {},
        foundationProgress: debug.foundationProgress,
        terrainRefineProgress: debug.terrainRefineProgress,
        carvingProgress: debug.carvingProgress,
        roadBridgeProgress: debug.roadBridgeProgress,
        routeDrawProgress: debug.routeDrawProgress,
        buildingMassingProgress: debug.buildingMassingProgress,
        buildingDissolveProgress: debug.buildingDissolveProgress,
        qa: debug.qa || {},
        counts: debug.counts || {},
        geoAssetCounts: debug.geoAssetCounts || {},
        routeHashes: debug.routeHashes || [],
        routeEndpointKeys: debug.routeEndpointKeys || [],
        provenanceSourceCount: debug.provenanceSourceCount || 0,
        expectations: window.__visualFixtureExpectations || {},
        visual: visualMetrics,
        waterVisual: waterMetrics
      };
    },
    { fixtureId: fixture.id, point: capturePoint, visualMetrics: visual, waterMetrics: waterVisual }
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

export async function measureWaterVisualMetrics(page) {
  return page.evaluate(() => {
    function isWaterBlue(pixel) {
      const [r, g, b, a] = pixel;
      return (
        a > 10 &&
        r >= 95 &&
        r <= 205 &&
        g >= 105 &&
        g <= 215 &&
        b >= 115 &&
        b <= 230 &&
        b >= r * 0.9 &&
        b >= g * 0.95
      );
    }
    function isBoneWhite(pixel) {
      const [r, g, b, a] = pixel;
      return a > 10 && r >= 232 && g >= 228 && b >= 218;
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
        waterBluePixelRatio: 0,
        waterBluePixelCount: 0,
        terrainBlankPixelRatio: 0
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
    let waterPixels = 0;
    let terrainBlankPixels = 0;

    for (let y = yMin; y < yMax; y += stride) {
      for (let x = xMin; x < xMax; x += stride) {
        gl.readPixels(x, height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        sampledPixels += 1;
        if (isWaterBlue(pixel)) waterPixels += 1;
        else if (isBoneWhite(pixel)) terrainBlankPixels += 1;
      }
    }

    return {
      readable: waterPixels > 0,
      sampledPixels,
      waterBluePixelRatio: ratio(waterPixels, sampledPixels),
      waterBluePixelCount: waterPixels,
      terrainBlankPixelRatio: ratio(terrainBlankPixels, sampledPixels)
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
    'carved-geography': { x: 300, y: 90, width: 620, height: 390 },
    'water-road-bridge': { x: 300, y: 90, width: 620, height: 390 },
    'route-highlight': { x: 260, y: 90, width: 620, height: 400 },
    'building-massing': { x: 250, y: 70, width: 620, height: 420 },
    'building-dissolve': { x: 250, y: 70, width: 620, height: 420 },
    'route-focus': { x: 260, y: 90, width: 620, height: 400 },
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
  await page.addInitScript(grid => {
    window.__visualExpose3DControls = true;
    window.__visualFixtureElevationGrid = grid;
  }, demGrid);
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

async function installFrozenEmergence(page) {
  await page.addInitScript(() => {
    window.__visualFreezeEmergence = true;
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
        this.container = typeof id === 'string' ? document.getElementById(id) : id;
        this.zoom = options.zoom || 16;
        this.center = options.center || [116.397, 39.908];
        this.handlers = new Map();
        this.bounds = null;
        window.__mockAMapMaps = [...(window.__mockAMapMaps || []), this];
        window.__mockAMapLastMap = this;
      }
      addControl() {}
      add() {}
      remove() {}
      resize() {}
      on(event, handler) {
        this.handlers.set(event, handler);
      }
      off(event, handler) {
        if (this.handlers.get(event) === handler) this.handlers.delete(event);
      }
      setFitView(markers = []) {
        const points = markers.map(marker => toPair(marker.getPosition?.())).filter(Boolean);
        if (!points.length) return;
        const lngs = points.map(point => point[0]);
        const lats = points.map(point => point[1]);
        this.bounds = {
          minLng: Math.min(...lngs),
          maxLng: Math.max(...lngs),
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats)
        };
        this.center = [
          (this.bounds.minLng + this.bounds.maxLng) / 2,
          (this.bounds.minLat + this.bounds.maxLat) / 2
        ];
      }
      setCenter(center) {
        this.center = center;
        this.bounds = null;
      }
      setZoomAndCenter(zoom, center) {
        this.zoom = zoom;
        this.center = center;
        this.bounds = null;
      }
      getZoom() {
        return this.zoom;
      }
      getCenter() {
        const [lng, lat] = toPair(this.center);
        return new MockLngLat(lng, lat);
      }
      containerToLngLat(pixel) {
        const rect = this.container?.getBoundingClientRect?.() || { width: 900, height: 600 };
        const x = Number(pixel?.x ?? pixel?.[0] ?? rect.width / 2);
        const y = Number(pixel?.y ?? pixel?.[1] ?? rect.height / 2);
        const bounds = this.bounds || {
          minLng: this.center[0] - 0.01,
          maxLng: this.center[0] + 0.01,
          minLat: this.center[1] - 0.01,
          maxLat: this.center[1] + 0.01
        };
        const lngSpan = Math.max(0.002, bounds.maxLng - bounds.minLng);
        const latSpan = Math.max(0.002, bounds.maxLat - bounds.minLat);
        const lng = bounds.minLng + (x / Math.max(1, rect.width)) * lngSpan;
        const lat = bounds.maxLat - (y / Math.max(1, rect.height)) * latSpan;
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
      getPosition() {
        const [lng, lat] = toPair(this.options.position);
        return new MockLngLat(lng, lat);
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
