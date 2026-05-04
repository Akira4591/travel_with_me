// js/render/share-modal.js
// 分享长图弹窗：展示图片预览，把下载/复制/系统分享交给 main.js。

let modalEl = null;
let currentHandlers = null;

export function openShareModal({ imageUrl, filename, handlers }) {
  closeShareModal();
  currentHandlers = handlers;

  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = `
    <div class="modal share-modal" role="dialog" aria-modal="true" aria-label="分享长图">
      <div class="modal-header">
        <h2>分享长图</h2>
        <button type="button" class="modal-close" aria-label="关闭">×</button>
      </div>
      <div class="modal-body share-image-body">
        <div class="share-image-preview">
          <img src="${imageUrl}" alt="行程分享长图预览" />
        </div>
        <div class="modal-actions">
          <button type="button" class="modal-cancel">关闭</button>
          <button type="button" class="modal-cancel share-copy-image-btn">复制图片</button>
          <button type="button" class="modal-submit share-download-btn">下载长图</button>
        </div>
      </div>
    </div>
  `;

  bindEvents(modalEl, imageUrl, filename);
  document.body.appendChild(modalEl);
}

export function closeShareModal() {
  if (!modalEl) return;
  modalEl.remove();
  modalEl = null;
  currentHandlers = null;
}

function bindEvents(root, imageUrl, filename) {
  root.querySelector('.modal-close').addEventListener('click', closeShareModal);
  root.querySelector('.modal-cancel').addEventListener('click', closeShareModal);
  root.querySelector('.share-download-btn').addEventListener('click', () => {
    currentHandlers?.onDownload?.(imageUrl, filename);
  });
  root.querySelector('.share-copy-image-btn').addEventListener('click', () => {
    currentHandlers?.onCopyImage?.(imageUrl);
  });
  root.addEventListener('click', (e) => {
    if (e.target === root) closeShareModal();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeShareModal();
  });
}
