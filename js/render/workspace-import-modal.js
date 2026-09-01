import { escapeHTML } from '../utils.js';
import { modalSingleton, setupModalCloseEvents } from './modal-base.js';

export const openWorkspaceImportModal = modalSingleton(({ file, parsed, handlers }) => {
  const root = document.createElement('div');
  root.className = 'modal-overlay workspace-workbench-overlay';
  root.innerHTML = `
    <div class="modal workspace-workbench import-workbench" role="dialog" aria-modal="true" aria-label="导入工作区 JSON">
      <aside class="workbench-rail">
        <div class="workbench-heading-row">
          <div>
            <p class="workbench-eyebrow">工作区工具</p>
            <h2>导入工作区 JSON</h2>
          </div>
          <button type="button" class="modal-close" aria-label="关闭">&times;</button>
        </div>
        <p class="workbench-copy">导入前将校验文件内容；通过后方可保存恢复点并替换。</p>
        <section class="import-file-card" aria-label="所选文件">
          <div>
            <strong>${escapeHTML(file?.name || '未命名 JSON 文件')}</strong>
            <span>${formatFileSize(file?.size)}</span>
          </div>
          <button type="button" class="secondary-btn import-reselect-btn">重新选择</button>
        </section>
        <section class="validation-steps" aria-label="线性校验进度">
          ${renderValidationStep(1, 'JSON 语法', parsed.ok, parsed.error === 'INVALID_JSON')}
          ${renderValidationStep(2, '工作区结构', parsed.ok, !parsed.ok && parsed.error !== 'INVALID_JSON')}
          ${renderValidationStep(3, '路线与日期数据', parsed.ok, false)}
        </section>
        ${renderMeta(parsed)}
        <div class="import-validation-result ${parsed.ok ? 'success' : 'error'}" role="note">
          ${escapeHTML(parsed.ok ? '所有校验均通过，文件可安全导入。' : parsed.message || '文件校验未通过。')}
        </div>
      </aside>
      <main class="workbench-stage">
        ${parsed.ok ? renderWorkspaceSummary(parsed.summary) : renderInvalidState()}
        <div class="workbench-actions">
          <p>将替换当前本地工作区；替换前会保存恢复快照。</p>
          <div>
            <button type="button" class="modal-cancel secondary-btn">取消导入</button>
            <button type="button" class="modal-submit import-confirm-btn" ${parsed.ok ? '' : 'disabled'}>保存恢复点并替换</button>
          </div>
        </div>
      </main>
    </div>`;

  setupModalCloseEvents(root, openWorkspaceImportModal.close);
  root
    .querySelector('.import-reselect-btn')
    .addEventListener('click', () => handlers.onReselect?.());
  root.querySelector('.import-confirm-btn').addEventListener('click', async event => {
    if (!parsed.ok) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '正在保存恢复点...';
    const result = await handlers.onConfirm?.(parsed.workspace);
    if (result?.ok) {
      openWorkspaceImportModal.close();
      return;
    }
    button.disabled = false;
    button.textContent = '保存恢复点并替换';
    const resultBox = root.querySelector('.import-validation-result');
    resultBox.className = 'import-validation-result error';
    resultBox.textContent = result?.message || '导入失败，原工作区未被覆盖。';
  });

  document.body.appendChild(root);
});

function renderValidationStep(index, label, passed, failed) {
  const state = passed ? 'passed' : failed ? 'failed' : 'pending';
  const status = passed ? '已通过' : failed ? '未通过' : '待校验';
  return `<div class="validation-step ${state}"><span>${index}</span><strong>${escapeHTML(status)}</strong><p>${escapeHTML(label)}</p></div>`;
}

function renderMeta(parsed) {
  if (!parsed.ok) return '';
  const schema = parsed.meta?.schemaVersion || '未知';
  const exportedAt = formatDate(parsed.meta?.exportedAt);
  return `<dl class="import-meta"><div><dt>格式</dt><dd>${escapeHTML(parsed.meta?.format || 'workspace JSON')}</dd></div><div><dt>Schema</dt><dd>${escapeHTML(String(schema))}</dd></div><div><dt>导出于</dt><dd>${escapeHTML(exportedAt)}</dd></div></dl>`;
}

function renderWorkspaceSummary(summary) {
  return `<section class="import-summary" aria-label="待导入工作区摘要">
    <div class="import-summary-heading"><div><p class="workbench-eyebrow">校验通过</p><h2>待导入工作区</h2></div><strong>${summary.tripCount} 条路线 · ${summary.dayCount} 天 · ${summary.locationCount} 个地点</strong></div>
    <div class="import-trip-list">${summary.trips.map(renderTripSummary).join('')}</div>
  </section>`;
}

function renderTripSummary(trip) {
  const places = trip.previewPlaces.length
    ? trip.previewPlaces
        .map((place, index) => `<span><b>${index + 1}</b>${escapeHTML(place)}</span>`)
        .join('')
    : '<em>还没有地点</em>';
  return `<article class="import-trip-card"><div><h3>${escapeHTML(trip.title)}</h3><p>${trip.dayCount} 天 · ${trip.locationCount} 个地点 · ${trip.unscheduledCount} 个未排期</p></div><div class="import-place-preview">${places}</div></article>`;
}

function renderInvalidState() {
  return `<section class="import-empty-state"><h2>文件暂不可导入</h2><p>请查看左侧校验结果并重新选择 JSON 文件。当前工作区不会发生变化。</p></section>`;
}

function formatFileSize(size = 0) {
  if (!Number.isFinite(size) || size <= 0) return 'JSON 文件';
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`;
}

function formatDate(value) {
  if (!value) return '未提供';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('zh-CN', { hour12: false });
}
