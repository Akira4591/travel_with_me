# Architecture

Travel With Me 是一个中文旅行路线规划 Web App。本文档记录当前系统架构、关键架构决策和设计原则。产品方向、阶段口径和 2D/3D 同源边界以 [产品与架构总纲](docs/product-architecture-blueprint.md) 为准。

文档边界：

- 产品方向、交付阶段和文档职责见 `docs/product-architecture-blueprint.md`。
- 商业化缺口、方案取舍和阶段路线见 `commercialization-solutions.md`。
- 近期执行 backlog 见 `TODO.md`。
- BFF 接口契约见 `docs/api.md`。
- 3D 技术路线、状态机和质量门禁见 `docs/3d-deep-research-integration.md` 与 `docs/3d-top-down-execution-roadmap.md`。

本文档只回答：系统如何组织、为什么这样组织、哪些架构约束必须遵守。

## 技术栈

```
Node.js 18+ / Hono v4
  └─ BFF 层：静态托管 + 高德代理 + AI 中转

Browser
  ├─ 原生 ES Modules（无构建工具）
  ├─ 高德 JS API 2.0
  ├─ localStorage 持久化
  ├─ Three.js 3D planning diorama
  └─ Canvas 分享长图生成
```

## 数据模型

```
Workspace
  ├─ trips: Trip[]          (最多 3 条)
  └─ activeTripId: string

Trip
  ├─ id, title, subtitle, city
  ├─ locations: { [id]: Location }   地点主表
  ├─ days: Day[]                     按序排列
  ├─ unscheduled: Event[]            未排期事件池
  └─ annotations: Annotation[]       3D/地图功能标记

Day
  ├─ id, title
  └─ events: Event[]

Event
  ├─ id, title, icon, timeSlot, note
  ├─ locationId  (→ Location)
  └─ routeToNext? (→ RouteConfig)

Annotation
  ├─ id, type, title, note, createdAt
  ├─ lnglat
  └─ elevation?
```

详细 JSDoc typedef 见 `js/data/trip.js`。

## 核心链路

### 启动流程

```
boot()
  ├─ loadWorkspace() → localStorage
  ├─ readSharedTripFromURL() → #trip= hash
  ├─ initWorkspace() → state.js 初始化
  ├─ renderAll() → 渲染 UI 骨架
  ├─ loadAMap() → 加载高德 SDK
  ├─ initMap() → 创建地图实例
  ├─ resolveAllLocations() → 后台校准坐标
  └─ selectDay() → 显示 markers / 规划路线
```

### 添加地点

```
openAddLocationFlow()
  → openSearchModal({ onSearch, onNearbySearch, onConfirm })
  → searchPlaces() / runNearbySearch()
  → 用户选择 POI + 填写事件信息
  → addLocation() + addEventToDay()
  → emit('trip:changed') → handleTripChanged()
    → renderItinerary() + persistWorkspace()
```

### 路线规划

```
selectDay(dayId)
  → scheduleRoutePlanning(day)
    → buildRouteSegments(day) → 构造 segments
    → planRoutesForDay(day, segments, serial)
      → searchAutoSegment(segment)
        → 步行试算 ≤30min → 步行
        → transit vs driving 比较
        → 估算兜底（Haversine）
      → drawRoutePaths() + updateRouteCard()
```

### AI 导入

```
用户粘贴攻略
  → fetch('/_ai/extract-guide') → DeepSeek 提取
  → extractMainRoutePlan() → 前端清洗主路线
  → 逐地点匹配（L1→L2→L3+enrich）
  → 预览确认 → importGuideDraft()
  → createTrip() + 写入 events + 写入 unscheduled
```

### 分享长图

```
buildTripShareImage(trip, { includeRoutes })
  → measureLayout() → 计算画布总高
  → Canvas 分区绘制：
    品牌条 → 标题 → 统计 → 地图瓦片 → 各日时间轴 → 结尾
  → toDataURL('image/png')
  → 用户下载/复制
```

---

## 架构决策记录 (ADR)

### ADR-1: 选择 Hono + 原生 ES Modules 而非 Next.js

**日期**: 2025-Q1
**状态**: 已采纳

**背景**: 需要一个简单的前后端分离部署方案，前端不依赖构建工具。

**决策**: 使用 Hono 作为 BFF（Backend For Frontend），前端保持原生 ES Modules。

**理由**:

- 项目规模较小（~30 个 JS 文件），不需要 React/Vue 的组件模型
- 高德地图 JS API 2.0 是外部 CDN 加载的，不需要打包进 bundle
- Hono 体积极轻（~10KB），适合做代理层
- 零构建流程意味着开发效率高、调试直接

**权衡**: 放弃 JSX/组件生态，选择手动 DOM 操作。代码量在 50 文件以内时可控。

---

### ADR-2: 选择 localStorage 而非后端数据库

**日期**: 2025-Q1
**状态**: 已采纳（计划后续升级）

**背景**: 需要一个简单持久化方案保存用户行程。

**决策**: 使用 localStorage 存储 workspace JSON，schema 版本化。

**理由**:

- MVP 阶段不需要用户注册/登录
- localStorage 支持离线使用，无网络延迟
- schema 版本号允许后续做数据迁移（当前策略：旧版本直接丢弃，用户重置）
- 避免后端数据库运维成本

**权衡**: 无法跨设备同步，数据清除风险。后续计划增加可选云端保存。

---

### ADR-3: 选择 Canvas 生成分享图而非服务端渲染

**日期**: 2025-Q2
**状态**: 已采纳

**背景**: 需要生成"旅行手账"风格的分享长图。

**决策**: 在浏览器用 Canvas API 绘制，加载真实高德瓦片作为地图背景。

**理由**:

- 分享图需要精确像素级控制（字体、间距、颜色）
- 地图瓦片通过 BFF 代理（`/_AMapTile`）避免 Canvas 跨域污染
- 客户端渲染避免服务端截图（Puppeteer）的运维成本
- 用户可在下载前实时预览

**权衡**: Canvas 文本换行（`wrapText`）需要手动实现，不支持 CSS 排版。复杂字体渲染效果不如浏览器布局。

---

### ADR-4: 选择 DeepSeek 作为 AI 导入引擎

**日期**: 2025-Q2
**状态**: 已采纳（模型选择仍在迭代）

**背景**: 需要从中文攻略文本（小红书/公众号/马蜂窝）中提取结构化行程。

**决策**: 使用 DeepSeek API（`deepseek-v4-flash`），Prompt 存放在 `server/prompts/guide-extract.md`。

**理由**:

- DeepSeek 在中文文本理解任务上表现优异
- JSON Output 模式直接返回结构化数据
- 成本较低（对比 GPT-4）
- 与国内服务链路延迟更低（DeepSeek 服务器在亚太）

**已知问题**:

- `deepseek-v4-pro` 的 JSON Output 出现空 content，暂用 `flash` 替代
- 需要前端确定性清洗（`extractMainRoutePlan`）作为 LLM 提取的补充
- 缺乏量化评测基准

---

### ADR-5: BFF 代理模式隔离安全密钥

**日期**: 2025-Q1
**状态**: 已采纳

**背景**: 高德地图需要两组密钥——Web JS API Key（前端可暴露）+ 安全密钥 jscode（必须保密）。

**决策**: 前端只持有 JS API Key，安全密钥由 BFF 在代理层注入。

**实现**:

1. `amap-loader.js` 设置 `_AMapSecurityConfig.serviceHost = '/_AMapService'`
2. 高德 SDK 所有 Web 服务请求打到同源 `/_AMapService/*`
3. `server/index.js` 转发到 `restapi.amap.com` 并注入 `jscode=$AMAP_JSCODE`
4. DeepSeek API Key 同理只存在于服务端环境变量

**理由**: 浏览器源代码中永不出现生产密钥，符合 OWASP 安全实践。

---

### ADR-6: 3D Diorama 地图 — 2D 事实层驱动的生成式规划沙盘

**日期**: 2026-06-18
**状态**: 已采纳（按 P0-P6 分批实施）

**背景**: 当前项目使用 2D 高德地图、BFF Web Service、Canvas 分享长图和 Three.js 3D 模块。3D 的目标是帮助用户理解路线、地形、水系、桥梁、建筑体块和局部风险，不是替代 2D 地图，也不是复刻真实城市。

**决策**: 采用 “高德 2D / Web Service + BFF 数据缓存 + `geoAssets` + Three.js” 路线。高德继续承担中国区 2D、POI、地理编码和路线规划；Three.js 只负责 3D planning diorama；BFF 负责 provider-neutral 数据、缓存、归属和后续供应商替换。Cesium、Mapbox、Babylon、OSMBuildings 不作为主引擎。

**理由**:

- Three.js 体积极小（~120KB gzip），按需初始化，2D 模式下零开销
- 不与高德 JS API 的内部渲染对象耦合
- 2D 和 3D 共享持久化事实：`locations`、`routeToNext.geometry`、`annotations`、`geoAssets`
- 路线、道路、水系、桥梁、建筑、植被和地标都能通过 BFF provenance 约束合规来源
- 生成过程可被 Playwright 截图、debug state 和几何质量门禁验证

**核心架构约束**:

- 3D 不读取高德 JS API 内部 renderer 对象，只消费持久化业务数据和 `trip.geoAssets`
- 2D/3D 切换入口固定在地图右下角控制区，桌面 Web 为当前唯一产品主线
- 固定生成状态机：`freeze-2d -> derive-scene-envelope -> slab-rise -> terrain-refine -> water-carve -> road-emerge -> bridge-resolve -> route-highlight -> building-massing -> building-dissolve`
- 先抬升地面基础，再融化出水面/道路/山体/桥梁，最后抬升建筑体块并溶解出近景外轮廓
- 路线与道路分层：道路是中性地理上下文，行程路线复用当前 2D 页面路线的颜色、宽度、虚线状态和选中态，并投影贴合到 3D 有效表面
- 所有真实世界资产必须有 `source`、`licence`、`attribution`、`updatedAt`
- 缺失数据失败关闭：不凭空生成真实河道、桥梁、植被、地标或真实建筑外观
- 所有 3D 对象通过统一 `sampleHeight()` / `TerrainModel.heightAt(x,z)` 贴地
- 3D 功能标记写入 `trip.annotations[]`，当前支持入口、观景、补给、交通、风险、备注 6 类

**权衡**: 放弃把 3D 变成全量城市/全球地图平台。生产 DEM 目标是自托管 Copernicus GLO-30/GLO-90 或兼容 Terrarium/PMTiles 管线；Mapbox Terrain-DEM/RGB 只作为原型加速选项；Overture、Microsoft building footprints、ESA WorldCover、CityGML/CityJSON 和授权 GLB 都必须经 BFF 资产包进入。

**详细设计规范**: `docs/3d-deep-research-integration.md`、`docs/3d-generation-process-alignment.md`、`docs/3d-top-down-execution-roadmap.md`、`docs/3d-assets-landcover-and-landmarks.md`、`docs/qa/visual-baseline.md`、`docs/qa/debug-contract.md`

**当前迭代约束**: 下一阶段先完成 Alpha 视觉证明基础设施，再进入 Beta 的 P2 水/路/桥视觉正确性修复。P3 建筑细化、inspect 摄像机和场景精度 profile 必须建立在 ROI 截图与 `window.__threeDebug__.qa` 指标稳定之后。

---

### ADR-7: 分阶段商业化路线图

**日期**: 2026-06-18
**状态**: 已采纳（路线图完成，Phase 1 待排期）

**背景**: 项目在路线规划、AI 导入、3D diorama 等核心能力上已形成差异化，但在用户系统、云端同步、协作、配额和支付上存在系统性缺口。

**决策**: 采用分阶段商业化策略——不急于收费，先完成 S1（可私测）→ S2（差异化验证）→ S3（商业化基础设施）→ S4（付费产品）。Pro 付费锚点为 3D 可编辑地形沙盘。

**理由**:

- 用户还没有账号和云端数据，付费权益无法稳定绑定
- AI 导入质量还没有评测，难以承诺"不限次"价值
- 3D 沙盘还没有编辑与分享闭环，暂时不适合作为付费墙
- 吸取 Wanderlog Trustpilot 1.9/5 的教训——功能深度 > 功能广度

**核心战略判断**: 3D diorama + 地形感知 + 标记放置是视觉化、体验化的付费锚点，比"离线地图"（Wanderlog Pro 锚点）更有说服力。

**竞品分析、市场数据、能力对标、分阶段路线图、技术方案矩阵、权益定价**: 见 `commercialization-solutions.md`。

---

## 依赖关系图

```
                          main.js (orchestrator)
                          /       |        \
              ┌──────────         |         ───────────────┐
              v                   v                        v
          state.js           render/*.js               api/*.js
         /    |    \         /    |    \               /    |    \
   data/ config time-slots  utils icons route-conf    utils config route-conf
   trip.js                     |
                          ┌─────┴──────────────┐
                   map-2d.js(高德SDK)    map-3d.js(Three.js)
                          |                    |
                     2D 平面视图          3D diorama 视图
                          |               /    |     \
                          |     geo-project  toggle-3d  elevation (api)
                          |         |            |
                          |     ┌──┴────────────┴──┐
                          |     │  map-interact.js  │ (规划)
                          |     │  Raycaster 拾取    │
                          |     │  radial-menu.js    │ (规划)
                          |     └───────────────────┘
                          └── 互斥切换 ──┘
                          (右下角显式入口 + 精度门禁)
```

- 所有箭头单向，无循环依赖
- API 层不依赖 state 或 render
- Render 层从 state 读取但不写入 trip/workspace
- `map-3d.js` 独立于 `map.js`——两者互斥，不共享渲染上下文
- `geo-project.js` 是纯数学模块，不依赖 Three.js 或 state
- `toggle-3d.js` 协调右下角 2D/3D 显式入口、精度门禁和 2D↔3D 切换
- `map-3d.js` 当前内置 Three.js Raycaster 点击检测；后续长按轮盘成熟后再拆 `map-interact.js`
- `annotation-modal.js` 是 HTML modal，不依赖 Three.js；后续 radial menu 单独拆分
- state.js 依赖叶子模块（data/config/time-slots/route-config）
- 3D 模块仅在用户主动触发且通过当前精度门禁时初始化，其余时间零开销
- 新增标记（entrance/viewpoint/supply/transfer/risk/note）与现有 13 种 POI icon 互不冲突

---

## 目录结构 (v0.3 规划)

```
trip-app/
├── .editorconfig
├── .prettierrc
├── eslint.config.js
├── vitest.config.js
├── package.json
├── Dockerfile
├── .github/workflows/ci.yml
├── server/
│   ├── index.js              # Hono BFF
│   └── prompts/
│       └── guide-extract.md  # AI 攻略解析 Prompt
├── index.html
├── css/
│   ├── tokens.css            # 设计令牌
│   ├── layout.css            # 布局骨架
│   └── components.css        # UI 组件
├── js/
│   ├── main.js               # 业务编排
│   ├── state.js              # 唯一状态源
│   ├── storage.js            # localStorage 持久化
│   ├── config.js             # 配置中心
│   ├── logger.js             # 日志框架 (新增)
│   ├── route-config.js       # 路线配置
│   ├── time-slots.js         # 时间段定义
│   ├── share.js              # #trip= 链接兼容
│   ├── share-image.js        # Canvas 分享长图 (2D)
│   ├── share-image-3d.js     # 3D diorama 分享长图 (规划)
│   ├── data/
│   │   └── trip.js           # 演示数据 + JSDoc typedef
│   ├── api/
│   │   ├── amap-loader.js    # 高德 SDK 加载
│   │   ├── geocode.js        # POI 搜索/附近/逆地理
│   │   ├── guide-import.js   # AI 导入请求
│   │   ├── routing.js        # 路线规划
│   │   └── elevation.js      # 高程数据获取 (新增)
│   ├── render/
│   │   ├── modal-base.js     # Modal 基础设施 (新增)
│   │   ├── shared-widgets.js # 共享 UI 组件 (新增)
│   │   ├── icons.js          # 图标体系 (13 种 POI + 6 种功能标记)
│   │   ├── geo-project.js    # 地理坐标投影 (新增)
│   │   ├── sidebar.js        # 侧边栏渲染
│   │   ├── map.js            # 2D 地图渲染 (现有)
│   │   ├── map-3d.js         # 3D diorama 渲染 (新增)
│   │   ├── toggle-3d.js      # 3D 切换 + 精度尺监听 (新增)
│   │   ├── map-interact.js   # Raycaster 点击/长按/轮盘 (规划)
│   │   ├── radial-menu.js    # 长按轮盘 UI (规划)
│   │   ├── workspace-tabs.js
│   │   └── *-modal.js        # 各类弹窗
│   └── __tests__/
│       ├── utils.test.js
│       ├── time-slots.test.js
│       ├── route-config.test.js
│       ├── icons.test.js
│       └── state.test.js
└── docs/
    └── api.md                # BFF API 文档
```
