import { describe, expect, it } from 'vitest';
import { arrangeItems, arrangementFor, groupForItem, type ArrangementCatalog } from './arrangement';
import type { Item, Status, Tag } from './types';

const item = (id: string, fields: Partial<Item> = {}): Item => ({
  id, parent: null, pos: id, title: id, note: '', status: null, tags: [], hidden: false,
  archived: false, archivedAt: null, created: 0, doneAt: null, prevStatus: null, ...fields,
});
const status = (id: string): Status => ({ id, name: id, pos: id, icon: null, color: '#aabbcc', done: false });
const tag = (id: string): Tag => ({ id, name: id, pos: id, icon: null, color: '#aabbcc' });
const catalog: ArrangementCatalog = {
  statuses: [status('todo'), status('done')],
  tags: [tag('work'), tag('home')],
  customGroups: [{ id: 'class', name: 'Class', pos: 'a0', color: '#aa8844' }, { id: 'later', name: 'Later', pos: 'a1' }],
  tagLabel: (id) => `project/${id}`,
};
const ids = (items: Item[]) => items.map((i) => i.id);

describe('view arrangement', () => {
  it('gives old saved views and invalid preferences custom order without sections', () => {
    for (const raw of [{}, { sort: 'bogus', group: 'bogus' }, null, 'bad']) {
      expect(arrangementFor(raw)).toEqual({ sort: 'custom', sortDirection: 'asc', group: 'none' });
    }
    expect(arrangementFor({ sort: 'custom', sortDirection: 'desc', group: 'status' })).toEqual({
      sort: 'custom', sortDirection: 'asc', group: 'status',
    });
  });

  it('keeps byte order for fractional positions, including deterministic position ties', () => {
    const items = [item('b', { pos: 'a1' }), item('a', { pos: 'aZ' }), item('c', { pos: 'a1' })];
    expect(ids(arrangeItems(items, arrangementFor({}), catalog)[0].items)).toEqual(['b', 'c', 'a']);
    expect(ids(items)).toEqual(['b', 'a', 'c']);
  });

  it('sorts titles naturally while retaining custom position for equal titles', () => {
    const items = [item('a0', { title: 'Task 10' }), item('a1', { title: 'task 2' }), item('a2', { title: 'TASK 2' })];
    expect(ids(arrangeItems(items, arrangementFor({ sort: 'title' }), catalog)[0].items)).toEqual(['a1', 'a2', 'a0']);
    expect(ids(arrangeItems(items, arrangementFor({ sort: 'title', sortDirection: 'desc' }), catalog)[0].items)).toEqual(['a0', 'a1', 'a2']);
  });

  it('keeps pins first even when sorting newest first', () => {
    const items = [item('a0', { created: 40 }), item('a1', { created: 10, pinned: true }), item('a2', { created: 20 })];
    expect(ids(arrangeItems(items, arrangementFor({ sort: 'created', sortDirection: 'desc' }), catalog)[0].items)).toEqual(['a1', 'a0', 'a2']);
  });

  it('sorts statuses in configured order and puts missing statuses last', () => {
    const items = [item('a0', { status: 'done' }), item('a1'), item('a2', { status: 'todo' }), item('a3', { status: 'deleted' })];
    expect(ids(arrangeItems(items, arrangementFor({ sort: 'status' }), catalog)[0].items)).toEqual(['a2', 'a0', 'a1', 'a3']);
  });

  it('supports sections with custom order and keeps pins inside each section', () => {
    const items = [item('a0', { status: 'done' }), item('a1', { status: 'todo' }), item('a2', { status: 'todo', pinned: true }), item('a3')];
    const sections = arrangeItems(items, arrangementFor({ group: 'status' }), catalog);
    expect(sections.map((s) => [s.group?.label, ids(s.items)])).toEqual([
      ['todo', ['a2', 'a1']], ['done', ['a0']], ['No status', ['a3']],
    ]);
  });

  it('puts a multi-tag item in exactly one section and handles deleted tags', () => {
    const both = item('a0', { tags: ['home', 'work'] });
    const items = [both, item('a1', { tags: ['home'] }), item('a2', { tags: ['deleted'] })];
    const sections = arrangeItems(items, arrangementFor({ group: 'tag' }), catalog);
    expect(sections.map((s) => [s.group?.label, ids(s.items)])).toEqual([
      ['project/work', ['a0']], ['project/home', ['a1']], ['No tag', ['a2']],
    ]);
    expect(groupForItem(both, 'tag', catalog)?.key).toBe('work');
    expect(sections.flatMap((s) => s.items)).toHaveLength(3);
  });

  it('groups by reusable named sections independently of tags/status and preserves manual order', () => {
    const items = [item('a0', { customGroup: 'later', tags: ['work'] }), item('a1', { customGroup: 'class', status: 'done' }),
      item('a2', { customGroup: 'class' }), item('a3', { customGroup: 'deleted' })];
    const sections = arrangeItems(items, arrangementFor({ group: 'custom' }), catalog);
    expect(sections.map((s) => [s.group?.label, ids(s.items)])).toEqual([
      ['Class', ['a1', 'a2']], ['Later', ['a0']], ['Ungrouped', ['a3']],
    ]);
    expect(sections[0].group?.color).toBe('#aa8844');
  });

  it('keeps empty named groups available without inventing item rows', () => {
    const sections = arrangeItems([], arrangementFor({ group: 'custom' }), catalog, true);
    expect(sections.map((s) => [s.group?.label, s.items.length])).toEqual([['Class', 0], ['Later', 0]]);
    expect(arrangeItems([], arrangementFor({ group: 'custom' }), catalog)).toEqual([]);
  });
});
