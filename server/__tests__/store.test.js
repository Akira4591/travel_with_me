import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDB, closeDB } from '../rag/db.js';
import {
  saveGuide,
  getGuide,
  getGuidesByIds,
  listGuides,
  softDeleteGuide,
  getAllActiveGuides,
  getActiveGuideCount
} from '../rag/store.js';

describe('store', () => {
  beforeEach(() => {
    initDB(':memory:');
  });

  afterEach(() => {
    closeDB();
  });

  it('saveGuide returns a guide id', () => {
    const id = saveGuide({
      city: '北京',
      guide_type: 'daily_itinerary',
      source_text: '北京三日游攻略',
      extracted: '{"events":[]}',
      token_count: 10
    });
    expect(id).toBeTruthy();
    expect(id.startsWith('guide-')).toBe(true);
  });

  it('getGuide returns the saved guide', () => {
    const id = saveGuide({
      city: '上海',
      guide_type: 'recommendation_list',
      source_text: '上海美食推荐',
      extracted: '{"events":[]}',
      token_count: 8
    });
    const guide = getGuide(id);
    expect(guide).toBeTruthy();
    expect(guide.city).toBe('上海');
    expect(guide.guide_type).toBe('recommendation_list');
    expect(guide.source_text).toBe('上海美食推荐');
    expect(guide.deleted).toBe(0);
  });

  it('listGuides returns guides ordered by created_at desc', () => {
    saveGuide({
      city: '北京',
      guide_type: 'daily_itinerary',
      source_text: 'first',
      extracted: '{}',
      token_count: 1
    });
    saveGuide({
      city: '上海',
      guide_type: 'recommendation_list',
      source_text: 'second',
      extracted: '{}',
      token_count: 1
    });
    const guides = listGuides({ limit: 10 });
    expect(guides).toHaveLength(2);
  });

  it('softDeleteGuide marks guide as deleted', () => {
    const id = saveGuide({
      city: '成都',
      guide_type: 'mixed',
      source_text: '成都攻略',
      extracted: '{}',
      token_count: 5
    });
    const deleted = softDeleteGuide(id);
    expect(deleted).toBe(true);
    const guide = getGuide(id);
    expect(guide.deleted).toBe(1);
  });

  it('softDeleteGuide returns false for non-existent id', () => {
    const deleted = softDeleteGuide('nonexistent-id');
    expect(deleted).toBe(false);
  });

  it('getAllActiveGuides excludes soft-deleted guides', () => {
    const id1 = saveGuide({
      city: '北京',
      guide_type: 'daily_itinerary',
      source_text: 'active guide',
      extracted: '{}',
      token_count: 3
    });
    saveGuide({
      city: '上海',
      guide_type: 'mixed',
      source_text: 'deleted guide',
      extracted: '{}',
      token_count: 3
    });
    softDeleteGuide(id1);
    const active = getAllActiveGuides();
    expect(active).toHaveLength(1);
    expect(active[0].source_text).toBe('deleted guide');
  });

  it('getActiveGuideCount returns count of non-deleted guides', () => {
    saveGuide({ city: 'A', guide_type: 't', source_text: 'a', extracted: '{}', token_count: 1 });
    saveGuide({ city: 'B', guide_type: 't', source_text: 'b', extracted: '{}', token_count: 1 });
    expect(getActiveGuideCount()).toBe(2);
  });

  it('getGuidesByIds fetches multiple guides in one query', () => {
    const id1 = saveGuide({
      city: 'A',
      guide_type: 't',
      source_text: 'a',
      extracted: '{}',
      token_count: 1
    });
    const id2 = saveGuide({
      city: 'B',
      guide_type: 't',
      source_text: 'b',
      extracted: '{}',
      token_count: 1
    });
    const id3 = saveGuide({
      city: 'C',
      guide_type: 't',
      source_text: 'c',
      extracted: '{}',
      token_count: 1
    });

    const guides = getGuidesByIds([id1, id2, id3]);
    expect(guides).toHaveLength(3);
    expect(guides[0].id).toBe(id1);
    expect(guides[1].id).toBe(id2);
    expect(guides[2].id).toBe(id3);
  });

  it('getGuidesByIds returns null for non-existent ids and preserves order', () => {
    const id1 = saveGuide({
      city: 'A',
      guide_type: 't',
      source_text: 'a',
      extracted: '{}',
      token_count: 1
    });
    const fakeId = 'guide-nonexistent-123';

    const guides = getGuidesByIds([id1, fakeId]);
    expect(guides).toHaveLength(2);
    expect(guides[0].id).toBe(id1);
    expect(guides[1]).toBeNull();
  });

  it('getGuidesByIds returns empty array for empty input', () => {
    expect(getGuidesByIds([])).toEqual([]);
  });
});
