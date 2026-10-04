import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Op } from './types';

const storage = vi.hoisted(() => ({ value: undefined as unknown, writes: [] as unknown[] }));
vi.mock('./idb', () => ({
  idbGet: vi.fn(async () => storage.value),
  idbSet: vi.fn((_key: string, value: unknown) => {
    // Real IndexedDB uses this algorithm and rejects nested Proxy values.
    storage.value = structuredClone(value);
    storage.writes.push(storage.value);
    return Promise.resolve();
  }),
}));
import { Replica } from './replica.svelte';

beforeEach(() => {
  vi.useFakeTimers();
  storage.value = undefined;
  storage.writes = [];
  vi.stubGlobal('addEventListener', vi.fn());
  vi.stubGlobal('document', { addEventListener: vi.fn() });
  vi.stubGlobal('navigator', {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('local replica durability', () => {
  it('saves a clone-safe view synchronously and restores it before the debounce could run', async () => {
    const replica = new Replica();
    const icon = new Proxy({ k: 'emoji', n: '🌿' }, {});
    const filter = new Proxy({ sort: 'created', sortDirection: 'desc', group: 'tag' }, {});
    replica.mutate([{ kind: 'view', id: 'saved', set: { name: 'My view', icon, filter } }]);
    expect(storage.writes).toHaveLength(1);
    const reloaded = new Replica();
    vi.spyOn(reloaded, 'reconnect').mockImplementation(() => {});
    await reloaded.start();
    expect(reloaded.views.saved).toMatchObject({
      name: 'My view', icon: { k: 'emoji', n: '🌿' },
      filter: { sort: 'created', sortDirection: 'desc', group: 'tag' },
    });
    expect(reloaded.pendingCount).toBe(1);
  });

  it('persists merged queued edits and the latest undo before timers run', async () => {
    const replica = new Replica();
    replica.mutate([{ kind: 'item', id: 'item', set: { title: 'First', pinned: false } }]);
    replica.mutate([{ kind: 'item', id: 'item', set: { title: 'Second', pinned: true } }]);
    replica.mutate([{ kind: 'item', id: 'item', set: { pinned: false } }]);
    const persisted = storage.value as { pending: Op[] };
    expect(persisted.pending).toEqual([{ kind: 'item', id: 'item', set: { title: 'Second', pinned: false } }]);
    const reloaded = new Replica();
    vi.spyOn(reloaded, 'reconnect').mockImplementation(() => {});
    await reloaded.start();
    expect(reloaded.items.item.title).toBe('Second');
    expect(reloaded.items.item.pinned).toBe(false);
  });

  it('keeps named group assignments, group settings, and custom group views through reload', async () => {
    const replica = new Replica();
    replica.mutate([
      { kind: 'setting', id: 'custom-groups', set: { groups: [{ id: 'class', name: 'Class', pos: 'a0' }] } },
      { kind: 'item', id: 'item', set: { title: 'Lecture', customGroup: 'class' } },
      { kind: 'view', id: 'grouped', set: { name: 'Class view', filter: { group: 'custom' } } },
    ]);
    const reloaded = new Replica();
    vi.spyOn(reloaded, 'reconnect').mockImplementation(() => {});
    await reloaded.start();
    expect(reloaded.items.item.customGroup).toBe('class');
    expect(reloaded.settings['custom-groups'].groups).toEqual([{ id: 'class', name: 'Class', pos: 'a0' }]);
    expect(reloaded.views.grouped.filter.group).toBe('custom');
  });
});
