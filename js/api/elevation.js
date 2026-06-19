// js/api/elevation.js
// 高程数据获取：Open-Meteo Elevation API 封装
//
// 高德 JS API 不提供高程数据接口，使用 Open-Meteo 免费高程 API。
// 文档: https://open-meteo.com/en/docs/elevation-api
//
// 使用方式:
//   import { createLogger } from '../logger.js';
import { fetchElevationGrid } from './api/elevation.js';
//   const grid = await fetchElevationGrid(center, span, resolution);

const log = createLogger('elevation');
import { createLogger } from '../logger.js';
const log = createLogger('elevation');

import { createLogger } from "../logger.js";
const log = createLogger("elevation");

const ELEVATION_API = 'https://api.open-meteo.com/v1/elevation';
const MAX_LOCATIONS_PER_REQUEST = 100;
const gridCache = new Map();

/**
 * @typedef {object} ElevationGrid
 * @property {number[][]} heights — 2D 数组 [row][col]，单位: 米
 * @property {number} rows — 行数
 * @property {number} cols — 列数
 * @property {number} minLng — 网格最小经度
 * @property {number} maxLng — 网格最大经度
 * @property {number} minLat — 网格最小纬度
 * @property {number} maxLat — 网格最大纬度
 * @property {number} originLng — 中心经度
 * @property {number} originLat — 中心纬度
 */

/**
 * 从经纬度矩形区域获取高程网格
 * @param {object} options
 * @param {[number, number]} options.center — [lng, lat] 中心点
 * @param {number} options.span — 覆盖范围（米）
 * @param {number} [options.resolution=40] — 网格分辨率（每边采样点数，默认 40）
 * @returns {Promise<ElevationGrid|null>}
 */
export async function fetchElevationGrid({ center, span, resolution = 40 }) {
  if (!Array.isArray(center) || center.length < 2) return null;

  const [centerLng, centerLat] = center;
  const spanMeters = Math.max(600, Math.min(8000, Number(span) || 2000));

  // 米 → 度 近似转换（纬度 40° 附近）
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((centerLat * Math.PI) / 180);

  const halfSpanLat = spanMeters / 2 / metersPerDegLat;
  const halfSpanLng = spanMeters / 2 / metersPerDegLng;

  const minLat = centerLat - halfSpanLat;
  const maxLat = centerLat + halfSpanLat;
  const minLng = centerLng - halfSpanLng;
  const maxLng = centerLng + halfSpanLng;

  const cols = Math.max(8, Math.min(80, Math.round(resolution)));
  const rows = cols;
  const cacheKey = `${centerLng.toFixed(5)}:${centerLat.toFixed(5)}:${spanMeters}:${rows}x${cols}`;
  if (gridCache.has(cacheKey)) return gridCache.get(cacheKey);

  // 生成采样点数组
  const coordPairs = [];
  for (let row = 0; row < rows; row++) {
    const lat = minLat + (maxLat - minLat) * (row / (rows - 1));
    for (let col = 0; col < cols; col++) {
      const lng = minLng + (maxLng - minLng) * (col / (cols - 1));
      coordPairs.push(`${lat.toFixed(6)},${lng.toFixed(6)}`);
    }
  }

  try {
    const elevations = [];
    for (let start = 0; start < coordPairs.length; start += MAX_LOCATIONS_PER_REQUEST) {
      const chunk = coordPairs.slice(start, start + MAX_LOCATIONS_PER_REQUEST);
      const url = new URL(ELEVATION_API);
      url.searchParams.set('locations', chunk.join('|'));
      url.searchParams.set('format', 'json');

      const resp = await fetch(url.toString(), {
        headers: { accept: 'application/json' }
      });
      if (!resp.ok) throw new Error(`Elevation API ${resp.status}`);

      const data = await resp.json();
      if (!Array.isArray(data.elevation)) throw new Error('Invalid elevation response');
      elevations.push(...data.elevation);
    }

    if (elevations.length < rows * cols) throw new Error('Incomplete elevation response');

    // 将扁平数组重组为 2D 网格
    const heights = [];
    for (let row = 0; row < rows; row++) {
      const rowData = [];
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        rowData.push(Number(elevations[idx]) || 0);
      }
      heights.push(rowData);
    }

    const grid = {
      heights,
      rows,
      cols,
      minLng,
      maxLng,
      minLat,
      maxLat,
      originLng: centerLng,
      originLat: centerLat
    };
    gridCache.set(cacheKey, grid);
    return grid;
  } catch (err) {
    log.warn('[elevation] 获取高程数据失败，使用平坦地形:', err.message);
    return null;
  }
}

/**
 * 获取单个点的高程
 * @param {[number, number]} lnglat — [lng, lat]
 * @returns {Promise<number|null>} 高程（米），失败返回 null
 */
export async function fetchPointElevation([lng, lat]) {
  try {
    const url = new URL(ELEVATION_API);
    url.searchParams.set('locations', `${lat.toFixed(6)},${lng.toFixed(6)}`);
    url.searchParams.set('format', 'json');

    const resp = await fetch(url.toString(), {
      headers: { accept: 'application/json' }
    });
    if (!resp.ok) return null;

    const data = await resp.json();
    return Number(data.elevation?.[0]) || 0;
  } catch {
    return null;
  }
}
