import { calculateDistance } from './utils.js';

const HASH_PRECISION = 6;

export function normalizeRoutePath(path) {
  return (Array.isArray(path) ? path : []).map(point => normalizeRoutePoint(point)).filter(Boolean);
}

export function getPrimaryRoutePath(geometry) {
  const paths = (Array.isArray(geometry?.paths) ? geometry.paths : [])
    .map(normalizeRoutePath)
    .filter(path => path.length >= 2);
  if (!paths.length) return [];
  return paths.reduce((longest, path) => (path.length > longest.length ? path : longest));
}

export function createRouteGeometryDiagnostics(geometry = {}) {
  const path = getPrimaryRoutePath(geometry);
  const lengthMeters = getRoutePathLengthMeters(path);
  return {
    hash: hashRoutePath(path),
    pointCount: path.length,
    lengthMeters,
    firstPoint: path[0] || null,
    lastPoint: path[path.length - 1] || null,
    source: geometry?.source || '',
    mode: geometry?.mode || ''
  };
}

export function hashRoutePath(path) {
  const normalized = normalizeRoutePath(path);
  if (normalized.length < 2) return '';
  return fnv1a(
    normalized
      .map(([lng, lat]) => `${lng.toFixed(HASH_PRECISION)},${lat.toFixed(HASH_PRECISION)}`)
      .join(';')
  );
}

export function getRoutePathLengthMeters(path) {
  const normalized = normalizeRoutePath(path);
  if (normalized.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < normalized.length; index += 1) {
    total += calculateDistance(normalized[index - 1], normalized[index]);
  }
  return Math.round(total);
}

function normalizeRoutePoint(point) {
  if (!point) return null;
  if (Array.isArray(point) && point.length >= 2) {
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }
  const lng = Number(point.lng ?? point.Lng);
  const lat = Number(point.lat ?? point.Lat);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function fnv1a(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
