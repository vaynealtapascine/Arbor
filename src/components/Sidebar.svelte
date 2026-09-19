<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { db, model } from '../lib/model.svelte';
  import { settings } from '../lib/settings.svelte';
  import { ui } from '../lib/ui.svelte';
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import StatusIcon from './StatusIcon.svelte';
  import UiIcon from './UiIcon.svelte';

  const counts = $derived(model.counts);
  const dark = $derived(
    settings.appearance.mode === 'dark' || (settings.appearance.mode === 'auto' && ui.systemDark),
  );
  const overlay = $derived(ui.mobile);
  const visible = $derived(overlay ? ui.drawer : ui.sidebar);

  function toggleStatus(id: string) {
    if (ui.filterStatus.has(id)) ui.filterStatus.delete(id);
    else ui.filterStatus.add(id);
    if (ui.view !== 'outline') ui.go('outline', ui.zoom);
    if (overlay) ui.drawer = false;
  }

  function toggleTagFilter(id: string) {
    if (ui.filterTags.has(id)) ui.filterTags.delete(id);
    else ui.filterTags.add(id);
    if (ui.view !== 'outline') ui.go('outline', ui.zoom);
    if (overlay) ui.drawer = false;
  }

  function hide() {
    if (overlay) ui.drawer = false;
    else {
      ui.sidebar = false;
      ui.persist();
    }
  }

  const syncLabel = $derived(
    db.state === 'synced'
      ? 'Synced'
      : db.state === 'syncing'
        ? db.pendingCount
          ? `Saving ${db.pendingCount}…`
          : 'Syncing…'
        : db.state === 'offline'
          ? db.pendingCount
            ? `Offline · ${db.pendingCount} to send`
            : 'Offline'
          : db.state === 'auth'
            ? 'Locked'
            : 'Loading…',
  );
</script>

{#if visible}
  {#if overlay}
    <div class="scrim" transition:fade={{ duration: 150 }} onpointerdown={() => (ui.drawer = false)} aria-hidden="true"></div>
  {/if}
  <aside class="sidebar glass scroll-thin" class:overlay transition:fly={{ x: -24, duration: overlay ? 200 : 0 }}>
    <div class="brand">
      <Logo size={28} />
      <span class="name">Arbor</span>
      <button class="icon-btn" aria-label="Hide sidebar" title="Hide sidebar (Ctrl+\)" onclick={hide}>
        <UiIcon name="layout-sidebar-left-collapse" size={18} />
      </button>
    </div>

    <nav>
      <button class="nav" class:on={ui.view === 'outline' && !ui.zoom && !ui.filtering} onclick={() => { ui.clearFilters(); ui.go('outline', null); }}>
        <UiIcon name="home" size={18} /> <span>All items</span> <span class="n">{counts.total}</span>
      </button>
      <button class="nav" class:on={ui.view === 'archive'} onclick={() => ui.go('archive')}>
        <UiIcon name="archive" size={18} /> <span>Archive</span> <span class="n">{model.archivedRoots.length || ''}</span>
      </button>
      <button class="nav" class:on={ui.showHidden} onclick={() => { ui.showHidden = !ui.showHidden; ui.persist(); }}>
        <UiIcon name={ui.showHidden ? 'eye' : 'eye-off'} size={18} /> <span>Show hidden</span>
        <span class="n">{counts.hidden || ''}</span>
      </button>
    </nav>

    <section>
      <header>
        <span>Statuses</span>
        <button class="icon-btn xs" aria-label="Edit statuses" title="Edit statuses" onclick={() => (ui.settingsOpen = 'statuses')}>
          <UiIcon name="pencil" size={14} />
        </button>
      </header>
      {#each model.statusList as s (s.id)}
        <button class="nav" class:on={ui.filterStatus.has(s.id)} onclick={() => toggleStatus(s.id)}>
          <span class="lead"><StatusIcon status={s} size={17} /></span>
          <span>{s.name}</span>
          <span class="n">{counts.status.get(s.id) || ''}</span>
        </button>
      {/each}
      <button class="nav" class:on={ui.filterStatus.has('none')} onclick={() => toggleStatus('none')}>
        <span class="lead"><StatusIcon status={null} size={17} /></span>
        <span class="muted">No status</span>
        <span class="n">{counts.status.get(null) || ''}</span>
      </button>
    </section>

    <section>
      <header>
        <span>Tags</span>
        <button class="icon-btn xs" aria-label="Edit tags" title="Edit tags" onclick={() => (ui.settingsOpen = 'tags')}>
          <UiIcon name="pencil" size={14} />
        </button>
      </header>
      {#each model.tagList as t (t.id)}
        <button class="nav" class:on={ui.filterTags.has(t.id)} onclick={() => toggleTagFilter(t.id)}>
          <span class="lead ink" style:--c={t.color}>
            {#if t.icon}<Icon icon={t.icon} size={16} />{:else}<span class="dot" style:background={t.color}></span>{/if}
          </span>
          <span>{t.name}</span>
          <span class="n">{counts.tag.get(t.id) || ''}</span>
        </button>
      {:else}
        <p class="hint">Type <b>#name</b> in any item to create a tag.</p>
      {/each}
    </section>

    <footer>
      <button
        class="sync"
        class:bad={db.state === 'offline' || db.state === 'auth'}
        title={db.lastError || syncLabel}
        onclick={() => db.reconnect()}
      >
        <span class:spin={db.state === 'syncing' || db.state === 'loading'}>
          <UiIcon
            name={db.state === 'synced' ? 'cloud-check' : db.state === 'offline' ? 'cloud-off' : db.state === 'auth' ? 'lock' : 'refresh'}
            size={16}
          />
        </span>
        <span>{syncLabel}</span>
      </button>
      <div class="spacer"></div>
      <button
        class="icon-btn"
        aria-label="Toggle dark mode"
        title="Light / dark"
        onclick={() => settings.setAppearance({ mode: dark ? 'light' : 'dark' })}
      >
        <UiIcon name={dark ? 'sun' : 'moon'} size={18} />
      </button>
      <button class="icon-btn" aria-label="Settings" title="Settings (Ctrl+,)" onclick={() => (ui.settingsOpen = 'appearance')}>
        <UiIcon name="settings" size={18} />
      </button>
    </footer>
  </aside>
{/if}

<style>
  .sidebar {
    position: sticky;
    top: 0;
    align-self: flex-start;
    width: 256px;
    height: 100dvh;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 10px 10px;
    border-right: 1px solid var(--border);
    overflow-y: auto;
    z-index: 20;
  }

  .sidebar.overlay {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: min(300px, 86vw);
    z-index: 45;
    padding-top: calc(12px + env(safe-area-inset-top));
    box-shadow: var(--shadow-lg);
  }

  :global(:root[data-glass='on']) .sidebar.overlay {
    background: color-mix(in oklch, var(--surface) 92%, transparent);
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 44;
    background: rgb(0 0 0 / 0.3);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 4px 8px 6px;
  }

  .name {
    flex: 1;
    font-weight: 720;
    font-size: 1.12em;
    letter-spacing: -0.01em;
  }

  nav,
  section {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  section {
    margin-top: 10px;
  }

  section header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 4px 10px;
    font-size: 0.72em;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-3);
  }

  .icon-btn.xs {
    width: 24px;
    height: 24px;
    opacity: 0;
  }

  section:hover .icon-btn.xs,
  .icon-btn.xs:focus-visible {
    opacity: 1;
  }

  @media (hover: none) {
    .icon-btn.xs {
      opacity: 1;
    }
  }

  .nav {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border-radius: calc(var(--radius) * 0.65);
    text-align: left;
    color: var(--text-2);
    font-size: 0.93em;
    transition: background 0.12s, color 0.12s;
  }

  .nav > span:not(.lead):not(.n) {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav:hover {
    background: var(--hover);
    color: var(--text);
  }

  .nav.on {
    background: var(--accent-soft);
    color: var(--accent-ink);
    font-weight: 580;
  }

  .lead {
    display: inline-grid;
    place-items: center;
    width: 18px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .n {
    margin-left: auto;
    font-size: 0.82em;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }

  .muted {
    color: var(--text-3);
  }

  .hint {
    margin: 2px 10px;
    font-size: 0.84em;
    color: var(--text-3);
  }

  footer {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 2px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .spacer {
    flex: 1;
  }

  .sync {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 8px;
    border-radius: 8px;
    font-size: 0.8em;
    color: var(--text-3);
    min-width: 0;
  }

  .sync span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sync:hover {
    background: var(--hover);
  }

  .sync.bad {
    color: #d97706;
  }

  .spin {
    display: grid;
    animation: spin 1.2s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
