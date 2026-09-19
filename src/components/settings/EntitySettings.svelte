<script lang="ts">
  import { createStatus, createTag, deleteEntity, reorderEntity, updateEntity } from '../../lib/actions.svelte';
  import { model } from '../../lib/model.svelte';
  import { settings } from '../../lib/settings.svelte';
  import type { IconRef, Status, Tag } from '../../lib/types';
  import { ui } from '../../lib/ui.svelte';
  import { plural } from '../../lib/util';
  import Icon from '../Icon.svelte';
  import StatusIcon from '../StatusIcon.svelte';
  import TagChip from '../TagChip.svelte';
  import UiIcon from '../UiIcon.svelte';

  let { kind }: { kind: 'status' | 'tag' } = $props();

  const list: (Status | Tag)[] = $derived(kind === 'status' ? model.statusList : model.tagList);
  let newName = $state('');

  function count(id: string) {
    return kind === 'status' ? (model.counts.status.get(id) ?? 0) : (model.counts.tag.get(id) ?? 0);
  }

  function add(e: SubmitEvent) {
    e.preventDefault();
    const name = newName.trim().replace(kind === 'tag' ? /^#/ : /^@/, '');
    if (!name) return;
    if (kind === 'status') createStatus(name);
    else createTag(name);
    newName = '';
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    reorderEntity(kind, list[i].id, dir < 0 ? list[j].id : (list[j + 1]?.id ?? null));
  }

  function pickIcon(e: MouseEvent, ent: Status | Tag) {
    ui.open({
      kind: 'icon',
      anchor: e.currentTarget as HTMLElement,
      ids: [],
      data: { value: ent.icon, color: ent.color, onpick: (icon: IconRef | null) => updateEntity(kind, ent.id, { icon }, 'Change icon') },
    });
  }

  function pickColor(e: MouseEvent, ent: Status | Tag) {
    ui.open({
      kind: 'color',
      anchor: e.currentTarget as HTMLElement,
      ids: [],
      data: { value: ent.color, onpick: (color: string) => updateEntity(kind, ent.id, { color }, 'Change colour') },
    });
  }

  function remove(ent: Status | Tag) {
    const n = count(ent.id);
    const label = kind === 'status' ? ent.name : `#${ent.name}`;
    if (n === 0) return deleteEntity(kind, ent.id);
    ui.confirm = {
      text: `Delete ${label}? ${plural(n, 'item')} ${n === 1 ? 'uses' : 'use'} it and will ${kind === 'status' ? 'lose their status' : 'lose the tag'}. You can undo.`,
      action: 'Delete',
      run: () => deleteEntity(kind, ent.id),
    };
  }
</script>

<p class="intro">
  {#if kind === 'status'}
    Statuses show as the icon in front of each item. Mark the ones that mean <b>finished</b> as “done” — they drive
    progress, Ctrl+Enter and “hide done”. Type <kbd>@name</kbd> while adding an item, or press <kbd>1</kbd>–<kbd>9</kbd>.
  {:else}
    Tags are coloured labels. Type <kbd>#name</kbd> in any item to add one (new names create the tag).
  {/if}
</p>

<div class="list">
  {#each list as ent, i (ent.id)}
    <div class="ent">
      <div class="order">
        <button aria-label="Move up" disabled={i === 0} onclick={() => move(i, -1)}><UiIcon name="chevron-down" size={14} /></button>
        <button aria-label="Move down" disabled={i === list.length - 1} onclick={() => move(i, 1)}><UiIcon name="chevron-down" size={14} /></button>
      </div>
      <button class="pick ink" style:--c={ent.color} title="Icon" aria-label="Choose icon" onclick={(e) => pickIcon(e, ent)}>
        {#if ent.icon}<Icon icon={ent.icon} size={20} />{:else}<UiIcon name="icons" size={18} />{/if}
      </button>
      <button class="color" style:--c={ent.color} title="Colour" aria-label="Choose colour" onclick={(e) => pickColor(e, ent)}></button>
      <input
        class="field name"
        value={ent.name}
        aria-label="Name"
        onchange={(e) => {
          const v = e.currentTarget.value.trim();
          if (v && v !== ent.name) updateEntity(kind, ent.id, { name: v }, 'Rename');
          else e.currentTarget.value = ent.name;
        }}
        onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span class="preview">
        {#if kind === 'status'}<StatusIcon status={ent as Status} size={16} />{:else}<TagChip tag={ent as Tag} />{/if}
      </span>
      {#if kind === 'status'}
        {@const st = ent as Status}
        <label class="flag" title="Counts as done">
          <button class="switch" role="switch" aria-checked={st.done} aria-label="Counts as done"
            onclick={() => updateEntity('status', st.id, { done: !st.done }, st.done ? 'Not a done status' : 'Done status')}></button>
          <span>Done</span>
        </label>
        <button
          class="default"
          class:on={settings.behavior.defaultStatus === st.id}
          title="Default for new items"
          aria-label="Default for new items"
          onclick={() => settings.setBehavior({ defaultStatus: settings.behavior.defaultStatus === st.id ? null : st.id })}
        >
          <UiIcon name="bolt" size={15} />
        </button>
      {/if}
      <span class="n">{count(ent.id) || ''}</span>
      <button class="icon-btn del" aria-label="Delete" title="Delete" onclick={() => remove(ent)}><UiIcon name="trash" size={16} /></button>
    </div>
  {/each}
</div>

<form class="add" onsubmit={add}>
  <input class="field" bind:value={newName} placeholder={kind === 'status' ? 'New status…' : 'New tag…'} aria-label="New name" />
  <button class="btn primary" disabled={!newName.trim()}><UiIcon name="plus" size={16} /> Add</button>
</form>

{#if kind === 'status'}
  <p class="foot"><UiIcon name="bolt" size={14} /> marks the status new items start with (currently
    <b>{settings.behavior.defaultStatus ? model.statusList.find((s) => s.id === settings.behavior.defaultStatus)?.name : 'none'}</b>).</p>
{/if}

<style>
  .intro,
  .foot {
    margin: 0 0 14px;
    color: var(--text-2);
    font-size: 0.9em;
    line-height: 1.55;
  }

  .foot {
    margin-top: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ent {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 4px;
    border-radius: calc(var(--radius) * 0.8);
    border: 1px solid var(--border);
    background: var(--surface);
  }

  .order {
    display: flex;
    flex-direction: column;
    flex: none;
  }

  .order button {
    display: grid;
    place-items: center;
    width: 20px;
    height: 15px;
    color: var(--text-3);
    border-radius: 4px;
  }

  .order button:first-child :global(svg) {
    transform: rotate(180deg);
  }

  .order button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }

  .order button:disabled {
    opacity: 0.25;
  }

  .pick {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: none;
    border-radius: 10px;
    background: color-mix(in oklch, var(--c) var(--chip-mix), transparent);
    transition: transform 0.12s;
  }

  .pick:hover {
    transform: scale(1.06);
  }

  .color {
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 50%;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
    transition: transform 0.12s;
  }

  .color:hover {
    transform: scale(1.12);
  }

  .name {
    flex: 1;
    min-width: 60px;
  }

  .preview {
    display: inline-flex;
    flex: none;
  }

  .flag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82em;
    color: var(--text-2);
    flex: none;
  }

  .default {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: var(--text-3);
    flex: none;
  }

  .default.on {
    color: var(--on-accent);
    background: var(--accent);
  }

  .n {
    min-width: 1.6em;
    text-align: right;
    font-size: 0.82em;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }

  .del:hover {
    color: var(--danger);
  }

  .add {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  @media (max-width: 720px) {
    .ent {
      flex-wrap: wrap;
    }

    .preview {
      display: none;
    }

    .name {
      flex-basis: calc(100% - 140px);
    }
  }
</style>
