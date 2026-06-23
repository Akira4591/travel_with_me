import { describe, expect, it } from 'vitest';

import {
  buildBridgeGroup,
  buildRoadGroup,
  buildWaterGroup,
  createRibbonPolygon
} from '../render/geo-asset-renderer.js';

describe('geo asset renderer', () => {
  it('renders water centerline fallback as a revealed terrain surface', () => {
    const group = buildWaterGroup(mockProjection(), mockTerrainModel(), [
      {
        id: 'river-1',
        centerline: [
          [116, 39],
          [116.01, 39.01]
        ],
        widthMeters: 12
      }
    ]);

    expect(group.userData.count).toBe(1);
    expect(group.userData.coverageRatio).toBe(1);
    expect(group.userData.revealTargets).toHaveLength(1);
    expect(group.children[0].userData.surfaceReveal.restY).toBeGreaterThan(0);
  });

  it('does not render centerline water without provider width', () => {
    const group = buildWaterGroup(mockProjection(), mockTerrainModel(), [
      {
        id: 'river-unknown-width',
        centerline: [
          [116, 39],
          [116.01, 39.01]
        ]
      }
    ]);

    expect(group.userData.count).toBe(0);
    expect(group.userData.coverageRatio).toBe(0);
    expect(group.children).toHaveLength(0);
  });

  it('renders bridge decks without inventing piers from centerlines', () => {
    const group = buildBridgeGroup(mockProjection(), mockTerrainModel(), [
      {
        id: 'bridge-1',
        centerline: [
          [116, 39],
          [116.01, 39]
        ],
        widthMeters: 8,
        deckHeightMeters: 6
      }
    ]);

    expect(group.userData.count).toBe(1);
    expect(group.userData.deckCount).toBe(1);
    expect(group.userData.pierCount).toBe(0);
    expect(group.userData.continuityRatio).toBe(1);
    expect(group.children).toHaveLength(1);
    expect(group.userData.revealMaterials[0].restOpacity).toBeCloseTo(0.92);
  });

  it('renders bridge piers only when explicit support points exist', () => {
    const group = buildBridgeGroup(mockProjection(), mockTerrainModel(), [
      {
        id: 'bridge-1',
        centerline: [
          [116, 39],
          [116.01, 39]
        ],
        piers: [[116.005, 39]],
        widthMeters: 8,
        deckHeightMeters: 6
      }
    ]);

    expect(group.userData.deckCount).toBe(1);
    expect(group.userData.pierCount).toBe(1);
  });

  it('renders roads as muted terrain-following ribbons', () => {
    const group = buildRoadGroup(mockProjection(), mockTerrainModel(), [
      {
        id: 'road-1',
        kind: 'local',
        centerline: [
          [116, 39],
          [116.01, 39.01]
        ],
        widthMeters: 5
      }
    ]);

    expect(group.userData.count).toBe(1);
    expect(group.userData.revealTargets).toHaveLength(1);
    expect(group.children[0].userData.surfaceReveal.restHeights.length).toBeGreaterThan(0);
    expect(group.children[0].material.opacity).toBeLessThanOrEqual(0.16);
    expect(group.children[0].material.color.getHexString()).toBe('eee8dc');
  });

  it('creates a finite fallback ribbon polygon from a centerline', () => {
    const polygon = createRibbonPolygon(
      [
        [116, 39],
        [116.01, 39]
      ],
      10,
      mockProjection()
    );

    expect(polygon).toHaveLength(4);
    expect(polygon.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))).toBe(true);
  });
});

function mockProjection() {
  return {
    toScene: ([lng, lat]) => ({ x: (lng - 116) * 1000, z: (lat - 39) * 1000 }),
    toLngLat: ({ x, z }) => [116 + x / 1000, 39 + z / 1000],
    metersToUnits: value => value * 0.5
  };
}

function mockTerrainModel() {
  return {
    foundationHeight: 1,
    heightAt: (x, z) => 2 + x * 0.001 + z * 0.001,
    foundationAt: () => 1
  };
}
