import { describe, expect, it } from 'vitest';

import { evaluateSceneQuality } from '../render/scene-quality-gates.js';
import { publishDioramaDebug } from '../render/scene-debug.js';

describe('scene quality gates', () => {
  it('passes a healthy scene and exposes normalized geometry metrics', () => {
    const result = evaluateSceneQuality({
      firstSlabMs: 420,
      elevationRange: 18,
      geometryMetrics: {
        routeClearanceP95Meters: 0.2,
        routeClearanceMaxMeters: 0.28,
        buildingBaseTerrainErrorP95Meters: 0.12,
        buildingBaseTerrainErrorMaxMeters: 0.2
      },
      geoAssetCounts: { waterways: 2, bridges: 1, roads: 3, buildings: 2, landmarks: 0 },
      counts: { waterMeshes: 2, bridgeDecks: 1, bridgePiers: 0, roadMeshes: 3 },
      provenanceSources: [
        {
          source: 'test-open-data',
          licence: 'ODbL',
          attribution: 'Example source',
          updatedAt: '2026-06-21T00:00:00.000Z'
        }
      ],
      quality: { degraded: false }
    });

    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.geometry.routeGroundClearanceP95).toBe(0.2);
    expect(result.geometry.waterCoverageRatio).toBe(1);
    expect(result.geometry.bridgeContinuity).toBe(1);
  });

  it('fails hard geometry violations and keeps degraded provider state as warning', () => {
    const result = evaluateSceneQuality({
      firstSlabMs: 1700,
      geometryMetrics: {
        routeClearanceP95Meters: 0.42,
        buildingBaseTerrainErrorP95Meters: 0.31
      },
      geoAssetCounts: { waterways: 1, bridges: 1, roads: 1 },
      counts: { waterMeshes: 0, bridgeDecks: 0, bridgePiers: 1, roadMeshes: 0 },
      provenanceSources: [
        { source: 'test-open-data', licence: '', attribution: '', updatedAt: '' }
      ],
      quality: { degraded: true, reasons: ['GEO_ASSETS_PENDING'] }
    });

    expect(result.passed).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'FIRST_SLAB_SLOW:1700',
        'ROUTE_CLEARANCE_P95_HIGH:0.42',
        'BUILDING_BASE_ERROR_P95_HIGH:0.31',
        'WATERWAYS_WITHOUT_WATER_MESH',
        'BRIDGES_WITHOUT_DECK',
        'BRIDGE_PIERS_WITHOUT_DECK'
      ])
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'ROADS_WITHOUT_ROAD_MESH',
        'GEO_ASSETS_PENDING',
        'MISSING_PROVENANCE_FIELDS:3'
      ])
    );
  });

  it('publishes a clipped QA dataset for browser automation', () => {
    const container = { dataset: { terrainMode: 'citywalk', firstSlabMs: '300' } };
    const diorama = {
      container,
      terrainModel: { terrainConfidence: 'sampled', metrics: { range: 22 } },
      dioramaGroup: mockGroup(2),
      routeGroup: Object.assign(mockGroup(1), {
        userData: {
          realGeometryCount: 1,
          routeHashes: ['route-a'],
          routeClearanceP95Meters: 0.18,
          routeClearanceMaxMeters: 0.24
        }
      }),
      waterGroup: mockGroup(1),
      bridgeGroup: mockBridgeGroup(),
      roadGroup: mockGroup(1),
      buildingGroup: Object.assign(mockGroup(1), {
        userData: { baseTerrainErrorP95Meters: 0.1, baseTerrainErrorMaxMeters: 0.15 }
      }),
      generationTimeline: {
        snapshot: () => ({
          phase: 'steady',
          phaseProgress: 1,
          foundationProgress: 1,
          terrainRefineProgress: 1,
          carvingProgress: 1,
          roadBridgeProgress: 1,
          routeDrawProgress: 1,
          buildingMassingProgress: 1,
          buildingDissolveProgress: 1
        })
      }
    };
    const context = {
      layerCounts: { waterways: 1, bridges: 1, roads: 1, buildings: 1 },
      provenanceManifest: {
        sceneId: 'trip:all',
        sources: [
          {
            source: 'test-open-data',
            licence: 'ODbL',
            attribution: 'Example',
            updatedAt: '2026-06-21T00:00:00.000Z'
          }
        ]
      },
      qualityFlags: {}
    };

    const debug = publishDioramaDebug(diorama, context);

    expect(debug.quality.passed).toBe(true);
    expect(container.dataset.qaPhase).toBe('steady');
    expect(container.dataset.qaPassed).toBe('true');
    expect(container.dataset.qaRouteClearanceP95).toBe('0.18');
    expect(container.dataset.qaBuildingBaseErrorP95).toBe('0.1');
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

function mockBridgeGroup() {
  return {
    userData: {},
    traverse(callback) {
      callback({ isMesh: true, visible: true, userData: { bridgePart: 'deck' } });
    }
  };
}
