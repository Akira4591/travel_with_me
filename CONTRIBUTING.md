# Contributing

> **辅助文件** | 权威开发文档: [DEVELOPMENT.md](DEVELOPMENT.md)

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入真实的 AMAP_JSCODE（必需）和 DEEPSEEK_API_KEY（可选）

# 3. 启动开发服务器（含文件变化自动重启）
npm run dev

# 4. 浏览器打开
# http://localhost:8080
```

## 3D Visual QA Documents

Any change that affects 3D visual output, camera behavior, terrain, water, roads, bridges, buildings, or scene profiles must check these documents before implementation:

- `docs/engineering/qa/visual-baseline.md`
- `docs/engineering/qa/debug-contract.md`
- `docs/architecture/3d/visual-baseline-spec.md`

The next active development order is:

```text
Alpha visual proof infrastructure
  -> Beta P2 water / road / bridge visual correctness
  -> Gamma P3 building massing / dissolve
  -> Delta inspect camera and scene precision profiles
```

Live provider calls are not part of default visual QA. Visual gates must use deterministic local fixtures first.

## 代码规范

### 格式化

所有代码通过 [Prettier](https://prettier.io/) 自动格式化。运行：

```bash
npm run format
```

### Lint

通过 [ESLint](https://eslint.org/) 检查代码质量：

```bash
npm run lint
```

### 综合检查

```bash
npm run check    # 格式 + lint 一并检查
```

### 测试

```bash
npm test            # 单元测试（当前基线 39 files, 244 tests）
npm run test:watch  # 持续监听
npm run test:e2e    # 浏览器级 E2E 测试（Playwright）
```

测试文件位于 `js/__tests__/`，使用 [Vitest](https://vitest.dev/) 框架。

## 架构约定

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

核心依赖方向：

```
server/index.js → Browser ES Modules → main.js → state / api / render → utils + config
```

- `state.js` 是唯一状态源。所有 trip/workspace 修改必须走 mutator。
- `api/` 只封装外部能力（高德 SDK、后端 fetch），不读 DOM，不改 state。
- `render/` 只负责 UI 渲染和收集交互，通过 handler 回调通知 main.js。
- `main.js` 负责业务编排。

## Commit 规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <summary>

feat(guide-import): add AI guide extraction flow
fix(map): handle missing lnglat gracefully
refactor(modal): extract shared modal infrastructure
docs(readme): update deployment guide
test(utils): add formatDistance unit tests
```

类型：`feat` | `fix` | `refactor` | `docs` | `test` | `style` | `chore`

## PR 流程

1. 从 `main` 创建 `feature/xxx` 或 `fix/xxx` 分支。
2. 修改代码，确保 `npm run check` 和 `npm test` 通过。
3. 推送分支到 GitHub，创建 PR。
4. PR 描述应包含：变更摘要、测试计划、截图（如有 UI 变更）。
5. CI 全部通过后请求 Review。
6. Squash merge 到 `main`。

## 测试要求

- 新增或修改纯函数（utils、time-slots、route-config、icons）需要添加/更新单元测试。
- 修改 state mutator 需要更新对应测试。
- Bug 修复需要添加回归测试。
- 浏览器级 E2E 测试位于 `tests/e2e/`，使用 Playwright。
- 集成测试（涉及 DOM、地图 SDK）当前不在自动测试范围内。

## 目录结构

```
trip-app/
├── .editorconfig
├── .prettierrc
├── eslint.config.js
├── vitest.config.js
├── playwright.config.js
├── package.json
├── Dockerfile
├── .github/workflows/ci.yml
├── server/
│   ├── index.js
│   └── prompts/
│       └── guide-extract.md
├── index.html
├── css/
│   ├── tokens.css          # 设计令牌
│   ├── layout.css          # 布局骨架
│   └── components.css      # UI 组件
├── js/
│   ├── main.js             # 业务编排
│   ├── state.js            # 唯一状态源
│   ├── storage.js          # localStorage 持久化
│   ├── config.js           # 配置中心
│   ├── logger.js           # 日志框架
│   ├── route-config.js     # 路线配置
│   ├── time-slots.js       # 时间段定义
│   ├── share.js            # #trip= 链接兼容
│   ├── share-image.js      # Canvas 分享长图
│   ├── annotations.js      # 2D/3D 功能标记
│   ├── route-geometry.js   # 路线几何与诊断
│   ├── route-guidance.js   # 2D/3D 路线导引身份
│   ├── data/
│   │   └── trip.js         # 演示数据 + 数据模型 typedef
│   ├── api/
│   │   ├── amap-loader.js  # 高德 SDK 加载
│   │   ├── amap-web-service.js # 高德 Web Service 封装
│   │   ├── geo-assets.js   # 3D geoAssets 获取/规范化
│   │   ├── geocode.js      # POI 搜索/附近/逆地理
│   │   ├── guide-import.js # AI 导入请求
│   │   ├── routing.js      # 路线规划
│   │   └── elevation.js    # 高程数据（3D 使用）
│   ├── render/
│   │   ├── modal-base.js   # Modal 基础设施
│   │   ├── shared-widgets.js # 共享 UI 组件
│   │   ├── icons.js        # 图标体系
│   │   ├── geo-project.js  # 地理坐标投影
│   │   ├── scene-build-context.js # 3D 场景构建上下文
│   │   ├── scene-debug.js  # 3D debug surface
│   │   ├── sidebar.js      # 侧边栏渲染
│   │   ├── map.js          # 2D 地图渲染
│   │   ├── map-3d.js       # 3D diorama 渲染
│   │   ├── terrain-surface.js # 3D 地形表面/贴地 ribbon
│   │   ├── geo-asset-renderer.js # 3D 水/路/桥渲染
│   │   ├── route-guidance-renderer.js # 3D 路线导引渲染
│   │   ├── toggle-3d.js    # 2D/3D 切换
│   │   ├── workspace-tabs.js
│   │   └── *-modal.js      # 各类弹窗
│   └── __tests__/
│       ├── utils.test.js
│       ├── time-slots.test.js
│       ├── route-config.test.js
│       ├── icons.test.js
│       └── state.test.js
├── tests/
│   └── e2e/
│       └── smoke.spec.js
└── docs/
    ├── README.md
    ├── product/            # 产品、商业化、AI 导入评测
    ├── architecture/       # 2D/3D 架构和资产边界
    ├── engineering/        # API、开发工作流、QA、测试
    ├── operations/         # 发布手册和质量门状态
    └── design/             # UI/视觉风格
```
