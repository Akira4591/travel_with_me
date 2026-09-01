// js/render/share-modal.js
// 分享长图弹窗：展示图片预览，把下载/复制/重新生成交给 main.js。

import { modalSingleton, setupModalCloseEvents } from './modal-base.js';
import { escapeHTML } from '../utils.js';

let currentImageUrl = null;
let currentFilename = null;
let isRegenerating = false;
let currentOptions = null;
let handlers = null;
let generationId = 0;

export const openShareModal = modalSingleton(
  ({ imageUrl, filename, shareOptions = null, tripSummary = null, handlers: h }) => {
    handlers = h;
    currentImageUrl = imageUrl;
    currentFilename = filename;
    isRegenerating = false;
    generationId += 1;
    currentOptions = normalizeShareOptions(shareOptions || {});

    const root = document.createElement('div');
    root.className = 'modal-overlay workspace-workbench-overlay';
    root.innerHTML = `
    <div class="modal workspace-workbench share-modal" role="dialog" aria-modal="true" aria-label="分享长图">
      <aside class="workbench-rail share-workbench-rail">
        <button type="button" class="modal-close workbench-back-btn" aria-label="返回行程">← 返回行程</button>
        <div class="workbench-heading-row">
          <div><p class="workbench-eyebrow">行程工具</p><h2>分享长图</h2></div>
        </div>
        ${tripSummary ? `<p class="workbench-trip-summary">${escapeHTML(tripSummary.title || '')} · ${tripSummary.dayCount} 天 · ${tripSummary.locationCount} 个地点</p>` : ''}
        <p class="workbench-copy">修改内容后会实时生成新预览；完成前保留上一张可用长图。</p>
        <div class="share-options-panel" aria-label="分享内容">
          <label class="share-options-row"><input type="checkbox" class="share-option-input share-include-notes" data-share-option="includeNotes" ${
            currentOptions.includeNotes ? 'checked' : ''
          } /><span>包含备注</span></label>
          <label class="share-options-row"><input type="checkbox" class="share-option-input share-include-routes" data-share-option="includeRoutes" ${
            currentOptions.includeRoutes ? 'checked' : ''
          } /><span>包含交通方式</span></label>
          <label class="share-options-row"><input type="checkbox" class="share-option-input share-include-unscheduled" data-share-option="includeUnscheduled" ${
            currentOptions.includeUnscheduled ? 'checked' : ''
          } /><span>包含未排期地点</span></label>
        </div>
        <div class="share-generation-status success" aria-live="off">预览已更新 · 刚刚</div>
        <div class="share-workbench-actions">
          <button type="button" class="secondary-btn share-copy-image-btn">复制图片</button>
          <button type="button" class="modal-submit share-download-btn">下载长图</button>
        </div>
      </aside>
      <main class="workbench-stage share-image-body">
        <div class="share-image-preview">
          <img src="${imageUrl}" alt="行程分享长图预览" />
          <div class="share-image-loading" hidden>正在重新生成…</div>
        </div>
      </main>
    </div>
  `;

    setupModalCloseEvents(root, openShareModal.close);

    root.querySelector('.share-download-btn').addEventListener('click', () => {
      if (isRegenerating) return;
      handlers.onDownload?.(currentImageUrl, currentFilename);
    });
    root.querySelector('.share-copy-image-btn').addEventListener('click', () => {
      if (isRegenerating) return;
      handlers.onCopyImage?.(currentImageUrl);
    });
    root.querySelectorAll('.share-option-input').forEach(input => {
      input.addEventListener('change', e => {
        if (isRegenerating) return;
        currentOptions = { ...currentOptions, [e.target.dataset.shareOption]: e.target.checked };
        generationId += 1;
        setLoading(true, root);
        handlers.onRegenerate?.({ ...currentOptions }, generationId);
      });
    });

    document.body.appendChild(root);
  }
);

export function updateShareImage(imageUrl, filename, ownerId = generationId) {
  if (ownerId !== generationId) return false;
  currentImageUrl = imageUrl;
  currentFilename = filename;
  const modal = document.querySelector('.modal-overlay');
  if (!modal) return;
  const img = modal.querySelector('.share-image-preview img');
  if (img) img.src = imageUrl;
  setLoading(false, modal);
  setGenerationStatus('预览已更新 · 刚刚', 'success', modal);
  return true;
}

export function setShareImageLoading(loading, ownerId = generationId) {
  if (ownerId !== generationId) return false;
  const modal = document.querySelector('.modal-overlay');
  if (modal) setLoading(loading, modal);
  return true;
}

export function setShareImageError(message, ownerId = generationId) {
  if (ownerId !== generationId) return false;
  const modal = document.querySelector('.modal-overlay');
  if (!modal) return false;
  setLoading(false, modal);
  setGenerationStatus(message, 'error', modal);
  return true;
}

function setLoading(loading, root) {
  isRegenerating = loading;
  const overlay = root.querySelector('.share-image-loading');
  if (overlay) overlay.hidden = !loading;
  root.querySelectorAll('.share-option-input').forEach(i => (i.disabled = loading));
  const d = root.querySelector('.share-download-btn');
  const c = root.querySelector('.share-copy-image-btn');
  if (d) d.disabled = loading;
  if (c) c.disabled = loading;
  if (loading) setGenerationStatus('正在重新生成预览…', 'loading', root);
}

function setGenerationStatus(text, state, root) {
  const status = root.querySelector('.share-generation-status');
  if (!status) return;
  status.className = `share-generation-status ${state}`;
  status.textContent = text;
}

function normalizeShareOptions(options = {}) {
  return {
    includeRoutes: !!options.includeRoutes,
    includeNotes: options.includeNotes !== false,
    includeUnscheduled: !!options.includeUnscheduled
  };
}
