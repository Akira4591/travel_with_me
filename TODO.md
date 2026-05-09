# Trip App TODO

最后更新：2026-05-09

本文档替代旧 `HANDOFF.md`，记录当前项目状态、已知风险和下一步优化方向。旧交接文档已过时，不再维护。

## 当前项目认知

- 项目形态：Node/Hono BFF + 原生 ES Modules 前端，无 React/Vue/Vite 构建流程。
- 运行方式：`npm start` 普通启动；`npm run dev` 使用 `node --watch server/index.js` 自动重启后端。
- 状态模型：`workspace = { trips, activeTripId }`，最多 3 条路线；每条 trip 至少保留 1 天，并支持 `unscheduled[]` 未排期地点池。
- 持久化：workspace 保存到 localStorage；旧 schema 会被 reset，不做迁移兼容。
- 地图与路线：高德 JS API 2.0 + BFF 注入 `AMAP_JSCODE`；地图瓦片走 `/_AMapTile` 供分享长图使用。
- AI 导入：入口合并在顶部 `+` 标签 hover 展开里；BFF 调 DeepSeek `deepseek-v4-flash`；前端有解析进度条、导入预览、未匹配地点手动搜索兜底。
- AI 导入写入：导入始终创建新 trip；按 day 写入 `days[].events`，无 day 写入 `unscheduled[]`；未匹配地点允许以无坐标 location 导入。
- 地点匹配：当前有多层降级，包括 PlaceSearch、note/source quote 关键词扩展、Geocoder 坐标兜底、附近 POI enrich；预览页可手动搜索替换未匹配地点。

## P0 风险

1. **AI Prompt 运行时依赖 PRD 文件**
   - 已处理：正式 Prompt 已迁移到 `server/prompts/guide-extract.md`，`server/index.js` 不再读取本地 PRD。
   - `Travel_with_Me_AI攻略导入_PRD_v2.md` 继续作为本地设计档案并被 `.gitignore` 忽略。
   - 后续 Prompt 迭代应更新 `server/prompts/guide-extract.md`，不要再依赖 PRD 文件。

2. **AI 地点抽取边界还不稳定**
   - 有时模型会把“游玩项目、体验内容、路线描述、交通建议”当作地点。
   - 需要在 Prompt 中更明确地区分：
     - 地点：可在地图上搜索、可作为行程节点的 POI。
     - 补充信息：游玩项目、拍照点、菜品、排队建议、门票、交通提醒、路线描述。

3. **备注字段需要重新定义**
   - 当前备注可能过长，也可能把原文路线片段带入事件。
   - 需要决定备注策略：
     - 保留原文短摘录；
     - 或提取关键信息；
     - 或只保留用户真正需要执行/注意的信息。
   - 建议备注限制在 40-80 中文字，优先保留预约、费用、开放时间、避坑、路线提醒等可执行信息。

## AI 导入 Prompt 优化

1. 地点抽取规则
   - 只输出真实 POI 或明确地名。
   - 不把“坐船、登塔、看日落、拍照、逛街、吃海鲜、买伴手礼”等动作当作地点。
   - 不把“地铁、公交、自驾、步行、路线串联”当作地点。
   - 如果文本里出现“在 A 做 B”，`place_name` 应为 A，B 进入 note。

2. 地点粒度
   - 优先输出用户能在地图上直接搜索的名称。
   - 商圈、街区、景区、餐厅、酒店、车站可以是地点。
   - 景区内部项目只有在它本身是可搜索 POI 时才作为地点，否则进入 note。

3. 备注提取
   - note 不应复述完整原文。
   - note 只保留对行程执行有帮助的信息。
   - note 建议限制 40-80 字；超出时压缩为关键信息。
   - 避免把多个地点串联路线写进单个地点 note。

4. 未排期判断
   - 推荐合集、备选餐厅、备选景点进入 `unscheduled[]`。
   - 明确属于某一天的地点进入对应 Day。
   - 不确定 day 但确定是旅行地点时，进入未排期，不丢弃。

5. 匹配失败反馈
   - 未匹配地点保留在预览中，允许用户手动搜索绑定。
   - 未匹配时不显示 AI note，避免把错误上下文误认为备注。
   - 后续可在预览页提供“显示原文依据”的折叠调试入口，但默认不展示。

## 产品体验 TODO

1. AI 导入过程可解释化
   - 现有进度条已有四步：AI 解析、匹配地点、整理预览、完成。
   - 后续可加入每一步的失败原因展示，例如 DeepSeek 超时、JSON 空输出、高德搜索为空、Geocoder 兜底命中。

2. AI 预览页编辑能力
   - 当前支持改 title、day、timeSlot、删除、未匹配手动搜索。
   - 后续应支持直接编辑事件标题和备注。
   - Day/timeSlot 下拉可以升级为与主编辑弹窗一致的自定义选择器，减少原生 select 的突兀感。

3. 地点匹配质量
   - 建立 20-30 篇真实攻略评测集，记录地点召回率、误提取率、day 归属准确率、note 有用率。
   - 把“模型抽错”和“高德搜不到”分开统计。
   - 对常见城市和热门景区做 bad case 归因。

4. 分享长图
   - 继续优化字体层级、事件卡密度、地图裁切、交通方式展示。
   - 需要决定未排期地点是否进入分享图，以及进入时如何展示。

5. 移动端适配
   - 当前主要按桌面端设计。
   - 后续需要小屏下的列表/地图切换、底部抽屉、弹窗高度、分享预览滚动优化。

6. 数据保存与分享
   - localStorage 只适合本机草稿。
   - 后续需要决定无登录云端保存、登录同步、短链接分享、只读分享页和继续编辑策略。

7. 交通方式模型
   - 当前组合交通主要用于展示，地图仍按一个高德基础 mode 规划。
   - 后续如要真实组合路线，需要引入中转点/途经点模型。

## 工程 TODO

1. Prompt 持久化位置
   - 已迁移到 `server/prompts/guide-extract.md`。
   - PRD 文档继续作为本地设计背景，不作为运行时依赖。
   - 后续要在该 Prompt 文件中补充“游玩项目/补充信息不是地点”的更强规则。

2. 日志治理
   - 当前 AI 地点匹配有较多 `console.log` 用于 debug。
   - 后续应加环境开关，例如 `DEBUG_AI_IMPORT=1`。
   - 生产环境默认只保留 warning/error。

3. DeepSeek 模型策略
   - 当前使用 `deepseek-v4-flash`，因为 `deepseek-v4-pro` 在 JSON Output 下出现空 content。
   - 保留 JSON 空输出自动重试。
   - 后续可按评测集比较 flash/pro 的稳定性和成本。

4. 地点搜索 API 边界
   - `searchPlaces()` 目前支持 `city: false` 全域搜索。
   - 需要继续确认高德 PlaceSearch 在城市名、adcode、全域三种输入下的差异。

5. 文档更新
   - README 需要在 AI 导入稳定后补充：环境变量、AI 功能、DeepSeek 模型、Prompt 位置、部署检查项。
   - 旧 `HANDOFF.md` 删除后，不再新建同名交接文档；后续统一维护 README + TODO。
