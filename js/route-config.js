import { getTransportLabel } from './utils.js';

export const ROUTE_MODE_OPTIONS = [
  { id: 'driving', label: '打车/驾车' },
  { id: 'walking', label: '步行' },
  { id: 'transit', label: '公共交通' },
  { id: 'riding', label: '骑行' }
];

const ROUTE_MODE_IDS = ROUTE_MODE_OPTIONS.map(option => option.id);

export function normalizeRouteMode(mode) {
  return ROUTE_MODE_IDS.includes(mode) ? mode : 'driving';
}

export function normalizeRouteToNext(route = {}) {
  const mode = normalizeRouteMode(route.mode);
  const label = String(route.label || '').trim();
  const legs = Array.isArray(route.legs)
    ? route.legs
      .map(leg => ({
        mode: normalizeRouteMode(leg?.mode),
        label: String(leg?.label || '').trim()
      }))
      .filter(leg => leg.label)
    : [];

  return {
    mode,
    ...(label ? { label } : {}),
    ...(legs.length ? { legs } : {}),
    ...(route.manual === true || label || legs.length ? { manual: true } : {})
  };
}

export function getRouteDisplayLabel(route = {}) {
  const normalized = normalizeRouteToNext(route);
  return normalized.label || getTransportLabel(normalized.mode);
}
