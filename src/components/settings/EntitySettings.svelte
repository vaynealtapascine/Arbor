<script lang="ts">
  import {
    commit,
    createStatus,
    createTag,
    deleteEntity,
    reorderEntity,
    tagPathOps,
    updateEntity,
    type EntityKind,
  } from '../../lib/actions.svelte';
  import { model } from '../../lib/model.svelte';
  import { settings } from '../../lib/settings.svelte';
  import { countNodes, saveTemplate } from '../../lib/templates';
  import type { IconRef, Op, SavedView, Status, Tag, Template } from '../../lib/types';
  import { ui } from '../../lib/ui.svelte';
  import { plural } from '../../lib/util';
  import Icon from '../Icon.svelte';
  import StatusIcon from '../StatusIcon.svelte';
  import TagChip from '../TagChip.svelte';
  import UiIcon from '../UiIcon.svelte';
  import { applyView, countFor, describe, saveView, updateViewFilter } from '../../lib/views';
  import TemplateEditor from './TemplateEditor.svelte';

  type Entity = Status | Tag | SavedView | Template;

  let { kind }: { kind: EntityKind } = $props();

  const list: Entity[] = $derived(
    kind === 'status'
      ? model.statusList
      : kind === 'tag'
        ? model.tagTree.map((n) => n.tag)
        : kind === 'view'
          ? model.viewList
          : model.templateList,
  );
  /** Tags are edited by their path, so one field both renames and re-nests them. */
  const label = (ent: Entity) => (kind === 'tag' ? model.tagPath(ent.id) : ent.name);
  let newName = $state('');
  let editing: string | null = $state(null);

  function count(ent: Entity) {
    if (kind === 'status') return model.counts.status.get(ent.id) ?? 0;
    if (kind === 'tag') return model.counts.tagDeep.get(ent.id) ?? 0;
    if (kind === 'view') return countFor((ent as SavedView).filter);
    return countNodes((ent as Template).items);
  }

  function add(e: SubmitEvent) {
    e.preventDefault();
    const name = newName.trim().replace(kind === 'tag' ? /^#/ : kind === 'status' ? /^@/ : /^$/, '');
    if (!name) return;
    if (kind === 'status') createStatus(name);
    else if (kind === 'tag') createTag(name);
    else if (kind === 'view') saveView(name);
    else editing = saveTemplate(name, [{ title: '{name}', note: '', status: null, tags: [], children: [] }]);
    newName = '';
  }

  /** What a row can be reordered among: its siblings for tags, the whole list otherwise. */
  function row(ent: Entity) {
    if (kind !== 'tag') return list;
    const parent = (ent as Tag).parent ?? null;
    return model.tagTree.filter((n) => (n.tag.parent ?? null) === parent).map((n) => n.tag as Entity);
  }

  function move(ent: Entity, dir: -1 | 1) {
    const among = row(ent);
    const j = among.findIndex((e) => e.id === ent.id) + dir;
    if (j < 0 || j >= among.length) return;
    reorderEntity(kind, ent.id, dir < 0 ? among[j].id : (among[j + 1]?.id ?? null));
  }

  const atEnd = (ent: Entity, dir: -1 | 1) => {
    const among = row(ent);
    const i = among.findIndex((e) => e.id === ent.id);
    return dir < 0 ? i <= 0 : i >= among.length - 1;
  };

  /**
   * A tag's field holds its whole path: the last part is its name, anything in
   * front says where it sits (creating those tags if they are new). Moving a tag
   * into its own subtree is the one thing that cannot work.
   */
  function renameTag(tag: Tag, path: string, field: HTMLInputElement) {
    const parts = path.split('/').map((s) => s.trim()).filter(Boolean);
    const name = parts.pop();
    if (!name) return (field.value = model.tagPath(tag.id));
    const ops: Op[] = [];
    const parent = parts.length ? tagPathOps(parts.join('/'), ops) : null;
    if (parent && model.tagWithin(parent, tag.id)) {
      field.value = model.tagPath(tag.id);
      return ui.toast(`#${path} would put #${tag.name} inside itself`, undefined, 'error');
    }
    ops.push({ kind: 'tag', id: tag.id, set: { name, parent } });
    commit('Rename tag', ops);
  }

  function pickIcon(e: MouseEvent, ent: Entity) {
    ui.open({
      kind: 'icon',
      anchor: e.currentTarget as HTMLElement,
      ids: [],
      data: { value: ent.icon, color: ent.color, onpick: (icon: IconRef | null) => updateEntity(kind, ent.id, { icon }, 'Change icon') },
    });
  }

  function pickColor(e: MouseEvent, ent: Entity) {
    ui.open({
      kind: 'color',
      anchor: e.currentTarget as HTMLElement,
      ids: [],
      data: { value: ent.color, onpick: (color: string) => updateEntity(kind, ent.id, { color }, 'Change colour') },
    });
  }

  function remove(ent: Entity) {
    if (kind === 'view' || kind === 'template') return deleteEntity(kind, ent.id);
    const n = count(ent);
    const name = kind === 'status' ? ent.name : `#${label(ent)}`;
    const nested = kind === 'tag' ? model.tagFamily(ent.id).length - 1 : 0;
    if (n === 0 && !nested) return deleteEntity(kind, ent.id);
    const also = nested ? ` It also deletes ${plural(nested, 'tag')} nested under it.` : '';
    ui.confirm = {
      text: n
        ? `Delete ${name}? ${plural(n, 'item')} ${n === 1 ? 'uses' : 'use'} it and will ${kind === 'status' ? 'lose their status' : 'lose the tag'}.${also} You can undo.`
        : `Delete ${name}?${also} You can undo.`,
      action: 'Delete',
      run: () => deleteEntity(kind, ent.id),
    };
  }
</script>

<p class="intro">
  {#if kind === 'status'}
    Statuses show as the icon in front of each item. Mark the ones that mean <b>finished</b> as “done” — they drive
    progress, Ctrl+Enter and “hide done”. Type <kbd>@name</kbd> while adding an item, or press <kbd>1</kbd>–<kbd>9</kbd>.
  {:else if kind === 'tag'}
    Tags are coloured labels. Type <kbd>#name</kbd> in any item to add one (new names create the tag). A tag can sit
    inside another — <kbd>#work/client</kbd> — and filtering or searching by the outer one finds everything under it.
    Write the path here to move a tag; the count is everything it covers.
  {:else if kind === 'view'}
    A view remembers search, status and tag filters, the hidden/done toggles and which item you were zoomed into. Set
    them up, then save with <UiIcon name="bookmark-plus" size={14} /> in the sidebar or top bar — or add one below
    from what’s on screen now.
  {:else}
    Templates are ready-made item trees. Type <kbd>/name</kbd> in the add box (anything after it becomes the new
    item’s title), use Ctrl+K, or an item’s menu. Create one from an item’s menu → <b>Save as template</b>, or add an
    empty one here and write it out.
  {/if}
</p>

<div class="list">
  {#each list as ent (ent.id)}
    <div class="ent-wrap">
    <div class="ent">
      <div class="order">
        <button aria-label="Move up" disabled={atEnd(ent, -1)} onclick={() => move(ent, -1)}><UiIcon name="chevron-down" size={14} /></button>
        <button aria-label="Move down" disabled={atEnd(ent, 1)} onclick={() => move(ent, 1)}><UiIcon name="chevron-down" size={14} /></button>
      </div>
      <button class="pick ink" style:--c={ent.color} title="Icon" aria-label="Choose icon" onclick={(e) => pickIcon(e, ent)}>
        {#if ent.icon}<Icon icon={ent.icon} size={20} />{:else}<UiIcon name="icons" size={18} />{/if}
      </button>
      <button class="color" style:--c={ent.color} title="Colour" aria-label="Choose colour" onclick={(e) => pickColor(e, ent)}></button>
      <input
        class="field name"
        value={label(ent)}
        aria-label={kind === 'tag' ? 'Name, or parent/name to nest it' : 'Name'}
        onchange={(e) => {
          const v = e.currentTarget.value.trim();
          if (!v || v === label(ent)) e.currentTarget.value = label(ent);
          else if (kind === 'tag') renameTag(ent as Tag, v, e.currentTarget);
          else updateEntity(kind, ent.id, { name: v }, 'Rename');
        }}
        onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {#if kind === 'status' || kind === 'tag'}
        <span class="preview">
          {#if kind === 'status'}<StatusIcon status={ent as Status} size={16} />{:else}<TagChip tag={ent as Tag} />{/if}
        </span>
      {/if}
      {#if kind === 'status'}
        {@const st = ent as Status}
        <label class="flag" title="Counts as done">
          <button class="switch" role="switch" aria-checked={st.done} aria-label="Counts as done"
            onclick={() => updateEntity('status', st.id, { done: !st.done }, st.done ? 'Not a done status' : 'Done status')}></button>
          <span>Done</span>
        </label>
        <button
          class="default"
          class:on={settings.behavior.defaultStatus === st.id}
          title="Default for new items"
          aria-label="Default for new items"
          onclick={() => settings.setBehavior({ defaultStatus: settings.behavior.defaultStatus === st.id ? null : st.id })}
        >
          <UiIcon name="bolt" size={15} />
        </button>
      {/if}
      <span class="n" title={kind === 'template' ? 'items' : 'matching items'}>{count(ent) || ''}</span>
      <button class="icon-btn del" aria-label="Delete" title="Delete" onclick={() => remove(ent)}><UiIcon name="trash" size={16} /></button>
    </div>
    {#if kind === 'view'}
      {@const v = ent as SavedView}
      <div class="below">
        <span class="desc">Shows {describe(v.filter)}</span>
        <button class="btn ghost sm" onclick={() => { ui.settingsOpen = null; applyView(v); }}>Open</button>
        <button class="btn ghost sm" onclick={() => updateViewFilter(v.id)} title="Replace with the filters on screen now">Use current filters</button>
      </div>
    {:else if kind === 'template'}
      {@const t = ent as Template}
      <div class="below">
        <span class="desc">Type <kbd>/{t.name.split(/\s+/)[0]}</kbd> in the add box</span>
        <button class="btn ghost sm" onclick={() => (editing = editing === t.id ? null : t.id)}>
          {editing === t.id ? 'Close' : 'Edit items'}
        </button>
      </div>
      {#if editing === t.id}<TemplateEditor template={t} onclose={() => (editing = null)} />{/if}
    {/if}
    </div>
  {/each}
</div>

<form class="add" onsubmit={add}>
  <input
    class="field"
    bind:value={newName}
    placeholder={kind === 'status' ? 'New status…' : kind === 'tag' ? 'New tag…' : kind === 'view' ? 'Save what’s on screen as…' : 'New template…'}
    aria-label="New name"
  />
  <button class="btn primary" disabled={!newName.trim()}><UiIcon name="plus" size={16} /> Add</button>
</form>

{#if kind === 'status'}
  <p class="foot"><UiIcon name="bolt" size={14} /> marks the status new items start with (currently
    <b>{settings.behavior.defaultStatus ? model.statusList.find((s) => s.id === settings.behavior.defaultStatus)?.name : 'none'}</b>).</p>
{/if}

<style>
  .intro,
  .foot {
    margin: 0 0 14px;
    color: var(--text-2);
    font-size: 0.9em;
    line-height: 1.55;
  }

  .foot {
    margin-top: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ent-wrap {
    display: flex;
    flex-direction: column;
    border-radius: calc(var(--radius) * 0.8);
    border: 1px solid var(--border);
    background: var(--surface);
  }

  .below {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    padding: 0 10px 8px 34px;
    font-size: 0.85em;
  }

  .desc {
    flex: 1;
    min-width: 12em;
    color: var(--text-3);
  }

  .btn.sm {
    height: 26px;
    padding: 0 9px;
    font-size: 0.85em;
  }

  .ent {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 4px;
  }

  .order {
    display: flex;
    flex-direction: column;
    flex: none;
  }

  .order button {
    display: grid;
    place-items: center;
    width: 20px;
    height: 15px;
    color: var(--text-3);
    border-radius: 4px;
  }

  .order button:first-child :global(svg) {
    transform: rotate(180deg);
  }

  .order button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }

  .order button:disabled {
    opacity: 0.25;
  }

  .pick {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: none;
    border-radius: 10px;
    background: color-mix(in oklch, var(--c) var(--chip-mix), transparent);
    transition: transform 0.12s;
  }

  .pick:hover {
    transform: scale(1.06);
  }

  .color {
    width: 22px;
    height: 22px;
    flex: none;
    border-radius: 50%;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
    transition: transform 0.12s;
  }

  .color:hover {
    transform: scale(1.12);
  }

  .name {
    flex: 1;
    min-width: 60px;
  }

  .preview {
    display: inline-flex;
    flex: none;
  }

  .flag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82em;
    color: var(--text-2);
    flex: none;
  }

  .default {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: var(--text-3);
    flex: none;
  }

  .default.on {
    color: var(--on-accent);
    background: var(--accent);
  }

  .n {
    min-width: 1.6em;
    text-align: right;
    font-size: 0.82em;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }

  .del:hover {
    color: var(--danger);
  }

  .add {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  @media (max-width: 720px) {
    .ent {
      flex-wrap: wrap;
    }

    .preview {
      display: none;
    }

    .name {
      flex-basis: calc(100% - 140px);
    }
  }
</style>
