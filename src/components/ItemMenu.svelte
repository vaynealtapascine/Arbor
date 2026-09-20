<script lang="ts">
  import {
    addItem,
    deleteItems,
    duplicateItems,
    indent,
    outdent,
    setArchived,
    setHidden,
    toggleDone,
  } from '../lib/actions.svelte';
  import { copyText, toMarkdown } from '../lib/clipboard';
  import { db, model } from '../lib/model.svelte';
  import { ui, type PopoverKind } from '../lib/ui.svelte';
  import { view } from '../lib/view.svelte';
  import { plural } from '../lib/util';
  import UiIcon from './UiIcon.svelte';

  let { ids, anchor }: { ids: string[]; anchor: HTMLElement | DOMRect | null } = $props();

  const items = $derived(ids.map((id) => db.items[id]).filter(Boolean));
  const single = $derived(items.length === 1 ? items[0] : null);
  const allHidden = $derived(items.every((it) => it.hidden));
  const archivedView = $derived(ui.view === 'archive');
  const allDone = $derived(items.every((it) => model.isDone(it)));

  function run(fn: () => void) {
    ui.closePopover();
    fn();
  }

  function sub(kind: PopoverKind) {
    ui.open({ kind, anchor, ids });
  }

  async function copy() {
    const ok = await copyText(toMarkdown(view.ordered(model.topmost(ids))));
    ui.toast(ok ? 'Copied as Markdown' : 'Copy failed', undefined, ok ? 'default' : 'error');
  }
</script>

<div class="menu">
  {#if items.length > 1}<div class="menu-label">{plural(items.length, 'item')}</div>{/if}
  {#if archivedView}
    <button class="menu-item" onclick={() => run(() => setArchived(ids, false))}>
      <UiIcon name="archive-off" size={17} /> Restore
    </button>
    <button class="menu-item" onclick={() => run(copy)}><UiIcon name="copy" size={17} /> Copy as Markdown</button>
    <div class="menu-sep"></div>
    <button class="menu-item danger" onclick={() => run(() => deleteItems(ids))}>
      <UiIcon name="trash" size={17} /> Delete
    </button>
  {:else}
    {#if single}
      <button class="menu-item" onclick={() => run(() => ui.edit(single.id, 'end'))}>
        <UiIcon name="pencil" size={17} /> Edit <span class="hint"><kbd>Enter</kbd></span>
      </button>
      <button class="menu-item" onclick={() => run(() => { ui.toggleNote(single.id, true); ui.edit(single.id, 'end', 'note'); })}>
        <UiIcon name="note" size={17} /> {single.note ? 'Edit note' : 'Add note'} <span class="hint"><kbd>Shift+Enter</kbd></span>
      </button>
      <button class="menu-item" onclick={() => run(() => ui.edit(addItem(single.id, 'end'), 'start'))}>
        <UiIcon name="corner-down-right" size={17} /> Add sub-item
      </button>
      <button class="menu-item" onclick={() => run(() => ui.go('outline', single.id))}>
        <UiIcon name="zoom-in" size={17} /> Zoom in <span class="hint"><kbd>Z</kbd></span>
      </button>
      <div class="menu-sep"></div>
    {/if}
    <button class="menu-item" onclick={() => run(() => toggleDone(ids))}>
      <UiIcon name="circle-check" size={17} /> {allDone ? 'Mark not done' : 'Mark done'} <span class="hint"><kbd>Ctrl+Enter</kbd></span>
    </button>
    <button class="menu-item" onclick={() => sub('status')}>
      <UiIcon name="circle-dot" size={17} /> Status… <span class="hint"><kbd>S</kbd></span>
    </button>
    <button class="menu-item" onclick={() => sub('tags')}>
      <UiIcon name="tag" size={17} /> Tags… <span class="hint"><kbd>T</kbd></span>
    </button>
    <button class="menu-item" onclick={() => sub('move')}>
      <UiIcon name="folder-symlink" size={17} /> Move to… <span class="hint"><kbd>M</kbd></span>
    </button>
    <div class="menu-sep"></div>
    <button class="menu-item" onclick={() => run(() => indent(ids))}>
      <UiIcon name="indent-increase" size={17} /> Indent <span class="hint"><kbd>Tab</kbd></span>
    </button>
    <button class="menu-item" onclick={() => run(() => outdent(ids))}>
      <UiIcon name="indent-decrease" size={17} /> Outdent <span class="hint"><kbd>Shift+Tab</kbd></span>
    </button>
    <button class="menu-item" onclick={() => run(() => duplicateItems(ids))}>
      <UiIcon name="copy" size={17} /> Duplicate <span class="hint"><kbd>Ctrl+D</kbd></span>
    </button>
    <button class="menu-item" onclick={() => run(copy)}><UiIcon name="file-text" size={17} /> Copy as Markdown</button>
    <button class="menu-item" onclick={() => sub('saveTemplate')}><UiIcon name="template" size={17} /> Save as template…</button>
    {#if single}
      <button class="menu-item" onclick={() => sub('templates')}><UiIcon name="bookmark-plus" size={17} /> Add from template…</button>
    {/if}
    {#if ui.coarse && !ui.selecting}
      <button class="menu-item" onclick={() => run(() => { ui.selecting = true; for (const id of ids) ui.selection.add(id); })}>
        <UiIcon name="square-check" size={17} /> Select
      </button>
    {/if}
    <div class="menu-sep"></div>
    <button class="menu-item" onclick={() => run(() => setHidden(ids, !allHidden))}>
      <UiIcon name={allHidden ? 'eye' : 'eye-off'} size={17} /> {allHidden ? 'Unhide' : 'Hide'} <span class="hint"><kbd>H</kbd></span>
    </button>
    <button class="menu-item" onclick={() => run(() => setArchived(ids, true))}>
      <UiIcon name="archive" size={17} /> Archive <span class="hint"><kbd>A</kbd></span>
    </button>
    <button class="menu-item danger" onclick={() => run(() => deleteItems(ids))}>
      <UiIcon name="trash" size={17} /> Delete <span class="hint"><kbd>Del</kbd></span>
    </button>
  {/if}
</div>
