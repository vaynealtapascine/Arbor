import { describe, expect, it } from 'vitest';
import { parseQuery, queryMatcher, queryTerms, type Resolver } from './query';
import type { Item } from './types';

//  backlog        writing      personal      gift        done / todo
const family: Record<string, string[]> = {
  backlog: ['backlog', 'backlog-old'], // #backlog covers what is nested under it
  writing: ['writing'],
  personal: ['personal'],
  gift: ['gift'],
};
const paths: Record<string, string> = {
  backlog: 'backlog',
  'backlog-old': 'backlog/old',
  writing: 'writing',
  personal: 'personal',
  gift: 'personal/gift',
};
const statuses: Record<string, string> = { done: 'Done', todo: 'To-Do' };

const r: Resolver = {
  // An empty list is the contract for "no tags at all", as the app's own resolver does.
  tags: (w) => family[w.toLowerCase()] ?? (w.toLowerCase() === 'none' ? [] : null),
  status: (w) => {
    const key = w.toLowerCase().replace(/-/g, '');
    return key === 'done' ? 'done' : key === 'todo' ? 'todo' : w.toLowerCase() === 'none' ? 'none' : null;
  },
  path: (id) => paths[id] ?? id,
  statusName: (id) => statuses[id] ?? '',
};

const item = (p: Partial<Item>): Item =>
  ({ id: 'i', parent: null, pos: 'a0', title: '', note: '', status: null, tags: [], hidden: false,
     archived: false, archivedAt: null, created: 0, doneAt: null, prevStatus: null, ...p }) as Item;

const find = (q: string, items: Item[]) => items.filter(queryMatcher(q, r)).map((i) => i.title);

describe('the search box', () => {
  const items = [
    item({ title: 'write the card', tags: ['writing'] }),
    item({ title: 'old idea', tags: ['backlog-old'] }),
    item({ title: 'buy a present', tags: ['personal', 'gift'], status: 'todo' }),
    item({ title: 'write thanks', tags: ['personal'], status: 'done' }),
    item({ title: 'nothing at all' }),
  ];

  it('still works the plain way: every word must appear', () => {
    expect(find('write', items)).toEqual(['write the card', 'write thanks']);
    expect(find('write card', items)).toEqual(['write the card']);
    expect(find('', items)).toHaveLength(5);
  });

  it('excludes with a leading minus, nested tags included', () => {
    // "old idea" carries backlog/old, not #backlog itself.
    expect(find('-#backlog', items)).toEqual(['write the card', 'buy a present', 'write thanks', 'nothing at all']);
    expect(find('#backlog', items)).toEqual(['old idea']);
    expect(find('write -@done', items)).toEqual(['write the card']);
  });

  it('takes the example, brackets and all', () => {
    // "write thanks" is #personal but not #gift, so the right-hand side fails.
    expect(find('(@done OR @To-Do) AND (#writing OR (#personal AND #gift))', items)).toEqual(['buy a present']);
    expect(find('write ((-#gift OR #writing) AND (#personal AND -#gift))', items)).toEqual(['write thanks']);
  });

  it('reads OR and AND only in capitals, so the words stay searchable', () => {
    const words = [item({ title: 'salt and pepper' }), item({ title: 'salt' })];
    expect(find('salt and pepper', words)).toEqual(['salt and pepper']);
    expect(find('pepper OR salt', words)).toEqual(['salt and pepper', 'salt']);
  });

  it('understands | and & as well', () => {
    expect(find('#writing | #gift', items)).toEqual(['write the card', 'buy a present']);
    expect(find('#personal & @done', items)).toEqual(['write thanks']);
  });

  it('matches a phrase in quotes as one thing', () => {
    expect(find('"write the"', items)).toEqual(['write the card']);
    expect(find('"write the card"', items)).toEqual(['write the card']);
  });

  it('knows what has no status and no tags', () => {
    expect(find('@none', items)).toEqual(['write the card', 'old idea', 'nothing at all']);
    expect(find('#none', items)).toEqual(['nothing at all']);
  });

  it('searches notes, tag paths and status names too', () => {
    const notes = [item({ title: 'a', note: 'call the printer' }), item({ title: 'b', tags: ['gift'] })];
    expect(find('printer', notes)).toEqual(['a']);
    // personal/gift: the parent's name is in the path.
    expect(find('personal', notes)).toEqual(['b']);
  });

  it('keeps narrowing while a tag name is still being typed', () => {
    // "#writ" names no tag yet, so it matches the tags' text instead.
    expect(find('#writ', items)).toEqual(['write the card']);
  });
});

describe('a query that does not parse', () => {
  const items = [item({ title: 'half typed (' }), item({ title: 'other' })];

  it('never throws, whatever is in the box', () => {
    for (const q of ['(', ')', '(()', 'a OR', 'OR', '-', '"unclosed', '((#a AND) OR', '- - -', '!']) {
      expect(() => queryMatcher(q, r)).not.toThrow();
      expect(() => parseQuery(q)).not.toThrow();
    }
  });

  it('still finds things while brackets are half typed', () => {
    expect(find('half (', items)).toEqual(['half typed (']);
    expect(find('(half', items)).toEqual(['half typed (']);
  });

  it('treats a dangling operator as nothing at all', () => {
    expect(find('other OR', items)).toEqual(['other']);
    expect(find('other AND', items)).toEqual(['other']);
  });
});

describe('what gets highlighted', () => {
  it('is the words asked for, not the tags or the exclusions', () => {
    expect(queryTerms('write #writing -draft @done "two words"')).toEqual(['write', 'two words']);
    expect(queryTerms('(a OR b) AND -c')).toEqual(['a', 'b']);
  });
});
