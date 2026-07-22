// js/render/modal-base.js
// Modal 基础设施：统一创建、单例管理、生命周期绑定
//
// 本模块消除 8 个 modal 文件中的重复模式：
//   - open/close 单例管理
//   - overlay click + Escape 关闭
//   - close button + cancel button 绑定
//
// 使用方式：
//   import { modalSingleton, createModalShell, setupModalCloseEvents } from './modal-base.js';
//
//   const openMyModal = modalSingleton(({ handlers }) => {
//     const { root, body } = createModalShell({ className: 'my-modal', title: '标题' });
//     body.innerHTML = `...`;
//     setupModalCloseEvents(root, closeMyModal);
//     bindFormEvents(body, handlers);
//     document.body.appendChild(root);
//     requestAnimationFrame(() => root.querySelector('input')?.focus());
//   });

/**
 * 包装函数为单例模式——同时最多一个实例。重复 open 自动先 close 旧的。
 * @param {(params: any) => void} openFn — 创建并挂载 modal 的函数
 * @returns {(params: any) => void} 包装后的打开函数，额外挂载 .close() 方法
 */
export function modalSingleton(openFn) {
  let root = null;

  function open(params) {
    root?.remove();
    root = null;
    openFn(params);
    // openFn 应该把 root 元素附加到 document.body 并存储到 open.root
    // 我们通过定时器从 document.body 找最后一个 modal-overlay
    const overlays = document.querySelectorAll('.modal-overlay');
    root = overlays[overlays.length - 1] || null;
  }

  open.close = () => {
    root?.remove();
    root = null;
  };

  return open;
}

/**
 * 创建 modal 的 HTML 外壳
 * @param {object} options
 * @param {string} options.className — 额外 CSS class（如 'trip-modal'）
 * @param {string} options.title — 弹窗标题
 * @param {string} [options.ariaLabel] — 可访问性标签，默认用 title
 * @returns {{ root: HTMLElement, body: HTMLElement }}
 */
export function createModalShell({ className = '', title = '', ariaLabel = '' }) {
  const root = document.createElement('div');
  root.className = 'modal-overlay';
  root.innerHTML = `
    <div class="modal ${className}" role="dialog" aria-modal="true" aria-label="${ariaLabel || title}">
      <div class="modal-header">
        <h2>${title}</h2>
        <button type="button" class="modal-close" aria-label="关闭">&times;</button>
      </div>
      <div class="modal-body"></div>
    </div>
  `;
  return { root, body: root.querySelector('.modal-body') };
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(root) {
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    el => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * 绑定 modal 的通用关闭事件：close button、cancel button、overlay click、Escape key
 * 同时启用 focus trap：Tab 在 modal 内循环，关闭后恢复焦点
 * @param {HTMLElement} root - modal-overlay 根元素
 * @param {() => void} closeFn - 关闭回调函数
 */
export function setupModalCloseEvents(root, closeFn) {
  root.querySelector('.modal-close')?.addEventListener('click', closeFn);
  root.querySelector('.modal-cancel')?.addEventListener('click', closeFn);
  root.addEventListener('click', e => {
    if (e.target === root) closeFn();
  });

  const previouslyFocused = document.activeElement;
  const focusable = getFocusableElements(root);
  if (focusable.length > 0) focusable[0].focus();

  const trapKeydown = e => {
    if (e.key === 'Escape') {
      closeFn();
      return;
    }
    if (e.key !== 'Tab') return;
    const elements = getFocusableElements(root);
    if (elements.length === 0) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  root.addEventListener('keydown', trapKeydown);

  const originalClose = closeFn;
  const wrappedClose = () => {
    root.removeEventListener('keydown', trapKeydown);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
    originalClose();
  };
  return wrappedClose;
}
