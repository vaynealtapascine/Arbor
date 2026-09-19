<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { indent, outdent, shift, toggleDone } from '../lib/actions.svelte';
  import { db, model } from '../lib/model.svelte';
  import { ui } from '../lib/ui.svelte';
  import UiIcon from './UiIcon.svelte';

  // Keeps the bar glued to the top of the on-screen keyboard.
  let offset = $state(0);
  onMount(() => {
    const vv = visualViewport;
    if (!vv) return;
    const update = () => (offset = Math.max(0, innerHeight - (vv.height + vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  });

  const id = $derived(ui.editing?.id ?? '');
  const item = $derived(db.items[id]);
  const done = $derived(item ? model.isDone(item) : false);
  const noteMode = $derived(ui.editing?.field === 'note');

  function caret(): number | 'end' {
    const el = document.activeElement;
    return el instanceof HTMLTextAreaElement ? el.selectionStart : 'end';
  }

  function act(fn: () => void) {
    const c = caret();
    const field = ui.editing?.field ?? 'title';
    fn();
    tick().then(() => ui.editing && ui.edit(id, c, field));
  }

  const keep = (e: PointerEvent) => e.preventDefault();

  function anchor(e: MouseEvent) {
    return (e.currentTarget as HTMLElement).getBoundingClientRect();
  }
</script>

{#if item}
  <div class="edit-toolbar glass" style:bottom="{offset}px" role="toolbar" aria-label="Editing tools">
    <button onpointerdown={keep} onclick={() => act(() => outdent([id]))} aria-label="Outdent"><UiIcon name="indent-decrease" size={21} /></button>
    <button onpointerdown={keep} onclick={() => act(() => indent([id]))} aria-label="Indent"><UiIcon name="indent-increase" size={21} /></button>
    <button onpointerdown={keep} onclick={() => act(() => shift([id], -1))} aria-label="Move up"><UiIcon name="arrow-up" size={21} /></button>
    <button onpointerdown={keep} onclick={() => act(() => shift([id], 1))} aria-label="Move down"><UiIcon name="arrow-down" size={21} /></button>
    <span class="sep"></span>
    <button onpointerdown={keep} onclick={(e) => ui.open({ kind: 'status', anchor: anchor(e), ids: [id] })} aria-label="Status">
      <UiIcon name="circle-dot" size={21} />
    </button>
    <button onpointerdown={keep} onclick={(e) => ui.open({ kind: 'tags', anchor: anchor(e), ids: [id] })} aria-label="Tags">
      <UiIcon name="hash" size={21} />
    </button>
    <button
      class:on={noteMode}
      onpointerdown={keep}
      onclick={() => {
        if (noteMode) ui.edit(id, 'end', 'title');
        else {
          ui.toggleNote(id, true);
          ui.edit(id, 'end', 'note');
        }
      }}
      aria-label={noteMode ? 'Back to title' : 'Note'}
    >
      <UiIcon name="notes" size={21} />
    </button>
    <button class:on={done} onpointerdown={keep} onclick={() => act(() => toggleDone([id]))} aria-label="Toggle done">
      <UiIcon name="circle-check" size={21} />
    </button>
    <span class="grow"></span>
    <button
      class="finish"
      onpointerdown={keep}
      onclick={() => {
        (document.activeElement as HTMLElement | null)?.blur();
        ui.stopEditing();
      }}
      aria-label="Done editing"
    >
      <UiIcon name="check" size={20} stroke={2.4} />
    </button>
  </div>
{/if}

<style>
  .edit-toolbar {
    position: fixed;
    left: 0;
    right: 0;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px 6px calc(5px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: none;
  }

  button {
    display: grid;
    place-items: center;
    width: 42px;
    height: 40px;
    flex: none;
    border-radius: 10px;
    color: var(--text-2);
  }

  button:active {
    background: var(--active);
  }

  button.on {
    color: var(--accent-ink);
    background: var(--accent-soft);
  }

  .sep {
    width: 1px;
    height: 24px;
    background: var(--border);
    margin: 0 3px;
    flex: none;
  }

  .grow {
    flex: 1;
  }

  .finish {
    background: var(--accent);
    color: var(--on-accent);
    width: 46px;
  }
</style>
