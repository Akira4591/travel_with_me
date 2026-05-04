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
const PORT = Number(process.env.PORT) || 8080;
const UPSTREAM = 'https://restapi.amap.com';
const PROXY_PREFIX = '/_AMapService';

if (!JSCODE) {
  console.warn('[trip-app] AMAP_JSCODE 未设置：高德 Web 服务请求会被拒绝。请检查 .env 或部署环境变量。');
}

const app = new Hono();

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
    upstreamResp = await fetch(upstream, init);
  } catch (err) {
    console.error('[trip-app] 上游请求失败：', err);
    return c.json({ status: '0', info: 'BFF_UPSTREAM_FAILED', infocode: '50001' }, 502);
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
