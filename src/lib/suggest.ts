import { model } from './model.svelte';
import { tokenName } from './parse';
import type { Suggestion } from '../components/Suggest.svelte';
import { fold } from './util';

/** Autocomplete entries for a `#tag`, `@status` or `>group` token being typed. */
export function suggestionsFor(sigil: '#' | '@' | '>', query: string): Suggestion[] {
  const q = fold(query);
  if (sigil === '@') {
    return model.statusList
      .filter((s) => !q || fold(s.name).includes(q))
      .slice(0, 9)
      .map((s) => ({ key: s.id, label: s.name, color: s.color, icon: s.icon, sigil }));
  }
  if (sigil === '>') {
    const matches = model.customGroups
      .filter((g) => !q || fold(g.name).includes(q))
      .sort((a, b) => Number(fold(b.name).startsWith(q)) - Number(fold(a.name).startsWith(q)))
      .slice(0, 8)
      .map(
        (g) =>
          ({
            key: g.id,
            label: g.name,
            color: g.color,
            sigil,
          }) as Suggestion,
      );
    if (query && !model.customGroups.some((g) => fold(g.name) === q)) {
      matches.push({ key: `new:${query}`, label: query, create: true, sigil });
    }
    return matches;
  }
  // Nested tags match on their path, so "cli" finds work/client and "work/"
  // lists what is inside work.
  const matches = model.tagTree
    .filter((n) => !q || fold(n.path).includes(q) || fold(n.tag.name).includes(q))
    .sort(
      (a, b) =>
        Number(fold(b.tag.name).startsWith(q)) - Number(fold(a.tag.name).startsWith(q)) ||
        Number(fold(b.path).startsWith(q)) - Number(fold(a.path).startsWith(q)),
    )
    .slice(0, 8)
    .map(
      (n) =>
        ({
          key: n.tag.id,
          label: n.path,
          color: n.tag.color,
          icon: n.tag.icon,
          sigil,
        }) as Suggestion,
    );
  if (query && !model.tagTree.some((n) => fold(n.path) === q || fold(n.tag.name) === q)) {
    matches.push({ key: `new:${query}`, label: query, create: true, sigil });
  }
  return matches;
}

/** Replaces the token at [start, end) with the canonical `#name ` text. */
export function completeToken(text: string, start: number, end: number, sigil: string, name: string) {
  const insert = `${sigil}${tokenName(name)} `;
  const rest = text.slice(end).replace(/^ /, '');
  return { text: text.slice(0, start) + insert + rest, caret: start + insert.length };
}
