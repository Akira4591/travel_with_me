// js/main.js
// 应用入口 + 业务编排
//
// 这个文件负责"做什么时候做什么"的业务流程，自己几乎不写渲染或 API 细节
// 主要做三件事：
//   1) boot：加载 SDK → 初始化地图 → 渲染界面 → 解析地点
//   2) selectDay：切换日期时，更新 UI + marker 显示 + 启动路线规划
//   3) planRoutes：编排"规划路线 → 画线 → 更新卡片"

import { loadAMap } from './api/amap-loader.js';
import { createGeocodeServices, resolveLocation, searchPlaces, reverseGeocode } from './api/geocode.js';
import {
  createRouteService, searchRoute, buildEstimatedResult, safeClearService
} from './api/routing.js';
import {
  getAppState, getTrip, getDay, getLocation, setActiveDayId, setAMap,
  updateLocationCoords, updateLocation, removeLocation,
  initWorkspace, getWorkspace, hasActiveTrip,
  createTrip, switchTrip, renameTrip, deleteTrip,
  addDay, updateDay, removeDay, nextDayISO,
  addLocation, addEventToDay, updateEventInDay, removeEventFromDay,
  moveEventInDay, reorderEventInDay, updateRouteToNext, on
} from './state.js';
import {
  initMap, createAllMarkers, createOrUpdateMarker, removeMarker, clearAllMarkers,
  pruneMarkersToLocationIds, showEmptyMapView,
  showMarkersForDay, fitMarkers, fitSegment, focusLocation,
  drawRoutePaths, clearRouteOverlays, highlightSegment
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
import { openRouteEditorModal } from './render/route-editor-modal.js';
import { openTripModal } from './render/trip-modal.js';
import { openShareModal, updateShareImage, setShareImageLoading } from './render/share-modal.js';
import { renderWorkspaceTabs, closeWorkspaceMenu } from './render/workspace-tabs.js';
import { readSharedTripFromURL } from './share.js';
import { buildTripShareImage, dataURLToBlob } from './share-image.js';
import { loadWorkspace, saveWorkspace } from './storage.js';
import { sleep, formatDateCN } from './utils.js';

// ─── boot ──────────────────────────────────────────────

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
    onEventClick: (event) => focusLocation(event.locationId),
    onRouteClick: (segment) => {
      fitSegment(segment);
      highlightSegment(segment.id);
    },
    onEditRoute: openRouteEditorFlow,
    onEditDay: openEditDayFlow,
    onEditEvent: openEditEventFlow,
    onAddLocation: (dayId) => openAddLocationFlow({ dayId }),
    onAddAfterEvent: (dayId, eventId) => openAddLocationFlow({ dayId, afterEventId: eventId }),
    onMoveEvent: moveEventInDay,
    onReorderEvent: reorderEventInDay,
    onDeleteEvent: deleteEventFlow,
    onCreateTrip: openCreateTripFlow
  };
}

function renderWorkspace() {
  renderWorkspaceTabs({
    onSelectTrip: (tripId) => {
      if (switchTrip(tripId)) setStatus('已切换行程。');
    },
    onCreateTrip: openCreateTripFlow,
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
        setStatus('已新建空白旅行路线。先新建一天，再添加地点。');
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
  setStatus(hasActiveTrip() ? '行程已删除。' : '还没有行程。点击左上角 + 号新建行程。');
}

function openCreateDayFlow() {
  openDayEditorModal({
    mode: 'create',
    day: {
      date: nextDayISO(),
      title: '新的一天'
    },
    disabledDates: getTrip().days.map(day => day.date),
    handlers: {
      onCreate: (patch) => {
        const dayId = addDay(patch);
        if (!dayId) {
          setStatus('这个日期已经有行程，请选择其他日期。');
          return false;
        }
        return true;
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
    canDelete: true,
    disabledDates: getTrip().days.filter(item => item.id !== dayId).map(item => item.date),
    handlers: {
      onSave: (_day, patch) => {
        const ok = updateDay(dayId, patch);
        if (!ok) setStatus('这个日期已经有行程，请选择其他日期。');
        return ok;
      },
      onDelete: () => deleteDayFlow(dayId)
    }
  });
}

function deleteDayFlow(dayId) {
  const day = getDay(dayId);
  if (!day) return;

  const ok = window.confirm(`删除“${formatDateCN(day.date)} · ${day.title}”？这一天里的日程也会一起删除。`);
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

function openAddLocationFlow(options = {}) {
  if (!hasActiveTrip()) return;
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
        timeSlot: event.timeSlot,
        note: event.note,
        locationId
      }, { afterEventId: options.afterEventId });
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
      onSearch: (keyword) => searchPlaces(state.AMap, keyword),
      onResolveAddress: (lnglat) => reverseGeocode(state.AMap, lnglat),
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
  return trip.days.reduce((count, day) => {
    return count + day.events.filter(event => event.locationId === locationId).length;
  }, 0);
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

  if (!hasActiveTrip()) {
    resetRouteCards();
    showEmptyMapView();
    setStatus('还没有行程。点击左上角 + 号新建行程。');
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
    setStatus(`${formatDateCN(day.date)} 还没有路线。添加至少两个地点后会自动规划路线。`);
    return;
  }

  segments.forEach(setRouteCardLoading);
  setStatus(`${formatDateCN(day.date)}：正在规划 ${segments.length} 段路线...`);

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
  setStatus(`${formatDateCN(day.date)} 已完成：${success} 段真实路线，${estimated} 段估算路线，${failed} 段失败。`);
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
  if (!hasActiveTrip()) {
    setStatus('还没有行程。点击左上角 + 号新建行程。');
    return;
  }
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

function syncEmptyWorkspaceUI() {
  const empty = !hasActiveTrip();
  document.body.classList.toggle('workspace-empty', empty);
  const shareBtn = document.getElementById('share-trip-btn');
  if (shareBtn) {
    shareBtn.disabled = empty;
    shareBtn.hidden = empty;
  }
  const mapHint = document.getElementById('map-empty-hint');
  if (mapHint) mapHint.hidden = !empty;
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
  return Array.from(ids);
}

function hasTripEventLocations() {
  return getReferencedLocationIds().length > 0;
}

function pruneMapMarkersToTripEvents() {
  pruneMarkersToLocationIds(getReferencedLocationIds());
}
