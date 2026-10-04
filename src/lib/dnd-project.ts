import type { Where } from './actions.svelte';

interface DragRow { id: string; depth: number }
export interface ReorderBand { group: string; pinned: boolean }
export interface DropTarget { parent: string | null; where: Where; depth: number }

export const sameReorderBand = (a: ReorderBand, b: ReorderBand) => a.group === b.group && a.pinned === b.pinned;

/** Nesting follows horizontal travel, so a grip on the right still moves vertically. */
export const draggedDepth = (startDepth: number, dx: number, indent: number) => startDepth + Math.round(dx / indent);

/** Choose a structural insertion point for a visible slot, including section boundaries. */
export function projectDrop(
  rows: DragRow[], slot: number, want: number, root: string | null,
  parentOf: (id: string) => string | null,
  bandOf: (id: string) => ReorderBand,
  source: ReorderBand,
): DropTarget {
  const prev = rows[slot - 1];
  const next = rows[slot];
  const maxDepth = prev ? prev.depth + 1 : 0;
  const minDepth = next ? Math.min(next.depth, maxDepth) : 0;
  const depth = Math.max(minDepth, Math.min(maxDepth, want));

  // The row above a section's first row belongs to the previous section. Use
  // the next row as the anchor so a drop at the start stays in its own section.
  if (next?.depth === depth && sameReorderBand(bandOf(next.id), source)) {
    return { depth, parent: parentOf(next.id), where: { before: next.id } };
  }
  if (!prev) return { depth, parent: root, where: next ? { before: next.id } : 'start' };
  if (depth === prev.depth + 1) {
    return { depth, parent: prev.id, where: next && next.depth === depth ? { before: next.id } : 'end' };
  }
  let anchor = prev.id;
  for (let d = prev.depth; d > depth; d--) anchor = parentOf(anchor) ?? anchor;
  return { depth, parent: parentOf(anchor), where: { after: anchor } };
}
