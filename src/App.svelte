<script lang="ts">
  import { onMount } from 'svelte';
  import { seed } from './lib/actions.svelte';
  import { onGlobalKey } from './lib/keys';
  import { db, model } from './lib/model.svelte';
  import { settings } from './lib/settings.svelte';
  import { applyAppearance } from './lib/theme';
  import { ui } from './lib/ui.svelte';
  import BulkBar from './components/BulkBar.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import Composer from './components/Composer.svelte';
  import Confirm from './components/Confirm.svelte';
  import EditToolbar from './components/EditToolbar.svelte';
  import Login from './components/Login.svelte';
  import Logo from './components/Logo.svelte';
  import Outline from './components/Outline.svelte';
  import PopoverHost from './components/PopoverHost.svelte';
  import Settings from './components/settings/Settings.svelte';
  import Shortcuts from './components/Shortcuts.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Toasts from './components/Toasts.svelte';
  import TopBar from './components/TopBar.svelte';

  $effect(() => {
    applyAppearance(settings.appearance, ui.systemDark);
  });

  onMount(() => {
    void db.start();
    // First run on a fresh server: default statuses, tags and a short tour.
    db.whenSynced().then(() => {
      if (!settings.app.seeded && !model.statusList.length && !Object.keys(db.items).length) seed();
    });
  });

  // Leaving a zoomed item that got deleted/archived elsewhere.
  $effect(() => {
    if (ui.zoom && db.loaded && db.online && !db.items[ui.zoom]) ui.go('outline', null);
  });

  // Drop selections of rows that vanished (other device, archive, filters).
  $effect(() => {
    for (const id of ui.selection) if (!db.items[id]) ui.selection.delete(id);
    if (ui.selecting && !ui.selection.size) ui.selecting = false;
  });
</script>

<svelte:window onkeydown={onGlobalKey} />

<div class="backdrop" aria-hidden="true"></div>

{#if db.state === 'auth'}
  <Login />
{:else if !db.loaded}
  <div class="splash"><Logo size={56} /></div>
{:else}
  <div class="app">
    <Sidebar />
    <main>
      <TopBar />
      <Outline />
    </main>
  </div>

  {#if ui.mobile && ui.editing}
    <EditToolbar />
  {:else if ui.mobile && ui.view === 'outline' && !ui.selection.size}
    <Composer docked />
  {/if}
  <BulkBar />
  <PopoverHost />
  <Toasts />
  {#if ui.palette}<CommandPalette />{/if}
  {#if ui.settingsOpen}<Settings />{/if}
  {#if ui.shortcuts}<Shortcuts />{/if}
  <Confirm />
{/if}

<style>
  .app {
    display: flex;
    min-height: 100dvh;
  }

  main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 0 16px;
  }

  .splash {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    animation: pulse 1.4s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.6;
      transform: scale(0.96);
    }
  }

  @media (max-width: 720px) {
    main {
      padding: 0;
    }
  }

  :global(body.dragging) {
    cursor: grabbing;
    user-select: none;
  }
</style>
