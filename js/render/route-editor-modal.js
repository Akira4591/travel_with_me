// js/render/route-editor-modal.js
// 编辑路线：当前只允许切换"规划方式"。

import { escapeHTML } from '../utils.js';
import { ROUTE_MODE_OPTIONS, normalizeRouteMode, normalizeRouteToNext } from '../route-config.js';
import { modalSingleton, setupModalCloseEvents } from './modal-base.js';

export const openRouteEditorModal = modalSingleton(({ segment, handlers }) => {
  const route = normalizeRouteToNext(segment.routeToNext || { mode: segment.mode });
  const root = document.createElement('div');
  root.className = 'modal-overlay';
  root.innerHTML = `
    <div class="modal route-editor-modal" role="dialog" aria-modal="true" aria-label="编辑路线">
      <div class="modal-header">
        <h2>编辑路线</h2>
        <button type="button" class="modal-close" aria-label="关闭">&times;</button>
      </div>
      <form class="modal-body route-editor-form">
        <div class="route-editor-context">
          <span>${escapeHTML(segment.fromName)}</span>
          <span>&rarr;</span>
          <span>${escapeHTML(segment.toName)}</span>
        </div>
        <div class="modal-form-row route-mode-form-row">
          <label>规划方式</label>
          ${renderModePickerHTML(route.mode)}
        </div>
        <div class="modal-actions">
          <button type="button" class="modal-cancel">取消</button>
          <button type="submit" class="modal-submit">保存</button>
        </div>
      </form>
    </div>
  `;

  setupModalCloseEvents(root, openRouteEditorModal.close);

  const modePicker = bindModePicker(root, route.mode);
  root.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    handlers.onConfirm?.(normalizeRouteToNext({ mode: modePicker.getValue(), manual: true }));
    openRouteEditorModal.close();
  });

  document.body.appendChild(root);
  requestAnimationFrame(() => root.querySelector('.route-mode-btn.active')?.focus());
});

function renderModePickerHTML(value) {
  const selected = normalizeRouteMode(value);
  return `<div class="route-mode-picker" role="radiogroup" aria-label="选择规划方式">${ROUTE_MODE_OPTIONS.map(
    option =>
      `<button type="button" class="route-mode-btn ${option.id === selected ? 'active' : ''}" data-mode="${
        option.id
      }" role="radio" aria-checked="${option.id === selected}">${escapeHTML(option.label)}</button>`
  ).join('')}</div>`;
}

function bindModePicker(root, initialMode) {
  let value = normalizeRouteMode(initialMode);
  root.querySelectorAll('.route-mode-btn').forEach(button => {
    button.addEventListener('click', () => {
      value = normalizeRouteMode(button.dataset.mode);
      root.querySelectorAll('.route-mode-btn').forEach(item => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-checked', String(active));
      });
    });
  });
  return { getValue: () => value };
}
