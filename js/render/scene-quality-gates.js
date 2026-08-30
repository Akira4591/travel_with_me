const ROUTE_CLEARANCE_P95_MAX_METERS = 0.3;
const BUILDING_BASE_ERROR_P95_MAX_METERS = 0.25;
const FIRST_SLAB_MAX_MS = 1500;
const WORK_AREA_HARD_CAP_METERS = 2000;

export function evaluateSceneQuality(debug = {}) {
  const geometry = normalizeGeometryMetrics(debug);
  const budgets = normalizeBudgets(debug);
  const provenance = normalizeProvenance(debug);
  const layers = normalizeLayers(debug);
  const lod = normalizeLod(debug);
  geometry.visibleSemanticLayerCount = countVisibleLayers(layers);
  const warnings = [];
  const errors = [];

  if (debug.firstSlabMs > FIRST_SLAB_MAX_MS) {
    errors.push(`FIRST_SLAB_SLOW:${debug.firstSlabMs}`);
  }
  if (debug.workArea?.spanMeters > WORK_AREA_HARD_CAP_METERS) {
    errors.push(`WORK_AREA_SPAN_EXCEEDS_CAP:${debug.workArea.spanMeters}`);
  }
  if (debug.workArea && geometry.workAreaRaisedPixelRatio < 1) {
    errors.push(`WORK_AREA_NOT_RAISED:${geometry.workAreaRaisedPixelRatio}`);
  }
  if (debug.workArea && geometry.outsideDimmedPixelRatio < 1) {
    errors.push(`OUTSIDE_CONTEXT_NOT_DIMMED:${geometry.outsideDimmedPixelRatio}`);
  }
  if (geometry.routeGrayOutlinePixelRatio > 0) {
    errors.push(`ROUTE_GRAY_OUTLINE_VISIBLE:${geometry.routeGrayOutlinePixelRatio}`);
  }
  if (geometry.routeGroundClearanceP95 > ROUTE_CLEARANCE_P95_MAX_METERS) {
    errors.push(`ROUTE_CLEARANCE_P95_HIGH:${geometry.routeGroundClearanceP95}`);
  }
  if (geometry.buildingBaseTerrainErrorP95 > BUILDING_BASE_ERROR_P95_MAX_METERS) {
    errors.push(`BUILDING_BASE_ERROR_P95_HIGH:${geometry.buildingBaseTerrainErrorP95}`);
  }
  if (debug.geoAssetCounts?.waterways > 0 && debug.counts?.waterMeshes === 0) {
    errors.push('WATERWAYS_WITHOUT_WATER_MESH');
  }
  if (debug.geoAssetCounts?.bridges > 0 && debug.counts?.bridgeDecks === 0) {
    errors.push('BRIDGES_WITHOUT_DECK');
  }
  if (debug.counts?.bridgePiers > 0 && debug.counts?.bridgeDecks === 0) {
    errors.push('BRIDGE_PIERS_WITHOUT_DECK');
  }
  if (
    budgets.vegetationDensityCap > 0 &&
    budgets.vegetationMaxInstancesPerArea > budgets.vegetationDensityCap
  ) {
    errors.push(
      `VEGETATION_DENSITY_CAP_EXCEEDED:${budgets.vegetationMaxInstancesPerArea}/${budgets.vegetationDensityCap}`
    );
  }
  if (debug.geoAssetCounts?.roads > 0 && debug.counts?.roadMeshes === 0) {
    warnings.push('ROADS_WITHOUT_ROAD_MESH');
  }
  if (debug.quality?.degraded) {
    warnings.push(...(debug.quality.reasons || ['DEGRADED_GEO_ASSETS']));
  }
  if (provenance.missingRequiredFieldCount > 0) {
    warnings.push(`MISSING_PROVENANCE_FIELDS:${provenance.missingRequiredFieldCount}`);
  }
  const TERRAIN_RELIEF_CONTRAST_MIN = 0.02;
  if (
    debug.terrainMode === 'hiking' &&
    geometry.terrainReliefContrast < TERRAIN_RELIEF_CONTRAST_MIN
  ) {
    warnings.push(`TERRAIN_RELIEF_CONTRAST_LOW:${geometry.terrainReliefContrast}`);
  }
  if (provenance.landmarkCount > 0 && provenance.landmarkAllowlisted < provenance.landmarkCount) {
    errors.push(
      `LANDMARK_ASSET_NOT_RELEASE_GATED:${provenance.landmarkAllowlisted}/${provenance.landmarkCount}`
    );
  }

  return {
    version: 1,
    passed: errors.length === 0,
    warnings: uniqueStrings(warnings),
    errors: uniqueStrings(errors),
    budgets,
    geometry,
    provenance,
    layers,
    lod,
    thresholds: {
      firstSlabMaxMs: FIRST_SLAB_MAX_MS,
      workAreaHardCapMeters: WORK_AREA_HARD_CAP_METERS,
      routeClearanceP95MaxMeters: ROUTE_CLEARANCE_P95_MAX_METERS,
      buildingBaseErrorP95MaxMeters: BUILDING_BASE_ERROR_P95_MAX_METERS
    }
  };
}

function normalizeLod(debug) {
  const metrics = debug.lodMetrics || debug.buildingGroup?.userData?.lodMetrics || {};
  const entryCount = Number(metrics.entryCount || debug.counts?.buildingMassings || 0);
  return {
    buildingEntryCount: entryCount,
    buildingDetailRatio: toFixedNumber(metrics.detailRatio),
    buildingDetailAlphaAverage: toFixedNumber(metrics.detailAlphaAverage),
    buildingDistanceP50: toFixedNumber(metrics.distanceP50)
  };
}

function normalizeGeometryMetrics(debug) {
  const metrics = debug.geometryMetrics || {};
  const counts = debug.counts || {};
  const geoAssetCounts = debug.geoAssetCounts || {};
  const waterCoverageRatio = Number.isFinite(Number(metrics.waterCoverageRatio))
    ? toFixedNumber(metrics.waterCoverageRatio)
    : ratio(counts.waterMeshes, geoAssetCounts.waterways);
  const bridgeContinuity =
    Number.isFinite(Number(metrics.bridgeContinuity)) && geoAssetCounts.bridges > 0
      ? toFixedNumber(metrics.bridgeContinuity)
      : geoAssetCounts.bridges > 0
        ? ratio(counts.bridgeDecks, geoAssetCounts.bridges)
        : 1;

  return {
    routeGroundClearanceP95: toFixedNumber(metrics.routeClearanceP95Meters),
    routeGroundClearanceMax: toFixedNumber(metrics.routeClearanceMaxMeters),
    buildingBaseTerrainErrorP95: toFixedNumber(metrics.buildingBaseTerrainErrorP95Meters),
    buildingBaseTerrainErrorMax: toFixedNumber(metrics.buildingBaseTerrainErrorMaxMeters),
    terrainHeightVariance: toFixedNumber(debug.elevationRange),
    terrainCarvingDepthP50: toFixedNumber(metrics.terrainCarvingDepthP50Meters),
    waterCoverageRatio,
    bridgeContinuity,
    zFightingRisk: toFixedNumber(metrics.zFightingRisk),
    routeVisiblePixelRatio: toFixedNumber(metrics.routeVisiblePixelRatio || 1),
    routeGrayOutlinePixelRatio: toFixedNumber(metrics.routeGrayOutlinePixelRatio),
    workAreaRaisedPixelRatio: toFixedNumber(metrics.workAreaRaisedPixelRatio),
    outsideDimmedPixelRatio: toFixedNumber(metrics.outsideDimmedPixelRatio),
    terrainReliefContrast: toFixedNumber(metrics.terrainReliefContrast),
    bridgePierCount: Number(counts.bridgePiers || 0),
    bridgeCount: Number(counts.bridgeDecks || 0)
  };
}

function normalizeBudgets(debug) {
  const counts = debug.counts || {};
  const visibleMeshCount = Number(debug.visibleMeshCount || 0);
  const vegetationMetrics = debug.vegetationMetrics || {};
  return {
    terrainChunks: Number(counts.terrainChunks || 0),
    buildingInstances: Number(counts.buildingMassings || 0),
    buildingDetailed: Number(counts.buildingDetailed || 0),
    vegetationInstances: Number(counts.vegetationInstances || 0),
    vegetationAreaCount: Number(vegetationMetrics.areaCount || 0),
    vegetationMaxInstancesPerArea: Number(vegetationMetrics.maxInstancesPerArea || 0),
    vegetationDensityCap: Number(vegetationMetrics.densityCap || 0),
    vegetationChunkCount: Number(vegetationMetrics.chunkCount || 0),
    vegetationVisibleChunkCount: Number(vegetationMetrics.visibleChunkCount || 0),
    vegetationCulledChunkCount: Number(vegetationMetrics.culledChunkCount || 0),
    visibleMeshCount,
    triangleCount: Number(debug.triangleCount || debug.containerMetrics?.triangleCount || 0),
    frameTimeP95: Number(debug.frameTimeP95 || debug.containerMetrics?.frameTimeP95 || 0),
    generationTimeMs: Number(debug.generationTimeMs || debug.firstSlabMs || 0),
    textureMemoryEstimateMB: Number(debug.textureMemoryEstimateMB || 0)
  };
}

function normalizeProvenance(debug) {
  const sources = Array.isArray(debug.provenanceSources) ? debug.provenanceSources : [];
  const requiredFields = ['source', 'licence', 'attribution', 'updatedAt'];
  const missingRequiredFieldCount = sources.reduce(
    (total, source) =>
      total + requiredFields.filter(field => !String(source?.[field] || '').trim()).length,
    0
  );
  const buildingCount = Number(debug.geoAssetCounts?.buildings || 0);
  const landmarkCount = Number(debug.geoAssetCounts?.landmarks || 0);
  const landmarkAssetStats = debug.landmarkAssetStats || {};

  return {
    totalRealAssets: sources.length,
    buildingRealRatio: buildingCount > 0 ? 1 : 0,
    landmarkAllowlisted: Number(landmarkAssetStats.allowlisted || 0),
    landmarkCount,
    landmarkOptimized: Number(landmarkAssetStats.optimized || 0),
    landmarkIntegrityCount: Number(landmarkAssetStats.withIntegrity || 0),
    missingSourceCount: sources.filter(source => !source.source).length,
    missingLicenceCount: sources.filter(source => !source.licence).length,
    missingAttributionCount: sources.filter(source => !source.attribution).length,
    missingUpdatedAtCount: sources.filter(source => !source.updatedAt).length,
    missingRequiredFieldCount,
    sourceCount: sources.length
  };
}

function normalizeLayers(debug) {
  const counts = debug.counts || {};
  const geoAssetCounts = debug.geoAssetCounts || {};
  const quality = debug.quality || {};
  const missingLayers = new Set(quality.missingLayers || []);
  return {
    water: layerState(counts.waterMeshes, geoAssetCounts.waterways, missingLayers.has('waterways')),
    roads: layerState(counts.roadMeshes, geoAssetCounts.roads, missingLayers.has('roads')),
    bridges: layerState(counts.bridgeDecks, geoAssetCounts.bridges, missingLayers.has('bridges')),
    route: layerState(counts.routeSegments, debug.routeGeometryCount, false),
    buildings: layerState(
      Number(counts.buildingMassings || 0) + Number(counts.buildingDetailed || 0),
      geoAssetCounts.buildings,
      missingLayers.has('buildings')
    ),
    vegetation: layerState(
      counts.vegetationInstances,
      geoAssetCounts.landcover,
      missingLayers.has('landcover')
    )
  };
}

function layerState(renderedCount, expectedCount, missing) {
  const count = Number(renderedCount || 0);
  const expected = Number(expectedCount || 0);
  return {
    visible: count > 0,
    count,
    expected,
    degraded: Boolean(missing && expected === 0)
  };
}

function ratio(numerator, denominator) {
  const bottom = Number(denominator) || 0;
  if (bottom <= 0) return 1;
  return toFixedNumber((Number(numerator) || 0) / bottom);
}

function toFixedNumber(value) {
  const number = Number(value) || 0;
  return Number(number.toFixed(3));
}

function uniqueStrings(items) {
  return [...new Set(items.map(item => String(item)).filter(Boolean))];
}

function countVisibleLayers(layers) {
  if (!layers) return 0;
  const keys = ['water', 'roads', 'bridges', 'route', 'buildings', 'vegetation'];
  let count = 0;
  for (const key of keys) {
    if (layers[key]?.visible) count += 1;
  }
  return count;
}
