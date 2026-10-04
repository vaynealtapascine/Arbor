import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('IndexedDB persistence scheduling', () => {
  it('begins a warmed write transaction before the caller can reload the page', async () => {
    const writes: [string, unknown][] = [];
    const database = {
      onversionchange: null,
      close: vi.fn(),
      transaction: vi.fn(() => {
        const tx = {
          oncomplete: null as (() => void) | null,
          onerror: null,
          onabort: null,
          objectStore: () => ({ put: (value: unknown, key: string) => writes.push([key, structuredClone(value)]) }),
        };
        queueMicrotask(() => tx.oncomplete?.());
        return tx;
      }),
    };
    const open = vi.fn(() => {
      const request = { result: database, onsuccess: null as (() => void) | null };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    });
    vi.stubGlobal('indexedDB', { open });
    const { idbSet } = await import('./idb');
    await idbSet('replica', { pending: [] });
    const done = idbSet('replica', { pending: [{ id: 'saved-view' }] });
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(['replica', { pending: [{ id: 'saved-view' }] }]);
    expect(open).toHaveBeenCalledTimes(1);
    await done;
  });
});
