// js/main.js
// 应用入口 + 业务编排
//
// 这个文件负责"做什么时候做什么"的业务流程，自己几乎不写渲染或 API 细节
// 主要做三件事：
//   1) boot：加载 SDK → 初始化地图 → 渲染界面 → 解析地点
//   2) selectDay：切换日期时，更新 UI + marker 显示 + 启动路线规划
//   3) planRoutes：编排"规划路线 → 画线 → 更新卡片"

import { AppConfig } from './config.js';
import { loadAMap } from './api/amap-loader.js';
import { createGeocodeServices, resolveLocation, searchPlaces, searchNearBy, reverseGeocode, buildDisplayAddress } from './api/geocode.js';
import { extractGuideText, getGuideImportStatus } from './api/guide-import.js';
import {
  createRouteService, searchRoute, buildEstimatedResult, safeClearService
} from './api/routing.js';
import {
  getAppState, getTrip, getDay, getLocation, setActiveDayId, setAMap,
  updateLocation, removeLocation,
  updateTripMeta,
  initWorkspace, getWorkspace, hasActiveTrip,
  createTrip, switchTrip, renameTrip, deleteTrip,
  addDay, updateDay, removeDay,
  addLocation, addEventToDay, updateEventInDay, removeEventFromDay,
  addUnscheduledEvent, updateUnscheduledEvent, removeUnscheduledEvent,
  moveEventInDay, reorderEventInDay, moveEventBetweenContainers, updateRouteToNext, on
} from './state.js';
import {
  initMap, createAllMarkers, createOrUpdateMarker, removeMarker, clearAllMarkers,
  pruneMarkersToLocationIds, showEmptyMapView,
  showMarkersForDay, fitMarkers, fitSegment, focusLocation,
  drawRoutePaths, clearRouteOverlays, highlightSegment, clearSegmentHighlight
} from './render/map.js';
import {
  renderHeader, renderTabs, renderItinerary,
  updateActiveTab, updateVisibleDayGroups,
  setRouteCardLoading, updateRouteCardOk, updateRouteCardEstimated,
  updateRouteCardError, resetRouteCards, setStatus,
  buildRouteSegments
} from './render/sidebar.js?v=20260509-v6';
import { openSearchModal } from './render/search-modal.js?v=20260509-v5';
import { openEventEditorModal } from './render/event-editor-modal.js?v=20260509-v6';
import { openGuideImportModal } from './render/guide-import-modal.js';
import { openGuidePreviewModal } from './render/guide-preview-modal.js';
import { openDayEditorModal } from './render/day-editor-modal.js';
import { openRouteEditorModal } from './render/route-editor-modal.js';
import { openTripModal } from './render/trip-modal.js';
import { openShareModal, updateShareImage, setShareImageLoading } from './render/share-modal.js';
import { renderWorkspaceTabs, closeWorkspaceMenu } from './render/workspace-tabs.js';
import { readSharedTripFromURL } from './share.js';
import { buildTripShareImage, dataURLToBlob } from './share-image.js?v=20260508-r5';
import { loadWorkspace, saveWorkspace } from './storage.js';
import { sleep } from './utils.js';
import { inferIconId } from './render/icons.js';

const GUIDE_MATCH_LIMIT = 40;
const GUIDE_MATCH_TIMEOUT_MS = 8000;

// ─── boot ──────────────────────────────────────────────

// 启动 banner——刷新后 console 第一行能确认你拿到的是 v8c 代码（不是缓存）
console.log('%c[trip-app] main.js v8e · L3 Geocoder + 反向 enrich (rating/photo)', 'color:#c95f4a;font-weight:bold');

window.addEventListener('load', boot);

async function boot() {
  const savedWorkspace = await loadWorkspace();
  const sharedTrip = readSharedTripFromURL();
  initWorkspace(savedWorkspace, sharedTrip);
  await persistWorkspace();

  renderWorkspace();
  renderHeader();
  setStatus('正在加载高德地图 JS API 2.0...');
  bindShareButton();

  // 订阅 trip 变更：编辑模式下任何 mutator 都会触发，UI 自动重渲
  on('trip:changed', handleTripChanged);
  on('trip:replaced', handleTripReplaced);
  on('workspace:changed', handleWorkspaceChanged);
  on('workspace:replaced', handleWorkspaceChanged);
  on('location:updated', persistWorkspace);

  renderAll();

  try {
    const AMap = await loadAMap();
    setAMap(AMap);

    initMap(AMap);
    createAllMarkers();
    selectDay('all', { fitView: true, planRoutes: false });
    syncEmptyWorkspaceUI();

    // 后台异步校准坐标，完成后重新设置当前选中的日期
    await resolveAllLocations();
    if (hasActiveTrip()) selectDay(getAppState().activeDayId, { fitView: false, planRoutes: true });
  } catch (error) {
    console.error('高德地图加载失败：', error);
    setStatus('<strong>地图加载失败。</strong>请检查 Key、安全密钥、域名白名单和网络状态。');
  }
}

function renderAll() {
  renderWorkspace();
  renderTabs({
    onSelectDay: (dayId) => selectDay(dayId, { fitView: true, planRoutes: true }),
    onAddDay: openCreateDayFlow
  });
  renderItinerary(getItineraryHandlers());
  syncEmptyWorkspaceUI();
}

function getItineraryHandlers() {
  return {
    onEventClick: (dayId, event) => {
      getAppState().selectedEventRef = { dayId, eventId: event.id };
      clearSegmentHighlight();
      focusLocation(event.locationId);
    },
    onRouteClick: (segment) => {
      fitSegment(segment);
      highlightSegment(segment.id);
    },
    onEditRoute: openRouteEditorFlow,
    onEditDay: openEditDayFlow,
    onEditEvent: openEditEventFlow,
    onAddLocation: (dayId) => openAddLocationFlow({ dayId }),
    onAddUnscheduledLocation: () => openAddLocationFlow({ dayId: 'unscheduled' }),
    onAddAfterEvent: (dayId, eventId) => openAddLocationFlow({ dayId, afterEventId: eventId }),
    onMoveEvent: moveEventInDay,
    onReorderEvent: reorderEventInDay,
    onDropEvent: handleEventDrop,
    onDeleteEvent: deleteEventFlow,
    onAddDay: openCreateDayFlow,
    onCreateTrip: openCreateTripFlow,
    onImportGuide: openGuideImportFlow
  };
}

function renderWorkspace() {
  renderWorkspaceTabs({
    onSelectTrip: (tripId) => {
      if (switchTrip(tripId)) {
        clearSegmentHighlight();
        setStatus('已切换行程。');
      }
    },
    onCreateTrip: openCreateTripFlow,
    onImportGuide: openGuideImportFlow,
    onRenameTrip: openRenameTripFlow,
    onDeleteTrip: deleteTripFlow
  });
}

function openCreateTripFlow() {
  if (getWorkspace().trips.length >= 3) {
    setStatus('最多只能同时保存 3 个行程。请先删除一个旧行程。');
    return;
  }
  openTripModal({
    mode: 'create',
    handlers: {
      onCreate: (title) => {
        createTrip(title);
        setStatus('已新建旅行路线。Day 1 已创建，可以开始添加地点。');
      }
    }
  });
}

function openRenameTripFlow(tripId) {
  const target = getWorkspace().trips.find(item => item.id === tripId);
  if (!target) return;
  openTripModal({
    mode: 'edit',
    title: target.title,
    handlers: {
      onSave: (title) => {
        renameTrip(tripId, title);
        setStatus('旅行标题已更新。');
      }
    }
  });
}

function deleteTripFlow(tripId) {
  const target = getWorkspace().trips.find(item => item.id === tripId);
  if (!target) return;
  const ok = window.confirm(`删除“${target.title || '这个行程'}”？这个行程里的日期和地点都会一起删除。`);
  if (!ok) return;
  deleteTrip(tripId);
  setStatus(hasActiveTrip() ? '行程已删除。' : '还没有行程。点击添加第一个行程。');
}

async function buildGuideDraft(extracted, source, onProgress) {
  const city = source.cityHint || extracted.city || '';
  const events = [];
  let matched = 0;
  const warnings = [...(extracted.warnings || [])];
  const normalizedEvents = normalizeGuideEventsFromSource(extracted.events || [], source.text || '', warnings);
  const validEvents = normalizedEvents.filter(item => item?.place_name);
  const eventsToMatch = validEvents.slice(0, GUIDE_MATCH_LIMIT);
  if (validEvents.length > GUIDE_MATCH_LIMIT) {
    warnings.push(`已保留前 ${GUIDE_MATCH_LIMIT} 个主路线地点，其余地点已忽略，可在导入后手动补充。`);
  }
  const total = eventsToMatch.length;
  // matching step 开始前先 yield 一帧让 UI 切换到"匹配地点"，避免 LLM 阶段一过就立刻冲到下一步
  onProgress?.('matching', total ? `准备匹配 ${total} 个地点...` : '正在整理...');
  await sleep(220);

  for (let index = 0; index < total; index += 1) {
    const item = eventsToMatch[index];
    // detail 文本带上具体地点名——给用户视觉强信号，避免 step 切换被 1 秒一闪而过
    onProgress?.('matching', `正在匹配 ${item.place_name || '地点'} (${index + 1}/${total})`);
    setStatus(`正在匹配高德地点：${index + 1}/${total}（${item.place_name || ''}）`);

    const poi = await withTimeout(
      matchGuidePlace({
        placeName: item.place_name,
        city,
        note: item.note,
        sourceQuote: item.source_quote
      }),
      GUIDE_MATCH_TIMEOUT_MS,
      null,
      `匹配 ${item.place_name}`
    );
    if (poi) matched += 1;
    events.push({
      id: `guide-${Date.now().toString(36)}-${index}`,
      placeName: item.place_name,
      day: Number.isInteger(item.day) && item.day > 0 ? item.day : null,
      timeSlot: '',
      note: poi ? (item.note || '') : '',
      sourceQuote: item.source_quote || '',
      poi,
      matched: Boolean(poi),
      deleted: false
    });
    await sleep(80);
  }

  onProgress?.('previewing', '正在整理导入预览...');
  await sleep(180); // 让 "整理预览" 状态可见
  return {
    title: extracted.title_suggestion || `${city || 'AI'}旅行路线`,
    city,
    cityHint: source.cityHint || '',
    sourceText: source.text || '',
    guideType: extracted.guide_type,
    warnings,
    events,
    matched
  };
}

function withTimeout(promise, ms, fallback, label = '异步任务') {
  let settled = false;
  let timerId;
  return new Promise((resolve) => {
    timerId = window.setTimeout(() => {
      settled = true;
      console.warn(`[guide-import] ${label} 超时，已跳过。`);
      resolve(fallback);
    }, ms);

    Promise.resolve(promise).then((value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timerId);
      resolve(value);
    }).catch((error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timerId);
      console.warn(`[guide-import] ${label} 失败，已跳过：`, error);
      resolve(fallback);
    });
  });
}

function normalizeGuideEventsFromSource(events, sourceText, warnings) {
  const routePlan = extractMainRoutePlan(sourceText);
  if (!routePlan.length) return events;

  const extractedByName = new Map();
  for (const item of events || []) {
    const key = normalizeGuidePlaceName(item?.place_name || '');
    if (key && !extractedByName.has(key)) extractedByName.set(key, item);
  }

  const normalized = routePlan.map((routeItem) => {
    const key = normalizeGuidePlaceName(routeItem.name);
    const existing = extractedByName.get(key);
    const note = compactGuideNote([routeItem.note, existing?.note].filter(Boolean).join('；'));
    return {
      ...existing,
      place_name: routeItem.name,
      day: routeItem.day,
      time_slot: existing?.time_slot ?? null,
      note,
      source_quote: existing?.source_quote || routeItem.sourceQuote || routeItem.name
    };
  });

  if (normalized.length && normalized.length < (events || []).length) {
    warnings.push('已按主路线提取地点，沿途小店和机位已合并进备注。');
  }
  return normalized.length ? normalized : events;
}

function extractMainRoutePlan(sourceText) {
  const text = String(sourceText || '');
  const lines = text.split(/\r?\n/g).map(line => line.trim()).filter(Boolean);
  const routeItems = [];
  const noteByPlace = new Map();
  let currentDay = null;
  let routeLineCount = 0;

  for (const line of lines) {
    const dayFromHeader = parseRouteDay(line);
    if (dayFromHeader) currentDay = dayFromHeader;

    const routeText = extractRouteLineText(line);
    if (routeText) {
      routeLineCount += 1;
      const day = currentDay || routeLineCount;
      const points = routeText
        .split(/[→>＞]+/g)
        .map(cleanRoutePlaceName)
        .filter(Boolean);

      for (const point of points) {
        routeItems.push({
          name: point,
          day,
          note: '',
          sourceQuote: line.slice(0, 80)
        });
      }
      continue;
    }

    const note = parseRoutePointNote(line);
    if (note) {
      noteByPlace.set(normalizeGuidePlaceName(note.name), note.text);
    }
  }

  const seen = new Set();
  const result = [];
  for (const item of routeItems) {
    const key = `${item.day}:${normalizeGuidePlaceName(item.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const note = findRouteNoteForPlace(item.name, noteByPlace);
    result.push({
      ...item,
      note: note ? compactGuideNote(note) : ''
    });
  }

  return result.length >= 3 ? result : [];
}

function parseRouteDay(line) {
  const alpha = line.match(/(?:^|[\s【\[])([ABC])\s*线/i);
  if (alpha) return alpha[1].toUpperCase().charCodeAt(0) - 64;
  const zhMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const route = line.match(/路线\s*([一二三四五六1-6])/);
  if (route) return zhMap[route[1]] || Number(route[1]) || null;
  const day = line.match(/(?:Day|DAY|D)\s*([1-9])/);
  if (day) return Number(day[1]);
  return null;
}

function extractRouteLineText(line) {
  if (!/[→>＞]/.test(line)) return '';
  const match = line.match(/(?:^|[▶▷\-—\s])(?:路线|行程|线路)\s*[：:]\s*(.+)$/);
  if (!match) return '';
  return match[1]
    .replace(/[，,。；;].*$/, '')
    .replace(/全程.*$/, '')
    .trim();
}

function cleanRoutePlaceName(value) {
  return String(value || '')
    .replace(/^[\s✔✓✅📍🔥⭐▶▷\-—、]+/, '')
    .replace(/\s*(?:路线|行程|线路)\s*$/, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[，,。；;：:].*$/, '')
    .trim();
}

function parseRoutePointNote(line) {
  const match = line.match(/^[\s✔✓✅📍🔥⭐\-—、]*([^：:]{2,24})[：:]\s*(.+)$/);
  if (!match) return null;
  const name = cleanRoutePlaceName(match[1]);
  const text = compactGuideNote(match[2]);
  if (!name || !text) return null;
  return { name, text };
}

function findRouteNoteForPlace(placeName, noteByPlace) {
  const placeKey = normalizeGuidePlaceName(placeName);
  if (noteByPlace.has(placeKey)) return noteByPlace.get(placeKey);
  for (const [key, note] of noteByPlace.entries()) {
    if (key.startsWith(placeKey) || placeKey.startsWith(key)) return note;
  }
  return '';
}

function compactGuideNote(value) {
  const parts = String(value || '')
    .replace(/[✅✔✓📍🔥⭐]/g, '')
    .split(/[，,、；;]+/g)
    .map(item => item.trim())
    .filter(Boolean);
  const compact = Array.from(new Set(parts)).slice(0, 6).join('、');
  return compact.length > 70 ? `${compact.slice(0, 70)}...` : compact;
}

function normalizeGuidePlaceName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·•\-_—,，.。:：;；()（）【】\[\]《》"'“”‘’]/g, '');
}

// 攻略地点匹配：按 PRD §4.4 的降级链做 (Layer 3 source_quote 提名词已删，V1 只剩 2 层 + 兜底)
//
//   Layer 1: place_name + city → top1 相似度 ≥ 0.7 → 直接返回
//   Layer 2: place_name + note 关键词扩展 → 任意候选相似度 ≥ 0.5 → 返回最高相似度的
//   兜底:    都没命中 → 返回 null（预览页标灰，用户手动搜）
//
// 之前 Codex 只实现了 Layer 1 + 拿 places[0] 不做 similarity check——所以 LLM 提取的
// "便宜坊" 撞不上高德的 "便宜坊烤鸭(xx店)"，看似 fail；预览页手动搜能命中是因为用户能挑。
async function matchGuidePlace({ placeName, city, note, sourceQuote }) {
  const state = getAppState();
  if (!state.AMap || !placeName) return null;

  // Layer 1: place_name + city
  const placesL1 = await searchGuidePlaces(placeName, city, 10);
  const bestL1 = pickBestMatch(placesL1, placeName, 0.55);
  // 日志默认开，方便用户/开发自助 debug；上线前可统一关
  console.log(`[guide-match] L1 "${placeName}"`, {
    city,
    count: placesL1.length,
    candidates: placesL1.slice(0, 5).map(p => ({
      name: p.name,
      score: similarityScore(p.name, placeName).toFixed(2)
    })),
    picked: bestL1?.name || null
  });
  if (bestL1) return bestL1;

  // Layer 2: place_name + note 关键词扩展
  const keywords = extractNounKeywords(note, sourceQuote, placeName);
  for (const kw of keywords) {
    const expandedKeyword = `${placeName} ${kw}`.trim();
    const placesL2 = await searchGuidePlaces(expandedKeyword, city, 8);
    const bestL2 = pickBestMatch(placesL2, placeName, 0.4);
    console.log(`[guide-match] L2 "${expandedKeyword}"`, {
      count: placesL2.length,
      candidates: placesL2.slice(0, 3).map(p => ({
        name: p.name,
        score: similarityScore(p.name, placeName).toFixed(2)
      })),
      picked: bestL2?.name || null
    });
    if (bestL2) return bestL2;
  }

  // Layer 3 (兜底): Geocoder 地址解析——专门救 PlaceSearch 吞掉的知名地标
  const geocoded = await geocodeAsPOI(placeName, city);
  if (geocoded) {
    // L3 拿到 lnglat 后，反向再做一次 searchNearBy 补全 rating/cost/photo 等 rich metadata
    const enriched = await enrichGeocodedPOI(geocoded, placeName);
    if (enriched) {
      console.log(`[guide-match] L3+enrich "${placeName}"`, {
        addr: enriched.addr,
        rating: enriched.rating ?? null,
        cost: enriched.cost ?? null,
        hasPhoto: Boolean(enriched.photo)
      });
      return enriched;
    }
    // enrich 失败也没关系，用纯 Geocoder 结果（无 photo/rating，但有坐标）
    console.log(`[guide-match] L3 Geocoder "${placeName}" (无 enrich 数据)`, { addr: geocoded.addr });
    return geocoded;
  }

  console.warn(`[guide-match] "${placeName}" 全部层级失败 → 标灰`);
  return null;
}

// 从一堆候选 POI 里挑出与 placeName 最相似的（相似度 ≥ threshold 才算命中）
// PRD §4.4.2 阈值定义：≥ 70% 高置信度自动绑；< 70% 标灰
function pickBestMatch(places, placeName, threshold) {
  if (!places?.length) return null;
  let best = null;
  let bestScore = 0;
  for (const place of places) {
    const score = similarityScore(place.name, placeName);
    if (score > bestScore) {
      best = place;
      bestScore = score;
    }
  }
  return bestScore >= threshold ? best : null;
}

// 简易字符相似度：综合"包含关系"和"字符交集占比"
// 例：("便宜坊烤鸭(王府井店)", "便宜坊") → 包含 → min/max = 3/11 ≈ 0.27 — 但我们更看重 LLM
//     名是否被高德名包含。所以包含关系给一个保底加分。
function similarityScore(amapName, llmName) {
  const a = String(amapName || '').toLowerCase().replace(/\s+/g, '');
  const b = String(llmName || '').toLowerCase().replace(/\s+/g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  // 包含关系：LLM 名是高德名的子串（如 "便宜坊" ⊂ "便宜坊烤鸭"）→ 高置信
  if (a.includes(b) || b.includes(a)) {
    const minLen = Math.min(a.length, b.length);
    const maxLen = Math.max(a.length, b.length);
    // 子串占比 + 0.4 加权（鼓励完整包含的匹配）
    return Math.min(1, minLen / maxLen + 0.4);
  }
  // 不包含：用字符交集
  const setB = new Set(b);
  let common = 0;
  for (const ch of a) if (setB.has(ch)) common++;
  return common / Math.max(a.length, b.length);
}

// Layer 3 兜底拿到 lnglat 后，用 PlaceSearch.searchNearBy 反向回填 rich metadata。
// 思路：Geocoder 已经精确定位到地点 → 用这个 lnglat 做圆心 + placeName 做关键词搜
// 800m 内的 POI → 命中带 rating/cost/photo/tag 的"同一地点"PlaceSearch 条目。
//
// 为什么这次能拿到 PlaceSearch 之前拿不到的：
//   - 之前 PlaceSearch 用 city 名做 scope，被 AMap 内部 quirk 吞掉
//   - 现在用 lnglat 做精确空间约束，搜索效率高很多
//   - 例：「颐和园」之前 city='北京' 三层 0 结果 → Geocoder 解出 lnglat → searchNearBy
//          以那个 lnglat 为圆心搜「颐和园」→ 命中带 rating 4.6、photo 的颐和园 POI
//
// 失败时返回 null，调用方继续用 Geocoder 的简化 POI。
async function enrichGeocodedPOI(geocoded, placeName) {
  if (!geocoded?.lnglat || !placeName) return null;
  const state = getAppState();
  if (!state.AMap) return null;

  const places = await searchNearBy(state.AMap, {
    keyword: placeName,
    center: geocoded.lnglat,
    radius: 800
  });
  if (!places.length) return null;

  // 用 similarity 筛掉"附近的不同店铺"——确保命中是同一个地点
  // 阈值 0.5 略宽（已经被空间约束过滤过一次，主要拦明显误匹配）
  const best = pickBestMatch(places, placeName, 0.5);
  if (!best) return null;

  // 优先用 PlaceSearch 的完整数据（含 rating/cost/photo）
  // lnglat 用 PlaceSearch 给的（POI 入口位置，比 Geocoder 的"地理中心"更适合 marker）
  return best;
}

// Layer 3 兜底：用 AMap.Geocoder（地址解析）拿坐标
// PlaceSearch 三层全 0 时的最后救命——例如"鼓楼""颐和园"这种知名地标
// AMap 的 PlaceSearch 偶尔会吞它们，但 Geocoder 几乎总能解出。
// 返回的 POI 形态简化：只有 name/addr/lnglat，没有 rating/cost/photo——
// 但用户能在地图上看到 marker，预览页也显示 ✓ 已匹配。
async function geocodeAsPOI(placeName, city) {
  const state = getAppState();
  if (!state.AMap || !placeName) return null;
  const AMap = state.AMap;
  return new Promise(resolve => {
    const geocoder = new AMap.Geocoder({
      city: city || ''
    });
    geocoder.getLocation(placeName, (status, result) => {
      if (status !== 'complete' || (result?.info || '').toUpperCase() !== 'OK') {
        resolve(null);
        return;
      }
      const geo = result.geocodes?.[0];
      if (!geo?.location) { resolve(null); return; }
      const lng = Number(geo.location.lng);
      const lat = Number(geo.location.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) { resolve(null); return; }
      resolve({
        id: `geo-${geo.adcode || Date.now().toString(36)}`,
        name: placeName, // Geocoder 没返回 name，用用户输入兜底
        addr: String(geo.formattedAddress || '').trim(),
        province: String(geo.addressComponent?.province || '').trim(),
        city: String(geo.addressComponent?.city || geo.addressComponent?.province || city || '').trim(),
        district: String(geo.addressComponent?.district || '').trim(),
        type: '',
        lnglat: [lng, lat]
      });
    });
  });
}

// 从 note / source_quote 抽中文名词关键词，给 Layer 2 做扩展搜索用
// 简单粗暴：按标点切分 → 取长度 ≥ 2 的中文片段 → 去重 → 取最长的 2 个
// （不调 LLM，纯规则；够 Layer 2 用）
function extractNounKeywords(note, sourceQuote, excludeKeyword = '') {
  const text = `${note || ''} ${sourceQuote || ''}`;
  if (!text.trim()) return [];
  const fragments = text
    .split(/[，。、；,\.\s\d:：()（）"'""''!！?？\-—~～·\/]+/g)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && s.length <= 8 && /^[一-鿿]+$/.test(s))
    .filter(s => !excludeKeyword.includes(s) && !s.includes(excludeKeyword));
  // 去重并按长度倒序，取前 2 个
  const dedup = Array.from(new Set(fragments));
  dedup.sort((a, b) => b.length - a.length);
  return dedup.slice(0, 2);
}

// 攻略地点搜索的降级：
//   Layer A: city 名（AI/用户给的城市）
//   Layer B: 全国搜（city: false）
//
// 不回退 AppConfig.cityCode（默认北京）。否则上海攻略在 city 搜索失败后，会被北京候选污染。
async function searchGuidePlaces(keyword, city, pageSize = 8) {
  const state = getAppState();
  if (!keyword) return [];
  const AMap = state.AMap || await loadAMap();
  if (!state.AMap) setAMap(AMap);

  const cityCandidates = [];
  if (city) cityCandidates.push(city); // A: AI/用户城市名
  cityCandidates.push(false);          // B: 全国兜底。不要回退默认北京，避免跨城市攻略误匹配。

  for (const cityArg of cityCandidates) {
    const places = await searchPlaces(AMap, keyword, { city: cityArg, pageSize });
    console.log(`[guide-search] "${keyword}" tried city=${JSON.stringify(cityArg)} → count=${places.length}`,
      places.length ? `first="${places[0]?.name}"` : '');
    if (places.length) return places;
  }
  console.warn(`[guide-search] "${keyword}" 城市/全国搜索都 0 结果`, { tried: cityCandidates });
  return [];
}

function importGuideDraft(draft) {
  const activeEvents = draft.events.filter(event => !event.deleted);
  if (!activeEvents.length) {
    setStatus('没有可导入的地点。');
    return;
  }
  if (getWorkspace().trips.length >= 3) {
    setStatus('最多保存 3 个行程，请先删除一个旧行程。');
    return;
  }

  const title = String(draft.title || '').trim() || 'AI 导入行程';
  const tripId = createTrip(title);
  if (!tripId) {
    setStatus('创建新行程失败，请重试。');
    return;
  }
  if (draft.city) updateTripMeta({ city: draft.city });

  const maxDay = Math.max(1, ...activeEvents.map(event => Number(event.day) || 0));
  while (getTrip().days.length < maxDay) addDay({ title: '' });

  const dayIds = getTrip().days.map(day => day.id);
  activeEvents.forEach(event => {
    const poi = event.poi;
    const name = poi?.name || event.placeName;
    const addr = buildDisplayAddress(poi || {}) || poi?.addr || '';
    const locationId = addLocation({
      name,
      query: event.placeName,
      addr,
      lnglat: poi?.lnglat || null,
      photo: poi?.photo || '',
      type: poi?.type || '',
      province: poi?.province || '',
      city: poi?.city || '',
      district: poi?.district || '',
      tag: poi?.tag || ''
    });
    const payload = {
      title: event.placeName,
      icon: inferIconId({
        title: event.placeName,
        name,
        addr,
        type: poi?.type,
        tag: poi?.tag
      }),
      timeSlot: event.timeSlot,
      note: event.matched ? event.note : '',
      locationId
    };

    if (event.day == null) {
      addUnscheduledEvent(payload);
    } else {
      const dayId = dayIds[event.day - 1] || dayIds[0];
      addEventToDay(dayId, payload, { preserveOrder: true });
    }
  });

  renderAll();
  selectDay('all', { fitView: true, planRoutes: false });
  setStatus(`已从攻略导入 ${activeEvents.length} 个地点。`);
}

function openCreateDayFlow() {
  openDayEditorModal({
    mode: 'create',
    day: { title: '' },  // V5：title 默认空，提交后 sidebar 显示"新的一天"
    handlers: {
      onCreate: (patch) => {
        const dayId = addDay(patch);
        return !!dayId;
      }
    }
  });
}

function openEditDayFlow(dayId) {
  const day = getDay(dayId);
  if (!day) return;

  openDayEditorModal({
    mode: 'edit',
    day,
    canDelete: getTrip().days.length > 1,
    handlers: {
      onSave: (_day, patch) => updateDay(dayId, patch),
      onDelete: () => deleteDayFlow(dayId)
    }
  });
}

function deleteDayFlow(dayId) {
  const day = getDay(dayId);
  if (!day) return;
  if (getTrip().days.length <= 1) {
    setStatus('每个旅行路线至少需要保留 1 天。');
    return;
  }

  // V5：用 Day N 替代日期文案
  const dayIndex = getTrip().days.findIndex(d => d.id === dayId);
  const dayLabel = dayIndex >= 0 ? `Day ${dayIndex + 1}` : '这一天';
  const titleSuffix = day.title?.trim() ? ` · ${day.title}` : '';
  const ok = window.confirm(`删除"${dayLabel}${titleSuffix}"？这一天里的日程也会一起删除。`);
  if (!ok) return;

  removeDay(dayId);
}

function bindShareButton() {
  document.getElementById('share-trip-btn')?.addEventListener('click', async () => {
    if (!hasActiveTrip()) {
      setStatus('请先新建行程，再生成分享长图。');
      return;
    }
    setStatus('正在生成分享长图...');
    try {
      const includeRoutes = false; // 默认不勾选交通方式
      const image = await buildTripShareImage(getTrip(), { includeRoutes });
      openShareModal({
        imageUrl: image.dataURL,
        filename: image.filename,
        includeRoutes,
        handlers: {
          onDownload: downloadShareImage,
          onCopyImage: copyShareImage,
          onRegenerate: regenerateShareImage
        }
      });
      setStatus('分享长图已生成。');
    } catch (error) {
      console.error('生成分享长图失败：', error);
      setStatus('分享长图生成失败，请稍后再试。');
    }
  });
}

async function regenerateShareImage(includeRoutes) {
  if (!hasActiveTrip()) return;
  try {
    const image = await buildTripShareImage(getTrip(), { includeRoutes });
    updateShareImage(image.dataURL, image.filename);
    setStatus(includeRoutes
      ? '分享长图已重新生成（含交通方式）。'
      : '分享长图已重新生成。');
  } catch (error) {
    console.error('重新生成分享长图失败：', error);
    setStatus('重新生成失败，请关闭后再试。');
    setShareImageLoading(false);
  }
}

function downloadShareImage(imageUrl, filename) {
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = filename || 'trip-share.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function copyShareImage(imageUrl) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    setStatus('当前浏览器不支持直接复制图片，请使用“下载长图”。');
    return;
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': dataURLToBlob(imageUrl) })
    ]);
    setStatus('分享长图已复制。');
  } catch (error) {
    console.warn('复制图片失败：', error);
    setStatus('复制图片失败，请使用“下载长图”。');
  }
}

// ─── 添加地点流程 ───────────────────────────────────────


// "搜附近"流水线（不再调 LLM）：直接用用户原话当 keyword，在锚点附近搜
// 默认半径 5km；最多返回 4 个 POI（按高德返回顺序，离锚点近优先）
const NEARBY_DEFAULT_RADIUS = 5000;
const NEARBY_MAX_RESULTS = 4;
async function runNearbySearch({ userInput, anchorLocation, AMap }) {
  if (!userInput) return [];
  const center = Array.isArray(anchorLocation?.lnglat) && anchorLocation.lnglat.length >= 2
    ? anchorLocation.lnglat
    : null;

  let candidates;
  if (center) {
    candidates = await searchNearBy(AMap, {
      keyword: userInput,
      center,
      radius: NEARBY_DEFAULT_RADIUS
    });
  } else {
    // 没锚点（当天为空）：退化为全城关键词搜索
    candidates = await searchPlaces(AMap, userInput);
  }
  return candidates.slice(0, NEARBY_MAX_RESULTS);
}

// 解析"添加地点"流程的搜附近锚点：
// 1) 卡片内 +：使用 afterEventId 对应的地点
// 2) 日期栏 +：优先使用同一天当前高亮地点
// 3) 无高亮：回退到当天最后一个地点
function resolveAddLocationAnchor(dayId, afterEventId) {
  const isUnscheduled = dayId === 'unscheduled';
  const day = isUnscheduled ? { id: 'unscheduled', events: getTrip().unscheduled || [] } : getDay(dayId);
  if (!day) return null;
  const events = day.events || [];
  if (!events.length) return null;

  let anchorEvent;
  if (afterEventId) {
    anchorEvent = events.find(e => e.id === afterEventId);
  }
  if (!anchorEvent) {
    const selected = getAppState().selectedEventRef;
    if (selected?.dayId === dayId) {
      anchorEvent = events.find(e => e.id === selected.eventId);
    }
  }
  if (!anchorEvent) anchorEvent = events[events.length - 1];
  if (!anchorEvent?.locationId) return null;
  return getLocation(anchorEvent.locationId) || null;
}

function openAddLocationFlow(options = {}) {
  if (!hasActiveTrip()) return;
  const state = getAppState();
  if (!state.AMap) {
    setStatus('地图还在加载，请稍后再添加地点。');
    return;
  }
  const targetDayId = options.dayId || state.activeDayId;
  if (targetDayId === 'all') return; // 普通添加必须落到具体 day；未排期入口会显式传 unscheduled

  const anchorLocation = resolveAddLocationAnchor(targetDayId, options.afterEventId);

  openSearchModal({
    nearbyAnchor: anchorLocation
      ? { name: anchorLocation.name, radius: NEARBY_DEFAULT_RADIUS, maxResults: NEARBY_MAX_RESULTS }
      : null,
    onSearch: (keyword) => searchPlaces(state.AMap, keyword),
    onNearbySearch: (userInput) => runNearbySearch({
      userInput,
      anchorLocation,
      AMap: state.AMap
    }),
    onConfirm: ({ place, event }) => {
      const locationId = addLocation({
        name: place.name,
        query: place.name,
        addr: place.addr || place.name,
        lnglat: place.lnglat,
        photo: place.photo || '',
        type: place.type || '',
        province: place.province || '',
        city: place.city || '',
        district: place.district || '',
        tag: place.tag || ''
      });
      const eventPayload = {
        title: event.title,
        icon: event.icon,
        timeSlot: event.timeSlot,
        note: event.note,
        locationId
      };
      if (targetDayId === 'unscheduled') {
        addUnscheduledEvent(eventPayload);
      } else {
        addEventToDay(targetDayId, eventPayload, { afterEventId: options.afterEventId });
      }
    }
  });
}

async function openGuideImportFlow(initial = {}) {
  if (getWorkspace().trips.length >= 3) {
    setStatus('最多保存 3 个行程，请先删除一个旧行程。');
    return;
  }
  let status;
  try {
    status = await getGuideImportStatus();
  } catch {
    setStatus('AI 攻略导入暂不可用，请稍后重试。');
    return;
  }
  if (!status.available) {
    setStatus('AI 攻略导入暂不可用，请检查 DEEPSEEK_API_KEY。');
    return;
  }

  openGuideImportModal({
    initialText: initial.text || '',
    initialCity: initial.cityHint || '',
    handlers: {
      onSubmit: async ({ text, cityHint, onProgress }) => {
        onProgress?.('extracting', '正在解析攻略文字...');
        setStatus('正在解析攻略...');
        const extracted = await extractGuideText({ text, cityHint });
        if (extracted.guide_type === 'non_travel') {
          throw new Error('未识别到旅行内容，请检查粘贴文本。');
        }
        if (!extracted.events?.length) {
          throw new Error('没有识别到可导入的地点，请换一段攻略试试。');
        }
        const draft = await buildGuideDraft(extracted, { text, cityHint }, onProgress);
        onProgress?.('done', '解析完成，正在打开预览...');
        openGuidePreviewModal({
          draft,
          handlers: {
            onBack: (currentDraft) => openGuideImportFlow({
              text: currentDraft.sourceText,
              cityHint: currentDraft.cityHint
            }),
            onSearchPlace: (keyword) => searchGuidePlaces(keyword, false, 8),
            onConfirm: importGuideDraft
          }
        });
        setStatus('攻略解析完成，请确认导入预览。');
        return true;
      }
    }
  });
}

// ─── 编辑 / 删除 / 移动流程 ─────────────────────────────

function openEditEventFlow(dayId, event) {
  if (!hasActiveTrip()) return;
  const state = getAppState();
  if (!state.AMap) {
    setStatus('地图还在加载，请稍后再编辑日程。');
    return;
  }

  const loc = getLocation(event.locationId);
  openEventEditorModal({
    event,
    location: loc,
    handlers: {
      currentContainerId: dayId,
      containerOptions: getEventContainerOptions(),
      onSearch: (keyword) => searchPlaces(state.AMap, keyword),
      nearbyAnchor: loc?.lnglat
        ? { name: loc.name, radius: NEARBY_DEFAULT_RADIUS, maxResults: NEARBY_MAX_RESULTS }
        : null,
      onNearbySearch: (userInput) => runNearbySearch({
        userInput,
        anchorLocation: loc,
        AMap: state.AMap
      }),
      onResolveAddress: (lnglat) => reverseGeocode(state.AMap, lnglat),
      onConfirm: ({ event: eventPatch, location, selectedPlace }) => {
        const targetDayId = eventPatch.targetDayId || dayId;
        delete eventPatch.targetDayId;
        let locationId = event.locationId;

        if (selectedPlace && countLocationReferences(event.locationId) > 1) {
          locationId = addLocation(location);
        } else {
          updateLocation(event.locationId, location);
        }

        const patch = {
          ...eventPatch,
          locationId
        };

        if (dayId === 'unscheduled') {
          updateUnscheduledEvent(event.id, patch);
        } else {
          updateEventInDay(dayId, event.id, patch);
        }

        if (targetDayId !== dayId) {
          moveEventBetweenContainers(event.id, {
            dayId: targetDayId,
            timeSlot: patch.timeSlot
          });
        }
      }
    }
  });
}

function deleteEventFlow(dayId, event) {
  const ok = window.confirm(`删除“${event.title || '这个日程'}”？`);
  if (!ok) return;

  const locationId = event.locationId;
  const removed = dayId === 'unscheduled'
    ? removeUnscheduledEvent(event.id)
    : removeEventFromDay(dayId, event.id);
  if (!removed) return;
  const state = getAppState();
  if (state.selectedEventRef?.dayId === dayId && state.selectedEventRef?.eventId === event.id) {
    state.selectedEventRef = null;
  }
  if (countLocationReferences(locationId) === 0) removeLocation(locationId);
}

function handleEventDrop(payload, target) {
  if (!payload?.eventId || !target?.dayId) return;
  if (payload.dayId === target.dayId && payload.eventId === target.afterEventId) return;
  const moved = moveEventBetweenContainers(payload.eventId, {
    dayId: target.dayId,
    timeSlot: target.timeSlot,
    afterEventId: target.afterEventId,
    index: target.index
  });
  if (!moved) setStatus('移动日程失败，请重试。');
}

function getEventContainerOptions() {
  const trip = getTrip();
  return [
    { id: 'unscheduled', label: '未排期' },
    ...trip.days.map((day, index) => ({
      id: day.id,
      label: `Day ${index + 1}${day.title?.trim() ? ` · ${day.title.trim()}` : ''}`
    }))
  ];
}

function openRouteEditorFlow(segment) {
  openRouteEditorModal({
    segment,
    handlers: {
      onConfirm: (routeToNext) => {
        if (!updateRouteToNext(segment.dayId, segment.eventId, routeToNext)) {
          setStatus('路线设置更新失败，请重试。');
        }
      }
    }
  });
}

function countLocationReferences(locationId) {
  const trip = getTrip();
  const dayCount = trip.days.reduce((count, day) => {
    return count + day.events.filter(event => event.locationId === locationId).length;
  }, 0);
  const unscheduledCount = (trip.unscheduled || [])
    .filter(event => event.locationId === locationId)
    .length;
  return dayCount + unscheduledCount;
}

// ─── trip 变更订阅 ──────────────────────────────────────

async function persistWorkspace() {
  await saveWorkspace(getWorkspace());
}

function handleWorkspaceChanged() {
  renderWorkspace();
  persistWorkspace();
}

function handleTripChanged(payload) {
  if (!payload) return;
  persistWorkspace();
  renderWorkspace();

  if (payload.kind === 'trip:updated') {
    renderHeader();
  }

  if (payload.kind === 'location:added' || payload.kind === 'location:updated') {
    const loc = getLocation(payload.locationId);
    createOrUpdateMarker(payload.locationId, loc.lnglat);
  }

  if (payload.kind === 'location:removed') {
    removeMarker(payload.locationId);
  }

  if (payload.kind === 'day:removed') {
    payload.removedLocationIds?.forEach(removeMarker);
  }

  pruneMapMarkersToTripEvents();
  // prune 之后兜底重建：处理 'location:added' → prune 把刚加的 marker 删掉的时序问题。
  // 等紧随其后的 'event:added' 触发本函数时，这里会重新创建丢失的 marker。
  ensureMarkersForReferencedLocations();

  // 编辑型变更统一重新渲染行程，再按当前视图刷新 marker 和路线。
  renderTabs({
    onSelectDay: (dayId) => selectDay(dayId, { fitView: true, planRoutes: true }),
    onAddDay: openCreateDayFlow
  });
  renderItinerary(getItineraryHandlers());
  const activeId = getNextActiveDayId(payload);
  selectDay(activeId, { fitView: true, planRoutes: activeId !== 'all' });
  syncEmptyWorkspaceUI();
}

function handleTripReplaced() {
  closeWorkspaceMenu();
  getAppState().selectedEventRef = null;
  persistWorkspace();
  renderWorkspace();
  renderHeader();
  renderTabs({
    onSelectDay: (dayId) => selectDay(dayId, { fitView: true, planRoutes: true }),
    onAddDay: openCreateDayFlow
  });
  renderItinerary(getItineraryHandlers());
  clearAllRoutes();
  clearAllMarkers();
  createAllMarkers();
  selectDay('all', { fitView: true, planRoutes: false });
  syncEmptyWorkspaceUI();
}

function getNextActiveDayId(payload) {
  if (payload.kind === 'day:added') return payload.dayId;

  const activeId = getAppState().activeDayId;
  if (activeId === 'all') return 'all';
  if (getDay(activeId)) return activeId;

  return getTrip().days[0]?.id || 'all';
}

// ─── selectDay：切换日期 ────────────────────────────────

function selectDay(dayId, { fitView = false, planRoutes = false } = {}) {
  setActiveDayId(dayId);
  updateActiveTab(dayId);
  updateVisibleDayGroups(dayId);
  clearAllRoutes();
  clearSegmentHighlight();

  if (!hasActiveTrip()) {
    resetRouteCards();
    showEmptyMapView();
    setStatus('还没有行程。点击添加第一个行程。');
    syncEmptyWorkspaceUI();
    return;
  }

  const visibleMarkers = showMarkersForDay(dayId);
  if (!hasTripEventLocations()) {
    resetRouteCards();
    showEmptyMapView();
    setStatus('还没有地点。添加地点后，地图会自动定位到行程范围。');
    return;
  }

  if (dayId === 'all') {
    resetRouteCards();
    setStatus('全部地点已显示。选择某一天后，会展示当天路线。');
  } else if (planRoutes) {
    const day = getDay(dayId);
    if (day) scheduleRoutePlanning(day);
  }

  if (fitView && visibleMarkers.length) fitMarkers(visibleMarkers);
}

// ─── 路径规划 ──────────────────────────────────────────

function scheduleRoutePlanning(day) {
  if (!hasActiveTrip()) return;
  const state = getAppState();
  if (state.routePlanningTimer) clearTimeout(state.routePlanningTimer);

  const serial = ++state.routePlanningSerial;
  const segments = buildRouteSegments(day);
  if (!segments.length) {
    resetRouteCards();
    setStatus(`${dayDisplayLabel(day)} 还没有路线。添加至少两个地点后会自动规划路线。`);
    return;
  }

  segments.forEach(setRouteCardLoading);
  setStatus(`${dayDisplayLabel(day)}：正在规划 ${segments.length} 段路线...`);

  state.routePlanningTimer = setTimeout(() => {
    planRoutesForDay(day, segments, serial);
  }, 240);
}

async function planRoutesForDay(day, segments, serial) {
  const state = getAppState();
  let success = 0, estimated = 0, failed = 0;

  for (const segment of segments) {
    if (serial !== state.routePlanningSerial) return; // 用户切走了，丢弃结果

    const result = await searchSegment(segment, serial);
    if (serial !== state.routePlanningSerial) return;

    if (result.ok) {
      success += 1;
      drawRoutePaths(segment, result.paths, false);
      updateRouteCardOk(segment, result.detail);
    } else if (result.estimated) {
      estimated += 1;
      drawRoutePaths(segment, result.paths, true);
      updateRouteCardEstimated(segment, result.detail);
    } else {
      failed += 1;
      updateRouteCardError(segment, '高德暂未返回该段路线，请在地图 App 中再次确认。');
    }
  }

  if (serial !== state.routePlanningSerial) return;
  setStatus(`${dayDisplayLabel(day)} 已完成：${success} 段真实路线，${estimated} 段估算路线，${failed} 段失败。`);
}

// V5：用 Day N · 标题 显示某一天，替代之前的 formatDateCN(day.date)
function dayDisplayLabel(day) {
  if (!day) return '';
  const idx = getTrip().days.findIndex(d => d.id === day.id);
  const dayN = idx >= 0 ? `Day ${idx + 1}` : '某天';
  const titleSuffix = day.title?.trim() ? ` · ${day.title}` : '';
  return `${dayN}${titleSuffix}`;
}

async function searchSegment(segment, serial) {
  if (!hasValidSegmentCoords(segment)) {
    return buildEstimatedResult(asRouteModeSegment(segment, 'driving'));
  }

  if (!segment.routeToNext?.manual) {
    return searchAutoSegment(segment, serial);
  }

  return searchModeSegment(segment, segment.mode, serial);
}

async function searchAutoSegment(segment, serial) {
  const walking = await searchModeSegment(segment, 'walking', serial);
  if (isStaleRouteResult(walking)) return walking;
  if (walking.ok && Number(walking.detail?.duration || 0) <= 30 * 60) {
    applySegmentMode(segment, 'walking');
    return walking;
  }

  const transit = await searchModeSegment(segment, 'transit', serial);
  if (isStaleRouteResult(transit)) return transit;

  const driving = await searchModeSegment(segment, 'driving', serial);
  if (isStaleRouteResult(driving)) return driving;

  if (shouldUseTransitOverDriving(transit, driving)) {
    applySegmentMode(segment, 'transit');
    return transit;
  }

  applySegmentMode(segment, 'driving');
  return driving.ok || driving.estimated ? driving : buildEstimatedResult(asRouteModeSegment(segment, 'driving'));
}

const AUTO_ROUTE_MAX_TRANSIT_BOARDINGS = 3;
const AUTO_ROUTE_DRIVING_TIME_ADVANTAGE_SECONDS = 15 * 60;
const AUTO_ROUTE_TRANSIT_SLOW_RATIO = 1.6;

function shouldUseTransitOverDriving(transit, driving) {
  if (!transit?.ok) return false;

  const boardings = Number(transit.detail?.transitBoardings || 0);
  if (boardings >= AUTO_ROUTE_MAX_TRANSIT_BOARDINGS) return false;

  if (!driving?.ok && !driving?.estimated) return true;

  const transitDuration = Number(transit.detail?.duration || 0);
  const drivingDuration = Number(driving.detail?.duration || 0);
  if (transitDuration > 0 && drivingDuration > 0) {
    if (transitDuration - drivingDuration >= AUTO_ROUTE_DRIVING_TIME_ADVANTAGE_SECONDS) return false;
    if (transitDuration >= drivingDuration * AUTO_ROUTE_TRANSIT_SLOW_RATIO) return false;
  }

  return true;
}

async function searchModeSegment(segment, mode, serial) {
  const state = getAppState();
  const targetSegment = asRouteModeSegment(segment, mode);
  const service = createRouteService(state.AMap, state.map, mode);
  if (!service) {
    return buildEstimatedResult(targetSegment);
  }

  state.routeServices.push(service);

  const result = await searchRoute(state.AMap, service, targetSegment);

  // 如果当前规划已经过期（用户切走了），就丢弃
  if (serial !== state.routePlanningSerial) {
    safeClearService(service);
    return { ok: false, stale: true };
  }
  return result;
}

function asRouteModeSegment(segment, mode) {
  return {
    ...segment,
    mode,
    routeToNext: { ...(segment.routeToNext || {}), mode }
  };
}

function applySegmentMode(segment, mode) {
  segment.mode = mode;
  segment.routeToNext = { ...(segment.routeToNext || {}), mode };
}

function isStaleRouteResult(result) {
  return result?.stale === true;
}

function hasValidSegmentCoords(segment) {
  return isValidLngLat(segment.fromLngLat) && isValidLngLat(segment.toLngLat);
}

function isValidLngLat(value) {
  return Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]));
}

function clearAllRoutes() {
  const state = getAppState();
  state.routePlanningSerial += 1;
  if (state.routePlanningTimer) {
    clearTimeout(state.routePlanningTimer);
    state.routePlanningTimer = null;
  }
  state.routeServices.forEach(safeClearService);
  state.routeServices = [];
  clearRouteOverlays();
}

// ─── 后台批量解析地点坐标 ───────────────────────────────

async function resolveAllLocations() {
  if (!hasActiveTrip()) {
    setStatus('还没有行程。点击添加第一个行程。');
    return;
  }
  const state = getAppState();
  const trip = getTrip();
  setStatus('正在通过高德解析地点坐标...');

  const services = createGeocodeServices(state.AMap);
  const entries = Object.entries(trip.locations);
  let success = 0;
  let skipped = 0;

  for (const [locationId, loc] of entries) {
    if (loc?.resolved === true || hasValidLngLat(loc?.lnglat)) {
      skipped += 1;
      continue;
    }
    const result = await resolveLocation(services, loc);
    if (result?.lnglat) {
      updateLocation(locationId, {
        lnglat: result.lnglat,
        addr: buildDisplayAddress(result) || loc.addr || loc.name,
        photo: result.photo || loc.photo || '',
        type: result.type || loc.type || '',
        province: result.province || loc.province || '',
        city: result.city || loc.city || '',
        district: result.district || loc.district || '',
        tag: result.tag || loc.tag || ''
      });
      createOrUpdateMarker(locationId, result.lnglat);
      success += 1;
    }
    await sleep(160); // 节流，避免对服务端施压
  }

  setStatus(`地点加载完成：${skipped} 个已保留，${success} 个由高德校准。选择某一天可查看路线。`);
}

function hasValidLngLat(lnglat) {
  return Array.isArray(lnglat)
    && lnglat.length >= 2
    && Number.isFinite(Number(lnglat[0]))
    && Number.isFinite(Number(lnglat[1]));
}

function syncEmptyWorkspaceUI() {
  const empty = !hasActiveTrip();
  document.body.classList.toggle('workspace-empty', empty);
  const shareBtn = document.getElementById('share-trip-btn');
  if (shareBtn) {
    shareBtn.disabled = empty;
    shareBtn.hidden = empty;
  }
  if (empty) showEmptyMapView();
}

function getReferencedLocationIds() {
  const trip = getTrip();
  const ids = new Set();
  trip.days.forEach(day => {
    day.events.forEach(event => {
      if (event.locationId && trip.locations[event.locationId]) ids.add(event.locationId);
    });
  });
  (trip.unscheduled || []).forEach(event => {
    if (event.locationId && trip.locations[event.locationId]) ids.add(event.locationId);
  });
  return Array.from(ids);
}

function hasTripEventLocations() {
  return getReferencedLocationIds().length > 0;
}

function pruneMapMarkersToTripEvents() {
  pruneMarkersToLocationIds(getReferencedLocationIds());
}

// 同步：保证所有被 event 引用且有 lnglat 的 location 都有 marker。
// 解决 'location:added' 后立即 prune 的时序问题——刚加的 location 还没被 event 引用，
// marker 会被误删；后续 'event:added' 触发时这里把丢失的 marker 重建回来。
function ensureMarkersForReferencedLocations() {
  const trip = getTrip();
  for (const id of getReferencedLocationIds()) {
    const loc = trip.locations[id];
    if (loc?.lnglat) createOrUpdateMarker(id, loc.lnglat);
  }
}
