import { describe, expect, it } from 'vitest';
import { parseEntry, parseOutline, tokenAt } from './parse';
import type { Status, Tag } from './types';

const statuses: Status[] = [
  { id: 's1', name: 'To do', icon: null, color: '#000', pos: 'a0', done: false },
  { id: 's2', name: 'In progress', icon: null, color: '#000', pos: 'a1', done: false },
  { id: 's3', name: 'Done', icon: null, color: '#000', pos: 'a2', done: true },
];
const tags: Tag[] = [
  { id: 't1', name: 'urgent', icon: null, color: '#000', pos: 'a0' },
  { id: 't2', name: 'High Priority', icon: null, color: '#000', pos: 'a1' },
];

describe('parseEntry', () => {
  it('extracts tags, status and note', () => {
    const p = parseEntry('Fix login #urgent @in-progress :: check the cookie', statuses, tags);
    expect(p).toEqual({ title: 'Fix login', note: 'check the cookie', status: 's2', tagIds: ['t1'], newTags: [] });
  });

  it('creates unknown tags once and matches names loosely', () => {
    const p = parseEntry('#backend Refactor #Backend #high-priority #HighPriority.', statuses, tags);
    expect(p.title).toBe('Refactor .');
    expect(p.newTags).toEqual(['backend']);
    expect(p.tagIds).toEqual(['t2']);
  });

  it('prefix-matches statuses and leaves unknown @words alone', () => {
    expect(parseEntry('Ship it @to', statuses, tags).status).toBe('s1');
    expect(parseEntry('Ship it @do', statuses, tags).status).toBe('s3');
    const p = parseEntry('email @bob about it', statuses, tags);
    expect(p.status).toBeUndefined();
    expect(p.title).toBe('email @bob about it');
  });

  it('ignores # inside words and URLs, and honours escapes', () => {
    const p = parseEntry('Read https://x.dev/#intro and C# notes \\#not-a-tag', statuses, tags);
    expect(p.title).toBe('Read https://x.dev/#intro and C# notes #not-a-tag');
    expect(p.tagIds).toEqual([]);
    expect(p.newTags).toEqual([]);
  });
});

describe('tokenAt', () => {
  it('finds the token under the caret', () => {
    expect(tokenAt('Fix #urg', 8)).toEqual({ sigil: '#', query: 'urg', start: 4, end: 8 });
    expect(tokenAt('Fix @', 5)).toEqual({ sigil: '@', query: '', start: 4, end: 5 });
    expect(tokenAt('a#b', 3)).toBeNull();
    expect(tokenAt('plain text', 5)).toBeNull();
  });

  it('ends at the caret so completing never eats the following text', () => {
    // Typing "@done" in front of "loy" must not make "loy" part of the token.
    expect(tokenAt('Check @doneloy', 11)).toEqual({ sigil: '@', query: 'done', start: 6, end: 11 });
  });
});

describe('parseOutline', () => {
  it('nests by indentation and understands bullets and checkboxes', () => {
    const tree = parseOutline('- Project\n  - [x] done thing\n  - [ ] open thing\n    1. deep\n- Other');
    expect(tree).toEqual([
      {
        text: 'Project',
        done: false,
        note: '',
        children: [
          { text: 'done thing', done: true, note: '', children: [] },
          {
            text: 'open thing',
            done: false,
            note: '',
            children: [{ text: 'deep', done: false, note: '', children: [] }],
          },
        ],
      },
      { text: 'Other', done: false, note: '', children: [] },
    ]);
  });

  it('reads "> " lines as the note of the item above (Copy as Markdown round trip)', () => {
    const tree = parseOutline('- Launch\n  > line one\n  >\n  > line two\n  - Child\n    > child note');
    expect(tree[0].note).toBe('line one\n\nline two');
    expect(tree[0].children[0]).toMatchObject({ text: 'Child', note: 'child note' });
  });

  it('nests list items under markdown headings', () => {
    const tree = parseOutline('# Plan\n- a\n- b\n## Later\n- c');
    expect(tree.map((n) => n.text)).toEqual(['Plan']);
    expect(tree[0].children.map((n) => n.text)).toEqual(['a', 'b', 'Later']);
    expect(tree[0].children[2].children.map((n) => n.text)).toEqual(['c']);
  });
});
