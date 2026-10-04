import { describe, expect, it } from 'vitest';
import { tagRenameError } from './tag-rename';

const tags = [
  { id: 'work', name: 'work', parent: null },
  { id: 'client', name: 'client', parent: 'work' },
  { id: 'new', name: 'new', parent: 'client' },
  { id: 'home', name: 'home', parent: null },
];

describe('tag rename validation', () => {
  it('rejects moving a parent under an existing or newly created descendant', () => {
    expect(tagRenameError('work', 'office', 'client', tags)).toMatch(/inside itself/);
    expect(tagRenameError('work', 'office', 'new', tags)).toMatch(/inside itself/);
    expect(tagRenameError('work', 'office', 'work', tags)).toMatch(/inside itself/);
  });
  it('rejects ambiguous sibling names with the parser’s matching rules', () => {
    expect(tagRenameError('home', 'Wórk', null, tags)).toMatch(/already exists/);
    expect(tagRenameError('home', 'client', 'work', tags)).toMatch(/already exists/);
  });
  it('allows identical names under different parents and case-only renames', () => {
    expect(tagRenameError('home', 'client', null, tags)).toBeNull();
    expect(tagRenameError('work', 'Work', null, tags)).toBeNull();
    expect(tagRenameError('client', 'projects', 'home', tags)).toBeNull();
  });
});
