<script lang="ts">
  import { db } from '../lib/model.svelte';
  import { ui } from '../lib/ui.svelte';
  let { ids }: { ids: string[] } = $props();
  function localInput(date: Date) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }
  let due = $state(localInput(new Date(Date.now() + 60 * 60_000)));
  let busy = $state(false);
  let error = $state('');
  function later(minutes: number) { due = localInput(new Date(Date.now() + minutes * 60_000)); }
  async function send(event: SubmitEvent) {
    event.preventDefault();
    const time = new Date(due);
    if (!Number.isFinite(time.getTime()) || time.getTime() <= Date.now()) { error = 'Choose a time in the future.'; return; }
    busy = true; error = '';
    try {
      const response = await fetch('/api/dun/reminders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ itemId: ids[0], dueAt: time.toISOString(), url: `${location.origin}/#/item/${encodeURIComponent(ids[0])}` }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not send to Dun.');
      ui.closePopover(); ui.toast(result.created ? 'Reminder added to Dun' : 'This reminder is already in Dun');
    } catch (e) { error = e instanceof Error ? e.message : 'Could not send to Dun. Try again.'; }
    finally { busy = false; }
  }
</script>

<form class="reminder" onsubmit={send}>
  <p>Remind me about “{db.items[ids[0]]?.title || 'this item'}”.</p>
  <label>When <input class="field" type="datetime-local" bind:value={due} required disabled={busy} /></label>
  <div class="choices">
    <button class="btn" type="button" disabled={busy} onclick={() => later(15)}>15 min</button>
    <button class="btn" type="button" disabled={busy} onclick={() => later(60)}>1 hour</button>
    <button class="btn" type="button" disabled={busy} onclick={() => later(24 * 60)}>Tomorrow</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <button class="btn primary" disabled={busy || !due}>{busy ? 'Sending…' : 'Add reminder to Dun'}</button>
  <p class="hint">Dun handles the alert and snoozing. This reminder stays independent of the Arbor item's status.</p>
</form>

<style>
  .reminder { display: grid; gap: 12px; padding: 6px; }
  p { margin: 0; font-size: 0.85em; line-height: 1.5; }
  label { display: grid; gap: 6px; font-size: 0.85em; }
  .choices { display: flex; flex-wrap: wrap; gap: 6px; }
  .hint { color: var(--text-3); }
  .error { color: var(--accent); }
</style>
