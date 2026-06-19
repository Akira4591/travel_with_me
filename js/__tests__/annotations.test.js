import { describe, expect, it } from 'vitest';

import {
  ANNOTATION_TYPES,
  getAnnotationType,
  normalizeAnnotation,
  normalizeAnnotationType
} from '../annotations.js';

describe('annotations', () => {
  it('defines six product annotation types', () => {
    expect(ANNOTATION_TYPES.map(type => type.id)).toEqual([
      'entrance',
      'viewpoint',
      'supply',
      'transfer',
      'risk',
      'note'
    ]);
  });

  it('normalizes valid annotation data', () => {
    const annotation = normalizeAnnotation({
      id: 'ann-1',
      type: 'risk',
      lnglat: ['116.4', '39.9'],
      elevation: '88.5',
      title: '  Narrow trail  ',
      note: '  Watch footing  ',
      createdAt: '2026-06-19T00:00:00.000Z'
    });

    expect(annotation).toMatchObject({
      id: 'ann-1',
      type: 'risk',
      lnglat: [116.4, 39.9],
      elevation: 88.5,
      title: 'Narrow trail',
      note: 'Watch footing',
      createdAt: '2026-06-19T00:00:00.000Z'
    });
  });

  it('falls back to note type and rejects invalid coordinates', () => {
    expect(normalizeAnnotationType('unknown')).toBe('note');
    expect(getAnnotationType('unknown').id).toBe('note');
    expect(normalizeAnnotation({ lnglat: [999, 39.9] })).toBeNull();
  });
});
