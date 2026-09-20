<script lang="ts" module>
  import type { IconRef } from '../lib/types';

  export interface Suggestion {
    key: string;
    label: string;
    color?: string;
    icon?: IconRef | null;
    hint?: string;
    create?: boolean;
    sigil?: '#' | '@' | '/';
  }
</script>

<script lang="ts">
  import Icon from './Icon.svelte';
  import UiIcon from './UiIcon.svelte';

  let {
    items,
    index,
    anchor,
    onpick,
    onhover,
  }: {
    items: Suggestion[];
    index: number;
    anchor: HTMLElement | undefined;
    onpick: (s: Suggestion) => void;
    onhover: (i: number) => void;
  } = $props();

  let pos = $state({ left: 0, top: 0, width: 260, above: false });

  $effect(() => {
    void items.length;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vv = visualViewport;
    const viewH = vv ? vv.height + vv.offsetTop : innerHeight;
    const h = Math.min(items.length * 36 + 10, 300);
    const above = r.bottom + h + 8 > viewH && r.top - h - 8 > 0;
    pos = {
      left: Math.max(8, Math.min(r.left, innerWidth - 268)),
      top: above ? r.top - h - 6 : r.bottom + 6,
      width: Math.min(300, innerWidth - 16),
      above,
    };
  });
</script>

{#if items.length}
  <div
    class="suggest glass"
    role="listbox"
    tabindex="-1"
    style:left="{pos.left}px"
    style:top="{pos.top}px"
    style:width="{pos.width}px"
    onpointerdown={(e) => e.preventDefault()}
  >
    {#each items as s, i (s.key)}
      <button
        class="menu-item"
        class:active={i === index}
        role="option"
        aria-selected={i === index}
        onclick={() => onpick(s)}
        onpointerenter={() => onhover(i)}
      >
        <span class="lead ink" style:--c={s.color ?? 'var(--text-3)'}>
          {#if s.create}<UiIcon name="plus" size={16} />
          {:else if s.icon}<Icon icon={s.icon} size={16} />
          {:else}<span class="dot" style:background={s.color}></span>{/if}
        </span>
        <span class="label">{#if s.create}Create <b>{s.sigil}{s.label}</b>{:else}{s.label}{/if}</span>
        {#if s.hint}<span class="hint">{s.hint}</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .suggest {
    position: fixed;
    z-index: 60;
    padding: 5px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    max-height: 300px;
    overflow-y: auto;
    animation: pop 0.12s ease-out;
  }

  .lead {
    display: inline-grid;
    place-items: center;
    width: 18px;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }
</style>
