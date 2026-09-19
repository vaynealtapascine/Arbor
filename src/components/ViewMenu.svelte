<script lang="ts">
  import { db, model } from '../lib/model.svelte';
  import { settings, type Appearance } from '../lib/settings.svelte';
  import { ui } from '../lib/ui.svelte';
  import UiIcon from './UiIcon.svelte';

  const a = $derived(settings.appearance);

  function set<K extends keyof Appearance>(k: K, v: Appearance[K]) {
    settings.setAppearance({ [k]: v } as Partial<Appearance>);
  }

  function expandAll(open: boolean) {
    for (const it of Object.values(db.items)) if ((model.children.get(it.id) ?? []).length) ui.setOpen(it.id, open);
    ui.closePopover();
  }

  function notesAll(open: boolean) {
    for (const it of Object.values(db.items)) if (it.note.trim()) ui.toggleNote(it.id, open);
    ui.closePopover();
  }
</script>

<div class="menu">
  <button class="menu-item" onclick={() => { ui.showHidden = !ui.showHidden; ui.persist(); }}>
    <UiIcon name={ui.showHidden ? 'eye' : 'eye-off'} size={17} /> Show hidden items
    <span class="hint"><span class="switch" role="switch" aria-checked={ui.showHidden}></span></span>
  </button>
  <button class="menu-item" onclick={() => { ui.hideDone = !ui.hideDone; ui.persist(); }}>
    <UiIcon name="circle-check" size={17} /> Hide done items
    <span class="hint"><span class="switch" role="switch" aria-checked={ui.hideDone}></span></span>
  </button>
  <div class="menu-sep"></div>
  <div class="row">
    <span>Density</span>
    <div class="segmented">
      {#each ['compact', 'cozy', 'roomy'] as const as d (d)}
        <button aria-pressed={a.density === d} onclick={() => set('density', d)}>{d[0].toUpperCase() + d.slice(1)}</button>
      {/each}
    </div>
  </div>
  <div class="row">
    <span>Status</span>
    <div class="segmented">
      <button aria-pressed={a.statusStyle === 'icon'} onclick={() => set('statusStyle', 'icon')}>Icon</button>
      <button aria-pressed={a.statusStyle === 'pill'} onclick={() => set('statusStyle', 'pill')}>Icon + name</button>
    </div>
  </div>
  <div class="row">
    <span>Tags</span>
    <div class="segmented">
      {#each ['chip', 'outline', 'dot', 'text'] as const as t (t)}
        <button aria-pressed={a.tagStyle === t} onclick={() => set('tagStyle', t)}>{t[0].toUpperCase() + t.slice(1)}</button>
      {/each}
    </div>
  </div>
  <div class="row">
    <span>Progress</span>
    <div class="segmented">
      {#each ['off', 'count', 'ring', 'bar'] as const as p (p)}
        <button aria-pressed={a.progress === p} onclick={() => set('progress', p)}>{p[0].toUpperCase() + p.slice(1)}</button>
      {/each}
    </div>
  </div>
  <button class="menu-item" onclick={() => set('notePreview', !a.notePreview)}>
    <UiIcon name="notes" size={17} /> Note preview line
    <span class="hint"><span class="switch" role="switch" aria-checked={a.notePreview}></span></span>
  </button>
  <button class="menu-item" onclick={() => set('guides', !a.guides)}>
    <UiIcon name="list-tree" size={17} /> Indent guides
    <span class="hint"><span class="switch" role="switch" aria-checked={a.guides}></span></span>
  </button>
  <div class="menu-sep"></div>
  <button class="menu-item" onclick={() => expandAll(true)}><UiIcon name="chevrons-down" size={17} /> Expand all</button>
  <button class="menu-item" onclick={() => expandAll(false)}><UiIcon name="chevrons-up" size={17} /> Collapse all</button>
  <button class="menu-item" onclick={() => notesAll(true)}><UiIcon name="notes" size={17} /> Open all notes</button>
  <button class="menu-item" onclick={() => notesAll(false)}><UiIcon name="note" size={17} /> Close all notes</button>
  <div class="menu-sep"></div>
  <button class="menu-item" onclick={() => { ui.closePopover(); ui.settingsOpen = 'appearance'; }}>
    <UiIcon name="palette" size={17} /> More appearance settings…
  </button>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 6px 4px 10px;
    font-size: 0.9em;
    color: var(--text-2);
  }

  .row .segmented button {
    padding: 0 7px;
    font-size: 0.82em;
  }
</style>
