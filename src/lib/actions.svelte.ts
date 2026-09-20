// Every change to the data goes through here, so each one can be undone.
import { db, model } from './model.svelte';
import { settings } from './settings.svelte';
import type { Doc, IconRef, Item, Op } from './types';
import { ui } from './ui.svelte';
import { shown, view } from './view.svelte';
import { keysBetween, newId, plural } from './util';
import { SWATCHES } from './palette';
import { uiIcons } from '../generated/ui-icons';

// ---------------------------------------------------------------- history

interface Entry {
  label: string;
  undo: Op[];
  redo: Op[];
}

class History {
  undoStack: Entry[] = $state([]);
  redoStack: Entry[] = $state([]);

  push(e: Entry) {
    this.undoStack.push(e);
    if (this.undoStack.length > 300) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return ui.toast('Nothing to undo');
    db.mutate(e.undo);
    this.redoStack.push(e);
    ui.toast(`Undid: ${e.label}`);
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return ui.toast('Nothing to redo');
    db.mutate(e.redo);
    this.undoStack.push(e);
    ui.toast(`Redid: ${e.label}`);
  }

  /** Undo one specific entry (from a toast), even if newer ones followed. */
  revert(e: Entry) {
    const i = this.undoStack.lastIndexOf(e);
    if (i === this.undoStack.length - 1) return this.undo();
    if (i >= 0) this.undoStack.splice(i, 1);
    db.mutate(e.undo);
  }
}

export const history = new History();

/** The ops that restore every touched field (and existence) to its current state. */
function invert(ops: Op[]): Op[] {
  const out = new Map<string, Op>();
  for (const op of ops) {
    const k = `${op.kind}:${op.id}`;
    let inv = out.get(k);
    const before = db.peek(op.kind, op.id);
    if (!inv) {
      inv = { kind: op.kind, id: op.id };
      out.set(k, inv);
    }
    if (!before || before.deleted) inv.del ??= true;
    else if (op.del !== undefined) inv.del ??= before.deleted;
    if (op.set) {
      inv.set ??= {};
      for (const f of Object.keys(op.set)) if (!(f in inv.set)) inv.set[f] = before?.data[f] ?? null;
    }
  }
  return [...out.values()];
}

interface CommitOptions {
  /** Show a toast with an Undo button. */
  toast?: string;
  history?: boolean;
}

export function commit(label: string, ops: Op[], opts: CommitOptions = {}) {
  if (!ops.length) return;
  for (const op of ops) {
    if (op.set && op.del === undefined) {
      const cur = db.peek(op.kind, op.id);
      if (!cur || cur.deleted) op.del = false; // creation: make redo restore existence too
    }
  }
  const entry: Entry = { label, undo: invert(ops), redo: ops };
  db.mutate(ops);
  if (opts.history !== false) history.push(entry);
  if (opts.toast) ui.toast(opts.toast, { label: 'Undo', run: () => history.revert(entry) });
}

/** Records an edit that was already applied live (title/note typing). */
export function recordEdit(label: string, undo: Op[], redo: Op[]) {
  history.push({ label, undo, redo });
}

// ---------------------------------------------------------------- positions

export type Where = 'start' | 'end' | { after: string } | { before: string };

const siblings = (parent: string | null, exclude?: Set<string>) =>
  (model.children.get(parent) ?? []).filter((s) => !exclude?.has(s.id));

/** `n` sort keys for inserting under `parent` at `where`, ignoring `exclude` (items being moved). */
export function positions(parent: string | null, where: Where, n = 1, exclude?: Set<string>): string[] {
  const sib = siblings(parent, exclude);
  if (where === 'end') return keysBetween(sib.at(-1)?.pos, null, n);
  if (where === 'start') return keysBetween(null, sib[0]?.pos, n);
  if ('after' in where) {
    const i = sib.findIndex((s) => s.id === where.after);
    if (i < 0) return keysBetween(sib.at(-1)?.pos, null, n);
    return keysBetween(sib[i].pos, sib[i + 1]?.pos, n);
  }
  const i = sib.findIndex((s) => s.id === where.before);
  if (i < 0) return keysBetween(null, sib[0]?.pos, n);
  return keysBetween(sib[i - 1]?.pos, sib[i].pos, n);
}

function defaultStatus(): string | null {
  const s = settings.behavior.defaultStatus;
  return s && db.statuses[s] ? s : null;
}

// ---------------------------------------------------------------- creating

export interface NewItem {
  title?: string;
  note?: string;
  status?: string | null;
  tags?: string[];
  children?: NewItem[];
}

function itemOps(parent: string | null, pos: string, it: NewItem, ops: Op[], ids: string[]) {
  const id = newId();
  ids.push(id);
  const status = it.status !== undefined ? it.status : defaultStatus();
  ops.push({
    kind: 'item',
    id,
    set: {
      parent,
      pos,
      title: it.title ?? '',
      note: it.note ?? '',
      status,
      tags: it.tags ?? [],
      hidden: false,
      archived: false,
      created: Date.now(),
      doneAt: status && model.doneStatuses.has(status) ? Date.now() : null,
    },
  });
  const kids = it.children ?? [];
  const keys = keysBetween(null, null, kids.length);
  kids.forEach((k, i) => itemOps(id, keys[i], k, ops, ids));
  return id;
}

/**
 * Adds items (with nested children) and returns the ids of the top-level ones.
 * `extra` ops (e.g. creating tags the items use) land in the same undo step.
 */
export function addItems(
  parent: string | null,
  where: Where,
  items: NewItem[],
  label = 'Add item',
  extra: Op[] = [],
): string[] {
  if (!items.length) return [];
  const keys = positions(parent, where, items.length);
  const ops: Op[] = [...extra];
  const all: string[] = [];
  const top = items.map((it, i) => itemOps(parent, keys[i], it, ops, all));
  commit(items.length === 1 && !items[0].children?.length ? label : `Add ${plural(all.length, 'item')}`, ops);
  if (parent) ui.setOpen(parent, true);
  ui.markFresh(all);
  return top;
}

export function addItem(parent: string | null, where: Where, it: NewItem = {}): string {
  return addItems(parent, where, [it])[0];
}

// ---------------------------------------------------------------- tags & statuses

let colorTurn = 0;
function nextColor() {
  const used = new Set(model.tagList.map((t) => t.color));
  const free = SWATCHES.filter((s) => !used.has(s.hex));
  const pool = free.length ? free : SWATCHES;
  return pool[colorTurn++ % pool.length].hex;
}

/** Ops creating a tag; returns its id. */
export function tagOps(name: string, ops: Op[], fields: { color?: string; icon?: IconRef | null } = {}): string {
  const id = newId();
  const [pos] = keysBetween(model.tagList.at(-1)?.pos, null, 1);
  ops.push({
    kind: 'tag',
    id,
    set: { name: name.trim(), color: fields.color ?? nextColor(), icon: fields.icon ?? null, pos },
  });
  return id;
}

export function createTag(name: string, fields: { color?: string; icon?: IconRef | null } = {}): string {
  const ops: Op[] = [];
  const id = tagOps(name, ops, fields);
  commit(`Create tag #${name}`, ops);
  return id;
}

export function createStatus(name: string, fields: Partial<{ color: string; icon: IconRef | null; done: boolean }> = {}) {
  const id = newId();
  const [pos] = keysBetween(model.statusList.at(-1)?.pos, null, 1);
  commit(`Create status ${name}`, [
    {
      kind: 'status',
      id,
      set: {
        name,
        color: fields.color ?? SWATCHES[(model.statusList.length * 5) % SWATCHES.length].hex,
        icon: fields.icon ?? null,
        done: fields.done ?? false,
        pos,
      },
    },
  ]);
  return id;
}

export type EntityKind = 'status' | 'tag' | 'view' | 'template';

export function updateEntity(kind: EntityKind, id: string, set: Doc, label = `Edit ${kind}`) {
  commit(label, [{ kind, id, set }]);
}

export function reorderEntity(kind: EntityKind, id: string, before: string | null) {
  const list: { id: string; pos: string }[] =
    kind === 'status' ? model.statusList : kind === 'tag' ? model.tagList : kind === 'view' ? model.viewList : model.templateList;
  const rest = list.filter((e) => e.id !== id);
  const i = before ? rest.findIndex((e) => e.id === before) : rest.length;
  const [pos] = keysBetween(rest[i - 1]?.pos, rest[i]?.pos, 1);
  commit(`Reorder ${kind}`, [{ kind, id, set: { pos } }]);
}

/** Deletes a status, tag, view or template (statuses and tags are also cleared from items). */
export function deleteEntity(kind: EntityKind, id: string) {
  const ops: Op[] = [{ kind, id, del: true }];
  if (kind === 'view' || kind === 'template') {
    const name = (kind === 'view' ? db.views[id]?.name : db.templates[id]?.name) ?? kind;
    return commit(`Delete ${kind} ${name}`, ops, { toast: `Deleted ${name}` });
  }
  for (const it of Object.values(db.items)) {
    if (kind === 'status' && (it.status === id || it.prevStatus === id)) {
      ops.push({
        kind: 'item',
        id: it.id,
        set: { status: it.status === id ? null : it.status, prevStatus: it.prevStatus === id ? null : it.prevStatus },
      });
    }
    if (kind === 'tag' && it.tags.includes(id)) {
      ops.push({ kind: 'item', id: it.id, set: { tags: it.tags.filter((t) => t !== id) } });
    }
  }
  if (kind === 'status' && settings.behavior.defaultStatus === id) {
    ops.push({ kind: 'setting', id: 'behavior', set: { defaultStatus: null } });
  }
  const name = kind === 'status' ? db.statuses[id]?.name : `#${db.tags[id]?.name}`;
  ui.filterStatus.delete(id);
  ui.filterTags.delete(id);
  commit(`Delete ${kind} ${name}`, ops, { toast: `Deleted ${name}` });
}

// ---------------------------------------------------------------- item fields

const items = (ids: Iterable<string>) => [...ids].map((id) => db.items[id]).filter(Boolean) as Item[];

export function statusChange(it: Item, status: string | null): Doc {
  const wasDone = model.isDone(it);
  const willBeDone = !!status && model.doneStatuses.has(status);
  const set: Doc = { status };
  if (willBeDone && !wasDone) {
    set.doneAt = Date.now();
    set.prevStatus = it.status;
  } else if (!willBeDone && wasDone) {
    set.doneAt = null;
  }
  return set;
}

export function setStatus(ids: Iterable<string>, status: string | null) {
  const list = items(ids).filter((it) => it.status !== status);
  const name = status ? db.statuses[status]?.name : 'no status';
  commit(
    `Set ${name}`,
    list.map((it) => ({ kind: 'item', id: it.id, set: statusChange(it, status) })),
    list.length > 1 ? { toast: `${plural(list.length, 'item')} → ${name}` } : {},
  );
}

/** Marks items done, or — if all of them already are — puts them back to their previous status. */
export function toggleDone(ids: Iterable<string>) {
  const list = items(ids);
  if (!list.length) return;
  const done = model.statusList.find((s) => s.done);
  if (!done) return ui.toast('Mark one of your statuses as “done” in Settings first');
  const allDone = list.every((it) => model.isDone(it));
  const ops: Op[] = [];
  for (const it of list) {
    if (allDone) {
      const back = it.prevStatus && db.statuses[it.prevStatus] && !model.doneStatuses.has(it.prevStatus)
        ? it.prevStatus
        : defaultStatus();
      ops.push({ kind: 'item', id: it.id, set: statusChange(it, back) });
    } else if (!model.isDone(it)) {
      ops.push({ kind: 'item', id: it.id, set: statusChange(it, done.id) });
    }
  }
  commit(allDone ? 'Mark not done' : 'Mark done', ops);
}

/** Moves each item to the next status in order (wrapping to none). */
export function cycleStatus(ids: Iterable<string>, dir = 1) {
  const order: (string | null)[] = [null, ...model.statusList.map((s) => s.id)];
  const ops: Op[] = items(ids).map((it) => {
    const i = order.indexOf(it.status);
    const next = order[(i + dir + order.length) % order.length];
    return { kind: 'item', id: it.id, set: statusChange(it, next) };
  });
  commit('Change status', ops);
}

/** Adds the tag to all items, or removes it if every item already has it. */
export function toggleTag(ids: Iterable<string>, tag: string) {
  const list = items(ids);
  const all = list.every((it) => it.tags.includes(tag));
  setTag(list.map((it) => it.id), tag, !all);
}

export function setTag(ids: Iterable<string>, tag: string, on: boolean) {
  const ops: Op[] = [];
  for (const it of items(ids)) {
    const has = it.tags.includes(tag);
    if (on && !has) ops.push({ kind: 'item', id: it.id, set: { tags: [...it.tags, tag] } });
    if (!on && has) ops.push({ kind: 'item', id: it.id, set: { tags: it.tags.filter((t) => t !== tag) } });
  }
  const name = `#${db.tags[tag]?.name ?? 'tag'}`;
  commit(on ? `Tag ${name}` : `Untag ${name}`, ops, ops.length > 1 ? { toast: `${on ? 'Tagged' : 'Untagged'} ${plural(ops.length, 'item')} ${name}` } : {});
}

export function setHidden(ids: Iterable<string>, hidden: boolean) {
  const list = model.topmost(ids).filter((id) => db.items[id].hidden !== hidden);
  if (!list.length) return;
  commit(
    hidden ? 'Hide' : 'Unhide',
    list.map((id) => ({ kind: 'item', id, set: { hidden } })),
    { toast: hidden ? (ui.showHidden ? `Hid ${plural(list.length, 'item')}` : `Hid ${plural(list.length, 'item')} · shown again with “Show hidden”`) : `Unhid ${plural(list.length, 'item')}` },
  );
  if (hidden && !ui.showHidden) dropFromSelection(list);
}

export function setArchived(ids: Iterable<string>, archived: boolean) {
  const list = model.topmost(ids).filter((id) => db.items[id].archived !== archived);
  if (!list.length) return;
  commit(
    archived ? 'Archive' : 'Restore from archive',
    list.map((id) => ({ kind: 'item', id, set: { archived, archivedAt: archived ? Date.now() : null } })),
    { toast: archived ? `Archived ${plural(list.length, 'item')}` : `Restored ${plural(list.length, 'item')}` },
  );
  dropFromSelection(list);
}

export function deleteItems(ids: Iterable<string>) {
  const tops = model.topmost(ids);
  if (!tops.length) return;
  const all = [...new Set(tops.flatMap((id) => model.subtree(id)))];
  const run = () => {
    commit(
      `Delete ${plural(all.length, 'item')}`,
      all.map((id) => ({ kind: 'item', id, del: true })),
      { toast: `Deleted ${plural(all.length, 'item')}` },
    );
    dropFromSelection(all);
  };
  if (settings.behavior.confirmDelete) {
    ui.confirm = { text: `Delete ${plural(all.length, 'item')}? You can undo right after.`, action: 'Delete', run };
  } else run();
}

function dropFromSelection(ids: string[]) {
  for (const id of ids) ui.selection.delete(id);
  if (ui.cursor && ids.includes(ui.cursor)) ui.cursor = null;
}

export function duplicateItems(ids: Iterable<string>) {
  const tops = view.ordered(model.topmost(ids));
  const clone = (id: string): NewItem => {
    const it = db.items[id];
    return {
      title: it.title,
      note: it.note,
      status: it.status,
      tags: [...it.tags],
      children: (model.children.get(id) ?? []).filter((c) => !c.archived).map((c) => clone(c.id)),
    };
  };
  const created: string[] = [];
  for (const id of tops) created.push(...addItems(model.parentOf(id), { after: id }, [clone(id)], 'Duplicate'));
  return created;
}

// ---------------------------------------------------------------- structure

/** Visible siblings (plus the ones being acted on, even if they'd be filtered). */
function shownSiblings(parent: string | null, keep: Set<string>) {
  return siblings(parent).filter((s) => keep.has(s.id) || shown(s));
}

/** Each item becomes the last child of the nearest visible sibling above it. */
export function indent(ids: Iterable<string>) {
  const set = new Set(model.topmost(ids));
  const byTarget = new Map<string, Item[]>();
  for (const id of view.ordered(set)) {
    const it = db.items[id];
    const sib = shownSiblings(model.parentOf(id), set);
    let target: Item | undefined;
    for (let i = sib.indexOf(it) - 1; i >= 0; i--) {
      if (!set.has(sib[i].id)) {
        target = sib[i];
        break;
      }
    }
    if (!target) continue;
    const list = byTarget.get(target.id) ?? [];
    list.push(it);
    byTarget.set(target.id, list);
  }
  const ops: Op[] = [];
  for (const [target, list] of byTarget) {
    const keys = positions(target, 'end', list.length, set);
    list.forEach((it, i) => ops.push({ kind: 'item', id: it.id, set: { parent: target, pos: keys[i] } }));
    ui.setOpen(target, true);
  }
  commit('Indent', ops);
}

/** Each item moves out one level, landing right after its old parent. */
export function outdent(ids: Iterable<string>) {
  const set = new Set(model.topmost(ids));
  const byParent = new Map<string, Item[]>();
  for (const id of view.ordered(set)) {
    const p = model.parentOf(id);
    if (!p || p === ui.zoom) continue;
    const list = byParent.get(p) ?? [];
    list.push(db.items[id]);
    byParent.set(p, list);
  }
  const ops: Op[] = [];
  for (const [p, list] of byParent) {
    const gp = model.parentOf(p);
    const keys = positions(gp, { after: p }, list.length, set);
    list.forEach((it, i) => ops.push({ kind: 'item', id: it.id, set: { parent: gp, pos: keys[i] } }));
  }
  commit('Outdent', ops);
}

/** Moves items one visible slot up or down among their siblings. */
export function shift(ids: Iterable<string>, dir: -1 | 1) {
  const set = new Set(model.topmost(ids));
  const byParent = new Map<string | null, Item[]>();
  for (const id of set) {
    const p = model.parentOf(id);
    const list = byParent.get(p) ?? [];
    list.push(db.items[id]);
    byParent.set(p, list);
  }
  const ops: Op[] = [];
  for (const [p, list] of byParent) {
    const sib = shownSiblings(p, set);
    const idx = list.map((it) => sib.indexOf(it)).sort((a, b) => a - b);
    const ordered = idx.map((i) => sib[i]);
    const edge = dir < 0 ? idx[0] - 1 : idx[idx.length - 1] + 1;
    const neighbor = sib[edge];
    if (!neighbor) continue;
    const keys = positions(p, dir < 0 ? { before: neighbor.id } : { after: neighbor.id }, ordered.length, set);
    ordered.forEach((it, i) => ops.push({ kind: 'item', id: it.id, set: { pos: keys[i] } }));
  }
  commit(dir < 0 ? 'Move up' : 'Move down', ops);
}

/** Moves items under `parent` at `where`, keeping their on-screen order. Refuses cycles. */
export function moveTo(ids: Iterable<string>, parent: string | null, where: Where = 'end', label = 'Move') {
  const tops = view.ordered(model.topmost(ids)).filter(
    (id) => id !== parent && !(parent && model.isAncestor(id, parent)),
  );
  if (!tops.length) return;
  const set = new Set(tops);
  const keys = positions(parent, where, tops.length, set);
  commit(
    label,
    tops.map((id, i) => ({ kind: 'item', id, set: { parent, pos: keys[i] } })),
  );
  if (parent) ui.setOpen(parent, true);
}

// ---------------------------------------------------------------- first run

export function seed() {
  const icon = (n: string): IconRef => ({ k: 'ti', n, s: uiIcons[n] });
  const ops: Op[] = [
    { kind: 'status', id: 'st-idea', set: { name: 'Idea', icon: icon('bulb'), color: '#a855f7', pos: 'a0', done: false } },
    { kind: 'status', id: 'st-todo', set: { name: 'To do', icon: icon('circle'), color: '#64748b', pos: 'a1', done: false } },
    { kind: 'status', id: 'st-doing', set: { name: 'In progress', icon: icon('progress'), color: '#3b82f6', pos: 'a2', done: false } },
    { kind: 'status', id: 'st-blocked', set: { name: 'Blocked', icon: icon('hand-stop'), color: '#ef4444', pos: 'a3', done: false } },
    { kind: 'status', id: 'st-done', set: { name: 'Done', icon: icon('circle-check'), color: '#22c55e', pos: 'a4', done: true } },
    { kind: 'tag', id: 'tg-urgent', set: { name: 'urgent', icon: icon('flame'), color: '#f43f5e', pos: 'a0' } },
    { kind: 'tag', id: 'tg-waiting', set: { name: 'waiting', icon: icon('hourglass'), color: '#f59e0b', pos: 'a1' } },
    { kind: 'tag', id: 'tg-personal', set: { name: 'personal', icon: icon('heart'), color: '#ec4899', pos: 'a2' } },
    { kind: 'setting', id: 'app', set: { seeded: true } },
  ];
  const welcome: [string, string | null, string[], string][] = [
    ['Type in the box above and press Enter — #tags and @status work as you type', 'st-done', [], ''],
    ['While editing a row: Enter adds the next one, Tab / Shift+Tab nests it', 'st-doing', [], ''],
    ['Click the status icon to change it · Ctrl+Enter toggles done · Alt+1…9 picks one', 'st-todo', [], ''],
    ['Shift+Enter opens a note under any item', null, [], 'Notes support **markdown**, links and\n\n- [ ] checklists\n- [x] like this one'],
    ['Select several (Ctrl+click, Shift+click, or long-press on the phone) to edit them together', 'st-idea', ['tg-urgent'], ''],
    ['Hide keeps an item in place but out of sight; Archive files it away', null, ['tg-waiting'], ''],
    ['Ctrl+K runs any command · ? lists every shortcut · Settings has themes, fonts and more', null, [], ''],
  ];
  const now = Date.now();
  ops.push({
    kind: 'item',
    id: 'welcome',
    set: {
      parent: null, pos: 'a0', title: 'Welcome to Arbor 🌳', note: 'Archive or delete this when you’re done exploring.',
      status: 'st-doing', tags: [], hidden: false, archived: false, created: now,
    },
  });
  const keys = keysBetween(null, null, welcome.length);
  welcome.forEach(([title, status, tags, note], i) =>
    ops.push({
      kind: 'item',
      id: `welcome-${i}`,
      set: {
        parent: 'welcome', pos: keys[i], title, note, status, tags, hidden: false, archived: false, created: now,
        doneAt: status === 'st-done' ? now : null,
      },
    }),
  );
  db.mutate(ops);
}

// ---------------------------------------------------------------- import / export

export function exportData() {
  return {
    app: 'arbor',
    version: 1,
    exported: new Date().toISOString(),
    items: Object.values(db.items).map((it) => ({ ...it })),
    statuses: Object.values(db.statuses).map((s) => ({ ...s })),
    tags: Object.values(db.tags).map((t) => ({ ...t })),
    settings: Object.fromEntries(Object.entries(db.settings).map(([k, v]) => [k, { ...v }])),
  };
}

export function importData(data: ReturnType<typeof exportData>, replace: boolean) {
  if (data?.app !== 'arbor') throw new Error('This is not an Arbor export');
  const ops: Op[] = [];
  const add = (kind: Op['kind'], list: { id: string }[] | undefined) => {
    for (const { id, ...rest } of list ?? []) ops.push({ kind, id, set: rest as Doc, del: false });
  };
  if (replace) {
    const keep = new Set([...(data.items ?? []), ...(data.statuses ?? []), ...(data.tags ?? [])].map((e) => e.id));
    for (const it of Object.values(db.items)) if (!keep.has(it.id)) ops.push({ kind: 'item', id: it.id, del: true });
    for (const s of Object.values(db.statuses)) if (!keep.has(s.id)) ops.push({ kind: 'status', id: s.id, del: true });
    for (const t of Object.values(db.tags)) if (!keep.has(t.id)) ops.push({ kind: 'tag', id: t.id, del: true });
  }
  add('item', data.items);
  add('status', data.statuses);
  add('tag', data.tags);
  for (const [id, doc] of Object.entries(data.settings ?? {})) ops.push({ kind: 'setting', id, set: doc as Doc });
  commit(replace ? 'Replace everything with import' : 'Import', ops, {
    toast: `Imported ${plural(data.items?.length ?? 0, 'item')}`,
  });
}
