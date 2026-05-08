// js/state.js
// 应用状态的"唯一真源"
//
// 设计原则：
//   - workspace 是最多 3 条 trip 的容器（可序列化，可保存）
//   - trip 是当前 active trip（可序列化，可保存）
//   - appState 是运行时状态（地图实例、Marker 集合、订阅 token 等，不可序列化）
//   - 模块外不直接 import 这两个对象，统一通过本文件暴露的 getter / mutator 访问
//   - mutator 在改完 trip 之后会触发 emit('change')，将来 UI 编辑功能可订阅
//
// 这样后面要加"撤销/重做"或"自动保存"，只要在 mutator 里加一行就行

import { initialTrip } from './data/trip.js';
import { AppConfig } from './config.js';
import { addDaysISO, isISODate, todayISO } from './utils.js';
import { getTimeSlotRank, normalizeTimeSlot } from './time-slots.js';
import { normalizeRouteToNext } from './route-config.js';

// ─── 内部状态（不直接导出） ─────────────────────────────

export const MAX_TRIPS = 3;

let workspace = createDefaultWorkspace();
let trip = getActiveTripFromWorkspace();

const appState = {
  AMap: null,
  map: null,
  infoWindow: null,
  activeDayId: 'all',
  routePlanningSerial: 0,
  routePlanningTimer: null,
  markers: new Map(),
  markerList: [],
  routeServices: [],
  // routeOverlays: 按 segmentId 索引，每段可能由多条 Polyline 拼成 + 1 条高亮时叠加的发光环。
  // { polylines: Polyline[], halo: Polyline[], color: string }
  routeOverlays: new Map(),
  activeRouteSegmentId: null,
  routeCards: new Map()
};

// ─── 订阅机制（极简版） ────────────────────────────────

const listeners = new Map(); // event -> Set<fn>

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

function emit(event, payload) {
  listeners.get(event)?.forEach(fn => {
    try { fn(payload); } catch (err) { console.warn('listener error:', err); }
  });
}

// ─── workspace 读 / 写 ────────────────────────────────

export function getWorkspace() {
  return workspace;
}

export function hasActiveTrip() {
  return Boolean(trip);
}

export function initWorkspace(savedWorkspace, sharedTrip = null) {
  if (sharedTrip) {
    const normalizedShared = normalizeTrip(sharedTrip, '分享行程');
    workspace = normalizeWorkspace(savedWorkspace, normalizedShared);
    const existingIndex = workspace.trips.findIndex(item => item.id === normalizedShared.id);
    if (existingIndex >= 0) {
      workspace.trips[existingIndex] = normalizedShared;
    } else if (workspace.trips.length < MAX_TRIPS) {
      workspace.trips.push(normalizedShared);
    } else {
      workspace.trips[MAX_TRIPS - 1] = normalizedShared;
    }
    workspace.activeTripId = normalizedShared.id;
  } else {
    workspace = normalizeWorkspace(savedWorkspace);
  }
  trip = getActiveTripFromWorkspace();
  emit('workspace:replaced', { workspace });
  emit('trip:replaced', { trip });
}

export function createTrip(title) {
  if (workspace.trips.length >= MAX_TRIPS) return null;
  const nextTrip = createBlankTrip(title);
  workspace.trips.push(nextTrip);
  workspace.activeTripId = nextTrip.id;
  trip = nextTrip;
  emit('workspace:changed', { kind: 'trip:created', tripId: nextTrip.id });
  emit('trip:replaced', { trip });
  return nextTrip.id;
}

export function switchTrip(tripId) {
  if (workspace.activeTripId === tripId) return true;
  const nextTrip = workspace.trips.find(item => item.id === tripId);
  if (!nextTrip) return false;
  workspace.activeTripId = tripId;
  trip = nextTrip;
  emit('workspace:changed', { kind: 'trip:switched', tripId });
  emit('trip:replaced', { trip });
  return true;
}

export function renameTrip(tripId, title) {
  const target = workspace.trips.find(item => item.id === tripId);
  if (!target || !String(title || '').trim()) return false;
  target.title = String(title).trim();
  if (target.id === workspace.activeTripId) trip = target;
  emit('workspace:changed', { kind: 'trip:renamed', tripId });
  emit('trip:changed', { kind: 'trip:updated' });
  return true;
}

export function deleteTrip(tripId) {
  const index = workspace.trips.findIndex(item => item.id === tripId);
  if (index < 0) return false;

  workspace.trips.splice(index, 1);
  if (workspace.activeTripId === tripId) {
    const nextIndex = Math.max(0, index - 1);
    workspace.activeTripId = workspace.trips[nextIndex]?.id || null;
    trip = getActiveTripFromWorkspace();
    emit('workspace:changed', { kind: 'trip:deleted', tripId });
    emit('trip:replaced', { trip });
  } else {
    trip = getActiveTripFromWorkspace();
    emit('workspace:changed', { kind: 'trip:deleted', tripId });
  }
  return true;
}

// ─── trip 读 ──────────────────────────────────────────

export function getTrip() {
  return trip || createEmptyReadTrip();
}

export function getDay(dayId) {
  return getTrip().days.find(day => day.id === dayId);
}

export function getLocation(locationId) {
  return getTrip().locations[locationId] || {
    name: '未知地点',
    addr: '',
    lnglat: AppConfig.defaultCenter
  };
}

export function getAllLocationIds() {
  return Object.keys(getTrip().locations);
}

// ─── trip 写（mutator） ────────────────────────────────
// 编辑型 mutator 都 emit 'trip:changed'，载荷里带 kind 让订阅方按需精细更新
// 'location:updated' 是底层坐标校准，比 trip:changed 粒度更细，保留独立事件

export function updateLocationCoords(locationId, lnglat) {
  if (!trip) return;
  const loc = trip.locations[locationId];
  if (!loc) return;
  loc.lnglat = lnglat;
  loc.resolved = true;
  emit('location:updated', { locationId });
}

export function addLocation(loc) {
  if (!trip) return null;
  const id = loc.id || generateLocationId();
  trip.locations[id] = {
    name: loc.name,
    query: loc.query || loc.name,
    addr: loc.addr || loc.name,
    lnglat: loc.lnglat,
    resolved: true,
    // photo / type 来自高德 extensions=all，持久化给"已有地点"编辑卡的右侧图位用
    photo: loc.photo || '',
    type: loc.type || ''
  };
  emit('trip:changed', { kind: 'location:added', locationId: id });
  return id;
}

export function updateLocation(locationId, patch) {
  if (!trip) return false;
  const loc = trip.locations[locationId];
  if (!loc) return false;

  if (patch.name != null) loc.name = patch.name;
  if (patch.query != null) loc.query = patch.query;
  if (patch.addr != null) loc.addr = patch.addr;
  if (patch.lnglat) {
    loc.lnglat = patch.lnglat;
    loc.resolved = true;
  }
  if (patch.photo != null) loc.photo = patch.photo;
  if (patch.type != null) loc.type = patch.type;

  emit('location:updated', { locationId });
  emit('trip:changed', { kind: 'location:updated', locationId });
  return true;
}

export function removeLocation(locationId) {
  if (!trip) return false;
  if (!trip.locations[locationId]) return false;
  delete trip.locations[locationId];
  emit('trip:changed', { kind: 'location:removed', locationId });
  return true;
}

export function updateTripMeta(patch) {
  if (!trip) return false;
  if (patch.title != null) trip.title = patch.title;
  if (patch.subtitle != null) trip.subtitle = patch.subtitle;
  if (patch.city != null) trip.city = patch.city;
  emit('trip:changed', { kind: 'trip:updated' });
  return true;
}

export function createEmptyTrip(title) {
  return createTrip(title);
}

export function addDay(day = {}) {
  if (!trip) return null;
  const id = day.id || generateDayId();
  const date = day.date || nextDayISO(trip);
  if (dateExists(date)) return null;

  trip.days.push({
    id,
    date,
    title: day.title || '新的一天',
    events: Array.isArray(day.events) ? structuredClone(day.events).map(normalizeEvent) : []
  });
  sortDayEventsByTimeSlot(trip.days[trip.days.length - 1]);
  sortDaysByDate();

  emit('trip:changed', { kind: 'day:added', dayId: id });
  return id;
}

export function nextDayISO(t = trip) {
  const dates = (t?.days || []).map(day => day.date).filter(isISODate).sort();
  const last = dates[dates.length - 1];
  return last ? addDaysISO(last, 1) : todayISO();
}

export function updateDay(dayId, patch) {
  if (!trip) return false;
  const day = trip.days.find(item => item.id === dayId);
  if (!day) return false;
  if (patch.date != null && patch.date !== day.date && dateExists(patch.date, dayId)) return false;

  if (patch.date != null) day.date = patch.date;
  if (patch.title != null) day.title = patch.title;
  sortDaysByDate();

  emit('trip:changed', { kind: 'day:updated', dayId });
  return true;
}

export function removeDay(dayId) {
  if (!trip) return null;

  const index = trip.days.findIndex(day => day.id === dayId);
  if (index < 0) return null;

  const [removedDay] = trip.days.splice(index, 1);
  const removedLocationIds = [];
  uniqueLocationIds(removedDay.events).forEach(locationId => {
    if (!isLocationReferenced(locationId)) {
      delete trip.locations[locationId];
      removedLocationIds.push(locationId);
    }
  });

  emit('trip:changed', {
    kind: 'day:removed',
    dayId,
    removedLocationIds
  });
  return removedDay;
}

export function addEventToDay(dayId, event, options = {}) {
  if (!trip) return null;
  const day = trip.days.find(d => d.id === dayId);
  if (!day) return null;

  const id = event.id || generateEventId(dayId);
  const timeSlot = normalizeTimeSlot(event.timeSlot);
  const note = event.note ? String(event.note).trim() : '';
  const newEvent = {
    id,
    title: String(event.title || trip.locations[event.locationId]?.name || '').trim(),
    ...(event.icon ? { icon: event.icon } : {}),
    ...(timeSlot ? { timeSlot } : {}),
    ...(note ? { note } : {}),
    locationId: event.locationId,
    ...(event.routeToNext ? { routeToNext: normalizeRouteToNext(event.routeToNext) } : {})
  };

  const insertIndex = getTimeSlotAppendIndex(day, timeSlot, options);
  day.events.splice(insertIndex, 0, newEvent);
  normalizeDayRoutes(day);

  emit('trip:changed', { kind: 'event:added', dayId, eventId: id });
  return id;
}

export function updateEventInDay(dayId, eventId, patch) {
  if (!trip) return false;
  const day = trip.days.find(d => d.id === dayId);
  if (!day) return false;
  const event = day.events.find(item => item.id === eventId);
  if (!event) return false;
  const previousSlot = normalizeTimeSlot(event.timeSlot);

  if (patch.title != null) event.title = patch.title;
  if (patch.icon != null) event.icon = patch.icon;
  if (patch.timeSlot != null) {
    const nextSlot = normalizeTimeSlot(patch.timeSlot);
    if (nextSlot) event.timeSlot = nextSlot;
    else delete event.timeSlot;
  }
  if (patch.note != null) {
    const note = String(patch.note).trim();
    if (note) event.note = note;
    else delete event.note;
  }
  if (patch.locationId != null) event.locationId = patch.locationId;
  if (patch.routeToNext) event.routeToNext = normalizeRouteToNext(patch.routeToNext);
  if (patch.timeSlot != null && normalizeTimeSlot(event.timeSlot) !== previousSlot) {
    moveEventToTimeSlotEnd(day, eventId);
  }
  normalizeDayRoutes(day);

  emit('trip:changed', { kind: 'event:updated', dayId, eventId });
  return true;
}

export function updateRouteToNext(dayId, eventId, routePatch) {
  if (!trip) return false;
  const day = trip.days.find(d => d.id === dayId);
  if (!day) return false;
  const index = day.events.findIndex(item => item.id === eventId);
  if (index < 0 || index >= day.events.length - 1) return false;

  day.events[index].routeToNext = normalizeRouteToNext(routePatch);
  normalizeDayRoutes(day);
  emit('trip:changed', { kind: 'route:updated', dayId, eventId });
  return true;
}

export function removeEventFromDay(dayId, eventId) {
  if (!trip) return false;
  const day = trip.days.find(d => d.id === dayId);
  if (!day) return false;
  const index = day.events.findIndex(item => item.id === eventId);
  if (index < 0) return false;

  day.events.splice(index, 1);
  normalizeDayRoutes(day);
  emit('trip:changed', { kind: 'event:removed', dayId, eventId });
  return true;
}

export function moveEventInDay(dayId, eventId, direction) {
  if (!trip) return false;
  const day = trip.days.find(d => d.id === dayId);
  if (!day) return false;

  const from = day.events.findIndex(item => item.id === eventId);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= day.events.length) return false;
  if (normalizeTimeSlot(day.events[from].timeSlot) !== normalizeTimeSlot(day.events[to].timeSlot)) {
    return false;
  }

  const [event] = day.events.splice(from, 1);
  day.events.splice(to, 0, event);
  normalizeDayRoutes(day);
  emit('trip:changed', { kind: 'event:moved', dayId, eventId });
  return true;
}

export function reorderEventInDay(dayId, eventId, targetEventId) {
  if (!trip) return false;
  if (eventId === targetEventId) return false;

  const day = trip.days.find(d => d.id === dayId);
  if (!day) return false;

  const from = day.events.findIndex(item => item.id === eventId);
  const target = day.events.findIndex(item => item.id === targetEventId);
  if (from < 0 || target < 0) return false;
  if (normalizeTimeSlot(day.events[from].timeSlot) !== normalizeTimeSlot(day.events[target].timeSlot)) {
    return false;
  }

  const [event] = day.events.splice(from, 1);
  day.events.splice(target, 0, event);
  normalizeDayRoutes(day);
  emit('trip:changed', { kind: 'event:reordered', dayId, eventId });
  return true;
}

export function replaceTrip(newTrip) {
  const normalized = normalizeTrip(newTrip);
  if (!workspace.trips.length) {
    workspace.trips.push(normalized);
    workspace.activeTripId = normalized.id;
  } else {
    const activeIndex = workspace.trips.findIndex(item => item.id === workspace.activeTripId);
    const replaceIndex = activeIndex >= 0 ? activeIndex : 0;
    workspace.trips[replaceIndex] = normalized;
    workspace.activeTripId = normalized.id;
  }
  trip = normalized;
  sortDaysByDate();
  emit('workspace:changed', { kind: 'trip:replaced', tripId: normalized.id });
  emit('trip:replaced', { trip });
}

function getInsertIndex(day, options) {
  if (Number.isInteger(options.index)) {
    return Math.max(0, Math.min(day.events.length, options.index));
  }
  if (options.afterEventId) {
    const index = day.events.findIndex(item => item.id === options.afterEventId);
    if (index >= 0) return index + 1;
  }
  return day.events.length;
}

function getTimeSlotAppendIndex(day, timeSlot, options = {}) {
  if (Number.isInteger(options.index)) {
    return Math.max(0, Math.min(day.events.length, options.index));
  }

  const rank = getTimeSlotRank(timeSlot);
  for (let index = 0; index < day.events.length; index += 1) {
    if (getTimeSlotRank(day.events[index].timeSlot) > rank) return index;
  }
  return day.events.length;
}

function moveEventToTimeSlotEnd(day, eventId) {
  const index = day.events.findIndex(item => item.id === eventId);
  if (index < 0) return;
  const [event] = day.events.splice(index, 1);
  day.events.splice(getTimeSlotAppendIndex(day, event.timeSlot), 0, event);
}

function normalizeEvent(event = {}) {
  const normalized = { ...event };
  const timeSlot = normalizeTimeSlot(normalized.timeSlot);
  if (timeSlot) normalized.timeSlot = timeSlot;
  else delete normalized.timeSlot;

  if (normalized.note != null) {
    const note = String(normalized.note).trim();
    if (note) normalized.note = note;
    else delete normalized.note;
  }
  return normalized;
}

function sortDayEventsByTimeSlot(day) {
  day.events = day.events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const rankDiff = getTimeSlotRank(a.event.timeSlot) - getTimeSlotRank(b.event.timeSlot);
      return rankDiff || a.index - b.index;
    })
    .map(item => item.event);
}

function normalizeDayRoutes(day) {
  day.events.forEach((event, index) => {
    if (index === day.events.length - 1) {
      delete event.routeToNext;
      return;
    }
    event.routeToNext = normalizeRouteToNext(event.routeToNext || { mode: 'driving' });
  });
}

function generateLocationId() {
  return `loc-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function generateEventId(dayId) {
  return `${dayId}-e-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function generateDayId() {
  return `day-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function uniqueLocationIds(events) {
  return Array.from(new Set(events.map(event => event.locationId).filter(Boolean)));
}

function isLocationReferenced(locationId) {
  if (!trip) return false;
  return trip.days.some(day => day.events.some(event => event.locationId === locationId));
}

function dateExists(date, exceptDayId = null) {
  if (!trip) return false;
  return isISODate(date) && trip.days.some(day => day.id !== exceptDayId && day.date === date);
}

function sortDaysByDate() {
  if (!trip) return;
  trip.days.sort((a, b) => {
    const aISO = isISODate(a.date);
    const bISO = isISODate(b.date);
    if (aISO && bISO) return a.date.localeCompare(b.date);
    if (aISO) return -1;
    if (bISO) return 1;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });
}

function createDefaultWorkspace() {
  const demoTrip = normalizeTrip(initialTrip);
  return {
    trips: [demoTrip],
    activeTripId: demoTrip.id
  };
}

function normalizeWorkspace(input, fallbackTrip = null) {
  const sourceTrips = Array.isArray(input?.trips) ? input.trips : [fallbackTrip || initialTrip];
  const trips = sourceTrips
    .filter(Boolean)
    .slice(0, MAX_TRIPS)
    .map((item, index) => normalizeTrip(item, `旅行路线 ${index + 1}`));

  const activeTripId = trips.some(item => item.id === input?.activeTripId)
    ? input.activeTripId
    : trips[0]?.id || null;

  return { trips, activeTripId };
}

function normalizeTrip(input, fallbackTitle = '旅行路线') {
  const cloned = structuredClone(input || {});
  cloned.id = cloned.id || generateTripId();
  cleanupDemoTripContent(cloned);
  cloned.title = String(cloned.title || fallbackTitle).trim() || fallbackTitle;
  cloned.subtitle = cloned.subtitle || '点击下方行程卡片，右侧地图将自动飞跃至对应地点';
  cloned.city = cloned.city || AppConfig.cityName;
  cloned.locations = cloned.locations && typeof cloned.locations === 'object' ? cloned.locations : {};
  cloned.days = Array.isArray(cloned.days) ? cloned.days : [];
  cloned.days.forEach(day => {
    day.id = day.id || generateDayId();
    day.date = day.date || todayISO();
    day.title = day.title || '新的一天';
    day.events = Array.isArray(day.events) ? day.events.map(normalizeEvent) : [];
    sortDayEventsByTimeSlot(day);
    normalizeDayRoutes(day);
  });
  cloned.days.sort((a, b) => {
    const aISO = isISODate(a.date);
    const bISO = isISODate(b.date);
    if (aISO && bISO) return a.date.localeCompare(b.date);
    if (aISO) return -1;
    if (bISO) return 1;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });
  return cloned;
}

function cleanupDemoTripContent(tripLike) {
  if (tripLike?.id !== 'demo-trip-bj-may' || !Array.isArray(tripLike.days)) return;

  const demoLocationIds = new Set(Object.keys(initialTrip.locations || {}));
  Object.entries(tripLike.locations || {}).forEach(([locationId, loc]) => {
    if (!demoLocationIds.has(locationId) || !loc) return;
    delete loc.lnglat;
    delete loc.resolved;
  });

  tripLike.days.forEach(day => {
    if (day.id === 'day-1' && day.title === '接站与安顿') day.title = '入住与晚餐';
    if (day.id === 'day-4' && day.title === '踏青与送站') day.title = '踏青休闲';
    if (!Array.isArray(day.events)) return;

    day.events = day.events.filter(event => {
      const title = String(event?.title || '');
      return !title.includes('男朋友');
    });
  });
}

function createBlankTrip(title) {
  return normalizeTrip({
    title,
    subtitle: '点击下方行程卡片，右侧地图将自动飞跃至对应地点',
    city: AppConfig.cityName,
    locations: {},
    days: []
  }, '新的旅行路线');
}

function createEmptyReadTrip() {
  return {
    id: '',
    title: '',
    subtitle: '点击左上角 + 号新建行程',
    city: AppConfig.cityName,
    locations: {},
    days: []
  };
}

function getActiveTripFromWorkspace() {
  return workspace.trips.find(item => item.id === workspace.activeTripId) || null;
}

function generateTripId() {
  return `trip-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

// ─── appState 读 ─────────────────────────────────────

export function getAppState() {
  return appState;
}

export function getActiveDayId() {
  return appState.activeDayId;
}

export function getMarker(locationId) {
  return appState.markers.get(locationId);
}

export function getRouteCard(routeId) {
  return appState.routeCards.get(routeId);
}

// ─── appState 写 ─────────────────────────────────────

export function setActiveDayId(dayId) {
  appState.activeDayId = dayId;
}

export function setAMap(AMap) {
  appState.AMap = AMap;
}

export function setMap(map) {
  appState.map = map;
}

export function setInfoWindow(infoWindow) {
  appState.infoWindow = infoWindow;
}
