// js/render/share-flow.js
// 分享长图流程：从 main.js 提取。零循环依赖。

import { hasActiveTrip, getTrip } from '../state.js';
import { setStatus } from './sidebar.js?v=20260901-s5b';
import { buildTripShareImage, dataURLToBlob } from '../share-image.js';
import {
  openShareModal,
  updateShareImage,
  setShareImageError
} from './share-modal.js?v=20260901-s4b';
import { createLogger } from '../logger.js';

const log = createLogger('share-flow');

function getDefaultShareOptions() {
  return {
    includeRoutes: false,
    includeNotes: true,
    includeUnscheduled: false
  };
}

function formatShareOptionsStatus(options) {
  const parts = [];
  if (options.includeNotes) parts.push('含备注');
  if (options.includeRoutes) parts.push('含交通方式');
  if (options.includeUnscheduled) parts.push('含未排期');
  return parts.length ? parts.join('、') : '仅公开行程骨架';
}

function downloadShareImage(imageUrl, filename) {
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = filename || 'trip-share.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function copyShareImage(imageUrl) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    setStatus('当前浏览器不支持直接复制图片，请使用"下载长图"。');
    return;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': dataURLToBlob(imageUrl) })]);
    setStatus('分享长图已复制。');
  } catch (error) {
    log.warn('复制图片失败：', error);
    setStatus('复制图片失败，请使用"下载长图"。');
  }
}

async function regenerateShareImage(options = {}, generationId) {
  if (!hasActiveTrip()) return;
  const shareOptions = { ...getDefaultShareOptions(), ...options };
  try {
    const image = await buildTripShareImage(getTrip(), shareOptions);
    if (!updateShareImage(image.dataURL, image.filename, generationId)) return;
    setStatus(`分享长图已重新生成（${formatShareOptionsStatus(shareOptions)}）。`);
  } catch (error) {
    log.error('重新生成分享长图失败：', error);
    setStatus('重新生成失败，已保留上一张可用长图。');
    setShareImageError('重新生成失败，已保留上一张预览。', generationId);
  }
}

export function bindShareButton() {
  document.getElementById('share-trip-btn')?.addEventListener('click', async () => {
    if (!hasActiveTrip()) {
      setStatus('请先新建行程，再生成分享长图。');
      return;
    }
    setStatus('正在生成分享长图...');
    try {
      const shareOptions = getDefaultShareOptions();
      const trip = getTrip();
      const image = await buildTripShareImage(trip, shareOptions);
      openShareModal({
        imageUrl: image.dataURL,
        filename: image.filename,
        shareOptions,
        tripSummary: {
          title: trip.title,
          dayCount: trip.days.length,
          locationCount: Object.keys(trip.locations || {}).length
        },
        handlers: {
          onDownload: downloadShareImage,
          onCopyImage: copyShareImage,
          onRegenerate: regenerateShareImage
        }
      });
      setStatus('分享长图已生成。');
    } catch (error) {
      log.error('生成分享长图失败：', error);
      setStatus('分享长图生成失败，请稍后再试。');
    }
  });
}
