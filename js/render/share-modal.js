// js/render/share-modal.js
// 分享长图弹窗：展示图片预览，把下载/复制/系统分享/重新生成交给 main.js。

let modalEl = null;
let currentHandlers = null;
let currentImageUrl = null;
let currentFilename = null;
let isRegenerating = false;
let currentOptions = null;

export function openShareModal({
  imageUrl,
  filename,
  includeRoutes = false,
  shareOptions = null,
  handlers
}) {
  closeShareModal();
  currentHandlers = handlers;
  currentImageUrl = imageUrl;
  currentFilename = filename;
  isRegenerating = false;
  currentOptions = normalizeShareOptions(shareOptions || { includeRoutes });

  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal share-modal" role="dialog" aria-modal="true" aria-label="分享长图">
      <div class="modal-header">
        <h2>分享长图</h2>
        <button type="button" class="modal-close" aria-label="关闭">×</button>
      </div>
      <div class="modal-body share-image-body">
        <div class="share-options-panel" aria-label="分享内容">
          <label class="share-options-row">
            <input type="checkbox" class="share-option-input share-include-notes" data-share-option="includeNotes" ${currentOptions.includeNotes ? 'checked' : ''} />
            <span>包含备注</span>
          </label>
          <label class="share-options-row">
            <input type="checkbox" class="share-option-input share-include-routes" data-share-option="includeRoutes" ${currentOptions.includeRoutes ? 'checked' : ''} />
            <span>包含交通方式</span>
          </label>
          <label class="share-options-row">
            <input type="checkbox" class="share-option-input share-include-unscheduled" data-share-option="includeUnscheduled" ${currentOptions.includeUnscheduled ? 'checked' : ''} />
            <span>包含未排期地点</span>
          </label>
          <label class="share-options-row">
            <input type="checkbox" class="share-option-input share-include-annotations" data-share-option="includeAnnotations" ${currentOptions.includeAnnotations ? 'checked' : ''} />
            <span>包含 3D 标记</span>
          </label>
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

  bindEvents(modalEl);
  document.body.appendChild(modalEl);
}

export function closeShareModal() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  currentHandlers = null;
  currentImageUrl = null;
  currentFilename = null;
  isRegenerating = false;
  currentOptions = null;
}

// 由 main.js 在 onRegenerate 拿到新图后调用
export function updateShareImage(imageUrl, filename) {
  if (!modalEl) return;
  currentImageUrl = imageUrl;
  currentFilename = filename;
  const img = modalEl.querySelector('.share-image-preview img');
  if (img) img.src = imageUrl;
  setLoading(false);
}

export function setShareImageLoading(loading) {
  setLoading(loading);
}

function setLoading(loading) {
  isRegenerating = loading;
  if (!modalEl) return;
  const overlay = modalEl.querySelector('.share-image-loading');
  if (overlay) overlay.hidden = !loading;
  modalEl.querySelectorAll('.share-option-input').forEach(input => {
    input.disabled = loading;
  });
  const downloadBtn = modalEl.querySelector('.share-download-btn');
  const copyBtn = modalEl.querySelector('.share-copy-image-btn');
  if (downloadBtn) downloadBtn.disabled = loading;
  if (copyBtn) copyBtn.disabled = loading;
}

function bindEvents(root) {
  root.querySelector('.modal-close').addEventListener('click', closeShareModal);
  root.querySelector('.modal-cancel').addEventListener('click', closeShareModal);

  root.querySelector('.share-download-btn').addEventListener('click', () => {
    if (isRegenerating) return;
    currentHandlers?.onDownload?.(currentImageUrl, currentFilename);
  });
  root.querySelector('.share-copy-image-btn').addEventListener('click', () => {
    if (isRegenerating) return;
    currentHandlers?.onCopyImage?.(currentImageUrl);
  });

  root.querySelectorAll('.share-option-input').forEach(input => {
    input.addEventListener('change', e => {
      if (isRegenerating) return;
      currentOptions = {
        ...currentOptions,
        [e.target.dataset.shareOption]: e.target.checked
      };
      setLoading(true);
      currentHandlers?.onRegenerate?.({ ...currentOptions });
    });
  });

  root.addEventListener('click', e => {
    if (e.target === root) closeShareModal();
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeShareModal();
  });
}

function normalizeShareOptions(options = {}) {
  return {
    includeRoutes: !!options.includeRoutes,
    includeNotes: options.includeNotes !== false,
    includeUnscheduled: !!options.includeUnscheduled,
    includeAnnotations: !!options.includeAnnotations
  };
}
