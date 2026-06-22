import { expect, test } from '@playwright/test';

import {
  attachVisualEvidence,
  exportVisualQa,
  finishFrozenEmergence,
  focusFrozenRoute,
  loadSceneFixture,
  measureRouteVisualMetrics,
  openVisualFixture,
  setEmergenceProgress,
  visualRoiFor
} from './helpers/visual-fixtures.js';

const ASSERT_SCREENSHOTS = process.env.VISUAL_BASELINE_ASSERT === '1';
const ROUTE_YELLOW_PIXEL_RATIO_MIN = 0.00008;
const WATER_BLUE_PIXEL_RATIO_MIN = 0.00008;
const BUILDING_DISSOLVE_ALPHA_STEP_MAX = 0.42;
const BUILDING_DISSOLVE_ALPHA_DROP_TOLERANCE = 0.03;
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

const ROUTE_READABILITY_SCENES = [
  {
    scene: 'old-street',
    minBuildings: 4,
    minLandmarks: 0
  },
  {
    scene: 'landmark-pilot',
    minBuildings: 2,
    minLandmarks: 1
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

  test('river-bridge captures timeline visual stages from foundation to route focus', async ({
    page
  }, testInfo) => {
    test.setTimeout(120_000);
    const fixture = await loadSceneFixture('river-bridge');
    await openVisualFixture(page, fixture, { freezeEmergence: true });
    await page.addStyleTag({ path: 'tests/visual/styles/screenshot-normalize.css' });

    const timelineCaptures = [
      {
        point: 'foundation-rise',
        progress: 0.14,
        phase: 'slab-rise',
        assert(qa) {
          expect(qa.foundationProgress).toBeGreaterThan(0);
          expect(qa.foundationProgress).toBeLessThan(1);
          expect(qa.routeDrawProgress).toBe(0);
          expect(qa.buildingMassingProgress).toBe(0);
        }
      },
      {
        point: 'carved-geography',
        progress: 0.38,
        phase: 'water-carve',
        assert(qa) {
          expect(qa.carvingProgress).toBeGreaterThan(0);
          expect(qa.roadBridgeProgress).toBeGreaterThan(0);
          expect(qa.counts.waterMeshes).toBeGreaterThan(0);
          expect(qa.qa.layers.roads.count).toBeGreaterThan(0);
          expect(qa.qa.geometry.terrainCarvingDepthP50).toBeGreaterThanOrEqual(
            qa.expectations.water.minChannelDepthMeters
          );
          expect(qa.buildingMassingProgress).toBe(0);
        }
      },
      {
        point: 'route-highlight',
        progress: 0.499,
        phase: 'route-highlight',
        assert(qa) {
          expect(qa.routeDrawProgress).toBeGreaterThanOrEqual(0.95);
          expect(qa.qa.layers.route.visible).toBe(true);
          expect(qa.routeHashes.length).toBeGreaterThan(0);
          expect(qa.routeEndpointKeys.length).toBeGreaterThan(0);
        }
      },
      {
        point: 'building-massing',
        progress: 0.62,
        phase: 'building-massing',
        assert(qa) {
          expect(qa.buildingMassingProgress).toBeGreaterThan(0);
          expect(qa.buildingMassingProgress).toBeLessThan(1);
          expect(qa.buildingDissolveProgress).toBe(0);
          expect(qa.qa.layers.buildings.count).toBeGreaterThan(0);
        }
      },
      {
        point: 'building-dissolve',
        progress: 0.88,
        phase: 'building-dissolve',
        assert(qa) {
          expect(qa.buildingMassingProgress).toBe(1);
          expect(qa.buildingDissolveProgress).toBeGreaterThan(0);
          expect(qa.qa.layers.buildings.count).toBeGreaterThan(0);
          expect(qa.qa.layers.route.visible).toBe(true);
        }
      }
    ];

    const phaseEvidence = [];
    for (const capture of timelineCaptures) {
      await setEmergenceProgress(page, capture.progress);
      await expect
        .poll(async () => page.evaluate(() => window.__threeDebug__?.phase))
        .toBe(capture.phase);
      const qa = await exportVisualQa(page, fixture, capture.point);
      const screenshot = await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        clip: visualRoiFor(capture.point)
      });
      await attachVisualEvidence(testInfo, {
        fixture,
        capturePoint: capture.point,
        qa,
        screenshot
      });
      phaseEvidence.push({
        point: capture.point,
        phase: qa.phase,
        foundationProgress: qa.foundationProgress,
        carvingProgress: qa.carvingProgress,
        routeDrawProgress: qa.routeDrawProgress,
        buildingMassingProgress: qa.buildingMassingProgress,
        buildingDissolveProgress: qa.buildingDissolveProgress,
        routeYellowPixelRatio: qa.visual.routeYellowPixelRatio
      });
      expect(qa.phase).toBe(capture.phase);
      expect(qa.qa.version).toBe(1);
      expect(qa.qa.geometry.zFightingRisk).toBeLessThanOrEqual(0.01);
      capture.assert(qa);
    }

    await finishFrozenEmergence(page);
    await focusFrozenRoute(page, 'day-river-route-0');
    const routeFocus = await exportVisualQa(page, fixture, 'route-focus');
    await attachVisualEvidence(testInfo, {
      fixture,
      capturePoint: 'route-focus',
      qa: routeFocus,
      screenshot: await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        clip: visualRoiFor('route-focus')
      })
    });
    phaseEvidence.push({
      point: 'route-focus',
      phase: routeFocus.phase,
      cameraMode: routeFocus.camera.mode,
      routeYellowPixelRatio: routeFocus.visual.routeYellowPixelRatio
    });
    await testInfo.attach('river-bridge-timeline-stage-summary.json', {
      body: JSON.stringify(phaseEvidence, null, 2),
      contentType: 'application/json'
    });

    expect(routeFocus.phase).toBe('steady');
    expect(routeFocus.camera.mode).toBe('route-focus');
    expect(routeFocus.qa.layers.route.visible).toBe(true);
    expect(routeFocus.visual.readable).toBe(true);
    expect(routeFocus.visual.routeYellowPixelRatio).toBeGreaterThanOrEqual(
      ROUTE_YELLOW_PIXEL_RATIO_MIN
    );
  });

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

  test('micro-street building dissolve changes smoothly during stepped zoom-in', async ({
    page
  }, testInfo) => {
    test.setTimeout(90_000);
    const fixture = await loadSceneFixture('micro-street');
    await openVisualFixture(page, fixture);
    await page.addStyleTag({ path: 'tests/visual/styles/screenshot-normalize.css' });
    const canvas = page.locator('#map-3d canvas');
    await canvas.hover();

    await page.mouse.wheel(0, 2800);
    await page.waitForTimeout(900);
    const samples = [await exportVisualQa(page, fixture, 'building-dissolve-step-0')];

    for (let step = 1; step <= 6; step += 1) {
      await page.mouse.wheel(0, -760);
      await page.waitForTimeout(520);
      samples.push(await exportVisualQa(page, fixture, `building-dissolve-step-${step}`));
    }

    const alphaValues = samples.map(sample => sample.qa.lod.buildingDetailAlphaAverage);
    const alphaDeltas = alphaValues
      .slice(1)
      .map((value, index) => Number((value - alphaValues[index]).toFixed(5)));
    const maxPositiveDelta = Math.max(...alphaDeltas);
    const maxDrop = Math.max(0, ...alphaDeltas.map(delta => -delta));
    const finalQa = samples.at(-1);

    await testInfo.attach('micro-street-building-dissolve-samples.json', {
      body: JSON.stringify(
        {
          alphaValues,
          alphaDeltas,
          maxPositiveDelta,
          maxDrop,
          cameraModes: samples.map(sample => sample.camera.mode),
          routeYellowPixelRatios: samples.map(sample => sample.visual.routeYellowPixelRatio),
          zFightingRisks: samples.map(sample => sample.qa.geometry.zFightingRisk)
        },
        null,
        2
      ),
      contentType: 'application/json'
    });
    await attachVisualEvidence(testInfo, {
      fixture,
      capturePoint: 'building-dissolve',
      qa: finalQa,
      screenshot: await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        clip: visualRoiFor('inspect')
      })
    });

    expect(samples.every(sample => sample.phase === 'steady')).toBe(true);
    expect(samples.every(sample => sample.qa.layers.route.visible)).toBe(true);
    expect(samples.every(sample => sample.qa.layers.buildings.count > 0)).toBe(true);
    expect(samples.every(sample => sample.qa.geometry.zFightingRisk <= 0.01)).toBe(true);
    expect(maxDrop).toBeLessThanOrEqual(BUILDING_DISSOLVE_ALPHA_DROP_TOLERANCE);
    expect(maxPositiveDelta).toBeLessThanOrEqual(BUILDING_DISSOLVE_ALPHA_STEP_MAX);
    expect(finalQa.qa.lod.buildingEntryCount).toBeGreaterThan(0);
    expect(finalQa.qa.lod.buildingDetailAlphaAverage).toBeGreaterThan(alphaValues[0] + 0.2);
    expect(finalQa.qa.lod.buildingDetailRatio).toBeGreaterThanOrEqual(
      samples[0].qa.lod.buildingDetailRatio
    );
    expect(finalQa.visual.readable).toBe(true);
    expect(finalQa.visual.routeYellowPixelRatio).toBeGreaterThanOrEqual(
      ROUTE_YELLOW_PIXEL_RATIO_MIN
    );
  });

  for (const routeScene of ROUTE_READABILITY_SCENES) {
    test(`${routeScene.scene} route remains readable above contextual layers`, async ({
      page
    }, testInfo) => {
      test.setTimeout(75_000);
      const fixture = await loadSceneFixture(routeScene.scene);
      await openVisualFixture(page, fixture);
      await page.addStyleTag({ path: 'tests/visual/styles/screenshot-normalize.css' });
      const canvas = page.locator('#map-3d canvas');
      await canvas.hover();

      await page.mouse.wheel(0, -3200);
      await page.waitForTimeout(900);
      const qa = await exportVisualQa(page, fixture, 'route-readability-context');

      await attachVisualEvidence(testInfo, {
        fixture,
        capturePoint: 'route-readability-context',
        qa,
        screenshot: await page.screenshot({
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
          clip: visualRoiFor('inspect')
        })
      });

      expect(qa.phase).toBe('steady');
      expect(qa.qa.layers.route.visible).toBe(true);
      expect(qa.qa.layers.buildings.count).toBeGreaterThanOrEqual(routeScene.minBuildings);
      expect(qa.geoAssetCounts.landmarks).toBeGreaterThanOrEqual(routeScene.minLandmarks);
      expect(qa.visual.readable).toBe(true);
      expect(qa.visual.routeYellowPixelRatio).toBeGreaterThanOrEqual(ROUTE_YELLOW_PIXEL_RATIO_MIN);
      expect(qa.qa.geometry.zFightingRisk).toBeLessThanOrEqual(0.01);
      expect(qa.qa.geometry.buildingBaseTerrainErrorP95).toBeLessThanOrEqual(0.25);
    });
  }
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
