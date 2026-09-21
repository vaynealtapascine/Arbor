// What you type in the search box.
//
//   write                     the word, in a title, a note, a tag or a status
//   #writing  @done           that tag (and anything nested under it), that status
//   -#backlog  !@done         not that; a leading - or ! negates whatever follows
//   "first draft"             an exact phrase
//   a b                       both, because terms are ANDed unless told otherwise
//   a OR b        a | b       either
//   (a OR b) AND c            groups, to any depth
//
// OR, AND and NOT are only operators in capitals, so searching for the words
// "or" and "and" still finds them. Anything that does not parse is treated as
// text rather than refused: a half-typed query has to keep finding things.
import type { Item } from './types';
import { fold } from './util';

export type Query =
  | { t: 'all' }
  | { t: 'text'; v: string }
  | { t: 'tag'; v: string }
  | { t: 'status'; v: string }
  | { t: 'not'; q: Query }
  | { t: 'and'; qs: Query[] }
  | { t: 'or'; qs: Query[] };

/** What the written names in a query mean here and now. */
export interface Resolver {
  /**
   * Every tag the written name covers - itself and anything nested - or null if
   * it names none. An empty list means "no tags at all" (`#none`).
   */
  tags(written: string): string[] | null;
  /** The status it names, 'none' for "no status at all", or null if it names none. */
  status(written: string): string | 'none' | null;
  /** A tag's full path, for matching text against. */
  path(id: string): string;
  /** A status's name, for matching text against. */
  statusName(id: string): string;
}

// ---------------------------------------------------------------- reading it

type Tok =
  | { k: '(' | ')' | 'and' | 'or' | 'not' }
  | { k: 'term'; sigil: '' | '#' | '@'; v: string };

const BREAK = /[\s()]/;

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '(' || c === ')') {
      out.push({ k: c });
      i++;
      continue;
    }
    if (c === '|' || c === '&') {
      // || and && are the same as one of them.
      while (src[i] === c) i++;
      out.push({ k: c === '|' ? 'or' : 'and' });
      continue;
    }
    if ((c === '-' || c === '!') && i + 1 < src.length && !BREAK.test(src[i + 1])) {
      out.push({ k: 'not' });
      i++;
      continue;
    }
    if (c === '"') {
      const end = src.indexOf('"', i + 1);
      const v = src.slice(i + 1, end === -1 ? src.length : end);
      if (v.trim()) out.push({ k: 'term', sigil: '', v });
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    let j = i;
    while (j < src.length && !BREAK.test(src[j])) j++;
    const word = src.slice(i, j);
    i = j;
    if (word === 'OR' || word === 'AND' || word === 'NOT') {
      out.push({ k: word.toLowerCase() as 'or' | 'and' | 'not' });
      continue;
    }
    const sigil = word[0] === '#' || word[0] === '@' ? (word[0] as '#' | '@') : '';
    // Trailing punctuation belongs to the sentence, not to the name.
    const v = sigil ? word.slice(1).replace(/[.,;:!?/'&+-]+$/, '') : word;
    if (v) out.push({ k: 'term', sigil, v });
  }
  return out;
}

/** Parses a query. Never throws: unbalanced brackets simply stop meaning anything. */
export function parseQuery(src: string): Query {
  const toks = tokenize(src);
  let at = 0;

  const peek = () => toks[at];
  const flat = (t: 'and' | 'or', qs: Query[]): Query =>
    qs.length === 0 ? { t: 'all' } : qs.length === 1 ? qs[0] : { t, qs };

  function parseOr(depth: number): Query {
    const qs = [parseAnd(depth)];
    while (peek()?.k === 'or') {
      at++;
      qs.push(parseAnd(depth));
    }
    return flat('or', qs.filter((q) => q.t !== 'all'));
  }

  function parseAnd(depth: number): Query {
    const qs: Query[] = [];
    for (;;) {
      const tok = peek();
      if (!tok) break;
      if (tok.k === 'or') break;
      if (tok.k === ')') {
        if (depth > 0) break;
        at++; // a stray closing bracket: ignore it rather than give up
        continue;
      }
      if (tok.k === 'and') {
        at++;
        continue;
      }
      const q = parseUnary(depth);
      if (q.t !== 'all') qs.push(q);
    }
    return flat('and', qs);
  }

  function parseUnary(depth: number): Query {
    if (peek()?.k === 'not') {
      at++;
      const q = parseUnary(depth);
      return q.t === 'all' ? q : { t: 'not', q };
    }
    const tok = peek();
    if (!tok) return { t: 'all' };
    if (tok.k === '(') {
      at++;
      const inner = parseOr(depth + 1);
      if (peek()?.k === ')') at++;
      return inner;
    }
    at++;
    if (tok.k !== 'term') return { t: 'all' };
    return tok.sigil === '#' ? { t: 'tag', v: tok.v } : tok.sigil === '@' ? { t: 'status', v: tok.v } : { t: 'text', v: tok.v };
  }

  const q = parseOr(0);
  return q;
}

/** The plain words in a query, for highlighting what was found. */
export function queryTerms(src: string): string[] {
  const out: string[] = [];
  const walk = (q: Query, negated: boolean) => {
    if (q.t === 'text' && !negated) out.push(q.v);
    else if (q.t === 'not') walk(q.q, !negated);
    else if (q.t === 'and' || q.t === 'or') for (const sub of q.qs) walk(sub, negated);
  };
  walk(parseQuery(src), false);
  return out;
}

// ---------------------------------------------------------------- running it

type Test = (it: Item, hay: () => string) => boolean;

/** Turns a query into a test, resolving every name it mentions once. */
function compile(q: Query, r: Resolver): Test {
  switch (q.t) {
    case 'all':
      return () => true;
    case 'text': {
      const v = q.v.toLowerCase();
      return (_it, hay) => hay().includes(v);
    }
    case 'tag': {
      const ids = r.tags(q.v);
      if (ids) {
        if (!ids.length) return (it) => it.tags.length === 0; // "#none": untagged
        const set = new Set(ids);
        return (it) => it.tags.some((t) => set.has(t));
      }
      // No such tag - yet. Match the text of the tag names, so a half-typed
      // "#wri" still narrows the way it always did.
      const v = fold(q.v);
      if (!v) return () => false;
      return (it) => it.tags.some((t) => fold(r.path(t)).includes(v));
    }
    case 'status': {
      const id = r.status(q.v);
      if (id === 'none') return (it) => !it.status;
      if (id) return (it) => it.status === id;
      const v = fold(q.v);
      if (!v) return () => false;
      return (it) => !!it.status && fold(r.statusName(it.status)).includes(v);
    }
    case 'not': {
      const inner = compile(q.q, r);
      return (it, hay) => !inner(it, hay);
    }
    case 'and': {
      const parts = q.qs.map((x) => compile(x, r));
      return (it, hay) => parts.every((p) => p(it, hay));
    }
    case 'or': {
      const parts = q.qs.map((x) => compile(x, r));
      return (it, hay) => parts.some((p) => p(it, hay));
    }
  }
}

/**
 * A test for one written query. Text is matched against the title, the note,
 * the tags' full paths and the status name - so `#writ` finds `#writing` and a
 * word in a note finds the item it belongs to.
 */
export function queryMatcher(src: string, r: Resolver): (it: Item) => boolean {
  if (!src.trim()) return () => true;
  const test = compile(parseQuery(src), r);
  return (it) => {
    let cached: string | null = null;
    const hay = () => {
      if (cached === null) {
        cached = `${it.title} ${it.note} ${it.tags.map((t) => '#' + r.path(t)).join(' ')} ${
          it.status ? '@' + r.statusName(it.status) : ''
        }`.toLowerCase();
      }
      return cached;
    };
    return test(it, hay);
  };
}
