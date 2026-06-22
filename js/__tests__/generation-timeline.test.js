import { describe, expect, it, vi } from 'vitest';

import { GENERATION_TIMING_MS } from '../render/generation-timing.js';
import { createGenerationTimeline, getPhaseWindow } from '../render/generation-timeline.js';

describe('generation timeline', () => {
  it('maps overall progress into named phases', () => {
    expect(getPhaseWindow(0.01).phase).toBe('freeze-2d');
    expect(getPhaseWindow(0.12).phase).toBe('slab-rise');
    expect(getPhaseWindow(0.36).phase).toBe('water-carve');
    expect(getPhaseWindow(0.51).phase).toBe('building-massing');
    expect(getPhaseWindow(0.76).phase).toBe('building-dissolve');
    expect(getPhaseWindow(0.96).phase).toBe('building-dissolve');
  });

  it('exposes progress fields for debug and tests', () => {
    const timeline = createGenerationTimeline();
    const snapshot = timeline.updateFromOverallProgress(0.56);

    expect(snapshot.phase).toBe('building-massing');
    expect(snapshot.foundationProgress).toBe(1);
    expect(snapshot.carvingProgress).toBe(1);
    expect(snapshot.roadBridgeProgress).toBe(1);
    expect(snapshot.buildingMassingProgress).toBeGreaterThan(0);
    expect(snapshot.buildingDissolveProgress).toBe(0);
  });

  it('marks the scene steady at the end', () => {
    const timeline = createGenerationTimeline();
    const snapshot = timeline.setSteady();

    expect(snapshot.phase).toBe('steady');
    expect(snapshot.phaseProgress).toBe(1);
    expect(snapshot.buildingDissolveProgress).toBe(1);
  });

  it('keeps the accepted 4 second generation timing contract', () => {
    expect(GENERATION_TIMING_MS.foundationRise).toBe(1000);
    expect(GENERATION_TIMING_MS.terrainWaterRoadBridge).toBe(1000);
    expect(GENERATION_TIMING_MS.buildingMassing).toBe(1000);
    expect(GENERATION_TIMING_MS.buildingDissolve).toBe(1000);
    expect(GENERATION_TIMING_MS.total).toBe(4000);
  });
});
