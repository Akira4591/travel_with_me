// js/main.js
// 应用入口 + 业务编排
//
// 这个文件负责"做什么时候做什么"的业务流程，自己几乎不写渲染或 API 细节
// 主要做三件事：
//   1) boot：加载 SDK → 初始化地图 → 渲染界面 → 解析地点
//   2) selectDay：切换日期时，更新 UI + marker 显示 + 启动路线规划
//   3) planRoutes：编排"规划路线 → 画线 → 更新卡片"

import './error-boundary.js';
import { loadAMap } from './api/amap-loader.js?v=20260622-map-base-v2';
import { fetchElevationGrid } from './api/elevation.js';
import { createFallbackAMap } from './api/fallback-amap.js?v=20260622-map-base-v2';
import { fetchNearbyGeoAssets } from './api/geo-assets.js';
import {
  createGeocodeServices,
  resolveLocation,
  searchPlaces,
  searchNearBy,
  reverseGeocode,
  buildDisplayAddress
} from './api/geocode.js';
import { extractGuideText, getGuideImportStatus } from './api/guide-import.js';
import {
  getAppState,
  getTrip,
  getDay,
  getLocation,
  setActiveDayId,
  setAMap,
  updateLocation,
  updateTripGeoAssetStatus,
  updateTripGeoAssets,
  removeLocation,
  updateTripMeta,
  initWorkspace,
  getWorkspace,
  hasActiveTrip,
  createTrip,
  switchTrip,
  renameTrip,
  deleteTrip,
  addDay,
  updateDay,
  removeDay,
  addLocation,
  addEventToDay,
  updateEventInDay,
  removeEventFromDay,
  addUnscheduledEvent,
  updateUnscheduledEvent,
  removeUnscheduledEvent,
  moveEventInDay,
  reorderEventInDay,
  moveEventBetweenContainers,
  addAnnotation,
  updateRouteToNext,
  on
} from './state.js';
import {
  initMap,
  createAllMarkers,
  createOrUpdateMarker,
  renderAnnotationMarkers,
  removeMarker,
  clearAllMarkers,
  pruneMarkersToLocationIds,
  showEmptyMapView,
  showMarkersForDay,
  fitMarkers,
  fitSegment,
  focusLocation,
  clearRouteOverlays,
  highlightSegment,
  clearSegmentHighlight
} from './render/map.js';
import {
  renderHeader,
  renderTabs,
  renderItinerary,
  updateActiveTab,
  updateVisibleDayGroups,
  resetRouteCards,
  setStatus
} from './render/sidebar.js?v=20260509-v6';
import { openSearchModal } from './render/search-modal.js?v=20260509-v5';
import { openEventEditorModal } from './render/event-editor-modal.js?v=20260509-v6';
import { openGuideImportModal } from './render/guide-import-modal.js';
import { openGuidePreviewModal } from './render/guide-preview-modal.js';
import { openDayEditorModal } from './render/day-editor-modal.js';
import { openRouteEditorModal } from './render/route-editor-modal.js';
import { openTripModal } from './render/trip-modal.js';
import { bindShareButton } from './render/share-flow.js';
import { openAnnotationModal } from './render/annotation-modal.js';
import { renderWorkspaceTabs, closeWorkspaceMenu } from './render/workspace-tabs.js';
import { init3DToggle } from './render/toggle-3d.js';
import { scheduleRoutePlanning, clearAllRoutes } from './route-planner.js?v=20260622-map-base-v2';
import { readSharedTripFromURL } from './share.js';
import {
  getLastWorkspaceLoadInfo,
  importWorkspace,
  loadWorkspace,
  parseWorkspaceImport,
  saveWorkspace,
  stringifyWorkspaceExport
} from './storage.js';
import { sleep } from './utils.js';
import { inferIconId } from './render/icons.js';
import { createLogger } from './logger.js';
import { buildGuideDraft, searchGuidePlaces } from './guide-import-flow.js';

const log = createLogger('main');
const GEO_ASSET_ENTRY_BUDGET_MS = 350;

// ─── boot ──────────────────────────────────────────────

// 启动 banner——刷新后 console 第一行能确认你拿到的是 v8c 代码（不是缓存）
log.info('main.js v8h · provider fallback + runtime map config');

let mobileViewSwitchBound = false;
let dioramaInstance = null;
let threeDToggle = null;
let lastMapError = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
bindMobileViewSwitch();

async function boot() {
  const savedWorkspace = await loadWorkspace();
  const workspaceLoadInfo = getLastWorkspaceLoadInfo();
  const sharedTrip = readSharedTripFromURL();
  initWorkspace(savedWorkspace, sharedTrip);
  await persistWorkspace();

  renderWorkspace();
  renderHeader();
  setStatus('正在加载高德地图 JS API 2.0...');
  if (workspaceLoadInfo.status === 'migrated') {
    setStatus('已兼容旧版本地数据，并保存恢复快照。正在加载地图...');
  } else if (workspaceLoadInfo.status === 'parse-error' || workspaceLoadInfo.status === 'invalid') {
    setStatus('本地数据异常，已保存恢复快照并启动默认行程。');
  }
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
    lastMapError = null;
    setAMap(AMap);

    initMap(AMap);
    createAllMarkers();
    renderAnnotationMarkers();
    selectDay('all', { fitView: true, planRoutes: false });
    setup3DToggle();
    syncEmptyWorkspaceUI();

    // 后台异步校准坐标，完成后重新设置当前选中的日期
    await resolveAllLocations();
    if (hasActiveTrip()) selectDay(getAppState().activeDayId, { fitView: false, planRoutes: true });
  } catch (error) {
    log.error('高德地图加载失败', error);
    lastMapError = error?.message || 'AMAP_LOAD_FAILED';
    await bootFallbackMap();
    setStatus('高德底图暂不可用，已启用本地 2D 路线视图。路线与 3D 仍会继续加载。');
  }
}

async function bootFallbackMap() {
  const AMap = createFallbackAMap();
  setAMap(AMap);
  initMap(AMap);
  createAllMarkers();
  renderAnnotationMarkers();
  selectDay('all', { fitView: true, planRoutes: false });
  setup3DToggle();
  syncEmptyWorkspaceUI();
  await resolveAllLocations();
  if (hasActiveTrip()) selectDay(getAppState().activeDayId, { fitView: true, planRoutes: true });
}

function bindMobileViewSwitch() {
  if (mobileViewSwitchBound) return;
  mobileViewSwitchBound = true;
  document.body.dataset.mobileView ||= 'list';
  document.querySelectorAll('[data-mobile-view]').forEach(button => {
    button.addEventListener('click', () => setMobileView(button.dataset.mobileView));
  });
  syncMobileViewButtons();
}

function setMobileView(view) {
  const nextView = view === 'map' ? 'map' : 'list';
  document.body.dataset.mobileView = nextView;
  syncMobileViewButtons();
  if (nextView === 'map' && getAppState().map) {
    setTimeout(() => {
      getAppState().map?.resize?.();
      selectDay(getAppState().activeDayId, { fitView: true, planRoutes: false });
    }, 50);
  }
}

function syncMobileViewButtons() {
  const activeView = document.body.dataset.mobileView || 'list';
  document.querySelectorAll('[data-mobile-view]').forEach(button => {
    const active = button.dataset.mobileView === activeView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

function renderAll() {
  renderWorkspace();
  renderTabs({
    onSelectDay: dayId => selectDay(dayId, { fitView: true, planRoutes: true }),
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
    onRouteClick: segment => {
      if (threeDToggle?.is3DMode() && dioramaInstance) {
        import('./render/map-3d.js?v=20260623-vq0-work-area').then(({ focus3DRoute }) => {
          focus3DRoute(dioramaInstance, segment.id);
        });
        return;
      }
      fitSegment(segment);
      highlightSegment(segment.id);
    },
    onEditRoute: openRouteEditorFlow,
    onEditDay: openEditDayFlow,
    onEditEvent: openEditEventFlow,
    onAddLocation: dayId => openAddLocationFlow({ dayId }),
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
    onSelectTrip: tripId => {
      if (switchTrip(tripId)) {
        clearSegmentHighlight();
        setStatus('已切换行程。');
      }
    },
    onCreateTrip: openCreateTripFlow,
    onImportGuide: openGuideImportFlow,
    onRenameTrip: openRenameTripFlow,
    onDeleteTrip: deleteTripFlow,
    onExportWorkspace: exportWorkspaceFlow,
    onImportWorkspace: importWorkspaceFlow
  });
}

function setup3DToggle() {
  const map = getAppState().map;
  if (!map || threeDToggle) return;
  threeDToggle = init3DToggle({
    map,
    onEnter3D: enter3DView,
    onExit3D: exit3DView,
    getWorkAreaOptions: get3DWorkAreaOptions
  });
}

async function enter3DView(workArea = null) {
  if (!hasActiveTrip() || !hasTripEventLocations()) {
    throw new Error('3D view requires at least one resolved trip location.');
  }
  const container = document.getElementById('map-3d');
  if (!container) throw new Error('3D container is missing.');

  await hydrateGeoAssetsFor3D();

  const { initDiorama, enter3DMode } = await import('./render/map-3d.js?v=20260623-vq0-work-area');
  dioramaInstance = await initDiorama({ container });
  await enter3DMode(dioramaInstance, {
    trip: getTrip(),
    activeDayId: getAppState().activeDayId,
    onAnnotationRequest: open3DAnnotationFlow,
    loadElevationGrid: fetchElevationGrid,
    workArea
  });
}

function get3DWorkAreaOptions() {
  const trip = getTrip();
  const locations = get3DActiveLocations(trip, getAppState().activeDayId);
  const routeLength = computeLocationRouteLengthMeters(locations);
  const text = locations
    .map(location => `${location.name || ''} ${location.address || ''} ${location.note || ''}`)
    .join(' ');
  if (/徒步|登山|山地|mountain|hiking|trail/i.test(text) || routeLength > 5000) {
    return { spanMeters: 2000, hardCapMeters: 2000, profile: 'hiking' };
  }
  if (/景区|公园|湖|河|园区|park|scenic|lake|river/i.test(text)) {
    return { spanMeters: 1000, hardCapMeters: 2000, profile: 'scenic-park' };
  }
  if (/老街|巷|咖啡|小店|市集|街区|street|cafe|shop|market/i.test(text)) {
    return { spanMeters: 600, hardCapMeters: 2000, profile: 'micro-street' };
  }
  return { spanMeters: 800, hardCapMeters: 2000, profile: 'default' };
}

function computeLocationRouteLengthMeters(locations = []) {
  let total = 0;
  for (let index = 1; index < locations.length; index += 1) {
    const from = locations[index - 1]?.lnglat;
    const to = locations[index]?.lnglat;
    if (!Array.isArray(from) || !Array.isArray(to)) continue;
    const midLat = (((from[1] + to[1]) / 2) * Math.PI) / 180;
    const dx = (to[0] - from[0]) * 111320 * Math.cos(midLat);
    const dy = (to[1] - from[1]) * 111320;
    total += Math.hypot(dx, dy);
  }
  return total;
}

async function hydrateGeoAssetsFor3D() {
  const trip = getTrip();
  if (hasGeoAssetGeometry(trip.geoAssets)) return;
  const locations = get3DActiveLocations(trip, getAppState().activeDayId);
  if (!locations.length) return;
  setStatus('正在加载周边建筑、水体与桥梁...');
  const hydration = fetchNearbyGeoAssets(locations).then(result => {
    applyGeoAssetHydrationResult(result);
    return result;
  });
  const result = await Promise.race([
    hydration,
    sleep(GEO_ASSET_ENTRY_BUDGET_MS).then(() => ({
      status: 'degraded',
      reason: 'GEO_ASSETS_PENDING',
      sourceSummary: '周边地理要素仍在后台加载，先进入简化 3D 场景。',
      degraded: true
    }))
  ]);
  if (result?.reason === 'GEO_ASSETS_PENDING') {
    updateTripGeoAssetStatus(result);
    setStatus('周边地理要素仍在加载，3D 先使用简化场景。');
  }
}

function applyGeoAssetHydrationResult(result) {
  if (result?.data) {
    updateTripGeoAssets(result.data);
    updateTripGeoAssetStatus(result);
    return;
  }
  if (result) {
    updateTripGeoAssetStatus(result);
    setStatus('周边地理要素暂不可用，3D 将使用简化场景。');
  }
}

function get3DActiveLocations(trip, activeDayId) {
  const days = activeDayId === 'all' ? trip.days : trip.days.filter(day => day.id === activeDayId);
  const ids = new Set(days.flatMap(day => (day.events || []).map(event => event.locationId)));
  return [...ids]
    .map(id => trip.locations?.[id])
    .filter(location => hasValidLngLat(location?.lnglat));
}

function hasGeoAssetGeometry(geoAssets = {}) {
  return ['buildings', 'waterways', 'bridges', 'landcover'].some(key => geoAssets[key]?.length);
}

async function exit3DView() {
  if (!dioramaInstance) return;
  const { exit3DMode } = await import('./render/map-3d.js?v=20260623-vq0-work-area');
  await exit3DMode(dioramaInstance);
}

function open3DAnnotationFlow(draft) {
  openAnnotationModal({
    annotation: {
      type: 'note',
      title: '3D 标记',
      note: '',
      ...draft
    },
    handlers: {
      onSubmit: async annotation => {
        const id = addAnnotation(annotation);
        if (!id) {
          setStatus('标记保存失败，请重新选择位置。');
          return;
        }
        renderAnnotationMarkers();
        if (dioramaInstance) {
          const { refresh3DAnnotations } =
            await import('./render/map-3d.js?v=20260623-vq0-work-area');
          refresh3DAnnotations(dioramaInstance, { trip: getTrip() });
        }
        setStatus('3D 标记已保存。');
      }
    }
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
      onCreate: title => {
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
      onSave: title => {
        renameTrip(tripId, title);
        setStatus('旅行标题已更新。');
      }
    }
  });
}

function deleteTripFlow(tripId) {
  const target = getWorkspace().trips.find(item => item.id === tripId);
  if (!target) return;
  const ok = window.confirm(
    `删除“${target.title || '这个行程'}”？这个行程里的日期和地点都会一起删除。`
  );
  if (!ok) return;
  deleteTrip(tripId);
  setStatus(hasActiveTrip() ? '行程已删除。' : '还没有行程。点击添加第一个行程。');
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
    const eventTitle = String(event.title || event.placeName || '').trim() || event.placeName;
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
      title: eventTitle,
      icon: inferIconId({
        title: eventTitle,
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
    day: { title: '' }, // V5：title 默认空，提交后 sidebar 显示"新的一天"
    handlers: {
      onCreate: patch => {
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

// ─── 添加地点流程 ───────────────────────────────────────

// "搜附近"流水线（不再调 LLM）：直接用用户原话当 keyword，在锚点附近搜
// 默认半径 5km；最多返回 4 个 POI（按高德返回顺序，离锚点近优先）
const NEARBY_DEFAULT_RADIUS = 5000;
const NEARBY_MAX_RESULTS = 4;
async function runNearbySearch({ userInput, anchorLocation, AMap }) {
  if (!userInput) return [];
  const center =
    Array.isArray(anchorLocation?.lnglat) && anchorLocation.lnglat.length >= 2
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
  const day = isUnscheduled
    ? { id: 'unscheduled', events: getTrip().unscheduled || [] }
    : getDay(dayId);
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
    onSearch: keyword => searchPlaces(state.AMap, keyword),
    onNearbySearch: userInput =>
      runNearbySearch({
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
            onBack: currentDraft =>
              openGuideImportFlow({
                text: currentDraft.sourceText,
                cityHint: currentDraft.cityHint
              }),
            onSearchPlace: keyword => searchGuidePlaces(keyword, false, 8),
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
      onSearch: keyword => searchPlaces(state.AMap, keyword),
      nearbyAnchor: loc?.lnglat
        ? { name: loc.name, radius: NEARBY_DEFAULT_RADIUS, maxResults: NEARBY_MAX_RESULTS }
        : null,
      onNearbySearch: userInput =>
        runNearbySearch({
          userInput,
          anchorLocation: loc,
          AMap: state.AMap
        }),
      onResolveAddress: lnglat => reverseGeocode(state.AMap, lnglat),
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
  const removed =
    dayId === 'unscheduled'
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
      onConfirm: routeToNext => {
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
  const unscheduledCount = (trip.unscheduled || []).filter(
    event => event.locationId === locationId
  ).length;
  return dayCount + unscheduledCount;
}

function exportWorkspaceFlow() {
  const content = stringifyWorkspaceExport(getWorkspace());
  const date = new Date().toISOString().slice(0, 10);
  downloadTextFile(`travel-with-me-workspace-${date}.json`, content, 'application/json');
  setStatus('工作区 JSON 已导出。');
}

async function importWorkspaceFlow() {
  const file = await pickJSONFile();
  if (!file) return;

  let text;
  try {
    text = await readFileAsText(file);
  } catch {
    setStatus('读取导入文件失败。');
    return;
  }

  const parsed = parseWorkspaceImport(text);
  if (!parsed.ok) {
    setStatus(parsed.message || '导入文件格式不正确。');
    return;
  }

  const tripCount = parsed.workspace.trips.length;
  const confirmed = window.confirm(
    `将导入 ${tripCount} 条旅行路线，并替换当前本地工作区。当前数据会先保存恢复快照。是否继续？`
  );
  if (!confirmed) return;

  const result = await importWorkspace(parsed.workspace);
  if (!result.ok) {
    setStatus(result.message || '导入失败，请检查文件格式。');
    return;
  }

  initWorkspace(parsed.workspace);
  await persistWorkspace();
  clearAllMarkers();
  clearRouteOverlays();
  resetRouteCards();
  renderHeader();
  renderAll();
  if (getAppState().map) {
    createAllMarkers();
    selectDay('all', { fitView: true, planRoutes: false });
  }
  setStatus(result.recoveryKey ? '工作区已导入，原数据已保存恢复快照。' : '工作区已导入。');
}

function downloadTextFile(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function pickJSONFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener(
      'change',
      () => {
        resolve(input.files?.[0] || null);
        input.remove();
      },
      { once: true }
    );
    input.click();
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(file, 'utf-8');
  });
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
  if (payload.kind === 'route:geometry-cached') return;
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

  if (payload.kind?.startsWith('annotation:')) {
    renderAnnotationMarkers();
  }

  pruneMapMarkersToTripEvents();
  // prune 之后兜底重建：处理 'location:added' → prune 把刚加的 marker 删掉的时序问题。
  // 等紧随其后的 'event:added' 触发本函数时，这里会重新创建丢失的 marker。
  ensureMarkersForReferencedLocations();

  // 编辑型变更统一重新渲染行程，再按当前视图刷新 marker 和路线。
  renderTabs({
    onSelectDay: dayId => selectDay(dayId, { fitView: true, planRoutes: true }),
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
    onSelectDay: dayId => selectDay(dayId, { fitView: true, planRoutes: true }),
    onAddDay: openCreateDayFlow
  });
  renderItinerary(getItineraryHandlers());
  clearAllRoutes();
  clearAllMarkers();
  createAllMarkers();
  renderAnnotationMarkers();
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
  updateMapDebug();
}

function updateMapDebug() {
  if (typeof window === 'undefined') return;
  const state = getAppState();
  const providerKind = state.AMap?.__fallback ? 'fallback' : state.AMap ? 'amap' : 'none';
  window.__mapDebug__ = {
    providerKind,
    amapReady: providerKind === 'amap',
    fallbackReady: providerKind === 'fallback',
    canEnter3D: hasActiveTrip() && hasTripEventLocations(),
    routeOverlayCount: state.routeOverlays?.size || 0,
    routeSource: 'amap-webservice-bff',
    lastMapError
  };
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
        tag: result.tag || loc.tag || '',
        source: result.source || loc.source || 'amap-web-service'
      });
      createOrUpdateMarker(locationId, result.lnglat);
      success += 1;
    }
    await sleep(160); // 节流，避免对服务端施压
  }

  setStatus(`地点加载完成：${skipped} 个已保留，${success} 个由高德校准。选择某一天可查看路线。`);
}

function hasValidLngLat(lnglat) {
  return (
    Array.isArray(lnglat) &&
    lnglat.length >= 2 &&
    Number.isFinite(Number(lnglat[0])) &&
    Number.isFinite(Number(lnglat[1]))
  );
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
