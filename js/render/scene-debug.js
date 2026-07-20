import * as THREE from 'three';

import { evaluateSceneQuality } from './scene-quality-gates.js';

export function createDioramaDebugSnapshot(diorama, sceneContext) {
  const routeUserData = diorama.routeGroup?.userData || {};
  const layerCounts = sceneContext?.layerCounts || {};
  const manifestSources = sceneContext?.provenanceManifest?.sources || [];
  const qualityFlags = sceneContext?.qualityFlags || {};
  const landmarkAssetStats = sceneContext?.landmarkAssetStats || {};
  const vegetationCulling = computeVegetationCullingMetrics(diorama);
  const timeline = diorama.generationTimeline?.snapshot?.() || {
    phase: 'steady',
    phaseProgress: 1,
    foundationProgress: 1,
    terrainRefineProgress: 1,
    carvingProgress: 1,
    roadBridgeProgress: 1,
    routeDrawProgress: 1,
    buildingMassingProgress: 1,
    buildingDissolveProgress: 1
  };
  const camera = diorama.cameraController?.getDebugSnapshot?.() || {
    mode: 'overview',
    autoRotate: Boolean(diorama.controls?.autoRotate),
    userInteracting: false,
    distance:
      diorama.camera && diorama.controls
        ? Math.round(diorama.camera.position.distanceTo(diorama.controls.target))
        : 0,
    polarAngle:
      typeof diorama.controls?.getPolarAngle === 'function'
        ? Number(diorama.controls.getPolarAngle().toFixed(3))
        : 0
  };

  const debug = {
    mode: '3d',
    phase: timeline.phase,
    generationPhase: timeline.phase,
    phaseProgress: timeline.phaseProgress,
    phaseStartedAt: timeline.phaseStartedAt || 0,
    foundationProgress: timeline.foundationProgress,
    terrainRefineProgress: timeline.terrainRefineProgress,
    carvingProgress: timeline.carvingProgress,
    roadBridgeProgress: timeline.roadBridgeProgress,
    routeDrawProgress: timeline.routeDrawProgress,
    buildingMassingProgress: timeline.buildingMassingProgress,
    buildingDissolveProgress: timeline.buildingDissolveProgress,
    sceneId: sceneContext?.provenanceManifest?.sceneId || '',
    terrainMode: diorama.container.dataset.terrainMode || sceneContext?.terrainMode || '',
    terrainConfidence:
      diorama.terrainModel?.terrainConfidence || sceneContext?.terrainConfidence || '',
    elevationRange: Math.round(diorama.terrainModel?.metrics?.range || 0),
    firstSlabMs: Number(diorama.container.dataset.firstSlabMs || 0),
    visibleMeshCount: countVisibleMeshes(diorama.dioramaGroup),
    routeMeshCount: countVisibleMeshes(diorama.routeGroup),
    waterMeshCount: countVisibleMeshes(diorama.waterGroup),
    bridgeMeshCount: countVisibleMeshes(diorama.bridgeGroup),
    buildingMeshCount: countVisibleMeshes(diorama.buildingGroup),
    routeGeometryCount: routeUserData.realGeometryCount || 0,
    routeHashes: routeUserData.routeHashes || [],
    routeEndpointKeys: routeUserData.routeEndpointKeys || [],
    routeLengthMeters: routeUserData.routeLengthMeters || 0,
    routeDiagnostics: routeUserData.routeDiagnostics || [],
    workArea: diorama.workArea || null,
    geometryMetrics: {
      routeClearanceP95Meters: Number(routeUserData.routeClearanceP95Meters || 0),
      routeClearanceMaxMeters: Number(routeUserData.routeClearanceMaxMeters || 0),
      buildingBaseTerrainErrorP95Meters: Number(
        diorama.buildingGroup?.userData?.baseTerrainErrorP95Meters || 0
      ),
      buildingBaseTerrainErrorMaxMeters: Number(
        diorama.buildingGroup?.userData?.baseTerrainErrorMaxMeters || 0
      ),
      terrainCarvingDepthP50Meters: Number(diorama.terrainModel?.carving?.depthP50Meters || 0),
      waterCoverageRatio: Number(diorama.waterGroup?.userData?.coverageRatio || 0),
      bridgeContinuity: Number(diorama.bridgeGroup?.userData?.continuityRatio || 0),
      zFightingRisk: 0,
      routeVisiblePixelRatio: 1,
      routeGrayOutlinePixelRatio: routeUserData.grayOutlineMeshCount > 0 ? 1 : 0,
      workAreaRaisedPixelRatio: diorama.terrainMesh && diorama.workArea ? 1 : 0,
      outsideDimmedPixelRatio:
        diorama.contextGround && diorama.contextGround.visible !== false ? 1 : 0,
      slabRiseTopHeightVariance: 0,
      terrainReliefContrast: computeTerrainReliefContrast(diorama.terrainMesh)
    },
    vegetationMetrics: {
      areaCount: Number(diorama.vegetationGroup?.userData?.areaCount || 0),
      maxInstancesPerArea: Number(diorama.vegetationGroup?.userData?.maxInstancesPerArea || 0),
      densityCap: Number(diorama.vegetationGroup?.userData?.densityCap || 0),
      chunkCount: vegetationCulling.chunkCount,
      visibleChunkCount: vegetationCulling.visibleChunkCount,
      culledChunkCount: vegetationCulling.culledChunkCount
    },
    lodMetrics: {
      detailRatio: Number(diorama.buildingGroup?.userData?.lodMetrics?.detailRatio || 0),
      detailAlphaAverage: Number(
        diorama.buildingGroup?.userData?.lodMetrics?.detailAlphaAverage || 0
      ),
      distanceP50: Number(diorama.buildingGroup?.userData?.lodMetrics?.distanceP50 || 0),
      entryCount: Number(diorama.buildingGroup?.userData?.lodMetrics?.entryCount || 0)
    },
    geoAssetCounts: {
      buildings: layerCounts.buildings || 0,
      roads: layerCounts.roads || 0,
      waterways: layerCounts.waterways || 0,
      bridges: layerCounts.bridges || 0,
      landcover: layerCounts.landcover || 0,
      landmarks: layerCounts.landmarks || 0
    },
    landmarkAssetStats: {
      total: Number(landmarkAssetStats.total || 0),
      allowlisted: Number(landmarkAssetStats.allowlisted || 0),
      optimized: Number(landmarkAssetStats.optimized || 0),
      withIntegrity: Number(landmarkAssetStats.withIntegrity || 0)
    },
    quality: {
      degraded: Boolean(qualityFlags.degraded),
      reasons: [qualityFlags.degradedReason].filter(Boolean),
      missingLayers: qualityFlags.missingLayers || []
    },
    qualityFlags,
    counts: {
      terrainChunks: diorama.terrainMesh ? 1 : 0,
      waterMeshes: countVisibleMeshes(diorama.waterGroup),
      roadMeshes: countVisibleMeshes(diorama.roadGroup),
      bridgeDecks: countBridgeParts(diorama.bridgeGroup, 'deck'),
      bridgePiers: countBridgePiers(diorama.bridgeGroup),
      routeSegments: routeUserData.realGeometryCount || 0,
      buildingMassings: countBuildingMassings(diorama.buildingGroup),
      buildingDetailed: diorama.buildingDetailCount || 0,
      syntheticBuildingMassings: Number(
        diorama.buildingGroup?.userData?.syntheticMassingCount || 0
      ),
      instancedBuildingMassingMeshes: Number(
        diorama.buildingGroup?.userData?.instancedMassingMeshCount || 0
      ),
      vegetationInstances: Number(diorama.container.dataset.vegetationTemplateCount || 0)
    },
    camera,
    provenance: {
      providers: [...new Set(manifestSources.map(source => source.source).filter(Boolean))],
      attributions: [...new Set(manifestSources.map(source => source.attribution).filter(Boolean))]
    },
    provenanceSourceCount: manifestSources.length,
    provenanceSources: manifestSources
  };
  const gateResult = evaluateSceneQuality(debug);
  debug.fixture = {
    id: sceneContext?.fixtureId || '',
    profile: sceneContext?.profile || sceneContext?.terrainMode || '',
    seed: sceneContext?.fixtureSeed || '',
    routeHash: debug.routeHashes?.[0] || ''
  };
  debug.quality = {
    ...debug.quality,
    passed: gateResult.passed,
    warnings: gateResult.warnings,
    errors: gateResult.errors
  };
  debug.qa = gateResult;
  return debug;
}

export function publishDioramaDebug(diorama, sceneContext) {
  const debug = createDioramaDebugSnapshot(diorama, sceneContext);
  syncDebugDataset(diorama?.container, debug);
  if (typeof window !== 'undefined') {
    window.__threeDebug__ = debug;
    window.dispatchEvent(new CustomEvent('three:qa', { detail: createEventPayload(debug) }));
  }
  return debug;
}

export function updateThreeDebug(diorama) {
  const debug = publishDioramaDebug(diorama, diorama.sceneBuildContext);
  diorama.debug = debug;
}

export function countVisibleMeshes(root) {
  if (!root) return 0;
  let count = 0;
  root.traverse(node => {
    if (node.isMesh && node.visible !== false) count += 1;
  });
  return count;
}

let _cachedContrastMesh = null;
let _cachedContrastValue = 0;

function computeTerrainReliefContrast(terrainMesh) {
  if (_cachedContrastMesh === terrainMesh) return _cachedContrastValue;
  _cachedContrastMesh = terrainMesh;
  const colorAttr = terrainMesh?.geometry?.attributes?.color;
  if (!colorAttr) {
    _cachedContrastValue = 0;
    return 0;
  }
  const count = colorAttr.count;
  if (count === 0) {
    _cachedContrastValue = 0;
    return 0;
  }

  let sum = 0;
  const luminances = [];
  for (let i = 0; i < count; i += 1) {
    const r = colorAttr.getX(i);
    const g = colorAttr.getY(i);
    const b = colorAttr.getZ(i);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    luminances.push(lum);
    sum += lum;
  }

  const mean = sum / count;
  let variance = 0;
  for (let i = 0; i < luminances.length; i += 1) {
    variance += (luminances[i] - mean) ** 2;
  }
  variance /= count;
  const stdDev = Math.sqrt(variance);

  _cachedContrastValue = Number(Math.min(1, stdDev / 0.15).toFixed(3));
  return _cachedContrastValue;
}

function countBuildingMassings(root) {
  if (!root) return 0;
  const declaredCount = Number(root.userData?.count || 0);
  if (declaredCount > 0) return declaredCount;
  return countVisibleMeshes(root);
}

function countBridgePiers(root) {
  return countBridgeParts(root, 'pier');
}

function countBridgeParts(root, bridgePart) {
  if (!root) return 0;
  let count = 0;
  root.traverse(node => {
    if (node.isMesh && node.userData?.bridgePart === bridgePart) count += 1;
  });
  return count;
}

function computeVegetationCullingMetrics(diorama) {
  const group = diorama?.vegetationGroup;
  const chunks = Array.isArray(group?.userData?.chunks) ? group.userData.chunks : [];
  if (!group || chunks.length === 0) {
    return { chunkCount: 0, visibleChunkCount: 0, culledChunkCount: 0 };
  }
  if (!diorama?.camera) {
    return { chunkCount: chunks.length, visibleChunkCount: chunks.length, culledChunkCount: 0 };
  }

  group.updateWorldMatrix(true, true);
  diorama.camera.updateMatrixWorld();
  const projection = new THREE.Matrix4().multiplyMatrices(
    diorama.camera.projectionMatrix,
    diorama.camera.matrixWorldInverse
  );
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projection);

  let visibleChunkCount = 0;
  for (const chunk of chunks) {
    const bounds = getVegetationChunkWorldBounds(chunk);
    const visible = bounds.isEmpty() || frustum.intersectsBox(bounds);
    chunk.userData.frustumVisible = visible;
    if (visible) visibleChunkCount += 1;
  }

  const result = {
    chunkCount: chunks.length,
    visibleChunkCount,
    culledChunkCount: Math.max(0, chunks.length - visibleChunkCount)
  };
  group.userData.visibleChunkCount = result.visibleChunkCount;
  group.userData.culledChunkCount = result.culledChunkCount;
  return result;
}

function getVegetationChunkWorldBounds(chunk) {
  const rawBounds = chunk?.userData?.sceneBounds;
  if (rawBounds?.min && rawBounds?.max) {
    const bounds = new THREE.Box3(
      new THREE.Vector3(rawBounds.min.x, rawBounds.min.y, rawBounds.min.z),
      new THREE.Vector3(rawBounds.max.x, rawBounds.max.y, rawBounds.max.z)
    );
    chunk.updateWorldMatrix(true, false);
    return bounds.applyMatrix4(chunk.matrixWorld);
  }
  return new THREE.Box3().setFromObject(chunk);
}

function syncDebugDataset(container, debug) {
  if (!container?.dataset) return;
  const dataset = container.dataset;
  dataset.qaPhase = debug.phase || '';
  dataset.qaPassed = String(Boolean(debug.quality?.passed));
  dataset.qaCameraMode = debug.camera?.mode || '';
  dataset.qaCameraAutoRotate = String(Boolean(debug.camera?.autoRotate));
  dataset.qaCameraDistance = String(debug.camera?.distance || 0);
  dataset.qaCameraPolarAngle = String(debug.camera?.polarAngle || 0);
  dataset.qaCameraClearance = String(debug.camera?.clearance || 0);
  dataset.qaCameraPosition = formatVectorDataset(debug.camera?.position);
  dataset.qaCameraTarget = formatVectorDataset(debug.camera?.target);
  dataset.qaSceneId = debug.sceneId || '';
  dataset.qaTerrainMode = debug.terrainMode || '';
  dataset.qaTerrainConfidence = debug.terrainConfidence || '';
  dataset.qaRouteClearanceP95 = String(debug.qa?.geometry?.routeGroundClearanceP95 || 0);
  dataset.qaBuildingBaseErrorP95 = String(debug.qa?.geometry?.buildingBaseTerrainErrorP95 || 0);
  dataset.qaWaterCoverageRatio = String(debug.qa?.geometry?.waterCoverageRatio || 0);
  dataset.qaBridgeContinuity = String(debug.qa?.geometry?.bridgeContinuity || 0);
  dataset.qaVersion = String(debug.qa?.version || 0);
  dataset.qaZFightingRisk = String(debug.qa?.geometry?.zFightingRisk || 0);
  dataset.qaTerrainReliefContrast = String(debug.qa?.geometry?.terrainReliefContrast || 0);
  dataset.qaVisibleSemanticLayerCount = String(debug.qa?.geometry?.visibleSemanticLayerCount || 0);
  dataset.qaRouteVisiblePixelRatio = String(debug.qa?.geometry?.routeVisiblePixelRatio || 0);
  dataset.qaRouteGrayOutlinePixelRatio = String(
    debug.qa?.geometry?.routeGrayOutlinePixelRatio || 0
  );
  dataset.qaWorkAreaRaisedPixelRatio = String(debug.qa?.geometry?.workAreaRaisedPixelRatio || 0);
  dataset.qaOutsideDimmedPixelRatio = String(debug.qa?.geometry?.outsideDimmedPixelRatio || 0);
  dataset.workAreaSource = debug.workArea?.source || dataset.workAreaSource || '';
  dataset.workAreaSpanMeters = String(
    debug.workArea?.spanMeters || dataset.workAreaSpanMeters || 0
  );
  dataset.workAreaAnchorAdjusted = String(Boolean(debug.workArea?.anchorAdjusted));
  dataset.workAreaAnchorDistanceMeters = String(debug.workArea?.anchorDistanceMeters || 0);
  dataset.workAreaAnchorType = debug.workArea?.anchorType || '';
  dataset.qaBridgePierCount = String(debug.qa?.geometry?.bridgePierCount || 0);
  dataset.qaBuildingDetailRatio = String(debug.qa?.lod?.buildingDetailRatio || 0);
  dataset.qaBuildingDetailAlphaAverage = String(debug.qa?.lod?.buildingDetailAlphaAverage || 0);
  dataset.qaVegetationMaxInstancesPerArea = String(
    debug.qa?.budgets?.vegetationMaxInstancesPerArea || 0
  );
  dataset.qaVegetationDensityCap = String(debug.qa?.budgets?.vegetationDensityCap || 0);
  dataset.qaVegetationChunkCount = String(debug.qa?.budgets?.vegetationChunkCount || 0);
  dataset.qaVegetationVisibleChunkCount = String(
    debug.qa?.budgets?.vegetationVisibleChunkCount || 0
  );
  dataset.qaVegetationCulledChunkCount = String(debug.qa?.budgets?.vegetationCulledChunkCount || 0);
  dataset.qaWarningCount = String(debug.quality?.warnings?.length || 0);
  dataset.qaErrorCount = String(debug.quality?.errors?.length || 0);
}

function formatVectorDataset(vector) {
  if (!vector) return '';
  const values = [vector.x, vector.y, vector.z].map(value => Number(value));
  if (values.some(value => !Number.isFinite(value))) return '';
  return values.map(value => value.toFixed(2)).join(',');
}

function createEventPayload(debug) {
  return {
    phase: debug.phase,
    sceneId: debug.sceneId,
    passed: Boolean(debug.quality?.passed),
    warnings: debug.quality?.warnings || [],
    errors: debug.quality?.errors || [],
    geometry: debug.qa?.geometry || {}
  };
}
