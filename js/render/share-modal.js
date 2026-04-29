// js/render/share-modal.js
// 分享链接弹窗：只展示链接和触发复制回调，不读写 state。

import { escapeHTML } from '../utils.js';

let modalEl = null;
let currentHandlers = null;

export function openShareModal({ url, handlers }) {
  closeShareModal();
  currentHandlers = handlers;

  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal share-modal" role="dialog" aria-modal="true" aria-label="分享路线">
      <div class="modal-header">
        <h2>分享路线</h2>
        <button type="button" class="modal-close" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">
        <textarea class="share-url-input" readonly>${escapeHTML(url)}</textarea>
        <div class="modal-actions">
          <button type="button" class="modal-cancel">关闭</button>
          <button type="button" class="modal-submit share-copy-btn">复制链接</button>
        </div>
      </div>
    </div>
  `;

  bindEvents(modalEl);
  document.body.appendChild(modalEl);
  requestAnimationFrame(() => {
    const input = modalEl?.querySelector('.share-url-input');
    input?.focus();
    input?.select();
  });
}

export function closeShareModal() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  currentHandlers = null;
}

function bindEvents(root) {
  root.querySelector('.modal-close').addEventListener('click', closeShareModal);
  root.querySelector('.modal-cancel').addEventListener('click', closeShareModal);
  root.querySelector('.share-copy-btn').addEventListener('click', () => {
    currentHandlers?.onCopy?.(root.querySelector('.share-url-input').value);
  });
  root.addEventListener('click', (e) => {
    if (e.target === root) closeShareModal();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeShareModal();
  });
}
