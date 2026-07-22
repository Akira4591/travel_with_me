import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { closeDB } from '../rag/db.js';

const TMP_DIR = resolve(process.cwd(), 'test-tmp-integration');
const TMP_DB = resolve(TMP_DIR, 'test-integration.db');

const originalEnv = { ...process.env };

function setTestEnv(overrides = {}) {
  process.env = {
    ...originalEnv,
    PORT: '0',
    ALLOWED_ORIGINS: '',
    DEEPSEEK_API_KEY: '',
    AMAP_JSCODE: '',
    AMAP_JS_KEY: '',
    AMAP_WEB_SERVICE_KEY: '',
    RAG_ENABLED: 'true',
    RAG_DB_PATH: ':memory:',
    ...overrides
  };
}

async function getApp(overrides = {}) {
  vi.resetModules();
  setTestEnv(overrides);
  const mod = await import('../index.js');
  return mod.app;
}

function cleanupTmp() {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {
    // Windows EPERM on locked files - ignore, will be cleaned on next run
  }
}

describe('server integration', () => {
  beforeEach(() => {
    cleanupTmp();
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterEach(() => {
    closeDB();
    cleanupTmp();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('GET /healthz', () => {
    it('returns ok status', async () => {
      const app = await getApp();
      const res = await app.request('/healthz');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('travel-with-me');
      expect(body.timestamp).toBeTruthy();
    });
  });

  describe('GET /readyz', () => {
    it('returns degraded when keys are missing', async () => {
      const app = await getApp();
      const res = await app.request('/readyz');
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe('degraded');
      expect(body.dependencies.amapJsSecurity).toBe(false);
      expect(body.dependencies.amapJsKey).toBe(false);
      expect(body.dependencies.amapWebService).toBe(false);
    });

    it('returns ready when all keys are set', async () => {
      const app = await getApp({
        AMAP_JSCODE: 'test-jscode',
        AMAP_JS_KEY: 'test-jskey',
        AMAP_WEB_SERVICE_KEY: 'test-wskey'
      });
      const res = await app.request('/readyz');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ready');
      expect(body.dependencies.amapJsSecurity).toBe(true);
      expect(body.dependencies.amapWebService).toBe(true);
    });
  });

  describe('GET /_config', () => {
    it('returns amapJsKey (empty when not set)', async () => {
      const app = await getApp();
      const res = await app.request('/_config');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('amapJsKey');
      expect(body.amapJsKey).toBe('');
    });
  });

  describe('GET /_ai/status', () => {
    it('returns unavailable when DEEPSEEK_API_KEY is missing', async () => {
      const app = await getApp();
      const res = await app.request('/_ai/status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.available).toBe(false);
      expect(body.reason).toBe('DEEPSEEK_API_KEY_MISSING');
    });
  });

  describe('POST /_ai/extract-guide', () => {
    it('returns 503 when DEEPSEEK_API_KEY is missing', async () => {
      const app = await getApp();
      const res = await app.request('/_ai/extract-guide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'a'.repeat(50), cityHint: '北京' })
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe('AI_UNAVAILABLE');
    });

    it('returns 400 when text is too short', async () => {
      const app = await getApp({ DEEPSEEK_API_KEY: 'test-key' });
      const res = await app.request('/_ai/extract-guide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'short', cityHint: '' })
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('TEXT_TOO_SHORT');
    });

    it('returns 400 when text is too long', async () => {
      const app = await getApp({ DEEPSEEK_API_KEY: 'test-key' });
      const res = await app.request('/_ai/extract-guide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'a'.repeat(5001), cityHint: '' })
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('TEXT_TOO_LONG');
    });

    it('returns 400 on invalid JSON body', async () => {
      const app = await getApp({ DEEPSEEK_API_KEY: 'test-key' });
      const res = await app.request('/_ai/extract-guide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json'
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('BAD_REQUEST');
    });
  });

  describe('GET /_rag/status', () => {
    it('returns rag_disabled when RAG is off', async () => {
      const app = await getApp({ RAG_ENABLED: 'false' });
      const res = await app.request('/_rag/status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.available).toBe(false);
      expect(body.reason).toBe('rag_disabled');
      expect(body.documentCount).toBe(0);
    });

    it('returns document count when RAG is enabled with empty DB', async () => {
      const app = await getApp();
      const res = await app.request('/_rag/status');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.available).toBe(true);
      expect(body.documentCount).toBe(0);
      expect(body.minDocs).toBe(3);
    });
  });

  describe('POST /_rag/search', () => {
    it('returns 503 when RAG is disabled', async () => {
      const app = await getApp({ RAG_ENABLED: 'false' });
      const res = await app.request('/_rag/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'test query' })
      });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toBe('RAG_UNAVAILABLE');
    });

    it('returns 400 when query is too short', async () => {
      const app = await getApp();
      const res = await app.request('/_rag/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'a' })
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('QUERY_TOO_SHORT');
    });

    it('returns 400 on invalid JSON body', async () => {
      const app = await getApp();
      const res = await app.request('/_rag/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'invalid'
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('BAD_REQUEST');
    });

    it('returns empty results for valid query with no docs', async () => {
      const app = await getApp();
      const res = await app.request('/_rag/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '北京旅游攻略' })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toEqual([]);
      expect(body.count).toBe(0);
    });
  });

  describe('GET /_rag/guides', () => {
    it('returns empty list when no guides exist', async () => {
      const app = await getApp();
      const res = await app.request('/_rag/guides');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.guides).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns empty list when RAG is disabled', async () => {
      const app = await getApp({ RAG_ENABLED: 'false' });
      const res = await app.request('/_rag/guides');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.guides).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('DELETE /_rag/guides/:id', () => {
    it('returns 404 for non-existent guide', async () => {
      const app = await getApp();
      const res = await app.request('/_rag/guides/non-existent-id', {
        method: 'DELETE'
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('NOT_FOUND');
    });

    it('soft-deletes an existing guide', async () => {
      const app = await getApp({ RAG_DB_PATH: TMP_DB });
      // Use the app's own DB connection to save a guide via the store module
      const { saveGuide } = await import('../rag/store.js');
      const id = saveGuide({
        city: '北京',
        guide_type: 'daily_itinerary',
        source_text: '北京三日游',
        extracted: '{"events":[]}',
        token_count: 10
      });
      const res = await app.request(`/_rag/guides/${id}`, {
        method: 'DELETE'
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(id);
    });
  });

  describe('GET /_AMapService/v3/log/init', () => {
    it('returns JSONP when callback is valid', async () => {
      const app = await getApp();
      const res = await app.request('/_AMapService/v3/log/init?callback=AMap._jsonCallback');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('javascript');
      const text = await res.text();
      expect(text).toContain('AMap._jsonCallback(');
      expect(text).toContain('"status":"1"');
    });

    it('returns JSON when callback is missing', async () => {
      const app = await getApp();
      const res = await app.request('/_AMapService/v3/log/init');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('json');
      const body = await res.json();
      expect(body.status).toBe('1');
    });
  });

  describe('GET /_AMapService/* (proxy)', () => {
    it('returns 400 for disallowed upstream path', async () => {
      const app = await getApp();
      const res = await app.request('/_AMapService/v3/unknown/path');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.info).toBe('BFF_PATH_NOT_ALLOWED');
    });

    it('returns 503 when AMAP_WEB_SERVICE_KEY is missing', async () => {
      const app = await getApp();
      const res = await app.request('/_AMapService/v3/place/text?keywords=test');
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.info).toBe('BFF_KEY_MISSING');
    });
  });

  describe('GET /_AMapTile (tile proxy)', () => {
    it('returns 400 for non-integer tile params', async () => {
      const app = await getApp();
      const res = await app.request('/_AMapTile?x=abc&y=1&z=5');
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain('Bad tile params');
    });

    it('returns 400 for out-of-range tile coords', async () => {
      const app = await getApp();
      const res = await app.request('/_AMapTile?x=999&y=999&z=3');
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain('out of range');
    });

    it('returns 400 for zoom out of range', async () => {
      const app = await getApp();
      const res = await app.request('/_AMapTile?x=1&y=1&z=2');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /_elevation', () => {
    it('returns 400 for non-numeric coordinates', async () => {
      const app = await getApp();
      const res = await app.request('/_elevation?latitude=abc&longitude=def');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('INVALID_ELEVATION_COORDINATES');
    });

    it('returns 400 for mismatched coordinate arrays', async () => {
      const app = await getApp();
      const res = await app.request('/_elevation?latitude=39.9,116.4&longitude=116.4');
      expect(res.status).toBe(400);
    });

    it('returns 400 for too many coordinates', async () => {
      const app = await getApp();
      const coords = Array.from({ length: 101 }, (_, i) => (39 + i * 0.01).toFixed(4)).join(',');
      const res = await app.request(`/_elevation?latitude=${coords}&longitude=${coords}`);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /_geo-assets', () => {
    it('returns 400 for missing points', async () => {
      const app = await getApp();
      const res = await app.request('/_geo-assets');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('INVALID_GEO_ASSET_POINTS');
    });

    it('returns 400 for too many points', async () => {
      const app = await getApp();
      const points = Array.from({ length: 9 }, (_, i) => `116.${i},39.${i}`).join('|');
      const res = await app.request(`/_geo-assets?points=${points}`);
      expect(res.status).toBe(400);
    });
  });

  describe('CORS / Origin validation', () => {
    it('rejects requests with untrusted origin', async () => {
      const app = await getApp();
      const res = await app.request('/_ai/extract-guide', {
        method: 'POST',
        headers: {
          Origin: 'https://evil.example.com',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ text: 'a'.repeat(50) })
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('FORBIDDEN_SOURCE');
    });

    it('allows requests without explicit Origin header (same-origin)', async () => {
      const app = await getApp();
      const res = await app.request('/_ai/extract-guide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'a'.repeat(50) })
      });
      expect(res.status).not.toBe(403);
    });

    it('allows requests when ALLOWED_ORIGINS matches', async () => {
      const app = await getApp({ ALLOWED_ORIGINS: 'https://trusted.example.com' });
      const res = await app.request('/_ai/extract-guide', {
        method: 'POST',
        headers: {
          Origin: 'https://trusted.example.com',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ text: 'a'.repeat(50) })
      });
      expect(res.status).not.toBe(403);
    });
  });

  describe('Security headers', () => {
    it('sets Content-Security-Policy header on routes after middleware', async () => {
      const app = await getApp();
      const res = await app.request('/_ai/status');
      const csp = res.headers.get('content-security-policy');
      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
    });

    it('sets permissions-policy header on routes after middleware', async () => {
      const app = await getApp();
      const res = await app.request('/_ai/status');
      const pp = res.headers.get('permissions-policy');
      expect(pp).toBeTruthy();
      expect(pp).toContain('geolocation');
    });
  });

  describe('Body size limit', () => {
    it('rejects oversized body on extract-guide', async () => {
      const app = await getApp({ DEEPSEEK_API_KEY: 'test-key', MAX_AI_BODY_BYTES: '100' });
      const res = await app.request('/_ai/extract-guide', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '200'
        },
        body: 'a'.repeat(200)
      });
      expect(res.status).toBe(413);
    });
  });
});
