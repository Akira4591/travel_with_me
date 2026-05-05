// js/render/share-modal.js
// 分享长图弹窗：展示图片预览，把下载/复制/系统分享/重新生成交给 main.js。

let modalEl = null;
let currentHandlers = null;
let currentImageUrl = null;
let currentFilename = null;
let isRegenerating = false;

export function openShareModal({ imageUrl, filename, includeRoutes = false, handlers }) {
  closeShareModal();
  currentHandlers = handlers;
  currentImageUrl = imageUrl;
  currentFilename = filename;
  isRegenerating = false;

  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal share-modal" role="dialog" aria-modal="true" aria-label="分享长图">
      <div class="modal-header">
        <h2>分享长图</h2>
        <button type="button" class="modal-close" aria-label="关闭">×</button>
      </div>
      <div class="modal-body share-image-body">
        <label class="share-options-row">
          <input type="checkbox" class="share-include-routes" ${includeRoutes ? 'checked' : ''} />
          <span>包含交通方式</span>
        </label>
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
  const checkbox = modalEl.querySelector('.share-include-routes');
  if (checkbox) checkbox.disabled = loading;
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

  root.querySelector('.share-include-routes').addEventListener('change', (e) => {
    if (isRegenerating) return;
    setLoading(true);
    currentHandlers?.onRegenerate?.(e.target.checked);
  });

  root.addEventListener('click', (e) => {
    if (e.target === root) closeShareModal();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeShareModal();
  });
}
