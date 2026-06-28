// js/__tests__/utils.test.js

import { describe, it, expect } from 'vitest';
import { formatDistance, formatDuration, calculateDistance, escapeHTML } from '../utils.js';

describe('formatDistance', () => {
  it('returns pending text for 0 or invalid input', () => {
    expect(formatDistance(0)).toBe('距离待确认');
    expect(formatDistance(null)).toBe('距离待确认');
  });

  it('formats meters', () => {
    expect(formatDistance(500)).toBe('500 米');
  });

  it('formats kilometers with one decimal for < 10km', () => {
    expect(formatDistance(3200)).toBe('3.2 公里');
  });

  it('formats kilometers with no decimal for >= 10km', () => {
    expect(formatDistance(15000)).toBe('15 公里');
  });
});

describe('formatDuration', () => {
  it('returns pending text for 0 or invalid', () => {
    expect(formatDuration(0)).toBe('用时待确认');
  });

  it('formats minutes', () => {
    expect(formatDuration(1800)).toBe('30 分钟');
  });

  it('formats hours', () => {
    expect(formatDuration(7200)).toBe('2 小时');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(9000)).toBe('2 小时 30 分钟');
  });
});

describe('calculateDistance', () => {
  it('returns a number for valid lnglat pairs', () => {
    const d = calculateDistance([116.4, 39.9], [116.5, 40.0]);
    expect(typeof d).toBe('number');
    expect(d).toBeGreaterThan(0);
  });

  it('returns same value regardless of argument order', () => {
    const d1 = calculateDistance([116.4, 39.9], [116.5, 40.0]);
    const d2 = calculateDistance([116.5, 40.0], [116.4, 39.9]);
    expect(d1).toBe(d2);
  });

  it('returns 0 for same coordinates', () => {
    expect(calculateDistance([116.4, 39.9], [116.4, 39.9])).toBe(0);
  });
});

describe('escapeHTML', () => {
  it('escapes special characters', () => {
    expect(escapeHTML('<script>alert("XSS")</script>')).toBe(
      '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
    );
  });

  it('handles empty/null values', () => {
    expect(escapeHTML('')).toBe('');
    expect(escapeHTML(null)).toBe('');
    expect(escapeHTML(undefined)).toBe('');
  });
});
