// js/__tests__/geocode.test.js

import { describe, it, expect } from 'vitest';

// geocode.js exports are indirectly testable via their public API.
// The mapPois function and buildDisplayAddress are pure logic.

describe('geocode (POI mapping and address display)', () => {
  it('rejects coordinates outside the geographic longitude and latitude ranges', async () => {
    const { normalizeLngLat } = await import('../api/amap-web-service.js');

    expect(normalizeLngLat('180,90')).toEqual([180, 90]);
    expect(normalizeLngLat('-180,-90')).toEqual([-180, -90]);
    expect(normalizeLngLat('181,39')).toBeNull();
    expect(normalizeLngLat([116, 91])).toBeNull();
    expect(normalizeLngLat({ lng: -181, lat: 39 })).toBeNull();
  });

  it('creates geocode services for the active trip city', async () => {
    const geocoderOptions = [];
    const placeOptions = [];
    const AMap = {
      Geocoder: class {
        constructor(options) {
          geocoderOptions.push(options);
        }
      },
      PlaceSearch: class {
        constructor(options) {
          placeOptions.push(options);
        }
      }
    };
    const { createGeocodeServices } = await import('../api/geocode.js');

    const services = createGeocodeServices(AMap, '上海市');

    expect(services.city).toBe('上海市');
    expect(geocoderOptions[0].city).toBe('上海市');
    expect(placeOptions[0].city).toBe('上海市');
  });

  it('buildDisplayAddress prefers formatted address', async () => {
    const { buildDisplayAddress } = await import('../api/geocode.js');
    expect(buildDisplayAddress({ formatted: '北京市朝阳区建国路1号' })).toBe(
      '北京市朝阳区建国路1号'
    );
  });

  it('buildDisplayAddress composes province+city+district when no formatted', async () => {
    const { buildDisplayAddress } = await import('../api/geocode.js');
    const result = buildDisplayAddress({
      province: '北京市',
      city: '北京市',
      district: '朝阳区'
    });
    expect(result).toBe('北京市北京市朝阳区');
  });

  it('buildDisplayAddress returns empty for no data', async () => {
    const { buildDisplayAddress } = await import('../api/geocode.js');
    expect(buildDisplayAddress({})).toBe('');
  });

  it('buildDisplayAddress falls back to addr field', async () => {
    const { buildDisplayAddress } = await import('../api/geocode.js');
    expect(buildDisplayAddress({ addr: '北京市通州区' })).toBe('北京市通州区');
  });

  it('buildDisplayAddress ignores formatted when empty string', async () => {
    const { buildDisplayAddress } = await import('../api/geocode.js');
    expect(
      buildDisplayAddress({ formatted: '', province: '广东省', city: '广州市', district: '天河区' })
    ).toBe('广东省广州市天河区');
  });
});
