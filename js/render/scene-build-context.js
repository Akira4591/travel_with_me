import { normalizeGeoAssets } from './geo-assets.js';

export function createSceneBuildContext({
  trip,
  activeDayId,
  locations = [],
  terrainMode,
  terrainModel,
  geoAssets = trip?.geoAssets
} = {}) {
  const normalizedGeoAssets = normalizeGeoAssets(geoAssets || {});
  const provenanceManifest = createProvenanceManifest({
    trip,
    activeDayId,
    geoAssets: normalizedGeoAssets,
    terrainModel
  });
  const layerCounts = countGeoAssetLayers(normalizedGeoAssets);
  const landmarkAssetStats = countLandmarkAssetStats(normalizedGeoAssets.landmarks);
  const geoAssetStatus = normalizeGeoAssetStatus(trip?.geoAssetStatus);
  const missingLayers = getMissingGeoAssetLayers(layerCounts);

  return {
    tripId: trip?.id || '',
    fixtureId: trip?.visualFixture?.id || '',
    fixtureSeed: trip?.visualFixture?.seed || trip?.visualFixture?.routeHash || '',
    profile: trip?.visualFixture?.profile || '',
    activeDayId: activeDayId || 'all',
    locationCount: locations.length,
    terrainMode: terrainMode?.id || '',
    terrainConfidence: terrainModel?.terrainConfidence || '',
    terrainMetrics: terrainModel?.metrics || {},
    geoAssets: normalizedGeoAssets,
    geoAssetStatus,
    layerCounts,
    landmarkAssetStats,
    provenanceManifest,
    qualityFlags: {
      hasRealGeoAssets: Object.values(layerCounts).some(count => count > 0),
      hasWaterways: layerCounts.waterways > 0,
      hasBridges: layerCounts.bridges > 0,
      hasBuildings: layerCounts.buildings > 0,
      hasLandcover: layerCounts.landcover > 0,
      hasLandmarks: layerCounts.landmarks > 0,
      hasIncompleteProvenance: false,
      degraded: geoAssetStatus.degraded,
      degradedReason: geoAssetStatus.reason,
      missingLayers
    },
    budgets: {
      terrainGrid: terrainMode?.terrainGrid || 0,
      routeSamples: terrainMode?.routeSamples || 0,
      maxBuildings: 120,
      maxRoads: 180,
      maxWaterways: 48,
      maxBridges: 48,
      maxLandcoverAreas: 48,
      maxLandmarks: 16
    }
  };
}

function countLandmarkAssetStats(landmarks = []) {
  const items = Array.isArray(landmarks) ? landmarks : [];
  return {
    total: items.length,
    allowlisted: items.filter(item => item.assetValidation?.passed).length,
    optimized: items.filter(item => item.asset?.optimized === true).length,
    withIntegrity: items.filter(item => /^sha256-/.test(String(item.asset?.integrity || ''))).length
  };
}

export function countGeoAssetLayers(geoAssets = {}) {
  return {
    buildings: countItems(geoAssets.buildings),
    roads: countItems(geoAssets.roads),
    waterways: countItems(geoAssets.waterways),
    bridges: countItems(geoAssets.bridges),
    landcover: countItems(geoAssets.landcover),
    landmarks: countItems(geoAssets.landmarks)
  };
}

function createProvenanceManifest({ trip, activeDayId, geoAssets, terrainModel }) {
  const sources = [];
  addSource(sources, {
    layer: 'terrain',
    source: terrainModel?.terrainConfidence || 'unknown',
    licence: terrainModel?.grid ? 'upstream-elevation-provider' : 'fallback-procedural',
    attribution: terrainModel?.grid ? 'Elevation provider' : 'Travel With Me procedural fallback',
    updatedAt: ''
  });

  Object.entries(geoAssets || {}).forEach(([layer, items]) => {
    (Array.isArray(items) ? items : []).forEach(item => {
      addSource(sources, { layer, ...item.provenance });
    });
  });

  return {
    sceneId: `${trip?.id || 'trip'}:${activeDayId || 'all'}`,
    generatedAt: new Date().toISOString(),
    sources
  };
}

function addSource(sources, item = {}) {
  const source = String(item.source || '').trim();
  const licence = String(item.licence || '').trim();
  const attribution = String(item.attribution || '').trim();
  if (!source || !licence || !attribution) return;
  const key = [item.layer || '', source, licence, attribution].join('|');
  if (sources.some(sourceItem => sourceItem.key === key)) return;
  sources.push({
    key,
    layer: String(item.layer || 'unknown'),
    source,
    licence,
    attribution,
    updatedAt: String(item.updatedAt || '')
  });
}

function countItems(value) {
  return Array.isArray(value) ? value.length : 0;
}

function normalizeGeoAssetStatus(status = {}) {
  const hasStatus = Boolean(status && Object.keys(status).length);
  const currentStatus = String(status.status || 'unknown');
  const degraded = hasStatus ? Boolean(status.degraded ?? currentStatus !== 'ok') : false;
  return {
    status: currentStatus,
    reason: String(status.reason || ''),
    sourceSummary: String(status.sourceSummary || ''),
    stale: Boolean(status.stale),
    degraded
  };
}

function getMissingGeoAssetLayers(layerCounts) {
  return Object.entries(layerCounts)
    .filter(([, count]) => count === 0)
    .map(([layer]) => layer);
}
