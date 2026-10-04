import type { CustomGroup, Item, Op } from './types';
import { byPos } from './util';

/** Groups are shared settings; old clients can preserve them without a new document kind. */
export function normalizeCustomGroups(value: unknown): CustomGroup[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const groups: CustomGroup[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const group = raw as Record<string, unknown>;
    if (typeof group.id !== 'string' || !group.id || seen.has(group.id) || typeof group.name !== 'string' || !group.name.trim()) continue;
    seen.add(group.id);
    groups.push({
      id: group.id, name: group.name.trim(), pos: typeof group.pos === 'string' ? group.pos : 'a0',
      ...(typeof group.color === 'string' ? { color: group.color } : {}),
    });
  }
  return groups.sort(byPos);
}

/** Assigning a group never changes an item's parent or manual position. */
export function groupAssignmentOps(items: readonly Pick<Item, 'id' | 'customGroup'>[], group: string | null): Op[] {
  return items.filter((item) => (item.customGroup ?? null) !== group)
    .map((item) => ({ kind: 'item', id: item.id, set: { customGroup: group } }));
}

/** Clear every reference when removing a group, including archived/hidden items. */
export function removeCustomGroupOps(groups: readonly CustomGroup[], items: readonly Item[], id: string): Op[] {
  if (!groups.some((group) => group.id === id)) return [];
  return [
    { kind: 'setting', id: 'custom-groups', set: { groups: groups.filter((group) => group.id !== id) } },
    ...groupAssignmentOps(items.filter((item) => item.customGroup === id), null),
  ];
}
