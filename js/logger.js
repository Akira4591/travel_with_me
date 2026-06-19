// js/logger.js
// 日志框架：按模块分级的 console 封装
//
// 开发环境默认全部 debug 级别，生产环境默认 warn 级别。
// 通过 localStorage key DEBUG 按模块开关：
//   DEBUG=ai-import,route-planning → 开启指定模块 debug
//   DEBUG=*                         → 全部 debug
//   DEBUG=                          → 生产模式（仅 warn+error）
//
// 使用方式：
//   import { createLogger } from './logger.js';
//   const log = createLogger('guide-match');
//   log.debug('L1 matched:', placeName);

const LOG_COLORS = {
  debug: '#6b7280',
  info: '#2563eb',
  warn: '#d97706',
  error: '#dc2626'
};

/** @type {Set<string> | null} null = 全部开启 */
let enabledModules = null;

function initDebugConfig() {
  if (enabledModules !== null) return;

  try {
    const raw = localStorage.getItem('DEBUG');
    if (raw === null || raw === '') {
      // 生产模式：只启 warn/error
      enabledModules = new Set();
      return;
    }
    if (raw.trim() === '*') {
      enabledModules = null; // 全部开启
      return;
    }
    enabledModules = new Set(
      raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
  } catch {
    enabledModules = new Set();
  }
}

/**
 * 判断指定模块的指定级别是否应该输出
 * @param {string} module
 * @param {'debug'|'info'|'warn'|'error'} level
 */
function shouldLog(module, level) {
  initDebugConfig();

  // warn/error 始终输出
  if (level === 'warn' || level === 'error') return true;

  // debug/info 仅在模块被启用时输出
  if (enabledModules === null) return true; // 全部开启
  return enabledModules.has(module);
}

/**
 * @param {string} module
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {any[]} args
 */
function logWithLevel(module, level, args) {
  if (!shouldLog(module, level)) return;

  const prefix = `[${module}]`;
  const color = LOG_COLORS[level];
  const fn = console[level] || console.log;

  if (color) {
    fn(`%c${prefix}`, `color:${color};font-weight:bold`, ...args);
  } else {
    fn(prefix, ...args);
  }
}

/**
 * 创建一个带模块名的 logger
 * @param {string} module - 模块名（如 'guide-match', 'route-planning'）
 * @returns {{ debug, info, warn, error }}
 */
export function createLogger(module) {
  return {
    debug: (...args) => logWithLevel(module, 'debug', args),
    info: (...args) => logWithLevel(module, 'info', args),
    warn: (...args) => logWithLevel(module, 'warn', args),
    error: (...args) => logWithLevel(module, 'error', args)
  };
}
