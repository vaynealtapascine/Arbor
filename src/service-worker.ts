/// <reference lib="webworker" />
/**
 * Lets Arbor open without a connection. Built by plugins/service-worker.ts,
 * which replaces the two constants below with the build's file list and a
 * version hash. The API is never cached here — the app keeps its own offline
 * copy of the data in IndexedDB and queues writes until the server is back.
 */
declare const __PRECACHE_MANIFEST__: string[];
declare const __CACHE_VERSION__: string;

const sw = self as unknown as ServiceWorkerGlobalScope;
const PREFIX = 'arbor-app-';
const CACHE = `${PREFIX}${__CACHE_VERSION__}`;
const SHELL = new URL('/index.html', sw.location.href).href;
const NAVIGATION_TIMEOUT_MS = 3500;

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(__PRECACHE_MANIFEST__.map((path) => new URL(path, sw.location.href).href));
      await sw.skipWaiting();
    })(),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep the previous version too: an open page may still lazy-load files from its build.
      const ours = (await caches.keys()).filter((key) => key.startsWith(PREFIX) && key !== CACHE).sort();
      await Promise.all(ours.slice(0, -1).map((key) => caches.delete(key)));
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') event.respondWith(networkFirst(request));
  else event.respondWith(cacheFirst(request));
});

/** Pages: fresh from the network when possible, the cached shell when offline. */
async function networkFirst(request: Request): Promise<Response> {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS)),
    ]);
    if (response.ok) return response;
    return (await caches.match(SHELL)) ?? response;
  } catch {
    const cached = await caches.match(SHELL);
    if (cached) return cached;
    return new Response('Arbor is offline and hasn’t been cached yet.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}

/** Fingerprinted assets never change, so a cached copy is always correct. */
async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
