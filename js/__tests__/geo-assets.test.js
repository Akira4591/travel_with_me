import { describe, expect, it } from 'vitest';
import { normalizeGeoAssets } from '../render/geo-assets.js';

const provenance = {
  source: 'city-open-data',
  licence: 'ODbL',
  attribution: 'Example City',
  updatedAt: '2026-06-21T00:00:00.000Z'
};

describe('3D geo asset normalization', () => {
  it('keeps authorized building and landcover geometry', () => {
    const assets = normalizeGeoAssets({
      buildings: [
        {
          id: 'shop',
          locationId: 'shop-1',
          footprint: [
            [116, 39],
            [116.001, 39],
            [116.001, 39.001]
          ],
          heightMeters: 18,
          provenance
        }
      ],
      landcover: [
        {
          id: 'forest',
          licensed: true,
          cover: 'forest',
          polygon: [
            [116, 39],
            [116.002, 39],
            [116.002, 39.002]
          ],
          provenance
        }
      ]
    });
    expect(assets.buildings[0].heightMeters).toBe(18);
    expect(assets.landcover).toHaveLength(1);
  });

  it('keeps attributable surrounding buildings that are not tied to a specific itinerary POI', () => {
    const assets = normalizeGeoAssets({
      buildings: [
        {
          id: 'context-building',
          footprint: [
            [116, 39],
            [116.001, 39],
            [116.001, 39.001]
          ],
          heightMeters: 24,
          provenance
        }
      ]
    });

    expect(assets.buildings).toHaveLength(1);
    expect(assets.buildings[0].locationId).toBe('');
  });

  it('fails closed for missing attribution or an unlicensed cover area', () => {
    const assets = normalizeGeoAssets({
      buildings: [
        {
          footprint: [
            [116, 39],
            [116.001, 39],
            [116.001, 39.001]
          ],
          provenance: { source: 'unknown' }
        }
      ],
      landcover: [
        {
          licensed: false,
          polygon: [
            [116, 39],
            [116.002, 39],
            [116.002, 39.002]
          ],
          provenance
        }
      ]
    });
    expect(assets.buildings).toHaveLength(0);
    expect(assets.landcover).toHaveLength(0);
  });

  it('fails closed when real asset provenance is missing updatedAt', () => {
    const assets = normalizeGeoAssets({
      roads: [
        {
          id: 'stale-road',
          centerline: [
            [116, 39],
            [116.002, 39.001]
          ],
          provenance: {
            source: 'city-open-data',
            licence: 'ODbL',
            attribution: 'Example City'
          }
        }
      ]
    });

    expect(assets.roads).toHaveLength(0);
  });

  it('keeps attributable waterway and bridge geometry for terrain-aware rendering', () => {
    const assets = normalizeGeoAssets({
      waterways: [
        {
          id: 'canal-1',
          centerline: [
            [116, 39],
            [116.002, 39.001]
          ],
          widthMeters: 16,
          provenance
        }
      ],
      bridges: [
        {
          id: 'bridge-1',
          centerline: [
            [116.001, 39],
            [116.001, 39.002]
          ],
          widthMeters: 10,
          deckHeightMeters: 6,
          provenance
        }
      ]
    });

    expect(assets.waterways[0].widthMeters).toBe(16);
    expect(assets.bridges[0].deckHeightMeters).toBe(6);
  });

  it('drops centerline water without provider width to avoid speculative ribbons', () => {
    const assets = normalizeGeoAssets({
      waterways: [
        {
          id: 'unknown-width-waterway',
          centerline: [
            [116, 39],
            [116.002, 39.001]
          ],
          provenance
        }
      ]
    });

    expect(assets.waterways).toHaveLength(0);
  });

  it('keeps explicit bridge piers through normalization', () => {
    const assets = normalizeGeoAssets({
      bridges: [
        {
          id: 'bridge-with-supports',
          centerline: [
            [116, 39],
            [116.002, 39]
          ],
          piers: [[116.001, 39]],
          provenance
        }
      ]
    });

    expect(assets.bridges[0].piers).toEqual([[116.001, 39]]);
  });

  it('keeps attributable road centerlines for the terrain road layer', () => {
    const assets = normalizeGeoAssets({
      roads: [
        {
          id: 'street-1',
          centerline: [
            [116, 39],
            [116.002, 39.001]
          ],
          kind: 'path',
          widthMeters: 3,
          provenance
        }
      ]
    });

    expect(assets.roads).toEqual([
      expect.objectContaining({ id: 'street-1', kind: 'path', widthMeters: 3 })
    ]);
  });
});
