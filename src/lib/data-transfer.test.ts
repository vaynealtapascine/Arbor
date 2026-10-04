import { describe, expect, it } from 'vitest';
import { importOps, type ArborExport } from './data-transfer';
import type { Item, SavedView, Status, Template } from './types';

const saved: SavedView = {
  id: 'saved', name: 'Work', icon: null, color: '#444', pos: 'a0',
  filter: { search: 'work', statuses: [], tags: [], tagMode: 'any', showHidden: false, hideDone: false, zoom: null,
    sort: 'created', sortDirection: 'desc', group: 'tag' },
};
const template: Template = {
  id: 'template', name: 'Planning', icon: null, color: '#444', pos: 'a0',
  items: [{ title: 'Plan', note: '', status: null, tags: [], children: [] }],
};
const current = { items: {}, statuses: {}, tags: {}, views: { saved }, templates: { template } };
const backup: ArborExport = { app: 'arbor', version: 1, exported: '', items: [], statuses: [], tags: [], settings: {} };

describe('portable views and templates', () => {
  it('imports complete view arrangements and nested templates', () => {
    const ops = importOps({ ...backup, views: [saved], templates: [template] }, current, false);
    expect(ops).toEqual([
      { kind: 'view', id: 'saved', set: { name: saved.name, icon: null, color: '#444', pos: 'a0', filter: saved.filter }, del: false },
      { kind: 'template', id: 'template', set: { name: template.name, icon: null, color: '#444', pos: 'a0', items: template.items }, del: false },
    ]);
  });

  it('preserves collections missing from older backups during replacement', () => {
    expect(importOps(backup, current, true)).toEqual([]);
  });

  it('clears explicitly empty view and template collections during replacement', () => {
    expect(importOps({ ...backup, views: [], templates: [] }, current, true)).toEqual([
      { kind: 'view', id: 'saved', del: true },
      { kind: 'template', id: 'template', del: true },
    ]);
  });

  it('checks replacement identities separately for each collection', () => {
    const item: Item = { id: 'shared', parent: null, pos: 'a0', title: '', note: '', status: null, tags: [], hidden: false,
      archived: false, archivedAt: null, created: 0, doneAt: null, prevStatus: null };
    const status: Status = { id: 'shared', name: 'Todo', icon: null, color: '#444', pos: 'a0', done: false };
    const db = { ...current, items: { shared: item }, statuses: { shared: status } };
    const ops = importOps({ ...backup, items: [item] }, db, true);
    expect(ops).toContainEqual({ kind: 'status', id: 'shared', del: true });
    expect(ops).not.toContainEqual({ kind: 'item', id: 'shared', del: true });
  });

  it('preserves named groups, membership and saved custom grouping together', () => {
    const item: Item = { id: 'grouped', parent: null, pos: 'a0', title: 'Work', note: '', status: null, tags: [], hidden: false,
      archived: false, archivedAt: null, created: 0, doneAt: null, prevStatus: null, customGroup: 'project' };
    const groups = [{ id: 'project', name: 'Project', color: '#444', pos: 'a0' }];
    const ops = importOps({ ...backup, items: [item], views: [{ ...saved, filter: { ...saved.filter, group: 'custom' } }],
      settings: { 'custom-groups': { groups } } }, current, false);
    expect(ops.find((op) => op.kind === 'item')?.set?.customGroup).toBe('project');
    expect(ops.find((op) => op.kind === 'view')?.set?.filter).toMatchObject({ group: 'custom' });
    expect(ops).toContainEqual({ kind: 'setting', id: 'custom-groups', set: { groups } });
  });

  it('rejects malformed collections before any mutation', () => {
    expect(() => importOps({ ...backup, views: 'bad' } as unknown as ArborExport, current, true)).toThrow('Invalid view data');
  });
});
