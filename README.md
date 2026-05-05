# Trip App

一个中文旅行路线规划 Web App，用来创建多条旅行路线、管理多日行程、搜索地点、规划交通方式，并生成旅行手账风格的分享长图。

当前项目不是 React/Vue/Vite 项目，而是：

- 前端：原生 ES Modules + 原生 DOM 渲染
- 地图：高德地图 JS API 2.0
- 服务端：Node.js + Hono，用作静态托管和高德代理
- 存储：localStorage workspace，本地最多保存 3 条旅行路线
- 分享：Canvas 生成 PNG 长图，兼容旧版 `#trip=` 链接导入

## 当前功能

- 多旅行路线 workspace：顶部活页本标签切换，最多 3 条路线。
- 本地自动保存：刷新后恢复 workspace、当前路线和编辑内容。
- 新建/重命名/删除旅行路线：首次启动默认包含“五一北京行程”演示数据。
- 日期管理：新建一天、编辑日期和当天标题、删除日期，日期按时间排序且不可重复。
- 行程管理：添加地点、编辑地点、删除地点、同一天内拖拽排序。
- 时间块：支持未定、上午、中午、下午、晚上，并按时间块组织当天地点。
- 地点搜索：通过高德 POI 搜索添加或替换地点；地点名称、地址、坐标只作为确认信息展示。
- 地图联动：点击地点聚焦地图，自动展示当天/全部地点；空行程显示中国视图且不残留 marker。
- 路线规划：支持打车/驾车、步行、公共交通、骑行；失败时有估算兜底。
- 自定义路线展示：每段路线可设置展示名称和组合步骤，地图规划仍绑定一个高德基础 mode。
- 分享长图：可生成 PNG，支持选择是否包含交通方式；地图使用真实高德瓦片和全部去重地点标。

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

如果 8080 被占用，Windows PowerShell 可先找到并结束占用进程：

```powershell
Get-NetTCPConnection -LocalPort 8080 | Select-Object -ExpandProperty OwningProcess
Stop-Process -Id <PID> -Force
```

开发时也可以使用：

```bash
npm run dev
```

## 环境变量

高德安全密钥不能放在前端。服务端从环境变量读取：

```text
AMAP_JSCODE=<your-amap-jscode>
PORT=8080
```

本地可参考 `.env.example`。生产环境需要在部署平台配置 `AMAP_JSCODE`。

## 部署

当前项目需要 Node/Hono 服务，不是纯静态站。Zeabur 部署时上传包含 `package.json`、`server/`、`index.html` 的项目根目录。

部署后需要检查：

- 高德 Web JS API Key 的域名白名单包含生产域名。
- `AMAP_JSCODE` 已配置在服务端环境变量。
- 地图、地点搜索、路线规划和分享长图地图瓦片都能正常加载。

## 目录结构

```text
trip-app/
├── Dockerfile
├── package.json
├── server/
│   └── index.js              # Hono BFF：静态托管、高德服务代理、瓦片代理
├── index.html
├── css/
│   └── app.css
└── js/
    ├── main.js               # 入口和业务编排
    ├── state.js              # workspace/trip 唯一状态源
    ├── storage.js            # localStorage workspace 存储
    ├── config.js             # 高德 key、地图默认配置
    ├── route-config.js       # 路线配置与组合交通方式规范化
    ├── time-slots.js         # 时间块定义和排序
    ├── share.js              # 旧 #trip= 链接兼容
    ├── share-image.js        # Canvas 分享长图生成
    ├── api/
    │   ├── amap-loader.js
    │   ├── geocode.js
    │   └── routing.js
    ├── data/
    │   └── trip.js           # 五一北京演示数据
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

## 架构原则

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

- `state.js` 是唯一状态源，所有 trip/workspace 修改都通过 mutator 完成。
- `main.js` 负责业务编排：启动、切换路线/日期、规划路线、打开弹窗、生成分享图。
- `api/` 只封装高德能力，不读 DOM，不改 state。
- `render/` 只负责 UI 渲染和收集交互，通过 handlers 回到 `main.js`。
- `share-image.js` 独立输入 trip 输出 PNG，不依赖页面 DOM 结构。

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
    [id]: { name, query, addr, lnglat }
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

`routeToNext.mode` 仍是高德实际规划模式：

```text
driving | walking | transit | riding
```

`label` 和 `legs` 用于路线卡/分享图展示，第一版不会拆成多段地图路线。

## 已知限制

- localStorage 只适合本机草稿，不支持跨设备同步。
- 分享长图是当前主分享方式；旧 `#trip=` 长链接只做兼容。
- 组合交通方式目前主要用于展示说明，地图仍按一个高德基础 mode 规划。
- 拖拽排序只支持同一天内调整，不支持跨天拖动。
- 移动端还没有做专门布局。

## 后续 TODO

1. 分享图继续美化：字体层级、地图标密度、交通方式展示、整体旅行手账感。
2. 让别人真正使用：确定无登录/localStorage/短链接/云端保存的产品方案。
3. 移动端界面适配：列表和地图切换、底部抽屉、弹窗和分享预览。
4. 交通方式升级：支持中转点/途经点，让组合交通方式也能对应真实分段路线。
5. 数据同步方案：在不破坏本地优先体验的前提下，引入可选云端保存。
