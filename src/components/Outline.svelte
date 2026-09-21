<script lang="ts">
  import { flip } from 'svelte/animate';
  import { addItem } from '../lib/actions.svelte';
  import { dnd } from '../lib/dnd.svelte';
  import { db, model } from '../lib/model.svelte';
  import { settings } from '../lib/settings.svelte';
  import { ui } from '../lib/ui.svelte';
  import { view } from '../lib/view.svelte';
  import { plural } from '../lib/util';
  import Composer from './Composer.svelte';
  import Row from './Row.svelte';
  import UiIcon from './UiIcon.svelte';
  import ZoomHeader from './ZoomHeader.svelte';

  const zoomed = $derived(ui.view === 'outline' && ui.zoom && db.items[ui.zoom] ? ui.zoom : null);
  const animate = $derived(settings.appearance.animations && view.rows.length < 400 && !dnd.active);
  const empty = $derived(view.rows.length === 0);
  const hiddenCount = $derived.by(() => {
    if (!empty || ui.filtering || ui.view !== 'outline') return 0;
    return (model.children.get(zoomed) ?? []).filter((c) => !c.archived).length;
  });

  function onBlankClick(e: MouseEvent) {
    if (e.target !== e.currentTarget) return;
    ui.clearSelection();
    ui.cursor = null;
    ui.stopEditing();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<section class="sheet" class:archive={ui.view === 'archive'} onclick={onBlankClick}>
  {#if zoomed}
    <ZoomHeader id={zoomed} />
  {:else if ui.view === 'archive'}
    <div class="archive-head">
      <h1><UiIcon name="archive" size={24} /> Archive</h1>
      <p>
        {plural(model.archivedRoots.length, 'archived item')} · restore brings an item back to where it was.
      </p>
    </div>
  {/if}

  {#if ui.view === 'outline' && !ui.mobile}
    <div class="composer-wrap"><Composer /></div>
  {/if}

  <div class="rows" role="tree" aria-label="Items" data-outline>
    {#each view.rows as row (row.id)}
      <div class="slot" animate:flip={{ duration: animate ? 160 : 0 }}>
        <Row {row} />
      </div>
    {/each}
  </div>

  {#if empty}
    <div class="empty">
      {#if ui.filtering}
        <UiIcon name="filter-off" size={30} />
        <p>Nothing matches the current search or filters.</p>
        <!-- The moment a search finds nothing is the moment to say what a search can do. -->
        <p class="hint">
          Searches take <b>#tag</b>, <b>@status</b>, <b>-not</b>, <b>OR</b> and brackets —
          <button class="link" onclick={() => (ui.shortcuts = true)}>see how</button>.
        </p>
        <button class="btn" onclick={() => ui.clearFilters()}>Clear filters</button>
      {:else if ui.view === 'archive'}
        <UiIcon name="archive" size={30} />
        <p>The archive is empty. Archived items land here with their sub-items.</p>
      {:else if hiddenCount}
        <UiIcon name="eye-off" size={30} />
        <p>{plural(hiddenCount, 'item')} here {hiddenCount === 1 ? 'is' : 'are'} hidden or done.</p>
        <button class="btn" onclick={() => { ui.showHidden = true; ui.hideDone = false; ui.persist(); }}>Show them</button>
      {:else if zoomed}
        <p>No sub-items yet.</p>
        <button class="btn" onclick={() => ui.edit(addItem(zoomed, 'end'), 'start')}>
          <UiIcon name="plus" size={16} /> Add one
        </button>
      {:else}
        <div class="hello">
          <UiIcon name="sparkles" size={30} />
          <p>A blank slate. Type above to add your first project.</p>
        </div>
      {/if}
    </div>
  {:else if ui.view === 'outline'}
    <button class="add-end" onclick={() => ui.edit(addItem(zoomed, 'end'), 'start')} aria-label="Add item at the end">
      <UiIcon name="plus" size={16} />
    </button>
  {/if}
</section>

{#if dnd.active && dnd.drop}
  <div
    class="drop-line"
    style:top="{dnd.drop.y - 1}px"
    style:left="{dnd.drop.x}px"
    style:width="{dnd.drop.width}px"
  ></div>
{/if}
{#if dnd.active}
  <div class="ghost" style:left="{dnd.x + 14}px" style:top="{dnd.y + 10}px">{dnd.label}</div>
{/if}

<style>
  .sheet {
    --gutter: 30px;
    position: relative;
    width: 100%;
    max-width: var(--width);
    margin: 4px auto 0;
    padding: 18px 14px 40px 6px;
    min-height: calc(100dvh - 90px);
  }

  :global(:root[data-sheet='on']) .sheet {
    background: color-mix(in oklch, var(--surface) 86%, transparent);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) + 6px);
    box-shadow: var(--shadow);
    min-height: auto;
    margin-bottom: 40px;
  }

  :global(:root[data-sheet='on'][data-glass='on']) .sheet {
    background: color-mix(in oklch, var(--surface) 70%, transparent);
    backdrop-filter: blur(24px) saturate(1.4);
    -webkit-backdrop-filter: blur(24px) saturate(1.4);
  }

  .composer-wrap {
    padding: 0 0 12px calc(var(--gutter) - 8px);
  }

  .rows {
    display: flex;
    flex-direction: column;
  }

  .archive-head {
    padding: 0 8px 14px var(--gutter);
  }

  .archive-head h1 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 1.5em;
    letter-spacing: -0.01em;
  }

  .archive-head p {
    margin: 4px 0 0;
    color: var(--text-3);
    font-size: 0.9em;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 50px 20px;
    text-align: center;
    color: var(--text-3);
  }

  .empty .hint {
    font-size: 0.88em;
    color: var(--text-3);
    max-width: 30em;
  }

  .empty .link {
    color: var(--accent-ink);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .empty p {
    margin: 0;
    max-width: 30em;
  }

  .hello {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .add-end {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    margin: 4px 0 0 calc(var(--gutter) - 2px);
    border-radius: 8px;
    color: var(--text-3);
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s;
  }

  .add-end:hover {
    opacity: 1;
    background: var(--hover);
    color: var(--text);
  }

  .drop-line {
    position: fixed;
    height: 3px;
    border-radius: 2px;
    background: var(--accent);
    z-index: 60;
    pointer-events: none;
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .drop-line::before {
    content: '';
    position: absolute;
    left: -5px;
    top: -3.5px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2.5px solid var(--accent);
    background: var(--surface);
  }

  .ghost {
    position: fixed;
    z-index: 61;
    max-width: 280px;
    padding: 6px 12px;
    border-radius: 10px;
    background: var(--elevated);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    font-size: 0.9em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    rotate: -1.5deg;
  }

  @media (max-width: 720px) {
    .sheet {
      --gutter: 26px;
      padding: 10px 6px 140px 0;
      margin-top: 0;
    }

    :global(:root[data-sheet='on']) .sheet {
      border-radius: calc(var(--radius) + 2px);
      margin: 0 6px 0;
      width: auto;
    }
  }
</style>
