// js/api/geocode.js
// 地点解析：把"地点名"或"地址"变成 [lng, lat]
//
// 两种策略：
//   - resolveBy: 'poi'  → 用 PlaceSearch（适合特定门店、连锁品牌）
//   - 默认            → 用 Geocoder（适合街道地址、地标）
//
// 都支持 searchTerms 数组：依次尝试多个关键词，只要有一个命中就返回
// 单个关键词超过 6 秒还没回包就跳到下一个，避免卡死

import { AppConfig } from '../config.js';
import { unique } from '../utils.js';

const QUERY_TIMEOUT_MS = 6000;

// 创建可复用的 geocoder / placeSearch 服务实例
export function createGeocodeServices(AMap) {
  return {
    geocoder: new AMap.Geocoder({ city: AppConfig.cityCode }),
    placeSearch: new AMap.PlaceSearch({
      city: AppConfig.cityCode,
      citylimit: true,
      pageSize: 10,
      extensions: 'base'
    })
  };
}

// 解析单个地点
// loc: { name, query, addr, searchTerms?, includeKeywords?, resolveBy? }
// 返回：{ lnglat: [lng, lat] } 或 null
export function resolveLocation(services, loc) {
  if (loc.resolveBy === 'poi') {
    return placeSearchWithRetries(services.placeSearch, loc);
  }
  return geocodeWithRetries(services.geocoder, loc);
}

// 多结果搜索：给"添加地点"弹窗用，返回 POI 列表
// 关键词命中 0~10 个 POI；调用方让用户挑一个
// citylimit:false 是软提示，城市外的 POI 也能返回——以后跨城市行程能直接用
export function searchPlaces(AMap, keyword, options = {}) {
  return new Promise(resolve => {
    if (!AMap || !keyword) {
      resolve([]);
      return;
    }
    const ps = new AMap.PlaceSearch({
      city: options.city || AppConfig.cityCode,
      citylimit: false,
      pageSize: options.pageSize || 10,
      extensions: 'base'
    });
    ps.search(keyword, (status, result) => {
      if (status !== 'complete' || !result?.poiList?.pois) {
        resolve([]);
        return;
      }
      const places = result.poiList.pois
        .map(poi => ({
          id: poi.id,
          name: String(poi.name || ''),
          addr: String(poi.address || ''),
          city: String(poi.cityname || poi.adname || ''),
          type: String(poi.type || ''),
          lnglat: poi.location
            ? [Number(poi.location.lng), Number(poi.location.lat)]
            : null
        }))
        .filter(p => p.lnglat && Number.isFinite(p.lnglat[0]) && Number.isFinite(p.lnglat[1]));
      resolve(places);
    });
  });
}

// ─── 内部实现 ──────────────────────────────────────────

function placeSearchWithRetries(placeSearch, loc) {
  const queries = unique(
    (loc.searchTerms || [loc.query, loc.name]).filter(Boolean)
  );

  return tryQueries(queries, (query, next, done) => {
    placeSearch.search(query, (status, result) => {
      const pois = result?.poiList?.pois || [];
      const matched = pois.find(poi => {
        const name = String(poi?.name || '');
        return !loc.includeKeywords ||
               loc.includeKeywords.every(kw => name.includes(kw));
      });

      if (status === 'complete' && matched?.location) {
        done({
          lnglat: [Number(matched.location.lng), Number(matched.location.lat)]
        });
      } else {
        next();
      }
    });
  });
}

function geocodeWithRetries(geocoder, loc) {
  const queries = unique(
    (loc.searchTerms || [loc.query, loc.name, loc.addr]).filter(Boolean)
  );

  return tryQueries(queries, (query, next, done) => {
    geocoder.getLocation(query, (status, result) => {
      const geocodes = result?.geocodes || [];
      if (status === 'complete' && result.info === 'OK' && geocodes.length > 0) {
        const point = geocodes[0].location;
        done({
          lnglat: [Number(point.lng), Number(point.lat)]
        });
      } else {
        next();
      }
    });
  });
}

// 串行尝试多个 query，每个都有超时保护
// runner(query, nextCb, doneCb)：内部异步逻辑
//   - 调 nextCb() 表示"这个 query 没结果，试下一个"
//   - 调 doneCb(value) 表示"成功，返回 value"
function tryQueries(queries, runner) {
  return new Promise(resolve => {
    let index = 0;

    function next() {
      if (index >= queries.length) {
        resolve(null);
        return;
      }
      const query = queries[index++];
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          next();
        }
      }, QUERY_TIMEOUT_MS);

      runner(
        query,
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          next();
        },
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      );
    }

    next();
  });
}
