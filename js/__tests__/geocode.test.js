// js/__tests__/geocode.test.js

import { describe, it, expect, vi } from 'vitest';

// geocode.js exports are indirectly testable via their public API.
// The mapPois function and buildDisplayAddress are pure logic.

describe('geocode (POI mapping and address display)', () => {
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
