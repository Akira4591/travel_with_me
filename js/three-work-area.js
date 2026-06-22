import { calculateDistance } from './utils.js';

const DEFAULT_ANCHOR_MARGIN_METERS = 0.45;
const MIN_ANCHOR_RADIUS_METERS = 120;

export function resolveAnchored3DWorkArea(workArea, trip, activeDayId) {
  if (!workArea || !isLngLat(workArea.center)) return workArea;
  const anchors = collect3DWorkAreaAnchors(trip, activeDayId);
  if (!anchors.length) return workArea;

  const spanMeters = Number(workArea.spanMeters) || 800;
  const anchorRadius = Math.max(
    MIN_ANCHOR_RADIUS_METERS,
    spanMeters * DEFAULT_ANCHOR_MARGIN_METERS
  );
  const nearest = findNearestAnchor(workArea.center, anchors);
  if (!nearest || nearest.distanceMeters <= anchorRadius) return workArea;
  const nearestLocation = findNearestAnchor(
    workArea.center,
    anchors.filter(anchor => anchor.type === 'location')
  );
  const targetAnchor = nearestLocation || nearest;

  return {
    ...workArea,
    requestedCenter: workArea.center,
    center: targetAnchor.lnglat,
    anchorAdjusted: true,
    anchorReason: 'selected-center-outside-data-coverage',
    anchorDistanceMeters: Math.round(targetAnchor.distanceMeters),
    anchorType: targetAnchor.type
  };
}

export function collect3DWorkAreaAnchors(trip, activeDayId) {
  if (!trip) return [];
  const days =
    activeDayId === 'all'
      ? trip.days || []
      : (trip.days || []).filter(day => day.id === activeDayId);
  const anchors = [];
  for (const day of days) {
    for (const event of day.events || []) {
      const location = trip.locations?.[event.locationId];
      if (isLngLat(location?.lnglat)) {
        anchors.push({ type: 'location', lnglat: location.lnglat.map(Number) });
      }
      for (const point of routeGeometryPoints(event.routeToNext?.geometry)) {
        anchors.push({ type: 'route', lnglat: point });
      }
    }
  }
  return dedupeAnchors(anchors);
}

function findNearestAnchor(center, anchors) {
  let nearest = null;
  for (const anchor of anchors) {
    const distanceMeters = calculateDistance(center, anchor.lnglat);
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { ...anchor, distanceMeters };
    }
  }
  return nearest;
}

function routeGeometryPoints(geometry) {
  if (Array.isArray(geometry)) return geometry.filter(isLngLat).map(point => point.map(Number));
  const paths = Array.isArray(geometry?.paths) ? geometry.paths : [];
  return paths
    .flatMap(path => (Array.isArray(path) ? path : []))
    .filter(isLngLat)
    .map(point => point.map(Number));
}

function dedupeAnchors(anchors) {
  const seen = new Set();
  const result = [];
  for (const anchor of anchors) {
    const key = anchor.lnglat.map(value => Number(value).toFixed(6)).join(',');
    const existingIndex = result.findIndex(item => item.key === key);
    if (existingIndex >= 0) {
      if (anchor.type === 'location' && result[existingIndex].anchor.type !== 'location') {
        result[existingIndex] = { key, anchor };
      }
      continue;
    }
    seen.add(key);
    result.push({ key, anchor });
  }
  return result.map(item => item.anchor);
}

function isLngLat(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  );
}
