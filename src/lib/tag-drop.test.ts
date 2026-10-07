import { describe, expect, it } from 'vitest';
import { projectTagDrop } from './tag-drop';
import { buildTagTree } from './tags';
import type { Tag } from './types';

const tree = buildTagTree([
  ['work', 'work', null], ['client', 'client', 'work'], ['billing', 'billing', 'client'],
  ['home', 'home', null], ['other', 'client', 'home'], ['last', 'last', null],
].map(([id, name, parent], i) => ({ id, name, parent, pos: String(i), color: '#64748b', icon: null }) as Tag));

describe('mouse tag movement', () => {
  it('moves beside a nested tag using its actual parent', () => {
    expect(projectTagDrop(tree, 'last', 'client', 'before')).toEqual({
      parent: 'work', before: 'client', label: 'Move before #work/client',
    });
  });
  it('uses the next sibling rather than the target’s children when dropping after', () => {
    expect(projectTagDrop(tree, 'last', 'work', 'after')).toEqual({
      parent: null, before: 'home', label: 'Move after #work',
    });
  });
  it('nests a whole branch and offers a way back to top level', () => {
    expect(projectTagDrop(tree, 'client', 'last', 'inside')).toEqual({
      parent: 'last', before: null, label: 'Nest under #last',
    });
    expect(projectTagDrop(tree, 'client', null, 'inside')).toEqual({
      parent: null, before: null, label: 'Move to top level',
    });
  });
  it('blocks drops onto the source or anywhere in its own branch', () => {
    for (const placement of ['before', 'inside', 'after'] as const) {
      expect(projectTagDrop(tree, 'work', 'billing', placement)).toMatch(/inside itself/);
      expect(projectTagDrop(tree, 'work', 'work', placement)).toMatch(/inside itself/);
    }
  });
  it('blocks ambiguous sibling names and stale destinations', () => {
    expect(projectTagDrop(tree, 'client', 'home', 'inside')).toMatch(/already exists/);
    expect(projectTagDrop(tree, 'client', 'deleted', 'inside')).toMatch(/no longer exists/);
    expect(projectTagDrop(tree, 'deleted', 'work', 'inside')).toMatch(/no longer exists/);
  });
});
