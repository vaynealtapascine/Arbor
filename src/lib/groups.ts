import { commit } from './actions.svelte';
import { groupAssignmentOps, removeCustomGroupOps } from './custom-groups';
import { db, model } from './model.svelte';
import { SWATCHES } from './palette';
import type { CustomGroup, Item, Op } from './types';
import { ui } from './ui.svelte';
import { fold, keysBetween, newId, plural } from './util';

function showGroups() {
  ui.group = 'custom';
  ui.persist();
}

/** Optionally create and assign in one undo step. */
export function createCustomGroup(written: string, ids: Iterable<string> = []): string {
  const name = written.trim();
  if (!name) return '';
  const existing = model.customGroups.find((group) => fold(group.name) === fold(name));
  if (existing) {
    setCustomGroup(ids, existing.id);
    showGroups();
    return existing.id;
  }
  const id = newId();
  const [pos] = keysBetween(model.customGroups.at(-1)?.pos, null, 1);
  const group: CustomGroup = { id, name, pos, color: SWATCHES[(model.customGroups.length * 7 + 9) % SWATCHES.length].hex };
  const items = [...new Set(ids)].map((itemId) => db.items[itemId]).filter((item): item is Item => !!item);
  const ops: Op[] = [
    { kind: 'setting', id: 'custom-groups', set: { groups: [...model.customGroups, group] } },
    ...groupAssignmentOps(items, id),
  ];
  commit(`Create group ${name}`, ops, { toast: `Created group “${name}”` });
  showGroups();
  return id;
}

export function setCustomGroup(ids: Iterable<string>, group: string | null) {
  if (group && !model.customGroups.some((entry) => entry.id === group)) return;
  const items = [...new Set(ids)].map((id) => db.items[id]).filter((item): item is Item => !!item);
  const ops = groupAssignmentOps(items, group);
  const name = model.customGroups.find((entry) => entry.id === group)?.name ?? 'Ungrouped';
  commit(`Move to group ${name}`, ops, { toast: `Moved ${plural(ops.length, 'item')} to ${name}` });
  showGroups();
}

export function renameCustomGroup(id: string, written: string): boolean {
  const name = written.trim();
  const group = model.customGroups.find((entry) => entry.id === id);
  if (!group || !name) return false;
  if (model.customGroups.some((entry) => entry.id !== id && fold(entry.name) === fold(name))) {
    ui.toast('A group with that name already exists', undefined, 'error');
    return false;
  }
  if (group.name !== name) commit('Rename group', [
    { kind: 'setting', id: 'custom-groups', set: { groups: model.customGroups.map((entry) => entry.id === id ? { ...entry, name } : entry) } },
  ], { toast: `Renamed group to “${name}”` });
  return true;
}

export function deleteCustomGroup(id: string) {
  const group = model.customGroups.find((entry) => entry.id === id);
  if (!group) return;
  commit(`Remove group ${group.name}`, removeCustomGroupOps(model.customGroups, Object.values(db.items), id),
    { toast: `Removed group “${group.name}” · items are now ungrouped` });
}

export function reorderCustomGroup(id: string, direction: -1 | 1) {
  const list = model.customGroups;
  const index = list.findIndex((group) => group.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return;
  const rest = list.filter((group) => group.id !== id);
  const [pos] = keysBetween(rest[target - 1]?.pos, rest[target]?.pos, 1);
  commit('Reorder groups', [{ kind: 'setting', id: 'custom-groups', set: {
    groups: list.map((group) => group.id === id ? { ...group, pos } : group),
  } }]);
}
