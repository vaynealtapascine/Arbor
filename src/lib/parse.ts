// Quick-entry syntax:
//   Fix login #backend #urgent @doing :: note text
// `#name` tags (new names create tags), `@name` sets a status (prefix match),
// ` :: ` starts the note. `\#` and `\@` keep a literal character.
import type { Status, Tag } from './types';
import { fold } from './util';

export interface ParsedEntry {
  title: string;
  note: string;
  /** Status id, or undefined when the text didn't name one. */
  status?: string;
  tagIds: string[];
  /** Tag names to create. */
  newTags: string[];
}

const TOKEN_CHARS = /[\p{L}\p{N}_\-/.+&']/u;
const TOKEN = /(^|\s)([#@])([\p{L}\p{N}_\-/.+&']+)/gu;

export function findStatus(query: string, statuses: Status[]): Status | undefined {
  const q = fold(query);
  if (!q) return undefined;
  return statuses.find((s) => fold(s.name) === q) ?? statuses.find((s) => fold(s.name).startsWith(q));
}

export function findTag(query: string, tags: Tag[]): Tag | undefined {
  const q = fold(query);
  return q ? tags.find((t) => fold(t.name) === q) : undefined;
}

export function parseEntry(text: string, statuses: Status[], tags: Tag[]): ParsedEntry {
  let note = '';
  const split = text.indexOf(' :: ');
  if (split >= 0) {
    note = text.slice(split + 4).trim();
    text = text.slice(0, split);
  } else if (text.trimEnd().endsWith(' ::')) {
    text = text.trimEnd().slice(0, -3);
  }

  const tagIds: string[] = [];
  const newTags: string[] = [];
  let status: string | undefined;

  const title = text
    .replace(TOKEN, (whole, lead: string, sigil: string, raw: string) => {
      const name = raw.replace(/[.'&+/-]+$/, '');
      const trailing = raw.slice(name.length);
      if (!name) return whole;
      if (sigil === '#') {
        const tag = findTag(name, tags);
        if (tag) {
          if (!tagIds.includes(tag.id)) tagIds.push(tag.id);
        } else if (!newTags.some((n) => fold(n) === fold(name))) {
          newTags.push(name);
        }
        return lead + trailing;
      }
      const st = findStatus(name, statuses);
      if (!st) return whole;
      status = st.id;
      return lead + trailing;
    })
    .replace(/\\([#@])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { title, note, status, tagIds, newTags };
}

/**
 * The `#…` or `@…` token being typed at the caret, for autocomplete. It ends
 * at the caret: text after it (e.g. when typing in front of a word) is never
 * part of the completion, so accepting one can't swallow it.
 */
export function tokenAt(text: string, caret: number): { sigil: '#' | '@'; query: string; start: number; end: number } | null {
  let start = caret;
  while (start > 0 && TOKEN_CHARS.test(text[start - 1])) start--;
  const sigil = text[start - 1];
  if (sigil !== '#' && sigil !== '@') return null;
  const before = text[start - 2];
  if (before !== undefined && !/\s/.test(before)) return null;
  return { sigil, query: text.slice(start, caret), start: start - 1, end: caret };
}

/** How a tag or status is written as a token. */
export const tokenName = (name: string) => name.trim().replace(/\s+/g, '-');

// ---------------------------------------------------------------- pasted outlines

export interface OutlineNode {
  text: string;
  done: boolean;
  children: OutlineNode[];
}

/**
 * Turns pasted text into a tree: indentation (spaces/tabs) nests, and common
 * bullets (-, *, +, •, 1.), checkboxes ([ ], [x]) and headings (#, ##) are understood.
 */
export function parseOutline(text: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: { indent: number; node: OutlineNode }[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) continue;
    const lead = /^[ \t]*/.exec(raw)![0];
    let indent = 0;
    for (const ch of lead) indent += ch === '\t' ? 4 : 1;
    let line = raw.slice(lead.length);
    const heading = /^(#{1,6})\s+/.exec(line);
    if (heading) {
      // Headings nest by level, ahead of any indented list under them.
      indent = (heading[1].length - 1) * 2 - 1000;
      line = line.slice(heading[0].length);
    }
    line = line.replace(/^([-*+•]|\d+[.)])\s+/, '');
    let done = false;
    const box = /^\[([ xX])\]\s*/.exec(line);
    if (box) {
      done = box[1] !== ' ';
      line = line.slice(box[0].length);
    }
    const node: OutlineNode = { text: line.trim(), done, children: [] };
    if (!node.text) continue;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ indent, node });
  }
  return roots;
}

export function isMultiline(text: string): boolean {
  return text.split(/\r?\n/).filter((l) => l.trim()).length > 1;
}
