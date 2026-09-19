<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import {
    addItem,
    commit,
    indent,
    outdent,
    recordEdit,
    setStatus,
    shift,
    statusChange,
    tagOps,
    toggleDone,
  } from '../lib/actions.svelte';
  import { addFromText, entryOpsForItem } from '../lib/entry';
  import { keepKeyboard, placeCaret } from '../lib/focus';
  import { db, model } from '../lib/model.svelte';
  import { isMultiline, tokenAt } from '../lib/parse';
  import { settings } from '../lib/settings.svelte';
  import { completeToken, suggestionsFor } from '../lib/suggest';
  import type { Doc, Op } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import { view } from '../lib/view.svelte';
  import Suggest, { type Suggestion } from './Suggest.svelte';

  let { id }: { id: string } = $props();

  let ta: HTMLTextAreaElement | undefined = $state();
  let text = $state(untrack(() => db.items[id]?.title ?? ''));
  let suggestions: Suggestion[] = $state([]);
  let sIndex = $state(0);
  let token: ReturnType<typeof tokenAt> = null;

  const FIELDS = ['title', 'tags', 'status', 'note', 'doneAt', 'prevStatus'] as const;
  const snapshot = (): Doc => {
    const it = db.items[id];
    return it ? Object.fromEntries(FIELDS.map((f) => [f, $state.snapshot(it[f])])) : {};
  };
  let orig = snapshot();
  let createdTags: Op[] = [];

  /** Applies typed #tags/@status and records one undo step for this editing session. */
  function finalize() {
    const it = db.items[id];
    if (!it) return;
    const ops = entryOpsForItem(id, it.title);
    if (ops.length) {
      db.mutate(ops);
      createdTags.push(...ops.filter((o) => o.kind === 'tag'));
      if (ui.editing?.id === id && db.items[id].title !== text) text = db.items[id].title;
    }
    const now = snapshot();
    const changed = FIELDS.filter((f) => JSON.stringify(now[f]) !== JSON.stringify(orig[f]));
    if (changed.length || createdTags.length) {
      const undo: Op[] = [
        { kind: 'item', id, set: Object.fromEntries(changed.map((f) => [f, orig[f]])) },
        ...createdTags.map((t) => ({ kind: 'tag' as const, id: t.id, del: true })),
      ];
      const redo: Op[] = [
        { kind: 'item', id, set: Object.fromEntries(changed.map((f) => [f, now[f]])) },
        ...createdTags,
      ];
      recordEdit('Edit', undo, redo);
    }
    orig = now;
    createdTags = [];
  }

  function focus() {
    if (!ta || !ui.editing || ui.editing.id !== id) return;
    ta.focus({ preventScroll: true });
    placeCaret(ta, ui.editing.caret);
    ta.scrollIntoView({ block: 'nearest' });
  }

  onMount(() => {
    focus();
  });

  // Re-focus when asked (e.g. after the row moved in the list).
  $effect(() => {
    void ui.editing?.n;
    tick().then(focus);
  });

  // Pick up edits from other devices while not changed locally.
  $effect(() => {
    const remote = db.items[id]?.title ?? '';
    if (document.activeElement !== ta && remote !== text) text = remote;
  });

  onDestroy(() => {
    finalize();
  });

  function oninput() {
    if (!ta) return;
    text = ta.value.replace(/\n/g, ' ');
    if (text !== ta.value) ta.value = text;
    db.mutate([{ kind: 'item', id, set: { title: text } }]);
    updateSuggestions();
  }

  function updateSuggestions() {
    if (!ta) return;
    token = ta.selectionStart === ta.selectionEnd ? tokenAt(text, ta.selectionStart) : null;
    suggestions = token ? suggestionsFor(token.sigil, token.query) : [];
    sIndex = 0;
  }

  function pick(s: Suggestion) {
    if (!token || !ta) return;
    const t = token;
    const it = db.items[id];
    // The token is consumed: its effect shows up as a chip / status icon instead.
    const clean = (text.slice(0, t.start) + text.slice(t.end)).replace(/\s{2,}/g, ' ');
    const caret = Math.min(t.start, clean.length);
    const set: Doc = { title: clean };
    const ops: Op[] = [];
    if (t.sigil === '@') {
      Object.assign(set, statusChange(it, s.key));
    } else {
      let tagId = s.key;
      if (s.create) {
        tagId = tagOps(s.label, ops);
        createdTags.push(...ops);
      }
      if (!it.tags.includes(tagId)) set.tags = [...it.tags, tagId];
    }
    ops.push({ kind: 'item', id, set });
    db.mutate(ops);
    text = clean;
    ta.value = clean;
    placeCaret(ta, caret);
    suggestions = [];
    token = null;
  }

  /** Keeps the completion as text instead (quick-add style), e.g. for Tab. */
  function completeAsText(s: Suggestion) {
    if (!token || !ta) return;
    const r = completeToken(text, token.start, token.end, token.sigil, s.label);
    text = r.text;
    ta.value = r.text;
    db.mutate([{ kind: 'item', id, set: { title: text } }]);
    placeCaret(ta, r.caret);
    suggestions = [];
  }

  function go(target: string | null, caret: number | 'start' | 'end') {
    if (!target) return;
    ui.edit(target, caret);
  }

  function isWrapped() {
    if (!ta) return false;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    return ta.scrollHeight > lh * 1.6;
  }

  function arrow(dir: -1 | 1, e: KeyboardEvent) {
    if (!ta) return;
    const target = dir < 0 ? view.prev(id) : view.next(id);
    if (!isWrapped()) {
      e.preventDefault();
      go(target, ta.selectionStart);
      return;
    }
    const before = ta.selectionStart;
    setTimeout(() => {
      if (ta && ta.selectionStart === before) go(target, dir < 0 ? 'end' : 'start');
    });
  }

  function enter() {
    if (!ta) return;
    const caret = ta.selectionStart;
    const full = ta.value;
    const parent = model.parentOf(id);
    keepKeyboard();
    if (caret === 0 && full.length > 0) {
      finalize();
      addItem(parent, { before: id });
      ui.edit(id, 0);
      return;
    }
    if (caret < full.length) {
      // Split the text at the caret into this item and a new one below.
      const before = full.slice(0, caret).trimEnd();
      const after = full.slice(caret).trimStart();
      text = before;
      db.mutate([{ kind: 'item', id, set: { title: before } }]);
      finalize();
      const created = addItem(parent, { after: id }, { title: after });
      ui.edit(created, 'start');
      return;
    }
    finalize();
    const row = view.rows[view.index.get(id) ?? -1];
    const intoChildren =
      settings.behavior.enterIntoChildren && row && row.kids > 0 && ui.isOpen(id) && ui.view === 'outline';
    const created = intoChildren ? addItem(id, 'start') : addItem(parent, { after: id });
    ui.edit(created, 'start');
  }

  /** Backspace at the very start: delete an empty row, or merge into the row above. */
  function backspaceAtStart(): boolean {
    const it = db.items[id];
    if (!it) return false;
    if ((model.children.get(id) ?? []).length) return false;
    const prevId = view.prev(id);
    if (!it.title && !it.note) {
      const next = prevId ?? view.next(id);
      commit('Delete item', [{ kind: 'item', id, del: true }]);
      orig = snapshot();
      keepKeyboard();
      if (next) ui.edit(next, 'end');
      else ui.stopEditing();
      return true;
    }
    if (!prevId) return false;
    const prev = db.items[prevId];
    const at = prev.title.length;
    const joined = prev.title && it.title ? `${prev.title}${/\s$/.test(prev.title) ? '' : ' '}${it.title}` : prev.title + it.title;
    finalize();
    commit('Merge items', [
      {
        kind: 'item',
        id: prevId,
        set: {
          title: joined,
          note: [prev.note, it.note].filter(Boolean).join('\n\n'),
          tags: [...new Set([...prev.tags, ...it.tags])],
        },
      },
      { kind: 'item', id, del: true },
    ]);
    orig = snapshot();
    keepKeyboard();
    ui.edit(prevId, at + (prev.title && it.title && !/\s$/.test(prev.title) ? 1 : 0));
    return true;
  }

  function statusByDigit(code: string): boolean {
    const m = /^Digit(\d)$/.exec(code);
    if (!m) return false;
    const n = Number(m[1]);
    finalize();
    setStatus([id], n === 0 ? null : (model.statusList[n - 1]?.id ?? db.items[id].status));
    orig = snapshot();
    return true;
  }

  function refocusAfterMove() {
    const caret = ta?.selectionStart ?? 'end';
    tick().then(() => ui.edit(id, caret));
  }

  function onkeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sIndex = (sIndex + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        pick(suggestions[sIndex]);
        return;
      }
      if (e.key === 'Enter') {
        // Take the highlighted tag/status, then carry on to the next row as usual.
        e.preventDefault();
        pick(suggestions[sIndex]);
        enter();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        suggestions = [];
        return;
      }
    }

    if (e.key === 'Enter' && mod) {
      e.preventDefault();
      finalize();
      toggleDone([id]);
      orig = snapshot();
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      finalize();
      ui.toggleNote(id, true);
      ui.edit(id, 'end', 'note');
    } else if (e.key === 'Enter' && !e.altKey) {
      e.preventDefault();
      enter();
    } else if (e.key === 'Tab' && !mod && !e.altKey) {
      e.preventDefault();
      finalize();
      if (e.shiftKey) outdent([id]);
      else indent([id]);
      refocusAfterMove();
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.shiftKey && (e.altKey || mod)) {
      e.preventDefault();
      finalize();
      shift([id], e.key === 'ArrowUp' ? -1 : 1);
      refocusAfterMove();
    } else if (e.key === 'ArrowUp' && !e.shiftKey && !mod && !e.altKey) {
      arrow(-1, e);
    } else if (e.key === 'ArrowDown' && !e.shiftKey && !mod && !e.altKey) {
      arrow(1, e);
    } else if (e.key === 'Backspace' && ta?.selectionStart === 0 && ta.selectionEnd === 0 && !mod) {
      if (backspaceAtStart()) e.preventDefault();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      ta?.blur();
      ui.stopEditing();
    } else if (e.altKey && !mod && !e.shiftKey && statusByDigit(e.code)) {
      e.preventDefault();
    }
  }

  // Soft keyboards often skip keydown for Enter/Backspace; beforeinput always fires.
  function onbeforeinput(e: InputEvent) {
    if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
      e.preventDefault();
      if (suggestions.length) pick(suggestions[sIndex]);
      enter();
    } else if (e.inputType === 'deleteContentBackward' && ta?.selectionStart === 0 && ta.selectionEnd === 0) {
      if (backspaceAtStart()) e.preventDefault();
    }
  }

  function onpaste(e: ClipboardEvent) {
    const pasted = e.clipboardData?.getData('text/plain') ?? '';
    if (!isMultiline(pasted)) return;
    e.preventDefault();
    finalize();
    const parent = model.parentOf(id);
    const created = addFromText(parent, { after: id }, pasted);
    if (!db.items[id]?.title && !db.items[id]?.note) commit('Delete item', [{ kind: 'item', id, del: true }]);
    orig = snapshot();
    if (created.length) ui.edit(created[created.length - 1], 'end');
  }

  function onblur() {
    suggestions = [];
    // Leave edit mode unless focus moved to another editor (which sets ui.editing itself).
    setTimeout(() => {
      if (ui.editing?.id === id && ui.editing.field === 'title' && document.activeElement !== ta) {
        const active = document.activeElement;
        if (!active || active === document.body || !active.closest('.suggest, .popover, .sheet, .edit-toolbar')) {
          ui.stopEditing();
        }
      }
    }, 120);
  }
</script>

<textarea
  bind:this={ta}
  class="title-input"
  rows="1"
  value={text}
  spellcheck="true"
  autocapitalize="sentences"
  enterkeyhint="enter"
  placeholder="Untitled"
  aria-label="Item title"
  {oninput}
  {onkeydown}
  {onbeforeinput}
  {onpaste}
  {onblur}
  onkeyup={(e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) updateSuggestions();
  }}
  onclick={updateSuggestions}
></textarea>

{#if suggestions.length}
  <Suggest
    items={suggestions}
    index={sIndex}
    anchor={ta}
    onpick={(s) => (token ? pick(s) : completeAsText(s))}
    onhover={(i) => (sIndex = i)}
  />
{/if}

<style>
  .title-input {
    display: block;
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    outline: none;
    resize: none;
    overflow: hidden;
    background: transparent;
    font: inherit;
    line-height: inherit;
    color: inherit;
    field-sizing: content;
    min-height: 1lh;
    caret-color: var(--accent);
  }
</style>
