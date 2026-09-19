<script lang="ts">
  import type { Tag } from '../lib/types';
  import Icon from './Icon.svelte';

  let {
    tag,
    showIcon = true,
    onclick,
    removable = false,
    onremove,
  }: {
    tag: Tag;
    showIcon?: boolean;
    onclick?: (e: MouseEvent) => void;
    removable?: boolean;
    onremove?: () => void;
  } = $props();
</script>

<svelte:element this={onclick ? 'button' : 'span'} class="chip" class:clickable={!!onclick} style:--c={tag.color}
  {onclick} tabindex={onclick ? -1 : undefined} role={onclick ? 'button' : undefined}>
  <span class="lead">
    {#if showIcon && tag.icon}<Icon icon={tag.icon} size={13} />{:else}<span class="dot"></span>{/if}
  </span>
  <span class="name">{tag.name}</span>
  {#if removable}
    <button class="x" aria-label="Remove {tag.name}" onclick={(e) => { e.stopPropagation(); onremove?.(); }}>×</button>
  {/if}
</svelte:element>

<style>
  .chip {
    --ink: oklch(from var(--c) clamp(var(--ink-min), l, var(--ink-max)) c h);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 21px;
    padding: 0 7px 0 6px;
    border-radius: 999px;
    font-size: 0.78em;
    font-weight: 560;
    line-height: 1;
    white-space: nowrap;
    color: var(--ink);
    background: color-mix(in oklch, var(--c) var(--chip-mix), transparent);
    cursor: default;
    user-select: none;
    max-width: 16em;
  }

  .chip.clickable {
    cursor: pointer;
    border: 0;
    font-family: inherit;
  }

  .lead {
    display: inline-grid;
    place-items: center;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .x {
    margin-left: 1px;
    font-size: 1.2em;
    line-height: 1;
    opacity: 0.6;
    color: inherit;
  }

  .x:hover {
    opacity: 1;
  }

  :global(:root[data-tags='outline']) .chip {
    background: transparent;
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--c) 55%, transparent);
  }

  :global(:root[data-tags='text']) .chip {
    background: transparent;
    padding: 0 2px;
  }

  :global(:root[data-tags='text']) .lead {
    display: none;
  }

  :global(:root[data-tags='text']) .name::before {
    content: '#';
    opacity: 0.7;
  }

  :global(:root[data-tags='dot']) .chip {
    background: transparent;
    padding: 0 3px;
    color: var(--text-2);
    font-weight: 500;
  }
</style>
