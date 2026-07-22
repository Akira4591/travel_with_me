import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  exportVisualQa,
  focusFrozenRoute,
  loadSceneFixture,
  openVisualFixture,
  setVisualCameraPreset
} from './helpers/visual-fixtures.js';

const OUTPUT_DIR = 'output/gate50/live-review';

const REVIEW_SCENES = [
  {
    scene: 'hiking-terrain',
    label: 'mountain route',
    routeSegmentId: 'day-hiking-route-0',
    views: [
      { name: 'overview', preset: 'overview', capturePoint: 'hiking-terrain-overview' },
      { name: 'route-focus', preset: 'routeFocus', capturePoint: 'hiking-terrain-route-focus' }
    ],
    minBuildings: 0,
    minLandmarks: 0,
    requiresLandcover: true,
    requiresWaterBridge: false
  },
  {
    scene: 'old-street',
    label: 'old-street storefront',
    routeSegmentId: 'day-old-street-route-0',
    views: [
      { name: 'overview', preset: 'overview', capturePoint: 'old-street-overview' },
      { name: 'inspect', preset: 'inspect', capturePoint: 'old-street-inspect' }
    ],
    minBuildings: 4,
    minLandmarks: 0,
    requiresLandcover: false,
    requiresWaterBridge: false
  },
  {
    scene: 'landmark-pilot',
    label: 'landmark route',
    routeSegmentId: 'day-landmark-route-0',
    views: [
      { name: 'route-focus', preset: 'routeFocus', capturePoint: 'landmark-pilot-route-focus' },
      { name: 'inspect', preset: 'inspect', capturePoint: 'landmark-pilot-inspect' }
    ],
    minBuildings: 2,
    minLandmarks: 1,
    requiresLandcover: false,
    requiresWaterBridge: false
  },
  {
    scene: 'river-bridge',
    label: 'river bridge crossing',
    routeSegmentId: 'day-river-route-0',
    views: [
      { name: 'overview', preset: 'overview', capturePoint: 'river-bridge-overview' },
      { name: 'inspect', preset: 'inspect', capturePoint: 'river-bridge-inspect' }
    ],
    minBuildings: 0,
    minLandmarks: 0,
    requiresLandcover: false,
    requiresWaterBridge: true
  }
];

test.describe('@gate50-live-review manual visual packet capture', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('captures live Gate 50 visual review inputs', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Gate 50 live visual review captures are desktop-only.');
    test.setTimeout(220_000);
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const captures = [];

    for (const reviewScene of REVIEW_SCENES) {
      const fixture = await loadSceneFixture(reviewScene.scene);
      await openVisualFixture(page, fixture);
      await page.addStyleTag({ path: 'tests/visual/styles/screenshot-normalize.css' });
      await focusFrozenRoute(page, reviewScene.routeSegmentId);

      for (const view of reviewScene.views) {
        captures.push(await captureView(page, fixture, reviewScene, view));
      }
    }

    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      purpose: 'Gate 50 manual live visual review inputs',
      outputDir: OUTPUT_DIR,
      captures
    };
    writeFileSync(join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(OUTPUT_DIR, 'manifest.md'), renderManifestMarkdown(manifest));

    expect(captures).toHaveLength(REVIEW_SCENES.flatMap(scene => scene.views).length);
  });
});

async function captureView(page, fixture, reviewScene, view) {
  if (view.name === 'route-focus') {
    await focusFrozenRoute(page, reviewScene.routeSegmentId);
  }
  await setVisualCameraPreset(page, view.name, fixture.cameraPresets[view.preset]);
  await expect
    .poll(async () => page.evaluate(() => window.__threeDebug__?.camera?.mode || ''), {
      timeout: 8_000
    })
    .toBe(view.name);

  const capturePoint = view.capturePoint;
  const qa = await exportVisualQa(page, fixture, capturePoint);
  qa.workArea = await page.evaluate(() => window.__threeDebug__?.workArea || {});
  assertManualReviewQa(qa, reviewScene, fixture);

  const screenshotPath = join(OUTPUT_DIR, `${capturePoint}.png`);
  const qaPath = join(OUTPUT_DIR, `${capturePoint}.qa.json`);
  await page.locator('#map-3d canvas').screenshot({
    path: screenshotPath,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css'
  });
  writeFileSync(qaPath, `${JSON.stringify(qa, null, 2)}\n`);

  return {
    scene: reviewScene.scene,
    label: reviewScene.label,
    view: view.name,
    screenshotPath,
    qaPath,
    cameraMode: qa.camera.mode,
    routeYellowPixelRatio: qa.visual.routeYellowPixelRatio,
    workAreaSpanMeters: qa.workArea.spanMeters,
    workAreaRaisedPixelRatio: qa.qa.geometry.workAreaRaisedPixelRatio,
    outsideDimmedPixelRatio: qa.qa.geometry.outsideDimmedPixelRatio,
    zFightingRisk: qa.qa.geometry.zFightingRisk,
    qualityPassed: qa.qa.passed
  };
}

function assertManualReviewQa(qa, reviewScene, fixture) {
  expect(qa.phase).toBe('steady');
  expect(qa.qa.version).toBe(1);
  expect(qa.qa.passed).toBe(true);
  expect(qa.workArea.spanMeters).toBeLessThanOrEqual(2000);
  expect(qa.workArea.source).toBe('selected-2d-point');
  expect(qa.qa.geometry.workAreaRaisedPixelRatio).toBeGreaterThanOrEqual(1);
  expect(qa.qa.geometry.outsideDimmedPixelRatio).toBeGreaterThanOrEqual(1);
  expect(qa.qa.geometry.routeGrayOutlinePixelRatio).toBe(0);
  expect(qa.qa.geometry.zFightingRisk).toBeLessThanOrEqual(0.01);
  expect(qa.qa.layers.route.visible).toBe(true);
  expect(qa.visual.readable).toBe(true);
  expect(qa.visual.routeYellowPixelRatio).toBeGreaterThanOrEqual(routeYellowPixelRatioMin(fixture));
  expect(qa.qa.layers.buildings.count).toBeGreaterThanOrEqual(reviewScene.minBuildings);
  expect(qa.qa.provenance.landmarkCount).toBeGreaterThanOrEqual(reviewScene.minLandmarks);
  if (reviewScene.requiresLandcover) {
    expect(qa.geoAssetCounts.landcover).toBeGreaterThan(0);
    expect(qa.qa.budgets.vegetationAreaCount).toBeGreaterThan(0);
  }
  if (reviewScene.requiresWaterBridge) {
    assertWaterBridgeCoverage(qa, fixture);
  }
}

function routeYellowPixelRatioMin(fixture) {
  const value = Number(fixture.expectations?.route?.minYellowPixelRatio);
  return Number.isFinite(value) ? value : 0.00008;
}

function assertWaterBridgeCoverage(qa, fixture) {
  const water = fixture?.expectations?.water || {};
  const bridge = fixture?.expectations?.bridge || {};
  expect(qa.qa.geometry.waterCoverageRatio).toBeGreaterThanOrEqual(water.minCoverageRatio ?? 0.97);
  expect(qa.qa.geometry.bridgeContinuity).toBeGreaterThanOrEqual(
    bridge.minSpanCoverageRatio ?? 0.95
  );
  expect(qa.qa.geometry.terrainCarvingDepthP50).toBeGreaterThanOrEqual(water.minChannelDepthMeters);
  expect(qa.qa.geometry.routeVisiblePixelRatio).toBeGreaterThanOrEqual(0.9);
  expect(qa.waterVisual.readable).toBe(true);
  expect(qa.waterVisual.waterBluePixelRatio).toBeGreaterThanOrEqual(
    water.minBluePixelRatio ?? 0.00008
  );
  expect(qa.qa.geometry.bridgePierCount).toBe(0);
  expect(qa.counts.waterMeshes).toBeGreaterThan(0);
  expect(qa.counts.bridgeDecks).toBeGreaterThanOrEqual(bridge.minDeckCount ?? 1);
}

function renderManifestMarkdown(manifest) {
  return [
    '# Gate 50 Live Visual Review Captures',
    '',
    `Generated at: ${manifest.generatedAt}`,
    `Output directory: ${manifest.outputDir}`,
    '',
    '| Scene | View | Screenshot | QA | Route yellow | Work area | Raised | Outside dimmed | z-fighting | QA |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...manifest.captures.map(
      capture =>
        `| ${capture.scene} | ${capture.view} | ${capture.screenshotPath} | ${capture.qaPath} | ${capture.routeYellowPixelRatio} | ${capture.workAreaSpanMeters} | ${capture.workAreaRaisedPixelRatio} | ${capture.outsideDimmedPixelRatio} | ${capture.zFightingRisk} | ${capture.qualityPassed ? 'passed' : 'failed'} |`
    ),
    '',
    'Manual acceptance is still required. These files are review inputs, not an automatic Gate 50 promotion.',
    ''
  ].join('\n');
}
