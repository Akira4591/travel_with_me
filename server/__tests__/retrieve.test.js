import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDB, closeDB } from '../rag/db.js';
import { saveGuide } from '../rag/store.js';
import { BM25Index } from '../rag/bm25.js';
import { retrieveGuides, formatRetrievedContext } from '../rag/retrieve.js';

describe('retrieve', () => {
  let bm25Index;

  beforeEach(() => {
    initDB(':memory:');
    bm25Index = new BM25Index();
  });

  afterEach(() => {
    closeDB();
  });

  it('returns empty array for empty query text', () => {
    bm25Index.rebuildFromDB();
    const results = retrieveGuides(bm25Index, '', { topK: 3 });
    expect(results).toEqual([]);
  });

  it('returns empty array when index has no documents', () => {
    const results = retrieveGuides(bm25Index, '北京故宫', { topK: 3 });
    expect(results).toEqual([]);
  });

  it('returns matching guides sorted by relevance', () => {
    const id1 = saveGuide({
      city: '北京',
      guide_type: 'daily_itinerary',
      source_text: '北京三日游，第一天故宫，第二天颐和园，第三天雍和宫',
      extracted: '{}',
      token_count: 20
    });
    const id2 = saveGuide({
      city: '上海',
      guide_type: 'recommendation_list',
      source_text: '上海美食推荐，外滩夜景，南京路步行街',
      extracted: '{}',
      token_count: 15
    });
    bm25Index.rebuildFromDB();

    const results = retrieveGuides(bm25Index, '故宫北京旅游', { topK: 2 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(id1);
    expect(results[0].city).toBe('北京');
    expect(results[0].snippet).toContain('故宫');
  });

  it('includes snippet limited by maxSnippetLength', () => {
    const longText =
      '北京三日游攻略，第一天去故宫和天安门广场，第二天去颐和园和圆明园，第三天去雍和宫和簋街吃美食，北京有很多好玩的地方值得逛一逛，北京的胡同文化也很值得体验。';
    saveGuide({
      city: '北京',
      guide_type: 'daily_itinerary',
      source_text: longText,
      extracted: '{}',
      token_count: 200
    });
    bm25Index.rebuildFromDB();

    const results = retrieveGuides(bm25Index, '故宫北京旅游', { topK: 1, maxSnippetLength: 30 });
    expect(results).toHaveLength(1);
    expect(results[0].snippet.length).toBeLessThanOrEqual(30);
  });

  it('respects topK limit', () => {
    saveGuide({
      city: 'A',
      guide_type: 't',
      source_text: '故宫北京旅游攻略',
      extracted: '{}',
      token_count: 5
    });
    saveGuide({
      city: 'B',
      guide_type: 't',
      source_text: '故宫北京景点推荐',
      extracted: '{}',
      token_count: 5
    });
    saveGuide({
      city: 'C',
      guide_type: 't',
      source_text: '故宫北京三日游',
      extracted: '{}',
      token_count: 5
    });
    bm25Index.rebuildFromDB();

    const results = retrieveGuides(bm25Index, '故宫北京', { topK: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

describe('formatRetrievedContext', () => {
  it('returns empty string for empty results', () => {
    expect(formatRetrievedContext([])).toBe('');
  });

  it('formats results with header and snippets', () => {
    const results = [
      { id: 'g1', score: 5.5, city: '北京', guideType: 'daily_itinerary', snippet: '故宫三日游' },
      { id: 'g2', score: 3.2, city: '上海', guideType: 'mixed', snippet: '外滩citywalk' }
    ];
    const formatted = formatRetrievedContext(results);
    expect(formatted).toContain('参考攻略');
    expect(formatted).toContain('北京');
    expect(formatted).toContain('daily_itinerary');
    expect(formatted).toContain('故宫三日游');
    expect(formatted).toContain('上海');
    expect(formatted).toContain('外滩citywalk');
    expect(formatted).toContain('---');
  });
});
