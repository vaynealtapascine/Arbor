import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArborServer } from './server.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Dun uses server item data, validates time/items and reports delivery errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'arbor-dun-'));
  const sent = [];
  let offline = false;
  const app = createArborServer({ dataDir: dir, dbFile: ':memory:', log: () => {},
    dunConnectionFile: 'private-file', sendDunReminder: async (body, file) => {
      if (offline) throw new Error('Dun is unavailable.');
      sent.push({ body, file }); return { id: 'api-one', created: sent.length === 1 };
    },
  });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await post('/api/ops', { ops: [{ kind: 'item', id: 'one', set: { title: 'From server', note: 'Server note' } }] });
    const request = { itemId: 'one', dueAt: new Date(Date.now() + 3600_000).toISOString(), title: 'Untrusted title' };
    assert.equal((await post('/api/dun/reminders', request)).status, 200);
    assert.equal((await post('/api/dun/reminders', request)).status, 200);
    assert.equal(sent[0].body.title, 'From server');
    assert.equal(sent[0].body.notes, 'Server note');
    assert.equal(sent[0].body.externalId, sent[1].body.externalId);
    assert.equal(sent[0].file, 'private-file');
    assert.equal((await post('/api/dun/reminders', { ...request, itemId: 'missing' })).status, 404);
    assert.equal((await post('/api/dun/reminders', { ...request, dueAt: 'yesterday' })).status, 400);
    offline = true;
    const response = await post('/api/dun/reminders', request);
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /unavailable/);
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }); }
});
