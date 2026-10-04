// The rows the outline currently shows: tree order, collapse state, zoom and filters applied.
import { db, model } from './model.svelte';
import { arrangeItems, groupForItem, type GroupLabel } from './arrangement';
import { findStatus, findTag } from './parse';
import { queryMatcher, type Resolver } from './query';
import { tagsMatch } from './tags';
import type { Item, ItemGroup } from './types';
import { ui } from './ui.svelte';
import { fold } from './util';

export interface Row {
  id: string;
  depth: number;
  /** Shown children. */
  kids: number;
  /** Shown children in a done status. */
  doneKids: number;
  /** Included only as the ancestor of a filter match. */
  context: boolean;
}

export interface Section extends GroupLabel {
  /** Unique collapse key: parent + grouping mode + group id. */
  key: string;
  groupId: string | null;
  mode: ItemGroup;
  parent: string | null;
  depth: number;
  count: number;
  open: boolean;
}

export type OutlineEntry =
  | { kind: 'row'; key: string; row: Row }
  | { kind: 'section'; key: string; section: Section };

/** Whether an item appears in the outline with the current toggles (ignores search/filters). */
export function shown(it: Item): boolean {
  return !it.archived && (ui.showHidden || !it.hidden) && !(ui.hideDone && model.isDone(it));
}

export interface Criteria {
  search: string;
  statuses: Iterable<string>;
  tags: Iterable<string>;
  tagMode: 'any' | 'all';
}

/** How the names written in a search resolve against what exists right now. */
export const resolver: Resolver = {
  tags(written) {
    const tag = findTag(written, model.tagList, model.tags.paths);
    if (tag) return model.tagFamily(tag.id);
    // "#none" means untagged, unless a tag is actually called that.
    return fold(written) === 'none' ? [] : null;
  },
  status(written) {
    const st = findStatus(written, model.statusList);
    if (st) return st.id;
    return fold(written) === 'none' ? 'none' : null;
  },
  // The whole path, so searching a parent's name finds what is under it.
  path: (id) => model.tagPath(id) || db.tags[id]?.name || '',
  statusName: (id) => db.statuses[id]?.name ?? '',
  flag(word) {
    // "Done" is a property several statuses can have, so it is not @done.
    if (word === 'is:done') return (it) => model.isDone(it);
    if (word === 'has:note') return (it) => it.note.trim() !== '';
    if (word === 'is:pinned') return (it) => it.pinned === true;
    return null;
  },
};

/** A predicate for the search box + the status/tag filter chips ('none' = no status). */
export function matcherFor(c: Criteria) {
  const statuses = new Set(c.statuses);
  // Filtering by a tag means the tag or anything nested under it.
  const families = [...c.tags].map((id) => model.tagFamily(id));
  const search = queryMatcher(c.search, resolver);
  return (it: Item) => {
    if (statuses.size && !statuses.has(it.status ?? 'none')) return false;
    if (!tagsMatch(it.tags, families, c.tagMode)) return false;
    return search(it);
  };
}

const matcher = () =>
  matcherFor({ search: ui.search, statuses: ui.filterStatus, tags: ui.filterTags, tagMode: ui.tagMode });

const catalog = () => ({ statuses: model.statusList, tags: model.tagTree.map((node) => node.tag), customGroups: model.customGroups, tagLabel: (id: string) => model.tagPath(id) });

/** The current section key, also used to keep custom-order drops inside their section. */
export function groupKeyForItem(it: Item): string {
  return groupForItem(it, ui.group, catalog())?.key ?? '';
}

function outlineEntries(): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const root = ui.zoom && db.items[ui.zoom] ? ui.zoom : null;
  const kidsOf = (id: string | null) => (model.children.get(id) ?? []).filter(shown);

  // Filtering: show matches with their ancestors for context, expanded.
  const matches = matcher();
  const include = new Map<string, boolean>();
  const scan = (parent: string | null): boolean => {
    let any = false;
    for (const it of kidsOf(parent)) {
      // A newly added row can be blank while search/filters are active. Keep
      // its editor and ancestors visible until the edit is finished.
      const self = matches(it) || ui.editing?.id === it.id;
      const below = scan(it.id);
      if (self || below) {
        include.set(it.id, self);
        any = true;
      }
    }
    return any;
  };
  if (ui.filtering) scan(root);
  const walk = (parent: string | null, depth: number) => {
    const siblings = kidsOf(parent).filter((it) => !ui.filtering || include.has(it.id));
    const sections = arrangeItems(siblings, { sort: ui.sort, sortDirection: ui.sortDirection, group: ui.group }, catalog(), depth === 0 && !ui.filtering);
    for (const section of sections) {
      // A homogeneous child list needs no repeated group heading beneath its parent.
      const heading = section.group && !(ui.group === 'custom' && depth > 0 && sections.length === 1);
      if (heading && section.group) {
        const key = `section:${parent ?? 'root'}:${ui.group}:${section.group.key}`;
        const open = ui.isGroupOpen(key);
        entries.push({ kind: 'section', key, section: {
          ...section.group, key, groupId: section.group.key === 'none' ? null : section.group.key,
          mode: ui.group, parent, depth, count: section.items.length, open,
        } });
        if (!open) continue;
      }
      for (const it of section.items) {
        const kids = kidsOf(it.id);
        entries.push({ kind: 'row', key: it.id, row: {
          id: it.id,
          depth,
          kids: kids.length,
          doneKids: kids.filter((k) => model.isDone(k)).length,
          context: ui.filtering && !include.get(it.id),
        } });
        if (kids.length && (ui.filtering || !ui.collapsed.has(it.id))) walk(it.id, depth + 1);
      }
    }
  };
  walk(root, 0);
  return entries;
}

function archiveRows(): Row[] {
  const rows: Row[] = [];
  // The archive takes the same query language as the outline.
  const matches = matcherFor({ search: ui.search, statuses: [], tags: [], tagMode: ui.tagMode });
  const walk = (it: Item, depth: number) => {
    const kids = model.children.get(it.id) ?? [];
    rows.push({
      id: it.id,
      depth,
      kids: kids.length,
      doneKids: kids.filter((k) => model.isDone(k)).length,
      context: false,
    });
    if (kids.length && ui.archiveOpen.has(it.id)) for (const k of kids) walk(k, depth + 1);
  };
  for (const it of model.archivedRoots) {
    if (ui.search.trim() && !matches(it)) continue;
    walk(it, 0);
  }
  return rows;
}

class View {
  entries: OutlineEntry[] = $derived(ui.view === 'archive'
    ? archiveRows().map((row) => ({ kind: 'row' as const, key: row.id, row }))
    : outlineEntries());
  /** Keyboard navigation, range selection, and drag projection only see item rows. */
  rows: Row[] = $derived(this.entries.flatMap((entry) => entry.kind === 'row' ? [entry.row] : []));
  index: Map<string, number> = $derived(new Map(this.rows.map((r, i) => [r.id, i])));

  prev(id: string): string | null {
    const i = this.index.get(id);
    return i !== undefined && i > 0 ? this.rows[i - 1].id : null;
  }

  next(id: string): string | null {
    const i = this.index.get(id);
    return i !== undefined && i < this.rows.length - 1 ? this.rows[i + 1].id : null;
  }

  /** Ids in on-screen order. */
  ordered(ids: Iterable<string>): string[] {
    return [...ids].sort((a, b) => (this.index.get(a) ?? 1e9) - (this.index.get(b) ?? 1e9));
  }
}

export const view = new View();
