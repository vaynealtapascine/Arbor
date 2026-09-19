import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * Compiles src/service-worker.ts into dist/sw.js and injects the list of
 * files to precache: everything the app needs to start offline. The big icon
 * and emoji catalogues and the optional fonts are left out; the worker
 * caches them on first use.
 */
export function serviceWorker(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'arbor:service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle(_options, bundle) {
      const emitted = Object.keys(bundle);
      const publicFiles = config.publicDir ? listFiles(config.publicDir) : [];
      const precache = [...new Set([...emitted, ...publicFiles])]
        .filter((file) => !/\.(map|woff2?)$/.test(file) && !/^assets\/(tabler|emoji)-/.test(file) && file !== 'sw.js')
        .sort();

      const hash = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
      const version = `${Date.now().toString(36).padStart(9, '0')}-${hash}`;
      const source = readFileSync(join(config.root, 'src', 'service-worker.ts'), 'utf8');
      const compiled = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          removeComments: true,
        },
      }).outputText;

      if (!compiled.includes('__PRECACHE_MANIFEST__') || !compiled.includes('__CACHE_VERSION__')) {
        this.error('src/service-worker.ts must reference __PRECACHE_MANIFEST__ and __CACHE_VERSION__');
      }

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: compiled
          .replaceAll('__PRECACHE_MANIFEST__', JSON.stringify(precache))
          .replaceAll('__CACHE_VERSION__', JSON.stringify(version)),
      });
    },
  };
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry.startsWith('.')) continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out;
}
