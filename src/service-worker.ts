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

// ---------------------------------------------------------------- background sync
//
// Edits made offline sit in IndexedDB. The page sends them as soon as it can,
// but the phone often regains signal with Arbor closed — so the browser wakes
// this worker up to send them for us. Throwing keeps the request queued for a
// later retry.

const SYNC_TAG = 'arbor-sync';

interface SyncLike extends ExtendableEvent {
  tag?: string;
}

(sw as unknown as EventTarget).addEventListener('sync', (event) => {
  const e = event as SyncLike;
  if (e.tag === SYNC_TAG) e.waitUntil(sendQueued());
});

// Browsers without Background Sync (and the app itself) can ask directly.
sw.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'arbor-flush') {
    event.waitUntil(sendQueued().catch(() => {}));
  }
});

interface Snapshot {
  rev: number;
  pending: unknown[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('arbor', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => req.transaction?.abort(); // the page owns the schema
  });
}

function readSnapshot(db: IDBDatabase): Promise<Snapshot | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv').objectStore('kv').get('replica');
    req.onsuccess = () => resolve(req.result as Snapshot | undefined);
    req.onerror = () => reject(req.error);
  });
}

function writeSnapshot(db: IDBDatabase, value: Snapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, 'replica');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function sendQueued(): Promise<void> {
  const db = await openDb();
  try {
    const snap = await readSnapshot(db);
    if (!snap?.pending?.length) return;
    const response = await fetch('/api/ops', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ since: snap.rev, ops: snap.pending }),
    });
    // 401 means the passcode cookie expired: the person has to open the app anyway.
    if (!response.ok && response.status !== 401) throw new Error(`Arbor sync: HTTP ${response.status}`);
    if (!response.ok) return;

    // Drop exactly what was sent; anything queued in the meantime stays.
    const sent = new Set(snap.pending.map((op) => JSON.stringify(op)));
    const fresh = (await readSnapshot(db)) ?? snap;
    fresh.pending = (fresh.pending ?? []).filter((op) => !sent.has(JSON.stringify(op)));
    await writeSnapshot(db, fresh);
    for (const client of await sw.clients.matchAll()) client.postMessage({ type: 'arbor-synced' });
  } finally {
    db.close();
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
