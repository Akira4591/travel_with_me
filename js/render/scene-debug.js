import { evaluateSceneQuality } from './scene-quality-gates.js';

export function createDioramaDebugSnapshot(diorama, sceneContext) {
  const routeUserData = diorama.routeGroup?.userData || {};
  const layerCounts = sceneContext?.layerCounts || {};
  const manifestSources = sceneContext?.provenanceManifest?.sources || [];
  const qualityFlags = sceneContext?.qualityFlags || {};
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
    geometryMetrics: {
      routeClearanceP95Meters: Number(routeUserData.routeClearanceP95Meters || 0),
      routeClearanceMaxMeters: Number(routeUserData.routeClearanceMaxMeters || 0),
      buildingBaseTerrainErrorP95Meters: Number(
        diorama.buildingGroup?.userData?.baseTerrainErrorP95Meters || 0
      ),
      buildingBaseTerrainErrorMaxMeters: Number(
        diorama.buildingGroup?.userData?.baseTerrainErrorMaxMeters || 0
      )
    },
    geoAssetCounts: {
      buildings: layerCounts.buildings || 0,
      roads: layerCounts.roads || 0,
      waterways: layerCounts.waterways || 0,
      bridges: layerCounts.bridges || 0,
      landcover: layerCounts.landcover || 0,
      landmarks: layerCounts.landmarks || 0
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
      buildingMassings: countVisibleMeshes(diorama.buildingGroup),
      buildingDetailed: diorama.buildingDetailCount || 0,
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

export function countVisibleMeshes(root) {
  if (!root) return 0;
  let count = 0;
  root.traverse(node => {
    if (node.isMesh && node.visible !== false) count += 1;
  });
  return count;
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

function syncDebugDataset(container, debug) {
  if (!container?.dataset) return;
  const dataset = container.dataset;
  dataset.qaPhase = debug.phase || '';
  dataset.qaPassed = String(Boolean(debug.quality?.passed));
  dataset.qaSceneId = debug.sceneId || '';
  dataset.qaTerrainMode = debug.terrainMode || '';
  dataset.qaTerrainConfidence = debug.terrainConfidence || '';
  dataset.qaRouteClearanceP95 = String(debug.qa?.geometry?.routeGroundClearanceP95 || 0);
  dataset.qaBuildingBaseErrorP95 = String(debug.qa?.geometry?.buildingBaseTerrainErrorP95 || 0);
  dataset.qaWaterCoverageRatio = String(debug.qa?.geometry?.waterCoverageRatio || 0);
  dataset.qaBridgeContinuity = String(debug.qa?.geometry?.bridgeContinuity || 0);
  dataset.qaWarningCount = String(debug.quality?.warnings?.length || 0);
  dataset.qaErrorCount = String(debug.quality?.errors?.length || 0);
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
