// The rows the outline currently shows: tree order, collapse state, zoom and filters applied.
import { db, model } from './model.svelte';
import { findStatus, findTag } from './parse';
import { queryMatcher, type Resolver } from './query';
import { tagsMatch } from './tags';
import type { Item } from './types';
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
