import { describe, expect, it } from 'vitest';
import {
  createRouteGeometryDiagnostics,
  getPrimaryRoutePath,
  getRoutePathLengthMeters,
  hashRoutePath,
  normalizeRoutePath
} from '../route-geometry.js';

describe('route geometry diagnostics', () => {
  it('normalizes coordinates and creates a stable rounded hash', () => {
    const path = normalizeRoutePath([
      ['116.3970001', '39.9080001'],
      { lng: 116.4050001, lat: 39.9120001 }
    ]);

    expect(path).toEqual([
      [116.3970001, 39.9080001],
      [116.4050001, 39.9120001]
    ]);
    expect(hashRoutePath(path)).toBe(hashRoutePath(path));
    expect(hashRoutePath(path)).toBe(
      hashRoutePath([
        [116.397, 39.908],
        [116.405, 39.912]
      ])
    );
  });

  it('chooses the longest valid path as the primary 2D/3D route contract', () => {
    const primary = getPrimaryRoutePath({
      paths: [
        [
          [116.397, 39.908],
          [116.398, 39.909]
        ],
        [
          [116.397, 39.908],
          [116.4, 39.91],
          [116.405, 39.912]
        ]
      ]
    });

    expect(primary).toHaveLength(3);
    expect(primary[2]).toEqual([116.405, 39.912]);
  });

  it('reports endpoints, hash, point count, and length for cached geometry', () => {
    const diagnostics = createRouteGeometryDiagnostics({
      source: 'amap-web-service',
      mode: 'driving',
      paths: [
        [
          [116.397, 39.908],
          [116.405, 39.912]
        ]
      ]
    });

    expect(diagnostics.source).toBe('amap-web-service');
    expect(diagnostics.mode).toBe('driving');
    expect(diagnostics.pointCount).toBe(2);
    expect(diagnostics.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(diagnostics.lengthMeters).toBe(
      getRoutePathLengthMeters([
        [116.397, 39.908],
        [116.405, 39.912]
      ])
    );
    expect(diagnostics.firstPoint).toEqual([116.397, 39.908]);
    expect(diagnostics.lastPoint).toEqual([116.405, 39.912]);
  });
});
