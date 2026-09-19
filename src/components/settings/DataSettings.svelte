<script lang="ts">
  import { exportData, importData } from '../../lib/actions.svelte';
  import { copyText, toMarkdown } from '../../lib/clipboard';
  import { downloadExport } from '../../lib/commands';
  import { addFromText } from '../../lib/entry';
  import { idbDelete } from '../../lib/idb';
  import { db, model } from '../../lib/model.svelte';
  import { ui } from '../../lib/ui.svelte';
  import { plural } from '../../lib/util';
  import UiIcon from '../UiIcon.svelte';

  let pending: ReturnType<typeof exportData> | null = $state(null);
  let fileInput: HTMLInputElement | undefined = $state();
  let health: { rev: number; kinds: Record<string, { live: number; deleted: number }> } | null = $state(null);

  $effect(() => {
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => (health = h))
      .catch(() => (health = null));
  });

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!file) return;
    const text = await file.text();
    if (/\.json$/i.test(file.name)) {
      try {
        const data = JSON.parse(text);
        if (data?.app !== 'arbor') throw new Error('not an Arbor export');
        pending = data;
      } catch (err) {
        ui.toast(`Couldn’t read that file: ${err instanceof Error ? err.message : err}`, undefined, 'error');
      }
    } else {
      const ids = addFromText(null, 'end', text);
      ui.toast(`Imported ${plural(ids.length, 'top-level item')} from ${file.name}`);
    }
  }

  function doImport(replace: boolean) {
    if (!pending) return;
    try {
      importData(pending, replace);
    } catch (err) {
      ui.toast(String(err), undefined, 'error');
    }
    pending = null;
  }

  async function copyAll() {
    const roots = (model.children.get(null) ?? []).filter((r) => !r.archived).map((r) => r.id);
    const ok = await copyText(toMarkdown(roots));
    ui.toast(ok ? 'Everything copied as Markdown' : 'Copy failed');
  }

  async function resetDevice() {
    ui.confirm = {
      text: 'Forget this device’s offline copy and download everything again from the server? Unsent changes are lost.',
      action: 'Reset',
      run: async () => {
        await idbDelete('replica');
        location.reload();
      },
    };
  }
</script>

<h3>Sync</h3>
<div class="card">
  <div class="kv"><span>Status</span><b>{db.state}{db.pendingCount ? ` · ${db.pendingCount} waiting to send` : ''}</b></div>
  {#if db.lastError}<div class="kv"><span>Last error</span><b class="err">{db.lastError}</b></div>{/if}
  {#if health}
    <div class="kv"><span>Server</span><b>revision {health.rev} · {health.kinds.item?.live ?? 0} items</b></div>
  {/if}
  <div class="kv"><span>This device</span><b>{Object.keys(db.items).length} items cached for offline use</b></div>
  <div class="btns">
    <button class="btn" onclick={() => db.reconnect()}><UiIcon name="refresh" size={15} /> Sync now</button>
    <button class="btn" onclick={resetDevice}><UiIcon name="database" size={15} /> Reset this device</button>
  </div>
</div>

<h3>Export</h3>
<div class="btns">
  <button class="btn" onclick={downloadExport}><UiIcon name="download" size={15} /> Download JSON backup</button>
  <button class="btn" onclick={copyAll}><UiIcon name="copy" size={15} /> Copy all as Markdown</button>
</div>
<p class="note">The server also keeps a daily copy of its database for 14 days (<code>data/backups</code>).</p>

<h3>Import</h3>
<p class="note">An Arbor JSON backup, or any Markdown / text outline (indented or bulleted lines become nested items).</p>
<input bind:this={fileInput} type="file" accept=".json,.md,.markdown,.txt,text/plain,application/json" hidden onchange={onFile} />
<button class="btn" onclick={() => fileInput?.click()}><UiIcon name="upload" size={15} /> Choose a file…</button>

{#if pending}
  <div class="card import">
    <p>
      <b>{plural(pending.items?.length ?? 0, 'item')}</b>, {plural(pending.statuses?.length ?? 0, 'status', 'statuses')} and
      {plural(pending.tags?.length ?? 0, 'tag')} from {pending.exported?.slice(0, 10) ?? 'an export'}.
    </p>
    <div class="btns">
      <button class="btn primary" onclick={() => doImport(false)}>Merge in</button>
      <button class="btn danger" onclick={() => doImport(true)}>Replace everything</button>
      <button class="btn ghost" onclick={() => (pending = null)}>Cancel</button>
    </div>
    <p class="note">Either way, Undo reverts the whole import.</p>
  </div>
{/if}

<style>
  h3 {
    margin: 20px 0 8px;
    font-size: 0.76em;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-3);
  }

  h3:first-child {
    margin-top: 0;
  }

  .card {
    padding: 12px 14px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface);
  }

  .kv {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
    font-size: 0.9em;
  }

  .kv span {
    color: var(--text-3);
  }

  .kv b {
    font-weight: 550;
    text-align: right;
  }

  .err {
    color: var(--danger);
  }

  .btns {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .note {
    font-size: 0.86em;
    color: var(--text-3);
    margin: 8px 0;
  }

  .import {
    margin-top: 12px;
  }

  .import p {
    margin: 0 0 4px;
  }

  code {
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-size: 0.9em;
  }
</style>
