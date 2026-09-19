<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { buildCommands, jumpTo, type Command } from '../lib/commands';
  import { db, model } from '../lib/model.svelte';
  import { ui } from '../lib/ui.svelte';
  import { fold, plural } from '../lib/util';
  import { targets } from '../lib/commands';
  import StatusIcon from './StatusIcon.svelte';
  import UiIcon from './UiIcon.svelte';

  let q = $state('');
  let index = $state(0);
  let input: HTMLInputElement | undefined = $state();
  let list: HTMLElement | undefined = $state();

  const commands = buildCommands();
  const acting = targets();

  type Entry = { kind: 'cmd'; cmd: Command } | { kind: 'item'; id: string; path: string };

  function score(label: string, query: string): number {
    const l = fold(label);
    const qq = fold(query);
    if (!qq) return 1;
    if (l.startsWith(qq)) return 3;
    if (l.includes(qq)) return 2;
    // Subsequence match ("tgurg" → "Toggle tag #urgent").
    let i = 0;
    for (const ch of l) if (ch === qq[i]) i++;
    return i === qq.length ? 1 : 0;
  }

  const entries: Entry[] = $derived.by(() => {
    const query = q.trim();
    const cmds = commands
      .map((cmd) => ({ cmd, s: score(`${cmd.group} ${cmd.label}`, query) + score(cmd.label, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, query ? 12 : 40)
      .map((x) => ({ kind: 'cmd' as const, cmd: x.cmd }));
    if (!query) return cmds;
    const terms = query.toLowerCase().split(/\s+/);
    const items: Entry[] = [];
    for (const it of Object.values(db.items)) {
      const t = it.title.toLowerCase();
      if (!terms.every((x) => t.includes(x))) continue;
      items.push({ kind: 'item', id: it.id, path: model.pathOf(it.id).map((p) => p.title || 'Untitled').join(' › ') });
      if (items.length >= 30) break;
    }
    return [...items, ...cmds];
  });

  $effect(() => {
    void q;
    index = 0;
  });

  $effect(() => {
    input?.focus();
  });

  function close() {
    ui.palette = false;
  }

  function run(e: Entry) {
    close();
    if (e.kind === 'item') jumpTo(e.id);
    else setTimeout(() => e.cmd.run());
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = entries.length || 1;
      index = (index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      requestAnimationFrame(() => list?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (entries[index]) run(entries[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
</script>

<div class="scrim" transition:fade={{ duration: 120 }} onpointerdown={close} aria-hidden="true"></div>
<div class="palette glass" role="dialog" aria-label="Command palette" transition:scale={{ start: 0.97, duration: 140 }}>
  <div class="search">
    <UiIcon name="command" size={18} />
    <input bind:this={input} bind:value={q} placeholder="Type a command or search items…" {onkeydown} aria-label="Command" />
    {#if acting.length}<span class="acting">{plural(acting.length, 'item')}</span>{/if}
  </div>
  <div class="list scroll-thin" bind:this={list} role="listbox">
    {#each entries as e, i (e.kind === 'cmd' ? e.cmd.id : `item:${e.id}`)}
      {@const prevGroup = i > 0 ? (entries[i - 1].kind === 'cmd' ? (entries[i - 1] as { cmd: Command }).cmd.group : 'Items') : ''}
      {@const group = e.kind === 'cmd' ? e.cmd.group : 'Items'}
      {#if group !== prevGroup}<div class="menu-label">{group}</div>{/if}
      <button class="menu-item" class:active={i === index} role="option" aria-selected={i === index}
        onclick={() => run(e)} onpointermove={() => (index = i)}>
        {#if e.kind === 'cmd'}
          <UiIcon name={e.cmd.icon ?? 'command'} size={17} />
          <span class="label">{e.cmd.label}</span>
          {#if e.cmd.keys}<span class="hint"><kbd>{e.cmd.keys}</kbd></span>{/if}
        {:else}
          <StatusIcon status={db.items[e.id]?.status ? db.statuses[db.items[e.id].status!] : null} size={17} />
          <span class="label">
            {db.items[e.id]?.title || 'Untitled'}
            {#if e.path}<span class="path">{e.path}</span>{/if}
          </span>
          {#if model.info.get(e.id)?.archived}<span class="hint">archived</span>{/if}
        {/if}
      </button>
    {:else}
      <div class="empty">Nothing matches “{q}”</div>
    {/each}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgb(0 0 0 / 0.25);
  }

  .palette {
    position: fixed;
    top: min(14vh, 120px);
    left: 50%;
    translate: -50% 0;
    z-index: 81;
    width: min(620px, calc(100vw - 20px));
    max-height: min(560px, 72dvh);
    display: flex;
    flex-direction: column;
    border-radius: calc(var(--radius) + 4px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  :global(:root[data-glass='on']) .palette {
    background: color-mix(in oklch, var(--surface) 88%, transparent);
  }

  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    height: 54px;
    border-bottom: 1px solid var(--border);
    color: var(--text-3);
    flex: none;
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    font-size: 1.05em;
    color: var(--text);
  }

  .acting {
    font-size: 0.8em;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-ink);
  }

  .list {
    overflow-y: auto;
    padding: 6px;
  }

  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .path {
    margin-left: 8px;
    font-size: 0.82em;
    color: var(--text-3);
  }

  .empty {
    padding: 22px;
    text-align: center;
    color: var(--text-3);
  }
</style>
