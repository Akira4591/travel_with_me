# Changelog

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
  - `docs/api.md`
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
