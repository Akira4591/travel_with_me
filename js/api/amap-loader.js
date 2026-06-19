// js/api/amap-loader.js
// 加载高德 JS API 2.0 的薄封装
//
// 为什么单独抽一个文件：
//   - _AMapSecurityConfig 必须在 loader.js 之前注入到 window
//   - 整个应用只允许 load 一次，多次 load 会报错 → 单例
//   - 失败时给上层一个统一的错误形态
//
// 安全密钥（jscode）严禁出现在前端：通过 serviceHost 让 SDK 把 Web 服务请求
// 打到同源 BFF（server/index.js），由 BFF 从环境变量取出 jscode 后转发到高德。

import { AppConfig } from '../config.js';

let loadPromise = null;

export function loadAMap() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // 把 SDK 的 Web 服务请求重定向到本应用的 BFF（必须在 loader.js 之前注入）
    window._AMapSecurityConfig = {
      serviceHost: `${location.origin}/_AMapService`
    };

    // 动态加载 loader.js（如果还没加载）
    if (typeof window.AMapLoader === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://webapi.amap.com/loader.js';
      script.onload = () => loadWithSdk(resolve, reject);
      script.onerror = () => reject(new Error('loader.js 加载失败'));
      document.head.appendChild(script);
    } else {
      loadWithSdk(resolve, reject);
    }
  });

  return loadPromise;
}

function loadWithSdk(resolve, reject) {
  window.AMapLoader.load({
    key: AppConfig.amapKey,
    version: '2.0',
    plugins: AppConfig.plugins
  })
    .then(resolve)
    .catch(reject);
}
