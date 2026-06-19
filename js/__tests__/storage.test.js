// js/__tests__/storage.test.js

import { beforeEach, describe, expect, it, vi } from 'vitest';

const PREFIX = 'trip-app:';

let store;
let storage;

beforeEach(async () => {
  store = new Map();
  globalThis.localStorage = {
    getItem: vi.fn(key => store.get(key) ?? null),
    setItem: vi.fn((key, value) => store.set(key, String(value))),
    removeItem: vi.fn(key => store.delete(key))
  };
  vi.resetModules();
  storage = await import('../storage.js');
});

describe('workspace storage reliability', () => {
  it('loads old schema workspace and creates recovery snapshot', async () => {
    const workspace = {
      trips: [{ id: 'trip-old', title: '旧行程', days: [], locations: {} }],
      activeTripId: 'trip-old'
    };
    store.set(
      `${PREFIX}workspace`,
      JSON.stringify({
        version: 3,
        savedAt: 1,
        workspace
      })
    );

    const loaded = await storage.loadWorkspace();
    const info = storage.getLastWorkspaceLoadInfo();

    expect(loaded).toEqual(workspace);
    expect(info.status).toBe('migrated');
    expect(info.fromVersion).toBe(3);
    expect(info.recoveryKey).toMatch(/^workspace-recovery:/);
    expect(store.has(`${PREFIX}${info.recoveryKey}`)).toBe(true);
    expect(store.has(`${PREFIX}workspace`)).toBe(true);
  });

  it('keeps a recovery snapshot when workspace JSON is broken', async () => {
    store.set(`${PREFIX}workspace`, '{not-json');

    const loaded = await storage.loadWorkspace();
    const info = storage.getLastWorkspaceLoadInfo();

    expect(loaded).toBeNull();
    expect(info.status).toBe('parse-error');
    expect(store.has(`${PREFIX}${info.recoveryKey}`)).toBe(true);
  });

  it('exports and parses workspace JSON', () => {
    const workspace = {
      trips: [{ id: 'trip-1', title: '测试行程', days: [], locations: {} }],
      activeTripId: 'trip-1'
    };

    const json = storage.stringifyWorkspaceExport(workspace);
    const parsed = storage.parseWorkspaceImport(json);

    expect(parsed.ok).toBe(true);
    expect(parsed.workspace).toEqual(workspace);
    expect(parsed.meta.format).toBe(storage.EXPORT_FORMAT);
    expect(parsed.meta.schemaVersion).toBe(storage.SCHEMA_VERSION);
  });

  it('rejects invalid import payload', () => {
    expect(storage.parseWorkspaceImport('{bad').error).toBe('INVALID_JSON');
    expect(storage.parseWorkspaceImport({ trips: 'nope' }).error).toBe('INVALID_TRIPS');
    expect(
      storage.parseWorkspaceImport({
        trips: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }]
      }).error
    ).toBe('TOO_MANY_TRIPS');
  });

  it('imports workspace and snapshots previous local data', async () => {
    await storage.saveWorkspace({
      trips: [{ id: 'old', title: '旧', days: [], locations: {} }],
      activeTripId: 'old'
    });

    const nextWorkspace = {
      trips: [{ id: 'new', title: '新', days: [], locations: {} }],
      activeTripId: 'new'
    };
    const result = await storage.importWorkspace(nextWorkspace);
    const loaded = await storage.loadWorkspace();

    expect(result.ok).toBe(true);
    expect(result.recoveryKey).toMatch(/^workspace-recovery:/);
    expect(store.has(`${PREFIX}${result.recoveryKey}`)).toBe(true);
    expect(loaded).toEqual(nextWorkspace);
  });
});
