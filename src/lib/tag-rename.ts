import type { Tag } from './types';
import { fold } from './util';

/** Check the prospective graph, including parents created in the same rename. */
export function tagRenameError(
  id: string,
  name: string,
  parent: string | null,
  tags: Pick<Tag, 'id' | 'name' | 'parent'>[],
): string | null {
  const seen = new Set([id]);
  let up = parent;
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  while (up) {
    if (seen.has(up)) return 'A tag cannot be moved inside itself or one of its nested tags.';
    seen.add(up);
    up = byId.get(up)?.parent ?? null;
  }
  if (tags.some((tag) => tag.id !== id && (tag.parent ?? null) === parent && fold(tag.name) === fold(name))) {
    return 'A tag with that name already exists here. Choose a different name or parent.';
  }
  return null;
}
