<script lang="ts">
  import type { Status } from '../lib/types';
  import Icon from './Icon.svelte';

  let { status, size = 18 }: { status: Status | null | undefined; size?: number } = $props();
</script>

{#if status?.icon}
  <span class="ink wrap" style:--c={status.color}><Icon icon={status.icon} {size} /></span>
{:else if status}
  <span class="dot" style:--c={status.color} style:width="{size * 0.62}px" style:height="{size * 0.62}px"></span>
{:else}
  <span class="none" style:width="{size * 0.34}px" style:height="{size * 0.34}px"></span>
{/if}

<style>
  .wrap {
    display: inline-grid;
    place-items: center;
  }

  .dot {
    display: inline-block;
    border-radius: 50%;
    background: var(--c);
  }

  .none {
    display: inline-block;
    border-radius: 50%;
    background: var(--text-3);
    opacity: 0.75;
  }
</style>
