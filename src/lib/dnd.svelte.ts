// Drag and drop for rows. Vertical position picks the slot between rows and
// horizontal position picks the nesting depth, like most outliners.
import { moveTo, type Where } from './actions.svelte';
import { draggedDepth, projectDrop, sameReorderBand, type ReorderBand } from './dnd-project';
import { db, model } from './model.svelte';
import { ui } from './ui.svelte';
import { groupKeyForItem, view } from './view.svelte';

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
  private startDepth = 0;
  private moved = false;
  private pointerId = -1;
  private pending = false;
  private scrollRaf = 0;
  private excluded = new Set<string>();
  private detach: (() => void) | null = null;
  private blockedSection = false;

  /** A handle starts after a few px; a completed row hold starts immediately. */
  arm(e: PointerEvent, id: string, immediate = false) {
    if (e.button !== 0 || ui.sort !== 'custom' || ui.view === 'archive') return;
    if (this.detach) this.cancel();
    this.pending = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.moved = false;
    this.pointerId = e.pointerId;
    const ids = ui.selection.has(id) ? view.ordered(model.topmost(ui.selection)) : [id];
    this.ids = ids;
    this.startDepth = view.rows[view.index.get(ids[0]) ?? -1]?.depth ?? 0;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== this.pointerId) return;
      if (!this.moved && Math.hypot(ev.clientX - this.startX, ev.clientY - this.startY) < 5) return;
      this.moved = true;
      if (this.pending) this.begin(ids);
      ev.preventDefault();
      this.update(ev.clientX, ev.clientY);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== this.pointerId) return;
      const wasActive = this.active;
      this.finish(true);
      if (wasActive) {
        // Swallow the click that follows a drag.
        const stop = (c: Event) => {
          c.stopPropagation();
          c.preventDefault();
        };
        addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', stop, { capture: true }), 300);
      }
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId === this.pointerId) this.cancel();
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      this.cancel();
    };
    const blur = () => this.cancel();
    addEventListener('pointermove', move, { passive: false });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
    addEventListener('keydown', key, { capture: true });
    addEventListener('blur', blur);
    this.detach = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      removeEventListener('keydown', key, { capture: true });
      removeEventListener('blur', blur);
    };
    if (immediate) {
      this.begin(ids);
      this.x = e.clientX;
      this.y = e.clientY;
    }
  }

  cancelFor(id: string) {
    if (this.ids.includes(id)) this.cancel();
  }

  cancel() {
    this.finish(false);
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
    this.drop = this.validDrop(this.project(x, y));
    this.autoscroll(y);
  }

  /** Section and pin ordering are view rules, so custom moves stay inside their band. */
  private validDrop(drop: Drop | null): Drop | null {
    this.blockedSection = false;
    if (!drop) return null;
    const anchorId = typeof drop.where === 'object'
      ? 'before' in drop.where ? drop.where.before : drop.where.after
      : null;
    const anchor = anchorId ? db.items[anchorId] : null;
    const first = db.items[this.ids[0]];
    if (!first) return null;
    const source = this.bandOf(first.id);
    const sameBand = this.ids.every((id) => {
      const it = db.items[id];
      return it && sameReorderBand(this.bandOf(id), source);
    });
    const groupedParentChanged = ui.group !== 'none' && this.ids.some((id) => model.parentOf(id) !== drop.parent);
    const anchorChangedBand = anchor && !sameReorderBand(this.bandOf(anchor.id), source);
    if (!sameBand || groupedParentChanged || anchorChangedBand) {
      this.blockedSection = true;
      return null;
    }
    return drop;
  }

  private bandOf(id: string): ReorderBand {
    const it = db.items[id];
    return { group: it ? groupKeyForItem(it) : '', pinned: !!it?.pinned };
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
    const prev = rows[slot - 1];
    const root = ui.zoom && db.items[ui.zoom] ? ui.zoom : null;
    const want = draggedDepth(this.startDepth, x - this.startX, indent);
    const target = projectDrop(rows, slot, want, root, (id) => model.parentOf(id), (id) => this.bandOf(id), this.bandOf(this.ids[0]));
    const beforeNext = typeof target.where === 'object' && 'before' in target.where;
    const lineY = beforeNext
      ? (els[slot]?.getBoundingClientRect().top ?? box.top)
      : prev
      ? (els[slot - 1]?.getBoundingClientRect().bottom ?? 0)
      : (els[0]?.getBoundingClientRect().top ?? box.top);
    const lineX = box.left + gutter + target.depth * indent;
    return { ...target, y: lineY, x: lineX, width: box.right - lineX - 8 };
  }

  private autoscroll(y: number) {
    cancelAnimationFrame(this.scrollRaf);
    const edge = 70;
    const speed = y < edge ? -(edge - y) / 3 : y > innerHeight - edge ? (y - (innerHeight - edge)) / 3 : 0;
    if (!speed || !this.active) return;
    const tick = () => {
      scrollBy(0, speed);
      this.drop = this.validDrop(this.project(this.x, this.y));
      this.scrollRaf = requestAnimationFrame(tick);
    };
    this.scrollRaf = requestAnimationFrame(tick);
  }

  private finish(commitDrop: boolean) {
    cancelAnimationFrame(this.scrollRaf);
    const drop = this.drop;
    const ids = this.ids;
    const was = this.active;
    const moved = this.moved;
    const blockedSection = this.blockedSection;
    this.detach?.();
    this.detach = null;
    this.pending = false;
    this.active = false;
    this.drop = null;
    this.ids = [];
    this.pointerId = -1;
    this.moved = false;
    ui.dragging = false;
    document.body.classList.remove('dragging');
    if (was && moved && commitDrop && drop) moveTo(ids, drop.parent, drop.where, 'Reorder');
    else if (was && moved && commitDrop && blockedSection) ui.toast('Reorder within a section. Use group, status, tags or pin from the menu to change sections.');
  }
}

export const dnd = new Dnd();
