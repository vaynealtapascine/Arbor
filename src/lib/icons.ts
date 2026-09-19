// The full icon and emoji catalogues are big, so they load on first use of the picker.
import emojiUrl from '../generated/emoji.json?url';
import tablerUrl from '../generated/tabler.json?url';
import type { IconRef } from './types';

export interface TablerCatalog {
  categories: string[];
  /** [name, categoryIndex, keywords, svgBody, filled?] */
  icons: [string, number, string, string, 1?][];
}

export interface EmojiCatalog {
  groups: string[];
  /** [emoji, label, keywords, groupIndex] */
  emoji: [string, string, string, number][];
}

let tabler: Promise<TablerCatalog> | null = null;
let emoji: Promise<EmojiCatalog> | null = null;

export function loadTabler() {
  tabler ??= fetch(tablerUrl).then((r) => {
    if (!r.ok) throw new Error(`Icon catalogue: HTTP ${r.status}`);
    return r.json();
  });
  tabler.catch(() => (tabler = null));
  return tabler;
}

export function loadEmoji() {
  emoji ??= fetch(emojiUrl).then((r) => {
    if (!r.ok) throw new Error(`Emoji catalogue: HTTP ${r.status}`);
    return r.json();
  });
  emoji.catch(() => (emoji = null));
  return emoji;
}

/** Ranks matches: exact name, name prefix, name contains, then keyword contains. */
export function rank(name: string, keywords: string, q: string): number {
  if (!q) return 1;
  if (name === q) return 100;
  if (name.startsWith(q)) return 60;
  if (name.includes(q)) return 40;
  if (keywords.split(' ').some((k) => k.startsWith(q))) return 20;
  if (keywords.includes(q)) return 10;
  return 0;
}

export function sameIcon(a: IconRef | null | undefined, b: IconRef | null | undefined) {
  return !!a && !!b && a.k === b.k && a.n === b.n;
}
