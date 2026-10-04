import type { Doc, Item, Op, SavedView, Status, Tag, Template } from './types';

/** Views and templates were absent from older v1 backups. */
export interface ArborExport {
  app: string;
  version: number;
  exported: string;
  items: Item[];
  statuses: Status[];
  tags: Tag[];
  settings: Record<string, Doc>;
  views?: SavedView[];
  templates?: Template[];
}

interface Collections {
  items: Record<string, Item>;
  statuses: Record<string, Status>;
  tags: Record<string, Tag>;
  views: Record<string, SavedView>;
  templates: Record<string, Template>;
}

/** Plan the entire import first so invalid collection data never partly replaces a database. */
export function importOps(data: ArborExport, current: Collections, replace: boolean): Op[] {
  if (data?.app !== 'arbor') throw new Error('This is not an Arbor export');
  const ops: Op[] = [];
  const add = (kind: Op['kind'], list: { id: string }[] | undefined, existing: Record<string, { id: string }>) => {
    if (list === undefined) return;
    if (!Array.isArray(list) || list.some((entry) => !entry || typeof entry.id !== 'string')) {
      throw new Error(`Invalid ${kind} data in this export`);
    }
    if (replace) {
      const keep = new Set(list.map((entry) => entry.id));
      for (const entry of Object.values(existing)) {
        if (!keep.has(entry.id)) ops.push({ kind, id: entry.id, del: true });
      }
    }
    for (const { id, ...rest } of list) ops.push({ kind, id, set: rest as Doc, del: false });
  };
  add('item', data.items, current.items);
  add('status', data.statuses, current.statuses);
  add('tag', data.tags, current.tags);
  // Missing optional collections mean an older backup, so preserve current ones.
  add('view', data.views, current.views);
  add('template', data.templates, current.templates);
  for (const [id, doc] of Object.entries(data.settings ?? {})) ops.push({ kind: 'setting', id, set: doc });
  return ops;
}
