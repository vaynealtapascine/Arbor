<script lang="ts">
  import { setStatus } from '../lib/actions.svelte';
  import { autofocus } from '../lib/autofocus';
  import { db, model } from '../lib/model.svelte';
  import type { Status } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import { fold, plural } from '../lib/util';
  import StatusIcon from './StatusIcon.svelte';
  import UiIcon from './UiIcon.svelte';

  let { ids, onpick }: { ids: string[]; onpick?: (id: string | null) => void } = $props();

  let q = $state('');
  let index = $state(0);

  const current = $derived.by(() => {
    const set = new Set(ids.map((id) => db.items[id]?.status ?? null));
    return set.size === 1 ? [...set][0] : undefined;
  });

  type Opt = { id: string | null; status: Status | null; n: number };
  const options: Opt[] = $derived(
    [
      { id: null, status: null, n: 0 },
      ...model.statusList.map((s, i) => ({ id: s.id, status: s, n: i + 1 })),
    ].filter((o) => !q || fold(o.status?.name ?? 'no status').includes(fold(q))),
  );

  function choose(id: string | null) {
    ui.closePopover();
    if (onpick) onpick(id);
    else setStatus(ids, id);
  }

  function onkeydown(e: KeyboardEvent) {
    if (/^[0-9]$/.test(e.key) && !q) {
      e.preventDefault();
      const n = Number(e.key);
      const opt = n === 0 ? options.find((o) => o.id === null) : model.statusList[n - 1];
      if (opt) choose(opt.id);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      index = (index + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[index]) choose(options[index].id);
    }
  }
</script>

<div class="menu">
  <input class="field search" placeholder={ids.length > 1 ? `Status for ${plural(ids.length, 'item')}…` : 'Set status…'}
    bind:value={q} oninput={() => (index = 0)} {onkeydown} use:autofocus />
  {#each options as o, i (o.id ?? 'none')}
    <button class="menu-item" class:active={i === index} onclick={() => choose(o.id)} onpointerenter={() => (index = i)}>
      <span class="ic"><StatusIcon status={o.status} size={18} /></span>
      <span>{o.status?.name ?? 'No status'}</span>
      <span class="hint">
        {#if current === o.id}<UiIcon name="check" size={15} />{/if}
        {#if o.n < 10}<kbd>{o.n}</kbd>{/if}
      </span>
    </button>
  {/each}
  <div class="menu-sep"></div>
  <button class="menu-item subtle" onclick={() => { ui.closePopover(); ui.settingsOpen = 'statuses'; }}>
    <span class="ic"><UiIcon name="pencil" size={16} /></span> Edit statuses…
  </button>
</div>

<style>
  .search {
    margin-bottom: 4px;
  }

  .ic {
    display: inline-grid;
    place-items: center;
    width: 20px;
  }

  .subtle {
    color: var(--text-2);
  }
</style>
