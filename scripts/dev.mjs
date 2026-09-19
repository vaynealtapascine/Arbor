// `npm run dev`: API server (restarts on change) + Vite dev server with HMR.
// Open http://localhost:5241 — Vite proxies /api to the server on 5240.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('src/generated/ui-icons.ts')) {
  await new Promise((r) => spawn(process.execPath, ['scripts/build-icons.mjs'], { stdio: 'inherit' }).on('exit', r));
}

const procs = [
  spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--watch', 'server/server.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, ARBOR_DATA: process.env.ARBOR_DATA ?? 'data-dev' },
  }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', stop);
