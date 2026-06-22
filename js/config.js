// js/config.js
// 应用级配置：高德 Key、城市信息、默认地图中心、路线颜色等
// 所有"可能要根据环境改"的常量都集中在这里，方便以后切换 key 或迁移到环境变量

export const AppConfig = {
  // 高德 JS API Key 由服务端 /_config 从环境变量注入；源码不得写真实 key。
  amapKey: '',

  // 当前默认城市
  cityName: '北京市',
  cityCode: '010',

  // 地图初始中心点（通州大致位置）
  defaultCenter: [116.6631, 39.9015],
  defaultZoom: 11,

  // 没有任何行程地点时展示中国视图
  emptyMapCenter: [104.1954, 35.8617],
  emptyMapZoom: 4,

  // 多段路线的颜色循环
  routeColors: [
    '#ef4444',
    '#2563eb',
    '#16a34a',
    '#9333ea',
    '#f97316',
    '#0891b2',
    '#db2777',
    '#65a30d'
  ],

  // 高德 SDK 需要的插件列表
  plugins: [
    'AMap.ToolBar',
    'AMap.Geocoder',
    'AMap.PlaceSearch',
    'AMap.Driving',
    'AMap.Walking',
    'AMap.Riding',
    'AMap.Transfer'
  ]
};
