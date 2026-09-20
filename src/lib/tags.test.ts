import { describe, expect, it } from 'vitest';
import { findTag, parseEntry } from './parse';
import { buildTagTree, tagPaths, tagsMatch } from './tags';
import type { Status, Tag } from './types';

const statuses: Status[] = [{ id: 's1', name: 'To do', icon: null, color: '#000', pos: 'a0', done: false }];

const tag = (id: string, name: string, pos: string, parent?: string): Tag => ({
  id,
  name,
  icon: null,
  color: '#000',
  pos,
  parent,
});

//  work            home
//    client          bug
//      bug
const nested: Tag[] = [
  tag('work', 'work', 'a0'),
  tag('client', 'client', 'a1', 'work'),
  tag('deep', 'bug', 'a2', 'client'),
  tag('home', 'home', 'a3'),
  tag('hbug', 'bug', 'a4', 'home'),
];

describe('the tag tree', () => {
  it('lays tags out in tree order with their paths', () => {
    expect(buildTagTree(nested).nodes.map((n) => [n.path, n.depth])).toEqual([
      ['work', 0],
      ['work/client', 1],
      ['work/client/bug', 2],
      ['home', 0],
      ['home/bug', 1],
    ]);
  });

  it('knows what is under a tag, and what a tag is under', () => {
    const { families, chains } = buildTagTree(nested);
    expect(families.get('work')).toEqual(['work', 'client', 'deep']);
    expect(families.get('deep')).toEqual(['deep']);
    expect(chains.get('deep')).toEqual(['deep', 'client', 'work']);
    expect(chains.get('work')).toEqual(['work']);
  });

  it('keeps every tag when the parent links are broken', () => {
    // Two devices can nest tags into each other, or into themselves, offline.
    const loop = [tag('a', 'a', 'a0', 'b'), tag('b', 'b', 'a1', 'a'), tag('s', 's', 'a2', 's'), tag('x', 'x', 'a3', 'gone')];
    const { nodes, families } = buildTagTree(loop);
    expect(nodes.map((n) => n.path)).toEqual(['a', 'b', 's', 'x']);
    expect(families.get('a')).toEqual(['a']);
  });
});

describe('matching a tag filter', () => {
  const { families } = buildTagTree(nested);
  const familyOf = (id: string) => families.get(id) ?? [id];

  it('a tag covers everything nested under it', () => {
    // The item carries only the innermost tag.
    expect(tagsMatch(['deep'], [familyOf('work')], 'any')).toBe(true);
    expect(tagsMatch(['deep'], [familyOf('client')], 'any')).toBe(true);
    expect(tagsMatch(['deep'], [familyOf('home')], 'any')).toBe(false);
  });

  it('never matches upwards', () => {
    expect(tagsMatch(['work'], [familyOf('client')], 'any')).toBe(false);
  });

  it('asks each selected tag separately in "all" mode', () => {
    expect(tagsMatch(['deep', 'hbug'], [familyOf('work'), familyOf('home')], 'all')).toBe(true);
    expect(tagsMatch(['deep'], [familyOf('work'), familyOf('home')], 'all')).toBe(false);
    expect(tagsMatch(['deep'], [familyOf('work'), familyOf('home')], 'any')).toBe(true);
  });
});

describe('writing a nested tag', () => {
  it('builds a path for every tag', () => {
    expect([...tagPaths(nested).values()]).toEqual(['work', 'work/client', 'work/client/bug', 'home', 'home/bug']);
  });

  it('resolves a written tag by path, then by name', () => {
    expect(findTag('work/client', nested)?.id).toBe('client');
    expect(findTag('WORK/CLIENT/BUG', nested)?.id).toBe('deep');
    // A short name still reaches a nested tag, so rapid entry stays short.
    expect(findTag('client', nested)?.id).toBe('client');
    // Two tags are named "bug"; neither is top level, so the first one wins.
    expect(findTag('bug', nested)?.id).toBe('deep');
    expect(findTag('work/missing', nested)).toBeUndefined();
  });

  it('prefers a top-level tag when a nested one shares its name', () => {
    const both = [...nested, tag('loose', 'client', 'a5')];
    expect(findTag('client', both)?.id).toBe('loose');
    expect(findTag('work/client', both)?.id).toBe('client');
  });

  it('reads #parent/child as one tag, and reports a new one as a path', () => {
    const p = parseEntry('Fix it #work/client #work/newthing', statuses, nested);
    expect(p.title).toBe('Fix it');
    expect(p.tagIds).toEqual(['client']);
    expect(p.newTags).toEqual(['work/newthing']);
  });

  it('keeps a trailing slash out of the name', () => {
    expect(parseEntry('Note #work/', statuses, nested).tagIds).toEqual(['work']);
  });
});
