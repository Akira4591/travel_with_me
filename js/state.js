// js/state.js
// 应用状态的"唯一真源"
//
// 设计原则：
//   - trip 是行程数据（可序列化，可保存）
//   - appState 是运行时状态（地图实例、Marker 集合、订阅 token 等，不可序列化）
//   - 模块外不直接 import 这两个对象，统一通过本文件暴露的 getter / mutator 访问
//   - mutator 在改完 trip 之后会触发 emit('change')，将来 UI 编辑功能可订阅
//
// 这样后面要加"撤销/重做"或"自动保存"，只要在 mutator 里加一行就行

import { initialTrip } from './data/trip.js';
import { AppConfig } from './config.js';
import { addDaysISO, isISODate, todayISO } from './utils.js';

// ─── 内部状态（不直接导出） ─────────────────────────────

let trip = structuredClone(initialTrip);

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
  routeOverlays: [],
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

// ─── trip 读 ──────────────────────────────────────────

export function getTrip() {
  return trip;
}

export function getDay(dayId) {
  return trip.days.find(day => day.id === dayId);
}

export function getLocation(locationId) {
  return trip.locations[locationId] || {
    name: '未知地点',
    addr: '',
    lnglat: AppConfig.defaultCenter
  };
}

export function getAllLocationIds() {
  return Object.keys(trip.locations);
}

// ─── trip 写（mutator） ────────────────────────────────
// 编辑型 mutator 都 emit 'trip:changed'，载荷里带 kind 让订阅方按需精细更新
// 'location:updated' 是底层坐标校准，比 trip:changed 粒度更细，保留独立事件

export function updateLocationCoords(locationId, lnglat) {
  const loc = trip.locations[locationId];
  if (!loc) return;
  loc.lnglat = lnglat;
  loc.resolved = true;
  emit('location:updated', { locationId });
}

export function addLocation(loc) {
  const id = loc.id || generateLocationId();
  trip.locations[id] = {
    name: loc.name,
    query: loc.query || loc.name,
    addr: loc.addr || loc.name,
    lnglat: loc.lnglat,
    resolved: true
  };
  emit('trip:changed', { kind: 'location:added', locationId: id });
  return id;
}

export function updateLocation(locationId, patch) {
  const loc = trip.locations[locationId];
  if (!loc) return false;

  if (patch.name != null) loc.name = patch.name;
  if (patch.query != null) loc.query = patch.query;
  if (patch.addr != null) loc.addr = patch.addr;
  if (patch.lnglat) {
    loc.lnglat = patch.lnglat;
    loc.resolved = true;
  }

  emit('location:updated', { locationId });
  emit('trip:changed', { kind: 'location:updated', locationId });
  return true;
}

export function removeLocation(locationId) {
  if (!trip.locations[locationId]) return false;
  delete trip.locations[locationId];
  emit('trip:changed', { kind: 'location:removed', locationId });
  return true;
}

export function addDay(day = {}) {
  const id = day.id || generateDayId();
  const date = day.date || nextDayISO(trip);
  if (dateExists(date)) return null;

  trip.days.push({
    id,
    date,
    title: day.title || '新的一天',
    events: Array.isArray(day.events) ? structuredClone(day.events) : []
  });
  sortDaysByDate();

  emit('trip:changed', { kind: 'day:added', dayId: id });
  return id;
}

export function nextDayISO(t = trip) {
  const dates = t.days.map(day => day.date).filter(isISODate).sort();
  const last = dates[dates.length - 1];
  return last ? addDaysISO(last, 1) : todayISO();
}

export function updateDay(dayId, patch) {
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
  if (trip.days.length <= 1) return null;

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
  const day = trip.days.find(d => d.id === dayId);
  if (!day) return null;

  const id = event.id || generateEventId(dayId);
  const newEvent = {
    id,
    title: event.title || '',
    ...(event.icon ? { icon: event.icon } : {}),
    locationId: event.locationId,
    ...(event.routeToNext ? { routeToNext: event.routeToNext } : {})
  };

  const insertIndex = getInsertIndex(day, options);
  day.events.splice(insertIndex, 0, newEvent);
  normalizeDayRoutes(day);

  emit('trip:changed', { kind: 'event:added', dayId, eventId: id });
  return id;
}

export function updateEventInDay(dayId, eventId, patch) {
  const day = trip.days.find(d => d.id === dayId);
  if (!day) return false;
  const event = day.events.find(item => item.id === eventId);
  if (!event) return false;

  if (patch.title != null) event.title = patch.title;
  if (patch.icon != null) event.icon = patch.icon;
  if (patch.locationId != null) event.locationId = patch.locationId;
  if (patch.routeToNext) event.routeToNext = patch.routeToNext;
  normalizeDayRoutes(day);

  emit('trip:changed', { kind: 'event:updated', dayId, eventId });
  return true;
}

export function removeEventFromDay(dayId, eventId) {
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
  const day = trip.days.find(d => d.id === dayId);
  if (!day) return false;

  const from = day.events.findIndex(item => item.id === eventId);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= day.events.length) return false;

  const [event] = day.events.splice(from, 1);
  day.events.splice(to, 0, event);
  normalizeDayRoutes(day);
  emit('trip:changed', { kind: 'event:moved', dayId, eventId });
  return true;
}

export function reorderEventInDay(dayId, eventId, targetEventId) {
  if (eventId === targetEventId) return false;

  const day = trip.days.find(d => d.id === dayId);
  if (!day) return false;

  const from = day.events.findIndex(item => item.id === eventId);
  const target = day.events.findIndex(item => item.id === targetEventId);
  if (from < 0 || target < 0) return false;

  const [event] = day.events.splice(from, 1);
  day.events.splice(target, 0, event);
  normalizeDayRoutes(day);
  emit('trip:changed', { kind: 'event:reordered', dayId, eventId });
  return true;
}

export function replaceTrip(newTrip) {
  trip = structuredClone(newTrip);
  sortDaysByDate();
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

function normalizeDayRoutes(day) {
  day.events.forEach((event, index) => {
    if (index === day.events.length - 1) {
      delete event.routeToNext;
      return;
    }
    if (!event.routeToNext) event.routeToNext = { mode: 'driving' };
    if (!event.routeToNext.mode) event.routeToNext.mode = 'driving';
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
  return trip.days.some(day => day.events.some(event => event.locationId === locationId));
}

function dateExists(date, exceptDayId = null) {
  return isISODate(date) && trip.days.some(day => day.id !== exceptDayId && day.date === date);
}

function sortDaysByDate() {
  trip.days.sort((a, b) => {
    const aISO = isISODate(a.date);
    const bISO = isISODate(b.date);
    if (aISO && bISO) return a.date.localeCompare(b.date);
    if (aISO) return -1;
    if (bISO) return 1;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });
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
