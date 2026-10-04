import { describe, expect, it } from 'vitest';
import { groupAssignmentOps, normalizeCustomGroups, removeCustomGroupOps } from './custom-groups';
import type { Item } from './types';

describe('custom groups', () => {
  const groups = [{ id: 'later', name: 'Later', pos: 'a1' }, { id: 'now', name: 'Now', pos: 'a0' }];
  it('normalizes legacy/malformed groups and keeps manual group order', () => {
    expect(normalizeCustomGroups(undefined)).toEqual([]);
    expect(normalizeCustomGroups([null, ...groups, { ...groups[0], name: 'Duplicate' }, { id: 'bad', name: '' }]))
      .toEqual([groups[1], groups[0]]);
  });
  it('assigns only changed membership and preserves parent/position fields', () => {
    expect(groupAssignmentOps([{ id: 'a', customGroup: 'now' }, { id: 'b' }], 'now'))
      .toEqual([{ kind: 'item', id: 'b', set: { customGroup: 'now' } }]);
    expect(groupAssignmentOps([{ id: 'a', customGroup: null }, { id: 'b' }], null)).toEqual([]);
  });
  it('removing a group leaves its items intact and clears hidden/archive assignments', () => {
    const base: Item = { id: '', parent: null, pos: 'a0', title: '', note: '', status: null, tags: [],
      hidden: false, archived: false, archivedAt: null, created: 0, doneAt: null, prevStatus: null };
    const items: Item[] = [
      { ...base, id: 'a', customGroup: 'now', hidden: true },
      { ...base, id: 'b', customGroup: 'now', archived: true },
      { ...base, id: 'c', customGroup: 'later' },
    ];
    expect(removeCustomGroupOps(groups, items, 'now')).toEqual([
      { kind: 'setting', id: 'custom-groups', set: { groups: [groups[0]] } },
      { kind: 'item', id: 'a', set: { customGroup: null } },
      { kind: 'item', id: 'b', set: { customGroup: null } },
    ]);
    expect(removeCustomGroupOps(groups, items, 'missing')).toEqual([]);
  });
});
