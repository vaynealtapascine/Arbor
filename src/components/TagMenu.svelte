<script lang="ts">
  import { createTag, setTag, toggleTag } from '../lib/actions.svelte';
  import { autofocus } from '../lib/autofocus';
  import { db, model } from '../lib/model.svelte';
  import { ui } from '../lib/ui.svelte';
  import { fold } from '../lib/util';
  import Icon from './Icon.svelte';
  import UiIcon from './UiIcon.svelte';

  let { ids }: { ids: string[] } = $props();

  let q = $state('');
  let index = $state(0);

  const list = $derived(model.tagList.filter((t) => !q || fold(t.name).includes(fold(q.replace(/^#/, '')))));
  const exact = $derived(model.tagList.some((t) => fold(t.name) === fold(q.replace(/^#/, ''))));
  const canCreate = $derived(!!q.replace(/^#/, '').trim() && !exact);
  const count = $derived(list.length + (canCreate ? 1 : 0));

  function tagState(tagId: string): 'all' | 'some' | 'none' {
    const n = ids.filter((id) => db.items[id]?.tags.includes(tagId)).length;
    return n === 0 ? 'none' : n === ids.length ? 'all' : 'some';
  }

  function create() {
    const name = q.replace(/^#/, '').trim();
    if (!name) return;
    const id = createTag(name);
    setTag(ids, id, true);
    q = '';
  }

  function activate(i: number) {
    if (i < list.length) toggleTag(ids, list[i].id);
    else create();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (count) index = (index + (e.key === 'ArrowDown' ? 1 : -1) + count) % count;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (count) activate(Math.min(index, count - 1));
    }
  }
</script>

<div class="menu">
  <input class="field search" placeholder="Find or create a tag…" bind:value={q} oninput={() => (index = 0)} {onkeydown}
    use:autofocus />
  <div class="list scroll-thin">
    {#each list as t, i (t.id)}
      {@const st = tagState(t.id)}
      <button class="menu-item" class:active={i === index} onclick={() => toggleTag(ids, t.id)} onpointerenter={() => (index = i)}>
        <span class="box" class:on={st !== 'none'} style:--c={t.color}>
          {#if st === 'all'}<UiIcon name="check" size={13} stroke={2.6} />{:else if st === 'some'}<UiIcon name="minus" size={13} stroke={2.6} />{/if}
        </span>
        <span class="ink tagname" style:--c={t.color}>
          {#if t.icon}<Icon icon={t.icon} size={15} />{/if}
          {t.name}
        </span>
        <span class="hint">{model.counts.tag.get(t.id) ?? 0}</span>
      </button>
    {/each}
    {#if canCreate}
      <button class="menu-item" class:active={index === list.length} onclick={create} onpointerenter={() => (index = list.length)}>
        <span class="box plus"><UiIcon name="plus" size={13} stroke={2.4} /></span>
        Create <b>#{q.replace(/^#/, '').trim()}</b>
      </button>
    {/if}
    {#if !list.length && !canCreate}
      <div class="empty">Type a name to create your first tag</div>
    {/if}
  </div>
  <div class="menu-sep"></div>
  <button class="menu-item subtle" onclick={() => { ui.closePopover(); ui.settingsOpen = 'tags'; }}>
    <span class="ic"><UiIcon name="pencil" size={16} /></span> Manage tags…
  </button>
</div>

<style>
  .search {
    margin-bottom: 4px;
  }

  .list {
    max-height: 300px;
    overflow-y: auto;
  }

  .box {
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 1.5px solid var(--border-2);
    color: white;
    flex: none;
  }

  .box.on {
    background: var(--c);
    border-color: var(--c);
  }

  .box.plus {
    border-style: dashed;
    color: var(--text-2);
  }

  .tagname {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 540;
  }

  .ic {
    display: inline-grid;
    place-items: center;
    width: 20px;
  }

  .subtle {
    color: var(--text-2);
  }

  .empty {
    padding: 10px;
    color: var(--text-3);
    font-size: 0.9em;
  }
</style>
