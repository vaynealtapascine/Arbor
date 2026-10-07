<script lang="ts">
  import { untrack } from 'svelte';
  import { commit, tagPathOps } from '../lib/actions.svelte';
  import { autofocus } from '../lib/autofocus';
  import { db, model } from '../lib/model.svelte';
  import { isHex, SWATCHES } from '../lib/palette';
  import { tagRenameError } from '../lib/tag-rename';
  import type { Doc, IconRef, Op } from '../lib/types';
  import { sameValue } from '../lib/util';
  import type { TagDraft } from '../lib/tag-edit';
  import { ui } from '../lib/ui.svelte';
  import Icon from './Icon.svelte';
  import UiIcon from './UiIcon.svelte';

  let { id, ids = [], draft, original }: { id: string; ids?: string[]; draft?: TagDraft; original?: TagDraft } = $props();
  const tag = $derived(db.tags[id]);
  const initial = untrack(() => original ?? {
    name: tag?.name ?? '', parent: tag?.parent ?? '', color: tag?.color ?? '#64748b', icon: tag?.icon ?? null,
  });
  let name = $state(untrack(() => draft?.name ?? initial.name));
  let parent = $state(untrack(() => draft?.parent ?? initial.parent));
  let color = $state(untrack(() => draft?.color ?? initial.color));
  let icon: IconRef | null = $state(untrack(() => draft ? draft.icon : initial.icon));
  let error = $state('');
  const parents = $derived(model.tagTree.filter((node) => !model.tagWithin(node.tag.id, id)));
  const parts = $derived(name.trim().replace(/^#/, '').split('/').map((part) => part.trim()).filter(Boolean));
  const path = $derived([parent ? model.tagPath(parent) : '', ...parts].filter(Boolean).join('/'));
  const dirty = $derived(name !== initial.name || parent !== initial.parent || color !== initial.color || !sameValue(icon, initial.icon));

  function close() {
    const anchor = ui.popover?.anchor ?? null;
    if (ids.length) ui.open({ kind: 'tags', anchor, ids });
    else ui.closePopover();
  }

  function save() {
    if (!tag) { error = 'This tag no longer exists.'; return; }
    if (!parts.length) { error = 'Give this tag a name.'; return; }
    const locationChanged = name !== initial.name || parent !== initial.parent;
    const effectiveParent = parent === initial.parent ? tag.parent ?? null : parent || null;
    if (effectiveParent && !db.tags[effectiveParent]) { error = 'Choose an existing parent tag.'; return; }
    const ops: Op[] = [];
    const nameChanged = name !== initial.name;
    const tagName = nameChanged ? parts.at(-1)! : tag.name;
    const parentPath = [effectiveParent ? model.tagPath(effectiveParent) : '', ...(nameChanged ? parts.slice(0, -1) : [])].filter(Boolean).join('/');
    const parentId = nameChanged && parts.length > 1 ? tagPathOps(parentPath, ops) : effectiveParent;
    const prospective = [...model.tagList, ...ops.filter((op) => op.kind === 'tag' && op.set).map((op) => ({
      id: op.id, name: String(op.set!.name), parent: (op.set!.parent as string | null) ?? null,
    }))];
    error = locationChanged ? tagRenameError(id, tagName, parentId, prospective) ?? '' : '';
    if (error) return;
    const set: Doc = {};
    if (locationChanged && tag.name !== tagName) set.name = tagName;
    if (locationChanged && (tag.parent ?? null) !== parentId) set.parent = parentId;
    if (color !== initial.color && color !== tag.color) set.color = color;
    if (!sameValue(icon, initial.icon) && !sameValue(icon, tag.icon)) set.icon = icon;
    if (Object.keys(set).length) ops.push({ kind: 'tag', id, set });
    commit('Edit tag', ops, { toast: `Updated #${locationChanged ? [parentPath, tagName].filter(Boolean).join('/') : model.tagPath(id)}` });
    close();
  }

  function chooseIcon(e: MouseEvent) {
    if (!tag) return;
    const anchor = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pending: TagDraft = { name, parent, color, icon };
    ui.open({
      kind: 'icon', anchor, ids: [],
      data: {
        value: icon, color, picture: true,
        onpick: (value: IconRef | null) => { pending.icon = value; },
      },
      onClose: () => ui.open({ kind: 'tags', anchor, ids, data: { editTag: id, draft: pending, original: initial } }),
    });
  }
</script>

{#if tag}
  <form class="editor" onsubmit={(e) => { e.preventDefault(); save(); }} oninput={() => (error = '')} onchange={() => (error = '')}>
    <div class="preview ink" style:--c={color}>
      {#if icon}<Icon {icon} size={20} />{:else}<UiIcon name="hash" size={20} />{/if}
      <strong>{parts.at(-1) || 'Edit tag'}</strong>
    </div>
    <label for="tag-name">Name</label>
    <input id="tag-name" class="field" bind:value={name} oninput={() => (error = '')} aria-invalid={!!error}
      aria-describedby={error ? 'tag-error' : 'tag-name-hint'} use:autofocus />
    {#if error}<p id="tag-error" class="error" role="alert">{error}</p>{/if}
    <label for="tag-parent">Parent tag</label>
    <select id="tag-parent" class="field" bind:value={parent}>
      <option value="">None · top level</option>
      {#each parents as node (node.tag.id)}<option value={node.tag.id}>{node.path}</option>{/each}
    </select>
    <p id="tag-name-hint" class="hint">Path: <b>#{path || 'name'}</b>. Nested tags move with this tag.</p>
    <button type="button" class="menu-item" onclick={chooseIcon}>
      <UiIcon name="icons" size={18} /> Change icon or picture…
    </button>
    <label for="tag-colour">Colour</label>
    <div class="swatches">
      {#each SWATCHES as swatch (swatch.hex)}
        <button type="button" class="sw" class:on={color.toLowerCase() === swatch.hex}
          style:background={swatch.hex} aria-label={swatch.name} title={swatch.name}
          aria-pressed={color.toLowerCase() === swatch.hex} onclick={() => (color = swatch.hex)}>
          {#if color.toLowerCase() === swatch.hex}<UiIcon name="check" size={13} />{/if}
        </button>
      {/each}
    </div>
    <div class="custom-colour">
      <input id="tag-colour" type="color" value={isHex(color) ? color : '#64748b'}
        aria-label="Custom tag colour" onchange={(e) => (color = e.currentTarget.value)} />
      <span>{color}</span>
    </div>
    <div class="save-actions">
      <button class="btn primary" disabled={!parts.length || !dirty}>Save changes</button>
      <button type="button" class="btn ghost" onclick={close}>Cancel</button>
    </div>
  </form>
{:else}
  <p class="hint">This tag no longer exists.</p>
{/if}

<style>
  .editor { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
  .preview { display: flex; align-items: center; gap: 8px; padding-bottom: 4px; overflow-wrap: anywhere; }
  label { font-size: 0.84em; font-weight: 600; color: var(--text-2); }
  .hint, .error { margin: 0; font-size: 0.8em; color: var(--text-2); line-height: 1.5; overflow-wrap: anywhere; }
  .error { color: var(--danger); }
  .swatches { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; }
  .sw { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 50%; color: white; }
  .sw:active { transform: scale(0.97); }
  .sw.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--text-2); }
  .custom-colour { display: flex; align-items: center; gap: 8px; color: var(--text-3); font-size: 0.82em; }
  input[type='color'] { width: 34px; height: 30px; padding: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; }
  .save-actions { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  @media (pointer: coarse) { .sw { width: 100%; min-height: 30px; height: auto; aspect-ratio: 1; } }
</style>
