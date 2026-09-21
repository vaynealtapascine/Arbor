<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { ui } from '../lib/ui.svelte';
  import UiIcon from './UiIcon.svelte';

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: 'While typing in a row',
      rows: [
        ['Enter', 'New item below (splits the text at the cursor)'],
        ['Shift+Enter', 'Open the note'],
        ['Tab / Shift+Tab', 'Indent / outdent'],
        ['Ctrl+Enter', 'Toggle done'],
        ['Alt+1 … 9, Alt+0', 'Set status by position / clear it'],
        ['Alt+Shift+↑ ↓', 'Move the item up / down'],
        ['↑ ↓', 'Previous / next row'],
        ['Backspace at start', 'Merge into the row above (deletes if empty)'],
        ['#tag  @status', 'Tag or set status inline — Enter takes the highlighted match, Tab just completes'],
        ['#work/client', 'A tag inside another; filtering by the outer one covers everything under it'],
        ['Esc', 'Stop editing'],
      ],
    },
    {
      title: 'Quick add',
      rows: [
        ['N or Q', 'Focus the add box'],
        ['Enter', 'Add; the box stays ready for the next one'],
        ['Tab / Shift+Tab', 'Nest the next items under the last one / back out'],
        ['text :: note', 'Everything after “ :: ” becomes the note'],
        ['/template a name', 'Build a template here; the rest of the line names it'],
        ['Paste lines', 'Indented or bulleted lines become a nested outline'],
      ],
    },
    {
      title: 'Searching',
      rows: [
        ['write', 'The word, in a title, a note, a tag or a status'],
        ['#writing  @done', 'That tag — and anything nested under it — or that status'],
        ['-#backlog  -word', 'Everything except those (! works too)'],
        ['“first draft”', 'The phrase, exactly'],
        ['a b', 'Both: terms are ANDed unless you say otherwise'],
        ['a OR b', 'Either. OR, AND and NOT only count in capitals (| and & also work)'],
        ['(a OR b) AND -c', 'Brackets group, as deep as you like'],
        ['@none  #none', 'No status at all / no tags at all'],
      ],
    },
    {
      title: 'Views and templates',
      rows: [
        ['Sidebar ⌖ / top bar', 'Save the current search, filters and zoom as a view'],
        ['Click a view', 'Apply it; click it again to go back to everything'],
        ['Item menu → template', 'Save an item and its sub-items as a template'],
        ['{name} {date} {weekday}', 'Filled in when a template is used'],
        ['Ctrl+K', 'Open a view or drop in a template by name'],
      ],
    },
    {
      title: 'Navigating (not typing)',
      rows: [
        ['↑ ↓ or J K', 'Move the cursor'],
        ['← →', 'Collapse / expand'],
        ['Enter or E', 'Edit the row'],
        ['O / Shift+O', 'New item below / above'],
        ['Z / Shift+Z', 'Zoom in / out'],
        ['/ or Ctrl+F', 'Search'],
        ['Ctrl+K', 'Command palette'],
        ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
      ],
    },
    {
      title: 'Acting on the cursor or selection',
      rows: [
        ['Shift+↑ ↓, Shift+click', 'Select a range'],
        ['Space or X, Ctrl+click', 'Add / remove from selection'],
        ['Ctrl+A', 'Select everything shown'],
        ['1 … 9, 0', 'Set status / clear'],
        ['S  T  M', 'Status, tags, move to…'],
        ['H / Shift+H', 'Hide / show hidden items'],
        ['A', 'Archive (restore in the archive)'],
        ['Shift+D', 'Hide / show done items'],
        ['Shift+N', 'Edit note'],
        ['Ctrl+D', 'Duplicate'],
        ['Delete', 'Delete (undo is right there)'],
        ['Esc', 'Clear selection → cursor → filters → zoom'],
      ],
    },
    {
      title: 'Mouse and touch',
      rows: [
        ['Drag the status icon', 'Move; sideways changes nesting'],
        ['Alt+click status', 'Toggle done'],
        ['Alt+click ›', 'Expand / collapse the whole branch'],
        ['Right-click', 'Actions menu'],
        ['Long-press (phone)', 'Start selecting; drag ≡ to move'],
        ['Swipe right / left (phone)', 'Done / archive'],
      ],
    },
  ];
</script>

<div class="scrim" transition:fade={{ duration: 120 }} onpointerdown={() => (ui.shortcuts = false)} aria-hidden="true"></div>
<div class="dialog glass scroll-thin" role="dialog" aria-label="Keyboard shortcuts" transition:scale={{ start: 0.97, duration: 140 }}>
  <header>
    <UiIcon name="keyboard" size={20} />
    <h2>Shortcuts</h2>
    <button class="icon-btn" aria-label="Close" onclick={() => (ui.shortcuts = false)}><UiIcon name="x" /></button>
  </header>
  <div class="cols">
    {#each groups as g (g.title)}
      <section>
        <h3>{g.title}</h3>
        {#each g.rows as [k, what] (k)}
          <div class="r"><kbd>{k}</kbd><span>{what}</span></div>
        {/each}
      </section>
    {/each}
  </div>
</div>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (ui.shortcuts = false)} />

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgb(0 0 0 / 0.3);
  }

  .dialog {
    position: fixed;
    inset: max(4vh, 12px) max(4vw, 12px);
    z-index: 81;
    margin: auto;
    max-width: 980px;
    max-height: 88dvh;
    overflow-y: auto;
    padding: 18px 22px 24px;
    border-radius: calc(var(--radius) + 6px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
  }

  :global(:root[data-glass='on']) .dialog {
    background: color-mix(in oklch, var(--surface) 92%, transparent);
  }

  header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  h2 {
    margin: 0;
    font-size: 1.15em;
    flex: 1;
  }

  .cols {
    columns: 2 380px;
    column-gap: 36px;
  }

  section {
    break-inside: avoid;
    margin-bottom: 18px;
  }

  h3 {
    margin: 10px 0 6px;
    font-size: 0.78em;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
  }

  .r {
    display: grid;
    grid-template-columns: minmax(130px, auto) 1fr;
    gap: 12px;
    padding: 4px 0;
    font-size: 0.9em;
    align-items: baseline;
    border-bottom: 1px dashed var(--border);
  }

  .r kbd {
    justify-self: start;
  }

  .r span {
    color: var(--text-2);
  }
</style>
