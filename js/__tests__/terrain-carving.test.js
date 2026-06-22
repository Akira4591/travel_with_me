import { describe, expect, it } from 'vitest';

import { applyTerrainCarving, buildWaterCarveMasks } from '../render/terrain-carving.js';

describe('terrain carving', () => {
  it('depresses terrain near a waterway centerline without affecting distant terrain', () => {
    const terrain = mockTerrainModel();
    applyTerrainCarving(terrain, mockProjection(), [
      {
        centerline: [
          [116, 39],
          [116.01, 39]
        ],
        widthMeters: 12
      }
    ]);

    expect(terrain.carving.waterwayCount).toBe(1);
    expect(terrain.carving.depthP50Meters).toBeGreaterThanOrEqual(0.45);
    expect(terrain.heightAt(5, 0)).toBeLessThan(10);
    expect(terrain.heightAt(5, 100)).toBe(10);
  });

  it('creates polygon masks for attributable water areas', () => {
    const masks = buildWaterCarveMasks(mockProjection(), [
      {
        polygon: [
          [116, 39],
          [116.01, 39],
          [116.01, 39.01],
          [116, 39.01]
        ],
        widthMeters: 20
      }
    ]);

    expect(masks).toHaveLength(1);
    expect(masks[0].strengthAt(5, 5)).toBeGreaterThan(0);
    expect(masks[0].strengthAt(50, 50)).toBe(0);
  });

  it('does not carve centerline water without provider width', () => {
    const terrain = mockTerrainModel();
    applyTerrainCarving(terrain, mockProjection(), [
      {
        centerline: [
          [116, 39],
          [116.01, 39]
        ]
      }
    ]);

    expect(terrain.carving.waterwayCount).toBe(0);
    expect(terrain.heightAt(5, 0)).toBe(10);
  });
});

function mockProjection() {
  return {
    toScene: ([lng, lat]) => ({ x: (lng - 116) * 1000, z: (lat - 39) * 1000 }),
    metersToUnits: value => value,
    unitsToMeters: value => value
  };
}

function mockTerrainModel() {
  return {
    heightAt: () => 10,
    sampleHeight: () => 10,
    foundationAt: () => 1
  };
}
