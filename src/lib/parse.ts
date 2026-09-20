// Quick-entry syntax:
//   Fix login #backend #urgent @doing :: note text
// `#name` tags (new names create tags), `@name` sets a status (prefix match),
// ` :: ` starts the note. `\#` and `\@` keep a literal character.
// A tag can sit under another: `#work/client` means "client" inside "work".
import { tagPaths } from './tags';
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

/**
 * The tag `#query` names: its whole path, or - so short names still work for
 * nested tags - its own name, preferring one at the top level.
 */
export function findTag(query: string, tags: Tag[], paths = tagPaths(tags)): Tag | undefined {
  const q = fold(query);
  if (!q) return undefined;
  const byPath = tags.find((t) => fold(paths.get(t.id) ?? t.name) === q);
  if (byPath || q.includes('/')) return byPath;
  const named = tags.filter((t) => fold(t.name) === q);
  return named.find((t) => !t.parent) ?? named[0];
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
  const paths = tagPaths(tags);
  let status: string | undefined;

  const title = text
    .replace(TOKEN, (whole, lead: string, sigil: string, raw: string) => {
      const name = raw.replace(/[.'&+/-]+$/, '');
      const trailing = raw.slice(name.length);
      if (!name) return whole;
      if (sigil === '#') {
        const tag = findTag(name, tags, paths);
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
  note: string;
  children: OutlineNode[];
}

/**
 * Turns pasted text into a tree: indentation (spaces/tabs) nests, and common
 * bullets (-, *, +, •, 1.), checkboxes ([ ], [x]) and headings (#, ##) are understood.
 * "> text" lines become the note of the item above them (how Arbor exports notes).
 */
export function parseOutline(text: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: { indent: number; node: OutlineNode }[] = [];
  let last: OutlineNode | null = null;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) continue;
    const quote = /^\s*>\s?(.*)$/.exec(raw);
    if (quote && last) {
      last.note = last.note ? `${last.note}\n${quote[1]}` : quote[1];
      continue;
    }
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
    const node: OutlineNode = { text: line.trim(), done, note: '', children: [] };
    if (!node.text) continue;
    last = node;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ indent, node });
  }
  return roots;
}

export function isMultiline(text: string): boolean {
  return text.split(/\r?\n/).filter((l) => l.trim()).length > 1;
}
