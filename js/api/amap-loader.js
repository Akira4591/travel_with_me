// js/api/amap-loader.js
// 加载高德 JS API 2.0 的薄封装
//
// 为什么单独抽一个文件：
//   - _AMapSecurityConfig 必须在 loader.js 之前注入到 window
//   - 整个应用只允许 load 一次，多次 load 会报错 → 单例
//   - 失败时给上层一个统一的错误形态
//
// Web Service Key 严禁出现在前端：通过 serviceHost 让 SDK 的降级服务请求
// 打到同源 BFF（server/index.js），由 BFF 注入服务端持有的 Web Service Key。

import { AppConfig } from '../config.js?v=20260622-map-base-v2';

let loadPromise = null;

export function loadAMap() {
  if (loadPromise) return loadPromise;

  loadPromise = loadRuntimeConfig()
    .then(
      runtimeConfig =>
        new Promise((resolve, reject) => {
          const amapKey = runtimeConfig.amapJsKey || AppConfig.amapKey;
          if (!amapKey) {
            reject(new Error('AMAP_JS_KEY_MISSING'));
            return;
          }

          // 把 SDK 的 Web 服务请求重定向到本应用的 BFF（必须在 loader.js 之前注入）
          window._AMapSecurityConfig = {
            serviceHost: `${location.origin}/_AMapService`
          };

          // 动态加载 loader.js（如果还没加载）
          if (typeof window.AMapLoader === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://webapi.amap.com/loader.js';
            script.onload = () => loadWithSdk(resolve, reject, amapKey);
            script.onerror = () => reject(new Error('loader.js 加载失败'));
            document.head.appendChild(script);
          } else {
            loadWithSdk(resolve, reject, amapKey);
          }
        })
    )
    .catch(error => {
      loadPromise = null;
      throw error;
    });

  return loadPromise;
}

async function loadRuntimeConfig() {
  const response = await fetch('/_config', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('RUNTIME_CONFIG_FAILED');
  return response.json();
}

function loadWithSdk(resolve, reject, amapKey) {
  window.AMapLoader.load({
    key: amapKey,
    version: '2.0',
    plugins: AppConfig.plugins
  })
    .then(resolve)
    .catch(error => {
      const keyHint = `${amapKey.slice(0, 6)}...${amapKey.slice(-4)}`;
      error.amapKeyHint = keyHint;
      reject(error);
    });
}
