<script lang="ts">
  import { settings } from '../../lib/settings.svelte';
  import { debounce } from '../../lib/util';

  let text = $state(settings.appearance.customCss);
  const save = debounce((v: string) => settings.setAppearance({ customCss: v }), 400);

  const examples = [
    ['Bigger top-level items', '.row[aria-level="1"] .title { font-weight: 650; font-size: 1.05em; }'],
    ['Accent-coloured guides', ':root { --guide: color-mix(in oklch, var(--accent) 35%, transparent); }'],
    ['Square status icons', '.row .status { border-radius: 3px; }'],
    ['Wider gutters', '.sheet { padding-inline: 40px; }'],
  ];
</script>

<p class="intro">
  Anything the switches can’t do. Applied live, synced with the rest of the appearance. Handy variables:
  <code>--accent</code> <code>--bg</code> <code>--surface</code> <code>--text</code> <code>--radius</code>
  <code>--indent</code> <code>--h</code> (tint hue).
</p>
<textarea
  class="field code"
  rows="12"
  spellcheck="false"
  placeholder={'/* e.g. */\n.row .title { letter-spacing: 0.01em; }'}
  bind:value={text}
  oninput={() => save(text)}
></textarea>

<h3>Snippets</h3>
{#each examples as [name, css] (name)}
  <button class="snippet" onclick={() => { text = `${text.trim()}\n${css}\n`.trimStart(); save.flush(text); }}>
    <b>{name}</b>
    <code>{css}</code>
  </button>
{/each}

<style>
  .intro {
    margin: 0 0 12px;
    color: var(--text-2);
    font-size: 0.9em;
    line-height: 1.7;
  }

  .intro code,
  .snippet code {
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-size: 0.85em;
    padding: 1px 5px;
    border-radius: 5px;
    background: var(--bg-2);
  }

  .code {
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-size: 0.85em;
    tab-size: 2;
  }

  h3 {
    margin: 20px 0 8px;
    font-size: 0.76em;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-3);
  }

  .snippet {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    padding: 8px 10px;
    margin-bottom: 6px;
    border-radius: calc(var(--radius) * 0.7);
    border: 1px solid var(--border);
    background: var(--surface);
    text-align: left;
    font-size: 0.9em;
  }

  .snippet:hover {
    border-color: var(--border-2);
  }

  .snippet code {
    background: none;
    padding: 0;
    color: var(--text-2);
    white-space: pre-wrap;
  }
</style>
