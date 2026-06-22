import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { getInitialOverviewCameraPose, getOverviewCameraPose } from '../render/map-3d.js';

describe('3D map overview camera pose', () => {
  it('starts on the same lifted orbit target used by idle auto-orbit', () => {
    const terrainModel = { heightAt: vi.fn(() => 12) };
    const pose = getOverviewCameraPose(
      { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      { terrainModel, terrainMode: 'citywalk' }
    );

    expect(pose.target.toArray()).toEqual([0, 212, 0]);
    expect(pose.position.x).toBeCloseTo(80.34);
    expect(pose.position.z).toBeCloseTo(102.84);
    expect(pose.position.y).toBeCloseTo(438.03);
    expect(pose.position.distanceTo(pose.target)).toBeGreaterThan(180 * 1.4);
    const [targetX, targetZ] = terrainModel.heightAt.mock.calls[0];
    expect(targetX).toBe(0);
    expect(targetZ).toBe(0);
    const [sampleX, sampleZ] = terrainModel.heightAt.mock.calls[1];
    expect(sampleX).toBeCloseTo(80.34);
    expect(sampleZ).toBeCloseTo(102.84);
  });

  it('uses the overview orbit even before terrain data has loaded', () => {
    const initialPose = getInitialOverviewCameraPose();
    const defaultWorkAreaPose = getOverviewCameraPose(
      { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
      { terrainMode: 'citywalk' }
    );

    expect(initialPose.target.toArray()).toEqual(defaultWorkAreaPose.target.toArray());
    expect(initialPose.position.toArray()).toEqual(defaultWorkAreaPose.position.toArray());
    expect(initialPose.position.distanceTo(initialPose.target)).toBeGreaterThan(300);
  });

  it('honors terrain-mode overview pitch instead of forcing every scene to a high top-down view', () => {
    const microStreetPose = getOverviewCameraPose(
      { minX: -250, maxX: 250, minZ: -250, maxZ: 250 },
      { terrainMode: 'micro-street' }
    );
    const hikingPose = getOverviewCameraPose(
      { minX: -250, maxX: 250, minZ: -250, maxZ: 250 },
      { terrainMode: 'hiking' }
    );

    const microPitch = Math.asin(
      (microStreetPose.position.y - microStreetPose.target.y) /
        microStreetPose.position.distanceTo(microStreetPose.target)
    );
    const hikingPitch = Math.asin(
      (hikingPose.position.y - hikingPose.target.y) /
        hikingPose.position.distanceTo(hikingPose.target)
    );

    expect(THREE.MathUtils.radToDeg(microPitch)).toBeCloseTo(58, 0);
    expect(THREE.MathUtils.radToDeg(hikingPitch)).toBeCloseTo(68, 0);
  });

  it('keeps micro-street overview close enough for first-screen readability', () => {
    const pose = getOverviewCameraPose(
      { minX: -250, maxX: 250, minZ: -250, maxZ: 250 },
      { terrainMode: 'micro-street' }
    );

    expect(pose.position.distanceTo(pose.target)).toBeLessThan(420);
    expect(pose.position.y - pose.target.y).toBeLessThan(370);
  });
});
