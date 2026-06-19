# Travel With Me Roadmap

最后更新：2026-06-19

本文档记录当前项目从本地 MVP 走向可私测、可商业化产品的执行 backlog。设计总纲见 `docs/design-refactor-plan.md`。

## 当前阶段

当前项目处于 **S1 工程可私测已闭环 → S2 差异化验证启动** 的阶段。

最近一次验证：2026-06-19。

| 检查项                          | 结果       | 说明                                                                                                     |
| ------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `npm.cmd test`                  | 通过       | 6 个测试文件，48 个测试通过                                                                              |
| `npm.cmd run test:guide-import` | 通过       | 5 个 AI 导入种子样例，27 个标注地点；召回、day、note、类型识别均通过当前阈值                             |
| `npm.cmd run check`             | 通过       | Prettier 与 ESLint 均通过                                                                                |
| `npm.cmd run test:e2e`          | 通过       | Playwright 10 passed / 8 skipped；桌面核心路径、AI 导入、添加地点、导入导出、3D 入口和移动端基础回归通过 |
| Git 工作区                      | 基线已提交 | 后续改动继续分批提交，避免误回滚用户内容                                                                 |

已具备：

- Node/Hono BFF + 原生 ES Modules 前端。
- 多路线 workspace，本地 localStorage 保存。
- 多日行程、未排期事件池、地点搜索、路线规划。
- DeepSeek 攻略导入，高德 POI 多层匹配。
- Canvas 分享长图。
- 3D diorama 基础渲染模块。
- ESLint、Prettier、Vitest、CI 文档和基础设施。

尚未达到商业化上线：

- 浏览器级 S1 核心业务路径回归已形成闭环，后续按功能迭代继续扩展。
- localStorage 仍是主存储，已补恢复快照和 JSON 导出/导入，但尚未云端同步。
- 桌面端 Web 已确定为当前唯一产品主线；移动 Web 只保留基础列表/地图切换和回归守门。
- 浏览器级测试已覆盖 shell、桌面新建/重命名、日期编辑、事件编辑、AI 导入预览、添加地点搜索、路线设置、导出/导入、分享图预览、3D canvas 非空和移动端基础切换。
- 3D 沙盘尚未形成可编辑、可分享、可收费闭环。

## P0: S1 工程可私测

这些任务必须先完成，否则不建议给真实用户长期使用。

### 1. 质量门禁恢复（已完成）

- 修复 `js/main.js` 正则 lint 错误。
- 修复 `js/render/map.js` 和 `server/index.js` 空 catch lint 错误。
- 清理未使用 import、变量和无效 eslint-disable。
- 确保 `npm run check && npm test` 全绿。

验收标准：

- 本地和 CI 都通过 `npm run check`。
- 本地和 CI 都通过 `npm test`。

### 2. XSS 和输入安全（状态面板已修复，其他渲染点继续审计）

- 将 `setStatus()` 拆成纯文本状态和受控 HTML 状态。
- 所有 AI 文本、攻略文本、POI 名称、用户输入默认走 `textContent` 或 `escapeHTML()`。
- 对 `innerHTML` 使用点建立白名单说明。
- 给 utils 的 `escapeHTML()` 保持单测覆盖。

验收标准：

- 攻略中包含 `<script>`、HTML 属性、特殊符号时不会被执行。
- 状态栏、预览页、地点卡、分享图入口均不渲染未转义 HTML。

### 3. BFF 安全与成本保护（基础防护已完成，生产级网关待补）

- 为 `/_ai/extract-guide` 增加请求体大小、频率限制、超时和错误码规范。
- 为 `/_AMapService/*` 增加 origin/referer allowlist 策略。
- 为 `/_AMapTile` 增加瓦片参数范围校验和缓存策略说明。
- 日志脱敏，不记录完整攻略原文、密钥、用户身份敏感信息。
- 基础安全响应头和 AI body limit 已接入。

验收标准：

- 连续高频请求会被拒绝。
- 非允许来源不能滥用代理。
- AI 超时、JSON 失败、上游失败都有可读错误。

### 4. 数据可靠性（本地恢复与导入导出已完成，云端同步待 S3）

- localStorage schema 升级不再默认静默丢弃用户数据。
- 至少提供导出 JSON、导入 JSON 和重置前提示。
- 为后续云端同步定义 workspace/trip 数据迁移策略。

验收标准：

- 旧 schema 用户进入新版本时有恢复或导出路径。
- 手动导出的 trip/workspace 可重新导入。

### 5. 桌面端 Web 私测体验（S1 核心闭环已完成）

- 聚焦 1280px/1440px 桌面宽屏下的路线编辑、地图联动、AI 导入预览、分享图生成和 3D 入口。
- 桌面端 E2E 已覆盖创建/重命名路线、AI 导入预览、编辑日期、编辑事件、添加地点搜索、路线段设置、导出/导入、分享图预览和 3D 入口。
- 下一步进入 S2，补齐 AI 导入评测集、更完整的真实用户私测记录和 3D 价值验证。
- 保持既有小屏列表/地图切换作为兼容底线，不继续扩展移动端弹窗、触控拖拽和替代排序。

验收标准：

- 桌面端可以稳定完成一条真实旅行路线从 AI 导入/手动编辑到分享图生成的闭环。
- 375px 只要求无致命遮挡、可打开已有行程、列表/地图切换不回归。

### 6. 核心路径浏览器测试（S1 核心路径已完成）

- 增加 Playwright 或等价工具的 smoke tests。
- 已覆盖启动、创建行程、重命名、AI 导入预览、编辑 day、编辑事件、添加地点搜索、切换 day、路线设置、导入/导出文件交互、生成分享图预览和 3D canvas 非空。
- 3D 已验证 canvas 非空、进入/退出按钮状态正确；真实地形价值、LOD、标记交互留到 S2。

验收标准：

- CI 能跑核心 smoke test。
- 失败截图可用于定位 UI 问题。

## P1: S2 差异化验证

这些任务决定产品是否真的比竞品强。

### 1. AI 攻略导入评测集（框架已建立，真实样例继续扩充）

- 已建立 `tests/fixtures/guide-import-evaluation/cases.json` 种子样例集，覆盖按日 citywalk、混合攻略、推荐合集、广告噪声和跨城路线。
- 已增加 `npm.cmd run test:guide-import`，输出召回率、误提取率、day 准确率、note 关键词覆盖率、攻略类型准确率和 forbidden hits。
- 继续收集 20-30 篇真实中文攻略。
- 继续标注地点召回、误提取、day 归属、note 有用性。
- 继续区分模型抽取错误和高德搜索失败。
- 建立每次 Prompt/规则调整后的对比记录。

验收标准：

- 每次修改 AI 导入逻辑都有量化结果，且至少通过 `npm.cmd run test:guide-import`。
- 关键 bad case 有可复现输入。

### 2. AI 预览编辑能力

- 支持直接编辑事件标题和备注。
- 支持调整 day、timeSlot、未排期状态。
- 未匹配地点保留但明确标灰，允许手动搜索绑定。
- 默认隐藏原文依据，必要时可展开调试。

验收标准：

- 用户可以在导入确认前修正大部分 AI 错误。

### 3. 分享体系升级

- 设计小红书/朋友圈友好的长图版式。
- 决定未排期地点是否进入分享图。
- 增加只读分享页设计，旧 `#trip=` 仅保留兼容。
- 为短链接和复制到我的行程预留模型。

验收标准：

- 分享图在桌面端预览、下载稳定，导出的图片适合在移动社交平台传播。
- 分享内容不泄露未选择展示的信息。

### 4. 3D Diorama 价值验证

- 明确 3D 的最小可用价值：路线空间理解、地形感知、上下文标记。
- 按 `docs/3d-terrain-implementation-research.md` 完成 `chooseTerrainMode()` 的设计落地：Micro Street、Citywalk、Scenic Park、Hiking、Region Overview。
- 明确高程数据分层：Open-Meteo MVP、DEM tile 进阶、失败时 flat terrain 降级。
- 完成 `TerrainModel` 规格：`bounds`、`grid`、`heightAt(x,z)`、`mesh`、`sideSkirts`、`terrainConfidence`。
- 实现点击添加标记和长按轮盘前，先完成交互设计稿、数据模型和验收路径。
- 定义 6 类功能标记与现有 POI icon 的关系。
- 明确 3D 分享图/视频导出的后续边界。

验收标准：

- 3D 不只是可看，而能帮助用户做路线判断。
- 标记数据可持久化、可编辑、可分享。
- 不同模式回答不同问题：小店看位置关系、景区看入口和坡度、徒步看山体结构和爬升。
- 高程失败时仍能进入 3D，但不展示坡度/爬升结论。

## P2: S3 商业化基础设施

这些任务用于从私测工具走向可运营产品。

### 1. 用户系统

- 选择 Supabase Auth 或 Auth.js。
- 支持 Email OTP、Google OAuth、Apple Sign In 中至少两种。
- 用户偏好、默认城市、语言、主题进入用户配置。

验收标准：

- 用户可以跨设备找回自己的行程。

### 2. 云端同步

- localStorage 降级为快速启动缓存。
- 主存储迁移到云端 workspace/trip 文档。
- 支持只读链接、复制到我的行程、版本恢复。
- 协作路线可采用 Yjs 或 Automerge，但必须先写冲突策略。

验收标准：

- 登录用户刷新、更换设备后数据一致。
- 断网编辑后恢复网络可同步。

### 3. 配额与成本

- AI 导入按用户/月计数。
- 高德代理按 IP/用户限流。
- 记录上游错误率和消耗。
- Pro 权益前先有免费配额策略。

验收标准：

- 单个用户或来源不能无限消耗 AI/API 成本。

### 4. 监控与运营

- 接入错误监控。
- 增加基础埋点：创建 trip、添加地点、AI 导入成功率、分享图生成、分享链接打开。
- 建立隐私合规的数据采集边界。

验收标准：

- 能回答“用户卡在哪一步”和“成本花在哪里”。

## P3: S4 付费化

付费化必须建立在 S1-S3 之后。

### 1. 权益边界

建议初版：

- Free：1 workspace、3 trips、基础路线规划、AI 导入每月 3 次、2D 分享图。
- Pro：无限 workspace/trips、云端同步、AI 导入不限次、3D diorama、离线地图、3D 分享。
- Team：多人协作、费用分摊、权限管理。

### 2. 支付与合规

- 选择 Lemon Squeezy、Stripe 或本地支付方案。
- 增加 webhook 激活权益。
- 增加隐私政策、用户协议、数据导出和删除。

验收标准：

- 支付状态和用户权益一致。
- 用户可自助取消、导出、删除数据。

## P4: 原生 Android（Kotlin）后置评估

当前暂停移动端 Web 深度开发。Android 不走 WebView 包壳作为主路线，等桌面端 Web 的产品价值和核心数据模型稳定后，再按 Kotlin 原生 App 单独立项。

### 1. 评估前置条件

- 桌面端 Web 已完成 S1 私测闭环。
- AI 导入、分享图、3D 价值验证至少有一轮真实用户反馈。
- 云端 workspace/trip 数据模型和 BFF API 边界清晰。

### 2. 推荐方向

- Kotlin + Jetpack Compose 做原生 Android UI。
- 复用 Hono BFF、用户系统、云端 workspace/trip API。
- 移动端重点做旅行中查看、轻编辑、离线草稿、分享接收，不复制桌面端复杂编辑器。

验收标准：

- Android 立项前有独立 PRD、交互稿、API 合约和 Kotlin 技术方案。

## 文档维护规则

- 产品能力变化：更新 `README.md`。
- 架构决策变化：更新 `ARCHITECTURE.md`。
- 商业化路线变化：更新 `commercialization-solutions.md`。
- 执行优先级变化：更新本文档。
- API 契约变化：更新 `docs/api.md`。
- 技术方案取舍变化：更新 `docs/technical-feature-implementation-scorecard.md`。
