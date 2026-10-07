import { moveTag } from './actions.svelte';
import { model } from './model.svelte';
import { projectTagDrop, type TagPlacement } from './tag-drop';
import { ui } from './ui.svelte';

/** Native mouse drag handles, shared by the sidebar and tag manager. */
export function tagDrag(node: HTMLElement) {
  let source: string | null = null;
  let hovered: HTMLElement | null = null;
  let target: string | null = null;
  let placement: TagPlacement = 'inside';
  const hint = () => node.querySelector<HTMLElement>('[data-tag-drag-hint]');
  function clearTarget() {
    if (hovered) {
      delete hovered.dataset.tagDrop;
      delete hovered.dataset.tagDropInvalid;
    }
    hovered = null;
  }
  function finish() {
    source = null;
    clearTarget();
    delete node.dataset.tagDragging;
    if (hint()) hint()!.textContent = '';
  }
  function start(e: DragEvent) {
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-tag-handle]');
    if (!handle || !node.contains(handle) || !e.dataTransfer) return;
    source = handle.dataset.tagHandle ?? null;
    if (!source) return;
    ui.stopEditing();
    ui.closePopover();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-arbor-tag', source);
    const row = handle.closest<HTMLElement>('[data-tag-id]');
    if (row) e.dataTransfer.setDragImage(row, 16, row.clientHeight / 2);
    node.dataset.tagDragging = source;
    if (hint()) hint()!.textContent = 'Drop between tags to reorder, or on a tag to nest. Esc cancels.';
  }
  function over(e: DragEvent) {
    if (!source || !e.dataTransfer) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-tag-id], [data-tag-root]');
    if (!row || !node.contains(row)) { clearTarget(); return; }
    clearTarget();
    hovered = row;
    target = row.dataset.tagId ?? null;
    const box = row.getBoundingClientRect();
    const fraction = (e.clientY - box.top) / box.height;
    placement = target ? fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'inside' : 'inside';
    const drop = projectTagDrop(model.tags, source, target, placement);
    row.dataset.tagDrop = placement;
    row.dataset.tagDropInvalid = String(typeof drop === 'string');
    if (hint()) hint()!.textContent = typeof drop === 'string' ? drop : `${drop.label} · Esc cancels`;
    e.dataTransfer.dropEffect = typeof drop === 'string' ? 'none' : 'move';
    if (typeof drop !== 'string') e.preventDefault();
  }
  function leave(e: DragEvent) {
    if (!(e.relatedTarget instanceof Node) || !node.contains(e.relatedTarget)) clearTarget();
  }
  function drop(e: DragEvent) {
    if (!source || !hovered) return;
    e.preventDefault();
    const result = projectTagDrop(model.tags, source, target, placement);
    if (typeof result === 'string') ui.toast(result, undefined, 'error');
    else moveTag(source, result.parent, result.before);
    finish();
  }
  node.addEventListener('dragstart', start);
  node.addEventListener('dragover', over);
  node.addEventListener('dragleave', leave);
  node.addEventListener('drop', drop);
  addEventListener('dragend', finish);
  addEventListener('blur', finish);
  return { destroy() {
    finish();
    node.removeEventListener('dragstart', start);
    node.removeEventListener('dragover', over);
    node.removeEventListener('dragleave', leave);
    node.removeEventListener('drop', drop);
    removeEventListener('dragend', finish);
    removeEventListener('blur', finish);
  } };
}
