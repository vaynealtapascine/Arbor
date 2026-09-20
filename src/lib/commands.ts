// Everything the command palette can do. Item commands act on the selection,
// or on the row under the keyboard cursor / being edited.
import {
  addItem,
  deleteItems,
  duplicateItems,
  exportData,
  history,
  indent,
  outdent,
  setArchived,
  setHidden,
  setStatus,
  shift,
  toggleDone,
  toggleTag,
} from './actions.svelte';
import { copyText, toMarkdown } from './clipboard';
import { revealRow } from './focus';
import { db, model } from './model.svelte';
import { presets, settings } from './settings.svelte';
import { ui } from './ui.svelte';
import { view } from './view.svelte';
import { countNodes, useTemplate } from './templates';
import { applyView } from './views';

export interface Command {
  id: string;
  label: string;
  group: 'Item' | 'Go' | 'View' | 'Create' | 'App' | 'Theme' | 'Views' | 'Templates';
  icon?: string;
  keys?: string;
  run: () => void;
}

/** Items that item commands act on. */
export function targets(): string[] {
  if (ui.selection.size) return view.ordered([...ui.selection].filter((id) => db.items[id]));
  const id = ui.editing?.id ?? ui.cursor;
  return id && db.items[id] ? [id] : [];
}

export function statusAnchor(id: string | undefined) {
  return id ? document.querySelector<HTMLElement>(`[data-row-id="${id}"] .status`) : null;
}

export function focusComposer() {
  ui.stopEditing();
  setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-composer]')?.focus());
}

export function focusSearch() {
  ui.drawer = false;
  setTimeout(() => {
    const el = document.querySelector<HTMLInputElement>('[data-search]');
    if (el) {
      el.focus();
      el.select();
    } else {
      document.dispatchEvent(new CustomEvent('arbor:open-search'));
    }
  });
}

/** Shows an item wherever it lives: leaves zoom/filters as needed and expands its ancestors. */
export function jumpTo(id: string) {
  const it = db.items[id];
  if (!it) return;
  const info = model.info.get(id);
  if (info?.archived) {
    ui.go('archive');
    for (const a of model.pathOf(id)) ui.archiveOpen.add(a.id);
  } else {
    if (ui.view !== 'outline' || (ui.zoom && ui.zoom !== id && !model.isAncestor(ui.zoom, id))) ui.go('outline', null);
    if (info?.hidden) ui.showHidden = true;
    if (ui.hideDone && model.isDone(it)) ui.hideDone = false;
    ui.clearFilters();
    for (const a of model.pathOf(id)) ui.setOpen(a.id, true);
  }
  ui.cursor = id;
  ui.markFresh([id]);
  revealRow(id);
}

export function zoomOut() {
  if (ui.view === 'archive') return ui.go('outline', null);
  if (!ui.zoom) return;
  const from = ui.zoom;
  ui.go('outline', model.parentOf(ui.zoom));
  ui.cursor = from;
  revealRow(from);
}

export function setAllOpen(open: boolean) {
  for (const it of Object.values(db.items)) if ((model.children.get(it.id) ?? []).length) ui.setOpen(it.id, open);
}

export function downloadExport() {
  const blob = new Blob([JSON.stringify(exportData(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `arbor-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function buildCommands(): Command[] {
  const t = targets();
  const cmds: Command[] = [];
  const one = t.length === 1 ? t[0] : null;

  cmds.push({ id: 'new', label: 'New item', group: 'Create', icon: 'plus', keys: 'N', run: focusComposer });
  for (const tpl of model.templateList) {
    cmds.push({
      id: `template:${tpl.id}`,
      label: `New from template: ${tpl.name} (${countNodes(tpl.items)})`,
      group: 'Templates',
      icon: 'template',
      run: () => {
        // Same place the add box would put it (an item's own menu adds inside that item).
        const parent = ui.quickParent && db.items[ui.quickParent] ? ui.quickParent : ui.zoom;
        const [first] = useTemplate(tpl, parent, 'end');
        if (first) {
          revealRow(first);
          ui.edit(first, 'end');
        }
      },
    });
  }
  for (const v of model.viewList) {
    cmds.push({ id: `view:${v.id}`, label: `View: ${v.name}`, group: 'Views', icon: 'bookmark', run: () => applyView(v) });
  }
  if (one) {
    cmds.push({
      id: 'new-child',
      label: 'New sub-item',
      group: 'Create',
      icon: 'corner-down-right',
      run: () => ui.edit(addItem(one, 'end'), 'start'),
    });
  }

  if (t.length) {
    const it = one ? db.items[one] : null;
    cmds.push(
      { id: 'done', label: 'Toggle done', group: 'Item', icon: 'circle-check', keys: 'Ctrl+Enter', run: () => toggleDone(t) },
      {
        id: 'status',
        label: 'Set status…',
        group: 'Item',
        icon: 'circle-dot',
        keys: 'S',
        run: () => ui.open({ kind: 'status', anchor: statusAnchor(t[0]), ids: t }),
      },
      ...model.statusList.map((s, i) => ({
        id: `status:${s.id}`,
        label: `Status → ${s.name}`,
        group: 'Item' as const,
        icon: 'circle-dot',
        keys: i < 9 ? String(i + 1) : undefined,
        run: () => setStatus(t, s.id),
      })),
      {
        id: 'tags',
        label: 'Tags…',
        group: 'Item',
        icon: 'tag',
        keys: 'T',
        run: () => ui.open({ kind: 'tags', anchor: statusAnchor(t[0]), ids: t }),
      },
      ...model.tagTree.map(({ tag, path }) => ({
        id: `tag:${tag.id}`,
        label: `Toggle tag #${path}`,
        group: 'Item' as const,
        icon: 'hash',
        run: () => toggleTag(t, tag.id),
      })),
      {
        id: 'move',
        label: 'Move to…',
        group: 'Item',
        icon: 'folder-symlink',
        keys: 'M',
        run: () => ui.open({ kind: 'move', anchor: statusAnchor(t[0]), ids: t }),
      },
      { id: 'indent', label: 'Indent', group: 'Item', icon: 'indent-increase', keys: 'Tab', run: () => indent(t) },
      { id: 'outdent', label: 'Outdent', group: 'Item', icon: 'indent-decrease', keys: 'Shift+Tab', run: () => outdent(t) },
      { id: 'up', label: 'Move up', group: 'Item', icon: 'arrow-up', keys: 'Alt+Shift+↑', run: () => shift(t, -1) },
      { id: 'down', label: 'Move down', group: 'Item', icon: 'arrow-down', keys: 'Alt+Shift+↓', run: () => shift(t, 1) },
      { id: 'dup', label: 'Duplicate', group: 'Item', icon: 'copy', keys: 'Ctrl+D', run: () => duplicateItems(t) },
      {
        id: 'hide',
        label: t.every((id) => db.items[id].hidden) ? 'Unhide' : 'Hide',
        group: 'Item',
        icon: 'eye-off',
        keys: 'H',
        run: () => setHidden(t, !t.every((id) => db.items[id].hidden)),
      },
      {
        id: 'archive',
        label: ui.view === 'archive' ? 'Restore from archive' : 'Archive',
        group: 'Item',
        icon: 'archive',
        keys: 'A',
        run: () => setArchived(t, ui.view !== 'archive'),
      },
      { id: 'delete', label: 'Delete', group: 'Item', icon: 'trash', keys: 'Del', run: () => deleteItems(t) },
      {
        id: 'copy',
        label: 'Copy as Markdown',
        group: 'Item',
        icon: 'file-text',
        run: async () => {
          const ok = await copyText(toMarkdown(model.topmost(t)));
          ui.toast(ok ? 'Copied as Markdown' : 'Copy failed');
        },
      },
    );
    if (it) {
      cmds.push(
        {
          id: 'note',
          label: it.note ? 'Edit note' : 'Add note',
          group: 'Item',
          icon: 'note',
          keys: 'Shift+Enter',
          run: () => {
            ui.toggleNote(it.id, true);
            ui.edit(it.id, 'end', 'note');
          },
        },
        { id: 'zoom', label: 'Zoom into item', group: 'Go', icon: 'zoom-in', keys: 'Z', run: () => ui.go('outline', it.id) },
      );
    }
  }

  cmds.push(
    { id: 'home', label: 'Go to top level', group: 'Go', icon: 'home', run: () => ui.go('outline', null) },
    { id: 'zoom-out', label: 'Zoom out', group: 'Go', icon: 'zoom-out', keys: 'Shift+Z', run: zoomOut },
    { id: 'archive-view', label: 'Open archive', group: 'Go', icon: 'archive', run: () => ui.go('archive') },
    { id: 'search', label: 'Search', group: 'Go', icon: 'search', keys: '/', run: focusSearch },
    {
      id: 'show-hidden',
      label: ui.showHidden ? 'Stop showing hidden items' : 'Show hidden items',
      group: 'View',
      icon: 'eye',
      keys: 'Shift+H',
      run: () => {
        ui.showHidden = !ui.showHidden;
        ui.persist();
      },
    },
    {
      id: 'hide-done',
      label: ui.hideDone ? 'Show done items' : 'Hide done items',
      group: 'View',
      icon: 'circle-check',
      keys: 'Shift+D',
      run: () => {
        ui.hideDone = !ui.hideDone;
        ui.persist();
      },
    },
    { id: 'expand', label: 'Expand all', group: 'View', icon: 'chevrons-down', run: () => setAllOpen(true) },
    { id: 'collapse', label: 'Collapse all', group: 'View', icon: 'chevrons-up', run: () => setAllOpen(false) },
    {
      id: 'sidebar',
      label: 'Toggle sidebar',
      group: 'View',
      icon: 'layout-sidebar-left-collapse',
      keys: 'Ctrl+\\',
      run: () => ui.toggleSidebar(),
    },
    {
      id: 'clear-filters',
      label: 'Clear search and filters',
      group: 'View',
      icon: 'filter-off',
      run: () => ui.clearFilters(),
    },
    { id: 'undo', label: 'Undo', group: 'App', icon: 'arrow-back-up', keys: 'Ctrl+Z', run: () => history.undo() },
    { id: 'redo', label: 'Redo', group: 'App', icon: 'arrow-forward-up', keys: 'Ctrl+Shift+Z', run: () => history.redo() },
    { id: 'settings', label: 'Settings', group: 'App', icon: 'settings', keys: ',', run: () => (ui.settingsOpen = 'appearance') },
    { id: 'statuses', label: 'Edit statuses', group: 'App', icon: 'circle-dot', run: () => (ui.settingsOpen = 'statuses') },
    { id: 'tags-edit', label: 'Edit tags', group: 'App', icon: 'tags', run: () => (ui.settingsOpen = 'tags') },
    { id: 'views-edit', label: 'Edit views', group: 'App', icon: 'bookmark', run: () => (ui.settingsOpen = 'views') },
    { id: 'templates-edit', label: 'Edit templates', group: 'App', icon: 'template', run: () => (ui.settingsOpen = 'templates') },
    {
      id: 'save-view',
      label: 'Save current filters as a view…',
      group: 'Views',
      icon: 'bookmark-plus',
      run: () => ui.open({ kind: 'saveView', anchor: null, ids: [] }),
    },
    { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'App', icon: 'keyboard', keys: '?', run: () => (ui.shortcuts = true) },
    { id: 'export', label: 'Export everything (JSON)', group: 'App', icon: 'download', run: downloadExport },
    {
      id: 'dark',
      label: 'Toggle light / dark',
      group: 'Theme',
      icon: 'sun-moon',
      run: () => {
        const dark = settings.appearance.mode === 'dark' || (settings.appearance.mode === 'auto' && ui.systemDark);
        settings.setAppearance({ mode: dark ? 'light' : 'dark' });
      },
    },
    ...presets.map((p) => ({
      id: `preset:${p.id}`,
      label: `Theme: ${p.name}`,
      group: 'Theme' as const,
      icon: 'palette',
      run: () => settings.applyPreset(p),
    })),
  );
  return cmds;
}
