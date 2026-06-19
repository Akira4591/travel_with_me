// js/render/trip-modal.js
// Trip 级弹窗：编辑当前旅行标题 / 新建一条空白旅行路线。

import { escapeHTML } from '../utils.js';
import { modalSingleton, setupModalCloseEvents } from './modal-base.js';

export const openTripModal = modalSingleton(({ mode = 'edit', title = '', handlers }) => {
  const isCreate = mode === 'create';
  const root = document.createElement('div');
  root.className = 'modal-overlay';
  root.innerHTML = `
    <div class="modal trip-modal" role="dialog" aria-modal="true" aria-label="${
      isCreate ? '新建旅行路线' : '修改旅行标题'
    }">
      <div class="modal-header">
        <h2>${isCreate ? '新建旅行路线' : '修改旅行标题'}</h2>
        <button type="button" class="modal-close" aria-label="关闭">&times;</button>
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

  setupModalCloseEvents(root, openTripModal.close);

  root.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    const inputTitle = root.querySelector('.trip-title-input').value.trim();
    if (!inputTitle) return;
    if (mode === 'create') handlers.onCreate?.(inputTitle);
    else handlers.onSave?.(inputTitle);
    openTripModal.close();
  });

  document.body.appendChild(root);
  requestAnimationFrame(() => root.querySelector('.trip-title-input')?.focus());
});
