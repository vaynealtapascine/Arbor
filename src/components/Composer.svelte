<script lang="ts">
  import { addFromText, resolveEntry } from '../lib/entry';
  import { revealRow } from '../lib/focus';
  import { db, model } from '../lib/model.svelte';
  import { isMultiline, parseEntry, parseOutline, tokenAt } from '../lib/parse';
  import { settings } from '../lib/settings.svelte';
  import { completeToken, suggestionsFor } from '../lib/suggest';
  import { countNodes as templateSize, findTemplate, templateMatches, useTemplate } from '../lib/templates';
  import type { Op, Template } from '../lib/types';
  import { ui } from '../lib/ui.svelte';
  import StatusIcon from './StatusIcon.svelte';
  import Suggest, { type Suggestion } from './Suggest.svelte';
  import TagChip from './TagChip.svelte';
  import UiIcon from './UiIcon.svelte';

  let { docked = false }: { docked?: boolean } = $props();

  let ta: HTMLTextAreaElement | undefined = $state();
  let text = $state('');
  let focused = $state(false);
  let suggestions: Suggestion[] = $state([]);
  let sIndex = $state(0);
  let token: ReturnType<typeof tokenAt> = null;
  /** True while the suggestions are templates ("/name") instead of #tags / @statuses. */
  let tplMode = false;

  const root = $derived(ui.zoom && db.items[ui.zoom] ? ui.zoom : null);
  const target = $derived(ui.quickParent && db.items[ui.quickParent] && !db.items[ui.quickParent].archived ? ui.quickParent : root);
  const nested = $derived(target !== root);
  const multi = $derived(isMultiline(text));
  // "/template the rest": build from a template, with the rest as the new item's title.
  const slash = $derived(model.templateList.length && !multi ? /^\/(\S*)(?:\s+([\s\S]*))?$/.exec(text) : null);
  const slashTemplate = $derived(slash ? findTemplate(slash[1]) : undefined);
  const preview = $derived(!multi && !slash && text.trim() ? parseEntry(text, model.statusList, model.tagList) : null);
  const lineCount = $derived(multi ? countNodes(parseOutline(text)) : 0);

  // A new zoom level resets where quick-add puts things.
  $effect(() => {
    void root;
    ui.quickParent = null;
    ui.quickLast = null;
  });

  function countNodes(nodes: ReturnType<typeof parseOutline>): number {
    return nodes.reduce((n, x) => n + 1 + countNodes(x.children), 0);
  }

  /** Creates a template's items here; `rest` names the new item (and can carry #tags / @status). */
  function useTpl(tpl: Template, rest: string) {
    const ops: Op[] = [];
    const e = resolveEntry(rest, ops);
    const ids = useTemplate(tpl, target, settings.behavior.addPosition, {
      name: e.title,
      tags: e.tags,
      status: e.status,
      extra: ops,
    });
    text = '';
    suggestions = [];
    tplMode = false;
    if (ids.length) {
      ui.quickLast = ids[ids.length - 1];
      revealRow(ids[0]);
    }
  }

  const restAfterSlash = () => text.replace(/^\/\S*\s?/, '');

  function submit() {
    if (!text.trim()) return;
    if (slash && slashTemplate) return useTpl(slashTemplate, slash[2] ?? '');
    const ids = addFromText(target, settings.behavior.addPosition, text);
    text = '';
    suggestions = [];
    if (ids.length) {
      ui.quickLast = ids[ids.length - 1];
      revealRow(ids[ids.length - 1]);
    }
  }

  function nestUnderLast() {
    const last = ui.quickLast;
    if (last && db.items[last] && model.parentOf(last) === target) {
      ui.quickParent = last;
      ui.setOpen(last, true);
      return true;
    }
    return false;
  }

  function unnest() {
    if (!nested || !target) return false;
    ui.quickLast = target;
    const p = model.parentOf(target);
    ui.quickParent = p === root ? null : p;
    return true;
  }

  function updateSuggestions() {
    if (!ta) return;
    const caret = ta.selectionStart;
    const typingName = /^\/\S*$/.exec(text.slice(0, caret));
    tplMode = !!typingName && !!model.templateList.length && !multi;
    if (tplMode) {
      token = null;
      suggestions = templateMatches(typingName![0].slice(1)).map((t) => ({
        key: t.id,
        label: t.name,
        color: t.color,
        icon: t.icon,
        hint: `${templateSize(t.items)} items`,
        sigil: '/' as const,
      }));
    } else {
      token = caret === ta.selectionEnd ? tokenAt(text, caret) : null;
      suggestions = token ? suggestionsFor(token.sigil, token.query) : [];
    }
    sIndex = 0;
  }

  /** The template behind a suggestion, when the list is showing templates. */
  function templateOf(s: Suggestion | undefined) {
    return tplMode && s ? model.templateList.find((t) => t.id === s.key) : undefined;
  }

  function pick(s: Suggestion) {
    if (tplMode && ta) {
      const rest = restAfterSlash();
      text = `/${s.label.trim().replace(/\s+/g, '-')} ${rest}`;
      ta.value = text;
      const caret = text.length - rest.length;
      ta.setSelectionRange(caret, caret);
      suggestions = [];
      tplMode = false;
      return;
    }
    if (!token || !ta) return;
    const r = completeToken(text, token.start, token.end, token.sigil, s.label);
    text = r.text;
    ta.value = r.text;
    ta.setSelectionRange(r.caret, r.caret);
    suggestions = [];
    token = null;
  }

  function onkeydown(e: KeyboardEvent) {
    if (suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sIndex = (sIndex + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        pick(suggestions[sIndex]);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        // One keystroke: take the highlighted template/tag/status and add (new tags are created by the parser).
        e.preventDefault();
        const s = suggestions[sIndex];
        const tpl = templateOf(s);
        if (tpl) return useTpl(tpl, restAfterSlash());
        if (s && !s.create) pick(s);
        submit();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        suggestions = [];
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      if (e.shiftKey ? unnest() : nestUnderLast()) e.preventDefault();
      else if (!e.shiftKey) e.preventDefault();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (text) text = '';
      else ta?.blur();
    } else if (e.key === 'ArrowDown' && !text && !docked) {
      // Hop from the empty box into the outline.
      const first = document.querySelector<HTMLElement>('[data-row-id]');
      if (first) {
        e.preventDefault();
        ui.edit(first.dataset.rowId!, 'end');
      }
    }
  }

  function onbeforeinput(e: InputEvent) {
    if ((e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') && !multi) {
      e.preventDefault();
      const s = suggestions[sIndex];
      const tpl = templateOf(s);
      if (tpl) return useTpl(tpl, restAfterSlash());
      if (s && !s.create) pick(s);
      submit();
    }
  }

  export function focus() {
    ta?.focus();
  }
</script>

<div class="composer" class:docked class:focused class:glass={docked}>
  {#if nested && target}
    <div class="target">
      <UiIcon name="corner-down-right" size={14} />
      <span class="in">in</span>
      <span class="target-title">{db.items[target]?.title || 'Untitled'}</span>
      <button class="x" aria-label="Add at top level instead" onclick={() => (ui.quickParent = null)}>
        <UiIcon name="x" size={13} />
      </button>
    </div>
  {/if}
  <div class="box">
    <span class="plus"><UiIcon name="plus" size={18} /></span>
    <textarea
      bind:this={ta}
      bind:value={text}
      rows="1"
      placeholder={docked
        ? 'Add… #tag @status'
        : model.templateList.length
          ? 'Add an item…   #tag  @status  :: note  /template'
          : 'Add an item…   #tag  @status  :: note'}
      aria-label="Add an item"
      enterkeyhint="done"
      data-composer
      {onkeydown}
      {onbeforeinput}
      oninput={updateSuggestions}
      onclick={updateSuggestions}
      onfocus={() => (focused = true)}
      onblur={() => {
        focused = false;
        suggestions = [];
      }}
    ></textarea>
    {#if docked}
      <button class="send" aria-label="Add" disabled={!text.trim()} onpointerdown={(e) => e.preventDefault()} onclick={submit}>
        <UiIcon name="arrow-up" size={18} stroke={2.2} />
      </button>
    {:else if focused && !text}
      <span class="keys"><kbd>Tab</kbd> nest under last</span>
    {/if}
  </div>
  {#if preview && (preview.tagIds.length || preview.newTags.length || preview.status || preview.note)}
    <div class="preview">
      {#if preview.status}
        <span class="st"><StatusIcon status={db.statuses[preview.status]} size={14} />{db.statuses[preview.status]?.name}</span>
      {/if}
      {#each preview.tagIds as t (t)}{#if db.tags[t]}<TagChip tag={db.tags[t]} />{/if}{/each}
      {#each preview.newTags as n (n)}
        <span class="new-tag">+ #{n}</span>
      {/each}
      {#if preview.note}<span class="has-note"><UiIcon name="notes" size={13} /> note</span>{/if}
    </div>
  {:else if slash && slashTemplate}
    <div class="preview">
      <UiIcon name="template" size={14} /> Template <b>{slashTemplate.name}</b> · {templateSize(slashTemplate.items)} items
      {#if slash[2]?.trim()}→ “{slash[2].trim()}”{:else}<span class="dim">— add a name after it</span>{/if}
    </div>
  {:else if multi}
    <div class="preview"><UiIcon name="list-tree" size={14} /> Adds {lineCount} items as an outline</div>
  {/if}
</div>

{#if suggestions.length && focused}
  <Suggest items={suggestions} index={sIndex} anchor={ta} onpick={pick} onhover={(i) => (sIndex = i)} />
{/if}

<style>
  .composer {
    position: relative;
  }

  .box {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 6px 8px 6px 12px;
    border-radius: var(--radius);
    border: 1px dashed var(--border-2);
    background: color-mix(in oklch, var(--surface) 55%, transparent);
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  }

  .composer.focused .box {
    border-style: solid;
    border-color: var(--accent-line);
    background: var(--surface);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .plus {
    color: var(--text-3);
    display: grid;
  }

  .composer.focused .plus {
    color: var(--accent-ink);
  }

  textarea {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    resize: none;
    padding: 2px 0;
    font: inherit;
    line-height: 1.45;
    field-sizing: content;
    max-height: 40vh;
    caret-color: var(--accent);
  }

  .keys {
    font-size: 0.78em;
    color: var(--text-3);
    white-space: nowrap;
  }

  .target {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    margin: 0 0 6px 4px;
    padding: 2px 4px 2px 8px;
    border-radius: 999px;
    font-size: 0.82em;
    color: var(--accent-ink);
    background: var(--accent-soft);
  }

  .in {
    opacity: 0.75;
  }

  .target-title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .x {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
  }

  .x:hover {
    background: var(--hover);
  }

  .preview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 6px 4px 0;
    font-size: 0.85em;
    color: var(--text-2);
  }

  .st,
  .has-note {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .dim {
    color: var(--text-3);
  }

  .new-tag {
    font-size: 0.8em;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px dashed var(--border-2);
    color: var(--text-2);
  }

  /* Phone: docked above the keyboard / bottom edge. */
  .composer.docked {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
  }

  .composer.docked .box {
    border-radius: 999px;
    min-height: 46px;
    background: var(--surface);
    border-style: solid;
  }

  .send {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    flex: none;
    transition: opacity 0.15s, transform 0.1s;
  }

  .send:disabled {
    opacity: 0.35;
  }

  .send:active {
    transform: scale(0.92);
  }
</style>
