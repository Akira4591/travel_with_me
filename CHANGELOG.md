# Changelog

## [Unreleased]

- 文档体系收敛
  - 新增 `docs/README.md` 作为当前维护文档入口。
  - 删除被新主文档吸收的旧阶段评审、旧评分表、旧 3D 长研究稿和生成上下文汇总。
  - README、ARCHITECTURE、TODO、API、商业化、工作流和贡献指南同步到最新 3D 路线。
- 3D 路线同步
  - 当前 3D 主线固定为 AMap 2D/Web Service + BFF/geoAssets + Three.js planning diorama。
  - 固定生成顺序：2D 冻结、地基抬升、水路桥融化、路线高亮、建筑体块抬升、建筑细节溶解。

## [0.3.0] — 2026-06-19 (S2 收口)

### Added

- S2 差异化验证闭环
  - AI 攻略导入评测框架：12 个种子样例 / 64 个标注地点，召回 100%、误提取 0%、攻略类型识别 100%
  - 5 种 3D 地形模式自动选择 (Micro Street / Citywalk / Scenic Park / Hiking / Region Overview)
  - TerrainModel 双线性插值高程 + `flat-fallback` 降级 + `terrainConfidence` 可信度
  - 6 类 3D/2D 功能标记 (entrance/viewpoint/supply/transfer/risk/note) + CRUD state mutators
  - Raycaster 点击添加标记 + annotation-modal 编辑面板
  - 分享图隐私选项 (备注/交通方式/未排期地点 三开关)
  - AI 导入预览编辑 (标题/备注/day/timeSlot 直接编辑 + 未匹配标灰)
  - AI 攻略文本清洗规则 (guide-import-cleanup.js: 广告噪声/模糊词/非 POI 过滤)
- Playwright E2E 测试 (10 passed / 8 skipped，桌面核心路径全覆盖)
- 路由选择行为优化
- workspace JSON 导出/导入恢复
- BFF 安全加固 (Origin/Referer 白名单、频率限制、CSP 响应头、body 上限)
- 文档体系完善 (设计重构总纲、UI 视觉风格指南、3D 地形实施研究、技术评分卡、项目交付成熟度审查)

### Changed

- `@hono/node-server` → `^2.0.5`，`hono` → `^4.12.26`，`vitest` → `^4.1.9`
- localStorage 存储层增强（schema 升级不再静默丢弃、恢复快照、JSON 导出导入）
- `setStatus()` 拆分为纯文本/受控 HTML 双模式（XSS 修复）
- 测试从 43 个扩展到 64 个（新增 annotations / terrain-model / terrain-mode / guide-import-cleanup / storage）

---

## [0.2.0] — 2026-06-17

### Added

- 企业级工程基础设施
  - ESLint + Prettier + EditorConfig 代码质量工具链
  - Vitest 测试框架 + 43 个单元测试（utils, time-slots, route-config, icons, state）
  - GitHub Actions CI 流水线（Node 18 + 22 矩阵）
  - 日志框架（`js/logger.js`，支持 localStorage 按模块开关）
  - Modal 基础设施（`js/render/modal-base.js`）
  - 共享 UI 组件（`js/render/shared-widgets.js`）
- JSDoc 类型标注（核心数据模型 + 公共 API）
- 项目文档
  - `ARCHITECTURE.md` + 5 个 ADR
  - `CONTRIBUTING.md`
  - `docs/engineering/api.md`
  - `CHANGELOG.md`

### Changed

- CSS 架构拆分为三层：tokens.css + layout.css + components.css
- `package.json` 新增 scripts: `lint`, `format`, `check`, `test`, `test:watch`
- 全项目 Prettier 格式化基线

---

## [0.1.0] — 2025-05-10

### Features (cumulative from initial commits)

- 多路线工作区（最多 3 条行程）
- 多日行程管理 + 事件编辑
- 高德地图联动（marker、路线、infoWindow）
- 路线规划（驾车/步行/公交/骑行 + 自动模式选择）
- AI 攻略导入（DeepSeek + 高德 POI 匹配 3 层降级）
- Canvas 分享长图生成（含地图瓦片背景）
- 拖拽排序（同时间段内 + 跨天 + 跨容器）
- lucide 风格内置图标体系（13 种分类）
- localStorage 持久化 + schema 版本管理
- 旧 `#trip=` 链接兼容
- Docker + Zeabur 部署支持
