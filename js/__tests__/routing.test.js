// js/__tests__/routing.test.js

import { describe, it, expect } from 'vitest';
import { buildEstimatedResult } from '../api/routing.js';

describe('buildEstimatedResult', () => {
  const baseSegment = (mode) => ({
    fromLngLat: [116.4, 39.9],
    toLngLat: [116.5, 40.0],
    mode,
    routeToNext: { mode }
  });

  it('produces estimated result with distance and duration', () => {
    const result = buildEstimatedResult(baseSegment('driving'));
    expect(result.ok).toBe(false);
    expect(result.estimated).toBe(true);
    expect(result.detail.distance).toBeGreaterThan(0);
    expect(result.detail.duration).toBeGreaterThan(0);
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]).toHaveLength(2);
  });

  it('walking duration > driving duration for same distance', () => {
    const driving = buildEstimatedResult(baseSegment('driving'));
    const walking = buildEstimatedResult(baseSegment('walking'));
    expect(driving.detail.distance).toBe(walking.detail.distance);
    expect(walking.detail.duration).toBeGreaterThan(driving.detail.duration);
  });

  it('riding speed is between walking and driving', () => {
    const w = buildEstimatedResult(baseSegment('walking'));
    const r = buildEstimatedResult(baseSegment('riding'));
    const d = buildEstimatedResult(baseSegment('driving'));
    expect(r.detail.duration).toBeGreaterThan(d.detail.duration);
    expect(r.detail.duration).toBeLessThan(w.detail.duration);
  });

  it('distance is symmetric', () => {
    const a = buildEstimatedResult({
      fromLngLat: [116.4, 39.9],
      toLngLat: [116.5, 40.0],
      mode: 'driving',
      routeToNext: { mode: 'driving' }
    });
    const b = buildEstimatedResult({
      fromLngLat: [116.5, 40.0],
      toLngLat: [116.4, 39.9],
      mode: 'driving',
      routeToNext: { mode: 'driving' }
    });
    expect(a.detail.distance).toBe(b.detail.distance);
  });

  it('same point returns distance 0', () => {
    const result = buildEstimatedResult({
      fromLngLat: [116.4, 39.9],
      toLngLat: [116.4, 39.9],
      mode: 'driving',
      routeToNext: { mode: 'driving' }
    });
    expect(result.detail.distance).toBe(0);
  });
});
