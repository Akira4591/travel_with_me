import { describe, expect, it } from 'vitest';

import {
  getBuildingDetailAlpha,
  getBuildingDetailAlphaWithHysteresis
} from '../render/building-dissolve-renderer.js';

describe('getBuildingDetailAlpha', () => {
  it('keeps detailed geometry near the camera and fades it at distance', () => {
    expect(getBuildingDetailAlpha(120)).toBe(1);
    expect(getBuildingDetailAlpha(480)).toBeGreaterThan(0);
    expect(getBuildingDetailAlpha(480)).toBeLessThan(1);
    expect(getBuildingDetailAlpha(900)).toBe(0);
  });

  it('holds the current building LOD state inside the distance hysteresis band', () => {
    const distance = 520;

    const massingHeldAlpha = getBuildingDetailAlphaWithHysteresis(distance, 0.2);
    const detailHeldAlpha = getBuildingDetailAlphaWithHysteresis(distance, 0.8);
    const neutralAlpha = getBuildingDetailAlphaWithHysteresis(distance, 0.42);

    expect(detailHeldAlpha).toBeGreaterThan(neutralAlpha);
    expect(neutralAlpha).toBeGreaterThan(massingHeldAlpha);
  });
});
