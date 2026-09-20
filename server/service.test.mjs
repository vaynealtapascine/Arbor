import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restartDelay, supervise } from './service.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'arbor-svc-'));

/** Writes a fake server that records every run, and returns its path. */
function fakeServer(dir, body) {
  const file = join(dir, 'fake.mjs');
  const marks = join(dir, 'runs.txt');
  writeFileSync(marks, '');
  writeFileSync(
    file,
    `import { appendFileSync } from 'node:fs';\n` +
      `appendFileSync(${JSON.stringify(marks)}, process.pid + '\\n');\n` +
      body,
  );
  return { file, runs: () => readFileSync(marks, 'utf8').match(/\d+/g) ?? [] };
}

const until = async (predicate, ms = 5000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

test('restart delay backs off only after quick failures', () => {
  assert.equal(restartDelay(0, 500, 30_000), 500, 'a server that ran for a while comes straight back');
  assert.equal(restartDelay(1, 500, 30_000), 500);
  assert.equal(restartDelay(2, 500, 30_000), 1000);
  assert.equal(restartDelay(4, 500, 30_000), 4000);
  assert.equal(restartDelay(99, 500, 30_000), 30_000, 'and never waits longer than the cap');
});

test('the server is started again when it exits', async () => {
  // The deploy path: the server exits on purpose when its code changes.
  const dir = tmp();
  const { file, runs } = fakeServer(dir, 'setTimeout(() => process.exit(0), 50);');
  const arbor = supervise({ entry: file, minDelay: 25, killAfter: 300 });
  assert.ok(await until(() => runs().length >= 3), `only ran ${runs().length} times`);
  await arbor.stop();
  rmSync(dir, { recursive: true, force: true });
});

test('stopping does not start it again', async () => {
  const dir = tmp();
  const { file, runs } = fakeServer(dir, 'setInterval(() => {}, 1000);');
  const arbor = supervise({ entry: file, minDelay: 25, killAfter: 300 });
  assert.ok(await until(() => arbor.pid !== null));
  await arbor.stop();
  const after = runs().length;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(runs().length, after, 'the supervisor let go');
  rmSync(dir, { recursive: true, force: true });
});

test('a clean stop is asked for before the server is killed', async () => {
  // Windows has no SIGTERM, so the supervisor sends a message the server answers.
  const dir = tmp();
  const marks = join(dir, 'stopped.txt');
  const { file } = fakeServer(
    dir,
    `process.on('message', (m) => { if (m === 'arbor:stop') { ` +
      `appendFileSync(${JSON.stringify(marks)}, m); process.exit(0); } });\n` +
      `setInterval(() => {}, 1000);`,
  );
  const arbor = supervise({ entry: file, minDelay: 25, killAfter: 300 });
  assert.ok(await until(() => arbor.pid !== null));
  await arbor.stop();
  assert.equal(readFileSync(marks, 'utf8'), 'arbor:stop');
  rmSync(dir, { recursive: true, force: true });
});

test('a server that stops answering is restarted', async () => {
  // Running but not serving is the failure that hurts: the service looks healthy
  // and every device gets a 502.
  const dir = tmp();
  const { file, runs } = fakeServer(dir, 'setInterval(() => {}, 1000);');
  let answer = true;
  const arbor = supervise({
    entry: file,
    minDelay: 25,
    probe: async () => answer,
    killAfter: 300,
    checkEvery: 20,
    grace: 0,
  });
  assert.ok(await until(() => arbor.pid !== null));
  const first = arbor.pid;
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(arbor.pid, first, 'a healthy server is left alone');
  answer = false;
  assert.ok(await until(() => runs().length >= 2), 'it should have been restarted');
  await arbor.stop();
  rmSync(dir, { recursive: true, force: true });
});

test('a server that cannot start at all is retried, not spun', async () => {
  const dir = tmp();
  const { file, runs } = fakeServer(dir, 'process.exit(1);');
  const arbor = supervise({ entry: file, minDelay: 40, maxDelay: 200, killAfter: 300 });
  assert.ok(await until(() => runs().length >= 3));
  const spun = runs().length;
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(runs().length - spun <= 3, `restarted ${runs().length - spun} times in 400ms, backoff is not working`);
  await arbor.stop();
  rmSync(dir, { recursive: true, force: true });
});
