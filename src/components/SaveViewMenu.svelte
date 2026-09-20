<script lang="ts">
  import { autofocus } from '../lib/autofocus';
  import { SWATCHES } from '../lib/palette';
  import type { IconRef } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import { currentFilter, describe, saveView, suggestName } from '../lib/views';
  import { uiIcons } from '../generated/ui-icons';
  import Icon from './Icon.svelte';

  const filter = currentFilter();
  let name = $state(suggestName(filter));
  let color = $state(SWATCHES[13].hex);
  const choices = ['filter', 'bookmark', 'star', 'flag', 'target', 'flame', 'rocket', 'briefcase', 'calendar', 'bug', 'heart', 'inbox'];
  let icon: IconRef = $state({ k: 'ti', n: 'filter', s: uiIcons.filter });

  function save(e?: SubmitEvent) {
    e?.preventDefault();
    if (!name.trim()) return;
    saveView(name.trim(), { color, icon });
    ui.closePopover();
  }
</script>

<form class="save" onsubmit={save}>
  <div class="what">Shows {describe(filter)}</div>
  <input class="field" bind:value={name} placeholder="View name" aria-label="View name" use:autofocus maxlength="60" />
  <div class="row">
    {#each choices as n (n)}
      <button
        type="button"
        class="ic ink"
        class:on={icon.n === n}
        style:--c={color}
        aria-label={n}
        onclick={() => (icon = { k: 'ti', n, s: uiIcons[n] })}
      >
        <Icon icon={{ k: 'ti', n, s: uiIcons[n] }} size={17} />
      </button>
    {/each}
  </div>
  <div class="row colors">
    {#each SWATCHES.slice(2, 20).filter((_, i) => i % 2 === 0) as s (s.hex)}
      <button type="button" class="sw" class:on={color === s.hex} style:background={s.hex} aria-label={s.name}
        onclick={() => (color = s.hex)}></button>
    {/each}
  </div>
  <button class="btn primary" disabled={!name.trim()}>Save view</button>
  <p class="hint">Icon and colour can be changed any time in Settings → Views.</p>
</form>

<style>
  .save {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 6px;
  }

  .what {
    font-size: 0.84em;
    color: var(--text-2);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .ic {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
  }

  .ic:hover {
    background: var(--hover);
  }

  .ic.on {
    background: color-mix(in oklch, var(--c) var(--chip-mix), transparent);
    box-shadow: inset 0 0 0 1.5px color-mix(in oklch, var(--c) 60%, transparent);
  }

  .colors {
    gap: 6px;
  }

  .sw {
    width: 20px;
    height: 20px;
    border-radius: 50%;
  }

  .sw.on {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 3.5px var(--text-2);
  }

  .hint {
    margin: 0;
    font-size: 0.78em;
    color: var(--text-3);
  }
</style>
