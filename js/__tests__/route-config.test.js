// js/__tests__/route-config.test.js

import { describe, it, expect } from 'vitest';
import { normalizeRouteMode, normalizeRouteToNext, getRouteDisplayLabel } from '../route-config.js';

describe('normalizeRouteMode', () => {
  it('returns valid modes', () => {
    expect(normalizeRouteMode('driving')).toBe('driving');
    expect(normalizeRouteMode('walking')).toBe('walking');
    expect(normalizeRouteMode('transit')).toBe('transit');
    expect(normalizeRouteMode('riding')).toBe('riding');
  });

  it('defaults to driving for invalid modes', () => {
    expect(normalizeRouteMode('flying')).toBe('driving');
    expect(normalizeRouteMode('')).toBe('driving');
  });
});

describe('normalizeRouteToNext', () => {
  it('normalizes mode', () => {
    const result = normalizeRouteToNext({ mode: 'walking' });
    expect(result.mode).toBe('walking');
  });

  it('returns manual:false when no label/legs', () => {
    const result = normalizeRouteToNext({ mode: 'driving' });
    expect(result.manual).toBeUndefined();
  });

  it('returns manual:true when label is set', () => {
    const result = normalizeRouteToNext({ mode: 'driving', label: '打车去' });
    expect(result.manual).toBe(true);
    expect(result.label).toBe('打车去');
  });

  it('filters legs with empty labels', () => {
    const result = normalizeRouteToNext({
      mode: 'transit',
      legs: [
        { mode: 'walking', label: '' },
        { mode: 'transit', label: '地铁1号线' }
      ]
    });
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0].label).toBe('地铁1号线');
  });

  it('keeps route geometry diagnostics for 2D/3D consistency gates', () => {
    const result = normalizeRouteToNext({
      mode: 'driving',
      geometry: {
        source: 'amap-web-service',
        mode: 'driving',
        paths: [
          [
            [116.397, 39.908],
            [116.405, 39.912]
          ]
        ],
        fetchedAt: 123
      }
    });

    expect(result.geometry.diagnostics.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(result.geometry.diagnostics.pointCount).toBe(2);
    expect(result.geometry.diagnostics.firstPoint).toEqual([116.397, 39.908]);
    expect(result.geometry.diagnostics.lastPoint).toEqual([116.405, 39.912]);
  });

  it('recomputes stale diagnostics from normalized paths', () => {
    const result = normalizeRouteToNext({
      mode: 'driving',
      geometry: {
        source: 'amap-web-service',
        mode: 'driving',
        paths: [
          [
            [116.397, 39.908],
            [116.405, 39.912]
          ]
        ],
        diagnostics: {
          hash: 'deadbeef',
          pointCount: 999,
          lengthMeters: 1,
          firstPoint: [0, 0],
          lastPoint: [1, 1]
        }
      }
    });

    expect(result.geometry.diagnostics.hash).not.toBe('deadbeef');
    expect(result.geometry.diagnostics.pointCount).toBe(2);
    expect(result.geometry.diagnostics.firstPoint).toEqual([116.397, 39.908]);
    expect(result.geometry.diagnostics.lastPoint).toEqual([116.405, 39.912]);
  });
});

describe('getRouteDisplayLabel', () => {
  it('returns label when set', () => {
    expect(getRouteDisplayLabel({ mode: 'driving', label: '打车' })).toBe('打车');
  });

  it('returns Chinese label for mode when no label', () => {
    expect(getRouteDisplayLabel({ mode: 'walking' })).toBe('步行');
    expect(getRouteDisplayLabel({ mode: 'driving' })).toBe('打车/驾车');
  });
});
