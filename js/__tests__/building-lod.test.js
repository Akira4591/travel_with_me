import { describe, expect, it } from 'vitest';

import { getBuildingDetailAlpha } from '../render/map-3d.js';

describe('getBuildingDetailAlpha', () => {
  it('keeps detailed geometry near the camera and fades it at distance', () => {
    expect(getBuildingDetailAlpha(120)).toBe(1);
    expect(getBuildingDetailAlpha(480)).toBeGreaterThan(0);
    expect(getBuildingDetailAlpha(480)).toBeLessThan(1);
    expect(getBuildingDetailAlpha(900)).toBe(0);
  });
});
