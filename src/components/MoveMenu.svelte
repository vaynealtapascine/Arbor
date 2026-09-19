<script lang="ts">
  import { moveTo } from '../lib/actions.svelte';
  import { autofocus } from '../lib/autofocus';
  import { db, model } from '../lib/model.svelte';
  import { ui } from '../lib/ui.svelte';
  import { plural } from '../lib/util';
  import StatusIcon from './StatusIcon.svelte';
  import UiIcon from './UiIcon.svelte';

  let { ids }: { ids: string[] } = $props();

  let q = $state('');
  let index = $state(0);

  const blocked = $derived(new Set(ids.flatMap((id) => model.subtree(id))));
  const candidates = $derived.by(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out: { id: string | null; title: string; path: string }[] = [];
    for (const it of Object.values(db.items)) {
      if (blocked.has(it.id) || model.info.get(it.id)?.archived) continue;
      const t = it.title.toLowerCase();
      if (terms.length && !terms.every((x) => t.includes(x))) continue;
      out.push({
        id: it.id,
        title: it.title || 'Untitled',
        path: model.pathOf(it.id).map((p) => p.title || 'Untitled').join(' › '),
      });
    }
    out.sort((a, b) => a.path.length - b.path.length || a.title.localeCompare(b.title));
    if (!terms.length) out.unshift({ id: null, title: 'Top level', path: '' });
    return out.slice(0, 80);
  });

  function choose(id: string | null) {
    ui.closePopover();
    moveTo(ids, id, 'end');
    ui.toast(`Moved ${plural(ids.length, 'item')} to ${id ? db.items[id]?.title || 'Untitled' : 'top level'}`);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = Math.max(1, candidates.length);
      index = (index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = candidates[index];
      if (c) choose(c.id);
    }
  }
</script>

<div class="menu">
  <input
    class="field"
    placeholder="Move {plural(ids.length, 'item')} under…"
    bind:value={q}
    oninput={() => (index = 0)}
    {onkeydown}
    use:autofocus
  />
  <div class="list scroll-thin">
    {#each candidates as c, i (c.id ?? 'root')}
      <button class="menu-item" class:active={i === index} onclick={() => choose(c.id)} onpointerenter={() => (index = i)}>
        {#if c.id}
          <StatusIcon status={db.items[c.id]?.status ? db.statuses[db.items[c.id].status!] : null} size={16} />
        {:else}
          <UiIcon name="home" size={16} />
        {/if}
        <span class="text">
          <span class="t">{c.title}</span>
          {#if c.path}<span class="p">{c.path}</span>{/if}
        </span>
      </button>
    {:else}
      <div class="empty">No matching items</div>
    {/each}
  </div>
</div>

<style>
  .field {
    margin-bottom: 4px;
  }

  .list {
    max-height: 340px;
    overflow-y: auto;
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .t,
  .p {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .p {
    font-size: 0.8em;
    color: var(--text-3);
  }

  .empty {
    padding: 10px;
    color: var(--text-3);
  }
</style>
