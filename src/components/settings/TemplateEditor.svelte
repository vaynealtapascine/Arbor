<script lang="ts">
  import { untrack } from 'svelte';
  import { templateToText, updateTemplateItems, VARIABLES } from '../../lib/templates';
  import type { Template } from '../../lib/types';

  let { template, onclose }: { template: Template; onclose: () => void } = $props();

  let text = $state(untrack(() => templateToText(template.items)));
  const dirty = $derived(text !== templateToText(template.items));

  function save() {
    updateTemplateItems(template.id, text);
    onclose();
  }
</script>

<div class="editor">
  <textarea
    class="field code"
    rows={Math.min(18, Math.max(5, text.split('\n').length + 1))}
    spellcheck="false"
    bind:value={text}
    aria-label="Template items"
    onkeydown={(e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const el = e.currentTarget;
        const s = el.selectionStart;
        const lineStart = el.value.lastIndexOf('\n', s - 1) + 1;
        if (e.shiftKey) {
          if (el.value.startsWith('  ', lineStart)) el.setRangeText('', lineStart, lineStart + 2, 'end');
        } else {
          el.setRangeText('  ', lineStart, lineStart, 'end');
        }
        text = el.value;
      }
    }}
  ></textarea>
  <div class="help">
    One item per line; indent two spaces to nest. <code>@status</code> and <code>#tag</code> work as usual,
    <code>[x]</code> marks done, and <code>&gt; text</code> lines become the note of the item above. Variables:
    {#each VARIABLES as [v, what], i (v)}<code title={what}>{v}</code>{i < VARIABLES.length - 1 ? ' ' : ''}{/each}
    (hover for details).
  </div>
  <div class="actions">
    <button class="btn primary" disabled={!dirty} onclick={save}>Save <kbd>Ctrl+Enter</kbd></button>
    <button class="btn ghost" onclick={onclose}>Cancel</button>
  </div>
</div>

<style>
  .editor {
    padding: 0 10px 10px 34px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .code {
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-size: 0.85em;
    line-height: 1.6;
    tab-size: 2;
    resize: vertical;
  }

  .help {
    font-size: 0.82em;
    line-height: 1.7;
    color: var(--text-3);
  }

  code {
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-size: 0.95em;
    padding: 0 4px;
    border-radius: 4px;
    background: var(--bg-2);
    color: var(--text-2);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .actions kbd {
    background: transparent;
    border-color: color-mix(in oklch, var(--on-accent) 35%, transparent);
    color: inherit;
    opacity: 0.8;
  }
</style>
