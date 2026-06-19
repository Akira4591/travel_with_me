// js/render/trip-modal.js
// Trip 级弹窗：编辑当前旅行标题 / 新建一条空白旅行路线。

import { escapeHTML } from '../utils.js';

let modalEl = null;
let currentHandlers = null;

export function openTripModal({ mode = 'edit', title = '', handlers }) {
  closeTripModal();
  currentHandlers = handlers;
  modalEl = createModal(mode, title);
  document.body.appendChild(modalEl);
  requestAnimationFrame(() => modalEl?.querySelector('.trip-title-input')?.focus());
}

export function closeTripModal() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  currentHandlers = null;
}

function createModal(mode, title) {
  const isCreate = mode === 'create';
  const root = document.createElement('div');
  root.className = 'modal-overlay';
  root.innerHTML = `
    <div class="modal trip-modal" role="dialog" aria-modal="true" aria-label="${isCreate ? '新建旅行路线' : '修改旅行标题'}">
      <div class="modal-header">
        <h2>${isCreate ? '新建旅行路线' : '修改旅行标题'}</h2>
        <button type="button" class="modal-close" aria-label="关闭">×</button>
      </div>
      <form class="modal-body trip-modal-body">
        <p class="trip-modal-copy">${isCreate ? '给新行程起个名字吧~' : '给这趟旅行换个名字吧~'}</p>
        <input type="text" class="trip-title-input" placeholder="例如：五一北京行程" required value="${escapeHTML(title)}" />
        <div class="modal-actions">
          <button type="button" class="modal-cancel">取消</button>
          <button type="submit" class="modal-submit">${isCreate ? '确定' : '保存'}</button>
        </div>
      </form>
    </div>
  `;
  bindEvents(root, mode);
  return root;
}

function bindEvents(root, mode) {
  root.querySelector('.modal-close').addEventListener('click', closeTripModal);
  root.querySelector('.modal-cancel').addEventListener('click', closeTripModal);
  root.addEventListener('click', e => {
    if (e.target === root) closeTripModal();
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeTripModal();
  });

  root.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const title = root.querySelector('.trip-title-input').value.trim();
    if (!title) return;
    if (mode === 'create') currentHandlers?.onCreate?.(title);
    else currentHandlers?.onSave?.(title);
    closeTripModal();
  });
}
