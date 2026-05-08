# Trip App

Trip App 是一个中文旅行路线规划 Web App，用来创建多条旅行路线、管理多日行程、搜索地点、规划交通方式，并生成旅行手账风格的分享长图。

当前项目是 **Node/Hono BFF + 原生 ES Modules 前端**，不是 React/Vue/Vite 项目，也不是纯静态站。

## 当前能力

- **多路线工作区**：顶部活页本标签切换，最多本地保存 3 条旅行路线。
- **本地自动保存**：workspace 保存到 localStorage，刷新后恢复当前路线和编辑内容。
- **默认演示行程**：首次打开会加载“五一北京行程”；默认地点不再写死坐标，启动后通过高德解析。
- **日期管理**：新建一天、编辑日期/标题、删除日期；日期不可重复，并按时间排序。
- **地点管理**：搜索添加地点、替换已有地点、删除地点、同一天内拖拽排序。
- **智能一些的添加体验**：新增地点时标题自动使用地点名；可按关键词搜索，也可基于当天已有地点“搜附近”。
- **地点信息增强**：高德 POI 结果会尽量展示图片、评分、人均、标签；地点详情卡也会保留图片/type 信息。
- **时间块与备注**：地点支持未定、上午、中午、下午、晚上；支持备注。
- **地图联动**：点击地点卡片聚焦地图；没有地点时清空 marker/路线并展示中国视图。
- **路线规划**：支持打车/驾车、步行、公共交通、骑行；失败时有估算兜底。
- **自定义路线展示**：每段路线可设置展示名称和组合步骤，地图仍绑定一个高德基础 mode 规划。
- **分享长图**：Canvas 生成 PNG，可选择是否包含交通方式；地图背景走真实高德瓦片。
- **旧链接兼容**：仍支持读取旧版 `#trip=` 链接并导入当前 workspace。

## 技术栈

```text
Node.js + Hono
  ├─ 静态文件托管
  ├─ 高德 Web 服务代理：/_AMapService/*
  └─ 高德瓦片代理：/_AMapTile

Browser
  ├─ 原生 ES Modules
  ├─ 原生 DOM 渲染
  ├─ 高德地图 JS API 2.0
  ├─ localStorage workspace
  └─ Canvas 分享长图
```

项目没有前端构建流程。浏览器直接加载 `index.html`、`css/`、`js/` 下的文件。

## 本地运行

需要 Node.js 18+。

```bash
npm install
npm start
```

访问：

```text
http://localhost:8080
```

开发模式：

```bash
npm run dev
```

如果 8080 端口被占用，Windows PowerShell 可先找到并结束占用进程：

```powershell
Get-NetTCPConnection -LocalPort 8080 | Select-Object -ExpandProperty OwningProcess
Stop-Process -Id <PID> -Force
```

不要直接双击 `index.html`，也不建议用 `python -m http.server`。当前高德服务代理、瓦片代理和安全密钥注入都依赖 `server/index.js`。

## 环境变量

高德安全密钥 `jscode` 只能放在服务端环境变量里，不能写入前端代码。

```text
AMAP_JSCODE=<your-amap-jscode>
PORT=8080
```

本地可参考 `.env.example`。生产环境需要在部署平台配置 `AMAP_JSCODE`。

## 部署

当前部署依赖 Node/Hono。部署目录必须是包含 `package.json`、`server/`、`index.html` 的项目根目录。

Zeabur 或类似平台需要：

- 使用 Node 18+。
- 安装依赖后运行 `node server/index.js`。
- 配置环境变量 `AMAP_JSCODE`。
- 在高德控制台把生产域名加入 Web JS API Key 的域名白名单。

上线后建议检查：

- 地图能加载。
- POI 搜索能返回结果。
- 搜附近可用。
- 路线规划能返回真实路线或估算路线。
- 分享长图能显示地图瓦片。
- 浏览器源码里搜不到 `AMAP_JSCODE`。

## 目录结构

```text
trip-app/
├── Dockerfile
├── package.json
├── package-lock.json
├── server/
│   └── index.js              # Hono BFF：静态托管、高德服务代理、瓦片代理
├── index.html
├── css/
│   └── app.css
└── js/
    ├── main.js               # 启动流程和业务编排
    ├── state.js              # workspace/trip 唯一状态源
    ├── storage.js            # localStorage workspace 存储
    ├── config.js             # 高德 key、地图默认配置
    ├── route-config.js       # 路线配置与组合交通方式规范化
    ├── time-slots.js         # 时间块定义和排序
    ├── share.js              # 旧 #trip= 链接兼容
    ├── share-image.js        # Canvas 分享长图生成
    ├── data/
    │   └── trip.js           # 五一北京演示数据，无内置坐标
    ├── api/
    │   ├── amap-loader.js
    │   ├── geocode.js        # POI 搜索、搜附近、地址解析
    │   └── routing.js        # 路线规划与估算兜底
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

## 架构约定

依赖方向保持单向：

```text
server/index.js
      ↑
Browser ES Modules
      ↑
main.js
  ↓     ↓      ↓
state   api    render
  ↓     ↓      ↓
utils + config
```

- `state.js` 是唯一状态源，所有 workspace/trip 修改都通过 mutator。
- `main.js` 负责业务编排：启动、切换路线/日期、规划路线、打开弹窗、生成分享图。
- `api/` 只封装高德能力，不读 DOM，不改 state。
- `render/` 只负责 UI 渲染和收集交互，通过 handlers 回到 `main.js`。
- `share-image.js` 只输入 trip、输出 PNG，不依赖页面 DOM 结构。

## 数据模型摘要

```js
workspace = {
  trips: Trip[],
  activeTripId
}

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
      lnglat,
      photo,
      type,
      searchTerms,
      includeKeywords,
      resolveBy,
      resolved
    }
  },
  days: [
    {
      id,
      date,
      title,
      events: [
        {
          id,
          title,
          icon,
          timeSlot,
          note,
          locationId,
          routeToNext
        }
      ]
    }
  ]
}
```

路线配置兼容旧结构：

```js
routeToNext = {
  mode: 'driving' | 'walking' | 'transit' | 'riding',
  label?: string,
  legs?: Array<{ mode, label }>
}
```

`mode` 是高德实际规划模式；`label` 和 `legs` 用于路线卡和分享图展示。当前不会按 `legs` 拆成多段地图路线。

## 高德代理说明

前端只暴露 Web JS API Key。安全密钥 `AMAP_JSCODE` 在服务端注入：

1. `api/amap-loader.js` 设置 `window._AMapSecurityConfig.serviceHost = location.origin + '/_AMapService'`。
2. 高德 SDK Web 服务请求打到同源 `/_AMapService/...`。
3. `server/index.js` 转发到 `https://restapi.amap.com`，并注入 `jscode=$AMAP_JSCODE`。
4. 分享长图地图瓦片走 `/_AMapTile`，避免跨域图片污染 canvas。

## 已知限制

- localStorage 只适合本机草稿，不支持跨设备同步。
- 分享长图是当前主分享方式；旧 `#trip=` 长链接只做兼容。
- 组合交通方式目前主要用于展示说明，地图仍按一个高德基础 mode 规划。
- 默认示例不再内置坐标，首次解析依赖高德 POI/Geocoder 返回结果。
- 拖拽排序只支持同一天内调整，不支持跨天拖动。
- 移动端还没有做专门布局。

## 后续 TODO

1. 分享图继续美化：地图、事件卡密度、交通方式展示、字体层级、整体旅行手账感。
2. 让别人真正使用：确定无登录/登录、localStorage/云端保存、短链接分享、继续编辑策略。
3. 移动端适配：小屏列表/地图切换、底部抽屉、弹窗、日期 tab、分享预览。
4. 交通方式模型升级：支持中转点/途经点，让组合交通能映射到真实分段路线。
5. 数据同步：在 localStorage 基础上增加可选云端保存。
