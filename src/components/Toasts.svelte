<script lang="ts">
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { ui } from '../lib/ui.svelte';

  const raised = $derived(ui.selection.size > 0 ? (ui.mobile ? 140 : 84) : ui.mobile ? 72 : 0);
</script>

<div class="toasts" style:--raise="{raised}px" aria-live="polite">
  {#each ui.toasts as t (t.id)}
    <div class="toast" class:error={t.tone === 'error'} animate:flip={{ duration: 160 }} transition:fly={{ y: 16, duration: 180 }}>
      <span>{t.text}</span>
      {#if t.action}
        <button
          onclick={() => {
            t.action!.run();
            ui.dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: calc(18px + var(--raise) + env(safe-area-inset-bottom));
    translate: -50% 0;
    z-index: 70;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
    width: max-content;
    max-width: calc(100vw - 24px);
    transition: bottom 0.2s;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 9px 10px 9px 14px;
    border-radius: calc(var(--radius) * 0.9);
    background: color-mix(in oklch, var(--text) 92%, var(--accent));
    color: var(--bg);
    font-size: 0.9em;
    box-shadow: var(--shadow-lg);
    pointer-events: auto;
  }

  .toast.error {
    background: var(--danger);
    color: white;
  }

  button {
    font-weight: 650;
    color: color-mix(in oklch, var(--accent) 55%, var(--bg));
    padding: 3px 8px;
    border-radius: 6px;
  }

  button:hover {
    background: color-mix(in oklch, var(--bg) 14%, transparent);
  }
</style>
