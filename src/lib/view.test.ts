import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomGroup, Item } from './types';

const fixture = vi.hoisted(() => ({
  items: {} as Record<string, Item>,
  children: new Map<string | null, Item[]>(),
  groups: [] as CustomGroup[],
  collapsed: new Set<string>(),
  collapsedGroups: new Set<string>(),
  zoom: null as string | null,
  search: '',
  editing: null as { id: string } | null,
}));
vi.mock('./model.svelte', () => ({
  db: { get items() { return fixture.items; }, statuses: {}, tags: {} },
  model: {
    get children() { return fixture.children; },
    get customGroups() { return fixture.groups; },
    statusList: [], tagList: [], tagTree: [], archivedRoots: [],
    tags: { paths: new Map() },
    isDone: () => false, tagPath: () => '', tagFamily: () => [],
  },
}));
vi.mock('./ui.svelte', () => ({ ui: {
  view: 'outline', sort: 'custom', sortDirection: 'asc', group: 'custom',
  showHidden: false, hideDone: false, tagMode: 'any', filterStatus: new Set(), filterTags: new Set(),
  get filtering() { return !!fixture.search; },
  get search() { return fixture.search; },
  get zoom() { return fixture.zoom; },
  get collapsed() { return fixture.collapsed; },
  get editing() { return fixture.editing; },
  isGroupOpen: (key: string) => !fixture.collapsedGroups.has(key),
} }));

const item = (id: string, customGroup: string | null, parent: string | null = null): Item => ({
  id, parent, customGroup, pos: id, title: id, note: '', status: null, tags: [], hidden: false,
  archived: false, archivedAt: null, created: 0, doneAt: null, prevStatus: null,
});

beforeEach(() => {
  vi.resetModules();
  fixture.groups = [{ id: 'class', name: 'Class', pos: 'a0' }, { id: 'later', name: 'Later', pos: 'a1' }];
  fixture.items = {};
  fixture.children = new Map();
  fixture.collapsed = new Set();
  fixture.collapsedGroups = new Set();
  fixture.zoom = null;
  fixture.search = '';
  fixture.editing = null;
});

function seed(...items: Item[]) {
  fixture.items = Object.fromEntries(items.map((it) => [it.id, it]));
  for (const it of items) {
    const list = fixture.children.get(it.parent) ?? [];
    list.push(it);
    fixture.children.set(it.parent, list);
  }
}

describe('collapsible custom sections', () => {
  it('keeps collapsed headings while removing hidden items and their subtrees from navigation', async () => {
    seed(item('lecture', 'class'), item('child', null, 'lecture'), item('idea', 'later'));
    fixture.collapsedGroups.add('section:root:custom:class');
    const { view } = await import('./view.svelte');
    expect(view.entries.map((entry) => entry.kind)).toEqual(['section', 'section', 'row']);
    expect(view.rows.map((row) => row.id)).toEqual(['idea']);
    const heading = view.entries[0];
    expect(heading.kind === 'section' && heading.section).toMatchObject({ label: 'Class', count: 1, open: false });
    expect(view.index.has('lecture')).toBe(false);
    expect(view.index.has('child')).toBe(false);
  });

  it('keeps sub-items under their parent and excludes headings from next/previous navigation', async () => {
    seed(item('lecture', 'class'), item('child', null, 'lecture'), item('idea', 'later'));
    const { view } = await import('./view.svelte');
    expect(view.rows.map((row) => [row.id, row.depth])).toEqual([['lecture', 0], ['child', 1], ['idea', 0]]);
    expect(view.next('lecture')).toBe('child');
    expect(view.next('child')).toBe('idea');
    expect(view.prev('idea')).toBe('child');
    expect(view.entries.filter((entry) => entry.kind === 'section')).toHaveLength(2);
  });

  it('avoids repeating an inherited named group under each parent', async () => {
    seed(item('lecture', 'class'), item('child', 'class', 'lecture'), item('grandchild', 'class', 'child'));
    const { view } = await import('./view.svelte');
    expect(view.rows.map((row) => [row.id, row.depth])).toEqual([['lecture', 0], ['child', 1], ['grandchild', 2]]);
    expect(view.entries.filter((entry) => entry.kind === 'section').map((entry) => entry.key)).toEqual([
      'section:root:custom:class', 'section:root:custom:later',
    ]);
  });

  it('retains separate nested headings when children belong to different groups', async () => {
    seed(item('lecture', 'class'), item('child1', 'class', 'lecture'), item('child2', 'later', 'lecture'));
    const { view } = await import('./view.svelte');
    expect(view.entries.filter((entry) => entry.kind === 'section').map((entry) => entry.key)).toEqual([
      'section:root:custom:class', 'section:lecture:custom:class', 'section:lecture:custom:later', 'section:root:custom:later',
    ]);
  });

  it('shows empty named groups at the current root without item placeholders', async () => {
    const { view } = await import('./view.svelte');
    expect(view.rows).toEqual([]);
    expect(view.entries.map((entry) => entry.key)).toEqual(['section:root:custom:class', 'section:root:custom:later']);
  });

  it('scopes collapse to each parent and suppresses empty groups while searching', async () => {
    seed(item('project', null), item('lecture', 'class', 'project'));
    fixture.zoom = 'project';
    fixture.search = 'lecture';
    fixture.collapsedGroups.add('section:root:custom:class');
    const { view } = await import('./view.svelte');
    expect(view.rows.map((row) => row.id)).toEqual(['lecture']);
    expect(view.entries.map((entry) => entry.key)).toEqual(['section:project:custom:class', 'lecture']);
  });

  it('keeps an active new editor and its ancestor context visible until editing ends', async () => {
    seed(item('project', null), item('blank', 'class', 'project'), item('other', 'later'));
    fixture.items.blank.title = '';
    fixture.search = 'not yet typed';
    fixture.editing = { id: 'blank' };
    const { view } = await import('./view.svelte');
    expect(view.rows.map((row) => [row.id, row.context])).toEqual([['project', true], ['blank', false]]);
    fixture.editing = null;
    vi.resetModules();
    const { view: afterEdit } = await import('./view.svelte');
    expect(afterEdit.rows).toEqual([]);
    expect(afterEdit.entries).toEqual([]);
  });
});
