// js/__tests__/icons.test.js

import { describe, it, expect } from 'vitest';
import { normalizeIconId, inferIconId } from '../render/icons.js';

describe('normalizeIconId', () => {
  it('returns valid IDs', () => {
    expect(normalizeIconId('place')).toBe('place');
    expect(normalizeIconId('food')).toBe('food');
    expect(normalizeIconId('transport')).toBe('transport');
  });

  it('maps legacy aliases', () => {
    expect(normalizeIconId('pin')).toBe('place');
    expect(normalizeIconId('train')).toBe('transport');
    expect(normalizeIconId('school')).toBe('campus');
    expect(normalizeIconId('shop')).toBe('shopping');
    expect(normalizeIconId('book')).toBe('shopping');
  });

  it('returns empty string for unknown icons', () => {
    expect(normalizeIconId('unknown')).toBe('');
    expect(normalizeIconId('')).toBe('');
  });
});

describe('inferIconId', () => {
  it('defaults to "place" for empty input', () => {
    expect(inferIconId({})).toBe('place');
  });

  it('infers food from type', () => {
    expect(inferIconId({ type: '餐饮服务' })).toBe('food');
  });

  it('infers hotel from name keywords', () => {
    expect(inferIconId({ name: '格林豪泰酒店' })).toBe('hotel');
  });

  it('infers transport from name keywords', () => {
    expect(inferIconId({ name: '北京南站' })).toBe('transport');
  });

  it('infers campus from name keywords', () => {
    expect(inferIconId({ name: '清华大学' })).toBe('campus');
  });

  it('does not infer transport from address (weak signal only for non-transport)', () => {
    // Address containing "站" alone should not trigger transport
    const result = inferIconId({
      title: '吃烤鸭',
      name: '便宜坊',
      addr: '北京站附近',
      type: '餐饮服务'
    });
    expect(result).toBe('food');
  });
});
