// Per-device interface state: what's expanded, selected, filtered, open.
// Collapse/notes/filter toggles persist in localStorage; nothing here syncs.
import { SvelteSet } from 'svelte/reactivity';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`arbor.${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`arbor.${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export type PopoverKind = 'status' | 'tags' | 'item' | 'move' | 'icon' | 'color' | 'view';

export interface PopoverState {
  kind: PopoverKind;
  /** Element (or rectangle) the popover points at. */
  anchor: HTMLElement | DOMRect | null;
  /** Items the popover acts on. */
  ids: string[];
  /** Extra data for pickers (current value, callback). */
  data?: Record<string, unknown>;
  /** Called after the popover closes. */
  onClose?: () => void;
}

export interface Editing {
  id: string;
  field: 'title' | 'note';
  caret: number | 'start' | 'end';
  /** Bumped to re-focus the same editor. */
  n?: number;
}

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  tone?: 'default' | 'error';
}

const mobileQuery = typeof matchMedia !== 'undefined' ? matchMedia('(max-width: 720px)') : null;
const coarseQuery = typeof matchMedia !== 'undefined' ? matchMedia('(pointer: coarse)') : null;
const darkQuery = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;

class UI {
  view: 'outline' | 'archive' = $state('outline');
  /** The item the outline is zoomed into (null = everything). Mirrored in the URL hash. */
  zoom: string | null = $state(null);

  collapsed = new SvelteSet<string>(load<string[]>('collapsed', []));
  notesOpen = new SvelteSet<string>(load<string[]>('notesOpen', []));
  /** Archived subtrees are shown collapsed unless opened here. */
  archiveOpen = new SvelteSet<string>();
  selection = new SvelteSet<string>();
  /** Where shift-click/shift-arrow range selection starts. */
  anchor: string | null = null;
  /** Keyboard focus when not typing. */
  cursor: string | null = $state(null);
  editing: Editing | null = $state(null);
  /** Rows just created, for a brief highlight. */
  fresh = new SvelteSet<string>();

  search = $state('');
  filterStatus = new SvelteSet<string>();
  filterTags = new SvelteSet<string>();
  tagMode: 'any' | 'all' = $state(load('tagMode', 'any'));
  showHidden = $state(load('showHidden', false));
  hideDone = $state(load('hideDone', false));

  sidebar = $state(load('sidebar', true));
  drawer = $state(false);
  settingsOpen: string | null = $state(null);
  palette = $state(false);
  shortcuts = $state(false);
  popover: PopoverState | null = $state(null);
  toasts: Toast[] = $state([]);
  confirm: { text: string; action: string; run: () => void } | null = $state(null);

  /** Quick-add target (parent id) and the last item it created, for Tab nesting. */
  quickParent: string | null = $state(null);
  quickLast: string | null = $state(null);

  mobile = $state(mobileQuery?.matches ?? false);
  coarse = $state(coarseQuery?.matches ?? false);
  systemDark = $state(darkQuery?.matches ?? false);
  /** Touch selection mode (entered by long-press). */
  selecting = $state(false);
  dragging = $state(false);

  constructor() {
    mobileQuery?.addEventListener('change', (e) => (this.mobile = e.matches));
    coarseQuery?.addEventListener('change', (e) => (this.coarse = e.matches));
    darkQuery?.addEventListener('change', (e) => (this.systemDark = e.matches));
    this.readHash();
    addEventListener('hashchange', () => this.readHash());
  }

  get filtering() {
    return this.search.trim() !== '' || this.filterStatus.size > 0 || this.filterTags.size > 0;
  }

  persist() {
    save('collapsed', [...this.collapsed]);
    save('notesOpen', [...this.notesOpen]);
    save('showHidden', this.showHidden);
    save('hideDone', this.hideDone);
    save('sidebar', this.sidebar);
    save('tagMode', this.tagMode);
  }

  private readHash() {
    const m = /^#\/(item|archive)(?:\/([A-Za-z0-9_-]+))?/.exec(location.hash);
    if (m?.[1] === 'archive') {
      this.view = 'archive';
    } else {
      this.view = 'outline';
      this.zoom = m?.[1] === 'item' && m[2] ? m[2] : null;
    }
  }

  go(view: 'outline' | 'archive', zoom: string | null = null) {
    const hash = view === 'archive' ? '#/archive' : zoom ? `#/item/${zoom}` : '#/';
    if (location.hash !== hash) history.pushState(null, '', hash);
    this.view = view;
    this.zoom = view === 'outline' ? zoom : null;
    this.drawer = false;
    this.clearSelection();
    scrollTo({ top: 0 });
  }

  clearSelection() {
    this.selection.clear();
    this.anchor = null;
    this.selecting = false;
  }

  clearFilters() {
    this.search = '';
    this.filterStatus.clear();
    this.filterTags.clear();
  }

  isOpen(id: string) {
    return this.view === 'archive' ? this.archiveOpen.has(id) : !this.collapsed.has(id);
  }

  setOpen(id: string, open = !this.isOpen(id)) {
    if (this.view === 'archive') {
      if (open) this.archiveOpen.add(id);
      else this.archiveOpen.delete(id);
      return;
    }
    if (open) this.collapsed.delete(id);
    else this.collapsed.add(id);
    this.persist();
  }

  toggleNote(id: string, open = !this.notesOpen.has(id)) {
    if (open) this.notesOpen.add(id);
    else this.notesOpen.delete(id);
    this.persist();
  }

  edit(id: string, caret: Editing['caret'] = 'end', field: Editing['field'] = 'title') {
    this.editing = { id, caret, field, n: (this.editing?.n ?? 0) + 1 };
    this.cursor = id;
  }

  stopEditing() {
    if (this.editing) this.cursor = this.editing.id;
    this.editing = null;
  }

  open(p: PopoverState) {
    this.popover = p;
  }

  closePopover() {
    const p = this.popover;
    this.popover = null;
    p?.onClose?.();
  }

  private toastSeq = 0;
  toast(text: string, action?: Toast['action'], tone: Toast['tone'] = 'default', ms = 4500) {
    const id = ++this.toastSeq;
    this.toasts = [...this.toasts.slice(-2), { id, text, action, tone }];
    setTimeout(() => this.dismiss(id), ms);
    return id;
  }

  dismiss(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  markFresh(ids: string[]) {
    for (const id of ids) this.fresh.add(id);
    setTimeout(() => {
      for (const id of ids) this.fresh.delete(id);
    }, 900);
  }
}

export const ui = new UI();
