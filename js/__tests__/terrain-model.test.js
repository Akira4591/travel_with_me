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

    expect(model.foundationHeight).toBeGreaterThan(0);
    expect(model.heightAt(-10, -10)).toBeCloseTo(model.foundationHeight);
    expect(model.heightAt(10, 10)).toBeCloseTo(model.foundationHeight + 20);
    expect(model.heightAt(0, 0)).toBeCloseTo(model.foundationHeight + 10);
    expect(model.sampleHeight(0, 0)).toBeCloseTo(model.heightAt(0, 0));
    expect(model.elevationAt(0, 0)).toBeCloseTo(130);
    expect(model.terrainConfidence).toBe('estimated');
    expect(model.metrics.range).toBe(60);
    expect(model.metrics.mean).toBe(130);
  });

  it('falls back to low procedural terrain when no grid is available', () => {
    const model = createTerrainModel({ bounds, grid: null });

    expect(model.terrainConfidence).toBe('flat-fallback');
    expect(model.heightAt(0, 0)).toBeGreaterThanOrEqual(0);
    expect(model.elevationAt(0, 0)).toBeNull();
    expect(model.mesh).toBeNull();
    expect(model.sideSkirts).toBeNull();
  });
});
