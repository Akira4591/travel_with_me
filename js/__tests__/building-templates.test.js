import { describe, expect, it } from 'vitest';
import {
  BUILDING_TEMPLATES,
  chooseBuildingTemplate,
  classifyBuildingScenario
} from '../render/building-templates.js';

describe('building fallback templates', () => {
  it('keeps exactly five stable choices for every scenario', () => {
    Object.values(BUILDING_TEMPLATES).forEach(templates => {
      expect(templates).toHaveLength(5);
      expect(new Set(templates).size).toBe(5);
    });
  });

  it('classifies known places and chooses deterministically', () => {
    const hotel = { id: 'hotel-1', name: '山谷酒店' };
    expect(classifyBuildingScenario(hotel)).toBe('lodging');
    expect(chooseBuildingTemplate(hotel, 0.42)).toEqual(chooseBuildingTemplate(hotel, 0.42));
  });
});
