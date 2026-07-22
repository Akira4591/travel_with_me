// js/storage.js
// 持久化封装：localStorage 优先，失败时降级到内存
//
// workspace 结构：
//   { version: 5, savedAt, workspace: { trips: [...], activeTripId } }
//
// V5 schema 升级：version 2 -> 3
//   - days[].date 字段删除
//   - 顶层 trip 新增 unscheduled[]
//   - 旧版本（v < 3）数据加载时直接丢弃，触发首次启动用 initialTrip
// V6 schema 升级：version 3 -> 4
//   - 行程 icon id 规范化为 canonical id（pin/train/shop 等旧 id 不再写入新数据）
//   - 旧版本直接丢弃，避免 localStorage 里继续保留冗余 icon id
// V7 schema 升级：version 4 -> 5
//   - 不再静默丢弃旧 schema；加载旧版本时先保存 recovery snapshot，再交给 state 层规范化
//   - 增加 workspace JSON 导出/导入封装
//
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

// ─── workspace 接口（多 trip 容器） ────────────────────

const WORKSPACE_KEY = 'workspace';
const RECOVERY_PREFIX = 'workspace-recovery:';

export const SCHEMA_VERSION = 5;
export const EXPORT_FORMAT = 'travel-with-me.workspace';
export const EXPORT_FORMAT_VERSION = 1;

let lastWorkspaceLoadInfo = { status: 'empty' };

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
// 旧版本 schema 不再直接丢弃：先保存 recovery snapshot，再把 workspace 交给 state 层规范化。
export async function loadWorkspace() {
  const raw = safeGet(WORKSPACE_KEY);
  if (!raw) {
    lastWorkspaceLoadInfo = { status: 'empty' };
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    const version = Number(parsed.version || 0);
    const loadedWorkspace = parsed.workspace ?? null;
    if (!loadedWorkspace || typeof loadedWorkspace !== 'object') {
      const recoveryKey = createRecoverySnapshot(raw, 'invalid-workspace-shape');
      lastWorkspaceLoadInfo = { status: 'invalid', recoveryKey };
      return null;
    }
    if (version < SCHEMA_VERSION) {
      const recoveryKey = createRecoverySnapshot(
        raw,
        `schema-v${version || 'unknown'}-to-v${SCHEMA_VERSION}`
      );
      console.warn(
        `[storage] 检测到旧 schema (v${version || '?'})，已保存恢复快照并交给状态层迁移。`
      );
      lastWorkspaceLoadInfo = {
        status: 'migrated',
        fromVersion: version || null,
        toVersion: SCHEMA_VERSION,
        recoveryKey
      };
      return loadedWorkspace;
    }
    lastWorkspaceLoadInfo = { status: 'ok', version };
    return loadedWorkspace;
  } catch {
    const recoveryKey = createRecoverySnapshot(raw, 'parse-error');
    lastWorkspaceLoadInfo = { status: 'parse-error', recoveryKey };
    console.warn('storage: workspace JSON 解析失败');
    return null;
  }
}

export function getLastWorkspaceLoadInfo() {
  return { ...lastWorkspaceLoadInfo };
}

export function buildWorkspaceExport(workspace) {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    workspace
  };
}

export function stringifyWorkspaceExport(workspace) {
  return `${JSON.stringify(buildWorkspaceExport(workspace), null, 2)}\n`;
}

export function parseWorkspaceImport(input) {
  let parsed;
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return { ok: false, error: 'INVALID_JSON', message: '导入文件不是合法 JSON。' };
  }

  const workspace = extractImportedWorkspace(parsed);
  if (!workspace) {
    return {
      ok: false,
      error: 'INVALID_WORKSPACE',
      message: '没有找到可导入的 workspace 数据。'
    };
  }

  const validation = validateWorkspaceShape(workspace);
  if (!validation.ok) return validation;

  return {
    ok: true,
    workspace,
    meta: {
      format: parsed?.format || '',
      schemaVersion: parsed?.schemaVersion || parsed?.version || null,
      exportedAt: parsed?.exportedAt || ''
    }
  };
}

export async function importWorkspace(workspace) {
  const validation = validateWorkspaceShape(workspace);
  if (!validation.ok) return validation;

  const currentRaw = safeGet(WORKSPACE_KEY);
  const recoveryKey = currentRaw ? createRecoverySnapshot(currentRaw, 'before-import') : '';
  await saveWorkspace(workspace);
  return { ok: true, recoveryKey };
}

function createRecoverySnapshot(raw, reason) {
  const key = `${RECOVERY_PREFIX}${Date.now()}`;
  const snapshot = JSON.stringify({
    version: 1,
    createdAt: new Date().toISOString(),
    reason,
    raw
  });
  safeSet(key, snapshot);
  return key;
}

function extractImportedWorkspace(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.format === EXPORT_FORMAT) return parsed.workspace;
  if (parsed.workspace && typeof parsed.workspace === 'object') return parsed.workspace;
  if ('trips' in parsed) return parsed;
  return null;
}

function validateWorkspaceShape(workspace) {
  if (!workspace || typeof workspace !== 'object') {
    return { ok: false, error: 'INVALID_WORKSPACE', message: 'workspace 必须是对象。' };
  }
  if (!Array.isArray(workspace.trips)) {
    return { ok: false, error: 'INVALID_TRIPS', message: 'workspace.trips 必须是数组。' };
  }
  if (workspace.trips.length > 3) {
    return { ok: false, error: 'TOO_MANY_TRIPS', message: '最多只能导入 3 条旅行路线。' };
  }
  return { ok: true };
}
