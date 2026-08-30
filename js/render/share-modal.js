// js/render/share-modal.js
// 分享长图弹窗：展示图片预览，把下载/复制/重新生成交给 main.js。

import { modalSingleton, setupModalCloseEvents } from './modal-base.js';

let currentImageUrl = null;
let currentFilename = null;
let isRegenerating = false;
let currentOptions = null;
let handlers = null;

export const openShareModal = modalSingleton(
  ({ imageUrl, filename, shareOptions = null, handlers: h }) => {
    handlers = h;
    currentImageUrl = imageUrl;
    currentFilename = filename;
    isRegenerating = false;
    currentOptions = normalizeShareOptions(shareOptions || {});

    const root = document.createElement('div');
    root.className = 'modal-overlay';
    root.innerHTML = `
    <div class="modal share-modal" role="dialog" aria-modal="true" aria-label="分享长图">
      <div class="modal-header">
        <h2>分享长图</h2>
        <button type="button" class="modal-close" aria-label="关闭">&times;</button>
      </div>
      <div class="modal-body share-image-body">
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
        <div class="share-image-preview">
          <img src="${imageUrl}" alt="行程分享长图预览" />
          <div class="share-image-loading" hidden>正在重新生成...</div>
        </div>
        <div class="modal-actions">
          <button type="button" class="modal-cancel">关闭</button>
          <button type="button" class="modal-cancel share-copy-image-btn">复制图片</button>
          <button type="button" class="modal-submit share-download-btn">下载长图</button>
        </div>
      </div>
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
        setLoading(true, root);
        handlers.onRegenerate?.({ ...currentOptions });
      });
    });

    document.body.appendChild(root);
  }
);

export function updateShareImage(imageUrl, filename) {
  currentImageUrl = imageUrl;
  currentFilename = filename;
  const modal = document.querySelector('.modal-overlay');
  if (!modal) return;
  const img = modal.querySelector('.share-image-preview img');
  if (img) img.src = imageUrl;
  setLoading(false, modal);
}

export function setShareImageLoading(loading) {
  const modal = document.querySelector('.modal-overlay');
  if (modal) setLoading(loading, modal);
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
}

function normalizeShareOptions(options = {}) {
  return {
    includeRoutes: !!options.includeRoutes,
    includeNotes: options.includeNotes !== false,
    includeUnscheduled: !!options.includeUnscheduled
  };
}
