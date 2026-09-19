import { db, model } from './model.svelte';

/** Markdown outline of items and their (non-archived) descendants. */
export function toMarkdown(ids: string[], includeNotes = true): string {
  const lines: string[] = [];
  const walk = (id: string, depth: number) => {
    const it = db.items[id];
    if (!it) return;
    const pad = '  '.repeat(depth);
    const box = it.status ? (model.isDone(it) ? '[x] ' : '[ ] ') : '';
    const tags = it.tags.map((t) => db.tags[t]?.name).filter(Boolean).map((n) => ` #${n!.replace(/\s+/g, '-')}`).join('');
    lines.push(`${pad}- ${box}${it.title}${tags}`);
    if (includeNotes && it.note.trim()) for (const l of it.note.split('\n')) lines.push(`${pad}  ${l ? '> ' + l : '>'}`);
    for (const k of model.children.get(id) ?? []) if (!k.archived) walk(k.id, depth + 1);
  };
  for (const id of ids) walk(id, 0);
  return lines.join('\n');
}

/** Copies text; works without the async Clipboard API (plain http on the tailnet). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}
