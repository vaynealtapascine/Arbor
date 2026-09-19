<script lang="ts">
  import { uiIcons } from '../generated/ui-icons';

  let { name, size = 18, stroke }: { name: string; size?: number; stroke?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  style:stroke-width={stroke ?? 'var(--stroke, 1.75)'}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true">{@html uiIcons[name] ?? ''}</svg>

<style>
  svg {
    flex: none;
    display: block;
  }
</style>
