import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { normalizeGeoAssets } from '../render/geo-assets.js';

const FIXTURE_ROOT = path.resolve('tests/fixtures/scenes');
const SCENES = [
  'river-bridge',
  'micro-street',
  'hiking-terrain',
  'old-street',
  'landmark-pilot',
  'scenic-park'
];
const REQUIRED_FILES = [
  'trip.json',
  'route.json',
  'geo-assets.json',
  'dem-grid.json',
  'camera-presets.json',
  'expectations.json'
];

describe('3D visual scene fixtures', () => {
  it('provides the first commercial visual baseline scene catalog', () => {
    expect(SCENES).toEqual([
      'river-bridge',
      'micro-street',
      'hiking-terrain',
      'old-street',
      'landmark-pilot',
      'scenic-park'
    ]);

    SCENES.forEach(scene => {
      REQUIRED_FILES.forEach(file => {
        expect(() => readFixture(scene, file)).not.toThrow();
      });
    });
  });

  it('keeps fixture geo assets attributable and normalizable', () => {
    const riverAssets = normalizeGeoAssets(readFixture('river-bridge', 'geo-assets.json'));
    expect(riverAssets.waterways).toHaveLength(1);
    expect(riverAssets.bridges).toHaveLength(1);
    expect(riverAssets.roads).toHaveLength(1);

    const streetAssets = normalizeGeoAssets(readFixture('micro-street', 'geo-assets.json'));
    expect(streetAssets.buildings).toHaveLength(2);
    expect(streetAssets.roads).toHaveLength(1);

    const hikingAssets = normalizeGeoAssets(readFixture('hiking-terrain', 'geo-assets.json'));
    expect(hikingAssets.landcover).toHaveLength(1);
    expect(hikingAssets.roads).toHaveLength(1);

    const oldStreetAssets = normalizeGeoAssets(readFixture('old-street', 'geo-assets.json'));
    expect(oldStreetAssets.buildings).toHaveLength(4);
    expect(oldStreetAssets.roads).toHaveLength(1);

    const landmarkAssets = normalizeGeoAssets(readFixture('landmark-pilot', 'geo-assets.json'));
    expect(landmarkAssets.buildings).toHaveLength(2);
    expect(landmarkAssets.roads).toHaveLength(1);
    expect(landmarkAssets.landmarks).toHaveLength(1);

    const scenicAssets = normalizeGeoAssets(readFixture('scenic-park', 'geo-assets.json'));
    expect(scenicAssets.landcover).toHaveLength(1);
    expect(scenicAssets.roads).toHaveLength(1);
    expect(scenicAssets.waterways).toHaveLength(1);
  });

  it('defines scenario-specific visual and geometry expectations', () => {
    const river = readFixture('river-bridge', 'expectations.json');
    expect(river.water.requiresCoverage).toBe(true);
    expect(river.bridge.requiresDeckContinuity).toBe(true);
    expect(river.bridge.minSpanCoverageRatio).toBeGreaterThanOrEqual(0.95);

    const street = readFixture('micro-street', 'expectations.json');
    expect(street.route.maxOccludedRatio).toBeLessThanOrEqual(0.25);
    expect(street.building.maxPopDeltaPixels).toBeGreaterThan(0);

    const hiking = readFixture('hiking-terrain', 'dem-grid.json');
    const range = flatten(hiking.heights);
    expect(Math.max(...range) - Math.min(...range)).toBeGreaterThanOrEqual(400);

    const oldStreet = readFixture('old-street', 'expectations.json');
    expect(oldStreet.building.minContextBuildings).toBeGreaterThanOrEqual(4);

    const landmark = readFixture('landmark-pilot', 'expectations.json');
    expect(landmark.landmark.requiresAllowlistedPlaceholder).toBe(true);

    const scenic = readFixture('scenic-park', 'expectations.json');
    expect(scenic.terrain.expectedMode).toBe('scenic-park');
    expect(scenic.terrain.minHeightRangeMeters).toBeGreaterThanOrEqual(80);
  });
});

function readFixture(scene, file) {
  return JSON.parse(readFileSync(path.join(FIXTURE_ROOT, scene, file), 'utf8'));
}

function flatten(rows) {
  return rows.flatMap(row => row);
}
