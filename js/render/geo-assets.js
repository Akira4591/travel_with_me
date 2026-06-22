const MAX_BUILDINGS = 120;
const MAX_ROADS = 180;
const MAX_LANDCOVER_AREAS = 48;
const MAX_WATERWAYS = 48;
const MAX_BRIDGES = 48;

export function normalizeGeoAssets(input = {}) {
  return {
    buildings: normalizeBuildings(input.buildings),
    roads: normalizeRoads(input.roads),
    landcover: normalizeLandcover(input.landcover),
    waterways: normalizeWaterways(input.waterways),
    bridges: normalizeBridges(input.bridges),
    landmarks: normalizeLandmarks(input.landmarks)
  };
}

function normalizeRoads(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const centerline = normalizeLine(item?.centerline);
      const provenance = normalizeProvenance(item?.provenance);
      if (centerline.length < 2 || !provenance) return null;
      return {
        id: String(item.id || `road-${index + 1}`),
        centerline,
        kind: ['major', 'local', 'path'].includes(item.kind) ? item.kind : 'local',
        widthMeters: clamp(Number(item.widthMeters) || 6, 1.5, 80),
        provenance
      };
    })
    .filter(Boolean)
    .slice(0, MAX_ROADS);
}

function normalizeWaterways(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const polygon = normalizePolygon(item?.polygon);
      const centerline = normalizeLine(item?.centerline);
      const provenance = normalizeProvenance(item?.provenance);
      if ((!polygon.length || polygon.length < 3) && centerline.length < 2) return null;
      if (!provenance) return null;
      const rawWidth = Number(item?.widthMeters);
      const hasProviderWidth = Number.isFinite(rawWidth) && rawWidth > 0;
      if (centerline.length >= 2 && polygon.length < 3 && !hasProviderWidth) return null;
      return {
        id: String(item.id || `waterway-${index + 1}`),
        polygon,
        centerline,
        widthMeters: hasProviderWidth ? clamp(rawWidth, 2, 800) : 12,
        provenance
      };
    })
    .filter(Boolean)
    .slice(0, MAX_WATERWAYS);
}

function normalizeBridges(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const centerline = normalizeLine(item?.centerline);
      const piers = normalizeLine(item?.piers);
      const provenance = normalizeProvenance(item?.provenance);
      if (centerline.length < 2 || !provenance) return null;
      return {
        id: String(item.id || `bridge-${index + 1}`),
        centerline,
        piers,
        widthMeters: clamp(Number(item.widthMeters) || 8, 2, 80),
        deckHeightMeters: clamp(Number(item.deckHeightMeters) || 5, 1, 80),
        provenance
      };
    })
    .filter(Boolean)
    .slice(0, MAX_BRIDGES);
}

function normalizeBuildings(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const footprint = normalizePolygon(item?.footprint);
      const provenance = normalizeProvenance(item?.provenance);
      if (footprint.length < 3 || !provenance) return null;
      return {
        id: String(item.id || `building-${index + 1}`),
        locationId: item.locationId ? String(item.locationId) : '',
        footprint,
        heightMeters: clamp(Number(item.heightMeters) || 9, 2.5, 300),
        roof: ['flat', 'gable', 'pyramid'].includes(item.roof) ? item.roof : 'flat',
        provenance
      };
    })
    .filter(Boolean)
    .slice(0, MAX_BUILDINGS);
}

function normalizeLandcover(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const polygon = normalizePolygon(item?.polygon);
      const provenance = normalizeProvenance(item?.provenance);
      if (polygon.length < 3 || !provenance || item?.licensed !== true) return null;
      return {
        id: String(item.id || `landcover-${index + 1}`),
        polygon,
        cover: ['forest', 'scrub', 'grass'].includes(item.cover) ? item.cover : 'forest',
        licensed: true,
        provenance
      };
    })
    .filter(Boolean)
    .slice(0, MAX_LANDCOVER_AREAS);
}

function normalizeLandmarks(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const provenance = normalizeProvenance(item?.provenance);
      const lnglat = normalizePoint(item?.lnglat);
      if (!lnglat || !provenance || !item?.modelUrl) return null;
      return {
        id: String(item.id || `landmark-${index + 1}`),
        lnglat,
        modelUrl: String(item.modelUrl),
        provenance
      };
    })
    .filter(Boolean)
    .slice(0, 16);
}

function normalizeProvenance(value) {
  if (!value || typeof value !== 'object') return null;
  const source = String(value.source || '').trim();
  const licence = String(value.licence || '').trim();
  const attribution = String(value.attribution || '').trim();
  const updatedAt = String(value.updatedAt || '').trim();
  return source && licence && attribution && updatedAt
    ? { source, licence, attribution, updatedAt }
    : null;
}

function normalizePolygon(points) {
  return (Array.isArray(points) ? points : []).map(normalizePoint).filter(Boolean).slice(0, 200);
}

function normalizeLine(points) {
  return (Array.isArray(points) ? points : []).map(normalizePoint).filter(Boolean).slice(0, 300);
}

function normalizePoint(point) {
  const lng = Number(point?.[0]);
  const lat = Number(point?.[1]);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
