// js/render/geo-project.js
// 地理坐标 → Three.js 场景坐标投影
//
// 对于旅行 diorama（小范围 < 10km），使用相对 Web Mercator 投影：
//   - 以 diorama 中心为 scene 原点
//   - 经纬度差值 × 米/度 系数 → scene units
//   - 避免大数值精度问题
//
// 使用方式:
//   import { createGeoProjection } from './render/geo-project.js';
//   const proj = createGeoProjection({ center: [116.4, 39.9] });
//   const { x, z } = proj.toScene([116.405, 39.905]);

const METERS_PER_DEG_LAT = 111320; // WGS84 纬度方向每度 ≈ 111.32km

/**
 * @typedef {object} GeoProjection
 * @property {function([number, number]): {x: number, z: number}} toScene — lnglat → scene (x, z)
 * @property {function([number, number]): [number, number]} toLngLat — scene (x, z) → lnglat
 * @property {function(number): number} metersToUnits — 米 → scene units
 * @property {function(number): number} unitsToMeters — scene units → 米
 * @property {number} metersPerUnit — 每 scene unit 对应多少米
 */

/**
 * 创建一个以 center 为原点的地理投影
 * @param {object} options
 * @param {[number, number]} options.center — [lng, lat] 场景原点
 * @param {number} [options.scale=1] — scene unit 缩放（1 表示 1unit = 1m, 0.001 表示 1unit = 1km）
 * @returns {GeoProjection}
 */
export function createGeoProjection({ center, scale = 1 }) {
  const [originLng, originLat] = center;
  // 在当前纬度下每度经度对应多少米
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((originLat * Math.PI) / 180);

  /** 经纬度 → scene 坐标 (x → 东, z → 南，x,z 在 Three.js 默认水平面) */
  function toScene([lng, lat]) {
    const dx = (lng - originLng) * metersPerDegLng * scale;
    const dz = (lat - originLat) * METERS_PER_DEG_LAT * scale;
    return { x: dx, z: -dz }; // Three.js: z 轴正半轴指向屏幕外，取反使北在上
  }

  /** scene (x,z) → 经纬度 */
  function toLngLat({ x, z }) {
    const lat = originLat + -z / scale / METERS_PER_DEG_LAT;
    const lng = originLng + x / scale / metersPerDegLng;
    return [lng, lat];
  }

  /** 真实米数 → scene units */
  function metersToUnits(meters) {
    return meters * scale;
  }

  /** scene units → 真实米数 */
  function unitsToMeters(units) {
    return units / scale;
  }

  return {
    toScene,
    toLngLat,
    metersToUnits,
    unitsToMeters,
    metersPerUnit: 1 / scale,
    origin: { lng: originLng, lat: originLat },
    metersPerDegLng
  };
}

/**
 * 计算一组经纬度点的 bounding box（以 scene 坐标表示）
 * @param {GeoProjection} proj
 * @param {Array<[number, number]>} lnglats
 * @returns {{ minX: number, maxX: number, minZ: number, maxZ: number }}
 */
export function computeSceneBounds(proj, lnglats) {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;

  for (const ll of lnglats) {
    const { x, z } = proj.toScene(ll);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return { minX, maxX, minZ, maxZ };
}
