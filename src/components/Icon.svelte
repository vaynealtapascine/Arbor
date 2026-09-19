<script lang="ts">
  import type { IconRef } from '../lib/types';

  let { icon, size = 18 }: { icon: IconRef | null | undefined; size?: number } = $props();
</script>

{#if icon?.k === 'emoji'}
  <span class="emoji" style:font-size="{Math.round(size * 0.86)}px" style:width="{size}px" style:height="{size}px"
    aria-hidden="true">{icon.n}</span>
{:else if icon?.s}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={icon.k === 'tif' ? 'currentColor' : 'none'}
    stroke={icon.k === 'tif' ? 'none' : 'currentColor'}
    style:stroke-width="var(--stroke, 1.75)"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true">{@html icon.s}</svg>
{/if}

<style>
  svg {
    flex: none;
    display: block;
  }

  .emoji {
    display: inline-grid;
    place-items: center;
    flex: none;
    line-height: 1;
    font-family: 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
  }
</style>
