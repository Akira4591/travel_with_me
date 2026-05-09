// server/index.js
// 极简 BFF：托管前端静态文件 + 代理高德 Web 服务接口
//
// 它只做两件事：
//   1) 把项目根目录下的 index.html / css / js 当静态文件托管
//   2) /_AMapService/* → https://restapi.amap.com/* 透明转发，
//      并在转发时注入服务端持有的 jscode（安全密钥）
//
// 设计要点：
//   - 浏览器永远看不到 jscode：前端只发请求到同源 /_AMapService
//   - jscode 只来自环境变量，不进 git，不进打包产物
//   - 上游响应原样回放，仅去掉 content-encoding/length（fetch 已自动解压）

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

// 本地加载 .env：Zeabur 等部署环境本身就会注入 process.env，找不到 .env 时静默跳过。
loadDotenv();

const JSCODE = process.env.AMAP_JSCODE;
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const PORT = Number(process.env.PORT) || 8080;
const UPSTREAM = 'https://restapi.amap.com';
const PROXY_PREFIX = '/_AMapService';
const TILE_PREFIX = '/_AMapTile';
const AI_PREFIX = '/_ai';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const DEEPSEEK_JSON_ATTEMPTS = 2;
const GUIDE_PROMPT_TEMPLATE = loadGuidePromptTemplate();

if (!JSCODE) {
  console.warn('[trip-app] AMAP_JSCODE 未设置：高德 Web 服务请求会被拒绝。请检查 .env 或部署环境变量。');
}
if (!DEEPSEEK_KEY) {
  console.warn('[trip-app] DEEPSEEK_API_KEY 未设置：AI 攻略导入功能将不可用。');
}
// V5：DEEPSEEK_KEY 仅在此读取声明，具体路由（/_ai/extract-guide）在 V6 实现攻略提取时再加

const app = new Hono();

// ─── AI 攻略导入 ────────────────────────────────────────

app.get(`${AI_PREFIX}/status`, (c) => {
  return c.json({
    available: Boolean(DEEPSEEK_KEY && GUIDE_PROMPT_TEMPLATE),
    reason: !DEEPSEEK_KEY
      ? 'DEEPSEEK_API_KEY_MISSING'
      : (!GUIDE_PROMPT_TEMPLATE ? 'GUIDE_PROMPT_MISSING' : '')
  });
});

app.post(`${AI_PREFIX}/extract-guide`, async (c) => {
  if (!DEEPSEEK_KEY) {
    return c.json({ error: 'AI_UNAVAILABLE', message: 'AI 攻略导入功能暂不可用：缺少 DEEPSEEK_API_KEY。' }, 503);
  }
  if (!GUIDE_PROMPT_TEMPLATE) {
    return c.json({ error: 'AI_PROMPT_MISSING', message: '攻略解析 Prompt 未找到，请检查服务端 Prompt 文件。' }, 500);
  }

  let payload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'BAD_REQUEST', message: '请求格式错误。' }, 400);
  }

  const text = String(payload?.text || '').trim();
  const cityHint = String(payload?.cityHint || '').trim();
  if (text.length < 50) return c.json({ error: 'TEXT_TOO_SHORT', message: '文字太短，请粘贴完整攻略段落。' }, 400);
  if (text.length > 5000) return c.json({ error: 'TEXT_TOO_LONG', message: '文字过长，请分段处理。' }, 400);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    let lastDebug = null;
    for (let attempt = 1; attempt <= DEEPSEEK_JSON_ATTEMPTS; attempt += 1) {
      const upstreamResp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'authorization': `Bearer ${DEEPSEEK_KEY}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          temperature: 0.2,
          max_tokens: 4096,
          messages: [
            {
              role: 'system',
              content: '你必须只输出一个可被 JSON.parse 解析的 json object，不要输出 markdown、代码块、解释文字或前后缀。'
            },
            {
              role: 'user',
              content: renderGuidePrompt(GUIDE_PROMPT_TEMPLATE, text, cityHint)
            }
          ]
        })
      });

      const data = await upstreamResp.json().catch(() => null);
      if (!upstreamResp.ok) {
        console.error('[trip-app] DeepSeek 请求失败：', data || upstreamResp.statusText);
        return c.json({ error: 'AI_UPSTREAM_FAILED', message: 'AI 暂时不可用，请稍后重试。' }, 502);
      }

      const choice = data?.choices?.[0];
      const content = choice?.message?.content || '';
      const parsed = parseGuideJSON(content);
      if (parsed) return c.json(normalizeExtractedGuide(parsed));

      const debug = {
        attempt,
        model: data?.model || DEEPSEEK_MODEL,
        finishReason: choice?.finish_reason || '',
        contentLength: String(content || '').length,
        preview: previewText(content)
      };
      lastDebug = debug;
      console.warn('[trip-app] AI 输出 JSON 解析失败：', debug);
      if (attempt < DEEPSEEK_JSON_ATTEMPTS) {
        await sleep(500);
        continue;
      }
    }

    return c.json({
      error: 'AI_PARSE_FAILED',
      message: buildParseFailMessage(lastDebug || {}),
      debug: lastDebug
    }, 502);
  } catch (err) {
    if (err?.name === 'AbortError') {
      return c.json({ error: 'AI_TIMEOUT', message: 'AI 处理超时，请稍后重试。' }, 504);
    }
    console.error('[trip-app] AI 攻略导入失败：', err);
    return c.json({ error: 'AI_FAILED', message: 'AI 暂时不可用，请稍后重试。' }, 502);
  } finally {
    clearTimeout(timer);
  }
});

// ─── 高德 Web 服务代理 ────────────────────────────────────
// 高德 JS SDK 在前端设置 _AMapSecurityConfig.serviceHost 后，
// 所有 Web 服务请求都会以 ${serviceHost}/v3/... 形式打到这里。
app.all(`${PROXY_PREFIX}/*`, async (c) => {
  const incoming = new URL(c.req.url);
  const upstreamPath = incoming.pathname.slice(PROXY_PREFIX.length);
  const upstream = new URL(UPSTREAM + upstreamPath);
  upstream.search = incoming.search;
  if (JSCODE) upstream.searchParams.set('jscode', JSCODE);

  const init = {
    method: c.req.method,
    headers: {
      'user-agent': c.req.header('user-agent') || 'trip-app-bff',
      'accept': c.req.header('accept') || '*/*'
    }
  };
  // 高德通过 Referer 头校验域名白名单（appname 参数不算数）。
  // 不透传 Referer 时所有 Web 服务请求会被 AMap 拒绝（INVALID_USER_DOMAIN / 10006）。
  const referer = c.req.header('referer');
  if (referer) init.headers['referer'] = referer;
  const origin = c.req.header('origin');
  if (origin) init.headers['origin'] = origin;

  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    init.body = await c.req.arrayBuffer();
    const ct = c.req.header('content-type');
    if (ct) init.headers['content-type'] = ct;
  }

  let upstreamResp;
  try {
    upstreamResp = await fetchWithRetry(upstream, init, {
      attempts: 2,
      label: '高德 Web 服务'
    });
  } catch (err) {
    console.error('[trip-app] 上游请求失败：', err);
    return c.json({
      status: '0',
      info: 'BFF_UPSTREAM_FAILED',
      infocode: '50001',
      message: '高德服务连接超时或网络不可用，请稍后重试。'
    }, 502);
  }

  const body = await upstreamResp.arrayBuffer();
  const headers = new Headers();
  upstreamResp.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === 'content-encoding' || k === 'content-length' || k === 'transfer-encoding') return;
    headers.set(key, value);
  });
  return new Response(body, { status: upstreamResp.status, headers });
});

// ─── 高德底图瓦片代理 ────────────────────────────────────
// 分享长图需要把地图瓦片画进 canvas；浏览器直接加载跨域瓦片会污染 canvas。
app.get(TILE_PREFIX, async (c) => {
  const x = Number(c.req.query('x'));
  const y = Number(c.req.query('y'));
  const z = Number(c.req.query('z'));
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    return c.text('Bad tile params', 400);
  }

  const host = `https://webrd0${Math.abs(x + y) % 4 + 1}.is.autonavi.com`;
  const upstream = new URL('/appmaptile', host);
  upstream.searchParams.set('lang', 'zh_cn');
  upstream.searchParams.set('size', '1');
  upstream.searchParams.set('scale', '1');
  upstream.searchParams.set('style', '8');
  upstream.searchParams.set('x', String(x));
  upstream.searchParams.set('y', String(y));
  upstream.searchParams.set('z', String(z));

  let upstreamResp;
  try {
    upstreamResp = await fetch(upstream, {
      headers: {
        'user-agent': c.req.header('user-agent') || 'trip-app-bff',
        'accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
  } catch (err) {
    console.error('[trip-app] 瓦片请求失败：', err);
    return c.text('Tile upstream failed', 502);
  }

  const body = await upstreamResp.arrayBuffer();
  const headers = new Headers();
  upstreamResp.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === 'content-encoding' || k === 'content-length' || k === 'transfer-encoding') return;
    headers.set(key, value);
  });
  headers.set('cache-control', 'public, max-age=86400');
  return new Response(body, { status: upstreamResp.status, headers });
});


// ─── 静态文件托管 ─────────────────────────────────────────
// 只暴露前端实际需要的目录/文件，避免把 server/、node_modules/、.env 也意外暴露。
app.get('/', serveStatic({ path: './index.html' }));
app.get('/index.html', serveStatic({ path: './index.html' }));
app.use('/css/*', serveStatic({ root: './' }));
app.use('/js/*', serveStatic({ root: './' }));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[trip-app] 已启动：http://localhost:${info.port}`);
});

function loadDotenv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '..', '.env');
  let content;
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    return; // 没有 .env，按部署环境的 process.env 走
  }
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function loadGuidePromptTemplate() {
  const here = dirname(fileURLToPath(import.meta.url));
  const promptPath = resolve(here, 'prompts', 'guide-extract.md');
  try {
    return readFileSync(promptPath, 'utf8').trim();
  } catch {
    console.warn('[trip-app] 未找到 AI 攻略导入 Prompt，无法加载攻略解析功能。');
    return '';
  }
}

function renderGuidePrompt(template, text, cityHint) {
  const city = cityHint || '由你识别';
  return template
    .replace('{user_specified_city 或 "由你识别"}', city)
    .replace('{user_text}', text);
}

function parseGuideJSON(content) {
  const normalized = stripMarkdownFence(String(content || '').trim());
  try {
    return JSON.parse(normalized);
  } catch {}

  const jsonLike = extractBalancedJSONObject(normalized);
  if (!jsonLike) return null;
  try {
    return JSON.parse(jsonLike);
  } catch {
    const repaired = repairCommonJSONIssues(jsonLike);
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

function stripMarkdownFence(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractBalancedJSONObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function repairCommonJSONIssues(text) {
  return text
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/:\s*undefined\b/g, ': null');
}

function previewText(content) {
  return String(content || '')
    .replace(/\s+/g, ' ')
    .slice(0, 500);
}

function buildParseFailMessage(debug) {
  if (!debug.contentLength) return 'AI 没有返回内容，请稍后重试。';
  if (debug.finishReason && debug.finishReason !== 'stop') {
    return `AI 输出未完成（${debug.finishReason}），请缩短攻略后重试。`;
  }
  return `AI 输出不是合法 JSON。返回片段：${debug.preview || '无内容'}`;
}

function normalizeExtractedGuide(input = {}) {
  const guideTypes = new Set(['daily_itinerary', 'recommendation_list', 'mixed', 'non_travel']);
  const timeSlots = new Set(['morning', 'noon', 'afternoon', 'evening']);
  const guideType = guideTypes.has(input.guide_type) ? input.guide_type : 'non_travel';
  return {
    guide_type: guideType,
    city: input.city ? String(input.city).trim() : null,
    title_suggestion: String(input.title_suggestion || '').trim(),
    events: Array.isArray(input.events)
      ? input.events.map(event => ({
          place_name: String(event?.place_name || '').trim(),
          day: Number.isInteger(event?.day) && event.day > 0 ? event.day : null,
          time_slot: timeSlots.has(event?.time_slot) ? event.time_slot : null,
          note: String(event?.note || '').trim().slice(0, 120),
          source_quote: String(event?.source_quote || '').trim().slice(0, 80)
        })).filter(event => event.place_name)
      : [],
    warnings: Array.isArray(input.warnings)
      ? input.warnings.map(item => String(item || '').trim()).filter(Boolean)
      : []
  };
}

async function fetchWithRetry(url, init = {}, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 1);
  const label = options.label || '上游服务';
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (attempt >= attempts) break;
      console.warn(`[trip-app] ${label}请求失败，准备重试 ${attempt}/${attempts - 1}：`, summarizeFetchError(err));
      await sleep(500 * attempt);
    }
  }
  throw lastError;
}

function summarizeFetchError(err) {
  return {
    name: err?.name || '',
    message: err?.message || '',
    code: err?.cause?.code || err?.code || ''
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
