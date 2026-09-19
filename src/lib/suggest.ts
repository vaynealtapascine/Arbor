import { model } from './model.svelte';
import { tokenName } from './parse';
import type { Suggestion } from '../components/Suggest.svelte';
import { fold } from './util';

/** Autocomplete entries for a `#tag` or `@status` token being typed. */
export function suggestionsFor(sigil: '#' | '@', query: string): Suggestion[] {
  const q = fold(query);
  if (sigil === '@') {
    return model.statusList
      .filter((s) => !q || fold(s.name).includes(q))
      .slice(0, 9)
      .map((s) => ({ key: s.id, label: s.name, color: s.color, icon: s.icon, sigil }));
  }
  const matches = model.tagList
    .filter((t) => !q || fold(t.name).includes(q))
    .sort((a, b) => Number(fold(b.name).startsWith(q)) - Number(fold(a.name).startsWith(q)))
    .slice(0, 8)
    .map((t) => ({ key: t.id, label: t.name, color: t.color, icon: t.icon, sigil }) as Suggestion);
  if (query && !model.tagList.some((t) => fold(t.name) === q)) {
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
