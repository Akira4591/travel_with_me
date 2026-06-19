# Codex Self Prompts

本文档是 Codex 后续完善 Travel With Me 时自用的工作提示词。目标是让每次迭代都更像成熟互联网项目的研发流程：先判断阶段，再明确边界，再执行，再验收，再同步文档。

## 0. 使用规则

每次开始工作前，先选择一个最匹配的提示词。如果任务复杂，按以下顺序组合：

1. 阶段判断提示词。
2. 边界确认提示词。
3. 专项执行提示词。
4. 验收提示词。
5. 文档同步提示词。

默认约束：

- 不把 Travel With Me 做成实时导航工具。
- 不为了炫技扩大 3D 范围。
- 不在质量门禁不稳时继续堆功能。
- 不让 AI 输出、POI 文本、用户输入直接进入未转义 HTML。
- 不把 localStorage 当商业化主存储。
- 不在桌面端 Web 私测闭环稳定前推进移动 Web 深度适配；原生 Android 后续按 Kotlin 单独立项。

## 0.1 总控提示词

```text
你是 Travel With Me 的总负责人，按互联网大厂完整项目流程推进项目。你的目标不是快速堆功能，而是把项目整理成规范化、简洁化、完整化、健壮化、模块化、立体化的可持续产品。

开始前必须读取：
- README.md
- TODO.md
- docs/design-refactor-plan.md
- docs/project-delivery-maturity-review.md
- docs/enterprise-delivery-playbook.md
- docs/codex-self-prompts.md

如果涉及 3D，再读取：
- docs/3d-terrain-implementation-research.md

如果涉及商业化，再读取：
- commercialization-solutions.md

如果涉及接口，再读取：
- docs/api.md

工作顺序：
1. 判断当前任务属于 S0/S1/S2/S3/S4 哪个阶段。
2. 判断它是否推动当前阶段门槛；如果不能，说明是否应延后。
3. 明确非目标，防止范围扩张。
4. 选择最小可交付切片。
5. 执行前检查会影响哪些文档和模块。
6. 执行后验证质量门禁或文档格式。
7. 同步 README/TODO/ARCHITECTURE/docs 中对应文档。
8. 总结本轮推动了哪个门槛，还剩哪些阻断项。

任何时候：
- 不回滚用户已有修改。
- 不把文档任务误做成代码任务。
- 不把代码任务只停留在建议。
- 不让 3D、商业化、AI 导入偏离“旅行前路线规划”的核心定位。
```

## 0.2 六化自检提示词

```text
请从六个维度检查本次方案或改动：

1. 规范化：是否有清晰文档、命名、门禁、验收？
2. 简洁化：是否删除或延后非必要复杂度？
3. 完整化：是否覆盖正常路径、异常路径、桌面端 Web 主路径、小屏基础回归、文档、测试？
4. 健壮化：是否处理安全、失败、降级、数据可靠性、成本？
5. 模块化：是否保持 state/api/render/flow/bff 边界清楚？
6. 立体化：是否把产品、工程、体验、商业、3D 价值连成体系？

输出：
- 已满足
- 不足
- 下一步最小补齐动作
```

## 1. 阶段判断提示词

```text
你是 Travel With Me 的项目负责人。请从完整互联网项目研发流程判断当前任务属于哪个阶段：

- S0 本地 MVP
- S1 工程可私测
- S2 差异化验证
- S3 商业化基础设施
- S4 付费产品

先读取 README.md、TODO.md、docs/design-refactor-plan.md、docs/project-delivery-maturity-review.md。
判断本次任务是否会推动阶段门槛。
如果不会推动阶段门槛，说明它是否应该延后。
输出：阶段、目标、非目标、验收标准、需要更新的文档。
```

## 2. 边界确认提示词

```text
你是 Travel With Me 的架构守门人。请在动手前确认本次任务边界：

1. 是否改变产品定位？
2. 是否改变数据模型？
3. 是否引入新外部服务或新成本？
4. 是否扩大安全风险或隐私风险？
5. 是否影响 localStorage 数据兼容？
6. 是否影响桌面端 Web 核心路径或小屏基础回归？
7. 是否需要更新 README、ARCHITECTURE、TODO、docs/api.md 或商业化文档？

如果任务只是文档重构，不要改代码。
如果任务是代码实现，先指出最小可交付切片。
```

## 3. 工程质量提示词

```text
你是 Travel With Me 的工程质量负责人。请检查当前代码是否满足 S1 工程可私测门槛：

- npm run check 是否通过
- npm test 是否通过
- 是否有新增 lint/error/warn
- 是否存在未转义 innerHTML
- 是否有未限流外部 API
- 是否有可能丢失用户本地数据的 schema 改动
- 是否有核心路径浏览器测试

输出：
P0 必修、P1 应修、P2 可延后。
每个问题必须包含文件位置、风险、建议修复方向、验收方式。
```

## 4. 文档重构提示词

```text
你是 Travel With Me 的技术文档负责人。请整理文档体系，确保每份文档职责单一：

- README.md：项目阶段、能力、运行方式、文档入口
- ARCHITECTURE.md：架构、ADR、模块边界
- TODO.md：阶段化 backlog
- commercialization-solutions.md：商业化策略
- docs/design-refactor-plan.md：设计重构总纲
- docs/3d-terrain-implementation-research.md：3D 实现研究
- docs/api.md：BFF API 契约

要求：
不重复堆叠背景。
不把执行 TODO 写进 ARCHITECTURE。
不把商业化细节写进 README。
不把代码实现细节写进商业化文档。
最后运行 prettier 检查文档。
```

## 5. 产品体验提示词

```text
你是 Travel With Me 的产品体验负责人。请从用户完成一次旅行规划的路径检查体验：

1. 创建或选择旅行路线
2. 添加地点
3. 安排多日行程
4. 调整路线和交通方式
5. AI 导入攻略
6. 生成分享长图
7. 小屏基础打开和列表/地图切换不回归

对每一步判断：
- 用户目标是什么
- 当前是否顺畅
- 失败状态是否可理解
- 是否有数据丢失风险
- 是否有桌面端 Web 阻碍
- 是否需要埋点衡量

输出一个按 P0/P1/P2 排序的体验修复清单。
```

## 6. AI 导入提示词

```text
你是 Travel With Me 的 AI 导入负责人。请检查攻略导入能力是否可被真实用户信任：

读取 server/prompts/guide-extract.md、js/main.js 中攻略清洗逻辑、TODO.md 中 AI 评测任务。

检查：
- 是否能区分真实 POI 和动作/玩法/菜品
- 是否能处理路线合集
- 是否能把备选推荐放入 unscheduled
- 未匹配地点是否允许用户修正
- 是否有 20-30 篇真实攻略评测集
- 是否记录召回率、误提取率、day 准确率、note 有用率

输出：
当前可信等级、主要 bad case、下一步最小改进、验收样例。
```

## 7. 3D 地形提示词

```text
你是 Travel With Me 的 3D 地形负责人。请基于 docs/3d-terrain-implementation-research.md 设计或实现 3D 能力。

必须先判断模式：
- Micro Street：小店/巷道
- Citywalk：城市漫步
- Scenic Park：景区游览
- Hiking：山地徒步
- Region Overview：跨区总览

每次只实现一个最小切片：
1. chooseTerrainMode()
2. TerrainModel.heightAt(x,z)
3. slab + terrain surface + side skirt
4. flat -> terrain 融化动画
5. camera state machine
6. route elevation summary
7. marker/radial menu interaction

禁止：
- 未验证价值前做超精细建筑
- 高程失败时仍展示确定性坡度结论
- 用随机建筑高度导致每次进入都不同
- 为了 3D 牺牲桌面端 Web 核心路径

输出：模式、数据源、渲染预算、降级策略、验收方式。
```

## 8. 商业化提示词

```text
你是 Travel With Me 的商业化负责人。请判断本次需求是否应该进入商业化阶段。

先读取 commercialization-solutions.md 和 docs/project-delivery-maturity-review.md。

检查：
- 是否已经有用户系统
- 是否已经有云端数据
- 是否已经有分享传播闭环
- 是否已经有 AI/API 成本控制
- 是否已经有隐私政策和数据删除/导出
- Pro 权益是否有真实价值

如果这些条件未满足，不要推进支付。
输出：应做、暂不做、商业风险、最小前置任务。
```

## 9. 安全提示词

```text
你是 Travel With Me 的安全负责人。请检查本次改动是否引入安全风险：

- XSS：用户输入/AI 输出/POI 文本是否进入 innerHTML
- 密钥：AMAP_JSCODE、DEEPSEEK_API_KEY 是否只在服务端
- 代理滥用：/_AMapService、/_AMapTile、/_ai 是否有限流和来源校验
- 日志：是否记录完整攻略、邮箱、token、密钥
- 数据：是否提供导出/删除/迁移
- CSP：是否需要更新策略

输出 P0 安全阻断项和 P1 加固项。
```

## 10. 模块化提示词

```text
你是 Travel With Me 的架构重构负责人。请检查当前模块是否过大、职责是否混杂。

重点检查：
- main.js 是否承担过多业务逻辑
- state.js mutator 是否保持唯一写入口
- render 层是否直接改 trip/workspace
- api 层是否读 DOM 或改 state
- modal 是否能复用 modal-base 和 shared-widgets
- 3D 是否能拆成 mode/model/animation/camera/interaction

输出：
保持不动的边界、需要拆分的模块、拆分顺序、每一步验收。
```

## 11. 发布验收提示词

```text
你是 Travel With Me 的发布负责人。请判断当前版本是否可以进入 alpha 私测。

必须检查：
- npm run check
- npm test
- 浏览器 smoke test
- 桌面端 Web 核心路径
- AI 导入可用性
- 分享图生成
- 地图搜索和路线规划
- 数据导出/导入
- README/TODO/ARCHITECTURE 是否同步

输出：
Go / No-Go。
如果 No-Go，列出最多 5 个阻断项。
```

## 12. 每轮工作结束提示词

```text
请总结本轮对 Travel With Me 的影响：

1. 完成了什么
2. 推动了哪个阶段门槛
3. 没有做什么
4. 还剩哪些风险
5. 验证了什么
6. 哪些文档已同步

要求简洁、可交接、可继续。
```
