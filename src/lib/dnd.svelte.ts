// Drag and drop for rows. Vertical position picks the slot between rows and
// horizontal position picks the nesting depth, like most outliners.
import { moveTo, type Where } from './actions.svelte';
import { db, model } from './model.svelte';
import { ui } from './ui.svelte';
import { view, type Row } from './view.svelte';

interface Drop {
  parent: string | null;
  where: Where;
  depth: number;
  /** Indicator line position (viewport px). */
  y: number;
  x: number;
  width: number;
}

class Dnd {
  active = $state(false);
  ids: string[] = $state([]);
  drop: Drop | null = $state(null);
  x = $state(0);
  y = $state(0);
  label = $state('');

  private startX = 0;
  private startY = 0;
  private pointerId = -1;
  private pending = false;
  private scrollRaf = 0;
  private excluded = new Set<string>();

  /** Called on pointerdown on a drag handle; the drag starts after a few px of movement. */
  arm(e: PointerEvent, id: string) {
    if (e.button !== 0) return;
    this.pending = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.pointerId = e.pointerId;
    const ids = ui.selection.has(id) ? view.ordered(model.topmost(ui.selection)) : [id];
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== this.pointerId) return;
      if (this.pending) {
        if (Math.hypot(ev.clientX - this.startX, ev.clientY - this.startY) < 5) return;
        this.begin(ids);
      }
      ev.preventDefault();
      this.update(ev.clientX, ev.clientY);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== this.pointerId) return;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      const wasActive = this.active;
      this.finish(true);
      if (wasActive) {
        // Swallow the click that follows a drag.
        const stop = (c: Event) => {
          c.stopPropagation();
          c.preventDefault();
        };
        addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', stop, { capture: true }), 50);
      }
    };
    const cancel = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      this.finish(false);
    };
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
  }

  private begin(ids: string[]) {
    this.pending = false;
    this.active = true;
    ui.dragging = true;
    ui.stopEditing();
    this.ids = ids;
    this.excluded = new Set(ids.flatMap((id) => model.subtree(id)));
    const first = db.items[ids[0]];
    this.label = ids.length > 1 ? `${ids.length} items` : first?.title || 'Untitled';
    document.body.classList.add('dragging');
  }

  private update(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.drop = this.project(x, y);
    this.autoscroll(y);
  }

  private project(x: number, y: number): Drop | null {
    const list = document.querySelector<HTMLElement>('[data-outline]');
    if (!list) return null;
    const rows = view.rows.filter((r) => !this.excluded.has(r.id));
    const els = rows.map((r) => list.querySelector<HTMLElement>(`[data-row-id="${r.id}"]`));
    const box = list.getBoundingClientRect();
    const indent = parseFloat(getComputedStyle(list).getPropertyValue('--indent')) || 26;
    const gutter = parseFloat(getComputedStyle(list).getPropertyValue('--gutter')) || 30;

    // Slot index: first row whose middle is below the pointer.
    let slot = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const r = els[i]?.getBoundingClientRect();
      if (r && y < r.top + r.height / 2) {
        slot = i;
        break;
      }
    }
    const prev: Row | undefined = rows[slot - 1];
    const next: Row | undefined = rows[slot];
    const maxDepth = prev ? prev.depth + 1 : 0;
    const minDepth = next ? Math.min(next.depth, maxDepth) : 0;
    const want = Math.round((x - box.left - gutter) / indent - 0.35);
    const depth = Math.max(minDepth, Math.min(maxDepth, want));

    const lineY = prev
      ? (els[slot - 1]?.getBoundingClientRect().bottom ?? 0)
      : (els[0]?.getBoundingClientRect().top ?? box.top);
    const lineX = box.left + gutter + depth * indent;
    const base: Omit<Drop, 'parent' | 'where'> = { depth, y: lineY, x: lineX, width: box.right - lineX - 8 };

    const root = ui.zoom && db.items[ui.zoom] ? ui.zoom : null;
    if (!prev) return { ...base, parent: root, where: next ? { before: next.id } : 'start' };
    if (depth === prev.depth + 1) {
      return {
        ...base,
        parent: prev.id,
        where: next && next.depth === depth ? { before: next.id } : 'end',
      };
    }
    // Climb from prev to the ancestor sitting at the chosen depth; drop after it.
    let anchor = prev.id;
    for (let d = prev.depth; d > depth; d--) anchor = model.parentOf(anchor) ?? anchor;
    return { ...base, parent: model.parentOf(anchor), where: { after: anchor } };
  }

  private autoscroll(y: number) {
    cancelAnimationFrame(this.scrollRaf);
    const edge = 70;
    const speed = y < edge ? -(edge - y) / 3 : y > innerHeight - edge ? (y - (innerHeight - edge)) / 3 : 0;
    if (!speed || !this.active) return;
    const tick = () => {
      scrollBy(0, speed);
      this.drop = this.project(this.x, this.y);
      this.scrollRaf = requestAnimationFrame(tick);
    };
    this.scrollRaf = requestAnimationFrame(tick);
  }

  private finish(commitDrop: boolean) {
    cancelAnimationFrame(this.scrollRaf);
    const drop = this.drop;
    const ids = this.ids;
    const was = this.active;
    this.pending = false;
    this.active = false;
    this.drop = null;
    this.ids = [];
    ui.dragging = false;
    document.body.classList.remove('dragging');
    if (was && commitDrop && drop) moveTo(ids, drop.parent, drop.where);
  }
}

export const dnd = new Dnd();
