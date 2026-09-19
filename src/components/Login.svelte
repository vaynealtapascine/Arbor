<script lang="ts">
  import { autofocus } from '../lib/autofocus';
  import { db } from '../lib/model.svelte';
  import Logo from './Logo.svelte';

  let code = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await db.login(code);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not sign in';
    } finally {
      busy = false;
    }
  }
</script>

<div class="wrap">
  <form class="card glass" onsubmit={submit}>
    <Logo size={52} />
    <h1>Arbor</h1>
    <p>Enter the passcode for this server. This device will remember it.</p>
    <input class="field" type="password" bind:value={code} placeholder="Passcode" autocomplete="current-password"
      aria-label="Passcode" use:autofocus={true} />
    {#if error}<div class="err">{error}</div>{/if}
    <button class="btn primary" disabled={busy || !code}>{busy ? 'Checking…' : 'Unlock'}</button>
  </form>
</div>

<style>
  .wrap {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 20px;
  }

  .card {
    width: min(360px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 30px 26px;
    border-radius: calc(var(--radius) + 8px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-lg);
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 1.4em;
  }

  p {
    margin: 0 0 6px;
    color: var(--text-2);
    font-size: 0.92em;
  }

  .field {
    height: 42px;
    text-align: center;
    font-size: 16px;
  }

  .btn {
    width: 100%;
    height: 40px;
  }

  .err {
    color: var(--danger);
    font-size: 0.9em;
  }
</style>
