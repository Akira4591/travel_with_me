// js/render/day-editor-modal.js
// 编辑 / 新建 day 级信息：当天标题（V5 删除了日期字段）。

import { escapeHTML } from '../utils.js';

let modalEl = null;
let currentHandlers = null;

export function openDayEditorModal({ day = null, mode = 'edit', canDelete = true, handlers }) {
  closeDayEditorModal();
  currentHandlers = handlers;
  modalEl = createModal(day, mode, canDelete);
  document.body.appendChild(modalEl);
  requestAnimationFrame(() => {
    modalEl?.querySelector('.day-title-input')?.focus();
  });
}

export function closeDayEditorModal() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  currentHandlers = null;
}

function createModal(day, mode, canDelete) {
  const isCreate = mode === 'create';
  const root = document.createElement('div');
  root.className = 'modal-overlay';
  root.innerHTML = `
    <div class="modal day-editor-modal" role="dialog" aria-modal="true" aria-label="${isCreate ? '新建一天' : '编辑这一天'}">
      <div class="modal-header">
        <h2>${isCreate ? '新建一天' : '编辑这一天'}</h2>
        <button type="button" class="modal-close" aria-label="关闭">×</button>
      </div>
      <form class="modal-body day-editor-form">
        <div class="modal-form-row">
          <label>标题</label>
          <input type="text" class="day-title-input" placeholder="留空则显示「新的一天」" value="${escapeHTML(day?.title || '')}" />
        </div>
        <div class="modal-actions day-editor-actions">
          ${!isCreate && canDelete ? '<button type="button" class="modal-danger day-delete-btn">删除这一天</button>' : ''}
          <span class="modal-action-spacer"></span>
          <button type="button" class="modal-cancel">取消</button>
          <button type="submit" class="modal-submit">${isCreate ? '创建' : '保存'}</button>
        </div>
      </form>
    </div>
  `;

  bindEvents(root, day, mode);
  return root;
}

function bindEvents(root, day, mode) {
  const form = root.querySelector('.day-editor-form');

  root.querySelector('.modal-close').addEventListener('click', closeDayEditorModal);
  root.querySelector('.modal-cancel').addEventListener('click', closeDayEditorModal);
  root.addEventListener('click', e => {
    if (e.target === root) closeDayEditorModal();
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDayEditorModal();
  });

  root.querySelector('.day-delete-btn')?.addEventListener('click', () => {
    currentHandlers?.onDelete?.(day);
    closeDayEditorModal();
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    // V5：patch 只剩 title。空字符串允许提交（renderItinerary 显示"新的一天"）。
    const patch = {
      title: root.querySelector('.day-title-input').value.trim()
    };

    const ok =
      mode === 'create'
        ? currentHandlers?.onCreate?.(patch)
        : currentHandlers?.onSave?.(day, patch);
    if (ok === false) return;
    closeDayEditorModal();
  });
}
