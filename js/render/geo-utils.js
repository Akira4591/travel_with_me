// js/render/geo-utils.js
// Geographic utility functions for coordinate validation, center computation,
// work area normalization, and distance calculation.

import { clamp } from './math-utils.js';

const DEFAULT_WORK_AREA_SPAN_METERS = 800;
const MIN_WORK_AREA_SPAN_METERS = 300;
const WORK_AREA_HARD_CAP_METERS = 2000;

export { DEFAULT_WORK_AREA_SPAN_METERS, MIN_WORK_AREA_SPAN_METERS, WORK_AREA_HARD_CAP_METERS };

export function isValidLngLat(v) {
  return Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]);
}

export function computeCenter(lnglats) {
  let sumLng = 0,
    sumLat = 0;
  for (const [lng, lat] of lnglats) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLng / lnglats.length, sumLat / lnglats.length];
}

export function squareBounds(center, spanMeters) {
  const half = spanMeters / 2;
  const latDelta = half / 111320;
  const lngDelta = half / (111320 * Math.cos((center[1] * Math.PI) / 180));
  return {
    minLng: center[0] - lngDelta,
    maxLng: center[0] + lngDelta,
    minLat: center[1] - latDelta,
    maxLat: center[1] + latDelta
  };
}

export function normalizeWorkArea(workArea, fallbackLnglats) {
  const fallbackCenter = computeCenter(fallbackLnglats);
  const hardCapMeters = clamp(
    Number(workArea?.hardCapMeters) || WORK_AREA_HARD_CAP_METERS,
    MIN_WORK_AREA_SPAN_METERS,
    WORK_AREA_HARD_CAP_METERS
  );
  const requestedSpan = Number(workArea?.spanMeters);
  const spanMeters = clamp(
    Number.isFinite(requestedSpan) ? requestedSpan : DEFAULT_WORK_AREA_SPAN_METERS,
    MIN_WORK_AREA_SPAN_METERS,
    hardCapMeters
  );
  const center = isValidLngLat(workArea?.center) ? workArea.center.map(Number) : fallbackCenter;
  return {
    source: workArea?.source || 'fallback-trip-center',
    center,
    requestedCenter: isValidLngLat(workArea?.requestedCenter)
      ? workArea.requestedCenter.map(Number)
      : null,
    anchorAdjusted: Boolean(workArea?.anchorAdjusted),
    anchorReason: workArea?.anchorReason || '',
    anchorDistanceMeters: Math.round(Number(workArea?.anchorDistanceMeters) || 0),
    anchorType: workArea?.anchorType || '',
    spanMeters: Math.round(spanMeters),
    hardCapMeters: Math.round(hardCapMeters),
    profile: workArea?.profile || 'default',
    bounds: squareBounds(center, spanMeters)
  };
}

export function distanceMeters([lngA, latA], [lngB, latB]) {
  const midLat = ((latA + latB) / 2) * (Math.PI / 180);
  const dx = (lngB - lngA) * 111320 * Math.cos(midLat);
  const dy = (latB - latA) * 111320;
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeRouteLength(lnglats) {
  let total = 0;
  for (let i = 0; i < lnglats.length - 1; i += 1) {
    total += distanceMeters(lnglats[i], lnglats[i + 1]);
  }
  return total;
}

export function collectDayLocations(trip, activeDayId) {
  const locations = [];
  const days = activeDayId === 'all' ? trip.days : trip.days.filter(d => d.id === activeDayId);

  for (const day of days) {
    for (const event of day.events || []) {
      const loc = trip.locations[event.locationId];
      if (loc?.lnglat && isValidLngLat(loc.lnglat)) {
        locations.push({ id: event.locationId, eventId: event.id, ...loc });
      }
    }
  }
  return locations;
}

export function formatRouteDistance(distanceMeters) {
  const meters = Number(distanceMeters) || 0;
  return meters >= 1000 ? `路线 ${Math.round((meters / 1000) * 10) / 10}km` : `路线 ${meters}m`;
}

export function disposeSceneObject(object) {
  object.traverse(node => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach(material => material.dispose?.());
  });
}
