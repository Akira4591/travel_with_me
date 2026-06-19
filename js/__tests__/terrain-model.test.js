import { describe, expect, it } from 'vitest';

import { createTerrainModel } from '../render/terrain-model.js';

describe('createTerrainModel', () => {
  const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

  it('interpolates sampled terrain heights', () => {
    const model = createTerrainModel({
      bounds,
      heightScale: 20,
      grid: {
        rows: 2,
        cols: 2,
        heights: [
          [100, 120],
          [140, 160]
        ]
      }
    });

    expect(model.heightAt(-10, -10)).toBeCloseTo(0);
    expect(model.heightAt(10, 10)).toBeCloseTo(20);
    expect(model.heightAt(0, 0)).toBeCloseTo(10);
    expect(model.terrainConfidence).toBe('estimated');
    expect(model.metrics.range).toBe(60);
  });

  it('falls back to low procedural terrain when no grid is available', () => {
    const model = createTerrainModel({ bounds, grid: null });

    expect(model.terrainConfidence).toBe('flat-fallback');
    expect(model.heightAt(0, 0)).toBeGreaterThanOrEqual(0);
    expect(model.mesh).toBeNull();
    expect(model.sideSkirts).toBeNull();
  });
});
