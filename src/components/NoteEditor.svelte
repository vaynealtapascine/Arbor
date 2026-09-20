<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { commit, recordEdit } from '../lib/actions.svelte';
  import { placeCaret } from '../lib/focus';
  import { db } from '../lib/model.svelte';
  import { renderMarkdown, toggleTask } from '../lib/text';
  import { ui } from '../lib/ui.svelte';

  let { id }: { id: string } = $props();

  const editing = $derived(ui.editing?.id === id && ui.editing.field === 'note');
  const note = $derived(db.items[id]?.note ?? '');
  const html = $derived(editing ? '' : renderMarkdown(note));

  let ta: HTMLTextAreaElement | undefined = $state();
  let orig: string | null = null;

  // Only entering edit mode (or an explicit re-focus) should move the caret, not typing.
  $effect(() => {
    const on = editing;
    void ui.editing?.n;
    untrack(() => {
      if (!on) return finish();
      orig ??= note;
      tick().then(() => {
        if (!ta || !ui.editing) return;
        ta.focus({ preventScroll: true });
        placeCaret(ta, ui.editing.caret);
        ta.scrollIntoView({ block: 'nearest' });
      });
    });
  });

  function finish() {
    if (orig === null) return;
    const now = db.items[id]?.note ?? '';
    if (now !== orig) {
      recordEdit('Edit note', [{ kind: 'item', id, set: { note: orig } }], [{ kind: 'item', id, set: { note: now } }]);
    }
    orig = null;
  }

  onDestroy(finish);

  function oninput() {
    db.mutate([{ kind: 'item', id, set: { note: ta!.value } }]);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      finish();
      if (!note.trim()) ui.toggleNote(id, false);
      ui.edit(id, 'end', 'title');
    } else if (e.key === 'Tab') {
      // Indent list lines instead of leaving the field.
      e.preventDefault();
      const el = ta!;
      const s = el.selectionStart;
      if (e.shiftKey) {
        const lineStart = el.value.lastIndexOf('\n', s - 1) + 1;
        if (el.value.startsWith('  ', lineStart)) {
          el.setRangeText('', lineStart, lineStart + 2, 'end');
          el.setSelectionRange(Math.max(lineStart, s - 2), Math.max(lineStart, s - 2));
        }
      } else {
        el.setRangeText('  ', s, el.selectionEnd, 'end');
      }
      oninput();
    }
  }

  function onblur() {
    setTimeout(() => {
      if (ui.editing?.id === id && ui.editing.field === 'note' && document.activeElement !== ta) {
        finish();
        if (!note.trim()) ui.toggleNote(id, false);
        ui.stopEditing();
      }
    }, 120);
  }

  function onclick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('a')) return;
    // A picture in a note opens full size instead of starting an edit.
    if (target instanceof HTMLImageElement && target.dataset.zoom) {
      e.preventDefault();
      window.open(target.src, '_blank', 'noopener,noreferrer');
      return;
    }
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      e.preventDefault();
      const boxes = [...(e.currentTarget as HTMLElement).querySelectorAll('input[type="checkbox"]')];
      const next = toggleTask(note, boxes.indexOf(target));
      commit('Toggle checklist item', [{ kind: 'item', id, set: { note: next } }]);
      return;
    }
    if (ui.selecting || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (getSelection()?.toString()) return;
    ui.edit(id, 'end', 'note');
  }
</script>

<div class="note">
  {#if editing}
    <textarea
      bind:this={ta}
      class="note-input"
      value={note}
      placeholder="Write a note… markdown, and ![](image-url) shows the picture"
      aria-label="Note"
      {oninput}
      {onkeydown}
      {onblur}
    ></textarea>
  {:else if note.trim()}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="md rendered" {onclick}>{@html html}</div>
  {:else}
    <button class="empty" onclick={() => ui.edit(id, 'end', 'note')}>Add a note…</button>
  {/if}
</div>

<style>
  .note {
    margin: 2px 0 4px;
    font-size: 0.92em;
    color: var(--text-2);
    line-height: 1.55;
  }

  .rendered {
    cursor: text;
    padding: 2px 0;
  }

  .note-input {
    display: block;
    width: 100%;
    margin: 0;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 0.6);
    background: color-mix(in oklch, var(--surface) 70%, transparent);
    outline: none;
    resize: none;
    font: inherit;
    color: var(--text);
    line-height: inherit;
    field-sizing: content;
    min-height: 3lh;
    caret-color: var(--accent);
  }

  .note-input:focus {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .empty {
    color: var(--text-3);
    font-style: italic;
    padding: 2px 0;
  }
</style>
