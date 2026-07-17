# RAG 升级方案：从一次性提取到知识增强旅行规划

> **辅助文件** | 权威开发文档: [DEVELOPMENT.md](../../DEVELOPMENT.md)

> **状态**：提案（待评审）
> **日期**：2026-07-16
> **关联**：[ARCHITECTURE.md](../../ARCHITECTURE.md) · [产品与架构总纲](../product/architecture-blueprint.md) · [BFF 接口契约](../engineering/api.md)
> **审计基础**：项目代码只读审计 + 2025-2026 行业 RAG 调研

---

## 1. 执行摘要

Travel With Me 当前有一条 AI 链路——DeepSeek 一次性攻略提取。攻略文本提取后即丢弃，POI 匹配依赖字符重叠启发式（非语义），无任何 RAG / 向量检索 / 知识库基础设施。

本方案分 5 个阶段引入 RAG 能力，每阶段独立可交付、可回滚：

| 阶段   | 目标               | 核心交付                              | 复杂度 |
| ------ | ------------------ | ------------------------------------- | ------ |
| **P0** | Embedding 基础设施 | BFF 内嵌 embedding 代理 + 向量存储    | 低     |
| **P1** | 攻略知识库         | 攻略文本持久化 + 分块 + 索引 + 检索   | 中     |
| **P2** | 语义 POI 匹配      | 用 embedding 相似度替换字符重叠启发式 | 中     |
| **P3** | RAG 增强提取       | 提取前检索已有知识，多攻略交叉补充    | 高     |
| **P4** | Agentic RAG        | 自反思检索 + 多源编排 + 上下文评估    | 高     |

**核心原则**：不引入 LangChain / LlamaIndex 等重框架，不自建独立向量数据库服务。RAG 管道以轻量自定义模块形式内嵌于现有 Hono BFF，与项目「最小依赖、无构建步骤」哲学一致。

---

## 2. 现状评估

### 2.1 当前 AI 链路（唯一 LLM 集成）

```
用户粘贴攻略文本 (50-5000字符)
  → POST /_ai/extract-guide (server/index.js:199-307)
  → DeepSeek API (deepseek-v4-flash, JSON output, temp=0.2, max_tokens=4096)
  → Prompt: server/prompts/guide-extract.md (272行中文prompt + few-shot)
  → LLM 提取: { guide_type, city, events[{place_name, day, time_slot, note, source_quote}] }
  → 客户端确定性清洗 (guide-import-cleanup.js): 过滤噪声、去重
  → 客户端路线提取 (guide-import-flow.js): extractMainRoutePlan() 正则解析
  → POI 匹配 3层 (guide-import-flow.js, matchGuidePlace()):
      L1: 地名+城市搜索, 字符相似度 ≥ 0.55
      L2: 地名+note关键词扩展搜索, 相似度 ≥ 0.4
      L3: AMap Geocoder + nearby enrichment (兜底)
  → 用户预览确认 → 创建 trip 写入 localStorage
```

### 2.2 关键差距

| 维度           | 现状                                                            | 差距                                                                    |
| -------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **文档持久化** | 攻略文本提取后丢弃                                              | 无法回溯、无法跨攻略查询                                                |
| **POI 匹配**   | `similarityScore()` 字符重叠启发式 (`guide-import-flow.js:351`) | "便宜坊" vs "便宜坊烤鸭(王府井店)" 靠子串包含+0.4加分，无法处理语义近似 |
| **知识积累**   | 每次导入独立、无记忆                                            | 同城市多次导入无法交叉补充                                              |
| **检索能力**   | 无                                                              | 无法按语义查询已有旅行知识                                              |
| **上下文增强** | 提取 prompt 静态、无检索增强                                    | LLM 不知道用户已有的旅行经验                                            |
| **向量存储**   | 无                                                              | —                                                                       |
| **Embedding**  | 无                                                              | —                                                                       |
| **分块**       | 无                                                              | —                                                                       |

### 2.3 架构约束（必须遵守）

来自 [ARCHITECTURE.md](../../ARCHITECTURE.md) 和 [AGENTS.md](../../AGENTS.md)：

1. **ADR-1**: Hono + 原生 ES Modules，不引入 Next.js / 构建工具
2. **ADR-2**: localStorage 优先，计划后续升级——RAG 知识库可作为升级契机
3. **ADR-5**: BFF 代理隔离安全密钥——embedding API key 也必须在服务端
4. **ESLint 规则**: render 模块不可 import api/server——RAG 前端 UI 也需遵守
5. **单向依赖**: `main.js → {state, render, api} → {utils, config, data}`
6. **最小依赖**: 当前仅 4 个 runtime 依赖（hono, @hono/node-server, console-log-json, three）
7. **测试文化**: 34 文件 170 测试 + E2E + AI 评估——RAG 必须配套测试

---

## 3. 目标架构

### 3.1 架构全景

```
Browser (不变: 原生 ES Modules)
  ├── guide-import-modal.js → POST /_ai/extract-guide (现有, 增强)
  ├── guide-import-modal.js → POST /_ai/enhance-extract (新: RAG 增强提取)
  ├── knowledge-panel.js (新: 知识库面板) → /_kb/* (新)
  └── api/knowledge.js (新: 知识库 API 客户端)

BFF (server/index.js 拆分为模块)
  ├── 现有路由 (不变): static, /_AMapService, /_AMapTile, /_elevation, /_geo-assets, /_ai/extract-guide
  │
  ├── server/rag/ (新: RAG 管道模块)
  │   ├── embedding.js      — Embedding API 客户端 (代理+缓存)
  │   ├── chunker.js         — 文档分块策略 (按段落/语义)
  │   ├── vector-store.js    — 向量存储 (hnswlib, 文件持久化)
  │   ├── retriever.js       — 检索 + 重排序
  │   └── pipeline.js        — RAG 编排 (索引/检索/增强)
  │
  ├── server/kb/ (新: 知识库管理)
  │   ├── store.js           — 知识库持久化 (SQLite/JSON)
  │   ├── index.js            — 知识库 API 路由
  │   └── migrate.js          — localStorage → 服务端知识库迁移
  │
  └── 新路由:
      ├── POST /_ai/embed        — Embedding 代理 (内部调用, 不暴露)
      ├── GET  /_kb/search       — 语义搜索已有知识
      ├── POST /_kb/guides       — 存储攻略原文
      ├── GET  /_kb/guides       — 列出已存储攻略
      ├── DELETE /_kb/guides/:id — 删除攻略
      └── POST /_ai/enhance-extract — RAG 增强提取 (检索+生成)
```

### 3.2 数据流

#### 索引流（攻略导入时）

```
用户粘贴攻略文本
  → POST /_ai/extract-guide (现有提取)
  → 同时: POST /_kb/guides (存储原文)
      → chunker.split(text, strategy='paragraph') → chunks[]
      → embedding.embedBatch(chunks) → vectors[]
      → vector-store.upsert(chunks, vectors, metadata={guideId, city, tripId})
      → store.saveGuide({id, text, city, extractedData, createdAt})
```

#### 检索流（语义搜索时）

```
用户搜索 "颐和园附近有什么好吃的"
  → GET /_kb/search?q=...&city=北京
      → embedding.embed(query) → queryVector
      → vector-store.search(queryVector, topK=10, filter={city:'北京'})
      → retriever.rerank(query, results) → topN
      → 返回 {chunks, scores, guideMetadata}
```

#### RAG 增强提取流（P3 阶段）

```
用户粘贴新攻略 "北京三日游..."
  → POST /_ai/enhance-extract
      → Step 1: 检索已有知识
          embedding.embed(攻略摘要) → 检索同城市已有攻略 chunks
      → Step 2: 构建增强 prompt
          原始 prompt + retrieved_context + user_text
      → Step 3: DeepSeek 提取
          → 增强后的结构化提取 (可交叉补充已有知识)
      → Step 4: 评估检索质量 (P4: Self-Reflective)
          if 检索相关性 < 阈值: 重写查询、重新检索
      → Step 5: 索引新攻略
```

### 3.3 技术选型

#### Embedding 提供方

| 选项          | 模型                 | 优势                                | 劣势                   | 推荐度     |
| ------------- | -------------------- | ----------------------------------- | ---------------------- | ---------- |
| **DashScope** | text-embedding-v3    | 中文最优、OpenAI 兼容 API、阿里生态 | 需额外 API key         | ⭐⭐⭐⭐⭐ |
| Jina AI       | jina-embeddings-v3   | 多语言、免费额度                    | 中文不如 BGE/DashScope | ⭐⭐⭐     |
| Silicon Flow  | BGE-M3 (API)         | BGE 中文优势、按量计费              | 平台较新               | ⭐⭐⭐⭐   |
| 本地 ONNX     | BGE-M3 (onnxruntime) | 无外部依赖、零成本                  | 首次加载慢、内存占用   | ⭐⭐⭐     |

**推荐**：P0-P2 使用 DashScope text-embedding-v3（与 AMap 同为中文生态，API 兼容 OpenAI 格式）。P4 评估本地 ONNX 方案降低成本。

#### 向量存储

| 选项                          | 类型                | 优势                         | 劣势                           | 推荐度   |
| ----------------------------- | ------------------- | ---------------------------- | ------------------------------ | -------- |
| **hnswlib**                   | 进程内 + 文件持久化 | 零外部服务、轻量、高性能     | 无持久化查询、无 metadata 过滤 | ⭐⭐⭐⭐ |
| **better-sqlite3 + 手写余弦** | SQLite 扩展         | 支持 SQL metadata 过滤、成熟 | 大规模性能差                   | ⭐⭐⭐   |
| **sqlite-vec**                | SQLite 向量扩展     | SQL + 向量混合查询           | 需原生编译                     | ⭐⭐⭐⭐ |
| Chroma                        | 独立服务            | 功能丰富                     | Python 生态、需独立进程        | ⭐⭐     |
| Qdrant                        | 独立服务            | 生产级、支持过滤             | 需独立部署                     | ⭐⭐⭐   |

**推荐**：P0-P1 使用 hnswlib（进程内、文件持久化、零外部服务）。P2+ 评估迁移到 sqlite-vec 支持 metadata 过滤。

#### 不引入的框架

| 框架       | 不引入原因                         |
| ---------- | ---------------------------------- |
| LangChain  | 抽象层过重、与项目最小依赖哲学冲突 |
| LlamaIndex | 同上；TS 版本不如 Python 成熟      |
| LangGraph  | 状态机编排可以自建轻量版           |

**理由**：项目当前仅 4 个 runtime 依赖，RAG 管道逻辑不复杂，自定义模块更可控、可测试、可审计。

---

## 4. 分阶段实施

### P0: Embedding 基础设施（1-2 周）

**目标**：在 BFF 内建立 embedding + 向量存储基础能力，不改变任何现有功能。

#### 新增文件

```
server/rag/
  ├── embedding.js       — Embedding API 客户端
  ├── vector-store.js    — hnswlib 向量存储封装
  └── chunker.js          — 基础文本分块

server/rag/__tests__/
  ├── embedding.test.js
  ├── vector-store.test.js
  └── chunker.test.js
```

#### 核心模块设计

**`server/rag/embedding.js`**

```javascript
// 职责：代理 embedding API，内置缓存和批处理
// 接口：
//   embed(text: string) → Promise<Float32Array>
//   embedBatch(texts: string[]) → Promise<Float32Array[]>
//   getDimension() → number  (e.g. 1024 for text-embedding-v3)
// 配置：
//   EMBEDDING_API_KEY  (环境变量, 服务端)
//   EMBEDDING_MODEL = 'text-embedding-v3'
//   EMBEDDING_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings'
// 缓存：内存 LRU (key=sha256(text), max=1000 entries)
```

**`server/rag/vector-store.js`**

```javascript
// 职责：hnswlib 封装，支持文件持久化
// 接口：
//   upsert(id: string, vector: Float32Array, metadata: object) → void
//   search(vector: Float32Array, topK: number, filter?: object) → Array<{id, score, metadata}>
//   remove(id: string) → void
//   save() / load() — 文件持久化到 data/vector-index.bin
// 配置：
//   VECTOR_INDEX_PATH = 'data/vector-index.bin'
//   VECTOR_DIMENSION = 1024
//   VECTOR_MAX_ELEMENTS = 10000
//   VECTOR_M = 16  (hnswlib 参数)
//   VECTOR_EF_CONSTRUCTION = 200
//   VECTOR_EF_SEARCH = 50
```

**`server/rag/chunker.js`**

```javascript
// 职责：文本分块策略
// 接口：
//   split(text: string, options: {strategy, maxTokens, overlap}) → Array<{text, start, end}>
// 策略：
//   'paragraph'  — 按段落分割 (默认, 适合攻略)
//   'sentence'   — 按句子分割
//   'fixed'      — 固定长度 (回退)
// 参数：
//   maxTokens = 256  (单块上限)
//   overlap = 32     (块间重叠, 保持上下文连贯)
// 中文处理：按。！？\n 分句，合并过短段落
```

#### 依赖变更

```jsonc
// package.json dependencies 新增
{
  "hnswlib-node": "^3.0.0" // ~2MB, 原生绑定, 支持 Node 18+
}
```

#### 环境变量新增

```bash
# .env.example 新增
EMBEDDING_API_KEY=          # DashScope API key
EMBEDDING_MODEL=text-embedding-v3
EMBEDDING_ENDPOINT=https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings
EMBEDDING_TIMEOUT_MS=30000
VECTOR_INDEX_PATH=data/vector-index.bin
VECTOR_MAX_ELEMENTS=10000
```

#### 验收标准

- [ ] `embedding.embed("测试文本")` 返回正确维度的向量
- [ ] `vector-store.upsert()` + `search()` 往返一致
- [ ] `chunker.split()` 正确分割中文段落
- [ ] 向量索引文件持久化后重启可加载
- [ ] 单元测试覆盖 ≥ 90%
- [ ] 不影响现有功能（全量测试通过）

---

### P1: 攻略知识库（2-3 周）

**目标**：攻略文本不再丢弃——持久化、分块、索引、可检索。

#### 新增文件

```
server/kb/
  ├── store.js            — 知识库持久化 (JSON 文件或 SQLite)
  ├── index.js            — 知识库 API 路由 (注册到 Hono app)
  └── migrate.js          — localStorage 攻略数据迁移工具

server/rag/
  └── pipeline.js         — RAG 编排 (索引/检索)

js/api/
  └── knowledge.js        — 前端知识库 API 客户端

js/render/
  └── knowledge-panel.js  — 知识库面板 UI (侧边栏/模态框)

server/kb/__tests__/
  ├── store.test.js
  ├── pipeline.test.js
  └── index.test.js
```

#### 知识库数据模型

```javascript
// server/kb/store.js

// Guide (已存储攻略)
{
  id: string,              // UUID
  title: string,           // 用户命名或自动提取
  rawText: string,         // 原始攻略文本
  city: string,            // 关联城市
  guideType: string,        // 提取的攻略类型
  extractedData: object,   // DeepSeek 提取的结构化数据
  chunkIds: string[],       // 关联的分块 ID
  tripId: string | null,    // 关联的 trip (如有)
  createdAt: number,
  updatedAt: number
}

// Chunk (文本分块)
{
  id: string,
  guideId: string,          // 所属攻略
  text: string,             // 分块文本
  vector: Float32Array,     // embedding 向量 (仅在内存/索引中)
  start: number,            // 在原文中的起始位置
  end: number,              // 在原文中的结束位置
  metadata: {
    city: string,
    guideType: string,
    dayNumber: number | null,  // 如果分块属于某天
    placeNames: string[]        // 分块中提到的地名
  }
}
```

#### API 路由设计

```javascript
// server/kb/index.js — 注册到主 Hono app

// 存储攻略（提取时自动调用）
POST /_kb/guides
  Body: { text, cityHint, extractedData?, tripId? }
  → 分块 → embedding → 向量索引 → 持久化
  → 返回 { guideId, chunkCount }

// 列出已存储攻略
GET /_kb/guides?city=北京&page=1&limit=20
  → 返回 { guides: [{id, title, city, createdAt, chunkCount}], total }

// 获取单个攻略详情
GET /_kb/guides/:id
  → 返回 { id, title, rawText, city, extractedData, chunks }

// 删除攻略（同时删除向量索引）
DELETE /_kb/guides/:id
  → 返回 { deleted: true }

// 语义搜索
GET /_kb/search?q=颐和园附近美食&city=北京&topK=10
  → 返回 {
      query: string,
      results: [{
        chunkId, guideId, text, score,
        metadata: { city, guideType, placeNames },
        guideTitle: string
      }],
      total: number
    }

// 知识库统计
GET /_kb/stats
  → 返回 { totalGuides, totalChunks, cities: [{city, count}] }
```

#### 前端集成

**`js/render/knowledge-panel.js`**

- 侧边栏新增「知识库」标签页
- 攻略列表（按城市分组）
- 语义搜索框 + 结果展示
- 点击搜索结果可跳转到关联的 trip
- 攻略详情查看（原文 + 分块高亮）

**`js/api/knowledge.js`**

```javascript
// 前端 API 客户端 (遵循 js/api/ 现有模式)
export async function searchKnowledge(query, city, topK = 10) { ... }
export async function listGuides(city, page, limit) { ... }
export async function getGuide(id) { ... }
export async function deleteGuide(id) { ... }
export async function getStats() { ... }
```

#### 攻略导入流程变更

```
现有: extract-guide → 预览 → 创建 trip
增强: extract-guide → 预览 → 创建 trip
                          ↘ 同时: POST /_kb/guides (存储+索引)
```

存储是**异步旁路**操作——不阻塞 trip 创建，失败不影响主流程。

#### 持久化选择

P1 阶段使用 **JSON 文件**（与 localStorage 哲学一致）：

```
data/
  ├── vector-index.bin     — hnswlib 向量索引
  ├── guides.json          — 攻略元数据 + 分块文本
  └── guide-counter.txt    — 自增 ID
```

P2+ 评估迁移到 SQLite（better-sqlite3）支持高效查询和事务。

#### 验收标准

- [ ] 攻略导入后自动存储+索引（异步，不阻塞主流程）
- [ ] 语义搜索可跨攻略检索相关段落
- [ ] 搜索结果含来源攻略标识和关联 trip
- [ ] 删除攻略同时清理向量索引
- [ ] 知识库面板 UI 可用
- [ ] 数据文件持久化，重启不丢失
- [ ] 单元测试 + E2E 测试通过
- [ ] AI 评估脚本扩展：测试检索 recall@10 ≥ 80%

---

### P2: 语义 POI 匹配（2 周）

**目标**：用 embedding 向量相似度替换 `similarityScore()` 字符重叠启发式，提升 POI 匹配准确率。

#### 变更范围

**修改文件**：

- `js/guide-import-flow.js` — `matchGuidePlace()` 增加 embedding 相似度层
- `js/api/guide-import.js` — 新增 `POST /_ai/match-poi` 调用
- `server/index.js` — 新增 `POST /_ai/match-poi` 路由

**新增文件**：

- `server/rag/poi-matcher.js` — POI 语义匹配逻辑
- `server/rag/__tests__/poi-matcher.test.js`

#### 匹配策略升级

```
现有 3 层降级链:
  L1: placeName + city → AMap搜索 → similarityScore(name, placeName) ≥ 0.55
  L2: placeName + note关键词 → AMap搜索 → similarityScore ≥ 0.4
  L3: AMap Geocoder + nearby enrichment (兜底)

新增 Layer 1.5 (在 L1 和 L2 之间):
  L1: AMap搜索 → similarityScore ≥ 0.55 (保持, 快速命中)
  L1.5 (新): 如果 L1 未命中 → embedding相似度(placeName, candidates) ≥ 0.75
      → 语义命中: "便宜坊" ↔ "便宜坊烤鸭(王府井店)" (语义相似但字符重叠低)
  L2: note关键词扩展 (保持, 作为补充)
  L3: Geocoder兜底 (保持)
```

#### API 设计

```javascript
// POST /_ai/match-poi (BFF 内部调用)
// Body: { placeName, city, candidates: [{name, ...amapPOI}] }
// → embedding.embedBatch([placeName, ...candidates.map(c => c.name)])
// → cosine similarity 排序
// → 返回 { bestMatch, score, allScores }

// 也可用于前端:
// 前端获取 AMap POI 列表后, 调用 /_ai/match-poi 做语义排序
```

#### 兼容策略

- **降级**：如果 embedding API 不可用，回退到现有 `similarityScore()`
- **缓存**：同一 `placeName + candidates` 组合缓存 embedding 结果
- **批处理**：一次攻略导入的所有 placeName 批量 embedding，减少 API 调用

#### 验收标准

- [ ] 语义匹配准确率 ≥ 现有字符匹配（在评估集上对比）
- [ ] embedding API 不可用时自动降级到字符匹配
- [ ] 评估集扩展：新增 20 个「字符低重叠但语义相同」的测试用例
- [ ] `npm run test:guide-import` recall 提升 ≥ 3%
- [ ] 延迟增加 ≤ 500ms（embedding 批处理 + 缓存）
- [ ] 全量测试通过

---

### P3: RAG 增强提取（3-4 周）

**目标**：DeepSeek 提取前先检索已有知识，实现多攻略交叉补充和上下文增强。

#### 新增文件

```
server/rag/
  ├── retriever.js        — 检索 + 重排序
  ├── prompt-builder.js   — RAG prompt 构建
  └── enhance-pipeline.js — 增强提取编排

server/prompts/
  └── guide-extract-enhanced.md  — 增强版提取 prompt (含检索上下文)

js/api/
  └── guide-import.js     — 修改: 新增 enhanceExtract() 方法
```

#### RAG 增强提取流程

```
用户粘贴新攻略 "北京三日游..."
  → POST /_ai/enhance-extract
      │
      ├─ Step 1: 快速预提取 (现有流程)
      │   → DeepSeek 提取 { city, events, guideType }
      │   → 识别城市
      │
      ├─ Step 2: 检索已有知识
      │   → 用攻略摘要生成 embedding 查询
      │   → vector-store.search(queryVector, topK=5, filter={city})
      │   → retriever.rerank(query, results)  — 按相关性重排序
      │   → 过滤: score ≥ 0.6 的 chunks
      │
      ├─ Step 3: 构建增强 prompt
      │   → 原始 guide-extract prompt
      │   + 「以下是你之前见过的同城市攻略片段，可参考但不强制：」
      │   + retrieved chunks (top 3-5)
      │   + 用户的新攻略文本
      │
      ├─ Step 4: DeepSeek 二次提取
      │   → 增强后的结构化提取
      │   → 可补充: 之前攻略提到的地点但新攻略未提及
      │   → 标记: 新增 vs 交叉验证
      │
      └─ Step 5: 索引新攻略
          → 将新攻略存入知识库
```

#### 增强策略

| 场景              | 策略                                             |
| ----------------- | ------------------------------------------------ |
| 首次导入某城市    | 无检索增强，等同现有流程                         |
| 第二次导入同城市  | 检索上次攻略，交叉补充遗漏地点                   |
| 第三次+导入同城市 | 检索 top 5 相关片段，多攻略综合                  |
| 攻略质量评估      | 检索结果可提示「这个地点在之前的攻略中也提到过」 |

#### Prompt 模板变更

```markdown
<!-- server/prompts/guide-extract-enhanced.md -->

{现有 prompt 内容}

---

## 参考知识（可选）

以下是你之前处理过的同城市攻略片段，可参考但不强制：

{retrieved_chunks}

注意：参考知识仅用于补充你的理解，不要直接复制参考内容中的地点到输出中。
只提取用户当前攻略文本中明确提到的信息。

---

{现有 prompt 结尾}
```

#### 验收标准

- [ ] 增强提取的 recall 比基线提升 ≥ 5%（在评估集上）
- [ ] 检索的上下文不影响提取的精确率（FPR 不升高）
- [ ] 首次导入某城市时自动降级为无 RAG 模式
- [ ] 延迟增加 ≤ 2s（检索 + embedding + 增强提取）
- [ ] 检索结果在预览页可见（用户可查看参考了哪些知识）
- [ ] 评估脚本扩展：新增「多攻略交叉」测试场景

---

### P4: Agentic RAG（4-6 周）

**目标**：引入自反思检索、多源编排、上下文质量评估。

#### 新增文件

```
server/rag/
  ├── agent.js            — RAG Agent 编排器 (状态机)
  ├── query-rewriter.js   — 查询重写 (LLM 辅助)
  ├── context-grader.js    — 检索结果质量评分
  └── source-router.js     — 多源路由 (知识库/AMap/Web)

server/prompts/
  ├── query-rewrite.md     — 查询重写 prompt
  ├── context-grade.md     — 上下文评分 prompt
  └── synthesize.md        — 综合回答 prompt

js/render/
  └── travel-assistant.js  — 旅行助手对话 UI
```

#### Agent 状态机

```
用户查询 (自然语言)
  │
  ▼
[Query Analysis] ──→ 识别意图: POI搜索/路线建议/知识查询/综合规划
  │
  ├─ 意图: 知识查询 ──→ [Retrieve from KB]
  │                       │
  │                       ▼
  │                   [Grade Context] ──→ 相关性 ≥ 0.7?
  │                       │                    │
  │                       │ No                 │ Yes
  │                       ▼                    ▼
  │                   [Rewrite Query]     [Generate Answer]
  │                       │                    │
  │                       ▼                    ▼
  │                   [Re-retrieve] ←──── [Return to User]
  │                       │
  │                       ▼ (max 2 retries)
  │                   [Fallback: Web Search or AMap]
  │
  ├─ 意图: POI搜索 ──→ [AMap Search] ──→ [Semantic Rerank] ──→ [Return]
  │
  └─ 意图: 综合规划 ──→ [Multi-source]
                          ├─ KB retrieve (已有攻略)
                          ├─ AMap search (POI/路线)
                          ├─ Elevation (地形)
                          └─ [Synthesize] ──→ [Return]
```

#### 旅行助手对话 UI

```
用户: "我计划国庆去北京，之前去过故宫和长城，这次想去点小众的"

Agent 执行:
  1. 分析意图: 综合规划 + 个性化推荐
  2. 检索 KB: "北京 小众" → 找到用户之前存储的攻略片段
  3. 检索 KB: "北京 国庆" → 找到季节相关信息
  4. AMap搜索: "北京 小众景点" → POI列表
  5. 语义重排: embedding(用户偏好) vs POI列表
  6. 综合生成: DeepSeek 综合所有信息生成推荐
  7. 返回: 推荐地点列表 + 来源说明 + 一键导入 trip
```

#### MCP 集成（未来选项）

P4 可选引入 MCP (Model Context Protocol) 标准化工具接入：

```javascript
// 将现有 BFF 能力暴露为 MCP tools
const tools = [
  { name: 'search_knowledge_base', handler: kbSearch },
  { name: 'search_amap_poi', handler: amapSearch },
  { name: 'get_elevation', handler: getElevation },
  { name: 'get_geo_assets', handler: getGeoAssets },
  { name: 'create_trip', handler: createTrip },
  { name: 'search_web', handler: webSearch } // 新增
];
// Agent 通过 MCP 协议调用工具
```

#### 验收标准

- [ ] Agent 可正确识别 3+ 种查询意图
- [ ] 自反思循环最多 2 次重试，不会无限循环
- [ ] 检索质量评分准确率 ≥ 80%
- [ ] 多源综合回答覆盖知识库 + AMap + 地理数据
- [ ] 对话 UI 可用，支持流式输出
- [ ] 端到端延迟 ≤ 10s（多步推理）
- [ ] 可降级: Agent 不可用时回退到 P3 增强 RAG
- [ ] 新增评估: Agent 决策质量评估集

---

## 5. 依赖演进

### 依赖变更时间线

| 阶段 | 新增 runtime 依赖 | 新增 dev 依赖 | 总 runtime deps                                      |
| ---- | ----------------- | ------------- | ---------------------------------------------------- |
| 现状 | —                 | —             | 4 (hono, @hono/node-server, console-log-json, three) |
| P0   | `hnswlib-node`    | —             | 5                                                    |
| P1   | —                 | —             | 5                                                    |
| P2   | —                 | —             | 5                                                    |
| P3   | —                 | —             | 5                                                    |
| P4   | —                 | —             | 5                                                    |

**总新增 runtime 依赖：1 个**（hnswlib-node）。

如果 P2+ 迁移到 SQLite：

- 新增 `better-sqlite3` 或 `sqlite-vec`（+1 依赖）
- 或者使用 Node.js 内置 `node:sqlite`（Node 22+ 实验 API，无额外依赖）

### 不引入的依赖

| 依赖                        | 不引入原因                                 |
| --------------------------- | ------------------------------------------ |
| langchain / @langchain/core | 抽象层过重，项目 RAG 逻辑可自建            |
| llamaindex / llamaindex-ts  | 同上                                       |
| chromadb                    | 需 Python 运行时，不适合 Node.js BFF       |
| @pinecone-database/pg       | 云服务依赖，与 localStorage-first 哲学冲突 |
| openai (SDK)                | DashScope 兼容 OpenAI API，直接 fetch 即可 |

---

## 6. 环境变量变更

### 新增环境变量

```bash
# .env.example 新增 (P0-P4)

# ─── Embedding ───
EMBEDDING_API_KEY=                    # DashScope API key (必填, P0起)
EMBEDDING_MODEL=text-embedding-v3     # embedding 模型
EMBEDDING_ENDPOINT=https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings
EMBEDDING_TIMEOUT_MS=30000            # embedding 请求超时
EMBEDDING_CACHE_SIZE=1000              # 内存缓存条目数

# ─── Vector Store ───
VECTOR_INDEX_PATH=data/vector-index.bin  # 向量索引文件路径
VECTOR_MAX_ELEMENTS=10000                # 最大向量数
VECTOR_DIMENSION=1024                    # 向量维度 (匹配 embedding 模型)

# ─── Knowledge Base ───
KB_STORAGE_PATH=data/guides.json        # 知识库持久化路径 (P1)
KB_SEARCH_TOP_K=10                      # 默认搜索结果数
KB_SEARCH_MIN_SCORE=0.5                 # 最小相似度阈值

# ─── RAG Pipeline ───
RAG_RETRIEVE_TOP_K=5                   # RAG 检索 top K (P3)
RAG_CONTEXT_MIN_SCORE=0.6              # 上下文最小相关性 (P3)
RAG_MAX_RETRIES=2                      # 自反思最大重试 (P4)
```

### 安全边界

| 变量                | 暴露范围    | 说明                            |
| ------------------- | ----------- | ------------------------------- |
| `EMBEDDING_API_KEY` | 服务端 only | 同 `DEEPSEEK_API_KEY`，BFF 代理 |
| `VECTOR_INDEX_PATH` | 服务端 only | 文件路径，不暴露给浏览器        |
| `KB_STORAGE_PATH`   | 服务端 only | 同上                            |
| 其余                | 服务端 only | —                               |

---

## 7. 测试策略

### 7.1 单元测试

| 模块               | 测试文件                         | 关键用例                                          |
| ------------------ | -------------------------------- | ------------------------------------------------- |
| embedding.js       | `__tests__/embedding.test.js`    | API 调用、缓存命中、超时降级、维度校验            |
| vector-store.js    | `__tests__/vector-store.test.js` | upsert/search/remove、文件持久化往返、filter 过滤 |
| chunker.js         | `__tests__/chunker.test.js`      | 段落分块、句子分块、重叠窗口、中文处理            |
| kb/store.js        | `__tests__/store.test.js`        | CRUD、分块关联、迁移                              |
| rag/pipeline.js    | `__tests__/pipeline.test.js`     | 索引流程、检索流程、增强提取流程                  |
| rag/poi-matcher.js | `__tests__/poi-matcher.test.js`  | 语义匹配、降级、批处理                            |

### 7.2 评估集扩展

现有评估集: `tests/fixtures/guide-import-evaluation/cases.json` (12 用例, 64 地点)

| 阶段 | 扩展内容                                                |
| ---- | ------------------------------------------------------- |
| P1   | 新增「检索评估集」: 20 个查询 + ground truth chunks     |
| P2   | 新增 20 个「字符低重叠但语义相同」POI 匹配用例          |
| P3   | 新增「多攻略交叉」场景: 同城市 2-3 篇攻略, 验证交叉补充 |
| P4   | 新增「Agent 决策」评估: 意图识别准确率、工具选择正确率  |

### 7.3 评估指标

| 指标                 | 现有基线 | P2 目标 | P3 目标 | P4 目标         |
| -------------------- | -------- | ------- | ------- | --------------- |
| POI 匹配 recall      | ≥85%     | ≥88%    | ≥90%    | ≥92%            |
| POI 匹配 FPR         | ≤15%     | ≤12%    | ≤10%    | ≤8%             |
| 检索 recall@10       | —        | ≥80%    | ≥85%    | ≥90%            |
| 检索 precision@5     | —        | ≥70%    | ≥80%    | ≥85%            |
| 增强提取 recall      | —        | —       | ≥90%    | ≥93%            |
| Agent 意图识别准确率 | —        | —       | —       | ≥85%            |
| 端到端延迟 (P50)     | ~3s      | ~3.5s   | ~5s     | ~8s             |
| 端到端延迟 (P99)     | ~15s     | ~18s    | ~20s    | ~15s (缓存优化) |

### 7.4 E2E 测试

```
tests/e2e/
  └── knowledge-base.spec.js  (新)
      ├── 攻略导入后可在知识库中搜索
      ├── 语义搜索返回相关结果
      ├── 删除攻略后搜索无残留
      └── 知识库面板 UI 交互
```

### 7.5 质量门

| Gate   | 标准                         | 阶段   |
| ------ | ---------------------------- | ------ |
| RAG-01 | embedding 模块测试覆盖 ≥ 90% | P0     |
| RAG-02 | 向量存储往返一致性 100%      | P0     |
| RAG-03 | 攻略存储成功率 ≥ 99% (异步)  | P1     |
| RAG-04 | 检索 recall@10 ≥ 80%         | P1     |
| RAG-05 | 语义 POI 匹配 recall ≥ 88%   | P2     |
| RAG-06 | RAG 增强提取 recall ≥ 90%    | P3     |
| RAG-07 | Agent 意图识别准确率 ≥ 85%   | P4     |
| RAG-08 | 延迟增加 ≤ 预期              | 全阶段 |

---

## 8. 风险评估

### 8.1 技术风险

| 风险                                          | 概率 | 影响 | 缓解                                                    |
| --------------------------------------------- | ---- | ---- | ------------------------------------------------------- |
| hnswlib 原生编译失败 (Windows/Mac/Linux 差异) | 中   | 高   | 预验证三平台；备选: 纯 JS 实现 (如 vectra/hnswlib-wasm) |
| embedding API 限流/不可用                     | 中   | 中   | 内存缓存 + 降级到字符匹配                               |
| 向量索引文件损坏                              | 低   | 高   | 定期备份 + 启动时校验 + 重建机制                        |
| DeepSeek 上下文窗口不足 (增强 prompt 过长)    | 低   | 中   | 控制 retrieved chunks 总 token ≤ 1500                   |
| 攻略文本过长导致分块过多                      | 中   | 低   | 分块上限 + 分批 embedding                               |

### 8.2 架构风险

| 风险                                      | 概率 | 影响 | 缓解                                       |
| ----------------------------------------- | ---- | ---- | ------------------------------------------ |
| BFF 膨胀 (server/index.js 已 1126 行)     | 高   | 中   | P1 起拆分模块: server/rag/_ + server/kb/_  |
| 知识库数据与 localStorage 脱节            | 中   | 中   | 迁移工具 + 同步策略 (tripId 关联)          |
| 多用户数据隔离缺失                        | 高   | 高   | P1 单用户不处理; P3+ 预留 userId namespace |
| 前端依赖 API 可用性 (render 需要异步获取) | 低   | 低   | render 层不直接调 RAG API, 通过 state 层   |

### 8.3 运营风险

| 风险                                   | 概率 | 影响 | 缓解                                             |
| -------------------------------------- | ---- | ---- | ------------------------------------------------ |
| embedding API 成本                     | 中   | 中   | 缓存 + 批处理; P4 评估本地 ONNX                  |
| 向量索引内存占用                       | 中   | 低   | 限制 max_elements; 监控内存                      |
| 用户隐私: 攻略文本上传到 embedding API | 高   | 高   | 明确隐私声明; embedding 不存储原文; 可选关闭 RAG |

---

## 9. 与现有架构决策的关系

### ADR 对齐

| ADR                       | 对齐方式                                                                   |
| ------------------------- | -------------------------------------------------------------------------- |
| ADR-1 (Hono + ES Modules) | RAG 模块以 ES Module 形式内嵌 BFF, 无构建步骤                              |
| ADR-2 (localStorage)      | localStorage 保持不变; 知识库是新增的服务端持久化层, 不替代 localStorage   |
| ADR-4 (DeepSeek)          | DeepSeek 继续作为 LLM; 新增 embedding 提供方 (DashScope), 与 DeepSeek 解耦 |
| ADR-5 (BFF 代理隔离)      | embedding API key 服务端 only, 遵循现有安全模式                            |

### 新增 ADR 建议

| ADR    | 内容                                                          |
| ------ | ------------------------------------------------------------- |
| ADR-8  | RAG 管道以轻量自定义模块内嵌 BFF, 不引入 LangChain/LlamaIndex |
| ADR-9  | 向量存储使用进程内库 (hnswlib), 不部署独立向量数据库服务      |
| ADR-10 | 攻略知识库作为独立持久化层, 与 localStorage 并行, 不替代      |

---

## 10. 文件变更矩阵

### 新增文件

| 阶段 | 文件                                        | 用途                 |
| ---- | ------------------------------------------- | -------------------- |
| P0   | `server/rag/embedding.js`                   | Embedding API 客户端 |
| P0   | `server/rag/vector-store.js`                | hnswlib 向量存储     |
| P0   | `server/rag/chunker.js`                     | 文本分块             |
| P0   | `server/rag/__tests__/embedding.test.js`    |                      |
| P0   | `server/rag/__tests__/vector-store.test.js` |                      |
| P0   | `server/rag/__tests__/chunker.test.js`      |                      |
| P1   | `server/kb/store.js`                        | 知识库持久化         |
| P1   | `server/kb/index.js`                        | 知识库 API 路由      |
| P1   | `server/rag/pipeline.js`                    | RAG 编排             |
| P1   | `js/api/knowledge.js`                       | 前端知识库客户端     |
| P1   | `js/render/knowledge-panel.js`              | 知识库面板 UI        |
| P1   | `server/kb/__tests__/store.test.js`         |                      |
| P1   | `server/kb/__tests__/pipeline.test.js`      |                      |
| P1   | `tests/e2e/knowledge-base.spec.js`          | E2E 测试             |
| P2   | `server/rag/poi-matcher.js`                 | POI 语义匹配         |
| P2   | `server/rag/__tests__/poi-matcher.test.js`  |                      |
| P3   | `server/rag/retriever.js`                   | 检索 + 重排序        |
| P3   | `server/rag/prompt-builder.js`              | RAG prompt 构建      |
| P3   | `server/rag/enhance-pipeline.js`            | 增强提取编排         |
| P3   | `server/prompts/guide-extract-enhanced.md`  | 增强版 prompt        |
| P4   | `server/rag/agent.js`                       | RAG Agent 编排器     |
| P4   | `server/rag/query-rewriter.js`              | 查询重写             |
| P4   | `server/rag/context-grader.js`              | 上下文评分           |
| P4   | `server/rag/source-router.js`               | 多源路由             |
| P4   | `server/prompts/query-rewrite.md`           |                      |
| P4   | `server/prompts/context-grade.md`           |                      |
| P4   | `server/prompts/synthesize.md`              |                      |
| P4   | `js/render/travel-assistant.js`             | 旅行助手 UI          |

### 修改文件

| 阶段 | 文件                              | 变更                                                                |
| ---- | --------------------------------- | ------------------------------------------------------------------- |
| P0   | `package.json`                    | 新增 `hnswlib-node` 依赖                                            |
| P0   | `.env.example`                    | 新增 embedding/vector 环境变量                                      |
| P1   | `server/index.js`                 | 注册知识库路由 (`import { registerKBRoutes } from './kb/index.js'`) |
| P1   | `js/main.js`                      | 初始化知识库面板                                                    |
| P1   | `js/state.js`                     | 新增知识库搜索状态                                                  |
| P1   | `index.html`                      | 引入 knowledge-panel.js                                             |
| P2   | `js/guide-import-flow.js`         | `matchGuidePlace()` 增加 embedding 层                               |
| P2   | `js/api/guide-import.js`          | 新增 `matchPoi()` 方法                                              |
| P2   | `server/index.js`                 | 新增 `POST /_ai/match-poi` 路由                                     |
| P3   | `js/render/guide-import-modal.js` | 显示 RAG 增强选项和检索上下文                                       |
| P3   | `js/api/guide-import.js`          | 新增 `enhanceExtract()` 方法                                        |
| P3   | `server/index.js`                 | 新增 `POST /_ai/enhance-extract` 路由                               |
| P4   | `js/main.js`                      | 初始化旅行助手                                                      |
| P4   | `index.html`                      | 引入 travel-assistant.js                                            |
| P4   | `eslint.config.js`                | 确保 render 模块不直接 import server/rag                            |

### 不变文件

| 文件                              | 不变原因                                |
| --------------------------------- | --------------------------------------- |
| `js/storage.js`                   | localStorage 层不变, 知识库是独立持久化 |
| `js/state.js`                     | 核心状态不变, 知识库状态是新增附加      |
| `js/render/map.js`                | 2D 地图渲染不变                         |
| `js/render/map-3d.js`             | 3D 渲染不变                             |
| `server/prompts/guide-extract.md` | 原始 prompt 保留, 增强版是新文件        |
| `js/guide-import-cleanup.js`      | 清洗逻辑不变                            |

---

## 11. 实施建议

### 11.1 优先级排序

```
P0 (Embedding 基础) ──→ P1 (知识库) ──→ P2 (语义匹配) ──→ P3 (RAG 增强) ──→ P4 (Agentic RAG)
     必须先做              可独立交付        可独立交付         依赖 P1           依赖 P3
```

- **P0 是硬前置**：所有后续阶段依赖 embedding + 向量存储基础
- **P1 和 P2 可并行**：知识库存储和语义匹配互不依赖
- **P3 依赖 P1**：增强提取需要已有知识库可检索
- **P4 依赖 P3**：Agent 编排需要 RAG 管道已就绪

### 11.2 推荐实施路径

**路径 A（推荐）：功能驱动**

```
P0 → P2 (先做语义匹配, 立即可见效果) → P1 (再做知识库) → P3 → P4
```

- 优势：P2 见效快，用户立即可感知 POI 匹配提升
- 风险：P2 需要临时 embedding 缓存（P1 的知识库尚未就绪）

**路径 B：架构驱动**

```
P0 → P1 (先建知识库) → P2 (语义匹配) → P3 → P4
```

- 优势：架构完整，每层建立在上一层之上
- 风险：P1 见效慢，用户不可直接感知

### 11.3 回滚策略

| 阶段 | 回滚方式                           | 影响范围                   |
| ---- | ---------------------------------- | -------------------------- |
| P0   | 移除 `server/rag/` 目录 + 依赖     | 无（不影响现有功能）       |
| P1   | 移除 `server/kb/` + 前端知识库面板 | 攻略不再存储, 回到丢弃模式 |
| P2   | `matchGuidePlace()` 移除 L1.5 层   | 回到纯字符匹配             |
| P3   | 前端不调用 `enhance-extract`       | 回到原始提取流程           |
| P4   | 移除 agent 模块 + 旅行助手 UI      | 回到 P3 增强 RAG           |

**每个阶段都可以独立回滚，不影响前一阶段。**

---

## 12. 文档协作与 MCP 演进（远期）

### 12.1 当前文档状态

项目文档分散在 `docs/` 目录下（architecture, design, engineering, operations, product），无结构化检索能力。Agent 和用户只能靠文件名和目录结构导航。

### 12.2 文档 RAG 路径

```
docs/**/*.md
  → chunker.split(text, strategy='heading')  — 按标题分块
  → embedding.embedBatch(chunks)
  → vector-store.upsert(chunks, metadata={docPath, section, heading})
  → 支持自然语言查询文档: "3D 地形是怎么生成的？"
```

### 12.3 MCP 标准化

P4+ 可将 RAG 能力暴露为 MCP server，支持外部 Agent 接入：

```javascript
// MCP tools
[
  { name: 'search_travel_knowledge', description: '搜索旅行知识库' },
  { name: 'search_project_docs', description: '搜索项目文档' },
  { name: 'match_poi_semantic', description: '语义 POI 匹配' },
  { name: 'plan_route', description: '路线规划' },
  { name: 'get_elevation', description: '获取高程数据' }
];
```

这与 LlamaIndex 2026 的 MCP 支持方向一致，但实现方式是自定义轻量 MCP server 而非引入 LlamaIndex 框架。

### 12.4 OpenWiki / Wiki Memory

远期可评估：

- **OpenWiki**: 为项目生成结构化文档供 Agent 检索
- **Wiki Memory**: 跨 session 的通用旅行知识记忆

但这些属于产品层面的远期探索，不在 P0-P4 范围内。

---

## 13. 总结

| 维度      | 决策                                                |
| --------- | --------------------------------------------------- |
| RAG 框架  | 不引入 LangChain/LlamaIndex，自定义轻量管道         |
| Embedding | DashScope text-embedding-v3 (中文最优，OpenAI 兼容) |
| 向量存储  | hnswlib (进程内，文件持久化，零外部服务)            |
| 新增依赖  | 1 个 runtime (hnswlib-node)                         |
| 架构      | RAG 模块内嵌 BFF，不部署独立服务                    |
| 持久化    | 知识库与 localStorage 并行，不替代                  |
| 分阶段    | 5 阶段，每阶段独立可交付、可回滚                    |
| 测试      | 每阶段配套单元测试 + 评估集扩展 + E2E               |
| 安全      | embedding key 服务端 only，遵循 BFF 代理模式        |

**核心价值**：从「一次性提取丢弃」进化到「可积累、可检索、可增强的旅行知识引擎」，在不破坏现有架构约束的前提下，逐步引入 RAG 能力。
