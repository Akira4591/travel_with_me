// js/render/map.js
// 地图渲染：管 marker、polyline、视野缩放、infoWindow
//
// 这个模块是"地图的视图层"——只负责把 trip 数据投影到地图上
// 不负责"何时切换日期"那种业务逻辑（那是 main.js / sidebar.js 的事）

import { AppConfig } from '../config.js';
import {
  getAppState, getTrip, getLocation, getMarker,
  setMap, setInfoWindow, getActiveDayId
} from '../state.js';
import { escapeHTML, unique } from '../utils.js';

// ─── 初始化 ─────────────────────────────────────────────

export function initMap(AMap) {
  const map = new AMap.Map('map', {
    zoom: AppConfig.defaultZoom,
    center: AppConfig.defaultCenter,
    resizeEnable: true,
    viewMode: '2D'
  });
  map.addControl(new AMap.ToolBar({ position: 'RT' }));

  const infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -22) });

  setMap(map);
  setInfoWindow(infoWindow);

  return { map, infoWindow };
}

// ─── Marker ────────────────────────────────────────────

export function createAllMarkers() {
  const trip = getTrip();
  Object.keys(trip.locations).forEach(locationId => {
    const loc = getLocation(locationId);
    createOrUpdateMarker(locationId, loc.lnglat);
  });
}

export function createOrUpdateMarker(locationId, lnglat) {
  const state = getAppState();
  const existing = state.markers.get(locationId);
  if (existing) {
    existing.setPosition(lnglat);
    return existing;
  }

  const content = document.createElement('div');
  content.className = 'custom-marker';
  content.innerHTML = '<span></span>';

  const marker = new state.AMap.Marker({
    position: lnglat,
    content,
    offset: new state.AMap.Pixel(-14, -14)
  });
  marker.on('click', () => openInfoWindow(locationId));

  state.markers.set(locationId, marker);
  state.markerList.push(marker);
  state.map.add(marker);
  return marker;
}

export function removeMarker(locationId) {
  const state = getAppState();
  const marker = state.markers.get(locationId);
  if (!marker) return;

  try { state.map.remove(marker); } catch (err) { console.warn('移除 Marker 失败：', err); }
  state.markers.delete(locationId);
  state.markerList = state.markerList.filter(item => item !== marker);
}

export function clearAllMarkers() {
  const state = getAppState();
  state.markerList.forEach(marker => {
    try { state.map.remove(marker); } catch (err) { console.warn('移除 Marker 失败：', err); }
  });
  state.markers.clear();
  state.markerList = [];
}

// ─── 显示哪些 marker（按当前选中的日期） ──────────────────

export function showMarkersForDay(dayId) {
  const state = getAppState();
  state.markerList.forEach(m => m.hide());

  const visible = getVisibleMarkers(dayId);
  visible.forEach(m => m.show());
  return visible;
}

function getVisibleMarkers(dayId) {
  const state = getAppState();
  if (dayId === 'all') return state.markerList;

  const trip = getTrip();
  const day = trip.days.find(d => d.id === dayId);
  if (!day) return [];

  const ids = unique(day.events.map(e => e.locationId));
  return ids.map(id => state.markers.get(id)).filter(Boolean);
}

// ─── 视野 ──────────────────────────────────────────────

export function fitMarkers(markers) {
  const state = getAppState();
  if (!markers.length) return;
  if (markers.length === 1) {
    state.map.setZoomAndCenter(14, markers[0].getPosition());
  } else {
    state.map.setFitView(markers);
  }
}

export function fitSegment(segment) {
  const markers = [
    getMarker(segment.fromId),
    getMarker(segment.toId)
  ].filter(Boolean);
  fitMarkers(markers);
}

export function focusLocation(locationId) {
  const state = getAppState();
  const marker = state.markers.get(locationId);
  if (!marker) return;
  marker.show();
  state.map.setZoomAndCenter(15, marker.getPosition());
  setTimeout(() => openInfoWindow(locationId), 280);
}

// ─── InfoWindow ────────────────────────────────────────

export function openInfoWindow(locationId) {
  const state = getAppState();
  const loc = getLocation(locationId);
  const marker = state.markers.get(locationId);
  if (!loc || !marker) return;

  state.infoWindow.setContent(`
    <div class="info-window-content">
      <h3 class="info-window-title">${escapeHTML(loc.name)}</h3>
      <p class="info-window-addr">${escapeHTML(loc.addr || loc.query || loc.name)}</p>
    </div>
  `);
  state.infoWindow.open(state.map, marker.getPosition());
}

// ─── Polyline（画路线） ─────────────────────────────────

export function drawRoutePaths(paths, color, dashed = false) {
  paths.forEach(path => {
    if (path.length < 2) return;
    addPolyline(path, color, dashed);
  });
}

function addPolyline(path, color, dashed) {
  const state = getAppState();
  const polyline = new state.AMap.Polyline({
    path,
    isOutline: true,
    outlineColor: '#ffffff',
    borderWeight: 2,
    strokeColor: color || '#ef4444',
    strokeOpacity: 0.96,
    strokeWeight: 7,
    strokeStyle: dashed ? 'dashed' : 'solid',
    lineJoin: 'round',
    lineCap: 'round',
    zIndex: 200,
    showDir: !dashed
  });
  state.map.add(polyline);
  state.routeOverlays.push(polyline);
}

export function clearRouteOverlays() {
  const state = getAppState();
  state.routeOverlays.forEach(overlay => {
    try { state.map.remove(overlay); } catch (err) { console.warn('清除自绘路线失败：', err); }
  });
  state.routeOverlays = [];
}
