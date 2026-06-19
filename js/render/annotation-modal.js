import { ANNOTATION_TYPES, getAnnotationType } from '../annotations.js';
import { escapeHTML } from '../utils.js';
import { createModalShell, modalSingleton, setupModalCloseEvents } from './modal-base.js';

export const openAnnotationModal = modalSingleton(({ annotation = {}, handlers = {} }) => {
  const type = getAnnotationType(annotation.type);
  const { root, body } = createModalShell({
    className: 'annotation-modal',
    title: '添加 3D 标记'
  });
  body.innerHTML = `
    <form class="annotation-form">
      <div class="modal-form-row">
        <label>类型</label>
        <select class="annotation-type-input">
          ${ANNOTATION_TYPES.map(
            option =>
              `<option value="${option.id}" ${option.id === type.id ? 'selected' : ''}>${escapeHTML(option.label)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="modal-form-row">
        <label>标题</label>
        <input type="text" class="annotation-title-input" maxlength="80" required value="${escapeHTML(annotation.title || type.label)}" />
      </div>
      <div class="modal-form-row">
        <label>备注</label>
        <textarea class="annotation-note-input" maxlength="240">${escapeHTML(annotation.note || '')}</textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-cancel">取消</button>
        <button type="submit" class="modal-submit">保存</button>
      </div>
    </form>
  `;

  setupModalCloseEvents(root, openAnnotationModal.close);
  body.querySelector('.annotation-form')?.addEventListener('submit', event => {
    event.preventDefault();
    handlers.onSubmit?.({
      ...annotation,
      type: body.querySelector('.annotation-type-input')?.value || type.id,
      title: body.querySelector('.annotation-title-input')?.value || type.label,
      note: body.querySelector('.annotation-note-input')?.value || ''
    });
    openAnnotationModal.close();
  });

  document.body.appendChild(root);
  requestAnimationFrame(() => body.querySelector('.annotation-title-input')?.focus());
});
