<script lang="ts">
  import { addItem, recordEdit } from '../lib/actions.svelte';
  import { db, model } from '../lib/model.svelte';
  import { ui } from '../lib/ui.svelte';
  import NoteEditor from './NoteEditor.svelte';
  import StatusIcon from './StatusIcon.svelte';
  import TagChip from './TagChip.svelte';
  import UiIcon from './UiIcon.svelte';

  let { id }: { id: string } = $props();

  const item = $derived(db.items[id]);
  const status = $derived(item?.status ? db.statuses[item.status] : null);
  const tags = $derived(item ? item.tags.map((t) => db.tags[t]).filter(Boolean) : []);
  let orig: string | null = null;

  function oninput(e: Event) {
    const v = (e.currentTarget as HTMLTextAreaElement).value.replace(/\n/g, ' ');
    orig ??= item.title;
    db.mutate([{ kind: 'item', id, set: { title: v } }]);
  }

  function commitTitle() {
    if (orig !== null && orig !== item.title) {
      recordEdit('Rename', [{ kind: 'item', id, set: { title: orig } }], [{ kind: 'item', id, set: { title: item.title } }]);
    }
    orig = null;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTitle();
      ui.edit(addItem(id, 'start'), 'start');
    } else if (e.key === 'Escape') {
      (e.currentTarget as HTMLTextAreaElement).blur();
    }
  }
</script>

{#if item}
  <div class="head">
    <div class="title-row">
      <button
        class="status"
        style:--c={status?.color ?? 'var(--text-3)'}
        aria-label="Status: {status?.name ?? 'none'}"
        onclick={(e) => ui.open({ kind: 'status', anchor: e.currentTarget, ids: [id] })}
      >
        <StatusIcon {status} size={26} />
      </button>
      <textarea class="title" rows="1" value={item.title} placeholder="Untitled" aria-label="Title" {oninput} {onkeydown}
        onblur={commitTitle}></textarea>
      <button class="icon-btn" aria-label="Actions" onclick={(e) => ui.open({ kind: 'item', anchor: e.currentTarget, ids: [id] })}>
        <UiIcon name="dots" size={18} />
      </button>
    </div>
    <div class="meta">
      {#each tags as tag (tag.id)}<TagChip {tag} />{/each}
      <button class="add-tag" onclick={(e) => ui.open({ kind: 'tags', anchor: e.currentTarget, ids: [id] })}>
        <UiIcon name="tag" size={14} /> {tags.length ? 'Edit' : 'Add tags'}
      </button>
      {#if item.hidden}<span class="flag"><UiIcon name="eye-off" size={14} /> hidden</span>{/if}
      <span class="count">{(model.children.get(id) ?? []).filter((c) => !c.archived).length} sub-items</span>
    </div>
    <div class="note"><NoteEditor {id} /></div>
  </div>
{/if}

<style>
  .head {
    padding: 0 10px 14px calc(var(--gutter) - 6px);
    margin-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .status {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    margin-left: -6px;
    flex: none;
    border-radius: 10px;
  }

  .status:hover {
    background: var(--hover);
  }

  .title {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    resize: none;
    background: transparent;
    font-size: 1.6em;
    font-weight: 700;
    letter-spacing: -0.015em;
    line-height: 1.25;
    padding: 2px 0;
    field-sizing: content;
    caret-color: var(--accent);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 8px 0 0 36px;
  }

  .add-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 0.8em;
    color: var(--text-3);
    border: 1px dashed var(--border-2);
  }

  .add-tag:hover {
    color: var(--text);
  }

  .flag,
  .count {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8em;
    color: var(--text-3);
  }

  .count {
    margin-left: auto;
  }

  .note {
    margin: 8px 0 0 36px;
  }
</style>
