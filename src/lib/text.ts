import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { queryTerms } from './query';

marked.use({ gfm: true, breaks: true });

let ready = false;

/**
 * Sanitising needs a DOM, so the hooks go on at first use rather than at import:
 * that keeps the rest of this module (previews, title segments) usable anywhere.
 */
function purifier() {
  if (!ready) {
    ready = true;
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
      // Task-list checkboxes are clickable (they toggle the source text).
      if (node.tagName === 'INPUT') node.removeAttribute('disabled');
      // A linked picture must not hold up the outline, and clicking it opens
      // the original rather than the note's editor.
      if (node.tagName === 'IMG') {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('decoding', 'async');
        node.setAttribute('data-zoom', '1');
      }
    });
  }
  return DOMPurify;
}

export function renderMarkdown(src: string): string {
  return purifier().sanitize(marked.parse(src, { async: false }) as string);
}

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/gm;

/** Flips the n-th task-list checkbox in markdown source. */
export function toggleTask(src: string, index: number): string {
  let i = -1;
  return src.replace(TASK, (m, a: string, c: string, b: string) => (++i === index ? a + (c === ' ' ? 'x' : ' ') + b : m));
}

export interface Segment {
  text: string;
  href?: string;
  mark?: boolean;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;

/** Splits a title into plain text, links and search-highlighted runs. */
export function segments(text: string, search = ''): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index! > last) out.push(...highlight(text.slice(last, m.index), search));
    out.push({ text: m[0].replace(/^https?:\/\/(www\.)?/, ''), href: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(...highlight(text.slice(last), search));
  return out;
}

function highlight(text: string, search: string): Segment[] {
  // Only the words the query asks for: not its tags, statuses or exclusions.
  const terms = queryTerms(search).map((t) => t.toLowerCase());
  if (!terms.length) return [{ text }];
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text
    .split(re)
    .filter(Boolean)
    .map((part) => (terms.includes(part.toLowerCase()) ? { text: part, mark: true } : { text: part }));
}

/** The first line of a note with something to read, stripped of markdown punctuation. */
export function notePreview(note: string): string {
  for (const line of note.split('\n')) {
    const text = line
      .replace(/^\s*(#{1,6}|[-*+]|\d+[.)]|>)\s+/, '')
      .replace(/\[([ xX])\]\s*/, '')
      // A picture has nothing to preview but its description, if it was given one.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
    if (text) return text;
  }
  return '';
}
