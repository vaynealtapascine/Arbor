import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.use({ gfm: true, breaks: true });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  // Task-list checkboxes are clickable (they toggle the source text).
  if (node.tagName === 'INPUT') node.removeAttribute('disabled');
});

export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(marked.parse(src, { async: false }) as string);
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
  const terms = search.trim().toLowerCase().split(/\s+/).filter((t) => t && !/^[#@]/.test(t));
  if (!terms.length) return [{ text }];
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text
    .split(re)
    .filter(Boolean)
    .map((part) => (terms.includes(part.toLowerCase()) ? { text: part, mark: true } : { text: part }));
}

/** First non-empty line of a note, stripped of markdown punctuation, for previews. */
export function notePreview(note: string): string {
  const line = note.split('\n').find((l) => l.trim()) ?? '';
  return line
    .replace(/^\s*(#{1,6}|[-*+]|\d+[.)]|>)\s+/, '')
    .replace(/\[([ xX])\]\s*/, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}
