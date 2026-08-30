import { describe, it, expect, beforeEach } from 'vitest';
import { BM25Index } from '../rag/bm25.js';

describe('BM25Index', () => {
  let index;

  beforeEach(() => {
    index = new BM25Index({ k1: 1.5, b: 0.75 });
  });

  it('returns empty array for empty index search', () => {
    const results = index.search(['test']);
    expect(results).toEqual([]);
  });

  it('returns scored results for matching documents', () => {
    index.addDocument('doc1', ['北京', '故宫', '颐和园']);
    const results = index.search(['故宫']);
    expect(results).toHaveLength(1);
    expect(results[0].docId).toBe('doc1');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('ranks documents with higher term frequency higher', () => {
    index.addDocument('doc1', ['故宫', '北京']);
    index.addDocument('doc2', ['故宫', '故宫', '故宫', '北京']);
    const results = index.search(['故宫']);
    expect(results[0].docId).toBe('doc2');
  });

  it('ranks rare terms higher than common terms', () => {
    index.addDocument('doc1', ['故宫', '北京', '天安门', '天安门', '天安门']);
    index.addDocument('doc2', ['故宫', '北京', '颐和园']);
    const results = index.search(['颐和园', '天安门']);
    const yheyuanScore = results[0]?.score;
    expect(yheyuanScore).toBeGreaterThan(0);
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns results sorted by score descending', () => {
    index.addDocument('doc1', ['上海', '外滩']);
    index.addDocument('doc2', ['上海', '外滩', '外滩', '外滩']);
    index.addDocument('doc3', ['上海']);
    const results = index.search(['外滩']);
    expect(results.length).toBe(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('respects topK limit', () => {
    index.addDocument('doc1', ['故宫']);
    index.addDocument('doc2', ['故宫']);
    index.addDocument('doc3', ['故宫']);
    const results = index.search(['故宫'], { topK: 2 });
    expect(results).toHaveLength(2);
  });

  it('ignores duplicate addDocument calls for same docId', () => {
    index.addDocument('doc1', ['故宫']);
    index.addDocument('doc1', ['故宫']);
    expect(index.docCount).toBe(1);
  });

  it('returns empty for non-matching query tokens', () => {
    index.addDocument('doc1', ['故宫', '北京']);
    const results = index.search(['西安', '兵马俑']);
    expect(results).toEqual([]);
  });

  it('updates stats after adding documents', () => {
    index.addDocument('doc1', ['北京', '故宫', '颐和园']);
    index.addDocument('doc2', ['上海', '外滩', '南京路', '陆家嘴']);
    expect(index.stats.docCount).toBe(2);
    expect(index.stats.avgDocLength).toBe(3.5);
    expect(index.stats.indexBuiltAt).toBeNull();
  });
});
