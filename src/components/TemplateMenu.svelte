<script lang="ts">
  import { autofocus } from '../lib/autofocus';
  import { revealRow } from '../lib/focus';
  import { db, model } from '../lib/model.svelte';
  import { settings } from '../lib/settings.svelte';
  import { countNodes, useTemplate } from '../lib/templates';
  import type { Template } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import { fold } from '../lib/util';
  import Icon from './Icon.svelte';
  import UiIcon from './UiIcon.svelte';

  /** ids[0] (if any) becomes the parent; otherwise the current zoom level. */
  let { ids }: { ids: string[] } = $props();

  let q = $state('');
  let index = $state(0);
  const list = $derived(model.templateList.filter((t) => !q || fold(t.name).includes(fold(q))));

  function use(t: Template) {
    const parent = ids[0] && db.items[ids[0]] ? ids[0] : (ui.zoom ?? null);
    ui.closePopover();
    const created = useTemplate(t, parent, ids[0] ? 'end' : settings.behavior.addPosition);
    if (created[0]) {
      revealRow(created[0]);
      ui.edit(created[0], 'end');
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = Math.max(1, list.length);
      index = (index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (list[index]) use(list[index]);
    }
  }
</script>

<div class="menu">
  <input class="field" placeholder="Find a template…" bind:value={q} oninput={() => (index = 0)} {onkeydown} use:autofocus />
  {#each list as t, i (t.id)}
    <button class="menu-item" class:active={i === index} onclick={() => use(t)} onpointerenter={() => (index = i)}>
      <span class="ink lead" style:--c={t.color}>
        {#if t.icon}<Icon icon={t.icon} size={17} />{:else}<UiIcon name="template" size={17} />{/if}
      </span>
      <span class="name">{t.name}</span>
      <span class="hint">{countNodes(t.items)}</span>
    </button>
  {:else}
    <div class="empty">
      {#if model.templateList.length}No template matches.{:else}No templates yet — open an item’s menu and choose
        <b>Save as template</b>.{/if}
    </div>
  {/each}
  <div class="menu-sep"></div>
  <button class="menu-item subtle" onclick={() => { ui.closePopover(); ui.settingsOpen = 'templates'; }}>
    <UiIcon name="pencil" size={16} /> Manage templates…
  </button>
</div>

<style>
  .field {
    margin-bottom: 4px;
  }

  .lead {
    display: inline-grid;
    place-items: center;
    width: 20px;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    padding: 10px;
    font-size: 0.88em;
    color: var(--text-3);
  }

  .subtle {
    color: var(--text-2);
  }
</style>
