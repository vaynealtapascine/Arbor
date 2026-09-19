<script lang="ts">
  import { fly } from 'svelte/transition';
  import { deleteItems, setArchived, setHidden, toggleDone } from '../lib/actions.svelte';
  import { db, model } from '../lib/model.svelte';
  import { ui, type PopoverKind } from '../lib/ui.svelte';
  import { view } from '../lib/view.svelte';
  import UiIcon from './UiIcon.svelte';

  const ids = $derived([...ui.selection].filter((id) => db.items[id]));
  const allHidden = $derived(ids.length > 0 && ids.every((id) => db.items[id].hidden));
  const archive = $derived(ui.view === 'archive');

  function open(kind: PopoverKind, e: MouseEvent) {
    ui.open({ kind, anchor: e.currentTarget as HTMLElement, ids });
  }

  function selectAll() {
    for (const r of view.rows) ui.selection.add(r.id);
  }

  function selectChildren() {
    for (const id of ids) for (const k of model.children.get(id) ?? []) if (view.index.has(k.id)) ui.selection.add(k.id);
  }
</script>

{#if ids.length && !ui.dragging}
  <div class="bulk glass" class:raised={ui.mobile && !archive} transition:fly={{ y: 20, duration: 180 }} role="toolbar"
    aria-label="Bulk actions">
    <button class="count" onclick={() => ui.clearSelection()} title="Clear selection (Esc)">
      <UiIcon name="x" size={15} />
      <b>{ids.length}</b>
    </button>
    <div class="sep"></div>
    {#if archive}
      <button class="act" onclick={() => setArchived(ids, false)}><UiIcon name="archive-off" /> <span>Restore</span></button>
      <button class="act danger" onclick={() => deleteItems(ids)}><UiIcon name="trash" /> <span>Delete</span></button>
    {:else}
      <button class="act" onclick={() => toggleDone(ids)} title="Toggle done (Ctrl+Enter)"><UiIcon name="circle-check" /> <span>Done</span></button>
      <button class="act" onclick={(e) => open('status', e)} title="Status (S)"><UiIcon name="circle-dot" /> <span>Status</span></button>
      <button class="act" onclick={(e) => open('tags', e)} title="Tags (T)"><UiIcon name="tag" /> <span>Tags</span></button>
      <button class="act" onclick={(e) => open('move', e)} title="Move (M)"><UiIcon name="folder-symlink" /> <span>Move</span></button>
      <button class="act" onclick={() => setHidden(ids, !allHidden)} title="Hide (H)">
        <UiIcon name={allHidden ? 'eye' : 'eye-off'} /> <span>{allHidden ? 'Unhide' : 'Hide'}</span>
      </button>
      <button class="act" onclick={() => setArchived(ids, true)} title="Archive (A)"><UiIcon name="archive" /> <span>Archive</span></button>
      <button class="act danger" onclick={() => deleteItems(ids)} title="Delete (Del)"><UiIcon name="trash" /> <span>Delete</span></button>
      <button class="act" onclick={(e) => open('item', e)} title="More"><UiIcon name="dots" /></button>
    {/if}
    <div class="sep"></div>
    <button class="act" onclick={selectAll} title="Select all visible (Ctrl+A)"><UiIcon name="select-all" /></button>
    {#if !archive}
      <button class="act" onclick={selectChildren} title="Also select children"><UiIcon name="list-tree" /></button>
    {/if}
  </div>
{/if}

<style>
  .bulk {
    position: fixed;
    left: 50%;
    bottom: calc(18px + env(safe-area-inset-bottom));
    translate: -50% 0;
    z-index: 35;
    display: flex;
    align-items: center;
    gap: 2px;
    max-width: calc(100vw - 16px);
    padding: 5px;
    border-radius: calc(var(--radius) + 6px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .bulk.raised {
    bottom: calc(76px + env(safe-area-inset-bottom));
  }

  .count {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 12px 0 10px;
    border-radius: calc(var(--radius) * 0.8);
    background: var(--accent);
    color: var(--on-accent);
    flex: none;
  }

  .sep {
    width: 1px;
    height: 22px;
    margin: 0 4px;
    background: var(--border);
    flex: none;
  }

  .act {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    min-width: 46px;
    height: 44px;
    padding: 0 6px;
    border-radius: calc(var(--radius) * 0.7);
    font-size: 0.7em;
    font-weight: 550;
    color: var(--text-2);
    flex: none;
  }

  .act:hover {
    background: var(--hover);
    color: var(--text);
  }

  .act.danger:hover {
    color: var(--danger);
  }
</style>
