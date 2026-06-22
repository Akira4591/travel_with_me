// js/render/toggle-3d.js
// 3D map switch: precision state, button state, and explicit 2D/3D transition.

import { setStatus } from './sidebar.js';
import { createLogger } from '../logger.js';

const log = createLogger('toggle-3d');

const ZOOM_HINT = 12.5;
const ZOOM_ACTIVE = 13.5;

/**
 * @param {object} options
 * @param {object} options.map AMap instance
 * @param {Function} options.onEnter3D Enter 3D callback
 * @param {Function} options.onExit3D Exit 3D callback
 * @returns {{ is3DMode: () => boolean }}
 */
export function init3DToggle({ map, onEnter3D, onExit3D }) {
  const btn = document.getElementById('map-3d-toggle');
  if (!btn) {
    log.warn('3D toggle button was not found');
    return { is3DMode: () => false };
  }

  let is3D = false;
  let transitioning = false;
  btn.dataset.state = 'enabled-2d';

  function updateButtonState(zoom) {
    if (is3D) return;
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

  map.on('zoomchange', () => {
    if (!transitioning) updateButtonState(map.getZoom());
  });

  updateButtonState(map.getZoom());

  map.on('zoomend', () => {
    if (!transitioning) updateButtonState(map.getZoom());
  });

  btn.addEventListener('click', async () => {
    if (transitioning) return;
    const was3D = is3D;
    transitioning = true;
    btn.disabled = true;
    btn.dataset.state = 'loading-3d';

    try {
      if (is3D) {
        await exit3DFlow();
      } else {
        await enter3DFlow();
      }
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

  async function enter3DFlow() {
    setStatus('正在构建 3D 视图...');
    btn.classList.remove('hint', 'active');
    btn.classList.add('in-3d');
    btn.dataset.state = 'enabled-3d';
    btn.title = '切回 2D 视图';
    btn.querySelector('.map-3d-toggle-label').textContent = '2D';
    btn.querySelector('.map-3d-toggle-dot').style.background = '#f2b705';
    is3D = true;

    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.style.opacity = '0.12';

    await onEnter3D?.();

    const statusPanel = document.getElementById('status-panel');
    if (statusPanel) statusPanel.style.display = 'none';

    setStatus('3D 视图已就绪，可拖拽旋转、缩放，点击 2D 切回。');
  }

  async function exit3DFlow() {
    setStatus('正在切回 2D 视图...');

    await onExit3D?.();

    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.style.opacity = '1';

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

    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.style.opacity = '1';

    const statusPanel = document.getElementById('status-panel');
    if (statusPanel) statusPanel.style.display = '';

    btn.classList.remove('in-3d');
    btn.dataset.state = 'enabled-2d';
    btn.querySelector('.map-3d-toggle-label').textContent = '3D 视图';
    btn.querySelector('.map-3d-toggle-dot').style.background = '#e6ad00';
    is3D = false;
    updateButtonState(map.getZoom());
  }

  return {
    is3DMode: () => is3D
  };
}
