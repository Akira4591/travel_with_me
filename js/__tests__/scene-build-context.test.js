import { describe, expect, it } from 'vitest';

import { createSceneBuildContext } from '../render/scene-build-context.js';
import { createDioramaDebugSnapshot } from '../render/scene-debug.js';

const provenance = {
  source: 'city-open-data',
  licence: 'ODbL',
  attribution: 'Example City',
  updatedAt: '2026-06-21'
};

describe('scene build context', () => {
  it('normalizes geo assets and exposes layer counts plus provenance', () => {
    const context = createSceneBuildContext({
      trip: {
        id: 'trip-1',
        geoAssets: {
          waterways: [
            {
              id: 'river',
              centerline: [
                [116, 39],
                [116.01, 39.01]
              ],
              widthMeters: 12,
              provenance
            }
          ],
          bridges: [
            {
              id: 'bridge',
              centerline: [
                [116.005, 39],
                [116.005, 39.01]
              ],
              provenance
            }
          ],
          buildings: [
            {
              id: 'bad-building',
              footprint: [
                [116, 39],
                [116.001, 39],
                [116.001, 39.001]
              ],
              provenance: { source: 'missing-licence' }
            }
          ]
        }
      },
      activeDayId: 'day-1',
      locations: [{ id: 'loc-1' }],
      terrainMode: { id: 'citywalk', terrainGrid: 24, routeSamples: 24 },
      terrainModel: {
        terrainConfidence: 'flat-fallback',
        metrics: { range: 0 },
        grid: null
      }
    });

    expect(context.sceneId).toBeUndefined();
    expect(context.activeDayId).toBe('day-1');
    expect(context.layerCounts.waterways).toBe(1);
    expect(context.layerCounts.bridges).toBe(1);
    expect(context.layerCounts.buildings).toBe(0);
    expect(context.qualityFlags.hasWaterways).toBe(true);
    expect(context.qualityFlags.hasBridges).toBe(true);
    expect(context.qualityFlags.hasIncompleteProvenance).toBe(false);
    expect(context.provenanceManifest.sceneId).toBe('trip-1:day-1');
    expect(context.provenanceManifest.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ layer: 'waterways', source: 'city-open-data' }),
        expect.objectContaining({ layer: 'bridges', source: 'city-open-data' })
      ])
    );
  });

  it('creates a debug snapshot from diorama runtime and scene context', () => {
    const context = createSceneBuildContext({
      trip: {
        id: 'trip-1',
        geoAssets: { waterways: [] },
        geoAssetStatus: {
          status: 'degraded',
          reason: 'GEO_ASSETS_UPSTREAM_TIMEOUT',
          sourceSummary: '周边地理要素请求超时。'
        }
      },
      activeDayId: 'all',
      terrainMode: { id: 'region-overview' },
      terrainModel: { terrainConfidence: 'flat-fallback', metrics: {}, grid: null }
    });
    const diorama = {
      container: { dataset: { terrainMode: 'region-overview', firstSlabMs: '312' } },
      terrainModel: { terrainConfidence: 'flat-fallback', metrics: { range: 0 } },
      dioramaGroup: mockGroup(2),
      routeGroup: Object.assign(mockGroup(1), {
        userData: {
          realGeometryCount: 1,
          routeHashes: ['abc12345'],
          routeEndpointKeys: ['116.000000,39.000000>116.010000,39.010000'],
          routeLengthMeters: 1000,
          routeDiagnostics: [{ segmentId: 'day-1-route-0' }],
          routeClearanceP95Meters: 0.24,
          routeClearanceMaxMeters: 0.28
        }
      }),
      waterGroup: mockGroup(0),
      bridgeGroup: mockGroup(0),
      buildingGroup: Object.assign(mockGroup(1), {
        userData: {
          baseTerrainErrorP95Meters: 0.12,
          baseTerrainErrorMaxMeters: 0.18
        }
      }),
      generationTimeline: {
        snapshot: () => ({
          phase: 'water-carve',
          phaseProgress: 0.5,
          phaseStartedAt: 100,
          foundationProgress: 1,
          terrainRefineProgress: 1,
          carvingProgress: 0.5,
          roadBridgeProgress: 0,
          routeDrawProgress: 0,
          buildingMassingProgress: 0,
          buildingDissolveProgress: 0
        })
      }
    };

    const debug = createDioramaDebugSnapshot(diorama, context);

    expect(debug.sceneId).toBe('trip-1:all');
    expect(debug.firstSlabMs).toBe(312);
    expect(debug.visibleMeshCount).toBe(2);
    expect(debug.routeGeometryCount).toBe(1);
    expect(debug.routeHashes).toEqual(['abc12345']);
    expect(debug.provenanceSourceCount).toBeGreaterThanOrEqual(1);
    expect(debug.geoAssetCounts.waterways).toBe(0);
    expect(debug.quality.degraded).toBe(true);
    expect(debug.quality.reasons).toEqual(['GEO_ASSETS_UPSTREAM_TIMEOUT']);
    expect(debug.counts.routeSegments).toBe(1);
    expect(debug.geometryMetrics.routeClearanceP95Meters).toBe(0.24);
    expect(debug.geometryMetrics.buildingBaseTerrainErrorP95Meters).toBe(0.12);
    expect(debug.quality.passed).toBe(true);
    expect(debug.qa.geometry.routeGroundClearanceP95).toBe(0.24);
    expect(debug.phase).toBe('water-carve');
    expect(debug.generationPhase).toBe('water-carve');
    expect(debug.carvingProgress).toBe(0.5);
  });
});

function mockGroup(meshCount) {
  return {
    userData: {},
    traverse(callback) {
      for (let index = 0; index < meshCount; index += 1) {
        callback({ isMesh: true, visible: true });
      }
    }
  };
}
