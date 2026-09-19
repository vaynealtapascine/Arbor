<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { ui } from '../lib/ui.svelte';

  let {
    anchor,
    onclose,
    children,
    width = 280,
    title = '',
  }: {
    anchor: HTMLElement | DOMRect | null;
    onclose: () => void;
    children: Snippet;
    width?: number;
    title?: string;
  } = $props();

  let el: HTMLDivElement | undefined = $state();
  let pos = $state({ top: -9999, left: 0, maxH: 420 });
  const sheet = $derived(ui.mobile);

  function rect(): DOMRect {
    if (anchor instanceof HTMLElement) return anchor.getBoundingClientRect();
    return anchor ?? new DOMRect(innerWidth / 2 - width / 2, innerHeight * 0.25, 0, 0);
  }

  function place() {
    if (sheet || !el) return;
    const r = rect();
    const h = el.scrollHeight;
    const below = innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = h > below && above > below;
    const maxH = Math.max(180, (up ? above : below) - 4);
    const left = Math.min(Math.max(8, r.left), innerWidth - width - 8);
    const top = up ? Math.max(8, r.top - Math.min(h, maxH) - 6) : r.bottom + 6;
    pos = { top, left, maxH };
  }

  onMount(() => {
    place();
    requestAnimationFrame(place);
    const ro = new ResizeObserver(place);
    if (el) ro.observe(el);
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el?.contains(t)) return;
      if (anchor instanceof HTMLElement && anchor.contains(t)) return;
      if ((t as HTMLElement).closest?.('.suggest')) return;
      onclose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onclose();
      }
    };
    addEventListener('pointerdown', down, true);
    addEventListener('keydown', key, true);
    addEventListener('resize', place);
    return () => {
      ro.disconnect();
      removeEventListener('pointerdown', down, true);
      removeEventListener('keydown', key, true);
      removeEventListener('resize', place);
    };
  });
</script>

{#if sheet}
  <div class="scrim" aria-hidden="true"></div>
  <div class="sheet popover glass" bind:this={el} role="dialog" aria-label={title || 'Menu'}>
    <div class="grab" aria-hidden="true"></div>
    {#if title}<div class="sheet-title">{title}</div>{/if}
    <div class="sheet-body scroll-thin">{@render children()}</div>
  </div>
{:else}
  <div
    class="pop popover glass scroll-thin"
    bind:this={el}
    role="dialog"
    aria-label={title || 'Menu'}
    style:top="{pos.top}px"
    style:left="{pos.left}px"
    style:width="{width}px"
    style:max-height="{pos.maxH}px"
  >
    {@render children()}
  </div>
{/if}

<style>
  .pop {
    position: fixed;
    z-index: 50;
    padding: 5px;
    overflow-y: auto;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    animation: pop-in 0.14s cubic-bezier(0.2, 0.9, 0.3, 1.1);
    transform-origin: top left;
  }

  @keyframes pop-in {
    from {
      opacity: 0;
      transform: scale(0.97) translateY(-4px);
    }
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 49;
    background: rgb(0 0 0 / 0.28);
    animation: fade 0.18s ease-out;
  }

  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    max-height: 78dvh;
    display: flex;
    flex-direction: column;
    padding: 6px 8px calc(10px + env(safe-area-inset-bottom));
    border-radius: calc(var(--radius) + 8px) calc(var(--radius) + 8px) 0 0;
    border-top: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    animation: sheet-up 0.24s cubic-bezier(0.2, 0.9, 0.3, 1);
  }

  :global(:root[data-glass='on']) .sheet {
    background: color-mix(in oklch, var(--surface) 90%, transparent);
  }

  .sheet-body {
    overflow-y: auto;
    min-height: 0;
  }

  .sheet :global(.menu-item) {
    min-height: 44px;
    font-size: 1em;
  }

  .grab {
    width: 38px;
    height: 4px;
    margin: 2px auto 8px;
    border-radius: 2px;
    background: var(--border-2);
    flex: none;
  }

  .sheet-title {
    padding: 0 10px 6px;
    font-weight: 650;
    font-size: 0.95em;
    color: var(--text-2);
  }

  @keyframes sheet-up {
    from {
      transform: translateY(100%);
    }
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
