# Trip App · 项目进展与交接文档

> 给后续接手的 AI（Codex 等）和未来的自己看。覆盖架构、当前状态、已知坑、还没做完的事。

最后更新：2026-05-04（BFF 安全改造、日期重构、行程编辑、长图分享、新建路线）。

---

## 1. 项目是什么

多日旅行行程可视化 + 路线规划工具，基于高德 JS API 2.0。当前内置样例是“五一北京 4 天”，但已经开始向通用旅行路线编辑器演进：用户可以新建空白路线、编辑旅行标题、增删日期、搜索地点、编辑/删除/拖拽日程，并生成分享长图。

**部署**：Zeabur 自部署集群（阿里云北京 2C），生产 URL `https://travelwithyou.preview.aliyun-zeabur.cn`。

**仓库**：https://github.com/Akira4591/travel_with_me

---

## 2. 当前功能

- 多日行程展示：支持“全部”和单日视图切换。
- Trip 级操作：修改旅行标题；新建空白旅行路线。
- 日期管理：新建一天、编辑日期/当天标题、删除某一天；日期内部统一 ISO，展示时隐藏年份；已有日期不可重复选择；日期按时间排序。
- 地点与日程编辑：搜索 POI 添加地点；编辑标题、图标、地点；删除日程；上移/下移；同一天内拖拽排序。
- 地图联动：地点 marker、路线 polyline、点击行程卡聚焦地点。
- 路线规划：驾车/打车、步行、骑行、公共交通；路线接口偶发失败时最多重试 3 次，再走估算兜底。
- 分享长图：生成 PNG 海报，包含品牌条、标题统计、地图瓦片背景、地点标记、按日时间轴和结尾祝福语。
- 高德安全：Hono BFF 托管前端并代理高德 Web 服务，jscode 只在服务端环境变量中。

---

## 3. 架构

依赖方向保持单向，新增 server 层：

```text
        server/index.js  ← Hono BFF（托管前端 + 代理高德服务/瓦片）
              ↑
       index.html, css/, js/  ← 前端，由 server 静态托管
              ↑
            main.js
         ↓    ↓    ↓
      state  api  render
         ↓    ↓     ↓
        utils + config
```

- `state.js` 是唯一状态源，所有 trip 修改通过 mutator + `emit('trip:changed')` 或 `emit('trip:replaced')`。
- `api/` 只和高德 SDK 打交道，不写 DOM，不读 UI。
- `render/` 只渲染和收集交互，通过 handlers 回到 `main.js`。
- `main.js` 编排业务流程：加载 SDK、渲染界面、选择日期、规划路线、打开弹窗、处理分享图。
- `server/index.js` 做静态托管、`/_AMapService/*` 高德服务代理、`/_AMapTile` 高德瓦片代理。

### 目录结构重点

```text
trip-app/
├── Dockerfile
├── package.json
├── .env.example
├── server/
│   └── index.js
├── index.html
├── css/app.css
└── js/
    ├── main.js
    ├── state.js
    ├── config.js
    ├── storage.js          # localStorage 封装，尚未接入
    ├── share.js            # 旧 URL hash 分享解析仍保留，用于兼容旧链接
    ├── share-image.js      # 当前分享长图生成
    ├── utils.js
    ├── data/trip.js
    ├── api/
    │   ├── amap-loader.js
    │   ├── geocode.js
    │   └── routing.js
    └── render/
        ├── map.js
        ├── sidebar.js
        ├── search-modal.js
        ├── event-editor-modal.js
        ├── day-editor-modal.js
        ├── date-picker.js
        ├── trip-modal.js
        ├── share-modal.js
        └── icons.js
```

---

## 4. 高德 Key / 安全密钥

**两套 JS API Key + 两把 jscode**，按 `location.hostname` 自动切换（[js/config.js](js/config.js)）。

| 用途 | JS API Key（公开） | jscode（机密） | 高德后台白名单 |
|---|---|---|---|
| 本地开发 | `a32b44e9ac97100b36d87b0d961976a9` | `.env` 里的 `AMAP_JSCODE` | 留空 |
| 生产 | `7204bb52ceac03112bb024af2f270444` | Zeabur 环境变量 `AMAP_JSCODE` | `travelwithyou.preview.aliyun-zeabur.cn` |

铁律：

- `amapSecurityCode` / jscode 不能进 `js/`，不能进 git。
- 不要把生产 jscode 发给 AI、贴到对话、写进文档。
- 改任何高德代理相关代码后，验证 BFF 仍能转发，前端 devtools 里搜不到 jscode。

### BFF 工作原理

1. 前端 `js/api/amap-loader.js` 设置 `window._AMapSecurityConfig.serviceHost = location.origin + '/_AMapService'`。
2. 高德 SDK 的 Web 服务请求走同源 `/_AMapService/v3/...`。
3. BFF 拼到 `https://restapi.amap.com`，注入 `jscode=$AMAP_JSCODE`，并透传 `Referer`。
4. 分享长图需要 canvas 绘制地图背景，直接加载跨域瓦片会污染 canvas；因此 [server/index.js](server/index.js) 新增 `/_AMapTile?x=&y=&z=` 同源瓦片代理。

---

## 5. 本地开发

```bash
cd trip-app
npm install
# 创建 .env，写入 AMAP_JSCODE=<dev jscode>
npm start
# → http://localhost:8080
```

如果端口被占用：

```powershell
Get-NetTCPConnection -LocalPort 8080 | Select-Object -ExpandProperty OwningProcess
Stop-Process -Id <PID> -Force
```

改前端代码后刷新浏览器即可；改 `server/index.js` 需要重启 `npm start`，或用 `npm run dev`。

---

## 6. 部署到 Zeabur

由于用户的 GitHub OAuth 曾经闪退，当前用过「任意 Git」模式。注意 Zeabur 该模式不一定读取仓库根目录 Dockerfile，需要在服务设置里的 Dockerfile 字段粘贴：

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 8080
CMD ["node", "server/index.js"]
```

部署步骤：

1. `git push origin main`
2. Zeabur dashboard → 服务 → 重新部署
3. Variables 设置 `AMAP_JSCODE = <prod jscode>`
4. 公网访问容器端口 8080，绑定 `travelwithyou.preview.aliyun-zeabur.cn`

---

## 7. 最近提交脉络

| Commit | 说明 |
|---|---|
| `29e2a04` | Add trip creation and share poster：新建路线、标题编辑、分享长图、瓦片代理 |
| `0be80b1` | Add custom date picker and day ordering：自绘日期选择器、日期去重和排序 |
| `7dbf5ff` | Fix walking/driving routes falling back to estimate：路线成功判断修复 |
| `df7b473` | Forward Referer/Origin in AMap proxy：BFF 透传 Referer/Origin |
| `39c5896` | Add Dockerfile for Zeabur arbitrary-Git deploy |
| `91dc76f` | Move AMap security code to BFF |

当前工作区在更新本文档前是干净的。

---

## 8. 已知坑

1. 高德 Web 服务接口的域名白名单靠 `Referer` 头校验，不是 URL 的 `appname` 参数。BFF 必须透传 `Referer`。
2. 高德 SDK 的 `info` 字段大小写不一致：地理编码返回 `'OK'`，驾车/步行可能返回 `'ok'`。比对应大小写不敏感。
3. JS API Key 白名单不接受 `localhost` 和 IP。本地开发用白名单留空的 dev key。
4. prod key 和 prod jscode 必须配对。前端用 prod key 时，BFF 的 `AMAP_JSCODE` 也必须是 prod jscode。
5. AMap Driving 的 `service.search` 要 4 个参数（第三个 `{}`），其它 mode 是 3 个，[routing.js](js/api/routing.js) 已处理。
6. 旧 `#trip=` 分享 URL 仍可读，但当前主分享功能已改成长图。旧链接里的中文日期会被 `formatDateCN()` 兼容显示，但日期编辑器对非 ISO 日期会退化。
7. 新建空白路线会调用 `replaceTrip()`，并在 `main.js` 的 `handleTripReplaced()` 里清空旧 marker/路线；如果以后改 replace 流程，别漏掉地图运行时状态清理。
8. 分享图地图背景依赖 `/_AMapTile` 代理。若部署环境拦截瓦片请求，分享图会退化为本地绘制的浅色网格底图。

---

## 9. 后续需要优化的地方

1. **分享图美化**
   - 当前长图已经有基本结构：品牌条、标题统计、地图、按日时间轴、结尾区。
   - 仍需继续打磨视觉：地图区域比例、地点标密度、iOS 风格 icon、字体层级、底部留白、整体高级感。
   - 注意分享页 icon 可以和主规划页 icon 分开，主页面偏克制，分享图可以更有旅行手账感。

2. **怎么让别人用**
   - 需要确定产品策略：是否登录？是否允许无登录态使用？
   - 如果无登录态使用，需要解决编辑信息如何保留：localStorage 草稿、URL hash、短链接 ID、匿名设备 ID、服务端 KV/DB 都是可选方向。
   - 当前 `storage.js` 只有接口封装，尚未接入；BFF 已存在，可以继续接 Redis / Postgres / 文件型 KV。
   - 需要设计“新建路线、保存草稿、分享给别人、再次打开继续编辑”的完整闭环。

3. **移动端界面适配**
   - 当前仍是桌面优先布局，小屏只是压缩，体验不够好。
   - 需要重新设计移动端侧栏、地图、日期 tab、日程卡、弹窗和分享图预览。
   - 重点是地图和列表的切换方式，不能简单上下各占半屏。

---

## 10. 代码风格约定

- 注释只写 WHY，不写显而易见的 WHAT。
- 不写大段 docstring。
- 只在系统边界做错误处理：用户输入、外部 API、BFF 请求。
- mutator 全部走 `state.js`，不要直接改 trip。
- 新功能优先新建模块，不把 `main.js` 堆大。
- 保持中文 UI 文案。

---

## 11. 给接手者的建议入手顺序

1. 先确认本地能跑：`npm install && npm start`，访问 `localhost:8080`，地图、POI 搜索、分享长图都能工作。
2. 看 [main.js](js/main.js)：从 `boot()` 开始理解加载、渲染、订阅、选择日期、路线规划、分享图生成。
3. 看 [state.js](js/state.js)：理解 trip 级、day 级、event 级 mutator。
4. 如果继续做“让别人用”，优先设计存储/身份策略，不要直接堆 UI。
5. 如果继续做分享图，主要改 [share-image.js](js/share-image.js)，不影响主页面 UI。

---

## 附：环境变量清单

| 变量 | 必需？ | 哪里设置 | 说明 |
|---|---|---|---|
| `AMAP_JSCODE` | 是 | 本地 `.env` / Zeabur Variables | 高德安全密钥，必须与前端 JS API Key 配对 |
| `PORT` | 否 | Zeabur 自动注入 / 默认 8080 | BFF 监听端口 |
