// Tag nesting. A tag can sit under another - written `work/client` - and
// filtering or searching by the outer one covers everything inside it.
//
// Only the parent link is stored, so renaming a tag moves everything below it
// and nothing has to be rewritten. Paths, depths and families are worked out
// from that link here, once, for the model and for parsing typed text alike.
import type { Tag } from './types';

export interface TagNode {
  tag: Tag;
  depth: number;
  /** `work/client`, or just the name at the top level. */
  path: string;
}

export interface TagTree {
  /** Every tag in tree order: a parent immediately before what it holds. */
  nodes: TagNode[];
  /** Children of each tag; the key null is the top level. */
  kids: Map<string | null, Tag[]>;
  /** A tag and everything nested under it - what filtering by it means. */
  families: Map<string, string[]>;
  /** A tag and its ancestors - which tags an item counts towards. */
  chains: Map<string, string[]>;
  paths: Map<string, string>;
}

/**
 * `tags` is taken in the order they should appear; children keep that order
 * within their parent. A parent that is missing, is the tag itself, or sits
 * below it (two devices can nest tags into each other while offline) is
 * ignored, so a tag can never vanish into a loop.
 */
export function buildTagTree(tags: Tag[]): TagTree {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const kids = new Map<string | null, Tag[]>();
  for (const t of tags) {
    let parent = t.parent && t.parent !== t.id && byId.has(t.parent) ? t.parent : null;
    if (parent) {
      const seen = new Set<string>([t.id]);
      let up: string | null | undefined = parent;
      while (up && byId.has(up) && !seen.has(up)) {
        seen.add(up);
        up = byId.get(up)!.parent;
      }
      if (up && seen.has(up)) parent = null; // a loop: treat it as a top-level tag
    }
    let list = kids.get(parent);
    if (!list) kids.set(parent, (list = []));
    list.push(t);
  }

  const nodes: TagNode[] = [];
  const paths = new Map<string, string>();
  const chains = new Map<string, string[]>();
  const walk = (parent: string | null, depth: number, prefix: string, above: string[]) => {
    for (const tag of kids.get(parent) ?? []) {
      const path = prefix ? `${prefix}/${tag.name}` : tag.name;
      nodes.push({ tag, depth, path });
      paths.set(tag.id, path);
      const chain = [tag.id, ...above];
      chains.set(tag.id, chain);
      walk(tag.id, depth + 1, path, chain);
    }
  };
  walk(null, 0, '', []);

  const families = new Map<string, string[]>();
  const collect = (tag: Tag): string[] => {
    const family = [tag.id, ...(kids.get(tag.id) ?? []).flatMap(collect)];
    families.set(tag.id, family);
    return family;
  };
  for (const tag of kids.get(null) ?? []) collect(tag);

  return { nodes, kids, families, chains, paths };
}

/** Full `parent/child` path of every tag, by id. */
export function tagPaths(tags: Tag[]): Map<string, string> {
  return buildTagTree(tags).paths;
}

/**
 * Whether an item's tags satisfy a tag filter. Each selected tag is passed as
 * its whole family, so picking a tag asks for that tag or anything under it;
 * in "all" mode every selected tag must be answered, each by its own family.
 */
export function tagsMatch(itemTags: string[], selected: string[][], mode: 'any' | 'all'): boolean {
  if (!selected.length) return true;
  const has = (family: string[]) => family.some((t) => itemTags.includes(t));
  return mode === 'all' ? selected.every(has) : selected.some(has);
}
