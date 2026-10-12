// Turns typed or pasted text into items, creating any new #tags on the way.
import { addItems, statusChange, tagPathOps, type NewItem, type Where } from './actions.svelte';
import { customGroupOps } from './groups';
import { db, model } from './model.svelte';
import { isMultiline, parseEntry, parseOutline, type OutlineNode } from './parse';
import type { Doc, Op } from './types';
import { fold } from './util';

export interface Resolved {
  title: string;
  note: string;
  status?: string;
  tags: string[];
  group?: string | null;
}

/** Parses one line, appending tag/group-creation ops to `ops` (shared `created` avoids duplicates). */
export function resolveEntry(
  text: string,
  ops: Op[],
  created = new Map<string, string>(),
  createdGroups = new Map<string, string>(),
): Resolved {
  const p = parseEntry(text, model.statusList, model.tagList, model.customGroups);
  const tags = [...p.tagIds];
  for (const name of p.newTags) {
    // `#work/client` creates whichever of the two does not exist yet.
    const id = created.get(fold(name)) ?? tagPathOps(name, ops, created);
    if (id && !tags.includes(id)) tags.push(id);
  }
  let group = p.group;
  if (!group && p.newGroup) {
    group = createdGroups.get(fold(p.newGroup)) ?? customGroupOps(p.newGroup, ops, createdGroups);
  }
  return { title: p.title, note: p.note, status: p.status, tags, group };
}

/** Adds one item per line of `text` (nested if it's an indented/bulleted outline). */
export function addFromText(parent: string | null, where: Where, text: string, customGroup?: string | null): string[] {
  const ops: Op[] = [];
  const created = new Map<string, string>();
  const createdGroups = new Map<string, string>();
  const done = model.statusList.find((s) => s.done)?.id;
  let items: NewItem[];
  if (isMultiline(text)) {
    const convert = (n: OutlineNode, parentGroup?: string | null): NewItem => {
      const e = resolveEntry(n.text, ops, created, createdGroups);
      const itemGroup = e.group !== undefined ? e.group : parentGroup;
      return {
        title: e.title,
        note: [e.note, n.note].filter(Boolean).join('\n'),
        status: n.done && done ? done : e.status,
        tags: e.tags,
        customGroup: itemGroup,
        children: n.children.map((c) => convert(c, itemGroup)),
      };
    };
    items = parseOutline(text).map((n) => convert(n, customGroup));
  } else {
    const e = resolveEntry(text, ops, created, createdGroups);
    if (!e.title && !e.note && !e.tags.length && !e.status && !e.group) return [];
    items = [{
      title: e.title,
      note: e.note,
      status: e.status,
      tags: e.tags,
      customGroup: e.group !== undefined ? e.group : customGroup,
    }];
  }
  return addItems(parent, where, items, 'Add item', ops);
}

/**
 * Applies inline syntax typed into an existing item's title: strips the tokens
 * and sets the tags/status/note/group they name. Returns the ops, or [] if nothing to do.
 */
export function entryOpsForItem(id: string, text: string): Op[] {
  const it = db.items[id];
  if (!it) return [];
  const ops: Op[] = [];
  const e = resolveEntry(text, ops);
  const set: Doc = {};
  if (e.title !== it.title) set.title = e.title;
  const tags = [...it.tags, ...e.tags.filter((t) => !it.tags.includes(t))];
  if (tags.length !== it.tags.length) set.tags = tags;
  if (e.status !== undefined && e.status !== it.status) Object.assign(set, statusChange(it, e.status));
  if (e.group !== undefined && e.group !== it.customGroup) set.customGroup = e.group;
  if (e.note) set.note = it.note ? `${it.note}\n\n${e.note}` : e.note;
  if (Object.keys(set).length) ops.push({ kind: 'item', id, set });
  return ops;
}
