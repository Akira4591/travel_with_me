import { describe, expect, it, vi } from 'vitest';

import { getOverviewCameraPose } from '../render/map-3d.js';

describe('3D map overview camera pose', () => {
  it('starts on the same lifted orbit target used by idle auto-orbit', () => {
    const terrainModel = { heightAt: vi.fn(() => 12) };
    const pose = getOverviewCameraPose(
      { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      { terrainModel, terrainMode: 'citywalk' }
    );

    expect(pose.target.toArray()).toEqual([0, 212, 0]);
    expect(pose.position.x).toBeCloseTo(56.85);
    expect(pose.position.z).toBeCloseTo(72.77);
    expect(pose.position.y).toBeCloseTo(465.72);
    expect(pose.position.distanceTo(pose.target)).toBeGreaterThan(180 * 1.4);
    const [targetX, targetZ] = terrainModel.heightAt.mock.calls[0];
    expect(targetX).toBe(0);
    expect(targetZ).toBe(0);
    const [sampleX, sampleZ] = terrainModel.heightAt.mock.calls[1];
    expect(sampleX).toBeCloseTo(56.85);
    expect(sampleZ).toBeCloseTo(72.77);
  });
});
