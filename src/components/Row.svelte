<script lang="ts">
  import { deleteItems, setArchived, setHidden, toggleDone } from '../lib/actions.svelte';
  import { dnd } from '../lib/dnd.svelte';
  import { db, model } from '../lib/model.svelte';
  import { settings } from '../lib/settings.svelte';
  import { notePreview, segments } from '../lib/text';
  import { ui } from '../lib/ui.svelte';
  import { view, type Row } from '../lib/view.svelte';
  import { relativeTime } from '../lib/util';
  import NoteEditor from './NoteEditor.svelte';
  import StatusIcon from './StatusIcon.svelte';
  import TagChip from './TagChip.svelte';
  import TitleEditor from './TitleEditor.svelte';
  import UiIcon from './UiIcon.svelte';

  let { row }: { row: Row } = $props();

  const item = $derived(db.items[row.id]);
  const status = $derived(item?.status ? db.statuses[item.status] : null);
  const tags = $derived(item ? item.tags.map((t) => db.tags[t]).filter(Boolean) : []);
  const a = $derived(settings.appearance);
  const editingTitle = $derived(ui.editing?.id === row.id && ui.editing.field === 'title');
  const editingNote = $derived(ui.editing?.id === row.id && ui.editing.field === 'note');
  const noteOpen = $derived(ui.notesOpen.has(row.id) || editingNote);
  const selected = $derived(ui.selection.has(row.id));
  const isCursor = $derived(ui.cursor === row.id && !ui.editing);
  const done = $derived(item ? model.isDone(item) : false);
  const open = $derived(ui.isOpen(row.id));
  const archive = $derived(ui.view === 'archive');
  const dragged = $derived(dnd.active && dnd.ids.includes(row.id));
  const segs = $derived(item ? segments(item.title, ui.search) : []);
  const preview = $derived(a.notePreview && item?.note && !noteOpen ? notePreview(item.note) : '');
  const pct = $derived(row.kids ? row.doneKids / row.kids : 0);

  let titleEl: HTMLElement | undefined = $state();
  let rowEl: HTMLElement | undefined = $state();
  let swipeX = $state(0);
  let swiping = $state(false);

  // ------------------------------------------------------------ selection & editing

  function select(e: MouseEvent | null, mode: 'toggle' | 'range' | 'only') {
    const id = row.id;
    if (mode === 'range' && ui.anchor && view.index.has(ui.anchor)) {
      const [from, to] = [view.index.get(ui.anchor)!, view.index.get(id)!].sort((x, y) => x - y);
      for (let i = from; i <= to; i++) ui.selection.add(view.rows[i].id);
    } else if (mode === 'toggle') {
      if (ui.selection.has(id)) ui.selection.delete(id);
      else ui.selection.add(id);
      ui.anchor = id;
    } else {
      ui.selection.clear();
      ui.selection.add(id);
      ui.anchor = id;
    }
    ui.cursor = id;
    ui.stopEditing();
    if (ui.coarse && ui.selection.size) ui.selecting = true;
    if (!ui.selection.size) ui.selecting = false;
    e?.preventDefault();
  }

  /** Character offset of a click inside the rendered title. */
  function caretFromPoint(e: MouseEvent): number | 'end' {
    if (!titleEl) return 'end';
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };
    let node: Node | null = null;
    let offset = 0;
    if (doc.caretPositionFromPoint) {
      const p = doc.caretPositionFromPoint(e.clientX, e.clientY);
      node = p?.offsetNode ?? null;
      offset = p?.offset ?? 0;
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(e.clientX, e.clientY);
      node = r?.startContainer ?? null;
      offset = r?.startOffset ?? 0;
    }
    const seg = node?.parentElement?.closest<HTMLElement>('[data-o]');
    if (!seg || !titleEl.contains(seg)) return 'end';
    const start = Number(seg.dataset.o);
    if (seg.dataset.link) return start + Number(seg.dataset.len);
    return start + offset;
  }

  function onTitleClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('a')) return;
    if (e.shiftKey) return select(e, 'range');
    if (e.ctrlKey || e.metaKey) return select(e, 'toggle');
    if (ui.selecting) return select(e, 'toggle');
    if (getSelection()?.toString()) return;
    ui.selection.clear();
    ui.edit(row.id, caretFromPoint(e));
  }

  function onRowClick(e: MouseEvent) {
    // Clicks on the row's empty area (not title/buttons).
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('body')) return;
    if (e.shiftKey) return select(e, 'range');
    if (e.ctrlKey || e.metaKey || ui.selecting) return select(e, 'toggle');
    ui.selection.clear();
    ui.edit(row.id, 'end');
  }

  // ------------------------------------------------------------ status button (click = pick, drag = move)

  function onStatusPointerDown(e: PointerEvent) {
    if (archive || e.pointerType !== 'mouse') return;
    dnd.arm(e, row.id);
  }

  function onStatusClick(e: MouseEvent) {
    if (e.altKey) return toggleDone([row.id]);
    const ids = ui.selection.has(row.id) ? [...ui.selection] : [row.id];
    ui.open({ kind: 'status', anchor: e.currentTarget as HTMLElement, ids });
  }

  function onGripPointerDown(e: PointerEvent) {
    e.preventDefault();
    dnd.arm(e, row.id);
  }

  // ------------------------------------------------------------ touch: long-press to select, swipe to act

  let press: {
    x: number;
    y: number;
    t: ReturnType<typeof setTimeout>;
    id: number;
    horizontal: boolean | null;
    long: boolean;
  } | null = null;

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' || editingTitle || editingNote) return;
    if ((e.target as HTMLElement).closest('button, a, input, textarea, .grip')) return;
    const t = setTimeout(() => {
      if (!press || press.horizontal) return;
      press.long = true;
      navigator.vibrate?.(12);
      ui.selecting = true;
      select(null, 'toggle');
    }, 430);
    press = { x: e.clientX, y: e.clientY, t, id: e.pointerId, horizontal: null, long: false };
  }

  function onPointerMove(e: PointerEvent) {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (press.long) return;
    if (press.horizontal === null && Math.hypot(dx, dy) > 8) {
      press.horizontal = Math.abs(dx) > Math.abs(dy) * 1.3 && settings.behavior.swipe && !ui.selecting && !archive;
      clearTimeout(press.t);
      if (!press.horizontal) {
        press = null;
        return;
      }
      swiping = true;
      try {
        rowEl?.setPointerCapture(e.pointerId);
      } catch {
        // Not a live pointer (synthetic events); the swipe still works without capture.
      }
    }
    if (press.horizontal) {
      e.preventDefault();
      swipeX = Math.max(-140, Math.min(140, dx));
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!press || e.pointerId !== press.id) return;
    clearTimeout(press.t);
    // The tap that ends a long-press or swipe must not also count as a click.
    if (press.long) suppressClick();
    if (press.horizontal) {
      suppressClick();
      if (swipeX > 80) toggleDone([row.id]);
      else if (swipeX < -80) setArchived([row.id], true);
    }
    press = null;
    swipeX = 0;
    swiping = false;
  }

  function suppressClick() {
    const stop = (c: Event) => {
      c.stopPropagation();
      c.preventDefault();
    };
    addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', stop, { capture: true }), 300);
  }

  function openMenu(e: MouseEvent) {
    e.stopPropagation();
    const ids = ui.selection.has(row.id) ? [...ui.selection] : [row.id];
    ui.open({ kind: 'item', anchor: e.currentTarget as HTMLElement, ids });
  }

  function oncontextmenu(e: MouseEvent) {
    // Touch long-press is ours (selection), not the browser's menu.
    if (ui.coarse) return e.preventDefault();
    e.preventDefault();
    if (!ui.selection.has(row.id)) {
      ui.selection.clear();
      ui.cursor = row.id;
    }
    const ids = ui.selection.has(row.id) ? [...ui.selection] : [row.id];
    ui.open({ kind: 'item', anchor: new DOMRect(e.clientX, e.clientY, 0, 0), ids });
  }
</script>

{#if item}
  <div
    bind:this={rowEl}
    class="row"
    class:selected
    class:cursor={isCursor}
    class:done
    class:hidden={item.hidden}
    class:context={row.context}
    class:editing={editingTitle || editingNote}
    class:fresh={ui.fresh.has(row.id)}
    class:dragged
    class:swiping
    data-row-id={row.id}
    style:--depth={row.depth}
    role="treeitem"
    aria-level={row.depth + 1}
    aria-selected={selected}
    aria-expanded={row.kids ? open : undefined}
    tabindex="-1"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    {oncontextmenu}
  >
    {#if swiping}
      <div class="swipe-bg" class:right={swipeX > 0} class:armed={Math.abs(swipeX) > 80}>
        {#if swipeX > 0}<UiIcon name="check" size={20} /> <span>{done ? 'Not done' : 'Done'}</span>
        {:else}<span>Archive</span> <UiIcon name="archive" size={20} />{/if}
      </div>
    {/if}

    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="inner" style:transform={swipeX ? `translateX(${swipeX}px)` : undefined} onclick={onRowClick}>
      {#if row.kids}
        <button
          class="twisty"
          class:open
          aria-label={open ? 'Collapse' : 'Expand'}
          onclick={(e) => {
            e.stopPropagation();
            if (e.altKey) {
              for (const id of model.subtree(row.id)) ui.setOpen(id, !open);
            } else ui.setOpen(row.id);
          }}
        >
          <UiIcon name="chevron-right" size={14} stroke={2.4} />
        </button>
      {/if}

      <button
        class="status"
        class:collapsed={row.kids > 0 && !open}
        class:pill={a.statusStyle === 'pill' && status}
        style:--c={status?.color ?? 'var(--text-3)'}
        aria-label="Status: {status?.name ?? 'none'}"
        title={status?.name ?? 'No status'}
        onpointerdown={onStatusPointerDown}
        onclick={(e) => {
          e.stopPropagation();
          onStatusClick(e);
        }}
      >
        {#if status || a.bullets}<StatusIcon {status} size={18} />{/if}
        {#if a.statusStyle === 'pill' && status}<span class="pill-label ink">{status.name}</span>{/if}
      </button>

      <div class="body">
        <div class="line">
          <div class="title-wrap">
            {#if editingTitle}
              <TitleEditor id={row.id} />
            {:else}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <span class="title" class:empty={!item.title} bind:this={titleEl} onclick={onTitleClick}>
                {#if item.title}
                  {#each segs as s, i (i)}
                    {@const o = segs.slice(0, i).reduce((n, x) => n + (x.href ? x.href.length : x.text.length), 0)}
                    {#if s.href}<a href={s.href} target="_blank" rel="noopener noreferrer" data-o={o} data-link="1"
                        data-len={s.href.length}>{s.text}</a
                      >{:else if s.mark}<mark data-o={o}>{s.text}</mark>{:else}<span data-o={o}>{s.text}</span>{/if}
                  {/each}
                {:else}Untitled{/if}
              </span>
            {/if}
          </div>

          {#if tags.length || (item.note && !noteOpen) || (row.kids && a.progress !== 'off') || item.hidden}
            <div class="meta">
              {#if item.hidden}
                <span class="badge" title="Hidden"><UiIcon name="eye-off" size={14} /></span>
              {/if}
              {#each tags as tag (tag.id)}
                <TagChip
                  {tag}
                  showIcon={a.tagIcons}
                  onclick={(e) => {
                    e.stopPropagation();
                    if (ui.filterTags.has(tag.id)) ui.filterTags.delete(tag.id);
                    else ui.filterTags.add(tag.id);
                  }}
                />
              {/each}
              {#if item.note && !noteOpen}
                <button
                  class="badge note-badge"
                  aria-label="Show note"
                  title="Show note"
                  onclick={(e) => {
                    e.stopPropagation();
                    ui.toggleNote(row.id, true);
                  }}><UiIcon name="notes" size={15} /></button
                >
              {/if}
              {#if row.kids && a.progress !== 'off'}
                <span class="progress" title="{row.doneKids} of {row.kids} done">
                  {#if a.progress === 'ring'}
                    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="8" cy="8" r="6" class="track" />
                      <circle cx="8" cy="8" r="6" class="fill" style:stroke-dasharray="{pct * 37.7} 37.7" />
                    </svg>
                  {:else if a.progress === 'bar'}
                    <span class="bar"><span style:width="{pct * 100}%"></span></span>
                  {/if}
                  <span class="count">{row.doneKids}/{row.kids}</span>
                </span>
              {/if}
            </div>
          {/if}
        </div>

        {#if preview}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="preview" onclick={(e) => { e.stopPropagation(); ui.toggleNote(row.id, true); }}>{preview}</div>
        {/if}
        {#if noteOpen}
          <NoteEditor id={row.id} />
        {/if}
        {#if archive && row.depth === 0 && item.archivedAt}
          <div class="archived-meta">
            Archived {relativeTime(item.archivedAt)}
            {#if model.pathOf(row.id).length}· from {model.pathOf(row.id).map((p) => p.title || 'Untitled').join(' › ')}{/if}
          </div>
        {/if}
      </div>

      <div class="actions">
        {#if archive}
          <button class="icon-btn sm" title="Restore" aria-label="Restore" onclick={(e) => { e.stopPropagation(); setArchived([row.id], false); }}>
            <UiIcon name="archive-off" size={16} />
          </button>
          <button class="icon-btn sm" title="Delete" aria-label="Delete" onclick={(e) => { e.stopPropagation(); deleteItems([row.id]); }}>
            <UiIcon name="trash" size={16} />
          </button>
        {:else if !ui.coarse}
          <button class="icon-btn sm" title="Note (Shift+Enter)" aria-label="Note"
            onclick={(e) => { e.stopPropagation(); if (noteOpen) ui.toggleNote(row.id, false); else { ui.toggleNote(row.id, true); ui.edit(row.id, 'end', 'note'); } }}>
            <UiIcon name="note" size={16} />
          </button>
          <button class="icon-btn sm" title={item.hidden ? 'Unhide' : 'Hide'} aria-label={item.hidden ? 'Unhide' : 'Hide'}
            onclick={(e) => { e.stopPropagation(); setHidden([row.id], !item.hidden); }}>
            <UiIcon name={item.hidden ? 'eye' : 'eye-off'} size={16} />
          </button>
          <button class="icon-btn sm" title="Archive" aria-label="Archive" onclick={(e) => { e.stopPropagation(); setArchived([row.id], true); }}>
            <UiIcon name="archive" size={16} />
          </button>
        {/if}
        <button class="icon-btn sm more" title="More" aria-label="More actions" onclick={openMenu}>
          <UiIcon name="dots" size={16} />
        </button>
      </div>

      {#if ui.selecting && !archive}
        <span class="grip" onpointerdown={onGripPointerDown} role="presentation" aria-hidden="true">
          <UiIcon name="grip-vertical" size={18} />
        </span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .row {
    position: relative;
    border-radius: calc(var(--radius) * 0.65);
    outline: none;
    touch-action: pan-y;
  }

  /* Long-press selects rows, so it must not select text or open the callout. */
  @media (pointer: coarse) {
    .row:not(.editing) {
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
  }

  .inner {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-height: calc(1.45em + var(--row-py) * 2 + 4px);
    padding: var(--row-py) 8px var(--row-py) calc(var(--gutter) + var(--depth) * var(--indent));
    border-radius: inherit;
    background: transparent;
    transition: background 0.12s;
  }

  .swiping .inner {
    background: var(--surface);
    transition: none;
  }

  .row:not(.swiping) .inner {
    transition: background 0.12s, transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }

  /* Indent guides: one line per ancestor level, under the ancestor's status icon. */
  :global(:root[data-guides='on']) .inner::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--gutter) + 11px);
    width: calc(var(--depth) * var(--indent));
    background: repeating-linear-gradient(
      to right,
      var(--guide, color-mix(in oklch, var(--text) 11%, transparent)) 0 1px,
      transparent 1px var(--indent)
    );
    pointer-events: none;
  }

  @media (hover: hover) {
    .row:hover .inner {
      background: var(--hover);
    }
  }

  .row.selected .inner {
    background: var(--accent-soft);
  }

  .row.selected .inner::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 3px;
    background: var(--accent);
  }

  .row.cursor .inner {
    box-shadow: inset 0 0 0 1.5px var(--accent-line);
  }

  .row.editing .inner {
    background: color-mix(in oklch, var(--accent) 5%, transparent);
  }

  .row.fresh .inner {
    animation: fresh 0.9s ease-out;
  }

  @keyframes fresh {
    from {
      background: color-mix(in oklch, var(--accent) 22%, transparent);
    }
  }

  .row.context .title,
  .row.context .status {
    opacity: 0.55;
  }

  .row.hidden .body {
    opacity: 0.55;
  }

  .row.dragged {
    opacity: 0.35;
  }

  /* Done styles */
  :global(:root:is([data-done='strike'], [data-done='both'])) .row.done .title {
    text-decoration: line-through;
    text-decoration-color: color-mix(in oklch, var(--text) 35%, transparent);
    text-decoration-thickness: 1.5px;
  }

  :global(:root:is([data-done='dim'], [data-done='both'])) .row.done .title {
    color: var(--text-3);
  }

  /* Twisty sits in the gutter left of the status icon. */
  .twisty {
    position: absolute;
    left: calc(var(--gutter) + var(--depth) * var(--indent) - 21px);
    top: calc(var(--row-py) + 0.725em - 9px);
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    color: var(--text-3);
    opacity: 0;
    transition: opacity 0.12s, transform 0.18s, background 0.12s;
  }

  .twisty :global(svg) {
    transition: transform 0.18s cubic-bezier(0.3, 1.2, 0.5, 1);
  }

  .twisty.open :global(svg) {
    transform: rotate(90deg);
  }

  .twisty:hover {
    background: var(--hover);
    color: var(--text);
  }

  .row:hover .twisty,
  .twisty:not(.open),
  .twisty:focus-visible {
    opacity: 1;
  }

  @media (hover: none) {
    .twisty {
      opacity: 0.85;
    }
  }

  .status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    flex: none;
    min-width: 22px;
    height: 1.45em;
    margin-top: 2px;
    border-radius: 7px;
    color: var(--c);
    position: relative;
    touch-action: none;
    transition: transform 0.12s, background 0.12s;
  }

  .status:hover {
    background: var(--hover);
  }

  .status:active {
    transform: scale(0.9);
  }

  .status.collapsed::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 22px;
    height: 22px;
    translate: -50% -50%;
    border-radius: 50%;
    background: color-mix(in oklch, var(--text) 10%, transparent);
    z-index: -1;
  }

  .status.pill {
    padding: 0 8px 0 5px;
    background: color-mix(in oklch, var(--c) var(--chip-mix), transparent);
  }

  .pill-label {
    font-size: 0.78em;
    font-weight: 600;
    white-space: nowrap;
  }

  .body {
    flex: 1;
    min-width: 0;
    padding-top: 2px;
    padding-bottom: 2px;
  }

  .line {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 2px 10px;
  }

  .title-wrap {
    flex: 1 1 12em;
    min-width: 0;
  }

  .title {
    display: block;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    cursor: text;
    min-height: 1lh;
  }

  .title.empty {
    color: var(--text-3);
  }

  .title a {
    word-break: break-all;
  }

  .meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    margin-left: auto;
    min-height: 1.45em;
  }

  .badge {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 21px;
    border-radius: 6px;
    color: var(--text-3);
  }

  .note-badge:hover {
    background: var(--hover);
    color: var(--text);
  }

  .progress {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.76em;
    font-variant-numeric: tabular-nums;
    color: var(--text-3);
    padding: 0 2px;
  }

  .progress circle {
    fill: none;
    stroke-width: 2.2;
  }

  .progress .track {
    stroke: color-mix(in oklch, var(--text) 13%, transparent);
  }

  .progress .fill {
    stroke: var(--accent);
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: center;
    transition: stroke-dasharray 0.4s;
  }

  .bar {
    width: 34px;
    height: 5px;
    border-radius: 3px;
    background: color-mix(in oklch, var(--text) 12%, transparent);
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: inherit;
    transition: width 0.4s;
  }

  .preview {
    margin-top: 1px;
    font-size: 0.86em;
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }

  .archived-meta {
    font-size: 0.8em;
    color: var(--text-3);
    margin-top: 2px;
  }

  .actions {
    display: flex;
    gap: 1px;
    flex: none;
    align-self: flex-start;
    opacity: 0;
    transition: opacity 0.12s;
  }

  .icon-btn.sm {
    width: 26px;
    height: 26px;
  }

  @media (hover: hover) {
    .row:hover .actions,
    .row.cursor .actions,
    .actions:focus-within {
      opacity: 1;
    }
  }

  @media (hover: none) {
    .actions {
      opacity: 1;
    }

    .actions .icon-btn.more {
      color: var(--text-3);
    }
  }

  .grip {
    display: grid;
    place-items: center;
    width: 30px;
    align-self: stretch;
    color: var(--text-3);
    touch-action: none;
    flex: none;
  }

  .swipe-bg {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 0 18px;
    border-radius: inherit;
    font-weight: 600;
    font-size: 0.9em;
    color: white;
    background: color-mix(in oklch, #f59e0b 60%, var(--surface));
    transition: background 0.15s;
  }

  .swipe-bg.right {
    justify-content: flex-start;
    background: color-mix(in oklch, #22c55e 60%, var(--surface));
  }

  .swipe-bg.armed {
    background: #f59e0b;
  }

  .swipe-bg.right.armed {
    background: #22c55e;
  }
</style>
