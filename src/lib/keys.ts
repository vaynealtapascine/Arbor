// Keyboard handling when no text field has focus ("navigate mode").
import {
  addItem,
  deleteItems,
  duplicateItems,
  history,
  indent,
  outdent,
  setArchived,
  setHidden,
  setStatus,
  shift,
  toggleDone,
} from './actions.svelte';
import { focusComposer, focusSearch, statusAnchor, targets, zoomOut } from './commands';
import { revealRow } from './focus';
import { db, model } from './model.svelte';
import { ui } from './ui.svelte';
import { view } from './view.svelte';

function moveCursor(dir: 1 | -1, extend: boolean) {
  const rows = view.rows;
  if (!rows.length) return;
  const cur = ui.cursor && view.index.has(ui.cursor) ? view.index.get(ui.cursor)! : dir > 0 ? -1 : rows.length;
  const next = rows[Math.max(0, Math.min(rows.length - 1, cur + dir))].id;
  if (extend) {
    if (!ui.anchor) {
      ui.anchor = ui.cursor ?? next;
      if (ui.cursor) ui.selection.add(ui.cursor);
    }
    const [a, b] = [view.index.get(ui.anchor)!, view.index.get(next)!].sort((x, y) => x - y);
    ui.selection.clear();
    for (let i = a; i <= b; i++) ui.selection.add(rows[i].id);
  } else if (ui.selection.size && !ui.selecting) {
    ui.clearSelection();
  }
  ui.cursor = next;
  revealRow(next);
}

function setCursor(id: string | null) {
  if (!id) return;
  ui.cursor = id;
  revealRow(id);
}

export function onGlobalKey(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing) return;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key;
  const lower = key.toLowerCase();

  if (mod && lower === 'k') {
    e.preventDefault();
    ui.closePopover();
    ui.palette = !ui.palette;
    return;
  }
  if (ui.palette || ui.settingsOpen || ui.popover || ui.confirm || ui.shortcuts) return;
  const el = e.target as HTMLElement | null;
  if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;

  const t = targets();
  const cur = ui.cursor && db.items[ui.cursor] ? ui.cursor : null;

  if (mod) {
    if (lower === 'z' && !e.shiftKey) history.undo();
    else if (lower === 'y' || (lower === 'z' && e.shiftKey)) history.redo();
    else if (lower === 'a') {
      for (const r of view.rows) ui.selection.add(r.id);
      ui.anchor = view.rows[0]?.id ?? null;
    } else if (lower === 'f') focusSearch();
    else if (lower === 'd' && t.length) duplicateItems(t);
    else if (key === 'Enter' && t.length) toggleDone(t);
    else if ((key === 'ArrowUp' || key === 'ArrowDown') && e.shiftKey && t.length) shift(t, key === 'ArrowUp' ? -1 : 1);
    else if (key === '\\') ui.toggleSidebar();
    else if (key === ',') ui.settingsOpen = 'appearance';
    else return;
    e.preventDefault();
    return;
  }

  if (e.altKey) {
    if ((key === 'ArrowUp' || key === 'ArrowDown') && e.shiftKey && t.length) shift(t, key === 'ArrowUp' ? -1 : 1);
    else if (key === 'ArrowLeft') zoomOut();
    else if (key === 'ArrowRight' && cur) ui.go('outline', cur);
    else return;
    e.preventDefault();
    return;
  }

  switch (key) {
    case 'ArrowDown':
    case 'j':
    case 'J':
      moveCursor(1, e.shiftKey);
      break;
    case 'ArrowUp':
    case 'k':
    case 'K':
      moveCursor(-1, e.shiftKey);
      break;
    case 'Home':
      setCursor(view.rows[0]?.id ?? null);
      break;
    case 'End':
      setCursor(view.rows.at(-1)?.id ?? null);
      break;
    case 'ArrowRight':
    case 'l': {
      if (!cur) return;
      const row = view.rows[view.index.get(cur) ?? -1];
      if (row?.kids && !ui.isOpen(cur)) ui.setOpen(cur, true);
      else if (row?.kids) setCursor(view.next(cur));
      break;
    }
    case 'ArrowLeft': {
      if (!cur) return;
      const row = view.rows[view.index.get(cur) ?? -1];
      if (row?.kids && ui.isOpen(cur)) ui.setOpen(cur, false);
      else setCursor(model.parentOf(cur) !== ui.zoom ? model.parentOf(cur) : null);
      break;
    }
    case 'Enter':
    case 'e':
    case 'F2':
      if (cur) ui.edit(cur, 'end');
      else focusComposer();
      break;
    case 'n':
    case 'q':
      focusComposer();
      break;
    case 'o':
    case 'O': {
      const parent = cur ? model.parentOf(cur) : ui.zoom;
      const id = cur ? addItem(parent, key === 'o' ? { after: cur } : { before: cur }) : addItem(ui.zoom, 'end');
      ui.edit(id, 'start');
      break;
    }
    case ' ':
    case 'x':
      if (!cur) return;
      if (ui.selection.has(cur)) ui.selection.delete(cur);
      else ui.selection.add(cur);
      ui.anchor = cur;
      break;
    case 'Tab':
      if (!t.length) return;
      if (e.shiftKey) outdent(t);
      else indent(t);
      break;
    case 's':
      if (!t.length) return;
      ui.open({ kind: 'status', anchor: statusAnchor(t[0]), ids: t });
      break;
    case 't':
    case '#':
      if (!t.length) return;
      ui.open({ kind: 'tags', anchor: statusAnchor(t[0]), ids: t });
      break;
    case 'm':
      if (!t.length) return;
      ui.open({ kind: 'move', anchor: statusAnchor(t[0]), ids: t });
      break;
    case 'h':
      if (!t.length) return;
      setHidden(t, !t.every((id) => db.items[id].hidden));
      break;
    case 'H':
      ui.showHidden = !ui.showHidden;
      ui.persist();
      ui.toast(ui.showHidden ? 'Showing hidden items' : 'Hidden items are hidden again');
      break;
    case 'D':
      ui.hideDone = !ui.hideDone;
      ui.persist();
      ui.toast(ui.hideDone ? 'Done items hidden' : 'Showing done items');
      break;
    case 'a':
      if (!t.length) return;
      setArchived(t, ui.view !== 'archive');
      break;
    case 'Delete':
    case 'Backspace':
      if (!t.length) return;
      deleteItems(t);
      break;
    case 'N':
      if (!cur) return;
      ui.toggleNote(cur, true);
      ui.edit(cur, 'end', 'note');
      break;
    case 'c':
      if (cur) ui.setOpen(cur);
      break;
    case 'z':
      if (cur && ui.view === 'outline') ui.go('outline', cur);
      break;
    case 'Z':
    case 'u':
      zoomOut();
      break;
    case '/':
      focusSearch();
      break;
    case '?':
      ui.shortcuts = true;
      break;
    case 'Escape':
      if (ui.selection.size) ui.clearSelection();
      else if (ui.cursor) ui.cursor = null;
      else if (ui.filtering) ui.clearFilters();
      else if (ui.zoom || ui.view === 'archive') zoomOut();
      else return;
      break;
    default:
      if (/^[0-9]$/.test(key) && t.length) {
        const n = Number(key);
        if (n > 0 && !model.statusList[n - 1]) return;
        setStatus(t, n === 0 ? null : model.statusList[n - 1].id);
        break;
      }
      return;
  }
  e.preventDefault();
}
