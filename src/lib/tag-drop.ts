import type { TagTree } from './tags';
import { tagRenameError } from './tag-rename';

export type TagPlacement = 'before' | 'inside' | 'after';
export interface TagDrop {
  parent: string | null;
  before: string | null;
  label: string;
}

/** Resolve a tag drop against the complete tree, even when the list is filtered. */
export function projectTagDrop(tree: TagTree, id: string, target: string | null, placement: TagPlacement): TagDrop | string {
  const tag = tree.nodes.find((node) => node.tag.id === id)?.tag;
  if (!tag) return 'This tag no longer exists.';
  if (target && !tree.paths.has(target)) return 'The destination tag no longer exists.';
  if (target && tree.families.get(id)?.includes(target)) return 'A tag cannot be moved inside itself or one of its nested tags.';
  const parent = target ? placement === 'inside' ? target : tree.chains.get(target)?.[1] ?? null : null;
  const error = tagRenameError(id, tag.name, parent, tree.nodes.map((node) => node.tag));
  if (error) return error;
  const siblings = (tree.kids.get(parent) ?? []).filter((sibling) => sibling.id !== id);
  const index = siblings.findIndex((sibling) => sibling.id === target);
  const before = target && placement === 'before' ? target
    : target && placement === 'after' ? siblings[index + 1]?.id ?? null : null;
  const label = !target ? 'Move to top level' : placement === 'inside'
    ? `Nest under #${tree.paths.get(target)}`
    : `Move ${placement} #${tree.paths.get(target)}`;
  return { parent, before, label };
}
