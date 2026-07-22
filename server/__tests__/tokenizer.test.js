import { describe, it, expect } from 'vitest';
import { tokenize, tokenizeQuery } from '../rag/tokenizer.js';

describe('tokenizer', () => {
  it('tokenizes Chinese text into meaningful terms', () => {
    const tokens = tokenize('上海武康路citywalk攻略');
    expect(tokens).toContain('上海');
    expect(tokens).toContain('武康路');
    expect(tokens).toContain('citywalk');
    expect(tokens).toContain('攻略');
  });

  it('filters out stop words', () => {
    const tokens = tokenize('北京的故宫是一个非常好看的景点');
    expect(tokens).not.toContain('的');
    expect(tokens).not.toContain('是');
    expect(tokens).not.toContain('一个');
    expect(tokens).not.toContain('非常');
    expect(tokens).toContain('北京');
    expect(tokens).toContain('故宫');
  });

  it('filters out pure punctuation and digits', () => {
    const tokens = tokenize('Day 1：北京。Day 2！上海？');
    expect(tokens.every(t => !/^[\d\s.,;:!?。，；：！？\-]+$/.test(t))).toBe(true);
  });

  it('filters single Chinese character tokens', () => {
    const tokens = tokenize('去吃玩看');
    expect(tokens).not.toContain('去');
    expect(tokens).not.toContain('吃');
  });

  it('handles English text', () => {
    const tokens = tokenize('Beijing travel guide for tourists');
    expect(tokens).toContain('Beijing');
    expect(tokens).toContain('travel');
    expect(tokens).toContain('tourists');
  });

  it('tokenizeQuery produces same result as tokenize', () => {
    const text = '上海美食推荐';
    expect(tokenizeQuery(text)).toEqual(tokenize(text));
  });

  it('returns empty array for empty or whitespace input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });
});
