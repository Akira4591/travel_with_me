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

const activeModalRoots = new Set();
let modalSessionFocusTarget = null;
let backgroundSnapshot = null;

/**
 * 包装函数为单例模式——同时最多一个实例。重复 open 自动先 close 旧的。
 * @param {(params: any) => void} openFn — 创建并挂载 modal 的函数
 * @returns {(params: any) => void} 包装后的打开函数，额外挂载 .close() 方法
 */
export function modalSingleton(openFn) {
  let root = null;
  let cleanup = null;
  let restoreFocusTarget = null;
  let removeModalGuards = null;

  function open(params) {
    open.close();
    restoreFocusTarget = document.activeElement;
    if (!activeModalRoots.size) modalSessionFocusTarget = restoreFocusTarget;
    cleanup = openFn(params) || null;
    // openFn 应该把 root 元素附加到 document.body 并存储到 open.root
    // 我们通过定时器从 document.body 找最后一个 modal-overlay
    const overlays = document.querySelectorAll('.modal-overlay');
    root = overlays[overlays.length - 1] || null;
    if (root) {
      removeModalGuards = installModalGuards(root, open.close);
      requestAnimationFrame(() => {
        if (!root?.isConnected || root.contains(document.activeElement)) return;
        const firstFocusable = getFocusableElements(root)[0];
        (firstFocusable || root.querySelector('[role="dialog"]'))?.focus?.();
      });
    }
  }

  open.close = () => {
    let focusTarget = restoreFocusTarget;
    restoreFocusTarget = null;
    removeModalGuards?.();
    removeModalGuards = null;
    cleanup?.();
    cleanup = null;
    root?.remove();
    root = null;
    if (activeModalRoots.size) return;
    if (!focusTarget?.isConnected) focusTarget = modalSessionFocusTarget || focusTarget;
    modalSessionFocusTarget = null;
    if (focusTarget?.isConnected) {
      Promise.resolve().then(() => focusTarget.focus?.());
    } else if (focusTarget) {
      const selector = getFocusRestoreSelector(focusTarget);
      Promise.resolve().then(() => document.querySelector(selector)?.focus?.());
    }
  };

  return open;
}

function getFocusRestoreSelector(element) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const stableAttributes = [
    'data-create-trip',
    'data-import-guide',
    'data-trip-id',
    'data-trip-menu'
  ];
  const attribute = stableAttributes.find(name => element.hasAttribute?.(name));
  if (attribute) {
    const value = element.getAttribute(attribute);
    return value ? `[${attribute}="${CSS.escape(value)}"]` : `[${attribute}]`;
  }
  return `.${[...element.classList].map(name => CSS.escape(name)).join('.')}`;
}

function installModalGuards(root, closeFn) {
  if (!activeModalRoots.size) {
    backgroundSnapshot = [...document.body.children].map(element => ({
      element,
      inert: element.hasAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden')
    }));
  }
  activeModalRoots.add(root);
  syncBackgroundIsolation();

  const handleKeydown = event => {
    if ([...activeModalRoots].at(-1) !== root) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeFn();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(root);
    if (!focusable.length) {
      event.preventDefault();
      root.querySelector('[role="dialog"]')?.focus?.();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const handleClick = event => {
    if (event.target === root) closeFn();
  };
  document.addEventListener('keydown', handleKeydown);
  root.addEventListener('click', handleClick);

  return () => {
    document.removeEventListener('keydown', handleKeydown);
    root.removeEventListener('click', handleClick);
    activeModalRoots.delete(root);
    syncBackgroundIsolation();
  };
}

function syncBackgroundIsolation() {
  if (activeModalRoots.size) {
    const activeRoot = [...activeModalRoots].at(-1);
    [...document.body.children].forEach(element => {
      const active = element === activeRoot;
      element.toggleAttribute('inert', !active);
      if (active) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', 'true');
    });
    return;
  }
  backgroundSnapshot?.forEach(({ element, inert, ariaHidden }) => {
    if (inert) element.setAttribute('inert', '');
    else element.removeAttribute('inert');
    if (ariaHidden == null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', ariaHidden);
  });
  backgroundSnapshot = null;
}

function getFocusableElements(root) {
  return [
    ...root.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )
  ].filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
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

/**
 * 绑定 modal 的通用关闭事件：close button、cancel button、overlay click、Escape key
 * @param {HTMLElement} root — modal-overlay 根元素
 * @param {() => void} closeFn — 关闭回调函数
 */
export function setupModalCloseEvents(root, closeFn) {
  root.querySelector('.modal-close')?.addEventListener('click', closeFn);
  root.querySelector('.modal-cancel')?.addEventListener('click', closeFn);
}
