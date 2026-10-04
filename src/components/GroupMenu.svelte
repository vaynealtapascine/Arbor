<script lang="ts">
  import { untrack } from 'svelte';
  import { autofocus } from '../lib/autofocus';
  import { createCustomGroup, deleteCustomGroup, renameCustomGroup, reorderCustomGroup, setCustomGroup } from '../lib/groups';
  import { db, model } from '../lib/model.svelte';
  import type { CustomGroup } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import { fold, plural } from '../lib/util';
  import UiIcon from './UiIcon.svelte';

  let { ids, editGroup }: { ids: string[]; editGroup?: string } = $props();
  let query = $state('');
  let index = $state(0);
  let editing = $state<string | null>(untrack(() => editGroup ?? null));
  let editName = $state(untrack(() => model.customGroups.find((group) => group.id === editGroup)?.name ?? ''));
  let editError = $state('');

  const assigning = $derived(ids.length > 0);
  const matches = $derived(model.customGroups.filter((group) => !query || fold(group.name).includes(fold(query))));
  const existing = $derived(model.customGroups.find((group) => fold(group.name) === fold(query.trim())));
  const options = $derived(assigning ? [null, ...matches.map((group) => group.id)] : matches.map((group) => group.id));
  const current = $derived.by(() => {
    const known = new Set(model.customGroups.map((group) => group.id));
    const assigned = new Set(ids.map((id) => {
      const group = db.items[id]?.customGroup;
      return group && known.has(group) ? group : null;
    }));
    return assigned.size === 1 ? [...assigned][0] : undefined;
  });
  const counts = $derived.by(() => {
    const result = new Map<string, number>();
    for (const item of Object.values(db.items)) {
      if (item.customGroup && !model.info.get(item.id)?.archived) {
        result.set(item.customGroup, (result.get(item.customGroup) ?? 0) + 1);
      }
    }
    return result;
  });

  function choose(group: string | null) {
    if (!assigning) return;
    setCustomGroup(ids, group);
    ui.closePopover();
  }

  function create() {
    const group = createCustomGroup(query, ids);
    if (!group) return;
    query = '';
    index = 0;
    if (assigning) ui.closePopover();
  }

  function beginRename(group: CustomGroup) {
    editing = group.id;
    editName = group.name;
    editError = '';
  }

  function saveRename(id: string) {
    if (!editName.trim()) return;
    if (renameCustomGroup(id, editName)) {
      editing = null;
      editError = '';
    } else editError = 'A group with that name already exists.';
  }

  function remove(id: string) {
    deleteCustomGroup(id);
    if (editing === id) editing = null;
    index = 0;
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      index = (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!matches.length && query.trim()) return create();
      const selected = existing?.id ?? options[index];
      if (selected === undefined) return;
      if (assigning) choose(selected);
      else {
        const group = model.customGroups.find((entry) => entry.id === selected);
        if (group) beginRename(group);
      }
    }
  }
</script>

<div class="menu group-menu">
  <div class="menu-label">{assigning ? `Group for ${plural(ids.length, 'item')}` : 'Custom groups'}</div>
  <input class="field search" bind:value={query} aria-label="Find or create a group" placeholder="Find or create a group…"
    autocomplete="off" enterkeyhint="done" {onkeydown} oninput={() => (index = query.trim() && assigning ? 1 : 0)} use:autofocus />

  {#if assigning}
    <button class="menu-item" class:active={index === 0} aria-pressed={current === null}
      onclick={() => choose(null)} onpointerenter={() => (index = 0)}>
      <span class="group-icon"><UiIcon name="list" size={17} /></span>
      <span>Ungrouped</span>
      {#if current === null}<span class="hint"><UiIcon name="check" size={16} /></span>{/if}
    </button>
  {/if}

  <div class="group-list scroll-thin">
    {#each matches as group, i (group.id)}
      {#if editing === group.id}
        <form class="rename" onsubmit={(event) => { event.preventDefault(); saveRename(group.id); }}>
          <input class="field" bind:value={editName} aria-label={`Rename group ${group.name}`} enterkeyhint="done"
            oninput={() => (editError = '')} use:autofocus={true} />
          <button class="save" type="submit" disabled={!editName.trim()}>Save</button>
          <button class="group-action" type="button" aria-label="Cancel rename" onclick={() => (editing = null)}>
            <UiIcon name="x" size={16} />
          </button>
          {#if editError}<span class="error" role="alert">{editError}</span>{/if}
        </form>
      {:else}
        <div class="group-row" class:active={!assigning && index === i}>
          {#if assigning}
            <button class="menu-item choice" class:active={index === i + 1} aria-pressed={current === group.id}
              title={group.name} onclick={() => choose(group.id)} onpointerenter={() => (index = i + 1)}>
              <span class="group-icon" style:color={group.color ?? 'var(--text-2)'}><UiIcon name="folder" size={17} /></span>
              <span class="name">{group.name}</span>
              {#if current === group.id}<span class="hint"><UiIcon name="check" size={16} /></span>{/if}
            </button>
          {:else}
            <span class="group-label" title={group.name}>
              <span class="group-icon" style:color={group.color ?? 'var(--text-2)'}><UiIcon name="folder" size={17} /></span>
              <span class="name">{group.name}</span>
              <span class="count" title={plural(counts.get(group.id) ?? 0, 'item')}>{counts.get(group.id) ?? 0}</span>
            </span>
            <button class="group-action" type="button" aria-label={`Move group ${group.name} up`} title="Move group up"
              disabled={model.customGroups[0]?.id === group.id} onclick={() => reorderCustomGroup(group.id, -1)}>
              <UiIcon name="arrow-up" size={16} />
            </button>
            <button class="group-action" type="button" aria-label={`Move group ${group.name} down`} title="Move group down"
              disabled={model.customGroups.at(-1)?.id === group.id} onclick={() => reorderCustomGroup(group.id, 1)}>
              <UiIcon name="arrow-down" size={16} />
            </button>
          {/if}
          <button class="group-action" type="button" aria-label={`Rename group ${group.name}`} title="Rename group" onclick={() => beginRename(group)}>
            <UiIcon name="pencil" size={16} />
          </button>
          <button class="group-action danger" type="button" aria-label={`Delete group ${group.name}`} title="Delete group · items become Ungrouped"
            onclick={() => remove(group.id)}><UiIcon name="trash" size={16} /></button>
        </div>
      {/if}
    {:else}
      <p class="empty">{query ? 'No matching groups.' : 'Create a group to name your own sections.'}</p>
    {/each}
  </div>

  <div class="menu-sep"></div>
  <button class="menu-item create" disabled={!query.trim() || !!existing} onclick={create}>
    <UiIcon name="plus" size={17} />
    <span>{existing ? 'A group with this name already exists' : query.trim() ? `Create “${query.trim()}”` : 'Type a name above to create a group'}</span>
  </button>
  {#if !assigning && ui.group !== 'custom'}
    <button class="menu-item" onclick={() => { ui.group = 'custom'; ui.persist(); ui.closePopover(); }}>
      <UiIcon name="folder" size={17} /> Show custom groups
    </button>
  {/if}
</div>

<style>
  .group-menu { min-width: 280px; }
  .search { margin: 2px 0 6px; }
  .group-list { max-height: min(45vh, 360px); overflow-y: auto; }
  .group-row { display: flex; align-items: center; gap: 1px; border-radius: calc(var(--radius) * 0.55); }
  .group-row.active { background: var(--hover); }
  .choice, .group-label { flex: 1; min-width: 0; }
  .choice { min-height: 40px; }
  .group-label { display: flex; align-items: center; gap: 8px; padding: 5px 4px 5px 10px; font-size: 0.94em; }
  .group-icon { display: grid; flex: none; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { margin-left: auto; font-size: 0.8em; color: var(--text-3); }
  .group-action { display: grid; place-items: center; width: 32px; height: 40px; flex: none; color: var(--text-2); border-radius: 6px; }
  .group-action:hover { color: var(--text); background: var(--hover); }
  .group-action.danger:hover { color: var(--danger); }
  .group-action:disabled { opacity: 0.3; cursor: default; }
  .rename { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 4px 0; }
  .rename .field { flex: 1; width: 0; min-width: 100px; }
  .save { min-height: 38px; padding: 0 9px; color: var(--accent-ink); border-radius: 6px; background: var(--accent-soft); font-weight: 600; }
  .save:disabled, .create:disabled { opacity: 0.5; cursor: default; }
  .create span { overflow-wrap: anywhere; }
  .empty { margin: 8px 10px 12px; font-size: 0.85em; color: var(--text-3); }
  .error { flex-basis: 100%; padding: 0 4px; font-size: 0.82em; color: var(--danger); }
  @media (pointer: coarse) {
    .group-action { width: 40px; height: 44px; }
    .save { min-height: 44px; }
  }
</style>
