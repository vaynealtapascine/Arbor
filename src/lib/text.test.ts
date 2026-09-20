import { describe, expect, it } from 'vitest';
import { notePreview, segments, toggleTask } from './text';

describe('note previews', () => {
  it('skips a leading picture for the first line with something to read', () => {
    expect(notePreview('![](https://example.com/shot.png)\n\nThe actual text')).toBe('The actual text');
    expect(notePreview('![a diagram](/x.png)')).toBe('a diagram');
  });

  it('strips the usual markdown punctuation', () => {
    expect(notePreview('## Heading **bold**')).toBe('Heading bold');
    expect(notePreview('- [ ] a [link](http://x.dev)')).toBe('a link');
    expect(notePreview('\n\n> quoted `code`')).toBe('quoted code');
  });

  it('is empty when there is nothing to show', () => {
    expect(notePreview('')).toBe('');
    expect(notePreview('![](/only-a-picture.png)')).toBe('');
  });
});

describe('task lists', () => {
  it('flips the checkbox that was clicked, and only that one', () => {
    const src = '- [ ] one\n- [ ] two\n- [x] three';
    expect(toggleTask(src, 1)).toBe('- [ ] one\n- [x] two\n- [x] three');
    expect(toggleTask(src, 2)).toBe('- [ ] one\n- [ ] two\n- [ ] three');
  });
});

describe('title segments', () => {
  it('splits out links and highlights search terms', () => {
    expect(segments('see https://x.dev/a now')).toEqual([
      { text: 'see ' },
      { text: 'x.dev/a', href: 'https://x.dev/a' },
      { text: ' now' },
    ]);
    expect(segments('fix the login', 'login')).toEqual([{ text: 'fix the ' }, { text: 'login', mark: true }]);
  });
});
