// js/__tests__/time-slots.test.js

import { describe, it, expect } from 'vitest';
import { normalizeTimeSlot, getTimeSlotLabel, getTimeSlotRank } from '../time-slots.js';

describe('normalizeTimeSlot', () => {
  it('returns valid time slots as-is', () => {
    expect(normalizeTimeSlot('morning')).toBe('morning');
    expect(normalizeTimeSlot('evening')).toBe('evening');
  });

  it('returns empty string for invalid values', () => {
    expect(normalizeTimeSlot('breakfast')).toBe('');
    expect(normalizeTimeSlot('')).toBe('');
    expect(normalizeTimeSlot(null)).toBe('');
  });
});

describe('getTimeSlotLabel', () => {
  it('returns Chinese label for known slots', () => {
    expect(getTimeSlotLabel('morning')).toBe('上午');
    expect(getTimeSlotLabel('evening')).toBe('晚上');
  });

  it('returns "未定" for empty/unknown', () => {
    expect(getTimeSlotLabel('')).toBe('未定');
    expect(getTimeSlotLabel('unknown')).toBe('未定');
  });
});

describe('getTimeSlotRank', () => {
  it('morning < noon < afternoon < evening < empty', () => {
    expect(getTimeSlotRank('morning')).toBeLessThan(getTimeSlotRank('noon'));
    expect(getTimeSlotRank('noon')).toBeLessThan(getTimeSlotRank('afternoon'));
    expect(getTimeSlotRank('afternoon')).toBeLessThan(getTimeSlotRank('evening'));
    expect(getTimeSlotRank('evening')).toBeLessThan(getTimeSlotRank(''));
  });
});
