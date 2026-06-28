// js/render/toggle-3d.js
// 3D map switch: 2D center selection, precision state, and explicit 2D/3D transition.

import { setStatus } from './sidebar.js';
import { createLogger } from '../logger.js';

const log = createLogger('toggle-3d');

const ZOOM_HINT = 12.5;
const ZOOM_ACTIVE = 13.5;
const DEFAULT_WORK_AREA_SPAN_METERS = 800;
const WORK_AREA_HARD_CAP_METERS = 2000;

/**
 * @param {object} options
 * @param {object} options.map AMap-compatible instance
 * @param {Function} options.onEnter3D Enter 3D callback
 * @param {Function} options.onExit3D Exit 3D callback
 * @param {Function} [options.getWorkAreaOptions] Work-area profile callback
 * @returns {{ is3DMode: () => boolean, isSelecting3DCenter: () => boolean }}
 */
export function init3DToggle({ map, onEnter3D, onExit3D, getWorkAreaOptions = null }) {
  const btn = document.getElementById('map-3d-toggle');
  if (!btn) {
    log.warn('3D toggle button was not found');
    return { is3DMode: () => false, isSelecting3DCenter: () => false };
  }

  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.__mapInstance = map;

  let is3D = false;
  let isSelecting = false;
  let transitioning = false;
  let selectionCleanup = null;
  btn.dataset.state = 'enabled-2d';

  function updateButtonState(zoom) {
    if (is3D || isSelecting) return;
    btn.hidden = false;
    btn.disabled = false;
    btn.classList.toggle('low-precision', zoom < ZOOM_HINT);

    if (zoom < ZOOM_HINT) {
      btn.classList.remove('hint', 'active');
      btn.title = '当前范围较大，将以低精度 3D 概览打开';
    } else if (zoom < ZOOM_ACTIVE) {
      btn.classList.add('hint');
      btn.classList.remove('active');
      btn.title = '打开 3D 概览';
    } else {
      btn.classList.remove('hint');
      btn.classList.add('active');
      btn.title = '打开 3D 视图';
    }
  }

  map.on?.('zoomchange', () => {
    if (!transitioning) updateButtonState(map.getZoom());
  });
  map.on?.('zoomend', () => {
    if (!transitioning) updateButtonState(map.getZoom());
  });

  updateButtonState(map.getZoom());

  btn.addEventListener('click', async event => {
    event.stopPropagation();
    if (transitioning) return;
    if (!is3D) {
      if (isSelecting) cancelSelection();
      else startSelection();
      return;
    }

    const was3D = is3D;
    transitioning = true;
    btn.disabled = true;
    btn.dataset.state = 'loading-3d';

    try {
      await exit3DFlow();
    } catch (err) {
      log.error('3D toggle failed', err);
      recoverFailedTransition(was3D);
      setStatus('3D 视图切换失败，请稍后重试。');
    } finally {
      transitioning = false;
      btn.disabled = false;
      btn.dataset.state = is3D ? 'enabled-3d' : 'enabled-2d';
    }
  });

  function startSelection() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) {
      void enter3DFlow(null);
      return;
    }

    isSelecting = true;
    btn.dataset.state = 'selecting-3d-center';
    btn.classList.remove('hint', 'active');
    btn.classList.add('selecting');
    btn.title = '在 2D 地图上选择 3D 工作区中心，按 Esc 取消';
    btn.querySelector('.map-3d-toggle-label').textContent = '选择位置';
    btn.querySelector('.map-3d-toggle-dot').style.background = '#e84b3c';
    setStatus('请在 2D 地图上选择 3D 工作区中心。');

    const pin = document.createElement('div');
    pin.className = 'map-3d-selection-pin';
    pin.setAttribute('aria-hidden', 'true');
    const preview = document.createElement('div');
    preview.className = 'map-3d-selection-preview';
    preview.setAttribute('aria-hidden', 'true');
    mapContainer.append(pin, preview);
    mapContainer.classList.add('selecting-3d-center');

    const updatePointer = event => {
      if (event.target?.closest?.('#map-3d-toggle')) return;
      const rect = mapContainer.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      pin.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      preview.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    };
    const commitFromDomClick = event => {
      if (!isSelecting || event.target?.closest?.('#map-3d-toggle')) return;
      if (event.target?.closest?.('.amap-marker, .custom-marker')) return;
      const lnglat = lngLatFromPointerEvent(event, mapContainer, map);
      if (lnglat) commitSelection(lnglat);
    };
    const commitFromMapClick = event => {
      if (!isSelecting) return;
      const lnglat = toLngLatArray(event?.lnglat) || toLngLatArray(event?.lngLat);
      if (lnglat) commitSelection(lnglat);
    };
    const commitFromMarkerSelect = event => {
      if (!isSelecting) return;
      const lnglat = toLngLatArray(event?.detail?.lnglat);
      if (lnglat) commitSelection(lnglat);
    };
    const cancelOnEscape = event => {
      if (event.key === 'Escape') cancelSelection();
    };
    const cancelOnContext = event => {
      event.preventDefault();
      cancelSelection();
    };

    mapContainer.addEventListener('pointermove', updatePointer);
    mapContainer.addEventListener('click', commitFromDomClick, true);
    mapContainer.addEventListener('travel:marker-3d-select', commitFromMarkerSelect);
    mapContainer.addEventListener('contextmenu', cancelOnContext);
    document.addEventListener('keydown', cancelOnEscape);
    map.on?.('click', commitFromMapClick);

    selectionCleanup = () => {
      mapContainer.removeEventListener('pointermove', updatePointer);
      mapContainer.removeEventListener('click', commitFromDomClick, true);
      mapContainer.removeEventListener('travel:marker-3d-select', commitFromMarkerSelect);
      mapContainer.removeEventListener('contextmenu', cancelOnContext);
      document.removeEventListener('keydown', cancelOnEscape);
      map.off?.('click', commitFromMapClick);
      pin.remove();
      preview.remove();
      mapContainer.classList.remove('selecting-3d-center');
      selectionCleanup = null;
    };
  }

  async function commitSelection(center) {
    if (!isSelecting || transitioning) return;
    const workAreaOptions = normalizeWorkAreaOptions(getWorkAreaOptions?.());
    const workArea = {
      ...workAreaOptions,
      source: 'selected-2d-point',
      center
    };
    cancelSelection({ silent: true });
    transitioning = true;
    btn.disabled = true;
    btn.dataset.state = 'loading-3d';

    try {
      await enter3DFlow(workArea);
    } catch (err) {
      log.error('3D toggle failed', err);
      recoverFailedTransition(false);
      setStatus('3D 视图切换失败，请稍后重试。');
    } finally {
      transitioning = false;
      btn.disabled = false;
      btn.dataset.state = is3D ? 'enabled-3d' : 'enabled-2d';
    }
  }

  function cancelSelection({ silent = false } = {}) {
    if (!isSelecting) return;
    isSelecting = false;
    selectionCleanup?.();
    btn.classList.remove('selecting');
    btn.dataset.state = 'enabled-2d';
    btn.title = '打开 3D 视图';
    btn.querySelector('.map-3d-toggle-label').textContent = '3D 视图';
    btn.querySelector('.map-3d-toggle-dot').style.background = '#e6ad00';
    updateButtonState(map.getZoom());
    if (!silent) setStatus('已取消 3D 工作区选择。');
  }

  async function enter3DFlow(workArea) {
    setStatus('正在构建 3D 视图...');
    btn.classList.remove('hint', 'active', 'selecting');
    btn.classList.add('in-3d');
    btn.dataset.state = 'enabled-3d';
    btn.title = '切回 2D 视图';
    btn.querySelector('.map-3d-toggle-label').textContent = '2D';
    btn.querySelector('.map-3d-toggle-dot').style.background = '#f2b705';
    is3D = true;

    const mapContainer = document.getElementById('map');
    if (mapContainer) mapContainer.style.opacity = '0.12';

    await onEnter3D?.(workArea);

    const statusPanel = document.getElementById('status-panel');
    if (statusPanel) statusPanel.style.display = 'none';

    setStatus('3D 视图已就绪，可拖拽旋转、WASD 移动，点击 2D 切回。');
  }

  async function exit3DFlow() {
    setStatus('正在切回 2D 视图...');

    await onExit3D?.();

    const mapContainer = document.getElementById('map');
    if (mapContainer) mapContainer.style.opacity = '1';

    btn.classList.remove('in-3d');
    btn.dataset.state = 'enabled-2d';
    btn.querySelector('.map-3d-toggle-label').textContent = '3D 视图';
    btn.querySelector('.map-3d-toggle-dot').style.background = '#e6ad00';
    is3D = false;

    const statusPanel = document.getElementById('status-panel');
    if (statusPanel) statusPanel.style.display = '';

    updateButtonState(map.getZoom());
    setStatus('已切回 2D 视图。');
  }

  function recoverFailedTransition(was3D) {
    if (was3D) return;
    cancelSelection({ silent: true });

    const mapContainer = document.getElementById('map');
    if (mapContainer) mapContainer.style.opacity = '1';

    const statusPanel = document.getElementById('status-panel');
    if (statusPanel) statusPanel.style.display = '';

    btn.classList.remove('in-3d', 'selecting');
    btn.dataset.state = 'enabled-2d';
    btn.querySelector('.map-3d-toggle-label').textContent = '3D 视图';
    btn.querySelector('.map-3d-toggle-dot').style.background = '#e6ad00';
    is3D = false;
    updateButtonState(map.getZoom());
  }

  return {
    is3DMode: () => is3D,
    isSelecting3DCenter: () => isSelecting
  };
}

function normalizeWorkAreaOptions(options = {}) {
  const hardCapMeters = Number(options?.hardCapMeters) || WORK_AREA_HARD_CAP_METERS;
  const spanMeters = Number(options?.spanMeters);
  return {
    spanMeters: Math.min(
      hardCapMeters,
      Math.max(300, Number.isFinite(spanMeters) ? spanMeters : DEFAULT_WORK_AREA_SPAN_METERS)
    ),
    hardCapMeters,
    profile: options?.profile || 'default'
  };
}

function lngLatFromPointerEvent(event, mapEl, map) {
  const marker = event.target?.closest?.('[data-lng][data-lat]');
  const markerLngLat = toLngLatArray(marker ? [marker.dataset.lng, marker.dataset.lat] : null);
  if (markerLngLat) return markerLngLat;

  const rect = mapEl.getBoundingClientRect();
  const pixel = [event.clientX - rect.left, event.clientY - rect.top];
  const amapPixel =
    typeof window !== 'undefined' && window.AMap?.Pixel
      ? new window.AMap.Pixel(pixel[0], pixel[1])
      : pixel;
  return (
    toLngLatArray(map?.containerToLngLat?.(amapPixel)) ||
    toLngLatArray(map?.unproject?.(pixel)) ||
    toLngLatArray(mapEl.__mapInstance?.containerToLngLat?.(amapPixel)) ||
    toLngLatArray(mapEl.__mapInstance?.unproject?.(pixel)) ||
    toLngLatArray(map?.getCenter?.())
  );
}

function toLngLatArray(value) {
  if (!value) return null;
  if (
    Array.isArray(value) &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  ) {
    return [Number(value[0]), Number(value[1])];
  }
  const lng =
    typeof value.getLng === 'function'
      ? value.getLng()
      : Number.isFinite(Number(value.lng))
        ? value.lng
        : value.x;
  const lat =
    typeof value.getLat === 'function'
      ? value.getLat()
      : Number.isFinite(Number(value.lat))
        ? value.lat
        : value.y;
  if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return null;
  return [Number(lng), Number(lat)];
}
