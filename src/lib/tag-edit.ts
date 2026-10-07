import { commit, tagPathOps } from './actions.svelte';
import { db, model } from './model.svelte';
import { tagRenameError } from './tag-rename';
import type { IconRef, Op } from './types';
import { ui } from './ui.svelte';

export interface TagDraft { name: string; parent: string; color: string; icon: IconRef | null }

export function openTagEditor(id: string, anchor: HTMLElement | DOMRect | null, ids: string[] = []) {
  if (!db.tags[id]) return;
  ui.open({ kind: 'tags', anchor, ids, data: { editTag: id } });
}

/** Return an error without applying any partial parent creation. */
export function renameTag(id: string, written: string): string | null {
  const tag = db.tags[id];
  if (!tag) return 'This tag no longer exists.';
  const parts = written.trim().replace(/^#/, '').split('/').map((part) => part.trim()).filter(Boolean);
  const name = parts.pop();
  if (!name) return 'Give this tag a name.';
  const ops: Op[] = [];
  const parent = parts.length ? tagPathOps(parts.join('/'), ops) : null;
  const prospective = [
    ...model.tagList,
    ...ops.filter((op) => op.kind === 'tag' && op.set).map((op) => ({
      id: op.id, name: String(op.set!.name), parent: (op.set!.parent as string | null) ?? null,
    })),
  ];
  const error = tagRenameError(id, name, parent, prospective);
  if (error) return error;
  if (name !== tag.name || parent !== (tag.parent ?? null)) {
    ops.push({ kind: 'tag', id, set: { name, parent } });
    commit('Rename tag', ops);
  }
  return null;
}
