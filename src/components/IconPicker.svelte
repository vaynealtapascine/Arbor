<script lang="ts">
  import { untrack } from 'svelte';
  import { autofocus } from '../lib/autofocus';
  import { loadEmoji, loadTabler, rank, sameIcon, type EmojiCatalog, type TablerCatalog } from '../lib/icons';
  import type { IconRef } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import Icon from './Icon.svelte';
  import UiIcon from './UiIcon.svelte';

  let {
    value,
    color = 'var(--text)',
    onpick,
  }: { value: IconRef | null; color?: string; onpick: (icon: IconRef | null) => void } = $props();

  const PAGE = 240;
  const initial = untrack(() => value);
  let tab: 'icons' | 'emoji' = $state(initial?.k === 'emoji' ? 'emoji' : 'icons');
  let filled = $state(initial?.k === 'tif');
  let q = $state('');
  let category = $state(-1);
  let limit = $state(PAGE);
  let tablerData = $state<TablerCatalog | null>(null);
  let emojiData = $state<EmojiCatalog | null>(null);
  let error = $state('');

  $effect(() => {
    if (tab === 'icons' && !tablerData) loadTabler().then((d) => (tablerData = d), (e) => (error = e.message));
    if (tab === 'emoji' && !emojiData) loadEmoji().then((d) => (emojiData = d), (e) => (error = e.message));
  });

  // Reset paging whenever the result set changes.
  $effect(() => {
    void [q, category, tab, filled];
    limit = PAGE;
  });

  const icons = $derived.by(() => {
    if (!tablerData) return [];
    const query = q.trim().toLowerCase().replace(/\s+/g, '-');
    const out: { e: TablerCatalog['icons'][number]; r: number }[] = [];
    for (const e of tablerData.icons) {
      if (!!e[4] !== filled) continue;
      if (category >= 0 && e[1] !== category) continue;
      const r = rank(e[0], e[2], query);
      if (r) out.push({ e, r });
    }
    if (query) out.sort((a, b) => b.r - a.r);
    return out.map((x) => x.e);
  });

  const emojis = $derived.by(() => {
    if (!emojiData) return [];
    const query = q.trim().toLowerCase();
    const out: { e: EmojiCatalog['emoji'][number]; r: number }[] = [];
    for (const e of emojiData.emoji) {
      if (category >= 0 && e[3] !== category) continue;
      const r = rank(e[1], e[2], query);
      if (r) out.push({ e, r });
    }
    if (query) out.sort((a, b) => b.r - a.r);
    return out.map((x) => x.e);
  });

  const total = $derived(tab === 'icons' ? icons.length : emojis.length);
  const cats = $derived(tab === 'icons' ? (tablerData?.categories ?? []) : (emojiData?.groups ?? []));

  function pickIcon(e: TablerCatalog['icons'][number]) {
    onpick({ k: e[4] ? 'tif' : 'ti', n: e[0], s: e[3] });
    ui.closePopover();
  }

  function pickEmoji(e: EmojiCatalog['emoji'][number]) {
    onpick({ k: 'emoji', n: e[0] });
    ui.closePopover();
  }

  function onScroll(e: Event) {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 200 && limit < total) limit += PAGE;
  }

  function onPaste(e: ClipboardEvent) {
    // Pasting a single emoji picks it directly.
    const t = e.clipboardData?.getData('text/plain')?.trim() ?? '';
    if (t && [...new Intl.Segmenter().segment(t)].length === 1 && /\p{Extended_Pictographic}/u.test(t)) {
      e.preventDefault();
      onpick({ k: 'emoji', n: t });
      ui.closePopover();
    }
  }
</script>

<div class="picker">
  <div class="top">
    <div class="segmented">
      <button aria-pressed={tab === 'icons'} onclick={() => { tab = 'icons'; category = -1; }}>
        <UiIcon name="icons" size={15} /> Icons
      </button>
      <button aria-pressed={tab === 'emoji'} onclick={() => { tab = 'emoji'; category = -1; }}>
        <UiIcon name="mood-smile" size={15} /> Emoji
      </button>
    </div>
    {#if tab === 'icons'}
      <div class="segmented">
        <button aria-pressed={!filled} onclick={() => (filled = false)}>Outline</button>
        <button aria-pressed={filled} onclick={() => (filled = true)}>Filled</button>
      </div>
    {/if}
    <button class="btn ghost none" onclick={() => { onpick(null); ui.closePopover(); }}>
      <UiIcon name="ban" size={15} /> None
    </button>
  </div>

  <div class="search">
    <UiIcon name="search" size={16} />
    <input
      placeholder={tab === 'icons' ? 'Search 6,000+ icons… (rocket, bug, home)' : 'Search emoji… or paste one'}
      bind:value={q}
      onpaste={onPaste}
      use:autofocus
    />
    {#if total}<span class="count">{total.toLocaleString()}</span>{/if}
  </div>

  {#if !q}
    <div class="cats scroll-thin">
      <button class="cat" class:on={category === -1} onclick={() => (category = -1)}>All</button>
      {#each cats as c, i (c)}
        <button class="cat" class:on={category === i} onclick={() => (category = i)}>{c}</button>
      {/each}
    </div>
  {/if}

  <div class="grid-wrap scroll-thin" onscroll={onScroll} style:color>
    {#if error}
      <div class="msg">Couldn’t load the catalogue: {error}</div>
    {:else if (tab === 'icons' && !tablerData) || (tab === 'emoji' && !emojiData)}
      <div class="msg"><span class="spin"><UiIcon name="loader-2" size={18} /></span> Loading…</div>
    {:else if tab === 'icons'}
      <div class="grid">
        {#each icons.slice(0, limit) as e (e[0] + (e[4] ? ':f' : ''))}
          <button
            class="cell"
            class:on={sameIcon(value, { k: e[4] ? 'tif' : 'ti', n: e[0] })}
            title={e[0].replace(/-/g, ' ')}
            aria-label={e[0].replace(/-/g, ' ')}
            onclick={() => pickIcon(e)}
          >
            <Icon icon={{ k: e[4] ? 'tif' : 'ti', n: e[0], s: e[3] }} size={22} />
          </button>
        {:else}
          <div class="msg">No icons match “{q}”</div>
        {/each}
      </div>
    {:else}
      <div class="grid">
        {#each emojis.slice(0, limit) as e (e[0])}
          <button class="cell emoji" class:on={value?.k === 'emoji' && value.n === e[0]} title={e[1]} aria-label={e[1]}
            onclick={() => pickEmoji(e)}>{e[0]}</button>
        {:else}
          <div class="msg">No emoji match “{q}”</div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px;
    min-height: 0;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .none {
    margin-left: auto;
    height: 30px;
    padding: 0 8px;
    color: var(--text-2);
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 10px;
    border-radius: calc(var(--radius) * 0.65);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-3);
  }

  .search:focus-within {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text);
  }

  .count {
    font-size: 0.78em;
    font-variant-numeric: tabular-nums;
  }

  .cats {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding-bottom: 2px;
    flex: none;
  }

  .cat {
    flex: none;
    height: 26px;
    padding: 0 9px;
    border-radius: 999px;
    font-size: 0.8em;
    color: var(--text-2);
    background: var(--bg-2);
    text-transform: capitalize;
  }

  .cat.on {
    background: var(--accent);
    color: var(--on-accent);
  }

  .grid-wrap {
    height: min(340px, 45dvh);
    overflow-y: auto;
    margin: 0 -4px;
    padding: 0 4px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 2px;
  }

  .cell {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border-radius: 8px;
    transition: background 0.1s, transform 0.1s;
  }

  .cell:hover {
    background: var(--hover);
    transform: scale(1.12);
  }

  .cell.on {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1.5px var(--accent-line);
  }

  .cell.emoji {
    font-size: 22px;
    line-height: 1;
    font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
  }

  .msg {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
    padding: 30px 10px;
    color: var(--text-3);
  }

  .spin {
    display: grid;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
