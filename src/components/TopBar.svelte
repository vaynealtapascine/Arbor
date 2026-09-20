<script lang="ts">
  import { onMount } from 'svelte';
  import { history } from '../lib/actions.svelte';
  import { db, model } from '../lib/model.svelte';
  import { ui } from '../lib/ui.svelte';
  import { isMac, plural } from '../lib/util';
  import Icon from './Icon.svelte';
  import StatusIcon from './StatusIcon.svelte';
  import UiIcon from './UiIcon.svelte';
  import { currentFilter, isMeaningful, sameFilter } from '../lib/views';

  let searchOpen = $state(false);
  let searchEl: HTMLInputElement | undefined = $state();

  const path = $derived(ui.zoom && db.items[ui.zoom] ? [...model.pathOf(ui.zoom), db.items[ui.zoom]] : []);
  const showSearch = $derived(!ui.mobile || searchOpen || !!ui.search);
  const filterCount = $derived(ui.filterStatus.size + ui.filterTags.size);
  const filterNow = $derived(currentFilter());
  const activeView = $derived(model.viewList.find((v) => sameFilter(v.filter, filterNow)) ?? null);
  const canSave = $derived(ui.view === 'outline' && isMeaningful(filterNow) && !activeView);

  onMount(() => {
    const open = () => {
      searchOpen = true;
      setTimeout(() => searchEl?.focus());
    };
    document.addEventListener('arbor:open-search', open);
    return () => document.removeEventListener('arbor:open-search', open);
  });

  const menu = () => ui.toggleSidebar(true);
</script>

<header class="topbar" class:mobile={ui.mobile}>
  <div class="bar">
    {#if ui.narrow || !ui.sidebar}
      <button class="icon-btn" aria-label="Open sidebar" onclick={menu}>
        <UiIcon name={ui.narrow ? 'menu-2' : 'layout-sidebar-left-expand'} size={20} />
      </button>
    {/if}

    {#if !(ui.mobile && showSearch)}
      <nav class="crumbs" aria-label="Breadcrumbs">
        {#if ui.view === 'archive'}
          <button class="crumb" onclick={() => ui.go('outline', null)}><UiIcon name="home" size={16} /></button>
          <UiIcon name="chevron-right" size={14} />
          <span class="crumb current"><UiIcon name="archive" size={16} /> Archive</span>
        {:else if path.length}
          <button class="crumb" aria-label="Top level" onclick={() => ui.go('outline', null)}><UiIcon name="home" size={16} /></button>
          {#each path as p, i (p.id)}
            <UiIcon name="chevron-right" size={14} />
            {#if i === path.length - 1}
              <span class="crumb current">{p.title || 'Untitled'}</span>
            {:else if path.length > 3 && i > 0 && i < path.length - 2}
              {#if i === 1}<button class="crumb" onclick={() => ui.go('outline', p.id)}>…</button>{/if}
            {:else}
              <button class="crumb" onclick={() => ui.go('outline', p.id)}>{p.title || 'Untitled'}</button>
            {/if}
          {/each}
        {:else}
          <span class="crumb current home">All items</span>
        {/if}
      </nav>
    {/if}

    {#if activeView && !(ui.mobile && showSearch)}
      <span class="view-pill ink" style:--c={activeView.color} title="Saved view">
        {#if activeView.icon}<Icon icon={activeView.icon} size={14} />{:else}<UiIcon name="filter" size={14} />{/if}
        {activeView.name}
      </span>
    {/if}

    <div class="spacer"></div>

    {#if canSave && !ui.mobile}
      <button
        class="icon-btn save-view"
        aria-label="Save as a view"
        title="Save these filters as a view"
        onclick={(e) => ui.open({ kind: 'saveView', anchor: e.currentTarget, ids: [] })}
      >
        <UiIcon name="bookmark-plus" size={18} />
      </button>
    {/if}

    {#if showSearch}
      <label class="search" class:active={!!ui.search}>
        <UiIcon name="search" size={16} />
        <input
          bind:this={searchEl}
          bind:value={ui.search}
          placeholder={ui.view === 'archive' ? 'Search the archive…' : 'Search…'}
          data-search
          aria-label="Search"
          onkeydown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              if (ui.search) ui.search = '';
              else {
                searchOpen = false;
                (e.currentTarget as HTMLInputElement).blur();
              }
            } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
              e.preventDefault();
              const first = document.querySelector<HTMLElement>('[data-row-id]');
              (e.currentTarget as HTMLInputElement).blur();
              if (first) ui.cursor = first.dataset.rowId!;
            }
          }}
          onblur={() => {
            if (!ui.search) searchOpen = false;
          }}
        />
        {#if ui.search}
          <button class="clear" aria-label="Clear search" onclick={() => (ui.search = '')}><UiIcon name="x" size={14} /></button>
        {:else if !ui.mobile}
          <kbd>/</kbd>
        {/if}
      </label>
    {:else}
      <button class="icon-btn" aria-label="Search" onclick={() => { searchOpen = true; setTimeout(() => searchEl?.focus()); }}>
        <UiIcon name="search" size={20} />
      </button>
    {/if}

    {#if ui.mobile && (db.state === 'offline' || db.pendingCount > 0)}
      <button
        class="icon-btn sync"
        class:bad={db.state === 'offline'}
        aria-label="Sync status"
        onclick={() => {
          db.reconnect();
          ui.toast(
            db.state === 'offline'
              ? `Offline${db.pendingCount ? ` · ${plural(db.pendingCount, 'change')} waiting` : ''} — they go out by themselves`
              : 'Syncing…',
          );
        }}
      >
        <UiIcon name={db.state === 'offline' ? 'cloud-off' : 'cloud-up'} size={20} />
      </button>
    {/if}

    {#if ui.mobile}
      <button class="icon-btn" aria-label="Undo" disabled={!history.undoStack.length} onclick={() => history.undo()}>
        <UiIcon name="arrow-back-up" size={20} />
      </button>
    {:else}
      <button class="icon-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.undoStack.length} onclick={() => history.undo()}>
        <UiIcon name="arrow-back-up" size={18} />
      </button>
      <button class="icon-btn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.redoStack.length} onclick={() => history.redo()}>
        <UiIcon name="arrow-forward-up" size={18} />
      </button>
    {/if}
    <button
      class="icon-btn"
      class:on={ui.showHidden || ui.hideDone}
      aria-label="View options"
      title="View options"
      onclick={(e) => ui.open({ kind: 'view', anchor: e.currentTarget, ids: [] })}
    >
      <UiIcon name="adjustments-horizontal" size={ui.mobile ? 20 : 18} />
    </button>
    {#if !ui.mobile}
      <button class="palette-btn" onclick={() => (ui.palette = true)} title="Command palette">
        <UiIcon name="command" size={15} /> <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
    {/if}
  </div>

  {#if filterCount || ui.showHidden || ui.hideDone}
    <div class="filters">
      {#each [...ui.filterStatus] as id (id)}
        {@const s = id === 'none' ? null : db.statuses[id]}
        <button class="fchip" onclick={() => ui.filterStatus.delete(id)}>
          <StatusIcon status={s} size={14} />
          {s?.name ?? 'No status'}
          <UiIcon name="x" size={12} />
        </button>
      {/each}
      {#if ui.filterStatus.size && ui.filterTags.size}<span class="and">and</span>{/if}
      {#each [...ui.filterTags] as id, i (id)}
        {@const t = db.tags[id]}
        {#if i > 0}
          <button class="mode" title="Switch between any / all tags" onclick={() => { ui.tagMode = ui.tagMode === 'any' ? 'all' : 'any'; ui.persist(); }}>
            {ui.tagMode === 'any' ? 'or' : 'and'}
          </button>
        {/if}
        {#if t}
          <button class="fchip ink" style:--c={t.color} onclick={() => ui.filterTags.delete(id)}>
            {#if t.icon}<Icon icon={t.icon} size={13} />{:else}#{/if}{t.name}
            <UiIcon name="x" size={12} />
          </button>
        {/if}
      {/each}
      {#if ui.showHidden}
        <button class="fchip soft" onclick={() => { ui.showHidden = false; ui.persist(); }}>
          <UiIcon name="eye" size={13} /> Showing hidden <UiIcon name="x" size={12} />
        </button>
      {/if}
      {#if ui.hideDone}
        <button class="fchip soft" onclick={() => { ui.hideDone = false; ui.persist(); }}>
          <UiIcon name="circle-check" size={13} /> Done hidden <UiIcon name="x" size={12} />
        </button>
      {/if}
      {#if filterCount > 1}
        <button class="clear-all" onclick={() => ui.clearFilters()}>Clear</button>
      {/if}
      {#if canSave && ui.mobile}
        <button class="clear-all" onclick={(e) => ui.open({ kind: 'saveView', anchor: e.currentTarget, ids: [] })}>
          <UiIcon name="bookmark-plus" size={14} /> Save view
        </button>
      {/if}
    </div>
  {/if}
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 25;
    padding: 10px 16px 6px;
    padding-top: calc(10px + env(safe-area-inset-top));
    background: linear-gradient(var(--bg) 55%, color-mix(in oklch, var(--bg) 0%, transparent));
  }

  :global(:root:not([data-bg='plain'])) .topbar {
    background: transparent;
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    mask-image: linear-gradient(black 80%, transparent);
  }

  .topbar.mobile {
    padding-left: 8px;
    padding-right: 8px;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 38px;
  }

  .spacer {
    flex: 1;
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: 2px;
    /* Shrinks before the controls do, but never all the way to nothing. */
    min-width: 4.5em;
    color: var(--text-3);
    font-size: 0.92em;
  }

  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 16em;
    height: 30px;
    padding: 0 7px;
    border-radius: 8px;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button.crumb:hover {
    background: var(--hover);
    color: var(--text);
  }

  .crumb.current {
    color: var(--text);
    font-weight: 600;
  }

  .crumb.home {
    font-size: 1.05em;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    width: min(300px, 38vw);
    /* It gives room up before anything is pushed off the edge of the bar. */
    min-width: 108px;
    height: 34px;
    padding: 0 8px 0 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: color-mix(in oklch, var(--surface) 75%, transparent);
    color: var(--text-3);
    transition: width 0.2s, border-color 0.15s, box-shadow 0.15s;
  }

  .mobile .search {
    flex: 1;
    width: auto;
  }

  .search:focus-within,
  .search.active {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 3px var(--accent-soft);
    width: min(380px, 46vw);
  }

  .mobile .search:focus-within,
  .mobile .search.active {
    width: auto;
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text);
    font-size: max(16px, 0.95em);
  }

  .clear {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
  }

  .clear:hover {
    background: var(--hover);
  }

  .icon-btn:disabled {
    opacity: 0.35;
    pointer-events: none;
  }

  .palette-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 8px 0 10px;
    margin-left: 4px;
    border-radius: 999px;
    color: var(--text-3);
    border: 1px solid var(--border);
    background: color-mix(in oklch, var(--surface) 60%, transparent);
  }

  .palette-btn:hover {
    color: var(--text);
    border-color: var(--border-2);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 2px 2px;
  }

  .fchip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 0.82em;
    font-weight: 560;
    background: color-mix(in oklch, var(--c, var(--accent)) 14%, transparent);
    border: 1px solid color-mix(in oklch, var(--c, var(--accent)) 30%, transparent);
  }

  .fchip.soft {
    color: var(--text-2);
    background: var(--bg-2);
    border-color: var(--border);
  }

  .and,
  .mode {
    font-size: 0.78em;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .mode {
    padding: 2px 6px;
    border-radius: 6px;
    border: 1px dashed var(--border-2);
  }

  .view-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 9px;
    margin-left: 6px;
    border-radius: 999px;
    font-size: 0.8em;
    font-weight: 600;
    background: color-mix(in oklch, var(--c) var(--chip-mix), transparent);
    white-space: nowrap;
  }

  .save-view {
    color: var(--accent-ink);
  }

  .sync.bad {
    color: #d97706;
  }

  .clear-all {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.82em;
    color: var(--text-3);
    padding: 3px 8px;
    border-radius: 6px;
  }

  .clear-all:hover {
    background: var(--hover);
    color: var(--text);
  }
</style>
