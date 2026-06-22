const GEO_ASSETS_ENDPOINT = '/_geo-assets';

export async function fetchNearbyGeoAssets(locations = []) {
  const points = uniquePoints(locations);
  if (!points.length) {
    return createGeoAssetResult({ status: 'skipped', reason: 'NO_VALID_POINTS' });
  }

  const url = new URL(GEO_ASSETS_ENDPOINT, window.location.origin);
  url.searchParams.set('points', points.map(([lng, lat]) => `${lng},${lat}`).join('|'));
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return createGeoAssetResult({
        status: 'degraded',
        reason: payload?.error || `HTTP_${response.status}`,
        sourceSummary: payload?.message || '周边地理要素暂不可用。'
      });
    }
    const geoAssets =
      payload?.geoAssets && typeof payload.geoAssets === 'object' ? payload.geoAssets : null;
    const isEmpty = payload?.status === 'empty';
    return createGeoAssetResult({
      status: geoAssets && !isEmpty ? 'ok' : 'degraded',
      reason: geoAssets && !isEmpty ? '' : 'EMPTY_GEO_ASSETS',
      sourceSummary: payload?.attribution || '',
      data: geoAssets,
      stale: payload?.status === 'stale'
    });
  } catch (err) {
    return createGeoAssetResult({
      status: 'degraded',
      reason: err?.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      sourceSummary: '周边地理要素请求失败。'
    });
  }
}

function createGeoAssetResult({
  status,
  reason = '',
  sourceSummary = '',
  data = null,
  stale = false
} = {}) {
  return {
    status,
    reason,
    sourceSummary,
    data,
    stale: Boolean(stale),
    degraded: status !== 'ok'
  };
}

function uniquePoints(locations) {
  const seen = new Set();
  return (Array.isArray(locations) ? locations : [])
    .map(location => location?.lnglat)
    .map(point => [Number(point?.[0]), Number(point?.[1])])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
    .filter(([lng, lat]) => {
      const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
