// 行程导引的跨渲染器视觉契约。
// AMap Polyline 与 Three.js 网格的底层能力不同，但必须表达同一条路线与状态。

export const ROUTE_GUIDANCE = Object.freeze({
  outline: '#FFFFFF',
  roadBed: '#F8F4EA',
  edge: '#3E3B34',
  line: '#E6AD00',
  activeLine: '#F2B705',
  default: Object.freeze({ strokeWeight: 7, strokeOpacity: 0.96, zIndex: 200 }),
  dim: Object.freeze({ strokeWeight: 5, strokeOpacity: 0.32, zIndex: 100 }),
  active: Object.freeze({ strokeWeight: 9, strokeOpacity: 1, zIndex: 220 }),
  halo: Object.freeze({ strokeWeight: 18, strokeOpacity: 0.22 })
});

export function getRouteGuidanceColor({ active = false } = {}) {
  return active ? ROUTE_GUIDANCE.activeLine : ROUTE_GUIDANCE.line;
}
