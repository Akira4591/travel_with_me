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
        buildingBaseTerrainErrorMaxMeters: 0.2,
        waterCoverageRatio: 0.98,
        bridgeContinuity: 0.99,
        terrainCarvingDepthP50Meters: 2.1,
        routeVisiblePixelRatio: 0.94
      },
      lodMetrics: {
        detailRatio: 0.5,
        detailAlphaAverage: 0.42,
        distanceP50: 180,
        entryCount: 4
      },
      vegetationMetrics: {
        areaCount: 1,
        maxInstancesPerArea: 12,
        densityCap: 12,
        chunkCount: 1,
        visibleChunkCount: 1,
        culledChunkCount: 0
      },
      geoAssetCounts: { waterways: 2, bridges: 1, roads: 3, buildings: 2, landmarks: 1 },
      landmarkAssetStats: { total: 1, allowlisted: 1, optimized: 1, withIntegrity: 1 },
      counts: {
        waterMeshes: 2,
        bridgeDecks: 1,
        bridgePiers: 0,
        roadMeshes: 3,
        vegetationInstances: 12
      },
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
    expect(result.version).toBe(1);
    expect(result.geometry.routeGroundClearanceP95).toBe(0.2);
    expect(result.geometry.waterCoverageRatio).toBe(0.98);
    expect(result.geometry.bridgeContinuity).toBe(0.99);
    expect(result.geometry.terrainCarvingDepthP50).toBe(2.1);
    expect(result.geometry.routeVisiblePixelRatio).toBe(0.94);
    expect(result.geometry.zFightingRisk).toBe(0);
    expect(result.geometry.bridgePierCount).toBe(0);
    expect(result.lod).toMatchObject({
      buildingEntryCount: 4,
      buildingDetailRatio: 0.5,
      buildingDetailAlphaAverage: 0.42,
      buildingDistanceP50: 180
    });
    expect(result.budgets.triangleCount).toBe(0);
    expect(result.budgets.vegetationAreaCount).toBe(1);
    expect(result.budgets.vegetationMaxInstancesPerArea).toBe(12);
    expect(result.budgets.vegetationDensityCap).toBe(12);
    expect(result.budgets.vegetationChunkCount).toBe(1);
    expect(result.budgets.vegetationVisibleChunkCount).toBe(1);
    expect(result.budgets.vegetationCulledChunkCount).toBe(0);
    expect(result.layers.water).toMatchObject({ visible: true, count: 2, expected: 2 });
    expect(result.provenance.landmarkAllowlisted).toBe(1);
    expect(result.provenance.landmarkOptimized).toBe(1);
    expect(result.provenance.landmarkIntegrityCount).toBe(1);
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

  it('fails when vegetation templates exceed their per-area density budget', () => {
    const result = evaluateSceneQuality({
      firstSlabMs: 420,
      vegetationMetrics: {
        areaCount: 1,
        maxInstancesPerArea: 13,
        densityCap: 12,
        chunkCount: 1,
        visibleChunkCount: 1,
        culledChunkCount: 0
      },
      geoAssetCounts: { landcover: 1 },
      counts: { vegetationInstances: 13 }
    });

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('VEGETATION_DENSITY_CAP_EXCEEDED:13/12');
  });

  it('fails when landmark records are not release-gated by asset validation', () => {
    const result = evaluateSceneQuality({
      firstSlabMs: 420,
      geoAssetCounts: { landmarks: 1 },
      landmarkAssetStats: { total: 1, allowlisted: 0, optimized: 0, withIntegrity: 0 }
    });

    expect(result.passed).toBe(false);
    expect(result.errors).toContain('LANDMARK_ASSET_NOT_RELEASE_GATED:0/1');
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
        userData: {
          baseTerrainErrorP95Meters: 0.1,
          baseTerrainErrorMaxMeters: 0.15,
          lodMetrics: {
            detailRatio: 1,
            detailAlphaAverage: 0.8,
            distanceP50: 120,
            entryCount: 1
          }
        }
      }),
      vegetationGroup: {
        userData: {
          areaCount: 1,
          maxInstancesPerArea: 12,
          densityCap: 12,
          chunks: [mockGroup(1)],
          chunkCount: 1,
          visibleChunkCount: 1,
          culledChunkCount: 0
        }
      },
      sceneBuildContext: {},
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
      },
      cameraController: {
        getDebugSnapshot: () => ({
          mode: 'overview',
          autoRotate: true,
          userInteracting: false,
          distance: 540,
          polarAngle: 0.35,
          position: { x: 12.34, y: 420.5, z: 56.78 },
          target: { x: 0, y: 400, z: 0 },
          clearance: 20.5
        })
      }
    };
    const context = {
      layerCounts: { waterways: 1, bridges: 1, roads: 1, buildings: 1 },
      landmarkAssetStats: { total: 0, allowlisted: 0, optimized: 0, withIntegrity: 0 },
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
    expect(container.dataset.qaCameraMode).toBe('overview');
    expect(container.dataset.qaCameraAutoRotate).toBe('true');
    expect(container.dataset.qaCameraDistance).toBe('540');
    expect(container.dataset.qaCameraPolarAngle).toBe('0.35');
    expect(container.dataset.qaCameraClearance).toBe('20.5');
    expect(container.dataset.qaCameraPosition).toBe('12.34,420.50,56.78');
    expect(container.dataset.qaCameraTarget).toBe('0.00,400.00,0.00');
    expect(container.dataset.qaRouteClearanceP95).toBe('0.18');
    expect(container.dataset.qaBuildingBaseErrorP95).toBe('0.1');
    expect(container.dataset.qaBuildingDetailRatio).toBe('1');
    expect(container.dataset.qaBuildingDetailAlphaAverage).toBe('0.8');
    expect(container.dataset.qaVegetationMaxInstancesPerArea).toBe('12');
    expect(container.dataset.qaVegetationDensityCap).toBe('12');
    expect(container.dataset.qaVegetationChunkCount).toBe('1');
    expect(container.dataset.qaVegetationVisibleChunkCount).toBe('1');
    expect(container.dataset.qaVegetationCulledChunkCount).toBe('0');
    expect(container.dataset.qaVersion).toBe('1');
    expect(debug.qa.version).toBe(1);
    expect(debug.qa.lod.buildingDetailRatio).toBe(1);
    expect(debug.qa.layers.bridges.count).toBe(1);
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
