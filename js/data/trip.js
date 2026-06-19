// js/data/trip.js
// 初始 trip 数据：五一北京行程
//
// 数据模型（V5 版）：
//
// /**
//  * @typedef {object} Workspace
//  * @property {Trip[]} trips - 最多 3 条旅行路线
//  * @property {string|null} activeTripId - 当前激活的 trip ID
//  */
//
// /**
//  * @typedef {object} Trip
//  * @property {string} id
//  * @property {string} title
//  * @property {string} subtitle
//  * @property {string} city
//  * @property {Object<string, Location>} locations - 地点主表，按 ID 索引
//  * @property {Day[]} days - 按序排列的每日行程
//  * @property {Event[]} unscheduled - 未排期事件
//  * @property {Annotation[]} annotations - 3D/地图功能标记
//  */
//
// /**
//  * @typedef {object} Location
//  * @property {string} name - 地点名称
//  * @property {string} query - 搜索关键词
//  * @property {string} addr - 地址
//  * @property {[number, number]|null} lnglat - 经纬度
//  * @property {string} [photo] - 高德 POI 图片 URL
//  * @property {string} [type] - 高德 POI 类型编码
//  * @property {boolean} [resolved] - 坐标是否已解析
//  * @property {string} [province]
//  * @property {string} [city]
//  * @property {string} [district]
//  * @property {string} [tag]
//  */
//
// /**
//  * @typedef {object} Day
//  * @property {string} id
//  * @property {string} title - 可选的当日主题
//  * @property {Event[]} events - 按序排列的事件
//  */
//
// /**
//  * @typedef {object} Event
//  * @property {string} id
//  * @property {string} title - 事件标题
//  * @property {string} [icon] - 图标 ID
//  * @property {string} [timeSlot] - 时间段 (morning|noon|afternoon|evening|'')
//  * @property {string} [note] - 备注
//  * @property {string} locationId - 引用的地点 ID
//  * @property {RouteConfig} [routeToNext] - 去下一站的方式
//  */
//
// /**
//  * @typedef {object} RouteConfig
//  * @property {'driving'|'walking'|'transit'|'riding'} mode - 交通方式
//  * @property {string} [label] - 自定义展示名称
//  * @property {Array<{mode: string, label: string}>} [legs] - 组合步骤
//  * @property {boolean} [manual] - 是否用户手动设置
//  */
//
// /**
//  * @typedef {object} Annotation
//  * @property {string} id
//  * @property {'entrance'|'viewpoint'|'supply'|'transfer'|'risk'|'note'} type
//  * @property {[number, number]} lnglat
//  * @property {number|null} elevation
//  * @property {string} title
//  * @property {string} note
//  * @property {string} createdAt
//  */
//
//
// trip.locations 是地点的"主表"，按 id 索引
//   - 添加地点 = 在这里 append
//   - 删除地点 = 从这里删 + 检查 days[].events 引用
//
// trip.days[] 是按顺序排列的多日行程数组
//   - 索引即 Day 序号（days[0] = Day 1）
//   - V5 删除了 day.date 字段——规划阶段思考的是"第几天"，不是绝对日期
//   - day.title 可选，空时 UI 显示"新的一天"
//
// trip.days[].events 是每天的事件序列
//   - 每个 event 通过 locationId 引用 trip.locations
//   - event.routeToNext 标记"从当前地点到下一个地点"用什么交通方式
//   - 最后一个 event 不需要 routeToNext
//
// trip.unscheduled[] V5 新增：未排期事件
//   - 形态与 events 一致，但**不带 routeToNext**（未排期之间不画路线）
//   - 用于承接 AI 攻略导入识别出的"无日期归属"地点（推荐合集类）
//
// 注意：locations 不再内置 lnglat。boot 时由 resolveAllLocations() 走高德
// PlaceSearch / Geocoder 自动校准（searchTerms / resolveBy / includeKeywords
// 等字段是给高德解析当辅助提示）。

export const initialTrip = {
  id: 'demo-trip-bj-may',
  title: '五一北京行程',
  subtitle: '点击下方行程卡片，右侧地图将自动飞跃至对应地点',
  city: '北京',

  locations: {
    station: {
      name: '北京南站',
      query: '北京南站',
      searchTerms: ['北京南站'],
      addr: '北京南站'
    },
    hotel: {
      name: '汉庭酒店(通州会议中心店)',
      query: '汉庭酒店 通州会议中心店',
      resolveBy: 'poi',
      searchTerms: [
        '汉庭酒店 通州会议中心店',
        '汉庭 北京通州会议中心店',
        '汉庭酒店 北京 通州会议中心店'
      ],
      includeKeywords: ['汉庭'],
      addr: '汉庭酒店(通州会议中心店)'
    },
    wanxianghui: {
      name: '首开通州万象汇',
      query: '首开通州万象汇',
      addr: '首开通州万象汇'
    },
    ziguangyuan: {
      name: '紫光园(全国总店)',
      query: '紫光园 全国总店 通州 玉桥中路43号',
      resolveBy: 'poi',
      searchTerms: [
        '紫光园(全国总店) 玉桥中路43号',
        '紫光园 全国总店 通州 玉桥中路43号',
        '紫光园 通州店 玉桥中路43号'
      ],
      includeKeywords: ['紫光园'],
      addr: '北京市通州区玉桥中路43号'
    },
    bookstore: {
      name: '春风在书店·总店',
      query: '春风在书店 总店',
      addr: '春风在书店·总店'
    },
    ruc: {
      name: '中国人民大学通州校区',
      query: '中国人民大学通州校区',
      searchTerms: ['中国人民大学通州校区'],
      addr: '中国人民大学通州校区'
    },
    liangmahe: {
      name: '亮马河国际风情水岸',
      query: '亮马河国际风情水岸',
      addr: '亮马河国际风情水岸'
    },
    solana: {
      name: 'SOLANA蓝色港湾',
      query: 'SOLANA蓝色港湾',
      addr: 'SOLANA蓝色港湾'
    },
    chaoyangpark: {
      name: '朝阳公园 (南门)',
      query: '朝阳公园南门',
      addr: '朝阳公园南门'
    },
    canalpark: {
      name: '大运河森林公园 (西门/宋梁路)',
      query: '大运河森林公园西门',
      addr: '大运河森林公园西门'
    }
  },

  days: [
    {
      id: 'day-1',
      title: '入住与晚餐',
      events: [
        {
          id: 'd1-e2',
          title: '前往酒店放行李',
          locationId: 'hotel',
          icon: 'hotel',
          timeSlot: 'afternoon',
          routeToNext: { mode: 'driving' }
        },
        {
          id: 'd1-e3',
          title: '吃寿司郎',
          locationId: 'wanxianghui',
          icon: 'food',
          timeSlot: 'evening'
        }
      ]
    },
    {
      id: 'day-2',
      title: '吃喝与逛校园',
      events: [
        {
          id: 'd2-e0',
          title: '从酒店出发',
          locationId: 'hotel',
          icon: 'hotel',
          timeSlot: 'morning',
          routeToNext: { mode: 'driving' }
        },
        {
          id: 'd2-e1',
          title: '紫光园吃午饭',
          locationId: 'ziguangyuan',
          icon: 'food',
          timeSlot: 'noon',
          routeToNext: { mode: 'driving' }
        },
        {
          id: 'd2-e2',
          title: '春风在书店撸猫',
          locationId: 'bookstore',
          icon: 'shopping',
          timeSlot: 'afternoon',
          routeToNext: { mode: 'driving' }
        },
        {
          id: 'd2-e3',
          title: '人大通州校区转转',
          locationId: 'ruc',
          icon: 'campus',
          timeSlot: 'afternoon',
          routeToNext: { mode: 'driving' }
        },
        {
          id: 'd2-e4',
          title: '万象汇吃晚餐',
          locationId: 'wanxianghui',
          icon: 'food',
          timeSlot: 'evening',
          routeToNext: { mode: 'driving' }
        },
        {
          id: 'd2-e5',
          title: '回酒店休息',
          locationId: 'hotel',
          icon: 'hotel',
          timeSlot: 'evening'
        }
      ]
    },
    {
      id: 'day-3',
      title: '朝阳水岸休闲',
      events: [
        {
          id: 'd3-e0',
          title: '从酒店出发',
          locationId: 'hotel',
          icon: 'hotel',
          timeSlot: 'morning',
          routeToNext: { mode: 'driving' }
        },
        {
          id: 'd3-e1',
          title: '亮马河漫步',
          locationId: 'liangmahe',
          icon: 'park',
          timeSlot: 'morning',
          routeToNext: { mode: 'walking' }
        },
        {
          id: 'd3-e2',
          title: '蓝色港湾午餐',
          locationId: 'solana',
          icon: 'food',
          timeSlot: 'noon',
          routeToNext: { mode: 'walking' }
        },
        {
          id: 'd3-e3',
          title: '逛商场 + 朝阳公园',
          locationId: 'chaoyangpark',
          icon: 'park',
          timeSlot: 'afternoon',
          routeToNext: { mode: 'walking' }
        },
        {
          id: 'd3-e4',
          title: '蓝色港湾晚餐',
          locationId: 'solana',
          icon: 'food',
          timeSlot: 'evening',
          routeToNext: { mode: 'driving' }
        },
        {
          id: 'd3-e5',
          title: '回酒店休息',
          locationId: 'hotel',
          icon: 'hotel',
          timeSlot: 'evening'
        }
      ]
    },
    {
      id: 'day-4',
      title: '踏青休闲',
      events: [
        {
          id: 'd4-e0',
          title: '从酒店出发',
          locationId: 'hotel',
          icon: 'hotel',
          timeSlot: 'morning',
          routeToNext: { mode: 'driving' }
        },
        {
          id: 'd4-e1',
          title: '大运河森林公园',
          locationId: 'canalpark',
          icon: 'park',
          timeSlot: 'morning'
        }
      ]
    }
  ],

  // V5 新增：未排期事件容器
  // - AI 攻略导入识别出的"推荐合集"（无 day 归属）落到这里
  // - 用户可通过 day/timeSlot select 把它们移到具体 day
  // - 不画 routeToNext
  unscheduled: [],

  // S2-5：3D 功能标记容器。当前先建立可持久化模型和渲染层；
  // 点击创建、编辑面板、分享图包含标记在后续批次接入。
  annotations: []
};
