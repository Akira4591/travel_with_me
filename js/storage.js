// js/storage.js
// 持久化封装：localStorage 优先，失败时降级到内存
//
// workspace 结构：
//   { version: 4, savedAt, workspace: { trips: [...], activeTripId } }
//
// V5 schema 升级：version 2 -> 3
//   - days[].date 字段删除
//   - 顶层 trip 新增 unscheduled[]
//   - 旧版本（v < 3）数据加载时直接丢弃，触发首次启动用 initialTrip
// V6 schema 升级：version 3 -> 4
//   - 行程 icon id 规范化为 canonical id（pin/train/shop 等旧 id 不再写入新数据）
//   - 旧版本直接丢弃，避免 localStorage 里继续保留冗余 icon id
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

const SCHEMA_VERSION = 4;

export async function saveWorkspace(workspace) {
  const json = JSON.stringify({
    version: SCHEMA_VERSION,
    savedAt: Date.now(),
    workspace
  });
  safeSet(WORKSPACE_KEY, json);
  return { ok: true };
}

// 返回 workspace 对象；从未保存过返回 null（让调用方走"首次启动"分支）。
// 旧版本 schema 直接丢弃——当前项目仍处于 MVP，localStorage 只作为本机草稿。
// 兼容层成本高于价值，宁可让用户重置一次。
export async function loadWorkspace() {
  const raw = safeGet(WORKSPACE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if ((parsed.version || 0) < SCHEMA_VERSION) {
      console.warn(
        `[storage] 检测到旧 schema (v${parsed.version || '?'})，已升级到 v${SCHEMA_VERSION}。` +
          '原工作区数据已重置。'
      );
      safeRemove(WORKSPACE_KEY);
      return null;
    }
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
