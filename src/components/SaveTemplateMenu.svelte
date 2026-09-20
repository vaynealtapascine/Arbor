<script lang="ts">
  import { untrack } from 'svelte';
  import { autofocus } from '../lib/autofocus';
  import { db } from '../lib/model.svelte';
  import { countNodes, nodesFromItems, saveTemplate } from '../lib/templates';
  import { ui } from '../lib/ui.svelte';
  import { plural } from '../lib/util';

  let { ids }: { ids: string[] } = $props();

  // Snapshot the items once: the popover keeps showing what was selected when it opened.
  const nodes = untrack(() => nodesFromItems(ids));
  let name = $state(nodes.length === 1 ? nodes[0].title || 'Template' : 'Template');

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim() || !nodes.length) return;
    saveTemplate(name.trim(), nodes);
    ui.closePopover();
  }
</script>

<form class="save" onsubmit={save}>
  <div class="what">
    {plural(countNodes(nodes), 'item')} from “{db.items[ids[0]]?.title || 'Untitled'}”{ids.length > 1 ? ' and more' : ''},
    with statuses, tags and notes.
  </div>
  <input class="field" bind:value={name} placeholder="Template name" aria-label="Template name" use:autofocus maxlength="60" />
  <button class="btn primary" disabled={!name.trim()}>Save template</button>
  <p class="hint">
    Use it by typing <kbd>/{name.trim().split(/\s+/)[0] || 'name'}</kbd> in the add box, from Ctrl+K, or an item’s menu.
    Titles can contain <code>{'{name}'}</code>, <code>{'{date}'}</code> and more — edit it in Settings → Templates.
  </p>
</form>

<style>
  .save {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 6px;
  }

  .what,
  .hint {
    font-size: 0.84em;
    color: var(--text-2);
    margin: 0;
    line-height: 1.5;
  }

  .hint {
    color: var(--text-3);
    font-size: 0.8em;
  }

  code {
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-size: 0.92em;
  }
</style>
