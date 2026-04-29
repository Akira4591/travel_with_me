// js/config.js
// 应用级配置：高德 Key、城市信息、默认地图中心、路线颜色等
// 所有"可能要根据环境改"的常量都集中在这里，方便以后切换 key 或迁移到环境变量

export const AppConfig = {
  // 高德地图 Web JS API key
  // ⚠️ 注意：这是前端可见的 key，请在高德后台设置：
  //   1) 域名白名单（只允许你的域名调用）
  //   2) 每日调用上限
  // 之后接入 BFF 时再把 key 移到服务端
  amapKey: '3c2be63f6d9a8512c02cb72590103154',
  amapSecurityCode: 'a37118ffdb154aa601305ff0ac0634df',

  // 当前默认城市
  cityName: '北京市',
  cityCode: '010',

  // 地图初始中心点（通州大致位置）
  defaultCenter: [116.6631, 39.9015],
  defaultZoom: 11,

  // 多段路线的颜色循环
  routeColors: [
    '#ef4444', '#2563eb', '#16a34a', '#9333ea',
    '#f97316', '#0891b2', '#db2777', '#65a30d'
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
