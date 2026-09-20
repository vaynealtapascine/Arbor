// What the Windows service actually runs. It owns server.mjs as a child process
// and is responsible for keeping it up.
//
// That responsibility used to belong to the service manager, and it did not hold.
// The server exits on purpose when a deploy replaces its code; NSSM logged the
// exit and stopped the service instead of starting it again, despite
// AppExit=Restart. Windows still reported the service as Running - with nothing
// listening behind it, so every device got a 502. A shutdown that hung once left
// exactly the same picture. Both are the same class of problem: something else
// decides whether Arbor is alive. Now we decide, and we check.
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUICK_EXIT_MS = 5_000; // an exit sooner than this means it failed to start
const CHECK_EVERY_MS = 30_000;
const CHECK_GRACE_MS = 20_000; // give a fresh server time to listen
const CHECK_TIMEOUT_MS = 5_000;
const CHECK_STRIKES = 3; // ~90s of silence before we restart a running server

/** How long to wait before starting the server again, backing off if it keeps failing. */
export function restartDelay(failures, minDelay = 500, maxDelay = 30_000) {
  return Math.min(maxDelay, minDelay * 2 ** Math.max(0, failures - 1));
}

/**
 * Runs `entry` and keeps it running: restarts it when it exits, and - when a
 * `probe` is given - when it is still there but has stopped answering.
 * Returns `{ stop, stopped, pid, runs }`; `stop()` resolves once the child is gone.
 */
export function supervise({
  entry,
  env = {},
  log = () => {},
  minDelay = 500,
  maxDelay = 30_000,
  probe = null,
  checkEvery = CHECK_EVERY_MS,
  grace = CHECK_GRACE_MS,
  killAfter = 6_000,
} = {}) {
  let child = null;
  let stopping = false;
  let failures = 0;
  let runs = 0;
  let began = 0;
  let timer = null;
  let checker = null;
  let strikes = 0;
  let checking = false;
  let settle;
  const stopped = new Promise((r) => {
    settle = r;
  });

  const start = () => {
    timer = null;
    began = Date.now();
    runs++;
    // The extra stdio slot is an IPC channel, so we can ask for a clean stop.
    child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', entry], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, ...env },
    });
    strikes = 0;
    child.on('error', (err) => log(`could not start the server: ${err.message}`));
    child.on('exit', (code, signal) => {
      child = null;
      if (stopping) return settle();
      failures = Date.now() - began < QUICK_EXIT_MS ? failures + 1 : 0;
      const delay = restartDelay(failures, minDelay, maxDelay);
      const how = signal ? `was killed (${signal})` : `exited (code ${code})`;
      log(`the server ${how}; starting it again${delay > minDelay ? ` in ${Math.round(delay / 1000)}s` : ''}`);
      timer = setTimeout(start, delay);
    });
  };

  // A server that is running but not answering looks healthy to everything
  // except the people trying to use it. Notice it ourselves.
  const check = async () => {
    if (!child || stopping || checking || Date.now() - began < grace) return;
    checking = true;
    const answered = await probe().catch(() => false);
    checking = false;
    if (answered || !child || stopping) {
      strikes = 0;
      return;
    }
    if (++strikes < CHECK_STRIKES) return;
    log('the server is not answering; restarting it');
    child.kill(); // the exit handler starts it again
  };

  const stop = () => {
    if (stopping) return stopped;
    stopping = true;
    clearTimeout(timer);
    clearInterval(checker);
    if (!child) settle();
    else {
      try {
        child.send('arbor:stop');
      } catch {
        child.kill();
      }
      const insist = setTimeout(() => child?.kill(), killAfter);
      void stopped.then(() => clearTimeout(insist));
    }
    return stopped;
  };

  start();
  if (probe) checker = setInterval(check, checkEvery);
  return {
    stop,
    stopped,
    get pid() {
      return child?.pid ?? null;
    },
    get runs() {
      return runs;
    },
  };
}

// Run directly: supervise the server next to us.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const port = Number(process.env.ARBOR_PORT ?? 5240);
  const host = process.env.ARBOR_HOST ?? '127.0.0.1';
  const log = (msg) => console.log(`${new Date().toISOString()} [service] ${msg}`);
  const arbor = supervise({
    entry: join(here, 'server.mjs'),
    env: { ARBOR_RESTART_ON_CHANGE: '1' },
    log,
    probe: async () => {
      const res = await fetch(`http://${host}:${port}/api/health`, {
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      });
      return res.ok;
    },
  });
  log(`supervising ${join(here, 'server.mjs')}`);

  // NSSM stops us with Ctrl+C on the console, which reaches the child too.
  const quit = () => {
    void arbor.stop().then(() => process.exit(0));
    setTimeout(() => process.exit(0), 8_000).unref();
  };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}
