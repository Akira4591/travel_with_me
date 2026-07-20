# Travel With Me — 开发控制文档

> **本文件是项目唯一权威开发控制文档。** 其他文档均为辅助文件，仅作补充参考。
> 如有冲突，以本文件为准。最后更新: 2026-07-20

---

## 1. 项目概述

**Travel With Me** 是一个中文旅行路线规划 Web App（desktop-first），支持 AI 攻略导入、2D 地图规划、3D 微缩沙盘预览。

| 层       | 技术                  | 细节                                                    |
| -------- | --------------------- | ------------------------------------------------------- |
| Runtime  | Node.js 18+           | ES Modules (`"type": "module"`)                         |
| BFF      | Hono v4               | 单文件 `server/index.js`，静态托管 + API 代理 + AI 中转 |
| 前端     | 原生 ES Modules       | 无构建工具、无 React/Vue、浏览器直接加载                |
| 3D       | Three.js 0.162.0      | importmap 加载                                          |
| 2D 地图  | AMap JS API 2.0       | POI / 路线 / 地理编码                                   |
| 持久化   | localStorage          | Schema v5，workspace JSON                               |
| AI/LLM   | DeepSeek API          | `deepseek-chat`（env 可配），JSON 输出模式              |
| RAG      | SQLite + BM25         | `better-sqlite3` + `@node-rs/jieba`（R0-R1 已实现）     |
| 高程     | Open-Meteo API        | Open-Elevation fallback                                 |
| 地理资产 | Overpass/OSM API      | 建筑/道路/水系/桥梁/植被                                |
| 单元测试 | Vitest v4             | 39 文件，244 测试                                       |
| E2E 测试 | Playwright v1.61      | Chromium + Pixel 5                                      |
| Lint     | ESLint v9 flat config | render 模块不可 import api/server                       |
| CI       | GitHub Actions        | Node 18+22 matrix                                       |
| 容器     | Docker node:22-slim   | multi-stage（native 编译）                              |

### 产品阶段

| 阶段                 | 状态     | 说明                             |
| -------------------- | -------- | -------------------------------- |
| D0: 数据基础         | 已关闭   | 2D 数据契约确立                  |
| D1: 3D 路线与地形    | **当前** | Gate 50 产品化（50/50 complete） |
| D2: 授权地点详情     | 待定     | —                                |
| D3: 私有测试与商业化 | 待定     | —                                |

### 质量门禁

50 个质量门禁：**50/50 complete**。Gate 50 人工视觉验收已于 2026-07-17 通过。

---

## 2. 快速开始

### 2.1 前置条件

- Node.js >= 18（开发机当前 v24.15.0）
- npm（必须用 `npm.cmd`，因 npm 有 install-scripts blocking）
- Git
- 高德开放平台账号（申请 JS API Key + 安全密钥 + Web 服务 Key）
- DeepSeek API Key（可选，AI 导入功能需要）

### 2.2 安装

```bash
git clone <repo-url>
cd travel_with_me
npm.cmd install
```

> **native 模块注意**: `better-sqlite3` 需要 `npm install-scripts approve better-sqlite3` 然后 `npm rebuild better-sqlite3`。

### 2.3 环境变量

复制 `.env.example` 为 `.env`，填入密钥：

```bash
cp .env.example .env
```

| 变量                      | 必需 | 默认值      | 用途                          |
| ------------------------- | ---- | ----------- | ----------------------------- |
| `AMAP_JS_KEY`             | 是   | —           | AMap JS API Key（浏览器可见） |
| `AMAP_JSCODE`             | 是   | —           | AMap 安全密钥（仅服务端）     |
| `AMAP_WEB_SERVICE_KEY`    | 是   | —           | AMap Web 服务 Key（仅服务端） |
| `DEEPSEEK_API_KEY`        | 否   | —           | DeepSeek API Key（AI 导入）   |
| `DEEPSEEK_TIMEOUT_MS`     | 否   | 90000       | AI 请求超时（ms）             |
| `PORT`                    | 否   | 8080        | 服务端口                      |
| `ALLOWED_ORIGINS`         | 否   | 空          | 额外允许的 CORS 源            |
| `MAX_AI_BODY_BYTES`       | 否   | 24000       | AI 导入 body 上限             |
| `AI_RATE_LIMIT`           | 否   | 10          | AI 请求/窗口/IP               |
| `AI_RATE_WINDOW_MS`       | 否   | 3600000     | AI 限流窗口                   |
| `AMAP_RATE_LIMIT`         | 否   | 600         | AMap 代理请求/窗口            |
| `TILE_RATE_LIMIT`         | 否   | 1200        | 瓦片代理请求/窗口             |
| `ELEVATION_RATE_LIMIT`    | 否   | 120         | 高程请求/窗口                 |
| `GEO_ASSETS_RATE_LIMIT`   | 否   | 24          | 地理资产请求/窗口             |
| `GEO_ASSETS_CACHE_TTL_MS` | 否   | 86400000    | 地理资产缓存 TTL              |
| `RAG_PREFIX`              | 否   | /\_rag      | RAG 端点前缀                  |
| `RAG_ENABLED`             | 否   | true        | RAG 开关                      |
| `RAG_DB_PATH`             | 否   | data/rag.db | SQLite 路径                   |
| `RAG_TOP_K`               | 否   | 3           | 检索返回文档数                |
| `RAG_MAX_CONTEXT_CHARS`   | 否   | 1500        | 注入 prompt 最大字符          |
| `RAG_MIN_DOCS`            | 否   | 3           | 冷启动最小文档数              |
| `RAG_SEARCH_RATE_LIMIT`   | 否   | 20          | RAG 搜索请求/窗口             |

### 2.4 常用命令

```bash
npm.cmd start              # 启动生产服务器
npm.cmd run dev            # 启动开发服务器
npm.cmd run check          # 格式检查
npm.cmd run lint           # ESLint
npm.cmd test               # 单元测试 (Vitest)
npm.cmd run test:e2e       # E2E 测试 (Playwright)
npm.cmd run test:e2e:visual          # 视觉基线
npm.cmd run test:e2e:visual:stability # 视觉稳定性 (5 runs)
npm.cmd run test:guide-import         # AI 导入评估
npm.cmd run gate50:review            # Gate 50 截图审查
npm.cmd run gate50:live-review       # Gate 50 实时审查
npm.cmd run gate50:packet            # Gate 50 审查包
npm.cmd run check:gate50-evidence    # Gate 50 证据检查
```

### 2.5 日常开发流程

```
npm.cmd ci
  → npm.cmd run check   (格式)
  → npm.cmd run lint    (ESLint)
  → npm.cmd test        (单元测试)
  → npm.cmd run test:e2e (如改动 UI/3D)
```

---

## 3. 系统架构

### 3.1 BFF 模式

单 Hono 服务器 (`server/index.js`) 兼任：

- 静态文件托管（`/`, `/css/*`, `/js/*`, `/three/*`）
- API 代理（AMap / 高程 / OSM 地理资产）
- AI 网关（DeepSeek 攻略提取）
- RAG 服务（SQLite + BM25 检索）

所有外部 API Key 仅存于服务端，不暴露给浏览器。

### 3.2 依赖图

```
main.js → {state.js, render/*.js, api/*.js} → {utils, config, data}
```

- **单向无循环**依赖流
- **render 模块禁止 import api/server**（ESLint `no-restricted-imports` 强制）
  - 被阻止的路径: `../api/*`, `../api/**`, `../../server/*`, `../../server/**`
- 渲染器接收准备好的数据/上下文，不直接调用 API

### 3.3 架构决策记录 (ADR)

| ADR   | 决策                      | 要点                                                                                                                                                                                                                 |
| ----- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-1 | Hono + 原生 ES Modules    | 非 Next.js，无构建步骤                                                                                                                                                                                               |
| ADR-2 | localStorage              | 非后端数据库，计划后续升级                                                                                                                                                                                           |
| ADR-3 | Canvas 分享图             | 非服务端渲染                                                                                                                                                                                                         |
| ADR-4 | DeepSeek 作为 AI 导入引擎 | `deepseek-chat`（env 可配）                                                                                                                                                                                          |
| ADR-5 | BFF 代理隔离安全密钥      | Key 不出服务端                                                                                                                                                                                                       |
| ADR-6 | 3D Diorama                | 2D 事实层驱动的生成式规划沙盘                                                                                                                                                                                        |
| ADR-7 | 分阶段商业化              | S1→S2→S3→S4                                                                                                                                                                                                          |
| ADR-8 | RAG 知识检索层            | R0-R5 路线：SQLite→BM25→DashScope embedding→自反思→知识库→Agentic                                                                                                                                                    |
| ADR-9 | RAG embedding 路线选型    | 选 Route B（DashScope text-embedding-v3 + hnswlib-node），弃 Route A（本地 BGE-M3 ONNX）。理由：中文质量最优、实现复杂度低、生态一致（AMap+DeepSeek 同为中文云生态）、已有完整 spec。BM25 保留为 hybrid 检索补充层。 |

### 3.4 核心规则

> **2D 是地理事实源；3D 是同一数据的空间解释。**

- 2D AMap 提供 POI / 地理编码 / 路线 — 是唯一事实源
- 3D Three.js 是规划沙盘 — 消费 2D 数据，不发明数据
- 缺少 provenance 的数据 → **fail closed**（不渲染，不用中性 fallback 充数）

---

## 4. 数据模型

### 4.1 localStorage Schema v5

```
Workspace {
  version: 5,
  savedAt: <timestamp>,
  workspace: {
    trips: Trip[],         // 最多 3 个
    activeTripId: string
  }
}

Trip {
  id, title, subtitle, city,
  locations: { [id]: Location },    // 地点主表
  days: Day[],                       // 有序每日行程
  unscheduled: Event[],             // 未安排事件
  annotations: Annotation[],        // 3D/地图标记
  geoAssets: GeoAssets,             // OSM 地理资产缓存
  geoAssetStatus: { status, reason, sourceSummary, stale, degraded, updatedAt }
}

Location {
  name, query, addr, lnglat: [lng, lat],
  photo, type, resolved: boolean,
  province, city, district, tag, source
}

Day { id, title, events: Event[] }

Event {
  id, title, icon, timeSlot: 'morning'|'noon'|'afternoon'|'evening',
  note, locationId,
  routeToNext?: RouteConfig
}

RouteConfig {
  mode: 'driving'|'walking'|'transit'|'riding',
  label?, legs?, manual?,
  geometry?: { source, mode, paths, fetchedAt }
}

Annotation {
  id, type: 'entrance'|'viewpoint'|'supply'|'transfer'|'risk'|'note',
  lnglat, elevation, title, note, createdAt
}

GeoAssets {
  buildings, roads, waterways, bridges, landcover, landmarks
  // 每项均含 provenance 字段
}
```

JSDoc typedef: `js/data/trip.js:1-74`

### 4.2 State 管理模式

三层状态 (`js/state.js`, 989 行):

| 层          | 变量             | 可序列化 | 说明                       |
| ----------- | ---------------- | -------- | -------------------------- |
| Workspace   | `let workspace`  | 是       | 最多 3 个 trip             |
| Active Trip | `let trip`       | 是       | workspace 的活跃引用       |
| Runtime     | `const appState` | 否       | 地图实例、marker、timer 等 |

**事件系统**:

- `on(event, fn)` 返回取消订阅函数
- `emit()` 模块私有，try/catch 包裹
- 事件: `workspace:changed`, `workspace:replaced`, `trip:replaced`, `trip:changed` (含 `{ kind, ...details }`), `location:updated`

**Mutator 模式**: mutate → emit `trip:changed` → `main.js` 自动 persist + re-render

**添加新状态切片**: `normalizeTrip()` 初始化字段 → 添加 mutator (mutate + emit) → 添加 getter

### 4.3 Schema 迁移

旧版本触发 recovery snapshot（`workspace-recovery:<timestamp>`），然后交由 state 层 normalize。

---

## 5. 代码规范

### 5.1 ESLint

- **flat config** (`eslint.config.js`)
- **no-restricted-imports**: render 模块不可 import `../api/*`, `../../server/*`
- `js/__tests__/**` 和 `server/__tests__/**` 被 ignore
- 无 eslint-plugin-import，纯路径模式匹配

### 5.2 模块模式

#### State 模块 (`js/state.js`)

```js
// 动态 import 获取新实例（测试用）
const state = await import('../state.js');
state.initWorkspace(null, null);

// mutator: mutate → emit
export function addLocation(loc) {
  trip.locations[id] = { ... };
  emit('trip:changed', { kind: 'location:added', locationId: id });
  return id;
}
```

#### Modal 模式 (`js/render/modal-base.js`)

```js
// modalSingleton: 单例，确保同一时间只有一个实例
export const openTripModal = modalSingleton(({ mode, title, handlers }) => {
  const { root, body } = createModalShell({ className: 'trip-modal', title });
  setupModalCloseEvents(root, openTripModal.close);
  // form submit → handlers.onCreate/onSave → openTripModal.close()
  document.body.appendChild(root);
});

// 调用方 (main.js):
openTripModal({ mode: 'create', handlers: { onCreate: title => { ... } } });
```

#### 前端 API 客户端 (`js/api/*.js`)

薄 fetch wrapper，结构化结果对象，降级处理。示例: `js/api/guide-import.js` (22 行)。

#### 服务端 (`server/index.js`)

- `loadDotenv()` (line 24, defined 627-648): 自定义 .env 解析器，只设 undefined 的 key
- `renderGuidePrompt()` (line 661-664): 模板变量替换 `{user_specified_city}`, `{user_text}`, `{retrieved_context_section}`
- `fetchDeepSeekWithTimeout()` (lines 666-699): AbortController, chat completions API
- `fetchWithRetry()` (lines 1095-1114): 重试逻辑

### 5.3 测试模式 (Vitest)

- **Config**: `vitest.config.js` — node env, `globals: false`, include: `js/__tests__/**/*.test.js` + `server/__tests__/**/*.test.js`
- **每个测试文件必须显式 import**: `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'`

| 模式          | 说明                                                                 | 示例                           |
| ------------- | -------------------------------------------------------------------- | ------------------------------ |
| A: State 测试 | 动态 `await import()` 获取新模块实例                                 | `state.test.js`                |
| B: 纯函数测试 | 静态 import 直接测试                                                 | `geocode.test.js`              |
| C: Fetch stub | `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()` in afterEach | `geo-assets-api.test.js`       |
| D: 数据转换   | 静态 import 测试纯数据                                               | `guide-import-cleanup.test.js` |

### 5.4 格式化

- Prettier v3 (`.prettierrc`)
- Pre-commit hook: Husky + lint-staged

---

## 6. API 参考

### 6.1 BFF 端点

| Method | Path                 | 用途                           | 保护                                  |
| ------ | -------------------- | ------------------------------ | ------------------------------------- |
| GET    | `/healthz`           | 活性检查                       | 无                                    |
| GET    | `/readyz`            | 就绪检查（含 RAG 状态）        | 无                                    |
| GET    | `/_config`           | 返回 `AMAP_JS_KEY`             | 无                                    |
| GET    | `/_ai/status`        | AI 导入可用性                  | 无                                    |
| POST   | `/_ai/extract-guide` | AI 攻略提取（含 RAG 检索增强） | Origin 检查, 限流 10/hr, body 限 24KB |
| ALL    | `/_AMapService/*`    | AMap 代理                      | Origin 检查, 限流 600/min, 路径白名单 |
| GET    | `/_AMapTile`         | 瓦片代理                       | 限流 1200/min, 坐标校验               |
| GET    | `/_elevation`        | 高程代理                       | Origin 检查, 限流 120/min             |
| GET    | `/_geo-assets`       | OSM 资产代理                   | Origin 检查, 限流 24/hr, 24h 缓存     |

### 6.2 RAG 端点

| Method | Path               | 用途                                 | 保护                        |
| ------ | ------------------ | ------------------------------------ | --------------------------- |
| GET    | `/_rag/status`     | RAG 状态（enabled, docCount, ready） | 无                          |
| POST   | `/_rag/search`     | BM25 检索                            | Origin 检查, 限流 20/window |
| GET    | `/_rag/guides`     | 列出已存文档                         | 无                          |
| DELETE | `/_rag/guides/:id` | 软删除文档                           | 无                          |

### 6.3 AI 攻略导入流程

```
用户粘贴攻略文本 (50-5000 字符)
  → POST /_ai/extract-guide
     → [RAG] isRagReady()? → retrieveGuides(text, topK) → formatRetrievedContext
     → DeepSeek API (deepseek-chat, JSON, temp 0.2, max_tokens 4096)
     → Prompt: server/prompts/guide-extract.md (272 行, 含 {retrieved_context_section})
     → LLM 提取: guide_type, city, events[{place_name, day, time_slot, note, source_quote}]
  → 客户端清洗 (guide-import-cleanup.js): 过滤噪声, 去重
  → 客户端路线提取 (guide-import-flow.js): extractMainRoutePlan() 正则
  → POI 匹配 3 层:
     L1: 地名+城市搜索, similarityScore >= 0.55
     L2: 地名+note关键词, >= 0.4
     L3: AMap Geocoder + nearby enrichment
  → [RAG] 成功后: tokenize → saveGuide → bm25Index.addDocument
  → 用户预览确认 → 创建 trip 写入 localStorage
```

关键文件:

- `server/index.js:199-307` — POST /\_ai/extract-guide handler
- `server/index.js:666-699` — fetchDeepSeekWithTimeout()
- `server/prompts/guide-extract.md` — 272 行中文 prompt
- `js/guide-import-flow.js` — 路线提取/POI 匹配 (494 行)
- `js/guide-import-cleanup.js` — 噪声过滤 (112 行)

---

## 7. RAG 知识检索层

### 7.1 架构 (R0-R1 已实现)

```
server/rag/
├── db.js        (47行)  SQLite 初始化 (WAL, guides + rag_metadata 表)
├── store.js     (48行)  文档 CRUD: save/get/list/softDelete/getAllActive/count
├── tokenizer.js (33行)  @node-rs/jieba 中文分词 + 停用词过滤
├── bm25.js      (94行)  BM25Index 类 (k1=1.5, b=0.75, 倒排索引, IDF+1)
└── retrieve.js  (45行)  retrieveGuides + formatRetrievedContext
```

### 7.2 工作流

1. **提取增强**: `POST /_ai/extract-guide` 在调用 DeepSeek 前，检查 `isRagReady()` (docCount >= RAG_MIN_DOCS)
2. **检索**: `retrieveGuides(text)` → BM25 搜索 topK\*2 → 过滤 deleted → 截断到 topK
3. **注入**: `formatRetrievedContext()` → 注入 prompt 的 `{retrieved_context_section}` 槽位
4. **保存**: 提取成功后 → `tokenize(text)` → `saveGuide()` → `bm25Index.addDocument()`
5. **冷启动保护**: docCount < RAG_MIN_DOCS (默认 3) 时不启用检索
6. **降级**: RAG 失败不阻塞提取（try/catch，bm25Index = null）

### 7.3 SQLite Schema

```sql
-- guides 表
CREATE TABLE guides (
  id TEXT PRIMARY KEY,
  city TEXT,
  guide_type TEXT,
  source_text TEXT NOT NULL,
  extracted TEXT,          -- JSON
  token_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  deleted INTEGER DEFAULT 0
);

-- rag_metadata 表
CREATE TABLE rag_metadata (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

### 7.4 RAG 演进路线

| 阶段 | 状态      | 内容                                |
| ---- | --------- | ----------------------------------- |
| R0   | ✅ 已实现 | SQLite 文档持久层                   |
| R1   | ✅ 已实现 | BM25 + jieba 中文分词               |
| R2   | 待定      | DashScope embedding + hnswlib-node  |
| R3   | 待定      | Self-Reflective RAG (CRAG/Self-RAG) |
| R4   | 待定      | 旅行知识库                          |
| R5   | 待定      | Agentic RAG                         |

> **决策**: 采用 `docs/architecture/rag-upgrade-plan.md` 的 Route B（DashScope text-embedding-v3 + hnswlib-node）作为 R2 实现路线。BM25 (R1) 保留为 hybrid 检索补充层。详见 ADR-9。

---

## 8. 3D 渲染系统

### 8.1 核心原则

> 2D 是事实源；3D 是解释。3D 消费 2D 数据，不发明数据。

### 8.2 Work Area Profiles

| 类型    | 默认范围 | 范围区间   | V1 上限 |
| ------- | -------- | ---------- | ------- |
| urban   | 600m     | 500-700m   | 2000m   |
| scenic  | 1000m    | 800-1200m  | 2000m   |
| hiking  | 2000m    | 1500-2000m | 2000m   |
| default | 800m     | —          | 2000m   |

### 8.3 生成状态机 (14 phases)

```
idle-2d
  → selecting-3d-center
  → freeze-2d
  → derive-scene-envelope
  → slab-rise
  → terrain-refine
  → water-carve
  → road-emerge
  → bridge-resolve
  → route-highlight
  → building-massing
  → building-dissolve
  → camera-overview
  → camera-route-focus-or-inspect
```

### 8.4 5 个 Toggle 状态

`enabled-2d` → `selecting-3d-center` → `loading-3d` → `enabled-3d` → `disabled-with-reason`

### 8.5 性能预算

| 指标             | 理想  | 上限   |
| ---------------- | ----- | ------ |
| slab 生成        | ≤1.5s | —      |
| 主要细节         | ≤3s   | —      |
| 长任务           | <50ms | <100ms |
| Draw calls       | <250  | <400   |
| FPS              | 45-60 | —      |
| 路线长度误差     | —     | ≤1%    |
| 路线间距 P95     | —     | ≤0.3m  |
| 建筑基底误差 P95 | —     | ≤0.25m |
| Z-fighting       | —     | ≤0.01  |

### 8.6 Debug 接口

```js
window.__threeDebug__ = {
  mode,
  phase,
  phaseProgress,
  quality,
  counts,
  camera,
  provenance,
  qa: { geometry, budgets, provenance, layers, lod }
};
```

### 8.7 视觉基线

- 7 个场景 fixture: micro-street, citywalk, river-bridge, scenic-park, hiking-terrain, old-street, landmark-pilot
- 6 个阶段捕获点: slab-rise, water-road-bridge, route-highlight, building-massing, building-dissolve, inspect
- 12 个 bounded-scene 视觉门禁
- 稳定性要求: 连续 5 次通过

---

## 9. 测试体系

### 9.1 单元测试 (Vitest)

- **39 文件, 244 测试**
- 位置: `js/__tests__/**/*.test.js` + `server/__tests__/**/*.test.js`
- 环境: node (非 jsdom), `globals: false`

### 9.2 E2E 测试 (Playwright)

- 位置: `tests/e2e/`
- 浏览器: Chromium desktop + Pixel 5 mobile
- 场景: smoke, live-provider, visual-baseline, gate50-live-review
- 视觉基线: 7 fixture × 5 preset × 5 runs = 120 checks

### 9.3 AI 导入评估

- 脚本: `scripts/evaluate-guide-import.mjs`
- 用例: 12 case, 64 地点 (`tests/fixtures/guide-import-evaluation/cases.json`)
- 指标: recall >=85%, FPR <=15%, dayAccuracy >=85%, noteKeywordCoverage >=65%, guideTypeAccuracy >=80%, forbiddenHits=0
- 命令: `npm.cmd run test:guide-import`

### 9.4 质量门禁脚本

| 脚本                              | 用途                                 |
| --------------------------------- | ------------------------------------ |
| `audit-render-imports.mjs`        | 验证 render 模块不 import api/server |
| `check-landmark-assets.mjs`       | 验证地标资产                         |
| `check-provenance.mjs`            | 验证场景 fixture provenance          |
| `check-quality-ledger.mjs`        | 验证质量门禁一致性                   |
| `check-gate50-evidence.mjs`       | 检查 Gate 50 证据                    |
| `check-visible-text-encoding.mjs` | 扫描乱码/编码问题                    |

### 9.5 CI (GitHub Actions)

- Matrix: Node 18 + Node 22
- Steps: checkout → setup Node → npm ci → format check → lint → audit → test → guide import eval
- Live provider 测试: opt-in (`LIVE_PROVIDER=1`)，不阻塞默认 CI

---

## 10. 部署

### 10.1 Docker

```dockerfile
# multi-stage: node:22-slim
# Build stage: python3 make g++ (native 编译 better-sqlite3)
# Runtime stage: copy node_modules + 源码
# CMD: node server/index.js
```

### 10.2 生产环境变量

必需: `AMAP_JS_KEY`, `AMAP_JSCODE`, `AMAP_WEB_SERVICE_KEY`
可选: `DEEPSEEK_API_KEY`, `DEEPSEEK_TIMEOUT_MS`, `ALLOWED_ORIGINS`, RAG 相关

### 10.3 健康检查

- `GET /healthz` → 200/ok（活性）
- `GET /readyz` → 200/ready（就绪，含 RAG 状态）

### 10.4 发布门禁

1. `npm.cmd run check && npm.cmd run lint && npm.cmd test`
2. `npm.cmd run test:e2e`
3. 健康探针通过
4. 地图/POI/路线/3D/分享功能验证
5. 浏览器密钥扫描（无泄露）
6. 3D 视觉基线通过
7. Canary: 15 分钟观察，就绪后切流

### 10.5 回滚

切回前一版本，不做原地修改。

---

## 11. 目录结构

```
travel_with_me/
├── server/
│   ├── index.js              # Hono BFF (单文件)
│   ├── prompts/
│   │   └── guide-extract.md  # DeepSeek prompt 模板
│   ├── rag/                  # RAG R0-R1 实现
│   │   ├── db.js
│   │   ├── store.js
│   │   ├── tokenizer.js
│   │   ├── bm25.js
│   │   └── retrieve.js
│   └── __tests__/            # 服务端测试
├── js/
│   ├── main.js               # 应用入口 + 业务编排
│   ├── state.js              # 单一状态源
│   ├── storage.js             # localStorage 持久化
│   ├── guide-import-flow.js   # AI 导入纯函数
│   ├── guide-import-cleanup.js
│   ├── api/                  # 前端 API 客户端
│   ├── render/               # 渲染器 (2D/3D/Modal)
│   └── __tests__/           # 前端单元测试
├── css/
├── scripts/                  # 构建/CI/QA 脚本
├── tests/
│   ├── e2e/                  # Playwright E2E
│   ├── fixtures/             # 测试数据
│   └── visual/               # 视觉测试资源
├── docs/                     # 辅助文档（见下）
├── DEVELOPMENT.md            # 本文件 — 唯一权威开发文档
├── ARCHITECTURE.md           # 辅助: ADR 详情
├── README.md                 # 辅助: 项目概览
├── TODO.md                   # 辅助: 活跃 backlog
├── CHANGELOG.md              # 辅助: 版本历史
├── CONTRIBUTING.md           # 辅助: 贡献指南
├── AGENTS.md                 # 辅助: Codex 工作流
├── package.json
├── vitest.config.js
├── eslint.config.js
├── playwright.config.js
├── Dockerfile
└── .env.example
```

---

## 12. 辅助文件索引

以下文件均为**辅助文件**，仅作补充参考。如有冲突，以本文件为准。

### 根级辅助文件

| 文件              | 内容                         | 备注               |
| ----------------- | ---------------------------- | ------------------ |
| `README.md`       | 项目概览、部署说明           | 测试计数可能 stale |
| `ARCHITECTURE.md` | ADR 详情、依赖图、数据模型   | ADR-1 至 ADR-8     |
| `AGENTS.md`       | Codex 工作流规则             | —                  |
| `CHANGELOG.md`    | 版本历史 v0.1.0-v0.3.0       | —                  |
| `CONTRIBUTING.md` | 贡献指南、提交规范           | 测试计数可能 stale |
| `TODO.md`         | 活跃 backlog、Gate 50 待验收 | —                  |

### docs/ 辅助文件

| 文件                                                     | 内容                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `docs/README.md`                                         | 文档索引                                                                    |
| `docs/architecture/2d-data-foundation.md`                | 2D 数据契约（5 canonical records）                                          |
| `docs/architecture/rag-upgrade-plan.md`                  | RAG 升级提案（P0-P4, DashScope embedding）— 注意: 与已实现 R0-R1 是不同路线 |
| `docs/architecture/3d/assets-landcover-and-landmarks.md` | 3D 资产契约                                                                 |
| `docs/architecture/3d/deep-research-integration.md`      | 3D 技术决策权威文档                                                         |
| `docs/architecture/3d/generation-process-alignment.md`   | 3D 生成状态机                                                               |
| `docs/architecture/3d/top-down-execution-roadmap.md`     | 3D 执行路线图 (P0-P6)                                                       |
| `docs/architecture/3d/visual-baseline-spec.md`           | 3D 视觉基线                                                                 |
| `docs/design/ui-visual-style-guide.md`                   | UI 视觉风格                                                                 |
| `docs/engineering/api.md`                                | BFF API 详细参考                                                            |
| `docs/engineering/development-workflow.md`               | 开发工作流详情                                                              |
| `docs/engineering/qa/debug-contract.md`                  | 3D debug QA schema                                                          |
| `docs/engineering/qa/gate50-manual-review.md`            | Gate 50 验收流程                                                            |
| `docs/engineering/qa/visual-baseline.md`                 | 视觉基线计划                                                                |
| `docs/engineering/testing/live-provider.md`              | Live provider 测试策略                                                      |
| `docs/operations/quality-gate-status.md`                 | 质量门禁状态                                                                |
| `docs/operations/release-playbook.md`                    | 发布流程                                                                    |
| `docs/product/architecture-blueprint.md`                 | 产品定义                                                                    |
| `docs/product/commercialization.md`                      | 商业化策略                                                                  |
| `docs/product/guide-import-evaluation.md`                | AI 导入评估方法                                                             |

---

## 13. 关键注意事项

1. **必须用 `npm.cmd`**：npm 有 install-scripts blocking，`npm` 命令无法正常安装 native 模块
2. **native 模块**: `better-sqlite3` 需要 `npm install-scripts approve` + `npm rebuild`
3. **`@node-rs/jieba`**: 导出 `Jieba` 类（不是独立函数），需 `new Jieba()` 实例化，调用 `jieba.cutForSearch(text, true)`
4. **测试计数**: 当前基线 39 文件 / 244 测试（README.md 和 CONTRIBUTING.md 已同步）
5. **Gate 50**: 50/50 complete，人工视觉验收已于 2026-07-17 通过
6. **RAG 冷启动**: docCount < 3 时不启用检索，新部署需要先导入 3 篇以上攻略
7. **无构建步骤**: 浏览器直接加载 ES Modules，版本更新靠 URL query param (`?v=...`)
8. **Docker**: alpine → slim multi-stage（因 better-sqlite3 需要 glibc + native 编译）
