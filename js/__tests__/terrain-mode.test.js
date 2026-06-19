import { describe, expect, it } from 'vitest';

import { chooseTerrainMode } from '../render/terrain-mode.js';

describe('chooseTerrainMode', () => {
  it('chooses micro street for dense urban POIs', () => {
    const mode = chooseTerrainMode({
      span: 800,
      poiCount: 6,
      locations: [
        { name: '胡同咖啡', type: '餐饮服务;咖啡厅' },
        { name: '又喜商店', type: '购物服务' },
        { name: '巷子书店', type: '购物服务;书店' }
      ]
    });

    expect(mode.id).toBe('micro-street');
    expect(mode.terrainGrid).toBeLessThanOrEqual(24);
  });

  it('chooses scenic park when scenic POIs dominate', () => {
    const mode = chooseTerrainMode({
      span: 3200,
      poiCount: 4,
      locations: [
        { name: '灵隐寺', type: '风景名胜' },
        { name: '北高峰索道', type: '风景名胜;索道' },
        { name: '观景台', type: '风景名胜' }
      ]
    });

    expect(mode.id).toBe('scenic-park');
    expect(mode.terrainGrid).toBeGreaterThanOrEqual(40);
  });

  it('chooses hiking for long routes with meaningful elevation range', () => {
    const mode = chooseTerrainMode({
      span: 5200,
      poiCount: 3,
      routeLength: 7600,
      elevationRange: 420,
      locations: [{ name: '山顶步道', type: '风景名胜' }]
    });

    expect(mode.id).toBe('hiking');
    expect(mode.dataSource).toContain('dem');
  });

  it('can choose hiking before elevation is loaded when mountain route context is clear', () => {
    const mode = chooseTerrainMode({
      span: 5200,
      poiCount: 3,
      routeLength: 7200,
      locations: [{ name: '山顶步道', type: '风景名胜' }]
    });

    expect(mode.id).toBe('hiking');
  });

  it('chooses region overview for large spans', () => {
    expect(chooseTerrainMode({ span: 12000, poiCount: 5 }).id).toBe('region-overview');
  });
});
