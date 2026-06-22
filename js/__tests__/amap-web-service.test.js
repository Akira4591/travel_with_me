import { afterEach, describe, expect, it, vi } from 'vitest';

import { normalizeLngLat } from '../api/amap-web-service.js';
import { reverseGeocode, searchPlaces } from '../api/geocode.js';
import { searchRoute } from '../api/routing.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AMap Web Service BFF', () => {
  it('normalizes SDK and web-service coordinate formats', () => {
    expect(normalizeLngLat('116.397,39.908')).toEqual([116.397, 39.908]);
    expect(normalizeLngLat({ lng: 116.397, lat: 39.908 })).toEqual([116.397, 39.908]);
    expect(normalizeLngLat('invalid')).toBeNull();
  });

  it('maps a web-service POI location string into a usable place', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: '1',
          pois: [
            {
              id: 'poi-1',
              name: '测试地点',
              address: '北京市东城区测试路',
              location: '116.397,39.908'
            }
          ]
        })
      })
    );

    const results = await searchPlaces(null, '测试地点');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ lnglat: [116.397, 39.908], source: 'amap-web-service' });
  });

  it('uses the BFF for reverse geocoding without an SDK instance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: '1',
          regeocode: {
            formatted_address: '北京市东城区测试路 1 号',
            addressComponent: { province: '北京市', city: '北京市', district: '东城区' }
          }
        })
      })
    );

    await expect(reverseGeocode(null, [116.397, 39.908])).resolves.toMatchObject({
      formatted: '北京市东城区测试路 1 号',
      district: '东城区'
    });
  });

  it('returns a terrain-ready route polyline from the BFF before SDK fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: '1',
          route: {
            paths: [
              {
                distance: '1200',
                duration: '360',
                steps: [
                  {
                    polyline: '116.397,39.908;116.4,39.91',
                    tmcs: [{ polyline: '116.4,39.91;116.397,39.908' }]
                  },
                  { polyline: '116.4,39.91;116.405,39.912' }
                ]
              }
            ]
          }
        })
      })
    );

    const result = await searchRoute(null, null, {
      fromLngLat: [116.397, 39.908],
      toLngLat: [116.405, 39.912],
      mode: 'driving',
      routeToNext: { mode: 'driving' }
    });

    expect(result.ok).toBe(true);
    expect(result.detail).toMatchObject({ distance: 1200, duration: 360 });
    expect(result.paths).toEqual([
      [
        [116.397, 39.908],
        [116.4, 39.91],
        [116.405, 39.912]
      ]
    ]);
  });
});
