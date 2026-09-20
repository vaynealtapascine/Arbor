// Copies a built Arbor into the self-hosting folder (default C:\Users\<you>\selfhost\arbor).
//
//   npm run deploy            build, then copy
//   node scripts/deploy.mjs   copy the existing build only
//
// Layout of the target:
//   app\server\*.mjs   the server (it exits when these change and the service
//                      starts it again, so a deploy restarts it by itself)
//   app\dist\          the built client; served straight from disk, no restart needed
//   data\              database, daily backups and log — never touched by deploys
//   install.cmd        one-time service + Caddy setup (double-click; asks for admin)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.env.ARBOR_HOME ?? join(homedir(), 'selfhost', 'arbor');
const dist = join(root, 'dist');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('No build found — run `npm run build` first (or `npm run deploy`).');
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

const app = join(target, 'app');
mkdirSync(join(target, 'data'), { recursive: true });

// Server code first (the watcher restarts once everything is in place).
for (const f of readdirSync(join(root, 'server'))) {
  if (f.endsWith('.mjs') && !f.endsWith('.test.mjs')) copy(join(root, 'server', f), join(app, 'server', f));
}
copy(join(root, 'package.json'), join(app, 'package.json'));

// Client: fingerprinted assets first, then the entry points that reference them.
const files = walk(dist).map((f) => relative(dist, f));
const entry = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);
for (const f of files.filter((f) => !entry.has(f))) copy(join(dist, f), join(app, 'dist', f));
for (const f of files.filter((f) => entry.has(f))) copy(join(dist, f), join(app, 'dist', f));

// Keep the previous build's assets for pages that are still open; drop anything older.
const manifestFile = join(target, '.deployed.json');
const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : [];
const keep = new Set([...files, ...previous].map((f) => f.split('\\').join('/')));
let pruned = 0;
for (const f of walk(join(app, 'dist'))) {
  const rel = relative(join(app, 'dist'), f).split('\\').join('/');
  if (!keep.has(rel)) {
    rmSync(f);
    pruned++;
  }
}
writeFileSync(manifestFile, JSON.stringify(files));

for (const f of ['install.ps1', 'install.cmd', 'check.cmd', 'uninstall.ps1', 'uninstall.cmd']) {
  copy(join(root, 'deploy', f), join(target, f));
}
copy(join(root, 'deploy', 'README.txt'), join(target, 'README.txt'));

console.log(`Deployed ${files.length} files to ${app}${pruned ? ` (removed ${pruned} stale)` : ''}.`);
console.log(
  existsSync(join(target, 'data', 'arbor.sqlite'))
    ? 'Data untouched.'
    : `First deploy: double-click ${join(target, 'install.cmd')} (check.cmd reports without changing anything).`,
);
