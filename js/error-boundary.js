// js/error-boundary.js
// 全局错误边界 - S3 商业化的生产监控前置
//
// 捕获所有未处理的错误和 Promise rejection，
// 生产环境输出到 console.error (后续接入 Sentry)，
// 并在 UI 上显示用户可见的恢复界面。
//
// 使用方式:
//   import './error-boundary.js';  // 在 main.js 顶部导入即可

import { createLogger } from './logger.js';

const log = createLogger('error-boundary');
let overlayShown = false;

function showErrorOverlay(message) {
  if (overlayShown) return;
  overlayShown = true;

  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'alert');
  overlay.setAttribute('aria-live', 'assertive');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:99999',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:rgba(38,36,33,0.88)',
    'font-family:inherit',
    'color:#fcfaf5'
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'max-width:360px',
    'padding:24px 28px',
    'text-align:center',
    'border-radius:10px',
    'background:#3e3b34'
  ].join(';');

  const title = document.createElement('p');
  title.textContent = '应用遇到意外错误';
  title.style.cssText = 'margin:0 0 8px;font-size:16px;font-weight:500';

  const desc = document.createElement('p');
  desc.textContent = '刷新页面通常可以恢复。如果问题持续出现，请清除浏览器缓存后重试。';
  desc.style.cssText = 'margin:0 0 16px;font-size:13px;opacity:0.7;line-height:1.5';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '刷新页面';
  btn.style.cssText = [
    'padding:8px 24px',
    'border:none',
    'border-radius:6px',
    'background:#e6ad00',
    'color:#3e3b34',
    'font-size:14px',
    'font-weight:500',
    'cursor:pointer'
  ].join(';');
  btn.addEventListener('click', () => window.location.reload());

  card.appendChild(title);
  card.appendChild(desc);
  card.appendChild(btn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

window.addEventListener('error', event => {
  log.error('Unhandled error', {
    message: event.message || 'unknown',
    filename: (event.filename || '').split('/').slice(-2).join('/'),
    lineno: event.lineno,
    colno: event.colno
  });
  showErrorOverlay(event.message || '未知错误');
});

window.addEventListener('unhandledrejection', event => {
  const reason =
    event.reason instanceof Error ? event.reason.message : String(event.reason || 'unknown');
  log.error('Unhandled promise rejection', { reason });
  showErrorOverlay(reason);
});
