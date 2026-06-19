// js/api/routing.js
// 路径规划：4 种交通方式的统一接口
//
// 输入一个 segment（from / to / mode），输出统一的 result：
//   - 成功：{ ok: true, detail: { distance, duration, steps, label, icon, ... }, paths: [...] }
//   - 估算：{ ok: false, estimated: true, detail: {...} }
//   - 失败：{ ok: false }
//
// 上层（render/sidebar）只关心这个统一形态，不需要知道高德返回什么

import { AppConfig } from '../config.js';
import { toNumber, calculateDistance, cleanText, getTransportIcon, sleep } from '../utils.js';
import { getRouteDisplayLabel } from '../route-config.js';

// ─── 创建路线服务 ──────────────────────────────────────

export function createRouteService(AMap, map, mode) {
  const common = {
    map: null, // 不让高德自己画线，我们自己控制
    hideMarkers: true,
    autoFitView: false,
    isOutline: true,
    outlineColor: '#ffffff'
  };

  if (mode === 'transit') {
    return new AMap.Transfer({
      map,
      city: AppConfig.cityName,
      policy: (AMap.TransferPolicy && AMap.TransferPolicy.LEAST_TIME) || 0,
      extensions: 'all',
      autoFitView: false
    });
  }
  if (mode === 'walking') return new AMap.Walking(common);
  if (mode === 'riding') return new AMap.Riding(common);

  return new AMap.Driving(
    Object.assign({}, common, {
      policy: (AMap.DrivingPolicy && AMap.DrivingPolicy.LEAST_TIME) || 0,
      showTraffic: false
    })
  );
}

// ─── 真正搜路线 ────────────────────────────────────────

// segment: { fromLngLat, toLngLat, mode }
export async function searchRoute(AMap, service, segment) {
  const maxAttempts = 3;
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastResult = await searchRouteOnce(AMap, service, segment);
    if (lastResult.ok) return lastResult;
    if (attempt < maxAttempts) await sleep(450 * attempt);
  }

  log.warn('路线规划失败，使用估算兜底：', segment, lastResult?.status, lastResult?.raw);
  return buildEstimatedResult(segment);
}

function searchRouteOnce(AMap, service, segment) {
  const origin = new AMap.LngLat(Number(segment.fromLngLat[0]), Number(segment.fromLngLat[1]));
  const destination = new AMap.LngLat(Number(segment.toLngLat[0]), Number(segment.toLngLat[1]));

  return new Promise(resolve => {
    const callback = (status, result) => {
      if (isRouteSearchSuccess(status, result, segment.mode)) {
        const paths = segment.mode === 'transit' ? [] : extractRoutePaths(result);
        resolve({
          ok: true,
          detail: extractRouteDetail(segment, result),
          paths
        });
      } else {
        resolve({ ok: false, status, raw: result });
      }
    };

    try {
      // 驾车需要第三个空对象参数
      if (segment.mode === 'driving') {
        service.search(origin, destination, {}, callback);
      } else {
        service.search(origin, destination, callback);
      }
    } catch (error) {
      resolve({ ok: false, status: 'exception', raw: error });
    }
  });
}

// 估算结果：用直线距离 + 速度估时长，画虚线
export function buildEstimatedResult(segment) {
  const distance = calculateDistance(segment.fromLngLat, segment.toLngLat);
  const speedKmh = segment.mode === 'walking' ? 4.5 : segment.mode === 'riding' ? 13 : 22;
  const duration = Math.max(60, Math.round(distance / ((speedKmh * 1000) / 3600)));

  return {
    ok: false,
    estimated: true,
    detail: {
      mode: segment.mode,
      label: `${getRouteDisplayLabel(segment.routeToNext || segment)}（估算）`,
      icon: getTransportIcon(segment.mode),
      distance,
      duration,
      steps: []
    },
    paths: [[segment.fromLngLat, segment.toLngLat]]
  };
}

export function safeClearService(service) {
  if (service && typeof service.clear === 'function') {
    try {
      service.clear();
    } catch (err) {
      log.warn('清除路线服务失败：', err);
    }
  }
}

// ─── 内部：判断成功 ─────────────────────────────────────

function isRouteSearchSuccess(status, result, mode) {
  if (status !== 'complete' || !result) return false;
  // AMap SDK 在不同接口里返回的 info 大小写不一致（驾车/步行小写 'ok'，
  // 地理编码大写 'OK'），统一按大小写不敏感比较。
  if (result.info && result.info.toUpperCase() !== 'OK') return false;
  if (mode === 'transit') return Boolean(result.plans?.length);
  return Boolean(result.routes?.length);
}

// ─── 内部：提取距离/时长/文字步骤 ─────────────────────────

function extractRouteDetail(segment, result) {
  if (segment.mode === 'transit') return extractTransitDetail(segment, result);
  return extractSimpleRouteDetail(segment, result);
}

function extractTransitDetail(segment, result) {
  const plan = result.plans?.[0] || {};
  const steps = [];
  let transitBoardings = 0;

  (plan.segments || []).forEach(seg => {
    const walkDistance = toNumber(seg.walking?.distance);
    if (walkDistance > 80) {
      steps.push(
        `步行 ${walkDistance >= 1000 ? (walkDistance / 1000).toFixed(1) + ' 公里' : walkDistance + ' 米'}`
      );
    }

    const lines = getTransitLines(seg);
    transitBoardings += lines.length;
    lines.forEach(line => {
      const name = cleanText(line.name || line.lineName || '公共交通');
      const dep = getStopName(line.departure_stop || line.departureStop);
      const arr = getStopName(line.arrival_stop || line.arrivalStop);
      steps.push(`乘坐 ${name}${dep && arr ? `:${dep} → ${arr}` : ''}`);
    });

    if (seg.railway) {
      transitBoardings += 1;
      const name = cleanText(seg.railway.name || seg.railway.trip || '铁路');
      const dep = getStopName(seg.railway.departure_stop || seg.railway.departureStop);
      const arr = getStopName(seg.railway.arrival_stop || seg.railway.arrivalStop);
      steps.push(`乘坐 ${name}${dep && arr ? `:${dep} → ${arr}` : ''}`);
    }
  });

  return {
    mode: segment.mode,
    label: getRouteDisplayLabel(segment.routeToNext || segment),
    icon: getTransportIcon(segment.mode),
    distance: toNumber(plan.distance || result.distance),
    duration: toNumber(plan.time || plan.duration || result.time || result.duration),
    steps: steps.length ? steps.slice(0, 8) : ['按高德推荐公共交通方案前往。'],
    transitBoardings,
    transitTransfers: Math.max(0, transitBoardings - 1)
  };
}

function extractSimpleRouteDetail(segment, result) {
  const route = result?.routes?.[0] || {};
  return {
    mode: segment.mode,
    label: getRouteDisplayLabel(segment.routeToNext || segment),
    icon: getTransportIcon(segment.mode),
    distance: toNumber(route.distance || result.distance),
    duration: toNumber(route.time || route.duration || result.time || result.duration),
    steps: []
  };
}

// ─── 内部：提取轨迹（用于画 Polyline） ────────────────────

function extractRoutePaths(result) {
  const paths = [];
  const route = result?.routes?.[0];
  if (!route) return paths;

  pushPath(paths, route.path || route.polyline);
  (route.steps || []).forEach(step => pushPath(paths, step.path || step.polyline));
  (route.rides || []).forEach(ride => pushPath(paths, ride.path || ride.polyline));
  return paths;
}

function pushPath(paths, rawPath) {
  const path = normalizePath(rawPath);
  if (path.length >= 2) paths.push(path);
}

function normalizePath(rawPath) {
  if (!rawPath) return [];
  if (typeof rawPath === 'string') {
    return rawPath
      .split(/[;|]/)
      .map(item => normalizePoint(item.trim()))
      .filter(Boolean);
  }
  if (!Array.isArray(rawPath)) {
    const point = normalizePoint(rawPath);
    return point ? [point] : [];
  }
  return rawPath.map(normalizePoint).filter(Boolean);
}

function normalizePoint(point) {
  if (!point) return null;
  if (typeof point === 'string') {
    const parts = point.split(',').map(item => Number(item.trim()));
    return parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])
      ? [parts[0], parts[1]]
      : null;
  }
  if (Array.isArray(point) && point.length >= 2) {
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }
  if (point.location) return normalizePoint(point.location);
  if (typeof point.getLng === 'function' && typeof point.getLat === 'function') {
    return [Number(point.getLng()), Number(point.getLat())];
  }
  const lng = Number(point.lng != null ? point.lng : point.Lng);
  const lat = Number(point.lat != null ? point.lat : point.Lat);
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
}

function getTransitLines(seg) {
  const groups = [seg.transit?.lines, seg.bus?.buslines, seg.bus?.lines, seg.lines, seg.buslines];
  return groups.reduce((all, item) => {
    if (Array.isArray(item)) all.push(...item);
    else if (item) all.push(item);
    return all;
  }, []);
}

function getStopName(stop) {
  if (!stop) return '';
  if (typeof stop === 'string') return cleanText(stop);
  return cleanText(stop.name || stop.stationName || '');
}
