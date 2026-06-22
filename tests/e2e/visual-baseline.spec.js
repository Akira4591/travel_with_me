import { expect, test } from '@playwright/test';

import {
  attachVisualEvidence,
  exportVisualQa,
  loadSceneFixture,
  measureRouteVisualMetrics,
  openVisualFixture,
  visualRoiFor
} from './helpers/visual-fixtures.js';

const ASSERT_SCREENSHOTS = process.env.VISUAL_BASELINE_ASSERT === '1';
const ROUTE_YELLOW_PIXEL_RATIO_MIN = 0.00008;
const WATER_BLUE_PIXEL_RATIO_MIN = 0.00008;
const STRESS_DURATION_MS = 30_000;
const STRESS_SAMPLE_INTERVAL_MS = 5_000;
const STRESS_TEST_TIMEOUT_MS = 150_000;

const CAPTURES = [
  {
    scene: 'river-bridge',
    point: 'water-road-bridge',
    assert(qa) {
      expect(qa.qa.version).toBe(1);
      expect(qa.qa.geometry.waterCoverageRatio).toBeGreaterThanOrEqual(0.97);
      expect(qa.qa.geometry.bridgeContinuity).toBeGreaterThanOrEqual(0.95);
      expect(qa.qa.geometry.terrainCarvingDepthP50).toBeGreaterThanOrEqual(
        qa.expectations.water.minChannelDepthMeters
      );
      expect(qa.qa.geometry.routeVisiblePixelRatio).toBeGreaterThanOrEqual(0.9);
      expect(qa.visual.readable).toBe(true);
      expect(qa.visual.routeYellowPixelRatio).toBeGreaterThanOrEqual(ROUTE_YELLOW_PIXEL_RATIO_MIN);
      expect(qa.waterVisual.readable).toBe(true);
      expect(qa.waterVisual.waterBluePixelRatio).toBeGreaterThanOrEqual(WATER_BLUE_PIXEL_RATIO_MIN);
      expect(qa.qa.geometry.bridgePierCount).toBe(0);
      expect(qa.qa.geometry.zFightingRisk).toBeLessThanOrEqual(0.01);
      expect(qa.counts.waterMeshes).toBeGreaterThan(0);
      expect(qa.counts.bridgeDecks).toBeGreaterThan(0);
    }
  },
  {
    scene: 'micro-street',
    point: 'building-massing',
    assert(qa) {
      expect(qa.qa.version).toBe(1);
      expect(qa.qa.geometry.buildingBaseTerrainErrorP95).toBeLessThanOrEqual(0.25);
      expect(qa.qa.layers.route.visible).toBe(true);
      expect(qa.qa.layers.buildings.count).toBeGreaterThan(0);
    }
  },
  {
    scene: 'hiking-terrain',
    point: 'route-highlight',
    assert(qa) {
      expect(qa.qa.version).toBe(1);
      expect(qa.qa.layers.route.visible).toBe(true);
      expect(qa.qa.geometry.terrainHeightVariance).toBeGreaterThanOrEqual(0);
      expect(qa.geoAssetCounts.landcover).toBeGreaterThan(0);
      expect(qa.qa.budgets.vegetationAreaCount).toBeGreaterThan(0);
      expect(qa.qa.budgets.vegetationMaxInstancesPerArea).toBeLessThanOrEqual(
        qa.qa.budgets.vegetationDensityCap
      );
    }
  }
];

test.describe('@visual-roi desktop 3D visual baseline harness', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const capture of CAPTURES) {
    test(`${capture.scene} ${capture.point} emits QA and ROI evidence`, async ({
      page
    }, testInfo) => {
      test.setTimeout(75_000);
      const fixture = await loadSceneFixture(capture.scene);
      await openVisualFixture(page, fixture);
      await page.addStyleTag({ path: 'tests/visual/styles/screenshot-normalize.css' });

      const screenshot = await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        clip: visualRoiFor(capture.point)
      });
      const qa = await exportVisualQa(page, fixture, capture.point);
      await attachVisualEvidence(testInfo, {
        fixture,
        capturePoint: capture.point,
        qa,
        screenshot
      });
      capture.assert(qa);

      if (ASSERT_SCREENSHOTS) {
        await expect(page).toHaveScreenshot(`${capture.scene}-${capture.point}.png`, {
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
          clip: visualRoiFor(capture.point),
          maxDiffPixelRatio: 0.03,
          threshold: 0.2
        });
      }
    });
  }

  test('river-bridge route remains readable after short camera interaction', async ({
    page
  }, testInfo) => {
    test.setTimeout(75_000);
    const fixture = await loadSceneFixture('river-bridge');
    await openVisualFixture(page, fixture);
    const before = await measureRouteVisualMetrics(page);

    await page.locator('#map-3d canvas').dragTo(page.locator('#map-3d canvas'), {
      sourcePosition: { x: 520, y: 320 },
      targetPosition: { x: 640, y: 350 }
    });
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(250);
    await page.keyboard.up('KeyD');
    await expect.poll(async () => page.evaluate(() => window.__threeDebug__?.phase)).toBe('steady');

    const after = await exportVisualQa(page, fixture, 'water-road-bridge-interaction');
    await testInfo.attach('river-bridge-interaction-visual-before.json', {
      body: JSON.stringify(before, null, 2),
      contentType: 'application/json'
    });
    await attachVisualEvidence(testInfo, {
      fixture,
      capturePoint: 'water-road-bridge-interaction',
      qa: after,
      screenshot: await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        clip: visualRoiFor('water-road-bridge')
      })
    });

    expect(before.readable).toBe(true);
    expect(after.visual.readable).toBe(true);
    expect(after.visual.routeYellowPixelRatio).toBeGreaterThanOrEqual(ROUTE_YELLOW_PIXEL_RATIO_MIN);
    expect(after.qa.geometry.zFightingRisk).toBeLessThanOrEqual(0.01);
    expect(after.phase).toBe('steady');
  });

  test('river-bridge route remains readable during 30s camera stress', async ({
    page
  }, testInfo) => {
    test.setTimeout(STRESS_TEST_TIMEOUT_MS);
    const fixture = await loadSceneFixture('river-bridge');
    await openVisualFixture(page, fixture);
    await page.addStyleTag({ path: 'tests/visual/styles/screenshot-normalize.css' });
    const stress = await runCameraStress(page, fixture);
    const finalQa = await exportVisualQa(page, fixture, 'camera-stress-final');

    await testInfo.attach('river-bridge-camera-stress-samples.json', {
      body: JSON.stringify(
        {
          durationMs: stress.durationMs,
          minRouteYellowPixelRatio: stress.minRouteYellowPixelRatio,
          maxZFightingRisk: stress.maxZFightingRisk,
          nonSteadySamples: stress.nonSteadySamples.length,
          samples: stress.samples
        },
        null,
        2
      ),
      contentType: 'application/json'
    });
    await attachVisualEvidence(testInfo, {
      fixture,
      capturePoint: 'camera-stress-final',
      qa: finalQa,
      screenshot: await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        clip: visualRoiFor('water-road-bridge')
      })
    });

    assertCameraStress(stress);
    expect(finalQa.visual.readable).toBe(true);
    expect(finalQa.phase).toBe('steady');
  });

  test('micro-street route remains readable during 30s dense-building camera stress', async ({
    page
  }, testInfo) => {
    test.setTimeout(STRESS_TEST_TIMEOUT_MS);
    const fixture = await loadSceneFixture('micro-street');
    await openVisualFixture(page, fixture);
    await page.addStyleTag({ path: 'tests/visual/styles/screenshot-normalize.css' });
    const stress = await runCameraStress(page, fixture);
    const finalQa = await exportVisualQa(page, fixture, 'dense-building-camera-stress-final');

    await testInfo.attach('micro-street-camera-stress-samples.json', {
      body: JSON.stringify(
        {
          durationMs: stress.durationMs,
          minRouteYellowPixelRatio: stress.minRouteYellowPixelRatio,
          maxZFightingRisk: stress.maxZFightingRisk,
          nonSteadySamples: stress.nonSteadySamples.length,
          samples: stress.samples
        },
        null,
        2
      ),
      contentType: 'application/json'
    });
    await attachVisualEvidence(testInfo, {
      fixture,
      capturePoint: 'dense-building-camera-stress-final',
      qa: finalQa,
      screenshot: await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        clip: visualRoiFor('building-massing')
      })
    });

    assertCameraStress(stress);
    expect(finalQa.qa.layers.buildings.count).toBeGreaterThan(0);
    expect(finalQa.visual.readable).toBe(true);
    expect(finalQa.phase).toBe('steady');
  });

  test('hiking-terrain route remains readable during 30s terrain camera stress', async ({
    page
  }, testInfo) => {
    test.setTimeout(STRESS_TEST_TIMEOUT_MS);
    const fixture = await loadSceneFixture('hiking-terrain');
    await openVisualFixture(page, fixture);
    await page.addStyleTag({ path: 'tests/visual/styles/screenshot-normalize.css' });
    const stress = await runCameraStress(page, fixture, { minSamples: 2 });
    const finalQa = await exportVisualQa(page, fixture, 'terrain-camera-stress-final');

    await testInfo.attach('hiking-terrain-camera-stress-samples.json', {
      body: JSON.stringify(
        {
          durationMs: stress.durationMs,
          minRouteYellowPixelRatio: stress.minRouteYellowPixelRatio,
          maxZFightingRisk: stress.maxZFightingRisk,
          nonSteadySamples: stress.nonSteadySamples.length,
          samples: stress.samples
        },
        null,
        2
      ),
      contentType: 'application/json'
    });
    await attachVisualEvidence(testInfo, {
      fixture,
      capturePoint: 'terrain-camera-stress-final',
      qa: finalQa,
      screenshot: await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        clip: visualRoiFor('route-highlight')
      })
    });

    assertCameraStress(stress, { minSamples: 2 });
    expect(finalQa.geoAssetCounts.landcover).toBeGreaterThan(0);
    expect(finalQa.qa.budgets.vegetationMaxInstancesPerArea).toBeLessThanOrEqual(
      finalQa.qa.budgets.vegetationDensityCap
    );
    expect(finalQa.visual.readable).toBe(true);
    expect(finalQa.phase).toBe('steady');
  });

  test('micro-street inspect view remains readable with clamped close camera', async ({
    page
  }, testInfo) => {
    test.setTimeout(75_000);
    const fixture = await loadSceneFixture('micro-street');
    await openVisualFixture(page, fixture);
    await page.addStyleTag({ path: 'tests/visual/styles/screenshot-normalize.css' });
    const canvas = page.locator('#map-3d canvas');
    await canvas.hover();

    await page.mouse.wheel(0, -5200);
    await expect
      .poll(async () => page.evaluate(() => window.__threeDebug__?.camera?.mode || ''), {
        timeout: 8_000
      })
      .toBe('inspect');
    const inspect = await exportVisualQa(page, fixture, 'inspect');

    await attachVisualEvidence(testInfo, {
      fixture,
      capturePoint: 'inspect',
      qa: inspect,
      screenshot: await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        clip: visualRoiFor('inspect')
      })
    });

    expect(inspect.camera.mode).toBe('inspect');
    expect(inspect.camera.clearance).toBeGreaterThanOrEqual(inspect.camera.minClearance);
    expect(inspect.camera.clearance).toBeLessThanOrEqual(inspect.camera.maxClearance);
    expect(inspect.qa.layers.route.visible).toBe(true);
    expect(inspect.qa.layers.buildings.count).toBeGreaterThan(0);
    expect(inspect.qa.lod.buildingDetailAlphaAverage).toBeGreaterThan(0);
    expect(inspect.visual.readable).toBe(true);
    expect(inspect.visual.routeYellowPixelRatio).toBeGreaterThanOrEqual(
      ROUTE_YELLOW_PIXEL_RATIO_MIN
    );
    expect(inspect.qa.geometry.zFightingRisk).toBeLessThanOrEqual(0.01);
    expect(inspect.phase).toBe('steady');
  });

  test('micro-street building LOD increases in inspect distance and decreases at overview distance', async ({
    page
  }, testInfo) => {
    test.setTimeout(75_000);
    const fixture = await loadSceneFixture('micro-street');
    await openVisualFixture(page, fixture);
    await page.addStyleTag({ path: 'tests/visual/styles/screenshot-normalize.css' });
    const canvas = page.locator('#map-3d canvas');
    await canvas.hover();

    await page.mouse.wheel(0, 2400);
    await page.waitForTimeout(900);
    const overview = await exportVisualQa(page, fixture, 'building-lod-overview');

    await page.mouse.wheel(0, -5200);
    await expect
      .poll(
        async () =>
          page.evaluate(() => window.__threeDebug__?.qa?.lod?.buildingDetailAlphaAverage || 0),
        { timeout: 5_000 }
      )
      .toBeGreaterThan(overview.qa.lod.buildingDetailAlphaAverage);
    const inspect = await exportVisualQa(page, fixture, 'building-lod-inspect');

    await page.mouse.wheel(0, 5200);
    await expect
      .poll(
        async () =>
          page.evaluate(() => window.__threeDebug__?.qa?.lod?.buildingDetailAlphaAverage || 0),
        { timeout: 5_000 }
      )
      .toBeLessThan(inspect.qa.lod.buildingDetailAlphaAverage);
    const returned = await exportVisualQa(page, fixture, 'building-lod-returned-overview');

    await attachVisualEvidence(testInfo, {
      fixture,
      capturePoint: 'building-lod-inspect',
      qa: inspect,
      screenshot: await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        clip: visualRoiFor('inspect')
      })
    });
    await testInfo.attach('micro-street-building-lod-overview.json', {
      body: JSON.stringify(overview, null, 2),
      contentType: 'application/json'
    });
    await testInfo.attach('micro-street-building-lod-returned-overview.json', {
      body: JSON.stringify(returned, null, 2),
      contentType: 'application/json'
    });

    expect(inspect.qa.lod.buildingEntryCount).toBeGreaterThan(0);
    expect(inspect.qa.lod.buildingDetailAlphaAverage).toBeGreaterThan(
      overview.qa.lod.buildingDetailAlphaAverage
    );
    expect(inspect.qa.lod.buildingDetailRatio).toBeGreaterThanOrEqual(
      overview.qa.lod.buildingDetailRatio
    );
    expect(returned.qa.lod.buildingDetailAlphaAverage).toBeLessThan(
      inspect.qa.lod.buildingDetailAlphaAverage
    );
  });
});

async function runCameraStress(page, fixture, { minSamples = 4 } = {}) {
  const canvas = page.locator('#map-3d canvas');
  await canvas.hover();

  const stressStartedAt = Date.now();
  const samples = [];
  for (
    let index = 0;
    Date.now() - stressStartedAt < STRESS_DURATION_MS || samples.length < minSamples;
    index += 1
  ) {
    const direction = index % 2 === 0 ? 1 : -1;
    await canvas.dragTo(canvas, {
      sourcePosition: { x: 520, y: 320 },
      targetPosition: { x: 520 + direction * 42, y: 332 }
    });
    await page.keyboard.down(index % 2 === 0 ? 'KeyD' : 'KeyA');
    await page.waitForTimeout(220);
    await page.keyboard.up(index % 2 === 0 ? 'KeyD' : 'KeyA');
    await page.mouse.wheel(0, direction * 120);
    await page.waitForTimeout(STRESS_SAMPLE_INTERVAL_MS);
    samples.push(await exportVisualQa(page, fixture, `camera-stress-${index + 1}`));
  }

  return {
    durationMs: Date.now() - stressStartedAt,
    samples,
    minRouteYellowPixelRatio: Math.min(
      ...samples.map(sample => sample.visual.routeYellowPixelRatio)
    ),
    maxZFightingRisk: Math.max(...samples.map(sample => sample.qa.geometry.zFightingRisk)),
    nonSteadySamples: samples.filter(sample => sample.phase !== 'steady')
  };
}

function assertCameraStress(stress, { minSamples = 4 } = {}) {
  expect(stress.durationMs).toBeGreaterThanOrEqual(STRESS_DURATION_MS);
  expect(stress.samples.length).toBeGreaterThanOrEqual(minSamples);
  expect(stress.nonSteadySamples).toEqual([]);
  expect(stress.minRouteYellowPixelRatio).toBeGreaterThanOrEqual(ROUTE_YELLOW_PIXEL_RATIO_MIN);
  expect(stress.maxZFightingRisk).toBeLessThanOrEqual(0.01);
}
