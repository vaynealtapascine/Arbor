<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { ui } from '../../lib/ui.svelte';
  import UiIcon from '../UiIcon.svelte';
  import AppearanceSettings from './AppearanceSettings.svelte';
  import BehaviorSettings from './BehaviorSettings.svelte';
  import CssSettings from './CssSettings.svelte';
  import DataSettings from './DataSettings.svelte';
  import EntitySettings from './EntitySettings.svelte';
  import RowSettings from './RowSettings.svelte';

  const sections = [
    { id: 'appearance', name: 'Appearance', icon: 'palette' },
    { id: 'rows', name: 'Rows', icon: 'layout-list' },
    { id: 'statuses', name: 'Statuses', icon: 'circle-dot' },
    { id: 'tags', name: 'Tags', icon: 'tags' },
    { id: 'views', name: 'Views', icon: 'bookmark' },
    { id: 'templates', name: 'Templates', icon: 'template' },
    { id: 'behavior', name: 'Behaviour', icon: 'adjustments-horizontal' },
    { id: 'css', name: 'Custom CSS', icon: 'code' },
    { id: 'data', name: 'Data & sync', icon: 'database' },
  ];

  const current = $derived(sections.find((s) => s.id === ui.settingsOpen) ?? sections[0]);

  function close() {
    ui.settingsOpen = null;
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && !ui.popover && !ui.confirm) close();
  }}
/>

<div class="scrim" transition:fade={{ duration: 150 }} onpointerdown={close} aria-hidden="true"></div>
<div class="settings glass" role="dialog" aria-label="Settings" transition:fly={{ y: 16, duration: 200 }}>
  <nav class="scroll-thin">
    <div class="title">Settings</div>
    {#each sections as s (s.id)}
      <button class="tab" class:on={current.id === s.id} onclick={() => (ui.settingsOpen = s.id)}>
        <UiIcon name={s.icon} size={17} />
        <span>{s.name}</span>
      </button>
    {/each}
    <button class="tab" onclick={() => { close(); ui.shortcuts = true; }}>
      <UiIcon name="keyboard" size={17} /> <span>Shortcuts</span>
    </button>
    <div class="version">Arbor {__APP_VERSION__}</div>
  </nav>
  <div class="body scroll-thin">
    <header>
      <h2>{current.name}</h2>
      <button class="icon-btn" aria-label="Close settings" onclick={close}><UiIcon name="x" /></button>
    </header>
    <div class="content">
      {#if current.id === 'appearance'}
        <AppearanceSettings />
      {:else if current.id === 'rows'}
        <RowSettings />
      {:else if current.id === 'statuses'}
        <EntitySettings kind="status" />
      {:else if current.id === 'tags'}
        <EntitySettings kind="tag" />
      {:else if current.id === 'views'}
        <EntitySettings kind="view" />
      {:else if current.id === 'templates'}
        <EntitySettings kind="template" />
      {:else if current.id === 'behavior'}
        <BehaviorSettings />
      {:else if current.id === 'css'}
        <CssSettings />
      {:else}
        <DataSettings />
      {/if}
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgb(0 0 0 / 0.28);
  }

  .settings {
    position: fixed;
    inset: 0;
    z-index: 41;
    margin: auto;
    width: min(920px, calc(100vw - 32px));
    height: min(760px, calc(100dvh - 48px));
    display: flex;
    border-radius: calc(var(--radius) + 8px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  :global(:root[data-glass='on']) .settings {
    background: color-mix(in oklch, var(--surface) 90%, transparent);
  }

  nav {
    width: 210px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 16px 10px;
    border-right: 1px solid var(--border);
    background: color-mix(in oklch, var(--bg-2) 60%, transparent);
    overflow-y: auto;
  }

  .title {
    font-weight: 700;
    font-size: 1.05em;
    padding: 2px 10px 12px;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 10px;
    border-radius: calc(var(--radius) * 0.65);
    color: var(--text-2);
    text-align: left;
    font-size: 0.93em;
    flex: none;
  }

  .tab:hover {
    background: var(--hover);
    color: var(--text);
  }

  .tab.on {
    background: var(--accent-soft);
    color: var(--accent-ink);
    font-weight: 600;
  }

  .version {
    margin-top: auto;
    padding: 10px;
    font-size: 0.78em;
    color: var(--text-3);
  }

  .body {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }

  header {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px 10px 24px;
    background: linear-gradient(var(--surface) 70%, transparent);
  }

  h2 {
    margin: 0;
    font-size: 1.2em;
  }

  .content {
    padding: 4px 24px 30px;
  }

  @media (max-width: 720px) {
    .settings {
      width: 100vw;
      height: 100dvh;
      border-radius: 0;
      flex-direction: column;
      border: 0;
    }

    nav {
      width: auto;
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      padding: calc(8px + env(safe-area-inset-top)) 8px 8px;
      border-right: 0;
      border-bottom: 1px solid var(--border);
      scrollbar-width: none;
    }

    .title,
    .version {
      display: none;
    }

    .tab {
      height: 34px;
    }

    .content {
      padding: 4px 16px calc(30px + env(safe-area-inset-bottom));
    }

    header {
      padding: 10px 10px 8px 16px;
    }
  }
</style>
