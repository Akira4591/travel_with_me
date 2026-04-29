// js/share.js
// 纯前端分享：把可序列化 trip 写进 URL hash，打开链接时再还原。
//
// 这不是最终的后端分享方案，但足够当前阶段做可复制、可打开的路线链接。

const SHARE_PREFIX = '#trip=';

export function readSharedTripFromURL() {
  const hash = window.location.hash || '';
  if (!hash.startsWith(SHARE_PREFIX)) return null;

  try {
    const encoded = hash.slice(SHARE_PREFIX.length);
    return JSON.parse(decodeBase64URL(encoded));
  } catch (err) {
    console.warn('分享链接解析失败：', err);
    return null;
  }
}

export function buildShareURL(trip) {
  const url = new URL(window.location.href);
  url.hash = `${SHARE_PREFIX.slice(1)}${encodeBase64URL(JSON.stringify(trip))}`;
  return url.toString();
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return fallbackCopy(text);
}

function encodeBase64URL(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64URL(value) {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function fallbackCopy(text) {
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.select();
  const ok = document.execCommand('copy');
  input.remove();
  return ok;
}
