# 3D Terrain Implementation Research

本文档探索 Travel With Me 的 3D 地形从“2D 地图抬起长方体”到“长方体融化出真实地形”的真实实现路径。它补充 `ARCHITECTURE.md` 中 ADR-6 的视觉方向，重点回答：数据从哪里来、几何如何生成、动效如何做、相机如何动、区域如何切分、真实可落地的实施顺序是什么。

## 1. 目标效果

用户在 2D 地图中选中某一天或全部行程后，点击 3D：

1. 2D 地图冻结成一张“地图纸面”。
2. 地图纸面对应的矩形区域向上抬起，形成一个有厚度的长方体切片。
3. 长方体顶面不是突然变形，而是像软蜡/石膏模型一样从平面融化、鼓起，逐渐显出真实地形。
4. 地形完成后，路线、地点、功能标记、阴影、等高线、建筑体块依次出现。
5. 相机从近似俯视缓慢落到 55-65 度视角，随后进入很慢的自动环绕。

核心原则：

- 先建立空间连续性，再展示精美地形。
- 不做真实城市 3D 建筑复刻，先做地形 + POI 体块 + 路线理解。
- 精致感来自动效、材质、光照、层次，不来自高成本真实建模。

## 2. 数据来源

### 2.0 数据分层原则

3D 地形不应该把所有数据混成一个“地图模型”。它应拆成四层，每层有独立来源、缓存和降级策略：

| 层级         | 数据                   | 主要来源                    | 失败时降级                  |
| ------------ | ---------------------- | --------------------------- | --------------------------- |
| Ground       | 高程、坡度、等高线     | Open-Meteo / DEM tile       | 平面 + 程序化微起伏         |
| Network      | 道路、步道、路线形状   | 高德路线结果 / 后续步道数据 | 两点曲线 + 提示“路线仅示意” |
| POI          | 地点、小店、入口、标记 | `trip.locations` + 高德 POI | 只显示用户已加入地点        |
| Presentation | 材质、光照、动效、相机 | 本地规则                    | 降级为 2.5D 或静态 3D       |

这样可以避免一个上游数据失败导致整个 3D 不可用。例如山地徒步没有 DEM tile 时，仍可以进入 3D，但必须明确显示“地形为估算”，并关闭坡度结论。

### 2.1 2D 地图数据

来源：当前项目已有的高德 JS API 和瓦片代理。

用途：

- 2D 模式交互。
- 进入 3D 前的视觉冻结背景。
- 可选：把当前 2D 地图截图或瓦片拼图作为 slab 顶面的初始纹理。

注意：

- 3D 地形不应该依赖高德 JS API 的内部渲染对象。
- 2D 到 3D 的连续性只需要坐标、当前视野、当前 day 的地点范围。

### 2.2 地点和路线数据

来源：项目自己的 `trip.locations`、`days[].events`、`routeToNext`。

用途：

- 计算 3D 覆盖范围。
- 生成地点 marker。
- 生成路线曲线。
- 推导建筑体块类型。

地点坐标是真实数据；建筑体块不是精确建筑数据，而是根据 POI 类型和名称估算出的“规划模型”。

### 2.3 高程数据

当前实现使用 Open-Meteo Elevation API。官方说明该接口基于 Copernicus DEM GLO-90，约 90m 分辨率，并且一次最多请求 100 个坐标点。它适合 MVP 和小范围抽样，但不适合一次请求 40x40=1600 个点。

推荐分层：

| 阶段   | 数据源                     | 用途                    | 取舍                                 |
| ------ | -------------------------- | ----------------------- | ------------------------------------ |
| MVP    | Open-Meteo Elevation API   | 8x8 到 10x10 低密度网格 | 免费、简单，但细节少                 |
| S2     | Open-Meteo 分块请求 + 缓存 | 20x20 以内可接受地形    | 实现简单，需限流和缓存               |
| S3     | Terrain-RGB/DEM 瓦片       | 精细地形、坡度、等高线  | 需要 token、解码、缓存和 attribution |
| 自托管 | Copernicus/Mapzen/DEM 切片 | 商业级稳定              | 运维成本更高                         |

Mapbox Terrain-RGB/DEM 的优点是像素级高程编码。官方解码公式是：

```text
height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
```

这类 DEM 瓦片更适合“融化出具体地形”，因为可以和地图瓦片一样按 bbox 请求、缓存、重采样。

### 2.4 路网和步道数据

地形精度和路网精度要分开看。当前高德路线规划能返回路线 polyline，但这不等于拥有完整步道网络。

分阶段策略：

| 阶段 | 路网策略                                            | 适用               |
| ---- | --------------------------------------------------- | ------------------ |
| MVP  | 使用高德路线规划结果的 polyline；无结果时用两点曲线 | 城市路线、普通景区 |
| S2   | 缓存 route polyline，并沿 polyline 采样高程         | citywalk、景区     |
| S3   | 引入可选步道数据源或用户导入 GPX/KML                | 徒步、山地景区     |

对于徒步模式，路线精度应优先于面地形精度。如果路线只有 A→B 两点，不能给出“最陡路段”这类判断，只能给粗略高差。

### 2.5 数据缓存

3D 数据需要单独缓存，否则每次切换 3D 都会重新请求高程。

推荐缓存 key：

```text
terrain:{source}:{mode}:{centerLng5},{centerLat5}:{span}:{resolution}:{version}
route-elevation:{routeHash}:{sampleCount}:{terrainVersion}
poi-layout:{tripId}:{activeDayId}:{zoomMode}:{version}
```

缓存位置：

- S1：内存 Map + localStorage 元数据。
- S2：IndexedDB，按 LRU 清理。
- S3：Service Worker + IndexedDB，和离线地图瓦片共用缓存策略。

缓存过期：

- Open-Meteo/DEM 高程：30 天。
- 路线高程采样：跟随 route hash，路线变更即失效。
- POI layout：每次 trip 变更失效。

## 3. 场景驱动的地形精度

地形精度不能只按固定 zoom 或固定网格决定。旅行规划里的“精度”其实分三层：

1. **地形精度**：山体、坡度、谷线、海拔变化是否可信。
2. **路网精度**：巷道、景区步道、登山路线是否能帮助判断怎么走。
3. **POI 精度**：小店、入口、观景台、换乘点是否能被准确表达。

不同场景要优化不同层级。景区逛街时，90m DEM 再精细也不如准确的小巷和店铺；徒步时，POI 少一点可以接受，但山脊、坡度、爬升必须可信。

### 3.1 场景分类

| 场景               | 典型范围   | 首要精度               | 次要精度 | 视觉重点                     |
| ------------------ | ---------- | ---------------------- | -------- | ---------------------------- |
| 城市小店/巷道      | 200m-1.2km | POI + 巷道             | 建筑体块 | 店铺密度、路口、步行转折     |
| 商圈/街区 citywalk | 800m-3km   | 路网 + POI             | 轻地形   | 多点空间关系、路线顺序       |
| 景区游览           | 1-6km      | 步道 + 出入口 + 地形   | POI      | 入口、索道、观景台、游线分叉 |
| 山地徒步           | 2-15km     | 高程 + 坡度 + 山体结构 | 路线     | 爬升、山脊、谷线、危险段     |
| 城市跨区路线       | 5-30km     | 片区关系 + 交通        | 粗地形   | 哪些点在同一片区、是否绕路   |

### 3.2 LOD 策略

建议使用“场景模式 + 距离层级”的组合，而不是一个全局 resolution。

| 模式            | 触发条件                        | 地形网格      | 高程源                  | POI/路网密度 | 说明                         |
| --------------- | ------------------------------- | ------------- | ----------------------- | ------------ | ---------------------------- |
| Micro Street    | span < 1.2km 且 POI 密集        | 16x16-24x24   | 可低精度或平原 fallback | 高           | 服务巷道小店，地形只是舞台   |
| Citywalk        | span 1-3km                      | 24x24-40x40   | Open-Meteo 分块或 DEM   | 中高         | 路线顺序和街区关系优先       |
| Scenic Park     | span 1-6km 且景区/公园 POI 多   | 40x40-64x64   | DEM 优先                | 中           | 步道、入口、索道、观景点重要 |
| Hiking          | span 2-15km 且地形起伏大/路线长 | 64x64-128x128 | DEM tile 必须           | 中低         | 坡度、高差、山脊谷线优先     |
| Region Overview | span > 6km                      | 24x24-40x40   | 低精度即可              | 低           | 只做区域关系，不做细节判断   |

判断地形起伏：

```text
elevationRange = maxElevation - minElevation
roughness = avg(abs(height[i] - neighborHeight))
isMountainLike = elevationRange > 120m || roughness > threshold
```

判断 POI 密集：

```text
poiDensity = poiCount / spanKm²
isStreetLike = span < 1.2km && poiDensity high
```

### 3.3 城市小店和巷道

城市小店场景的关键不是“地形更准”，而是“微观位置关系更准”。

应优先实现：

- 小巷、步行街、商场出入口、地铁口的 2.5D 表达。
- POI label 聚合和避让。
- 建筑体块高度稳定生成，按商场/街铺/景点区分。
- 路线贴近路网，而不是简单两点贝塞尔。

地形策略：

- 平原城市可以使用低密度高程或完全平面。
- 使用微弱 procedural relief 让画面不死板。
- 把精力放在路网线、店铺 marker、入口标识和局部放大。

推荐参数：

```text
span: 300-1200m
terrainGrid: 16x16 或 24x24
verticalExaggeration: 0.3-0.8
buildingBlocks: high priority
poiLabels: high priority
routeSnapVisual: high priority
```

### 3.4 景区游览

景区同时需要地形和路网。比如山脚入口、索道站、观景台、步道分叉、停车场之间的关系，比单纯 POI 坐标更重要。

应优先实现：

- 入口/出口/游客中心/索道/观景台特殊 marker。
- 步道、栈道、水域、山体边界的分层显示。
- 地形坡度用颜色或阴影表达。
- 对“这段路是否爬坡”给出摘要。

地形策略：

- DEM 优先。
- 40x40 起步，景区范围较大时升到 64x64。
- 等高线和坡度色阶要比城市模式更明显。

推荐参数：

```text
span: 1-6km
terrainGrid: 40x40-64x64
verticalExaggeration: 1.2-2.0
contourInterval: 20m 或 50m
slopeOverlay: medium
trailImportance: high
```

### 3.5 山地徒步

徒步场景的 3D 价值最高，但数据要求也最高。用户真正关心：

- 总爬升和下降。
- 哪一段最陡。
- 路线走山脊还是山谷。
- 是否有明显折返点、垭口、危险横切。
- 观景点是否真的在高处。

Open-Meteo 90m DEM 可以做粗略起伏，但不足以表达窄山脊和小路坡度。徒步模式应尽早切到 Terrain-RGB/DEM tile。

应优先实现：

- 路线沿线高程剖面。
- 坡度分段：绿色平缓、黄色中等、红色陡。
- 山脊/谷线近似提取。
- alert 标记附着到陡坡、长下坡、爬升开始点。

推荐参数：

```text
span: 2-15km
terrainGrid: 64x64-128x128
verticalExaggeration: 1.5-3.0
contourInterval: 20m/50m
slopeOverlay: high
routeElevationSamples: 100-300
```

注意：

- 徒步模式不要过度平滑地形，山体结构会被磨掉。
- 城市模式可以平滑，徒步模式要保留坡面变化。
- 路线精度应高于面地形精度，因为用户沿路线决策。

### 3.6 自动选择精度

进入 3D 时先做一个轻量分类：

```text
input:
  spanMeters
  poiCount
  routeLength
  placeTypes
  elevationRange
  activeDayMode

if routeLength > 4km && elevationRange > 120m:
  mode = Hiking
else if placeTypes contains 景区/公园/山/索道:
  mode = ScenicPark
else if spanMeters < 1200 && poiDensity high:
  mode = MicroStreet
else if spanMeters < 3000:
  mode = Citywalk
else:
  mode = RegionOverview
```

分类结果决定：

- 高程数据源。
- 地形网格密度。
- 相机默认高度。
- 是否显示坡度 overlay。
- 是否显示 POI label。
- 是否强调路线高程剖面。

### 3.7 精度预算

浏览器端应有预算，而不是无限加精度：

| 预算项                  | 建议上限                            |
| ----------------------- | ----------------------------------- |
| terrain vertices        | 桌面端 16k 首版，小屏/后置移动端 8k |
| route elevation samples | 300                                 |
| visible POI labels      | 30                                  |
| building blocks         | 80                                  |
| initial 3D load         | 1.5s 内出现骨架，3s 内完成细节      |

如果超过预算：

- 先降低建筑数量。
- 再降低 POI label。
- 再降低远处地形网格。
- 最后才降低路线高程采样。

因为路线高程对决策价值最高。

### 3.8 模式选择输出

自动分类不能只返回一个字符串，还应返回完整渲染预算。

```text
TerrainModeDecision {
  mode: 'micro-street' | 'citywalk' | 'scenic-park' | 'hiking' | 'region-overview'
  confidence: 0..1
  dataSource: 'flat' | 'open-meteo' | 'dem-tile'
  terrainGrid: number
  routeSamples: number
  verticalExaggeration: number
  showContours: boolean
  showSlopeOverlay: boolean
  showPoiLabels: boolean
  buildingBudget: number
  labelBudget: number
  warning?: string
}
```

低置信度时，不要强行进入高成本模式：

- 地形起伏不明：先用 Citywalk 或 Region Overview。
- POI 类型混乱：优先路线和用户地点，不自动生成太多标签。
- 高程请求失败：保持 3D 视觉，但关闭坡度/爬升结论。

### 3.9 模式与相机联动

不同模式的相机默认视角不同：

| 模式            | 初始俯角 | 相机距离 | 自动环绕   | 用户主要动作           |
| --------------- | -------- | -------- | ---------- | ---------------------- |
| Micro Street    | 48-55°   | 近       | 很慢或关闭 | 查看小店、点 marker    |
| Citywalk        | 55-62°   | 中       | 慢速       | 理解路线顺序           |
| Scenic Park     | 60-68°   | 中远     | 慢速       | 查看坡度、入口、观景点 |
| Hiking          | 62-72°   | 远       | 极慢       | 看山体结构和高程剖面   |
| Region Overview | 50-58°   | 远       | 慢速       | 看片区关系             |

Micro Street 不应像模型展台一样持续旋转，因为用户要看小店和路口；Hiking 可以更像沙盘，环绕帮助理解山体。

## 4. 长方体到底是什么

这里要区分三个概念。

### 4.1 Diorama Slab

这是整体被抬起的“地图切片”，本质是一个大长方体。

它的长宽不固定，由当前 3D 覆盖范围决定：

```text
widthMeters  = bboxWidthMeters  * padding
depthMeters  = bboxHeightMeters * padding
spanMeters   = clamp(max(widthMeters, depthMeters), minSpan, maxSpan)
```

为了视觉稳定，建议把最终 slab 做成正方形 footprint，而不是严格长方形：

- 地理区域可以是 bbox。
- 3D 模型使用正方形或轻微长方形承载。
- 多余区域保留为“地图边界余白”。

这样相机、环绕、切片边缘、阴影都更稳定。

### 4.2 Terrain Surface

这是 slab 顶面的真实地形网格。

它不是很多独立长方体，而是一个连续 mesh：

- `PlaneGeometry` 或自定义 `BufferGeometry`。
- 每个顶点有一个高程值。
- 顶点 y 从 0 动画到 `normalizedElevation * verticalScale`。
- 法线随顶点变化重新计算，形成真实光照。

地形应该“一体化”，否则会出现 Minecraft 式块状感，偏离当前“精致任务简报沙盘”的设计语言。

### 4.3 Optional Height Columns

如果想做“从长方体融化”的视觉，可以临时生成一组隐藏的 height columns，但它们不应成为最终地形。

推荐做法：

- 动画前 0-250ms：显示完整 slab。
- 250-650ms：顶面 grid 顶点上升，slab 侧边出现地层纹理。
- 650-900ms：可选显示少量半透明的竖向分层线，暗示地形从切片中长出。
- 900ms 后：只保留连续地形和地层侧面。

结论：

> 长方体只有一个主 slab；地形不是由等高长方体堆出来的。每个采样单元的高程不同，但视觉上通过连续 mesh 融合。

## 5. 长宽高是否相同

不相同。

### 5.1 长宽

长宽由地理覆盖范围决定，但建议视觉上做成近似正方形：

| 场景        | 覆盖范围            | Slab footprint |
| ----------- | ------------------- | -------------- |
| 单点        | 600m x 600m         | 正方形         |
| 一天 2-5 点 | bbox \* 1.3 padding | 近似正方形     |
| 全部日期    | max 8000m           | 正方形或 4:3   |

### 5.2 厚度

slab 厚度不等于真实地层厚度，只是视觉厚度。

建议：

```text
slabThickness = clamp(spanUnits * 0.06, 14, 32)
```

小范围不要太薄，否则不像切片；大范围不要太厚，否则压迫画面。

### 5.3 地形高度

地形高度需要夸张，但不能失真到影响路线判断：

```text
rawRangeMeters = maxElevation - minElevation
visualTerrainHeight = clamp(spanUnits * 0.06, 12, 60)
heightY = normalize(elevation) * visualTerrainHeight
```

平原城市如北京、上海，真实高程差很小，需要加入很轻的 procedural relief：

- 不改变地点高程语义。
- 只给地形表面 1-3 units 的微起伏。
- 避免一整块完全平板。

## 6. 地形是一体还是自动切分

第一版应是一体 mesh，内部有网格分段。

```text
scene
  dioramaGroup
    slabBaseMesh
    terrainSurfaceMesh
    terrainSideSkirts
    contourLines
    routeGroup
    markerGroup
    buildingGroup
```

只在以下情况切分 chunk：

- 覆盖范围超过 8km。
- 采样网格超过 80x80。
- 需要按瓦片懒加载地形。
- 需要局部更新某个区域。

切分策略：

```text
TerrainChunk
  id = z/x/y 或 row/col
  bboxLngLat
  geometry
  material
  elevationGrid
```

视觉上仍然必须无缝：

- 相邻 chunk 共用边界高程。
- 或每个 chunk 多取一圈 padding 顶点。
- 法线在边界做平滑。

### 6.1 一体 mesh 的边界处理

一体 mesh 也不能只是一个 plane。它至少需要三部分：

```text
TerrainSurface: 顶面，高程网格
TerrainSkirt: 四周垂直边，连接顶面边缘到 slab base
SlabBase: 底座，提供厚度、阴影和地层纹理
```

原因：

- 顶面只负责地形和光照。
- skirt 负责干净切边，避免从侧面看到空洞。
- base 负责“地图切片”的重量感。

地形融化时，只动画 `TerrainSurface` 的顶点 y；`TerrainSkirt` 顶边跟随 surface 边缘，底边固定；`SlabBase` 只做整体上升，不参与地形变形。

### 6.2 Chunk 的触发阈值

不要过早 chunk。chunk 会带来边界法线、加载顺序、拾取、缓存一致性的复杂度。

建议阈值：

```text
if terrainGrid <= 96x96 and span <= 8km:
  use single mesh
else:
  use 2x2 chunks

if terrainGrid > 160x160 or span > 15km:
  do not enter detailed 3D; use Region Overview
```

徒步场景如果需要更大范围，应优先提高路线沿线采样，而不是把整片山地都升到超高网格。

## 7. “抬起长方体再融化地形”的动效方案

### 7.1 动效分镜

| 时间        | 阶段      | 画面                                           |
| ----------- | --------- | ---------------------------------------------- |
| 0-160ms     | 2D 冻结   | 地图亮度降到 0.8，当前 day 的点位发光          |
| 160-360ms   | 边界裁切  | 当前 bbox 边界出现细金线，外部地图暗下去       |
| 360-620ms   | slab 抬起 | 整块矩形切片从 2D 地图上升，侧面地层出现       |
| 620-1050ms  | 地形融化  | 顶面从平面变为真实高程，波纹从路线中点向外扩散 |
| 1050-1250ms | 细节显影  | 等高线、坡度阴影、建筑体块淡入                 |
| 1250-1500ms | 路线点亮  | 路线从起点向终点流动，marker 依次弹出          |
| 1500-1800ms | 相机落定  | 从俯视转到 60 度，进入慢速环绕                 |

### 7.2 实现方式

推荐用 “uniform progress + CPU 顶点更新” 起步，后续再切 shader。

MVP 实现：

```js
for each vertex:
  flatY = 0
  targetY = terrainHeightGrid[row][col]
  waveDelay = distance(vertex, routeCenter) / waveSpeed
  localT = smoothstep(0, 1, (globalT - waveDelay) / duration)
  y = mix(flatY, targetY, easeOutCubic(localT))
```

更精美版本：

- 顶点不是同时上升，而是沿路线、地点或裁切边界扩散。
- 材质 roughness 从 0.95 到 0.75。
- 顶面颜色从 2D 瓦片纹理混合到骨白地形材质。
- 法线每几帧更新一次，不必每帧全量更新。
- 等高线用延迟 150ms 淡入，避免同时堆信息。

### 7.3 “融化”的视觉语言

不要做液体流淌，那会变脏。这里的融化应更像：

- 蜡模受热软化。
- 石膏粉末被吸附成地形。
- 图纸上的等高线鼓起成模型。

具体效果：

- 顶点有 3-5% 的 overshoot，再回到最终高度。
- 高处比低处晚 80ms 出现，形成“山脊最后长出来”的感觉。
- 山谷用轻微阴影先出现，山峰再出现。
- 地形边缘保持干净直切，不跟着软化，否则切片感会消失。

### 7.4 分模式动效差异

不同模式的动效也应不同：

| 模式            | 融化方向                           | 细节出现顺序                |
| --------------- | ---------------------------------- | --------------------------- |
| Micro Street    | 从当前选中地点向周边扩散           | 路网 → POI → 建筑体块       |
| Citywalk        | 沿路线从第一个地点流向最后一个地点 | 路线 → marker → 街区体块    |
| Scenic Park     | 从入口/游客中心向景区内部扩散      | 地形 → 步道 → 观景点/索道   |
| Hiking          | 沿路线和山脊双重扩散               | 地形 → 等高线 → 坡度 → 路线 |
| Region Overview | 从中心向外扩散                     | 区域块 → 路线 → marker      |

这会让动效不只是好看，而是在解释“为什么进入 3D”：它把该场景最重要的信息优先显影。

### 7.5 动效失败降级

若设备性能不足：

- 跳过顶点逐帧融化，改成 300ms opacity + scale。
- 保留 slab 抬起和路线点亮。
- 关闭粒子、阴影和建筑挤出动画。
- 显示静态地形后再允许交互。

性能判断可以用首帧渲染耗时和设备像素比：

```text
if firstFrame > 48ms or deviceMemory <= 4GB:
  animationQuality = 'low'
else:
  animationQuality = 'high'
```

## 8. 相机自动环绕

当前代码使用 OrbitControls 的 `autoRotate`。Three.js OrbitControls 支持相机围绕 target orbit、缩放和 pan；如果启用 damping 或 autoRotate，需要在动画循环里持续调用 `controls.update()`。

但为了“精美”和“帧率稳定”，建议不要完全依赖 `autoRotateSpeed`，而是自己用 delta time 控制相机角度：

```text
idleYawSpeed = 360deg / 75s = 4.8deg/s
microPitch = ±2deg / 18s
```

推荐参数：

| 状态            | 速度                         |
| --------------- | ---------------------------- |
| 初次落定后 3 秒 | 不自动转，让用户看清路线     |
| 空闲环绕        | 4-6 deg/s                    |
| 路线展示模式    | 沿路线方向慢推，不做完整绕圈 |
| 用户拖动后      | 停止自动环绕 20-30s          |
| 小屏/低性能设备 | 0 deg/s 或 2 deg/s           |

相机路径：

```text
radius = terrainDiagonal * 0.9
height = terrainDiagonal * 0.55
target = terrainCenter + y(lift + terrainHeight * 0.35)
```

### 8.1 自动环绕不应永远运行

自动环绕是展示行为，不是默认交互行为。建议状态机：

```text
entering       -> camera reveal
settled        -> pause 2.5s
idle           -> slow orbit
userInteracts  -> stop orbit immediately
focusMarker    -> fly-to marker
inspectRoute   -> route-follow camera
resumeIdle     -> after 25s no input, orbit from current yaw
```

环绕速度：

```text
Micro Street: 0-2 deg/s
Citywalk: 3-4 deg/s
Scenic Park: 3-5 deg/s
Hiking: 2-3 deg/s
Region Overview: 4-6 deg/s
```

如果路线卡片被 hover 或选中，相机不应绕整块模型，而应轻微偏移到该路线段的侧上方，让用户看清这段路线。

## 9. 用户拖动时的相机移动

第一版继续使用 OrbitControls，但收紧行为：

- 左键/单指：绕 target 旋转。
- 滚轮/双指：缩放。
- 右键或双指平移：默认关闭，避免用户把模型拖丢。
- polar angle 限制：30° 到 72°，不允许钻到地底。
- distance 限制：`diagonal * 0.35` 到 `diagonal * 2.2`。

用户开始拖动：

```text
controls start:
  stop idle camera
  reduce route glow intensity
  hide hover labels if too dense
```

用户结束拖动：

```text
controls end:
  keep current view
  after 25s resume idle
  resume from current yaw, not snap back
```

更高级的手感：

- 拖动时 target 不变，只绕模型中心转。
- 如果用户点击 marker，target 平滑 lerp 到 marker 附近。
- 关闭详情后 target 回到当前 day 的路线中心。

### 9.1 拖动手感规则

拖动的手感应该像“转动桌上的模型”，不是“飞行穿越地形”。

建议：

- 禁止 free-fly camera。
- 禁止用户把 target 拖出 slab 边界。
- 缩放围绕当前 target，而不是鼠标下任意点。
- 单指拖动不 pan，只 orbit。
- 双指移动可以轻微 pan，但 pan 范围限制在 slab footprint 的 25% 内。

小屏/后置移动端：

- 单指：旋转。
- 双指 pinch：缩放。
- 双指同向拖动：有限 pan。
- 长按：进入标记轮盘，不触发相机。

## 10. 建筑、路线、标记如何跟随地形

所有 3D 对象都需要一个 `sampleTerrainHeight(x,z)`。

```text
markerY   = terrainY(x,z) + markerBaseOffset
routeY    = max(terrainYAlongRoute) + routeLift
buildingY = terrainY(x,z)
```

路线不要简单悬在统一高度上。更好：

- 沿路线采样 30-80 个点。
- 每个点取 terrainY。
- 再加 5-10 units 的 routeLift。
- 用 CatmullRomCurve3 平滑。

这样用户能看到路线贴着山谷或跨过山脊，地形感才成立。

### 10.1 路线高程摘要

3D 的商业价值不只是显示地形，而是把地形转成判断信息。

每条路线段应计算：

```text
distance
elevationGain
elevationLoss
maxSlope
avgSlope
steepestSampleIndex
terrainConfidence
```

展示策略：

- 城市/小店：默认不展示高程摘要，只在明显爬坡时提示。
- 景区：展示“约爬升 xx m / 最陡 xx%”。
- 徒步：展示完整高程剖面和坡度分段。

如果 `terrainConfidence` 低，必须显示“高程估算，仅供规划参考”。

### 10.2 建筑体块稳定性

建筑体块是视觉辅助，不是真实建筑。要避免用户误以为高度准确：

- 使用低饱和材质。
- 不显示具体楼层。
- 高度由 `hash(locationId + type)` 生成，保持稳定。
- 只在 Micro Street / Citywalk 中较多显示。
- Hiking 中默认不显示建筑，避免干扰山体判断。

## 11. 精美动效清单

优先级从高到低：

1. 地图冻结到 slab 的空间连续性。
2. slab 侧边地层和投影。
3. 地形波纹式融化。
4. 等高线延迟显影。
5. 路线流光从起点跑到终点。
6. marker 依次弹出，带微小 overshoot。
7. 建筑体块从地形里挤出，而不是突然出现。
8. 微尘粒子只在落定后出现，避免抢主动画。
9. 相机落定后停 2-3 秒再环绕。

## 12. 可用性与验收标准

3D 地形不能只以“看起来漂亮”为验收。每个模式都要回答一个用户问题。

| 模式            | 必须回答的问题                     | 验收方式                                                |
| --------------- | ---------------------------------- | ------------------------------------------------------- |
| Micro Street    | 小店和路口的大致位置关系是否清楚？ | 桌面端能看清店铺/路口关系，375px 基础回归不遮挡主要标签 |
| Citywalk        | 多个地点的游览顺序是否更容易理解？ | 用户能说出路线有没有绕路                                |
| Scenic Park     | 入口、步道、观景点和坡度是否清楚？ | 能识别上坡段和分叉点                                    |
| Hiking          | 山体结构和爬升压力是否可信？       | 高程剖面与路线一致，陡坡段可定位                        |
| Region Overview | 点位是否属于同一片区？             | 全部 marker 可见，片区关系清楚                          |

通用技术验收：

- 首次进入 3D：1.5s 内出现 slab，3s 内完成主要细节。
- 小屏/后置移动端：terrain vertices 不超过 8k 首版预算。
- 用户拖动后：相机不丢失模型，25s 后才恢复环绕。
- 高程失败：仍可进入 3D，但不显示坡度/爬升结论。
- 退出 3D：能回到 2D 且不残留 WebGL 交互遮挡。

## 13. 对当前实现的修正建议

当前 `map-3d.js` 已经有基本骨架，但建议调整：

1. `fetchElevationGrid()` 不应一次请求 40x40 点。Open-Meteo 官方限制一次最多 100 坐标，应该先降到 8x8/10x10，或做分块请求与缓存。
2. `buildSliceEdge()` 当前只是一个整块盒子，后续应拆成 base + side skirts，避免 terrain 表面和 box 顶面互相穿插。
3. 地形动画不要只 scale y；应该对顶点高度做 flat → terrain 的插值。scale y 会让地形像机械拉伸，不像“融化出来”。
4. 路线应采样 terrain height，而不是固定 `ROUTE_LIFT`。
5. 建筑高度不能用 `Math.random()` 直接生成，否则同一地点每次进入 3D 都会变。应使用 locationId hash 生成稳定伪随机。
6. 自动环绕建议改成 delta time 自己控制，避免不同帧率速度不一致。
7. 需要为 3D terrain 建立缓存 key：`center + span + resolution + dataSourceVersion`。
8. 增加 `chooseTerrainMode()`，把 span、POI 密度、routeLength、elevationRange 映射为模式决策。
9. 增加 `TerrainModel.heightAt(x,z)`，统一 marker、route、building 的贴地逻辑。
10. 增加 `terrainConfidence`，决定是否展示坡度、高差等判断性信息。

## 14. 推荐实现顺序

### S2-4 实现状态（2026-06-19）

已落地：

- `js/render/terrain-mode.js`：`chooseTerrainMode()` 已输出 Micro Street、Citywalk、Scenic Park、Hiking、Region Overview，并给出 `terrainGrid`、`routeSamples`、`dataSource`、`labelBudget`。
- `js/render/terrain-model.js`：`TerrainModel` 已包含 `bounds`、`grid`、`heightAt(x,z)`、`mesh`、`sideSkirts`、`terrainConfidence` 和高程指标。
- `js/api/elevation.js`：Open-Meteo 高程请求已改为 100 点分块 + 内存缓存，避免大网格单次请求。
- `js/render/map-3d.js`：terrain、建筑、路线、marker 已统一使用 `heightAt(x,z)` 贴地；建筑高度改为稳定 hash；自动环绕在用户拖动后 6 秒恢复。
- Playwright 已断言进入 3D 后存在 `data-terrain-mode` 和非 fallback 的 `data-terrain-confidence`。

仍待后续：

- 真实 DEM tile / Terrain-RGB 解码。
- 侧裙独立几何和顶点级融化动画。
- label 避让、标记聚焦相机、长按轮盘和 3D 视频导出。

### S2-5 实现状态（2026-06-19）

已落地：

- `js/annotations.js`：定义 6 类功能标记（入口、观景、补给、交通、风险、备注），并统一规范化 `id,type,lnglat,elevation,title,note,createdAt`。
- `js/state.js`：`trip.annotations[]` 已进入唯一状态源，支持新增、更新、删除和旧数据自动补空数组。
- `js/render/map-3d.js`：新增 annotation layer，按类型上色，并通过 `TerrainModel.heightAt(x,z)` 贴合地形；支持 Raycaster 点击地形反算 `lnglat`。
- `js/render/annotation-modal.js`：轻量编辑面板已能保存类型、标题和备注。
- `js/render/map.js`：2D 地图已同步显示 annotation marker。
- `js/share-image.js` / `js/render/share-modal.js`：分享图已支持用户选择是否包含 3D 标记。
- 3D 地形摘要已展示模式、可信度和高差；`flat-fallback` 时不输出坡度结论。
- Playwright 已在 3D smoke 中断言 seeded annotation、点击新增 annotation、地形摘要和分享图标记选项。

仍待后续：

- 标记聚焦相机、label 避让和长按轮盘。
- 真实 DEM tile / Terrain-RGB 下的坡度分段和高程剖面。

### Step 1: 模式决策

- 实现 `chooseTerrainMode()` 文档级算法。
- 输出 terrainGrid、routeSamples、dataSource、labelBudget。
- 根据模式设置相机默认参数。

### Step 2: 数据可信

- 修复 Open-Meteo 请求方式：最多 100 点或分块。
- 增加 elevation cache。
- 增加平原 fallback：微起伏 + 等高线弱化。

### Step 3: 几何正确

- 生成 `TerrainModel`：
  - `bounds`
  - `grid`
  - `heightAt(x,z)`
  - `mesh`
  - `sideSkirts`
- slab base 和 terrain surface 分离。

### Step 4: 动效成立

- flat plane → terrain vertices。
- slab lift。
- contour fade。
- route draw。
- marker pop。

### Step 5: 相机手感

- 自定义 idle orbit。
- OrbitControls 限制。
- 用户交互暂停和恢复。
- marker focus camera。

### Step 6: 真实价值

- 路线贴地形。
- 坡度/高差摘要。
- alert 标记和 viewpoint/rest/transfer 等功能标记。

## 15. 关键技术选型

| 问题      | 推荐                                                  |
| --------- | ----------------------------------------------------- |
| 地形 mesh | `BufferGeometry` 或 `PlaneGeometry` 顶点高度插值      |
| Slab      | 独立 base mesh + side skirts                          |
| 高程 MVP  | Open-Meteo 8x8/10x10 或分块 20x20                     |
| 高程进阶  | Terrain-RGB/DEM 瓦片解码                              |
| 相机      | OrbitControls + 自定义 idle orbit                     |
| 点击/长按 | Raycaster + HTML radial menu                          |
| 动效      | requestAnimationFrame + easing；后续迁 shader uniform |
| 性能      | 单 mesh 起步，超过阈值再 chunk                        |

## 16. 参考资料

- Three.js Docs: `OrbitControls`、`BufferGeometry`、`PlaneGeometry`、`Raycaster`。
- Open-Meteo Elevation API: 支持一个或多个 WGS84 坐标，高程来自 Copernicus DEM GLO-90，约 90m 分辨率，单次最多 100 个坐标。
- Mapbox Terrain-RGB: RGB raster tile 可解码出米级高程，适合生成 3D terrain mesh。
- Mapbox Access Elevation Data: 说明 Terrain-RGB 请求、解码公式、瓦片坐标和水域 tile 处理。
