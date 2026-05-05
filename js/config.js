// js/config.js
// 应用级配置：高德 Key、城市信息、默认地图中心、路线颜色等
// 所有"可能要根据环境改"的常量都集中在这里，方便以后切换 key 或迁移到环境变量

// 高德 JS API Key 必然暴露给浏览器，靠"高德后台域名白名单 + 日配额"约束。
// 安全密钥（jscode）严禁出现在前端，由 server/index.js 从环境变量读出后注入。
//
// 这里按 hostname 自动切换：
//   - localhost / 127.0.0.1 → 开发 key（高德后台白名单留空，仅本地用）
//   - 其它 → 生产 key（白名单仅含 travelwithyou.preview.aliyun-zeabur.cn）
const AMAP_KEY_DEV  = 'a32b44e9ac97100b36d87b0d961976a9';
const AMAP_KEY_PROD = '7204bb52ceac03112bb024af2f270444';

function pickAmapKey() {
  const host = typeof location !== 'undefined' ? location.hostname : '';
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  return isLocal ? AMAP_KEY_DEV : AMAP_KEY_PROD;
}

export const AppConfig = {
  amapKey: pickAmapKey(),

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
