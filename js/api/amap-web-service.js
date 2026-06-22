const BFF_PREFIX = '/_AMapService';

export async function requestAMapWebService(path, params = {}) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const url = `${BFF_PREFIX}${path}${query ? `?${query}` : ''}`;

  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        code: String(payload?.info || `HTTP_${response.status}`),
        payload
      };
    }
    if (payload?.status === '1' || Number(payload?.errcode) === 0) {
      return { ok: true, payload };
    }
    return {
      ok: false,
      code: String(payload?.info || payload?.errmsg || 'AMAP_REQUEST_FAILED'),
      payload
    };
  } catch {
    return { ok: false, code: 'BFF_NETWORK_FAILED', payload: null };
  }
}

export function normalizeLngLat(value) {
  if (typeof value === 'string') {
    const [lng, lat] = value.split(',').map(item => Number(item.trim()));
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }
  if (Array.isArray(value) && value.length >= 2) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }
  const lng = Number(value?.lng ?? value?.Lng);
  const lat = Number(value?.lat ?? value?.Lat);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}
