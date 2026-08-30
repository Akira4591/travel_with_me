import { tokenize } from './tokenizer.js';
import { getAllActiveGuides } from './store.js';

const DEFAULT_K1 = 1.5;
const DEFAULT_B = 0.75;

export class BM25Index {
  constructor({ k1 = DEFAULT_K1, b = DEFAULT_B } = {}) {
    this.k1 = k1;
    this.b = b;
    this.docs = new Map();
    this.invertedIndex = new Map();
    this.avgDocLength = 0;
    this.docCount = 0;
    this.indexBuiltAt = null;
  }

  addDocument(docId, tokens) {
    if (this.docs.has(docId)) return;

    const length = tokens.length;
    this.docs.set(docId, { length });

    const termFreqs = new Map();
    for (const token of tokens) {
      termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
    }

    for (const [term, tf] of termFreqs) {
      if (!this.invertedIndex.has(term)) {
        this.invertedIndex.set(term, new Map());
      }
      this.invertedIndex.get(term).set(docId, tf);
    }

    this.docCount++;
    this.avgDocLength = (this.avgDocLength * (this.docCount - 1) + length) / this.docCount;
  }

  search(queryTokens, { topK = 5 } = {}) {
    if (this.docCount === 0) return [];

    const scores = new Map();
    const uniqueQueryTokens = [...new Set(queryTokens)];

    for (const queryToken of uniqueQueryTokens) {
      const postings = this.invertedIndex.get(queryToken);
      if (!postings) continue;

      const df = postings.size;
      const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);

      for (const [docId, tf] of postings) {
        const doc = this.docs.get(docId);
        if (!doc) continue;

        const tfNorm =
          (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (doc.length / (this.avgDocLength || 1))));

        scores.set(docId, (scores.get(docId) || 0) + idf * tfNorm);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([docId, score]) => ({ docId, score }));
  }

  rebuildFromDB() {
    this.docs.clear();
    this.invertedIndex.clear();
    this.avgDocLength = 0;
    this.docCount = 0;

    const guides = getAllActiveGuides();
    for (const guide of guides) {
      const tokens = tokenize(guide.source_text);
      this.addDocument(guide.id, tokens);
    }

    this.indexBuiltAt = new Date().toISOString();
    return this.docCount;
  }

  get stats() {
    return {
      docCount: this.docCount,
      avgDocLength: this.avgDocLength || 0,
      indexBuiltAt: this.indexBuiltAt
    };
  }
}
