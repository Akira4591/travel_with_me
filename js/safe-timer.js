// js/safe-timer.js
// 2026 标准: AbortSignal 驱动的可取消 Promise delay
//
// 使用方式:
//   import { delay, createTimer } from './safe-timer.js';
//   await delay(5000, { signal: controller.signal });
//   const timer = createTimer(); timer.set('poll', () => fetch(), 3000); timer.clearAll();

/** 可取消的 Promise delay (2026 AbortSignal 模式) */
export function delay(ms, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const id = setTimeout(resolve, ms);
    function onAbort() {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 命名定时器管理器 — 同名自动覆盖，clearAll 一键销毁 */
export function createTimer() {
  const timers = new Map();
  return {
    set(key, fn, ms) {
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          fn();
        }, ms)
      );
    },
    clear(key) {
      clearTimeout(timers.get(key));
      timers.delete(key);
    },
    clearAll() {
      timers.forEach(clearTimeout);
      timers.clear();
    }
  };
}
