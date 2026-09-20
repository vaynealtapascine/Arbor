// Templates: reusable item trees. Save any item (with its sub-items) as a
// template, then drop copies anywhere — from the add box with "/name", the
// command palette, or an item's menu. Titles and notes can use variables.
import { addItems, commit, type NewItem, type Where } from './actions.svelte';
import { resolveEntry } from './entry';
import { db, model } from './model.svelte';
import { SWATCHES } from './palette';
import { parseOutline, tokenName, type OutlineNode } from './parse';
import type { IconRef, Op, Template, TemplateNode } from './types';
import { fold, keysBetween, newId } from './util';
import { view } from './view.svelte';
import { fillVariables } from './variables';

export { VARIABLES } from './variables';

const usesName = (nodes: TemplateNode[]): boolean =>
  nodes.some((n) => /\{name\}/i.test(n.title) || /\{name\}/i.test(n.note) || usesName(n.children));

export function countNodes(nodes: TemplateNode[]): number {
  return nodes.reduce((n, x) => n + 1 + countNodes(x.children), 0);
}

/** Template nodes for items and their (non-archived) sub-items, in on-screen order. */
export function nodesFromItems(ids: string[]): TemplateNode[] {
  const toNode = (id: string): TemplateNode => {
    const it = db.items[id];
    return {
      title: it.title,
      note: it.note,
      status: it.status,
      tags: [...it.tags],
      children: (model.children.get(id) ?? []).filter((c) => !c.archived).map((c) => toNode(c.id)),
    };
  };
  return view.ordered(model.topmost(ids)).map(toNode);
}

export function saveTemplate(name: string, items: TemplateNode[], fields: { icon?: IconRef | null; color?: string } = {}) {
  const id = newId();
  const [pos] = keysBetween(model.templateList.at(-1)?.pos, null, 1);
  commit(`Save template ${name}`, [
    {
      kind: 'template',
      id,
      set: {
        name,
        items,
        icon: fields.icon ?? null,
        color: fields.color ?? SWATCHES[(model.templateList.length * 3 + 9) % SWATCHES.length].hex,
        pos,
      },
    },
  ], { toast: `Saved template “${name}”` });
  return id;
}

export interface UseOptions {
  /** Replaces {name}; if the template has none, becomes the first item's title. */
  name?: string;
  tags?: string[];
  status?: string;
  extra?: Op[];
}

/** Creates items from a template and returns the ids of the top-level ones. */
export function useTemplate(tpl: Template, parent: string | null, where: Where, opts: UseOptions = {}): string[] {
  const name = opts.name?.trim() ?? '';
  const now = new Date();
  const convert = (n: TemplateNode): NewItem => ({
    title: fillVariables(n.title, name, now),
    note: fillVariables(n.note, name, now),
    status: n.status && db.statuses[n.status] ? n.status : null,
    tags: n.tags.filter((t) => db.tags[t]),
    children: n.children.map(convert),
  });
  const items = tpl.items.map(convert);
  if (!items.length) return [];
  if (name && !usesName(tpl.items)) items[0].title = name;
  if (opts.tags?.length) items[0].tags = [...new Set([...(items[0].tags ?? []), ...opts.tags])];
  if (opts.status !== undefined) items[0].status = opts.status;
  return addItems(parent, where, items, `Add from template ${tpl.name}`, opts.extra ?? []);
}

/** Finds a template by name, loosely: "/weekly-review" finds "Weekly review", prefixes work. */
export function findTemplate(query: string): Template | undefined {
  const q = fold(query);
  if (!q) return undefined;
  return (
    model.templateList.find((t) => fold(t.name) === q) ??
    model.templateList.find((t) => fold(t.name).startsWith(q)) ??
    model.templateList.find((t) => fold(t.name).includes(q))
  );
}

/** Templates offered while typing "/name". */
export function templateMatches(query: string): Template[] {
  const q = fold(query);
  return model.templateList
    .filter((t) => !q || fold(t.name).includes(q))
    .sort((a, b) => Number(fold(b.name).startsWith(q)) - Number(fold(a.name).startsWith(q)))
    .slice(0, 8);
}

// ---------------------------------------------------------------- text form (for editing)

const escapeTokens = (s: string) => s.replace(/(^|\s)([#@])/g, '$1\\$2');

/** The template as an indented list, the same shape as "Copy as Markdown". */
export function templateToText(nodes: TemplateNode[]): string {
  const lines: string[] = [];
  const walk = (n: TemplateNode, depth: number) => {
    const pad = '  '.repeat(depth);
    const status = n.status && db.statuses[n.status] ? ` @${tokenName(db.statuses[n.status].name)}` : '';
    const tags = n.tags.map((t) => db.tags[t]).filter(Boolean).map((t) => ` #${tokenName(t.name)}`).join('');
    lines.push(`${pad}- ${escapeTokens(n.title)}${status}${tags}`);
    for (const l of n.note ? n.note.split('\n') : []) lines.push(`${pad}  > ${l}`);
    for (const c of n.children) walk(c, depth + 1);
  };
  for (const n of nodes) walk(n, 0);
  return lines.join('\n');
}

/** Parses the text form back; unknown #tags become new tags (their ops go into `ops`). */
export function textToTemplate(text: string, ops: Op[]): TemplateNode[] {
  const created = new Map<string, string>();
  const done = model.statusList.find((s) => s.done)?.id ?? null;
  const convert = (n: OutlineNode): TemplateNode => {
    const e = resolveEntry(n.text, ops, created);
    return {
      title: e.title,
      note: [e.note, n.note].filter(Boolean).join('\n'),
      status: n.done && done ? done : (e.status ?? null),
      tags: e.tags,
      children: n.children.map(convert),
    };
  };
  return parseOutline(text).map(convert);
}

export function updateTemplateItems(id: string, text: string) {
  const ops: Op[] = [];
  const items = textToTemplate(text, ops);
  ops.push({ kind: 'template', id, set: { items } });
  commit('Edit template', ops, { toast: 'Template saved' });
}
