import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractGuideText } from '../api/guide-import.js';
import { buildGuideDraft } from '../guide-import-flow.js';
import { setAMap } from '../state.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('guide import cancellation', () => {
  it('passes cancellation to the extraction request', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options) => {
        expect(options.signal).toBe(controller.signal);
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true
          });
        });
      })
    );

    const pending = extractGuideText({
      text: '旅行攻略',
      cityHint: '上海',
      signal: controller.signal
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not continue from an already cancelled draft build', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      buildGuideDraft(
        { events: [{ place_name: '外滩' }], warnings: [] },
        { text: '', cityHint: '上海' },
        vi.fn(),
        controller.signal
      )
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('aborts an in-flight place matching request when the draft build is cancelled', async () => {
    const controller = new AbortController();
    let requestSignal = null;
    setAMap({});
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('document', { getElementById: () => null });
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options) => {
        requestSignal = options.signal;
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal.reason), {
            once: true
          });
        });
      })
    );

    const pending = buildGuideDraft(
      { events: [{ place_name: '外滩' }], warnings: [] },
      { text: '', cityHint: '上海' },
      vi.fn(),
      controller.signal
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    expect(requestSignal).toBe(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
