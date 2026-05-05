// js/storage.js
// 持久化封装：localStorage 优先，失败时降级到内存
//
// workspace 结构：
//   { version: 2, savedAt, workspace: { trips: [...], activeTripId } }
//
// 单 trip 接口（saveTrip/loadTrip）保留，方便以后做"草稿快照"或迁出 BFF；
// 当前主存储是 saveWorkspace/loadWorkspace。

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

// ─── workspace 接口（多 trip 容器） ────────────────────

const WORKSPACE_KEY = 'workspace';

export async function saveWorkspace(workspace) {
  const json = JSON.stringify({
    version: 2,
    savedAt: Date.now(),
    workspace
  });
  safeSet(WORKSPACE_KEY, json);
  return { ok: true };
}

// 返回 workspace 对象；从未保存过返回 null（让调用方走"首次启动"分支）。
export async function loadWorkspace() {
  const raw = safeGet(WORKSPACE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.workspace ?? null;
  } catch {
    console.warn('storage: workspace JSON 解析失败');
    return null;
  }
}

export async function clearWorkspace() {
  safeRemove(WORKSPACE_KEY);
  return { ok: true };
}

// ─── 单 trip 接口（保留，未在主流程使用） ──────────────

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
