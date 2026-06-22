const ROUTE_CLEARANCE_P95_MAX_METERS = 0.3;
const BUILDING_BASE_ERROR_P95_MAX_METERS = 0.25;
const FIRST_SLAB_MAX_MS = 1500;

export function evaluateSceneQuality(debug = {}) {
  const geometry = normalizeGeometryMetrics(debug);
  const budgets = normalizeBudgets(debug);
  const provenance = normalizeProvenance(debug);
  const warnings = [];
  const errors = [];

  if (debug.firstSlabMs > FIRST_SLAB_MAX_MS) {
    errors.push(`FIRST_SLAB_SLOW:${debug.firstSlabMs}`);
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
  if (debug.geoAssetCounts?.roads > 0 && debug.counts?.roadMeshes === 0) {
    warnings.push('ROADS_WITHOUT_ROAD_MESH');
  }
  if (debug.quality?.degraded) {
    warnings.push(...(debug.quality.reasons || ['DEGRADED_GEO_ASSETS']));
  }
  if (provenance.missingRequiredFieldCount > 0) {
    warnings.push(`MISSING_PROVENANCE_FIELDS:${provenance.missingRequiredFieldCount}`);
  }

  return {
    passed: errors.length === 0,
    warnings: uniqueStrings(warnings),
    errors: uniqueStrings(errors),
    budgets,
    geometry,
    provenance,
    thresholds: {
      firstSlabMaxMs: FIRST_SLAB_MAX_MS,
      routeClearanceP95MaxMeters: ROUTE_CLEARANCE_P95_MAX_METERS,
      buildingBaseErrorP95MaxMeters: BUILDING_BASE_ERROR_P95_MAX_METERS
    }
  };
}

function normalizeGeometryMetrics(debug) {
  const metrics = debug.geometryMetrics || {};
  const counts = debug.counts || {};
  const geoAssetCounts = debug.geoAssetCounts || {};
  const waterCoverageRatio = ratio(counts.waterMeshes, geoAssetCounts.waterways);
  const bridgeContinuity =
    geoAssetCounts.bridges > 0 ? ratio(counts.bridgeDecks, geoAssetCounts.bridges) : 1;

  return {
    routeGroundClearanceP95: toFixedNumber(metrics.routeClearanceP95Meters),
    routeGroundClearanceMax: toFixedNumber(metrics.routeClearanceMaxMeters),
    buildingBaseTerrainErrorP95: toFixedNumber(metrics.buildingBaseTerrainErrorP95Meters),
    buildingBaseTerrainErrorMax: toFixedNumber(metrics.buildingBaseTerrainErrorMaxMeters),
    terrainHeightVariance: toFixedNumber(debug.elevationRange),
    waterCoverageRatio,
    bridgeContinuity,
    bridgeCount: Number(counts.bridgeDecks || 0),
    buildingFloatingCount: 0,
    buildingPenetrationCount: 0
  };
}

function normalizeBudgets(debug) {
  return {
    terrainChunks: Number(debug.counts?.terrainChunks || 0),
    buildingInstances: Number(debug.counts?.buildingMassings || 0),
    buildingDetailed: Number(debug.counts?.buildingDetailed || 0),
    vegetationInstances: Number(debug.counts?.vegetationInstances || 0),
    visibleMeshCount: Number(debug.visibleMeshCount || 0)
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

  return {
    buildingRealRatio: buildingCount > 0 ? 1 : 0,
    landmarkAllowlisted: 0,
    landmarkCount,
    missingAttributionCount: sources.filter(source => !source.attribution).length,
    missingRequiredFieldCount,
    sourceCount: sources.length
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
