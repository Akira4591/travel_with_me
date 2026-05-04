# Trip Map Builder

纯前端的多日旅行行程可视化 + 路线规划工具。当前内置数据是“五一北京 4 天”行程，目标是逐步做成通用的、可编辑、可分享的多日行程生成器。

## 当前功能

- 多日行程展示：支持“全部”和单日视图切换
- 高德地图联动：地点 marker、路线 polyline、点击行程卡聚焦地点
- 路线规划：支持驾车/打车、步行、骑行、公共交通
- 日期管理：支持新建一天、编辑日期/当天标题、删除某一天
- 地点搜索与添加：按天添加地点，也可以插入到某个日程后面
- 行程编辑：修改标题、从内置黑白图标集中选择图标、通过地点搜索替换地点
- 删除与移动：支持删除日程、上移/下移、同一天内拖拽排序
- 坐标校准：启动后用高德后台校准内置地点坐标
- 路线分享：生成带 `#trip=` 的纯前端分享链接，打开后还原当前行程

## 本地运行

这个项目使用原生 ES Modules，不能直接用 `file://` 打开，需要启动 HTTP 服务。

```bash
python -m http.server 8765
```

然后访问：

```text
http://127.0.0.1:8765/
```

也可以用：

```bash
npx serve .
```

## Zeabur 部署

可以直接用 Zeabur 的 Local Project 上传当前文件夹。

上传目录必须是包含 `index.html` 的这一层：

```text
trip-app/
├── index.html
├── css/
├── js/
└── README.md
```

部署后需要去高德控制台检查 Web 端 Key 的域名白名单，把 Zeabur 分配的域名加入允许列表，否则线上地图可能加载失败。

## 目录结构

```text
trip-app/
├── index.html
├── README.md
├── css/
│   └── app.css
└── js/
    ├── main.js
    ├── config.js
    ├── state.js
    ├── storage.js
    ├── share.js
    ├── utils.js
    ├── data/
    │   └── trip.js
    ├── api/
    │   ├── amap-loader.js
    │   ├── geocode.js
    │   └── routing.js
    └── render/
        ├── day-editor-modal.js
        ├── event-editor-modal.js
        ├── icons.js
        ├── map.js
        ├── search-modal.js
        ├── share-modal.js
        └── sidebar.js
```

## 架构原则

依赖方向保持单向：

```text
       main.js
      ↓   ↓   ↓
  state  api  render
      ↓   ↓     ↓
       utils + config
```

- `state.js` 是唯一状态源，所有 trip 修改都通过 mutator 完成
- `api/` 只和高德 SDK 打交道，不写 DOM，不读 UI 状态
- `render/` 只负责渲染和收集交互，通过 handlers 把事件交给 `main.js`
- `main.js` 负责业务编排：加载、选择日期、规划路线、处理编辑流程
- 新功能优先新建模块，避免把 `main.js` 堆成大文件

## 已知限制

- 当前没有后端，刷新页面会丢失未分享/未保存的内存修改
- 分享链接使用 URL hash 承载完整 trip 数据，链接会比较长
- 高德 Key 仍在前端 `js/config.js`，上线时必须设置域名白名单和调用限制
- 目前拖拽排序只支持同一天内调整，不支持跨天移动

## TODO

1. 自定义交通方式：支持用户为每段路线选择或自定义交通方式，并重新规划/重绘路线；路线卡展示也要继续减轻视觉重量。
2. 更新高德 API：当前地图 JS SDK 使用的是 `AMapLoader.load({ version: '2.0' })`，已是 JS API 2.0 大版本；后续重点是评估是否迁移 POI 搜索、路径规划到高德 Web 服务 API 2.0/v5，并结合服务端代理隐藏 key。
3. 更新分享形式：当前 `#trip=` 分享链接会把完整 trip 塞进 URL，后续改为短链接/分享 ID，并支持草稿持久化。
4. 移动端界面适配：重新设计小屏下侧栏、地图、弹窗、路线卡和日期管理入口，避免当前桌面布局直接压缩。
