import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchElevationGrid, fetchPointElevation } from '../api/elevation.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Open-Meteo elevation client', () => {
  it('uses matching latitude and longitude query lists for a terrain grid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elevation: Array.from({ length: 64 }, (_, index) => index + 10) })
    });
    vi.stubGlobal('fetch', fetchMock);

    const grid = await fetchElevationGrid({ center: [116.4, 39.9], span: 600, resolution: 8 });

    expect(grid).toMatchObject({ rows: 8, cols: 8, heights: expect.any(Array) });
    expect(grid.heights[0]).toHaveLength(8);
    expect(grid.heights[7][7]).toBe(73);

    const url = new URL(fetchMock.mock.calls[0][0]);
    const latitudes = url.searchParams.get('latitude').split(',');
    const longitudes = url.searchParams.get('longitude').split(',');
    expect(latitudes).toHaveLength(64);
    expect(longitudes).toHaveLength(64);
    expect(url.searchParams.has('locations')).toBe(false);
  });

  it('uses the same coordinate contract for single-point elevation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '0' })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ elevation: [49] }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPointElevation([116.4, 39.9])).resolves.toBe(49);

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('latitude')).toBe('39.900000');
    expect(url.searchParams.get('longitude')).toBe('116.400000');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
