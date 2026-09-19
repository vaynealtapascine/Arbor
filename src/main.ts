import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '@fontsource-variable/nunito';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/jetbrains-mono';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

// Dev-only handle for poking at state from the console.
if (import.meta.env.DEV) {
  Promise.all([import('./lib/model.svelte'), import('./lib/ui.svelte'), import('./lib/actions.svelte'), import('./lib/view.svelte')]).then(
    ([m, u, a, v]) => Object.assign(window, { arbor: { db: m.db, model: m.model, ui: u.ui, actions: a, view: v.view } }),
  );
}

// Offline support needs a secure context (https or localhost); plain http over the tailnet just skips it.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
