// Shared data (the replica) and everything derived from it: the tree, lookups, counts.
import { Replica } from './replica.svelte';
import { buildTagTree, type TagNode, type TagTree } from './tags';
import type { Item, SavedView, Status, Tag, Template } from './types';
import { byPos } from './util';

export const db = new Replica();

export interface ItemInfo {
  depth: number;
  /** Archived itself or under an archived ancestor. */
  archived: boolean;
  /** Hidden itself or under a hidden ancestor. */
  hidden: boolean;
}

class Model {
  statusList: Status[] = $derived(Object.values(db.statuses).sort(byPos));
  tagList: Tag[] = $derived(Object.values(db.tags).sort(byPos));
  viewList: SavedView[] = $derived(Object.values(db.views).sort(byPos));
  templateList: Template[] = $derived(Object.values(db.templates).sort(byPos));
  doneStatuses: Set<string> = $derived(new Set(this.statusList.filter((s) => s.done).map((s) => s.id)));

  /**
   * Children of every item (key null = top level), sorted. Items whose parent
   * is missing land at the top level, and parent cycles (possible when two
   * devices move items into each other offline) are broken so nothing vanishes.
   */
  children: Map<string | null, Item[]> = $derived.by(() => {
    const all = Object.values(db.items);
    const map = new Map<string | null, Item[]>();
    for (const it of all) {
      const p = it.parent && it.parent !== it.id && db.items[it.parent] ? it.parent : null;
      let list = map.get(p);
      if (!list) map.set(p, (list = []));
      list.push(it);
    }
    for (const list of map.values()) list.sort(byPos);

    const reached = new Set<string>();
    const mark = (start: Item[]) => {
      const stack = [...start];
      while (stack.length) {
        const it = stack.pop()!;
        if (reached.has(it.id)) continue;
        reached.add(it.id);
        const kids = map.get(it.id);
        if (kids) stack.push(...kids);
      }
    };
    mark(map.get(null) ?? []);
    if (reached.size < all.length) {
      const roots = map.get(null) ?? [];
      for (const it of all.sort(byPos)) {
        if (reached.has(it.id)) continue;
        const siblings = map.get(it.parent);
        if (siblings) siblings.splice(siblings.indexOf(it), 1);
        roots.push(it);
        mark([it]);
      }
      roots.sort(byPos);
      map.set(null, roots);
    }
    return map;
  });

  info: Map<string, ItemInfo> = $derived.by(() => {
    const out = new Map<string, ItemInfo>();
    const visit = (parent: string | null, depth: number, archived: boolean, hidden: boolean) => {
      for (const it of this.children.get(parent) ?? []) {
        if (out.has(it.id)) continue;
        const a = archived || it.archived;
        const h = hidden || it.hidden;
        out.set(it.id, { depth, archived: a, hidden: h });
        visit(it.id, depth + 1, a, h);
      }
    };
    visit(null, 0, false, false);
    return out;
  });

  /** Items with an ancestor-free archive flag: what the Archive view lists. */
  archivedRoots: Item[] = $derived.by(() =>
    Object.values(db.items)
      .filter((it) => {
        if (!it.archived) return false;
        const p = this.parentOf(it.id);
        return !p || !this.info.get(p)?.archived;
      })
      .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
  );

  /** Tag nesting: tree order, paths, and what sits under what. */
  tags: TagTree = $derived(buildTagTree(this.tagList));
  tagTree: TagNode[] = $derived(this.tags.nodes);

  counts = $derived.by(() => {
    const status = new Map<string | null, number>();
    const tag = new Map<string, number>();
    // Items carrying a tag or anything under it - what the sidebar shows, since
    // that is what clicking the tag will find.
    const tagDeep = new Map<string, number>();
    let hidden = 0;
    let total = 0;
    for (const it of Object.values(db.items)) {
      const inf = this.info.get(it.id);
      if (!inf || inf.archived) continue;
      total++;
      if (it.hidden) hidden++;
      status.set(it.status, (status.get(it.status) ?? 0) + 1);
      const within = new Set<string>();
      for (const t of it.tags) {
        tag.set(t, (tag.get(t) ?? 0) + 1);
        for (const up of this.tags.chains.get(t) ?? [t]) within.add(up);
      }
      for (const t of within) tagDeep.set(t, (tagDeep.get(t) ?? 0) + 1);
    }
    return { status, tag, tagDeep, hidden, total };
  });

  parentOf(id: string): string | null {
    const p = db.items[id]?.parent;
    return p && db.items[p] ? p : null;
  }

  /** Ancestors from the top level down to the direct parent. */
  pathOf(id: string): Item[] {
    const out: Item[] = [];
    const seen = new Set<string>([id]);
    let p = this.parentOf(id);
    while (p && !seen.has(p)) {
      seen.add(p);
      out.unshift(db.items[p]);
      p = this.parentOf(p);
    }
    return out;
  }

  isAncestor(ancestor: string, id: string): boolean {
    const seen = new Set<string>();
    let p = this.parentOf(id);
    while (p && !seen.has(p)) {
      if (p === ancestor) return true;
      seen.add(p);
      p = this.parentOf(p);
    }
    return false;
  }

  /** The item and all its descendants. */
  subtree(id: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      out.push(cur);
      for (const k of this.children.get(cur) ?? []) stack.push(k.id);
    }
    return out;
  }

  isDone(item: Item): boolean {
    return !!item.status && this.doneStatuses.has(item.status);
  }

  /** Keeps only ids that are not inside another id of the set. */
  topmost(ids: Iterable<string>): string[] {
    const set = new Set(ids);
    return [...set].filter((id) => db.items[id] && !this.pathOf(id).some((a) => set.has(a.id)));
  }

  /** `work/client` for a nested tag, its name for a top-level one. */
  tagPath(id: string): string {
    return this.tags.paths.get(id) ?? db.tags[id]?.name ?? '';
  }

  /** The tag itself and every tag nested under it. */
  tagFamily(id: string): string[] {
    return this.tags.families.get(id) ?? [id];
  }

  /** Whether `id` sits anywhere under `ancestor` (or is it). */
  tagWithin(id: string, ancestor: string): boolean {
    return this.tagFamily(ancestor).includes(id);
  }
}

export const model = new Model();
