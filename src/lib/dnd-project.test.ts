import { describe, expect, it } from 'vitest';
import { draggedDepth, projectDrop, type ReorderBand } from './dnd-project';

const unpinned: ReorderBand = { group: '', pinned: false };
const rows = ['a1', 'a2', 'b1'].map((id) => ({ id, depth: 0 }));
const parentOf = () => null;

describe('custom order drop projection', () => {
  it('reorders at the beginning of a later section using its first row', () => {
    const bandOf = (id: string) => ({ group: id.startsWith('a') ? 'A' : 'B', pinned: false });
    expect(projectDrop(rows, 2, 0, null, parentOf, bandOf, { group: 'B', pinned: false }))
      .toEqual({ parent: null, where: { before: 'b1' }, depth: 0 });
  });

  it('reorders at the beginning of the unpinned band after pinned rows', () => {
    const bandOf = (id: string) => ({ group: '', pinned: id.startsWith('a') });
    expect(projectDrop(rows, 2, 0, null, parentOf, bandOf, unpinned))
      .toEqual({ parent: null, where: { before: 'b1' }, depth: 0 });
  });

  it('keeps the end of a section anchored to that section instead of the next one', () => {
    const bandOf = (id: string) => ({ group: id.startsWith('a') ? 'A' : 'B', pinned: false });
    expect(projectDrop(rows, 2, 0, null, parentOf, bandOf, { group: 'A', pinned: false }))
      .toEqual({ parent: null, where: { after: 'a2' }, depth: 0 });
  });

  it('keeps vertical movement at its original depth regardless of handle position', () => {
    expect(draggedDepth(0, 0, 26)).toBe(0);
    expect(draggedDepth(2, 0, 26)).toBe(2);
    expect(draggedDepth(1, 26, 26)).toBe(2);
    expect(draggedDepth(1, -26, 26)).toBe(0);
  });

  it('nests into the preceding item after deliberate horizontal movement', () => {
    expect(projectDrop(rows, 3, 1, null, parentOf, () => unpinned, unpinned))
      .toEqual({ parent: 'b1', where: 'end', depth: 1 });
  });

  it('climbs out of a branch when dropping at the root depth', () => {
    const branch = [{ id: 'parent', depth: 0 }, { id: 'child', depth: 1 }];
    expect(projectDrop(branch, 2, 0, null, (id) => id === 'child' ? 'parent' : null, () => unpinned, unpinned))
      .toEqual({ parent: null, where: { after: 'parent' }, depth: 0 });
  });

  it('inserts into the zoom root when every visible row is being dragged', () => {
    expect(projectDrop([], 0, 0, 'zoom', parentOf, () => unpinned, unpinned))
      .toEqual({ parent: 'zoom', where: 'start', depth: 0 });
  });
});
