export type Kind = 'item' | 'status' | 'tag' | 'setting' | 'view' | 'template';

/** An icon chosen from the library: Tabler outline/filled (with its artwork) or an emoji. */
export interface IconRef {
  k: 'ti' | 'tif' | 'emoji';
  /** Tabler icon name, or the emoji itself. */
  n: string;
  /** Tabler SVG body, stored so rendering never needs the full catalogue. */
  s?: string;
}

export interface Item {
  id: string;
  parent: string | null;
  pos: string;
  title: string;
  note: string;
  status: string | null;
  tags: string[];
  hidden: boolean;
  archived: boolean;
  archivedAt: number | null;
  created: number;
  /** When the item last entered a "done" status. */
  doneAt: number | null;
  /** Status before it was marked done, restored when un-done. */
  prevStatus: string | null;
}

export interface Status {
  id: string;
  name: string;
  icon: IconRef | null;
  color: string;
  pos: string;
  /** Items in this status count as finished (progress, "hide done", strike-through). */
  done: boolean;
}

export interface Tag {
  id: string;
  name: string;
  icon: IconRef | null;
  color: string;
  pos: string;
  /** Tag this one sits under, written `parent/name`. Filtering by a tag includes everything below it. */
  parent?: string | null;
}

/** What a saved view restores: search, filters, toggles and (optionally) a zoomed item. */
export interface ViewFilter {
  search: string;
  statuses: string[];
  tags: string[];
  tagMode: 'any' | 'all';
  showHidden: boolean;
  hideDone: boolean;
  zoom: string | null;
}

export interface SavedView {
  id: string;
  name: string;
  icon: IconRef | null;
  color: string;
  pos: string;
  filter: ViewFilter;
}

/** One item of a template, with its sub-items. Tags and status are ids. */
export interface TemplateNode {
  title: string;
  note: string;
  status: string | null;
  tags: string[];
  children: TemplateNode[];
}

export interface Template {
  id: string;
  name: string;
  icon: IconRef | null;
  color: string;
  pos: string;
  items: TemplateNode[];
}

export type Doc = Record<string, unknown>;

/** A write: merge `set` into the document, and/or delete (`del: true`) or restore it. */
export interface Op {
  kind: Kind;
  id: string;
  set?: Doc;
  del?: boolean;
}

export interface Change {
  kind: Kind;
  id: string;
  data: Doc;
  deleted: boolean;
  updated: number;
}

export interface SyncResponse {
  rev: number;
  full: boolean;
  changes: Change[];
}
