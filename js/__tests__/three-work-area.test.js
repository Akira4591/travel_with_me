import { describe, expect, it } from 'vitest';

import { collect3DWorkAreaAnchors, resolveAnchored3DWorkArea } from '../three-work-area.js';

const trip = {
  locations: {
    a: { id: 'a', lnglat: [116.4, 39.9] },
    b: { id: 'b', lnglat: [116.402, 39.901] }
  },
  days: [
    {
      id: 'day-1',
      events: [
        {
          id: 'event-a',
          locationId: 'a',
          routeToNext: {
            geometry: [
              [116.4, 39.9],
              [116.401, 39.9005],
              [116.402, 39.901]
            ]
          }
        },
        { id: 'event-b', locationId: 'b' }
      ]
    }
  ]
};

describe('3D work area anchoring', () => {
  it('collects location and route anchors for the active day', () => {
    const anchors = collect3DWorkAreaAnchors(trip, 'day-1');
    expect(anchors.length).toBe(3);
    expect(anchors.some(anchor => anchor.type === 'route')).toBe(true);
    expect(anchors.some(anchor => anchor.type === 'location')).toBe(true);
  });

  it('keeps the selected center when route data is inside the work area', () => {
    const workArea = {
      source: 'selected-2d-point',
      center: [116.401, 39.9005],
      spanMeters: 800,
      hardCapMeters: 2000
    };
    expect(resolveAnchored3DWorkArea(workArea, trip, 'day-1')).toBe(workArea);
  });

  it('snaps an empty selected center to the nearest route anchor', () => {
    const workArea = {
      source: 'selected-2d-point',
      center: [116.6, 39.9],
      spanMeters: 800,
      hardCapMeters: 2000
    };
    const resolved = resolveAnchored3DWorkArea(workArea, trip, 'day-1');
    expect(resolved.anchorAdjusted).toBe(true);
    expect(resolved.requestedCenter).toEqual(workArea.center);
    expect(resolved.center).toEqual([116.402, 39.901]);
    expect(resolved.anchorDistanceMeters).toBeGreaterThan(1000);
    expect(resolved.anchorType).toMatch(/location|route/);
  });

  it('prefers a location anchor over a bare route point for empty selections', () => {
    const sparseRouteTrip = {
      locations: {
        place: { id: 'place', lnglat: [116.4, 39.9] }
      },
      days: [
        {
          id: 'day-1',
          events: [
            {
              id: 'event-place',
              locationId: 'place',
              routeToNext: {
                geometry: [[116.6, 39.9]]
              }
            }
          ]
        }
      ]
    };

    const resolved = resolveAnchored3DWorkArea(
      {
        source: 'selected-2d-point',
        center: [116.61, 39.9],
        spanMeters: 800,
        hardCapMeters: 2000
      },
      sparseRouteTrip,
      'day-1'
    );

    expect(resolved.anchorAdjusted).toBe(true);
    expect(resolved.anchorType).toBe('location');
    expect(resolved.center).toEqual([116.4, 39.9]);
  });
});
