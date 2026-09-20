// The rows the outline currently shows: tree order, collapse state, zoom and filters applied.
import { db, model } from './model.svelte';
import type { Item } from './types';
import { ui } from './ui.svelte';

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

/** A predicate for search text + status/tag filters ('none' stands for "no status"). */
export function matcherFor(c: Criteria) {
  const terms = c.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const statuses = new Set(c.statuses);
  const tags = [...c.tags];
  return (it: Item) => {
    if (statuses.size && !statuses.has(it.status ?? 'none')) return false;
    if (tags.length) {
      const has = (t: string) => it.tags.includes(t);
      if (c.tagMode === 'all' ? !tags.every(has) : !tags.some(has)) return false;
    }
    if (terms.length) {
      const hay = [
        it.title,
        it.note,
        ...it.tags.map((t) => '#' + (db.tags[t]?.name ?? '')),
        it.status ? '@' + (db.statuses[it.status]?.name ?? '') : '',
      ]
        .join(' ')
        .toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  };
}

const matcher = () =>
  matcherFor({ search: ui.search, statuses: ui.filterStatus, tags: ui.filterTags, tagMode: ui.tagMode });

function outlineRows(): Row[] {
  const rows: Row[] = [];
  const root = ui.zoom && db.items[ui.zoom] ? ui.zoom : null;
  const kidsOf = (id: string | null) => (model.children.get(id) ?? []).filter(shown);

  if (!ui.filtering) {
    const walk = (parent: string | null, depth: number) => {
      for (const it of kidsOf(parent)) {
        const kids = kidsOf(it.id);
        rows.push({
          id: it.id,
          depth,
          kids: kids.length,
          doneKids: kids.filter((k) => model.isDone(k)).length,
          context: false,
        });
        if (kids.length && !ui.collapsed.has(it.id)) walk(it.id, depth + 1);
      }
    };
    walk(root, 0);
    return rows;
  }

  // Filtering: show matches with their ancestors for context, expanded.
  const matches = matcher();
  const include = new Map<string, boolean>();
  const scan = (parent: string | null): boolean => {
    let any = false;
    for (const it of kidsOf(parent)) {
      const self = matches(it);
      const below = scan(it.id);
      if (self || below) {
        include.set(it.id, self);
        any = true;
      }
    }
    return any;
  };
  scan(root);
  const walk = (parent: string | null, depth: number) => {
    for (const it of kidsOf(parent)) {
      if (!include.has(it.id)) continue;
      const kids = kidsOf(it.id);
      rows.push({
        id: it.id,
        depth,
        kids: kids.length,
        doneKids: kids.filter((k) => model.isDone(k)).length,
        context: !include.get(it.id),
      });
      walk(it.id, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

function archiveRows(): Row[] {
  const rows: Row[] = [];
  const terms = ui.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
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
    if (terms.length) {
      const hay = `${it.title} ${it.note}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) continue;
    }
    walk(it, 0);
  }
  return rows;
}

class View {
  rows: Row[] = $derived(ui.view === 'archive' ? archiveRows() : outlineRows());
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
