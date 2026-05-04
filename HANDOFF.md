# Trip App · 项目进展与交接文档

> 给后续接手的 AI（Codex 等）和未来的自己看。覆盖架构、当前状态、已知坑、还没做完的事。

最后更新：2026-05-04（当天 BFF 安全改造 + 日期格式重构 + 自绘日期选择器）。

---

## 1. 项目是什么

纯前端的多日旅行行程可视化 + 路线规划工具，基于高德 JS API 2.0。当前内置数据是"五一北京 4 天"行程。一开始是静态站，**今天刚刚加上了一层 Hono BFF** 用来把高德安全密钥从前端挪到服务端。

**部署**：Zeabur 自部署集群（阿里云北京 2C），生产 URL `https://travelwithyou.preview.aliyun-zeabur.cn`。

**仓库**：https://github.com/Akira4591/travel_with_me

---

## 2. 架构

依赖单向，新增了一层 server：

```
        server/index.js  ← Hono BFF（托管前端 + 代理高德 Web 服务）
              ↑
       index.html, css/, js/  ← 前端，由 server 静态托管
              ↑
            main.js
         ↓    ↓    ↓
      state  api  render
         ↓    ↓     ↓
        utils + config
```

- `state.js` 是唯一状态源，所有 trip 修改通过 mutator + `emit('trip:changed')`
- `api/` 只和高德 SDK 打交道，不写 DOM
- `render/` 只渲染 + 收集交互，通过 handlers 回到 `main.js`
- `main.js` 编排业务流程
- `server/index.js` ≈ 60 行，做两件事：托管静态前端 + 代理 `/_AMapService/*` 到 `restapi.amap.com` 时注入 jscode

### 目录结构

```
trip-app/
├── Dockerfile              # 给 Zeabur 用
├── package.json            # Hono + @hono/node-server
├── .env.example            # AMAP_JSCODE 占位
├── .env                    # 本地真值（gitignored）
├── server/
│   └── index.js            # Hono BFF
├── index.html
├── css/app.css
└── js/
    ├── main.js             # 业务编排
    ├── state.js            # 唯一状态源
    ├── config.js           # 高德 Key + 城市/颜色等常量
    ├── storage.js          # localStorage 封装（接口已就位、还没接入）
    ├── share.js            # URL hash 分享
    ├── utils.js            # 纯函数：日期/距离/时间/转码
    ├── data/trip.js        # 内置初始行程
    ├── api/
    │   ├── amap-loader.js  # SDK 单例加载，设置 _AMapSecurityConfig.serviceHost
    │   ├── geocode.js      # POI 搜索 + 坐标解析
    │   └── routing.js      # 4 种交通方式路线规划
    └── render/
        ├── map.js
        ├── sidebar.js
        ├── search-modal.js
        ├── event-editor-modal.js
        ├── day-editor-modal.js
        ├── share-modal.js
        └── icons.js
```

---

## 3. 高德 Key / 安全密钥（重要）

**两套 Key + 两把 jscode**，按 `location.hostname` 自动切换（[js/config.js](js/config.js) 里）：

| 用途 | JS API Key（公开） | jscode（机密） | 高德后台白名单 |
|---|---|---|---|
| 本地开发 | `a32b44e9ac97100b36d87b0d961976a9`（写死在 config.js） | `.env` 里的 `AMAP_JSCODE` | 留空 |
| 生产 | `7204bb52ceac03112bb024af2f270444`（写死在 config.js） | Zeabur 环境变量 `AMAP_JSCODE` | `travelwithyou.preview.aliyun-zeabur.cn` |

**铁律**：
- ⛔ **`amapSecurityCode` / jscode 永远不能进 `js/` 任何文件，永远不能进 git**
- ⛔ 不要把生产 jscode 发给 AI / 贴到对话框 / 记在文档里
- ✅ 修改任何走高德 Web 服务的代码（geocode / POI / 路径规划）后，验证 BFF 仍能正确转发（前端 devtools 里搜不到 jscode）

### BFF 工作原理

1. 前端 `js/api/amap-loader.js` 设置 `window._AMapSecurityConfig.serviceHost = location.origin + '/_AMapService'`
2. SDK 把所有 Web 服务请求发到 `<同源>/_AMapService/v3/...`
3. BFF（[server/index.js](server/index.js)）剥掉 `/_AMapService` 前缀，拼上 `https://restapi.amap.com`，注入 `jscode=$AMAP_JSCODE`，转发
4. **必须透传 `Referer` 头**，否则高德按域名白名单返回 `INVALID_USER_DOMAIN (10006)`

---

## 4. 本地开发

```bash
cd trip-app
npm install
# 创建 .env，写入 AMAP_JSCODE=<dev jscode>
npm start
# → http://localhost:8080
```

**改前端代码（js / css / html）**：浏览器 `Ctrl+R` 刷新即可，无需重启 server。

**改 server/index.js**：要 `Ctrl+C` 重启 `npm start`。或者改用 `npm run dev`（带 `--watch`）自动重启。

---

## 5. 部署到 Zeabur

由于用户的 GitHub OAuth 闪退（无法走"GitHub 仓库"模式），用的是「**任意 Git**」模式，**需要把 Dockerfile 内容粘贴到 Zeabur 服务设置里的 UI 字段**（仓库根目录的 `Dockerfile` 文件 Zeabur 不会自动读）。

仓库里那份 Dockerfile 是给未来迁出 Zeabur（Render / Fly / 自建 docker）用的。

**部署流程**：

1. `git push origin main` 到 GitHub
2. Zeabur dashboard → 服务 → 「重新部署」按钮
3. （首次）服务设置 → Dockerfile 字段粘贴：

   ```dockerfile
   FROM node:22-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --omit=dev
   COPY . .
   EXPOSE 8080
   CMD ["node", "server/index.js"]
   ```

4. （首次）Variables 字段加 `AMAP_JSCODE = <prod jscode>`
5. （首次）网络/公网访问 → 容器端口 8080 → 绑域名 `travelwithyou.preview.aliyun-zeabur.cn`

**改环境变量后 Zeabur 会自动重新部署。**

---

## 6. 今天做了什么（详细）

按提交时间顺序：

| Commit | 说明 |
|---|---|
| `dac70d5` | Refine itinerary editing UI follow-up（之前会话遗留的行程编辑改动收尾） |
| `91dc76f` | **Move AMap security code to BFF** ：新建 server/、package.json、Dockerfile（仓库版）、.env.example；前端 config.js 删 `amapSecurityCode`，改 hostname 切 key；amap-loader.js 用 serviceHost |
| `39c5896` | Add Dockerfile for Zeabur arbitrary-Git deploy |
| `df7b473` | **Forward Referer/Origin in AMap proxy** ：修复 BFF 不转发 Referer 导致全部请求 `INVALID_USER_DOMAIN` |
| `7dbf5ff` | **Fix walking/driving routes falling back to estimate** ：高德 SDK 在不同接口返回 `info: 'OK'` 大写和 `'ok'` 小写都有，原代码严格比对大写 → 全部走估算兜底；改成大小写不敏感 |

### 还没提交（pending 验证）

> 用户希望先在本地 `npm start` 验证完再 push。

**日期格式重构**：把 `day.date` 从自由格式中文（`'5月1日'`）迁到 ISO（`'2026-05-01'`），显示用 `formatDateCN()` 转回 `'5月1日'`（隐藏年份）；新建一天默认日期 = 最后一天 +1。日期编辑器已从浏览器原生控件换成自绘 Notion 风格日期选择器，表单仍提交 ISO 值。

**改的文件**：`js/utils.js`、`js/data/trip.js`、`js/state.js`、`js/main.js`、`js/render/sidebar.js`、`js/render/day-editor-modal.js`、`js/render/date-picker.js`、`css/app.css`。

**Tab 上的"+ 新建一天" → 单字符 "+"**（带 tooltip）。

---

## 7. 已知坑（避免重复踩）

1. **高德 Web 服务接口的域名白名单靠 Referer 头校验**，不是 URL 里的 `appname` 参数。BFF 必须透传 Referer。
2. **高德 SDK 的 `info` 字段大小写不一致**：地理编码返回 `'OK'`，驾车/步行返回 `'ok'`。比对要不区分大小写。
3. **JS API Key 白名单不接受 `localhost` 和 IP**——要加白名单只能用真域名。本地开发用一把白名单留空的 dev key。
4. **Zeabur「任意 Git」模式不读仓库根目录的 Dockerfile**，必须粘到 UI。
5. **preview 域名（`*.preview.aliyun-zeabur.cn`）不需要 ICP 备案**；自定义域名（中国大陆境内服务器）需要。
6. **prod key 和 prod jscode 必须配对**——前端用 prod key 时，BFF 的 `AMAP_JSCODE` 也得是 prod 那把。错配同样会 `INVALID_USER_DOMAIN`。
7. **AMap Driving 的 `service.search` 要 4 个参数**（带 `{}`），其它 mode 是 3 个，[routing.js:70](js/api/routing.js:70) 已处理。
8. **数据迁移**：`day.date` 从中文字符串改成 ISO 后，旧的 share URL（`#trip=base64`）打开时 date 字段是中文字符串。`formatDateCN` 已做兼容（非 ISO 原样返回），但**编辑时日期选择器会空**。这是可接受的退化（share URL 是个未广泛使用的功能）。

---

## 8. README 里的 TODO（剩余）

1. **每段路线独立选择/自定义交通方式**（当前是初始数据写死 `routeToNext.mode`，编辑器里没暴露切换 UI）+ **路线卡视觉减重**
2. ~~更新高德 API：迁服务到后端代理隐藏 key~~ ✅ 今天做了
3. **短链分享 + 草稿持久化**：`storage.js` 接口已写好但未接入；BFF 已经有了，加个 KV（Redis / Postgres / 甚至文件）就能做
4. **移动端适配**：当前桌面布局直接压缩，体验差

### 用户当下提的需求

- ✅ 日期编辑器换日期选择器（已改成自绘弹层日历，不再使用原生 `type="date"`）
- ✅ 列表/Tab 显示隐藏年份（已实现）
- ✅ "+ 新建一天" 简化为 "+"（已实现）
- ✅ 用户提过"借鉴 Notion 风格"日历——已自造轻量日期选择器，避免引入额外依赖

---

## 9. 代码风格约定

- **注释只写 WHY**，不写 WHAT。命名好的代码不需要解释做什么。
- **不写多行 docstring**，单行注释最多。
- **不主动加错误处理**——只在系统边界（用户输入、外部 API）做。内部代码相信类型/前置条件。
- **不做无用抽象**——3 处类似代码好过过早抽象。
- **mutator 全部走 state.js**，不直接改 trip。
- **新功能优先新建模块**，不堆 main.js。
- 中文注释 OK，跟现有代码一致。

---

## 10. 给接手者的建议入手顺序

1. **先确认本地能跑**：`npm install && npm start`，访问 `localhost:8080`，地图能加载、POI 搜索能搜出结果。如果报 `AMAP_JSCODE 未设置`，说明缺 `.env`。
2. **看 [main.js](js/main.js)**（405 行）从 `boot()` 开始，理解一次启动流程：加载 SDK → 渲染界面 → 后台校准坐标 → 选当前日 → 规划路线。
3. **挑一个小特性切入**，比如把"自定义每段交通方式"做了：
   - UI 改动主要在 [event-editor-modal.js](js/render/event-editor-modal.js) 加 mode 选择
   - state.js 已有 `updateEventInDay` 支持 `routeToNext` patch
   - sidebar 里 route card 显示已经会跟着模式走
4. **大动作（DB / mobile）前先聊清楚目标**，避免做完发现方向不对。

---

## 附：环境变量清单

| 变量 | 必需？ | 哪里设置 | 说明 |
|---|---|---|---|
| `AMAP_JSCODE` | ✅ | 本地 `.env` / Zeabur Variables | 高德安全密钥，必须与前端用的 JS API Key 配对 |
| `PORT` | 否 | Zeabur 自动注入 / 默认 8080 | BFF 监听端口 |
