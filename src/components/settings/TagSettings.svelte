<script lang="ts">
  import { tick } from 'svelte';
  import { commit, deleteEntity, moveTag, tagOps, tagPathOps } from '../../lib/actions.svelte';
  import { autofocus } from '../../lib/autofocus';
  import { db, model } from '../../lib/model.svelte';
  import { SWATCHES } from '../../lib/palette';
  import { tagRenameError } from '../../lib/tag-rename';
  import { tagDrag } from '../../lib/tag-drag';
  import type { Doc, IconRef, Op, Tag } from '../../lib/types';
  import { ui } from '../../lib/ui.svelte';
  import { fold, plural, sameValue } from '../../lib/util';
  import Icon from '../Icon.svelte';
  import UiIcon from '../UiIcon.svelte';

  let search = $state('');
  let unusedOnly = $state(false);
  let editing: string | null = $state(null);
  let name = $state('');
  let parent = $state('');
  let color = $state(SWATCHES[0].hex);
  let icon: IconRef | null = $state(null);
  let initial = $state('');
  let error = $state('');
  let editor = $state<HTMLFormElement>();
  let searchField: HTMLInputElement;

  const tag = $derived(editing && editing !== 'new' ? db.tags[editing] : null);
  const parts = $derived(name.trim().replace(/^#/, '').split('/').map((part) => part.trim()).filter(Boolean));
  const path = $derived([parent ? model.tagPath(parent) : '', ...parts].filter(Boolean).join('/'));
  const dirty = $derived(JSON.stringify({ name, parent, color, icon }) !== initial);
  const unused = $derived(model.tagTree.filter((node) => !model.counts.tagDeep.get(node.tag.id)).length);
  const query = $derived(fold(search.replace(/^#/, '').trim()));
  const list = $derived(model.tagTree.filter((node) =>
    (!query || fold(node.path).includes(query)) && (!unusedOnly || !model.counts.tagDeep.get(node.tag.id)),
  ));
  const parents = $derived(model.tagTree.filter((node) => !tag || !model.tagWithin(node.tag.id, tag.id)));

  $effect(() => {
    if (editing && editing !== 'new' && !db.tags[editing]) {
      editing = null;
      ui.closePopover();
      ui.toast('This tag no longer exists.', undefined, 'error');
    }
  });

  function begin(id: string, under = '') {
    const current = id === 'new' ? null : db.tags[id];
    if (id !== 'new' && !current) return;
    editing = id;
    name = current?.name ?? '';
    parent = current?.parent ?? under;
    color = current?.color ?? SWATCHES.find((swatch) => !model.tagList.some((t) => t.color === swatch.hex))?.hex ?? SWATCHES[0].hex;
    icon = current?.icon ?? null;
    initial = JSON.stringify({ name, parent, color, icon });
    error = '';
    void tick().then(() => editor?.scrollIntoView({ block: 'nearest' }));
  }

  function open(id: string, under = '') {
    if (editing === id && id !== 'new') return;
    if (editing && dirty) {
      ui.confirm = {
        text: 'Discard your unsaved tag changes?', action: 'Discard', run: () => begin(id, under),
      };
    } else begin(id, under);
  }

  function close() {
    const id = editing;
    editing = null;
    ui.closePopover();
    void tick().then(() => {
      const target = id === 'new' ? document.querySelector<HTMLButtonElement>('.new-tag')
        : document.querySelector<HTMLButtonElement>(`[data-edit-tag="${id}"]`);
      (target ?? searchField)?.focus({ preventScroll: true });
    });
  }

  /** Handle Escape from any form control before it reaches the settings dialog. */
  function editorKeys(node: HTMLFormElement) {
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ui.popover && !ui.confirm) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    node.addEventListener('keydown', keydown);
    return { destroy: () => node.removeEventListener('keydown', keydown) };
  }

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!parts.length) { error = 'Give this tag a name.'; return; }
    if (editing !== 'new' && !tag) { error = 'This tag no longer exists.'; return; }
    const before = JSON.parse(initial) as { name: string; parent: string; color: string; icon: IconRef | null };
    const locationChanged = !tag || name !== before.name || parent !== before.parent;
    const effectiveParent = tag && parent === before.parent ? (tag.parent ?? null) : (parent || null);
    if (locationChanged && effectiveParent && !db.tags[effectiveParent]) { error = 'The parent tag no longer exists. Choose another parent.'; return; }
    const ops: Op[] = [];
    const nameChanged = !tag || name !== before.name;
    const tagName = nameChanged ? parts.at(-1)! : tag!.name;
    const parentPath = [effectiveParent ? model.tagPath(effectiveParent) : '', ...(nameChanged ? parts.slice(0, -1) : [])].filter(Boolean).join('/');
    const parentId = nameChanged && parts.length > 1 ? tagPathOps(parentPath, ops) : effectiveParent;
    const prospective = [...model.tagList, ...ops.filter((op) => op.kind === 'tag' && op.set).map((op) => ({
      id: op.id, name: String(op.set!.name), parent: (op.set!.parent as string | null) ?? null,
    }))];
    error = locationChanged ? tagRenameError(tag?.id ?? '', tagName, parentId, prospective) ?? '' : '';
    if (error) return;
    let savedId: string;
    if (tag) {
      // Leave fields changed by another device alone unless this draft edited them.
      const set: Doc = {};
      if (locationChanged && tag.name !== tagName) set.name = tagName;
      if (locationChanged && (tag.parent ?? null) !== parentId) set.parent = parentId;
      if (color !== before.color && color !== tag.color) set.color = color;
      if (!sameValue(icon, before.icon) && !sameValue(icon, tag.icon)) set.icon = icon;
      if (Object.keys(set).length) ops.push({ kind: 'tag', id: tag.id, set });
      savedId = tag.id;
    } else savedId = tagOps(tagName, ops, { parent: parentId, color, icon });
    const savedPath = locationChanged ? [parentPath, tagName].filter(Boolean).join('/') : model.tagPath(savedId);
    commit(tag ? 'Edit tag' : 'Create tag', ops, { toast: `${tag ? 'Updated' : 'Created'} #${savedPath}` });
    search = '';
    unusedOnly = false;
    close();
  }

  function pick(kind: 'icon' | 'color', e: MouseEvent) {
    ui.open({
      kind, anchor: e.currentTarget as HTMLElement, ids: [],
      data: kind === 'icon'
        ? { value: icon, color, picture: true, onpick: (value: IconRef | null) => (icon = value) }
        : { value: color, onpick: (value: string) => (color = value) },
    });
  }

  function siblings(t: Tag) {
    // The derived tree also handles missing parents and cyclic links from offline edits.
    const chain = model.tags.chains.get(t.id) ?? [];
    return model.tags.kids.get(chain[1] ?? null) ?? [];
  }

  function atEnd(t: Tag, direction: -1 | 1) {
    const among = siblings(t);
    const index = among.findIndex((sibling) => sibling.id === t.id);
    return direction < 0 ? index <= 0 : index >= among.length - 1;
  }

  function move(t: Tag, direction: -1 | 1) {
    const among = siblings(t);
    const index = among.findIndex((sibling) => sibling.id === t.id) + direction;
    if (index < 0 || index >= among.length) return;
    moveTag(t.id, model.tags.chains.get(t.id)?.[1] ?? null, direction < 0 ? among[index].id : (among[index + 1]?.id ?? null));
  }

  function remove(t: Tag) {
    const nested = model.tagFamily(t.id).length - 1;
    // Deletion also affects archived items, which do not appear in the browsing count.
    const family = new Set(model.tagFamily(t.id));
    const count = Object.values(db.items).filter((item) => item.tags.some((id) => family.has(id))).length;
    const run = () => { deleteEntity('tag', t.id); close(); };
    if (!count && !nested) return run();
    ui.confirm = {
      text: `Delete #${model.tagPath(t.id)}?${nested ? ` This also deletes ${plural(nested, 'nested tag')}.` : ''}${count ? ` The tags will be removed from ${plural(count, 'item')}.` : ''} You can undo.`,
      action: 'Delete', run,
    };
  }
</script>

<p class="intro">Organise your labels and the tags nested inside them. Add a tag to any item by typing <kbd>#name</kbd>.</p>

<div class="toolbar">
  <div class="search field">
    <UiIcon name="search" size={17} />
    <input bind:this={searchField} bind:value={search} aria-label="Search tags" placeholder="Search tags…" type="search" />
    {#if search}<button class="clear" aria-label="Clear tag search" onclick={() => { search = ''; searchField.focus(); }}><UiIcon name="x" size={16} /></button>{/if}
  </div>
  <button class="btn primary new-tag" aria-expanded={editing === 'new'} aria-controls="tag-editor" onclick={() => open('new')}>
    <UiIcon name="plus" size={16} /> New tag
  </button>
</div>

{#if editing}
  <form id="tag-editor" class="editor" bind:this={editor} onsubmit={save} use:editorKeys
    aria-label={tag ? 'Edit tag' : 'Create a tag'} oninput={() => (error = '')} onchange={() => (error = '')}>
    <div class="editor-heading">
      <h3>{tag ? `Edit #${model.tagPath(tag.id)}` : 'Create a tag'}</h3>
      <button type="button" class="icon-btn" aria-label="Cancel tag editing" onclick={close}><UiIcon name="x" size={17} /></button>
    </div>
    <div class="fields">
      <label for="managed-tag-name">Name
        <input id="managed-tag-name" class="field" bind:value={name} placeholder="e.g. work or work/client"
          aria-invalid={!!error} aria-describedby={error ? 'managed-tag-error' : 'tag-path-hint'} use:autofocus />
      </label>
      <label for="managed-tag-parent">Parent tag
        <select id="managed-tag-parent" class="field" bind:value={parent} aria-describedby="tag-path-hint">
          <option value="">None · top level</option>
          {#each parents as node (node.tag.id)}<option value={node.tag.id}>{node.path}</option>{/each}
        </select>
      </label>
    </div>
    <p id="tag-path-hint" class="hint">{#if path}Tag path: <b>#{path}</b>{:else}Choose a parent to nest this tag, or type a path like work/client.{/if}</p>
    {#if error}<p id="managed-tag-error" class="error" role="alert">{error}</p>{/if}
    <div class="appearance">
      <button type="button" class="btn" onclick={(e) => pick('icon', e)}>
        <span class="ink" style:--c={color}>{#if icon}<Icon {icon} size={17} />{:else}<UiIcon name="icons" size={17} />{/if}</span>
        Icon or picture
      </button>
      <button type="button" class="btn" onclick={(e) => pick('color', e)}><span class="swatch" style:background={color}></span> Colour</button>
      <span class="tag-preview ink" style:--c={color}>
        {#if icon}<Icon {icon} size={14} />{:else}<UiIcon name="hash" size={14} />{/if}
        <span>{parts.at(-1) || 'Preview'}</span>
      </span>
    </div>
    <p class="hint">Drop or paste your own picture into the icon picker. {#if tag && model.tagFamily(tag.id).length > 1}Renaming or moving this tag also updates its nested tags.{/if}</p>
    <div class="save-actions">
      <button class="btn primary" disabled={!parts.length || (editing !== 'new' && !dirty)}>{tag ? 'Save changes' : 'Create tag'}</button>
      <button type="button" class="btn ghost" onclick={close}>Cancel</button>
    </div>
    {#if tag}
      <div class="tag-actions">
        <button type="button" class="btn ghost" onclick={() => open('new', tag!.id)}><UiIcon name="plus" size={15} /> Add nested tag</button>
        <div class="order" aria-label="Tag order">
          <button type="button" class="icon-btn" aria-label="Move tag up" title="Move up among sibling tags" disabled={atEnd(tag, -1)} onclick={() => move(tag!, -1)}><UiIcon name="arrow-up" size={16} /></button>
          <button type="button" class="icon-btn" aria-label="Move tag down" title="Move down among sibling tags" disabled={atEnd(tag, 1)} onclick={() => move(tag!, 1)}><UiIcon name="arrow-down" size={16} /></button>
        </div>
        <button type="button" class="btn ghost danger delete" onclick={() => remove(tag!)}><UiIcon name="trash" size={15} /> Delete tag</button>
      </div>
    {/if}
  </form>
{/if}

<div class="list-heading">
  <span aria-live="polite">{search || unusedOnly ? `${list.length} of ${plural(model.tagTree.length, 'tag')}` : plural(model.tagTree.length, 'tag')}</span>
  <button class="unused" class:on={unusedOnly} aria-pressed={unusedOnly} onclick={() => (unusedOnly = !unusedOnly)}>Unused <span>{unused}</span></button>
</div>

{#if list.length}
  <div use:tagDrag>
  <p class="count-hint">Drag a grip to reorder. Drop on a tag to nest it.</p>
  <ul class="tag-list" aria-label="Manage tags">
    {#each list as node (node.tag.id)}
      {@const count = model.counts.tagDeep.get(node.tag.id) ?? 0}
      <li data-tag-id={node.tag.id}>
        <button class="tag-handle" draggable="true" data-tag-handle={node.tag.id}
          aria-label="Drag #{node.path}" title="Drag to reorder or nest this tag"
          onclick={() => open(node.tag.id)}><UiIcon name="grip-vertical" size={17} /></button>
        <button class="tag-row" class:selected={editing === node.tag.id} data-edit-tag={node.tag.id}
          aria-label="Edit #{node.path}" aria-expanded={editing === node.tag.id} aria-controls="tag-editor"
          style:--depth={Math.min(node.depth, 3)} onclick={() => open(node.tag.id)}>
          <span class="tag-icon ink" style:--c={node.tag.color}>
            {#if node.tag.icon}<Icon icon={node.tag.icon} size={19} />{:else}<UiIcon name="hash" size={19} />{/if}
          </span>
          <span class="identity"><span class="name">{node.tag.name}</span>{#if node.depth}<span class="parent-path">{node.path.slice(0, -(node.tag.name.length + 1))}</span>{/if}</span>
          <span class="usage" class:zero={!count}>{count ? plural(count, 'item') : 'Unused'}</span>
          <span class="edit-icon"><UiIcon name="pencil" size={16} /></span>
        </button>
      </li>
    {/each}
  </ul>
  <div class="tag-root-drop" data-tag-root>Move to top level</div>
  <p class="tag-drag-hint" data-tag-drag-hint role="status"></p>
  </div>
  <p class="count-hint">Item counts include nested tags and exclude archived items.</p>
{:else}
  <div class="empty">
    <UiIcon name={model.tagTree.length ? 'search' : 'tags'} size={25} />
    <h3>{!model.tagTree.length ? 'Create your first tag' : unusedOnly && !search ? 'Every tag is in use' : 'No matching tags'}</h3>
    <p>{!model.tagTree.length ? 'Use tags to group related items. Nest them to keep projects and topics together.' : 'Try a different search or show all tags.'}</p>
    {#if model.tagTree.length}<button class="btn" onclick={() => { search = ''; unusedOnly = false; }}>Show all tags</button>{:else if !editing}<button class="btn" onclick={() => open('new')}><UiIcon name="plus" size={16} /> New tag</button>{/if}
  </div>
{/if}

<details class="help">
  <summary>How nested tags work</summary>
  <p>Type <kbd>#work/client</kbd> in an item to create a nested tag. Filtering or searching by <kbd>#work</kbd> also finds items tagged with anything inside it. You can move a tag by changing its parent.</p>
</details>

<style>
  .intro { margin: 0 0 18px; color: var(--text-2); font-size: 0.9em; line-height: 1.55; }
  .toolbar { display: flex; align-items: center; gap: 10px; }
  .search { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; height: 38px; padding: 0 10px; color: var(--text-2); }
  .search:focus-within { border-color: var(--accent-line); }
  .search:has(input:focus-visible) { outline: 2px solid var(--accent-line); outline-offset: 2px; }
  .search input { flex: 1; min-width: 0; width: 100%; padding: 0; background: transparent; border: 0; outline: 0; }
  .search input::-webkit-search-cancel-button { display: none; }
  .search input::placeholder { color: var(--text-2); }
  .clear { display: grid; place-items: center; width: 28px; height: 28px; flex: none; border-radius: 5px; }
  .clear:hover { background: var(--hover); }
  .new-tag { height: 38px; }
  .editor { margin-top: 14px; padding: 16px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); scroll-margin-top: 60px; }
  .editor-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  h3 { margin: 0; font-size: 0.98em; font-weight: 650; overflow-wrap: anywhere; }
  .fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  label { display: flex; flex-direction: column; gap: 6px; color: var(--text-2); font-size: 0.85em; font-weight: 550; min-width: 0; }
  .fields .field { width: 100%; min-width: 0; font-size: 1rem; font-weight: 400; }
  select { text-overflow: ellipsis; }
  .hint, .count-hint { margin: 8px 0 0; font-size: 0.8em; line-height: 1.5; color: var(--text-2); overflow-wrap: anywhere; }
  .hint b { font-weight: 550; }
  .error { margin: 8px 0 0; font-size: 0.85em; color: var(--danger); }
  .appearance { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .swatch { width: 14px; height: 14px; flex: none; border-radius: 50%; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12); }
  .tag-preview { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; min-width: 0; padding: 3px 8px; font-size: 0.82em; font-weight: 550; border-radius: 999px; background: color-mix(in oklch, var(--c) var(--chip-mix), transparent); }
  .tag-preview span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .save-actions { display: flex; gap: 6px; margin-top: 16px; }
  .tag-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--border); }
  .order { display: flex; gap: 2px; }
  .order button:disabled { opacity: 0.35; cursor: default; }
  .order button:disabled:hover { background: transparent; }
  .delete { margin-left: auto; }
  .list-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 18px 0 6px; font-size: 0.82em; color: var(--text-2); }
  .unused { display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 0 9px; border-radius: calc(var(--radius) * 0.6); border: 1px solid transparent; }
  .unused:hover { background: var(--hover); }
  .unused.on { background: var(--accent-soft); color: var(--accent-ink); border-color: var(--accent-line); }
  .unused span { font-variant-numeric: tabular-nums; }
  .tag-list { list-style: none; padding: 0; margin: 8px 0 0; border-top: 1px solid var(--border); }
  .tag-list li { position: relative; display: flex; align-items: center; border-bottom: 1px solid var(--border); }
  .tag-handle { display: grid; place-items: center; width: 28px; align-self: stretch; flex: none; color: var(--text-2); cursor: grab; }
  .tag-handle:hover { background: var(--hover); }
  .tag-handle:active { cursor: grabbing; }
  .tag-row { flex: 1; min-width: 0; }
  .tag-row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 58px; padding: 9px 12px 9px calc(10px + var(--depth) * 18px); text-align: left; border-radius: calc(var(--radius) * 0.5); }
  .tag-row:hover { background: var(--hover); }
  .tag-row.selected { background: var(--accent-soft); }
  .tag-icon { display: grid; place-items: center; width: 32px; height: 32px; flex: none; background: color-mix(in oklch, var(--c) var(--chip-mix), transparent); border-radius: calc(var(--radius) * 0.65); }
  .identity { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .name { font-size: 0.95em; font-weight: 550; overflow-wrap: anywhere; }
  .parent-path { color: var(--text-2); font-size: 0.78em; overflow-wrap: anywhere; }
  .usage { flex: none; color: var(--text-2); font-size: 0.8em; font-variant-numeric: tabular-nums; }
  .usage.zero { font-style: italic; }
  .edit-icon { display: grid; place-items: center; color: var(--text-2); width: 24px; height: 24px; flex: none; }
  .count-hint { margin-top: 10px; }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 32px 16px; text-align: center; color: var(--text-2); border-block: 1px solid var(--border); }
  .empty h3 { color: var(--text); }
  .empty p { max-width: 36ch; margin: 0; font-size: 0.9em; }
  .help { margin-top: 24px; font-size: 0.85em; color: var(--text-2); }
  summary { cursor: pointer; width: fit-content; }
  .help p { margin: 8px 0 0; line-height: 1.6; }
  @media (max-width: 480px) {
    .fields { grid-template-columns: minmax(0, 1fr); }
    .editor { padding: 12px; }
    .tag-row { gap: 8px; padding-right: 6px; padding-left: calc(6px + var(--depth) * 12px); }
    .tag-actions { gap: 6px 2px; }
    .delete { margin-left: 0; }
  }
  @media (max-width: 720px), (pointer: coarse) {
    .btn, .search, .unused, .fields .field { min-height: 44px; }
    .clear { width: 36px; height: 36px; }
    .order .icon-btn, .editor-heading .icon-btn { width: 44px; height: 44px; }
  }
</style>
