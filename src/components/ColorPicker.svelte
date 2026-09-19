<script lang="ts">
  import { untrack } from 'svelte';
  import { isHex, SWATCHES } from '../lib/palette';
  import { ui } from '../lib/ui.svelte';
  import UiIcon from './UiIcon.svelte';

  let { value, onpick }: { value: string; onpick: (hex: string) => void } = $props();

  let hex = $state(untrack(() => value));

  function choose(c: string, close = true) {
    hex = c;
    onpick(c);
    if (close) ui.closePopover();
  }
</script>

<div class="cp">
  <div class="swatches">
    {#each SWATCHES as s (s.hex)}
      <button
        class="sw"
        class:on={s.hex.toLowerCase() === value.toLowerCase()}
        style:--c={s.hex}
        title={s.name}
        aria-label={s.name}
        onclick={() => choose(s.hex)}
      >
        {#if s.hex.toLowerCase() === value.toLowerCase()}<UiIcon name="check" size={14} stroke={3} />{/if}
      </button>
    {/each}
  </div>
  <div class="custom">
    <label class="native" style:--c={isHex(hex) ? hex : value} title="Pick any colour">
      <input type="color" value={isHex(hex) ? hex : value} oninput={(e) => choose(e.currentTarget.value, false)} />
      <UiIcon name="palette" size={16} />
    </label>
    <input
      class="field hex"
      value={hex}
      spellcheck="false"
      aria-label="Hex colour"
      oninput={(e) => {
        const v = e.currentTarget.value.trim();
        hex = v.startsWith('#') ? v : `#${v}`;
        if (isHex(hex)) onpick(hex);
      }}
      onkeydown={(e) => e.key === 'Enter' && isHex(hex) && choose(hex)}
    />
  </div>
</div>

<style>
  .cp {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .swatches {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 6px;
  }

  .sw {
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--c);
    display: grid;
    place-items: center;
    color: white;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
    transition: transform 0.12s;
  }

  .sw:hover {
    transform: scale(1.15);
  }

  .sw.on {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--c);
  }

  .custom {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .native {
    position: relative;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: calc(var(--radius) * 0.65);
    background: var(--c);
    color: white;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
  }

  .native input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .hex {
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-size: 0.9em;
  }
</style>
