import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchNearbyGeoAssets } from '../api/geo-assets.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geo assets API client', () => {
  it('returns structured ok results with data', async () => {
    stubLocation();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          geoAssets: { waterways: [{ id: 'river-1' }] },
          attribution: 'OpenStreetMap'
        })
      })
    );

    const result = await fetchNearbyGeoAssets([{ lnglat: [116, 39] }]);

    expect(result).toMatchObject({
      status: 'ok',
      degraded: false,
      data: { waterways: [{ id: 'river-1' }] }
    });
  });

  it('maps empty upstream payloads into degraded results', async () => {
    stubLocation();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'empty', geoAssets: {}, attribution: 'OpenStreetMap' })
      })
    );

    const result = await fetchNearbyGeoAssets([{ lnglat: [116, 39] }]);

    expect(result).toMatchObject({
      status: 'degraded',
      reason: 'EMPTY_GEO_ASSETS',
      degraded: true,
      data: {}
    });
  });

  it('maps failed requests into degraded results with reasons', async () => {
    stubLocation();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        json: async () => ({
          error: 'GEO_ASSETS_UPSTREAM_TIMEOUT',
          message: '周边地理要素请求超时。'
        })
      })
    );

    const result = await fetchNearbyGeoAssets([{ lnglat: [116, 39] }]);

    expect(result).toMatchObject({
      status: 'degraded',
      reason: 'GEO_ASSETS_UPSTREAM_TIMEOUT',
      degraded: true
    });
  });
});

function stubLocation() {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
}
