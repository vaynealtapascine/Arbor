<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { autofocus } from '../lib/autofocus';
  import { ui } from '../lib/ui.svelte';

  const c = $derived(ui.confirm);

  function yes() {
    const run = c?.run;
    ui.confirm = null;
    run?.();
  }
</script>

{#if c}
  <div class="scrim" transition:fade={{ duration: 120 }} onpointerdown={() => (ui.confirm = null)} aria-hidden="true"></div>
  <div class="dialog glass" role="alertdialog" aria-label={c.text} transition:scale={{ start: 0.96, duration: 140 }}>
    <p>{c.text}</p>
    <div class="actions">
      <button class="btn" onclick={() => (ui.confirm = null)}>Cancel</button>
      <button class="btn primary danger-bg" onclick={yes} use:autofocus={true}>{c.action}</button>
    </div>
  </div>
{/if}

<svelte:window onkeydown={(e) => c && e.key === 'Escape' && (ui.confirm = null)} />

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: rgb(0 0 0 / 0.3);
  }

  .dialog {
    position: fixed;
    left: 50%;
    top: 30%;
    translate: -50% 0;
    z-index: 91;
    width: min(380px, calc(100vw - 32px));
    padding: 20px;
    border-radius: calc(var(--radius) + 6px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }

  :global(:root[data-glass='on']) .dialog {
    background: color-mix(in oklch, var(--surface) 94%, transparent);
  }

  p {
    margin: 0 0 16px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .danger-bg {
    background: var(--danger);
    color: white;
  }
</style>
