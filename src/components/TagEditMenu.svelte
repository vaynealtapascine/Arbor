<script lang="ts">
  import { untrack } from 'svelte';
  import { updateEntity } from '../lib/actions.svelte';
  import { autofocus } from '../lib/autofocus';
  import { db, model } from '../lib/model.svelte';
  import { isHex, SWATCHES } from '../lib/palette';
  import { openTagEditor, renameTag } from '../lib/tag-edit';
  import type { IconRef } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import Icon from './Icon.svelte';
  import UiIcon from './UiIcon.svelte';

  let { id }: { id: string } = $props();
  const tag = $derived(db.tags[id]);
  let name = $state(untrack(() => model.tagPath(id)));
  let error = $state('');

  function rename(close = false) {
    error = renameTag(id, name) ?? '';
    if (error) return false;
    name = model.tagPath(id);
    if (close) ui.closePopover();
    return true;
  }

  function changeColor(color: string) {
    if (isHex(color) && tag?.color !== color) updateEntity('tag', id, { color }, 'Change tag colour');
  }

  function chooseIcon(e: MouseEvent) {
    if (!tag || !rename()) return;
    const anchor = (e.currentTarget as HTMLElement).getBoundingClientRect();
    ui.open({
      kind: 'icon', anchor, ids: [],
      data: {
        value: tag.icon, color: tag.color, picture: true,
        onpick: (icon: IconRef | null) => updateEntity('tag', id, { icon }, 'Change tag icon'),
      },
      onClose: () => openTagEditor(id, anchor),
    });
  }
</script>

{#if tag}
  <form class="editor" onsubmit={(e) => { e.preventDefault(); rename(true); }}>
    <div class="preview ink" style:--c={tag.color}>
      {#if tag.icon}<Icon icon={tag.icon} size={20} />{:else}<UiIcon name="hash" size={20} />{/if}
      <strong>{model.tagLabel(id)}</strong>
    </div>
    <label for="tag-name">Name or parent/name</label>
    <input id="tag-name" class="field" bind:value={name} oninput={() => (error = '')} aria-invalid={!!error}
      aria-describedby={error ? 'tag-error' : 'tag-name-hint'} use:autofocus />
    {#if error}<p id="tag-error" class="error" role="alert">{error}</p>{/if}
    <p id="tag-name-hint" class="hint">Renaming a parent updates the paths of all its nested tags.</p>
    <button type="button" class="menu-item" onclick={chooseIcon}>
      <UiIcon name="icons" size={18} /> Change icon or picture…
    </button>
    <label for="tag-colour">Colour</label>
    <div class="swatches">
      {#each SWATCHES as swatch (swatch.hex)}
        <button type="button" class="sw" class:on={tag.color.toLowerCase() === swatch.hex}
          style:background={swatch.hex} aria-label={swatch.name} title={swatch.name}
          aria-pressed={tag.color.toLowerCase() === swatch.hex} onclick={() => changeColor(swatch.hex)}>
          {#if tag.color.toLowerCase() === swatch.hex}<UiIcon name="check" size={13} />{/if}
        </button>
      {/each}
    </div>
    <div class="custom-colour">
      <input id="tag-colour" type="color" value={isHex(tag.color) ? tag.color : '#64748b'}
        aria-label="Custom tag colour" onchange={(e) => changeColor(e.currentTarget.value)} />
      <span>{tag.color}</span>
    </div>
    <button class="btn primary" disabled={!name.trim()}>Save name</button>
  </form>
{:else}
  <p class="hint">This tag no longer exists.</p>
{/if}

<style>
  .editor { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
  .preview { display: flex; align-items: center; gap: 8px; padding-bottom: 4px; overflow-wrap: anywhere; }
  label { font-size: 0.84em; font-weight: 600; color: var(--text-2); }
  .hint, .error { margin: 0; font-size: 0.8em; color: var(--text-3); }
  .error { color: #ef4444; }
  .swatches { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; }
  .sw { display: grid; place-items: center; width: 23px; height: 23px; border-radius: 50%; color: white; }
  .sw.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--text-2); }
  .custom-colour { display: flex; align-items: center; gap: 8px; color: var(--text-3); font-size: 0.82em; }
  input[type='color'] { width: 34px; height: 30px; padding: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; }
  @media (pointer: coarse) { .sw { width: 100%; min-height: 30px; height: auto; aspect-ratio: 1; } }
</style>
