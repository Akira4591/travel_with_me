// js/storage.js
// 持久化封装：localStorage 优先，失败时降级到内存
//
// 第一版只用 localStorage，但接口设计成 Promise，方便以后切到远程：
//   - 保存草稿：把当前 trip 写到本地，刷新不丢
//   - 分享链接：生成短 ID，写入远程 KV，URL 里只带 ID
//
// 调用方不需要知道存储介质，只需要 await 接口

const STORAGE_PREFIX = 'trip-app:';
const memoryFallback = new Map();

function safeGet(key) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {
    memoryFallback.set(key, value);
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    memoryFallback.delete(key);
  }
}

// ─── 公开接口 ──────────────────────────────────────────

export async function saveTrip(trip, slot = 'draft') {
  const json = JSON.stringify({
    version: 1,
    savedAt: Date.now(),
    trip
  });
  safeSet(slot, json);
  return { ok: true };
}

export async function loadTrip(slot = 'draft') {
  const raw = safeGet(slot);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.trip ?? null;
  } catch {
    console.warn('storage: trip JSON 解析失败');
    return null;
  }
}

export async function clearTrip(slot = 'draft') {
  safeRemove(slot);
  return { ok: true };
}
