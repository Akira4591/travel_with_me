# Trip App · HANDOFF

最后更新：2026-05-05

本文档按当前代码状态整理，用于后续接手。早期“纯前端单 trip / URL 分享”的描述已经过时：当前项目是 Node/Hono BFF + 原生 ES Modules 前端 + localStorage workspace。

---

## 1. 产品定位

Trip App 是一个中文旅行路线规划工具。用户可以：

- 同时维护最多 3 条旅行路线。
- 为每条路线管理多日行程。
- 搜索地点并添加到某一天。
- 编辑地点标题、图标、时间块、备注和地点信息。
- 规划相邻地点之间的交通方式。
- 生成旅行手账风格的分享长图。

首次无本地存档时，会自动加载“五一北京行程”作为演示数据。

---

## 2. 当前框架

```text
Node + Hono BFF
  ├─ 托管静态前端
  ├─ 代理高德 Web 服务：/_AMapService/*
  └─ 代理高德瓦片：/_AMapTile

Browser
  ├─ 原生 ES Modules
  ├─ 原生 DOM 渲染
  ├─ state.js 单例状态源
  ├─ localStorage workspace
  ├─ 高德地图 JS API 2.0
  └─ Canvas 生成分享长图
```

没有 React/Vue/Vite/打包流程。`package.json` 只有 Hono 相关依赖。

本地启动：

```bash
npm install
npm start
# http://localhost:8080
```

如果 8080 被占用：

```powershell
Get-NetTCPConnection -LocalPort 8080 | Select-Object -ExpandProperty OwningProcess
Stop-Process -Id <PID> -Force
```

---

## 3. 架构边界

核心依赖方向：

```text
server/index.js
      ↑
index.html / css / js
      ↑
main.js
  ↓     ↓      ↓
state   api    render
  ↓     ↓      ↓
utils + config
```

职责边界：

- `server/index.js`：BFF，只负责静态托管、高德 Web 服务代理、高德瓦片代理；不保存业务数据。
- `main.js`：业务编排层，负责启动、切换 trip/day、规划路线、打开弹窗、处理分享图。
- `state.js`：唯一 workspace/trip 状态源。所有修改必须走 mutator。
- `storage.js`：localStorage workspace 持久化，已经接入主流程。
- `api/`：只封装高德 SDK 能力，不读 DOM，不改 state。
- `render/`：只渲染 UI 和收集交互，通过 handlers 回到 `main.js`。
- `share-image.js`：独立 Canvas 绘制模块，输入 trip，输出 PNG。

新功能优先新建模块，不要继续把 `main.js` 做厚。

---

## 4. 当前目录结构

```text
trip-app/
├── Dockerfile
├── package.json
├── package-lock.json
├── .env.example
├── server/
│   └── index.js
├── index.html
├── css/
│   └── app.css
└── js/
    ├── main.js
    ├── state.js
    ├── storage.js
    ├── config.js
    ├── utils.js
    ├── share.js
    ├── share-image.js
    ├── route-config.js
    ├── time-slots.js
    ├── data/
    │   └── trip.js
    ├── api/
    │   ├── amap-loader.js
    │   ├── geocode.js
    │   └── routing.js
    └── render/
        ├── workspace-tabs.js
        ├── sidebar.js
        ├── map.js
        ├── search-modal.js
        ├── event-editor-modal.js
        ├── day-editor-modal.js
        ├── route-editor-modal.js
        ├── share-modal.js
        ├── trip-modal.js
        ├── date-picker.js
        └── icons.js
```

---

## 5. 当前功能状态

Workspace：

- 最多 3 条 trip。
- 顶部活页本标签展示路线。
- 少于 3 条时显示 `+` 标签新建路线。
- active 标签菜单支持修改名称、删除行程。
- localStorage 自动保存，刷新恢复。
- 空 workspace/空 trip/空日期都有对应空状态。

日期：

- 新建一天、编辑日期、编辑当天标题、删除某天。
- 允许 trip.days 为空。
- 日期统一 ISO 格式，已有日期不可重复。
- 日期按时间排序。
- 日期选择器为自绘控件，不依赖原生 date input。

地点/日程：

- 支持搜索添加地点，也支持插入到某个事件后。
- 支持编辑标题、图标、时间块、备注。
- 地点信息只能通过搜索结果替换，名称/地址/坐标不允许直接手填。
- 当前地点卡只展示名称和详细地址；无地址显示“暂无详细地址”。
- 支持删除、上移/下移、同一天内拖拽排序。
- 时间块顺序：上午、中午、下午、晚上、未定。

地图：

- 高德地图 JS API 2.0。
- marker、路线 polyline、InfoWindow、点击日程聚焦地点。
- 空 trip 或没有任何被日程引用的地点时，地图清空 marker/route，回到中国视图。
- `render/map.js` 使用 RAF 做 center/zoom 缓动；InfoWindow 禁用 AMap `autoMove`。

路线：

- 基础 mode：`driving | walking | transit | riding`。
- 旧结构仍兼容：`routeToNext: { mode }`。
- 新结构：`routeToNext: { mode, label?, legs? }`。
- `label` 是路线卡主标题。
- `legs` 是展示步骤列表，例如步行到地铁站、地铁 6 号线、步行到目的地。
- 第一版不做真实分段路线；地图仍使用一个高德基础 mode 规划。

分享：

- 主分享方式是 PNG 长图。
- 分享弹窗可选择是否包含交通方式。
- 分享图使用真实 trip 数据，不允许 mock data。
- 分享图地图使用 `/_AMapTile` 代理拉高德瓦片，避免 canvas 跨域污染。
- 分享图地图会收集所有被日程引用且有坐标的去重地点，并自动计算合适视野。
- 地图地点标不显示数字；下方时间轴负责行程序号。
- 旧 `#trip=` 链接仍可读取并导入当前 workspace。

---

## 6. 数据模型

Workspace：

```js
workspace = {
  trips: Trip[],
  activeTripId
}
```

Trip：

```js
trip = {
  id,
  title,
  subtitle,
  city,
  locations: {
    [id]: {
      name,
      query,
      addr,
      lnglat: [lng, lat],
      searchTerms?,
      includeKeywords?,
      resolveBy?,
      resolved?
    }
  },
  days: [
    {
      id,
      date,      // ISO: YYYY-MM-DD
      title,
      events: [
        {
          id,
          title,
          icon,
          timeSlot,   // '', morning, noon, afternoon, evening
          note,
          locationId,
          routeToNext: {
            mode,
            label,
            legs
          }
        }
      ]
    }
  ]
}
```

`routeToNext.legs`：

```js
[
  { mode: 'walking', label: '步行到地铁站' },
  { mode: 'transit', label: '地铁 6 号线' }
]
```

状态分两类：

- `workspace/trip`：可序列化，保存到 localStorage，未来可同步。
- `appState`：不可序列化，保存 AMap 实例、marker、route service、overlay、route card 等运行时对象。

---

## 7. state.js 事件与 mutator

主要 workspace mutator：

- `initWorkspace(savedWorkspace, sharedTrip)`
- `createTrip(title)`
- `switchTrip(tripId)`
- `renameTrip(tripId, title)`
- `deleteTrip(tripId)`

主要 trip mutator：

- `addDay()`
- `updateDay()`
- `removeDay()`
- `addLocation()`
- `addEventToDay()`
- `updateEventInDay()`
- `removeEventFromDay()`
- `moveEventInDay()`
- `reorderEventInDay()`
- `updateRouteToNext()`

主要事件：

- `workspace:changed`
- `workspace:replaced`
- `trip:changed`
- `trip:replaced`
- `location:updated`

当前 `main.js` 会在 workspace/trip/location 变更后触发重渲、地图同步和 `saveWorkspace(getWorkspace())`。

---

## 8. 高德 Key 与 BFF

`js/config.js` 按 hostname 选择 JS API Key：

- 本地：dev key
- 线上：prod key

安全密钥 `AMAP_JSCODE` 只允许在服务端环境变量中出现，不能写入 `js/`、文档或提交记录。

BFF 流程：

1. `api/amap-loader.js` 设置 `window._AMapSecurityConfig.serviceHost = location.origin + '/_AMapService'`。
2. 高德 SDK Web 服务请求打到同源 `/_AMapService/...`。
3. `server/index.js` 转发到 `https://restapi.amap.com`，并注入 `jscode=$AMAP_JSCODE`。
4. BFF 需要透传 `Referer` / `Origin`，否则高德域名白名单校验可能失败。
5. 分享图地图瓦片走 `/_AMapTile` 同源代理。

本地 `.env` 示例：

```text
AMAP_JSCODE=<dev jscode>
PORT=8080
```

---

## 9. 分享长图状态

文件：[js/share-image.js](js/share-image.js)

当前方案：

- 逻辑宽度 420px，`SCALE = 2.5` 上采样输出高清 PNG。
- 顶部：品牌条、分享日期、旅行标题、日期范围。
- 统计：地点数、行程天数、停留数。
- 地图：真实高德瓦片、暖色滤镜、所有去重地点 marker。
- 行程：按日期分组的时间轴卡片。
- 可选：包含交通方式时，在事件之间绘制路线 chip。
- 结尾：`END OF TRIP`、`Have a nice trip!`、中文祝福。

最近调整：

- 地图视野计算改为使用逻辑像素，避免高清 canvas 缩放导致 zoom 过大。
- 地图标记不显示数字。
- 事件标题、地点、备注字号下调，并统一测量/绘制行高，让文本组在事件卡内更居中。

已知限制：

- 当前没有持久保存每段路线规划结果，因此分享图不能准确统计真实道路总里程。
- 交通方式展示只基于 `routeToNext` 配置，不重新请求每段路线。
- 瓦片加载失败时会退化为本地浅色网格底图。

---

## 10. 部署

生产部署目标：

- 仓库：`https://github.com/Akira4591/travel_with_me`
- Zeabur：阿里云北京自部署集群
- 生产地址：`https://travelwithyou.preview.aliyun-zeabur.cn`

当前部署依赖 Node/Hono，不能当纯静态站部署。

Dockerfile 应保持类似：

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 8080
CMD ["node", "server/index.js"]
```

Zeabur Variables 必须设置：

```text
AMAP_JSCODE=<prod jscode>
```

上线后检查：

- 域名能打开。
- 地图能加载。
- POI 搜索能用。
- 路线规划能返回。
- 分享长图能显示地图瓦片。
- 前端源码里搜不到 jscode。

---

## 11. 已知坑

1. 当前已经不是纯前端项目，必须通过 Node/Hono 服务运行。
2. 高德域名白名单依赖 `Referer`，BFF 代理不能随意丢头。
3. 高德 SDK 返回的 `info` 可能是 `OK` 或 `ok`，判断时要大小写不敏感。
4. AMap Driving 的 `service.search` 参数形式和其它 mode 不完全一样，`api/routing.js` 已处理。
5. 日期编辑必须保持 ISO 日期，否则排序和日期选择器会退化。
6. 切换 trip 或 replace trip 后必须清理旧 marker / route overlays。
7. 分享图用 canvas，跨域图片会污染画布；地图瓦片必须走同源代理。
8. localStorage workspace 是本机数据，不能当跨设备同步方案。
9. 当前拖拽只支持同一天内排序，不支持跨天移动。
10. 组合交通方式目前不等于真实分段导航。

---

## 12. 后续优化方向

优先级建议：

1. 分享图继续美化：地图、事件卡密度、交通方式展示、字体层级、整体旅行手账感。
2. 让别人真正使用：确定无登录/登录、localStorage/云端保存、短链接分享、继续编辑策略。
3. 移动端界面适配：小屏列表/地图切换、底部抽屉、弹窗、日期 tab、分享预览。
4. 交通方式模型升级：支持中转点/途经点，让组合交通能映射到真实分段路线。
5. 数据同步：在 localStorage 基础上增加可选云端保存，不要一开始就做重协作。

---

## 13. 接手建议

1. 先跑 `npm start`，访问 `http://localhost:8080`。
2. 从 `main.js -> boot()` 看启动流程。
3. 看 `state.js` 的 workspace/trip mutator，理解数据怎么改。
4. 看 `render/workspace-tabs.js`、`render/sidebar.js` 和各 modal，理解 UI 事件如何回到 `main.js`。
5. 做分享图只改 `share-image.js`，不要影响主页面 UI。
6. 做交通方式真实分段前，先设计中转点数据模型。
7. 做“别人使用”前，先确定产品策略：无登录本地优先、短链接只读，还是账号云端保存。
