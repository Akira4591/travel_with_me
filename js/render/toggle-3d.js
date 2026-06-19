// js/render/toggle-3d.js
// 3D 地图切换模块：精度尺监听 + 按钮状态机 + 2D↔3D 过渡
//
// 精度尺阈值（ADR-6 §二）:
//   zoom ≥ 14 → 按钮可见 (hint)
//   zoom ≥ 15 → 按钮突出 (active)
//   点击触发 → 进入 3D (in-3d)
//
// 使用方式:
//   import { init3DToggle } from './render/toggle-3d.js';
//   const toggle = init3DToggle({ map, onEnter3D, onExit3D });

import { setStatus } from './sidebar.js';
import { createLogger } from '../logger.js';

const log = createLogger('toggle-3d');

const ZOOM_HINT = 14; // 按钮可见
const ZOOM_ACTIVE = 15; // 按钮突出

/**
 * @param {object} options
 * @param {object} options.map — AMap 实例
 * @param {Function} options.onEnter3D — 进入 3D 模式回调
 * @param {Function} options.onExit3D — 退出 3D 模式回调
 * @returns {{ is3DMode: () => boolean }}
 */
export function init3DToggle({ map, onEnter3D, onExit3D }) {
  const btn = document.getElementById('map-3d-toggle');
  if (!btn) {
    log.warn('3D 切换按钮元素未找到');
    return { is3DMode: () => false };
  }

  let is3D = false;
  let transitioning = false;

  // ─── 60s 闲置自动回 2D (ADR-6 性能策略) ──────────────

  const IDLE_RETURN_DELAY = 60000; // 60s 无操作自动切回 2D
  let idleReturnTimer = null;

  function resetIdleReturnTimer() {
    if (idleReturnTimer) clearTimeout(idleReturnTimer);
    if (!is3D) return;
    idleReturnTimer = setTimeout(async () => {
      if (!is3D || transitioning) return;
      log.info('60s 无操作，自动切回 2D');
      await exit3DFlow();
    }, IDLE_RETURN_DELAY);
  }

  function clearIdleReturnTimer() {
    if (idleReturnTimer) {
      clearTimeout(idleReturnTimer);
      idleReturnTimer = null;
    }
  }

  // ─── 按钮状态机 ──────────────────────────────

  function updateButtonState(zoom) {
    if (is3D) return; // 3D 模式中不响应 zoom

    if (zoom < ZOOM_HINT) {
      btn.hidden = true;
      btn.classList.remove('hint', 'active');
    } else if (zoom < ZOOM_ACTIVE) {
      btn.hidden = false;
      btn.classList.add('hint');
      btn.classList.remove('active');
    } else {
      btn.hidden = false;
      btn.classList.remove('hint');
      btn.classList.add('active');
    }
  }

  // zoom 变化监听
  map.on('zoomchange', () => {
    if (!transitioning) updateButtonState(map.getZoom());
  });

  // 初始状态
  updateButtonState(map.getZoom());

  // 移动端也监听 zoomend 做一次检查（某些版本 zoomchange 不触发）
  map.on('zoomend', () => {
    if (!transitioning) updateButtonState(map.getZoom());
  });

  // ─── 点击切换 ───────────────────────────────

  btn.addEventListener('click', async () => {
    if (transitioning) return;
    const was3D = is3D;
    transitioning = true;
    btn.disabled = true;

    try {
      if (is3D) {
        await exit3DFlow();
      } else {
        await enter3DFlow();
      }
    } catch (err) {
      log.error('3D 切换失败', err);
      recoverFailedTransition(was3D);
      setStatus('3D 视图切换失败，请稍后重试。');
    } finally {
      transitioning = false;
      btn.disabled = false;
    }
  });

  // ─── 进入 3D ──────────────────────────────────

  async function enter3DFlow() {
    setStatus('正在构建 3D 视图...');
    btn.classList.remove('hint', 'active');
    btn.classList.add('in-3d');
    btn.querySelector('.map-3d-toggle-label').textContent = '2D';
    btn.querySelector('.map-3d-toggle-dot').style.background = '#d4a830';
    is3D = true;

    // 隐藏 2D 地图 (保留在 DOM 中作为坐标参考)
    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.style.opacity = '0.12';

    await onEnter3D?.();

    // 隐藏 2D status panel
    const statusPanel = document.getElementById('status-panel');
    if (statusPanel) statusPanel.style.display = 'none';

    // 启动 60s 闲置自动回退计时器
    startIdleDetection();
    resetIdleReturnTimer();

    setStatus('3D 视图已就绪 · 拖拽旋转 · 捏合缩放 · 点击「2D」切回');
  }

  // ─── 退出 3D ──────────────────────────────────

  async function exit3DFlow() {
    setStatus('正在切回 2D 视图...');

    await onExit3D?.();

    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.style.opacity = '1';

    btn.classList.remove('in-3d');
    btn.querySelector('.map-3d-toggle-label').textContent = '3D 视图';
    btn.querySelector('.map-3d-toggle-dot').style.background = '#c4a44a';
    is3D = false;

    const statusPanel = document.getElementById('status-panel');
    if (statusPanel) statusPanel.style.display = '';

    clearIdleReturnTimer();
    updateButtonState(map.getZoom());
    setStatus('已切回 2D 视图。');
  }

  // ─── 用户交互检测 ──────────────────────────────

  function startIdleDetection() {
    const canvas3D = document.getElementById('map-3d');
    if (!canvas3D) return;
    ['pointerdown', 'wheel', 'touchstart'].forEach(evt => {
      canvas3D.addEventListener(evt, resetIdleReturnTimer, { passive: true });
    });
  }

  function recoverFailedTransition(was3D) {
    if (was3D) return;

    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.style.opacity = '1';

    const statusPanel = document.getElementById('status-panel');
    if (statusPanel) statusPanel.style.display = '';

    btn.classList.remove('in-3d');
    btn.querySelector('.map-3d-toggle-label').textContent = '3D 视图';
    btn.querySelector('.map-3d-toggle-dot').style.background = '#c4a44a';
    is3D = false;
    updateButtonState(map.getZoom());
  }

  return {
    is3DMode: () => is3D
  };
}
