// js/error-boundary.js
// 全局错误边界 — S3 商业化的生产监控前置
//
// 捕获所有未处理的错误和 Promise rejection，
// 生产环境输出到 console.error (后续接入 Sentry)。
//
// 使用方式:
//   import './error-boundary.js';  // 在 main.js 顶部导入即可

import { createLogger } from './logger.js';

const log = createLogger('error-boundary');

window.addEventListener('error', event => {
  log.error('Unhandled error', {
    message: event.message || 'unknown',
    filename: (event.filename || '').split('/').slice(-2).join('/'),
    lineno: event.lineno,
    colno: event.colno
  });
});

window.addEventListener('unhandledrejection', event => {
  log.error('Unhandled promise rejection', {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason || 'unknown')
  });
});
