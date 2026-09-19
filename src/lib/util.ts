import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Random 14-character id. Uses getRandomValues because randomUUID is missing
 * outside secure contexts (plain http:// over the tailnet).
 */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % 62];
  return out;
}

/** A sort key strictly between `a` and `b` (either may be null for the ends). */
export function keyBetween(a: string | null | undefined, b: string | null | undefined): string {
  a = a || null;
  b = b || null;
  try {
    if (a && b && a >= b) return generateKeyBetween(a, null);
    return generateKeyBetween(a, b);
  } catch {
    // Corrupt keys (e.g. hand-edited data): fall back to appending after `a`.
    return generateKeyBetween(null, null) + ALPHABET[Math.floor(Math.random() * 62)];
  }
}

export function keysBetween(a: string | null | undefined, b: string | null | undefined, n: number): string[] {
  a = a || null;
  b = b || null;
  try {
    if (a && b && a >= b) b = null;
    return generateNKeysBetween(a, b, n);
  } catch {
    const out: string[] = [];
    let prev = a;
    for (let i = 0; i < n; i++) out.push((prev = keyBetween(prev, null)));
    return out;
  }
}

/** Byte-order comparison: fractional keys must not be compared with localeCompare. */
export function byPos<T extends { pos: string; id: string }>(a: T, b: T): number {
  if (a.pos < b.pos) return -1;
  if (a.pos > b.pos) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Case-, space- and punctuation-insensitive key for matching names while typing. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_\-./]+/g, '');
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args: A) => {
    clearTimeout(t);
    fn(...args);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function relativeTime(ms: number, now = Date.now()): string {
  const s = Math.round((now - ms) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
