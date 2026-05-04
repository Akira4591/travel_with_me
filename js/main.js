// js/main.js
// 应用入口 + 业务编排
//
// 这个文件负责"做什么时候做什么"的业务流程，自己几乎不写渲染或 API 细节
// 主要做三件事：
//   1) boot：加载 SDK → 初始化地图 → 渲染界面 → 解析地点
//   2) selectDay：切换日期时，更新 UI + marker 显示 + 启动路线规划
//   3) planRoutes：编排"规划路线 → 画线 → 更新卡片"

import { loadAMap } from './api/amap-loader.js';
import { createGeocodeServices, resolveLocation, searchPlaces } from './api/geocode.js';
import {
  createRouteService, searchRoute, buildEstimatedResult, safeClearService
} from './api/routing.js';
import {
  getAppState, getTrip, getDay, getLocation, setActiveDayId, setAMap,
  updateLocationCoords, updateLocation, removeLocation,
  addDay, updateDay, removeDay,
  addLocation, addEventToDay, updateEventInDay, removeEventFromDay,
  moveEventInDay, reorderEventInDay, replaceTrip, on
} from './state.js';
import {
  initMap, createAllMarkers, createOrUpdateMarker, removeMarker,
  showMarkersForDay, fitMarkers, fitSegment, focusLocation,
  drawRoutePaths, clearRouteOverlays
} from './render/map.js';
import {
  renderHeader, renderTabs, renderItinerary,
  updateActiveTab, updateVisibleDayGroups,
  setRouteCardLoading, updateRouteCardOk, updateRouteCardEstimated,
  updateRouteCardError, resetRouteCards, setStatus,
  buildRouteSegments
} from './render/sidebar.js';
import { openSearchModal } from './render/search-modal.js?v=20260504-ui5';
import { openEventEditorModal } from './render/event-editor-modal.js?v=20260504-ui5';
import { openDayEditorModal } from './render/day-editor-modal.js';
import { openShareModal } from './render/share-modal.js';
import { buildShareURL, copyText, readSharedTripFromURL } from './share.js';
import { sleep } from './utils.js';

// ─── boot ──────────────────────────────────────────────

window.addEventListener('load', boot);

async function boot() {
  const sharedTrip = readSharedTripFromURL();
  if (sharedTrip) replaceTrip(sharedTrip);

  renderHeader();
  setStatus('正在加载高德地图 JS API 2.0...');
  bindShareButton();

  // 订阅 trip 变更：编辑模式下任何 mutator 都会触发，UI 自动重渲
  on('trip:changed', handleTripChanged);
  on('trip:replaced', handleTripReplaced);

  try {
    const AMap = await loadAMap();
    setAMap(AMap);

    initMap(AMap);
    renderAll();
    createAllMarkers();
    selectDay('all', { fitView: true, planRoutes: false });

    // 后台异步校准坐标，完成后重新设置当前选中的日期
    await resolveAllLocations();
    selectDay(getAppState().activeDayId, { fitView: false, planRoutes: true });
  } catch (error) {
    console.error('高德地图加载失败：', error);
    setStatus('<strong>地图加载失败。</strong>请检查 Key、安全密钥、域名白名单和网络状态。');
  }
}

function renderAll() {
  renderTabs({
    onSelectDay: (dayId) => selectDay(dayId, { fitView: true, planRoutes: true }),
    onAddDay: openCreateDayFlow
  });
  renderItinerary(getItineraryHandlers());
}

function getItineraryHandlers() {
  return {
    onEventClick: (event) => focusLocation(event.locationId),
    onRouteClick: (segment) => fitSegment(segment),
    onEditDay: openEditDayFlow,
    onEditEvent: openEditEventFlow,
    onAddLocation: (dayId) => openAddLocationFlow({ dayId }),
    onAddAfterEvent: (dayId, eventId) => openAddLocationFlow({ dayId, afterEventId: eventId }),
    onMoveEvent: moveEventInDay,
    onReorderEvent: reorderEventInDay,
    onDeleteEvent: deleteEventFlow
  };
}

function openCreateDayFlow() {
  const trip = getTrip();
  openDayEditorModal({
    mode: 'create',
    day: {
      date: `第 ${trip.days.length + 1} 天`,
      title: '新的一天'
    },
    handlers: {
      onCreate: (patch) => addDay(patch)
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
    setStatus('至少需要保留一天行程。');
    return;
  }

  const ok = window.confirm(`删除“${day.date} · ${day.title}”？这一天里的日程也会一起删除。`);
  if (!ok) return;

  removeDay(dayId);
}

function bindShareButton() {
  document.getElementById('share-trip-btn')?.addEventListener('click', () => {
    const url = buildShareURL(getTrip());
    openShareModal({
      url,
      handlers: {
        onCopy: async (text) => {
          const ok = await copyText(text);
          setStatus(ok ? '分享链接已复制。' : '复制失败，请手动复制弹窗里的链接。');
        }
      }
    });
  });
}

// ─── 添加地点流程 ───────────────────────────────────────

function openAddLocationFlow(options = {}) {
  const state = getAppState();
  if (!state.AMap) {
    setStatus('地图还在加载，请稍后再添加地点。');
    return;
  }
  const targetDayId = options.dayId || state.activeDayId;
  if (targetDayId === 'all') return; // 按钮在"全部"视图本就隐藏，这里再兜一层

  openSearchModal({
    onSearch: (keyword) => searchPlaces(state.AMap, keyword),
    onConfirm: ({ place, event }) => {
      const locationId = addLocation({
        name: place.name,
        query: place.name,
        addr: place.addr || place.name,
        lnglat: place.lnglat
      });
      addEventToDay(targetDayId, {
        title: event.title,
        icon: event.icon,
        locationId
      }, { afterEventId: options.afterEventId });
    }
  });
}

// ─── 编辑 / 删除 / 移动流程 ─────────────────────────────

function openEditEventFlow(dayId, event) {
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
      onSearch: (keyword) => searchPlaces(state.AMap, keyword),
      onConfirm: ({ event: eventPatch, location, selectedPlace }) => {
        let locationId = event.locationId;

        if (selectedPlace && countLocationReferences(event.locationId) > 1) {
          locationId = addLocation(location);
        } else {
          updateLocation(event.locationId, location);
        }

        updateEventInDay(dayId, event.id, {
          ...eventPatch,
          locationId
        });
      }
    }
  });
}

function deleteEventFlow(dayId, event) {
  const ok = window.confirm(`删除“${event.title || '这个日程'}”？`);
  if (!ok) return;

  const locationId = event.locationId;
  if (!removeEventFromDay(dayId, event.id)) return;
  if (countLocationReferences(locationId) === 0) removeLocation(locationId);
}

function countLocationReferences(locationId) {
  const trip = getTrip();
  return trip.days.reduce((count, day) => {
    return count + day.events.filter(event => event.locationId === locationId).length;
  }, 0);
}

// ─── trip 变更订阅 ──────────────────────────────────────

function handleTripChanged(payload) {
  if (!payload) return;

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

  // 编辑型变更统一重新渲染行程，再按当前视图刷新 marker 和路线。
  renderTabs({
    onSelectDay: (dayId) => selectDay(dayId, { fitView: true, planRoutes: true }),
    onAddDay: openCreateDayFlow
  });
  renderItinerary(getItineraryHandlers());
  const activeId = getNextActiveDayId(payload);
  selectDay(activeId, { fitView: true, planRoutes: activeId !== 'all' });
}

function handleTripReplaced() {
  renderHeader();
  renderTabs({
    onSelectDay: (dayId) => selectDay(dayId, { fitView: true, planRoutes: true }),
    onAddDay: openCreateDayFlow
  });
  renderItinerary(getItineraryHandlers());
  createAllMarkers();
  selectDay('all', { fitView: true, planRoutes: false });
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

  const visibleMarkers = showMarkersForDay(dayId);

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
  const state = getAppState();
  if (state.routePlanningTimer) clearTimeout(state.routePlanningTimer);

  const serial = ++state.routePlanningSerial;
  const segments = buildRouteSegments(day);
  if (!segments.length) {
    resetRouteCards();
    setStatus(`${day.date} 还没有路线。添加至少两个地点后会自动规划路线。`);
    return;
  }

  segments.forEach(setRouteCardLoading);
  setStatus(`${day.date}：正在规划 ${segments.length} 段路线...`);

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
      drawRoutePaths(result.paths, segment.color, false);
      updateRouteCardOk(segment, result.detail);
    } else if (result.estimated) {
      estimated += 1;
      drawRoutePaths(result.paths, segment.color, true);
      updateRouteCardEstimated(segment, result.detail);
    } else {
      failed += 1;
      updateRouteCardError(segment, '高德暂未返回该段路线，请在地图 App 中再次确认。');
    }
  }

  if (serial !== state.routePlanningSerial) return;
  setStatus(`${day.date} 已完成：${success} 段真实路线，${estimated} 段估算路线，${failed} 段失败。`);
}

async function searchSegment(segment, serial) {
  const state = getAppState();
  const service = createRouteService(state.AMap, state.map, segment.mode);
  if (!service) return buildEstimatedResult(segment);

  state.routeServices.push(service);

  const result = await searchRoute(state.AMap, service, segment);

  // 如果当前规划已经过期（用户切走了），就丢弃
  if (serial !== state.routePlanningSerial) {
    safeClearService(service);
    return { ok: false, stale: true };
  }
  return result;
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
  const state = getAppState();
  const trip = getTrip();
  setStatus('已先使用内置坐标显示地点；正在后台校准地点位置...');

  const services = createGeocodeServices(state.AMap);
  const entries = Object.entries(trip.locations);
  let success = 0;

  for (const [locationId, loc] of entries) {
    const result = await resolveLocation(services, loc);
    if (result?.lnglat) {
      updateLocationCoords(locationId, result.lnglat);
      createOrUpdateMarker(locationId, result.lnglat);
      success += 1;
    }
    await sleep(160); // 节流，避免对服务端施压
  }

  setStatus(`地点加载完成：${success}/${entries.length} 个地点已由高德校准。选择某一天可查看路线。`);
}
