import { test } from 'node:test';
import net from 'node:net';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, ValidationError } from './store.mjs';
import { createArborServer } from './server.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'arbor-test-'));

test('store merges fields and bumps one revision per batch', () => {
  const s = new Store(':memory:');
  const r1 = s.apply([
    { kind: 'item', id: 'a', set: { title: 'A', tags: ['x'] } },
    { kind: 'item', id: 'b', set: { title: 'B' } },
  ]);
  assert.equal(r1, 1);
  const r2 = s.apply([{ kind: 'item', id: 'a', set: { note: 'hello', tags: [] } }]);
  assert.equal(r2, 2);
  const { changes, full } = s.changes(1);
  assert.equal(full, false);
  assert.deepEqual(changes.map((c) => [c.id, c.data]), [['a', { title: 'A', tags: [], note: 'hello' }]]);
  s.close();
});

test('store tombstones deletions and restores them', () => {
  const s = new Store(':memory:');
  s.apply([{ kind: 'tag', id: 't', set: { name: 'urgent' } }]);
  s.apply([{ kind: 'tag', id: 't', del: true }]);
  let c = s.changes(1).changes;
  assert.equal(c[0].deleted, true);
  assert.equal(c[0].data.name, 'urgent');
  assert.equal(s.changes(0).changes.length, 0, 'full snapshots omit tombstones');
  s.apply([{ kind: 'tag', id: 't', del: false }]);
  c = s.changes(2).changes;
  assert.equal(c[0].deleted, false);
  s.close();
});

test('store rejects malformed operations without partial writes', () => {
  const s = new Store(':memory:');
  assert.throws(() => s.apply([{ kind: 'nope', id: 'a', set: {} }]), ValidationError);
  assert.throws(() => s.apply([{ kind: 'item', id: 'bad id', set: {} }]), ValidationError);
  assert.throws(() => s.apply([{ kind: 'item', id: 'a', set: { 'x-y': 1 } }]), ValidationError);
  assert.throws(() => s.apply([{ kind: 'item', id: 'a' }]), ValidationError);
  assert.throws(
    () => s.apply([{ kind: 'item', id: 'ok', set: { title: 'x' } }, { kind: 'item', id: '', set: {} }]),
    ValidationError,
  );
  assert.equal(s.rev, 0);
  assert.equal(s.changes(0).changes.length, 0);
  s.close();
});

test('purged tombstones force a full resync for clients that are behind', () => {
  const s = new Store(':memory:');
  s.apply([{ kind: 'item', id: 'a', set: { title: 'A' } }]);
  s.apply([{ kind: 'item', id: 'a', del: true }]);
  s.apply([{ kind: 'item', id: 'b', set: { title: 'B' } }]);
  assert.equal(s.purgeTombstones(Date.now() + 60 * 86_400_000), 1);
  const behind = s.changes(1);
  assert.equal(behind.full, true);
  assert.deepEqual(behind.changes.map((c) => c.id), ['b']);
  assert.equal(s.changes(2).full, false, 'clients past the purged revision still get deltas');
  s.close();
});

test('backups keep the newest copies', () => {
  const dir = tmp();
  const s = new Store(join(dir, 'db.sqlite'));
  s.apply([{ kind: 'item', id: 'a', set: { title: 'A' } }]);
  for (let d = 1; d <= 4; d++) s.backup(join(dir, 'backups'), 2, new Date(2026, 0, d, 12));
  assert.deepEqual(readdirSync(join(dir, 'backups')).sort(), ['arbor-2026-01-03.sqlite', 'arbor-2026-01-04.sqlite']);
  s.close();
  rmSync(dir, { recursive: true, force: true });
});

async function withServer(options, fn) {
  const dataDir = tmp();
  const staticDir = join(dataDir, 'dist');
  mkdirSync(join(staticDir, 'assets'), { recursive: true });
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>Arbor</title>');
  writeFileSync(join(staticDir, 'assets', 'app-123.js'), 'console.log(1);'.repeat(200));
  const { server, close } = createArborServer({ dataDir, staticDir, log: () => {}, ...options });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

const post = (url, body, headers = {}) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('ops round-trip returns the changes the caller has not seen', async () => {
  await withServer({}, async (base) => {
    let res = await post(`${base}/api/ops`, { since: 0, ops: [{ kind: 'item', id: 'a', set: { title: 'A' } }] });
    let body = await res.json();
    assert.equal(body.rev, 1);
    assert.equal(body.changes.length, 1);
    await post(`${base}/api/ops`, { since: 1, ops: [{ kind: 'item', id: 'b', set: { title: 'B' } }] });
    body = await (await fetch(`${base}/api/sync?since=1`)).json();
    assert.deepEqual(body.changes.map((c) => c.id), ['b']);
    res = await post(`${base}/api/ops`, { ops: [{ kind: 'bogus', id: 'x', set: {} }] });
    assert.equal(res.status, 400);
    res = await fetch(`${base}/api/ops`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(res.status, 415);
  });
});

test('events stream announces new revisions', async () => {
  await withServer({}, async (base) => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/events`, { signal: ctrl.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const next = async () => {
      const { value } = await reader.read();
      text += decoder.decode(value);
    };
    await next();
    assert.match(text, /event: rev\ndata: 0/);
    await post(`${base}/api/ops`, { ops: [{ kind: 'item', id: 'a', set: { title: 'A' } }] });
    while (!/data: 1/.test(text)) await next();
    ctrl.abort();
  });
});

test('passcode gates the API but not the app shell', async () => {
  await withServer({ passcode: 'hunter2' }, async (base) => {
    assert.equal((await fetch(`${base}/api/sync`)).status, 401);
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await post(`${base}/api/login`, { passcode: 'nope' })).status, 401);
    const ok = await post(`${base}/api/login`, { passcode: 'hunter2' });
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${base}/api/sync`, { headers: { cookie } })).status, 200);
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.auth, true);
  });
});

test('a stored passcode hash works the same as the passcode', async () => {
  // The service keeps only the hash, so the passcode itself is nowhere on disk.
  const hash = createHash('sha256').update('hunter2').digest('hex');
  await withServer({ passcodeHash: hash }, async (base) => {
    assert.equal((await fetch(`${base}/api/sync`)).status, 401);
    assert.equal((await post(`${base}/api/login`, { passcode: 'wrong' })).status, 401);
    const ok = await post(`${base}/api/login`, { passcode: 'hunter2' });
    assert.equal(ok.status, 200);
    const cookie = ok.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${base}/api/sync`, { headers: { cookie } })).status, 200);
  });
});

test('shutdown does not wait for a client that is holding a connection', async () => {
  // A proxy upstream connection (Caddy keeps one) or a half-sent request is not
  // "idle", so server.close() would wait for it forever: the process would live
  // on with its listener already shut - running, but serving nothing.
  const dataDir = tmp();
  const { server, close } = createArborServer({ dataDir, staticDir: dataDir, log: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const socket = net.connect(port, '127.0.0.1');
  await new Promise((r) => socket.once('connect', r));
  socket.write('GET /api/health HTTP/1.1\r\nHost: localhost\r\n'); // deliberately unfinished
  await new Promise((r) => setTimeout(r, 100));
  const closed = await Promise.race([
    close().then(() => 'closed'),
    // Under 1s, so the internal 2s safety net cannot be what rescues this.
    new Promise((r) => setTimeout(() => r('hung'), 1000)),
  ]);
  socket.destroy();
  assert.equal(closed, 'closed');
  rmSync(dataDir, { recursive: true, force: true });
});

test('static files: SPA fallback, gzip, immutable assets, no traversal', async () => {
  await withServer({}, async (base) => {
    let res = await fetch(`${base}/some/deep/route`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Arbor/);
    res = await fetch(`${base}/assets/app-123.js`, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(res.headers.get('content-encoding'), 'gzip');
    assert.match(res.headers.get('cache-control'), /immutable/);
    assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
    assert.notEqual((await fetch(`${base}/..%2f..%2fpackage.json`)).status, 200);
    const etag = (await fetch(`${base}/`)).headers.get('etag');
    assert.equal((await fetch(`${base}/`, { headers: { 'if-none-match': etag } })).status, 304);
  });
});
