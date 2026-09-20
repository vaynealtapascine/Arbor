// Arbor server: serves the built app and a tiny sync API over one SQLite file.
//
//   GET  /api/sync?since=REV      changes since REV (or a full snapshot)
//   POST /api/ops                 { since, ops } -> applies ops, returns changes since `since`
//   GET  /api/events              server-sent events: `rev` whenever anything changes
//   POST /api/login               { passcode } when ARBOR_PASSCODE is set
//   GET  /api/health              liveness + counts
//
// Configuration (environment variables):
//   ARBOR_PORT      default 5240
//   ARBOR_HOST      default 127.0.0.1 (put Caddy or another proxy in front for HTTPS)
//   ARBOR_DATA      directory for arbor.sqlite and backups/, default ./data
//   ARBOR_PASSCODE  optional; when set, every device must enter it once
//   ARBOR_PASSCODE_HASH  sha256 of the passcode (hex) - used instead, so the
//                        passcode itself is not stored in the service config
//   ARBOR_STATIC    directory of the built client, default ./dist
//   ARBOR_RESTART_ON_CHANGE=1   exit when server code changes (the service restarts it)
import { createServer } from 'node:http';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, watch } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { Store, ValidationError } from './store.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 32 * 1024 * 1024;

export function createArborServer({
  dataDir = resolve(here, '..', 'data'),
  staticDir = resolve(here, '..', 'dist'),
  passcode = '',
  /** sha256 of the passcode, hex. Preferred: the plain text then lives nowhere. */
  passcodeHash = '',
  dbFile,
  log = console.log,
} = {}) {
  mkdirSync(dataDir, { recursive: true });
  const store = new Store(dbFile ?? join(dataDir, 'arbor.sqlite'));
  const clients = new Set();
  const staticCache = new Map();
  // Only ever hold the hash: the service config keeps that, not the passcode.
  const secret = passcodeHash || (passcode ? sha256(passcode) : '');
  // The cookie proves knowledge of the passcode without storing it.
  const token = secret ? createHmac('sha256', secret).update('arbor-session-v1').digest('hex') : '';

  function authorized(req) {
    if (!token) return true;
    const cookie = parseCookies(req.headers.cookie ?? '').arbor_session ?? '';
    return cookie.length === token.length && timingSafeEqual(Buffer.from(cookie), Buffer.from(token));
  }

  function broadcast(rev) {
    for (const res of clients) res.write(`event: rev\ndata: ${rev}\n\n`);
  }

  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 25_000);

  function housekeeping() {
    try {
      const file = store.backup(join(dataDir, 'backups'));
      if (file) log(`backup written: ${file}`);
      const purged = store.purgeTombstones();
      if (purged) log(`purged ${purged} old tombstones`);
    } catch (err) {
      log(`housekeeping failed: ${err.message}`);
    }
  }
  housekeeping();
  const daily = setInterval(housekeeping, 60 * 60 * 1000);

  async function handleApi(req, res, url) {
    if (url.pathname === '/api/health') {
      return json(res, 200, { ok: true, auth: !!token, ...store.stats() });
    }
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const body = await readJson(req);
      if (!token) return json(res, 200, { ok: true });
      const given = sha256(String(body.passcode ?? ''));
      if (!timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
        await new Promise((r) => setTimeout(r, 600));
        return json(res, 401, { error: 'Wrong passcode' });
      }
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.setHeader(
        'Set-Cookie',
        `arbor_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=315360000${secure}`,
      );
      return json(res, 200, { ok: true });
    }
    if (!authorized(req)) return json(res, 401, { error: 'Passcode required' });

    if (url.pathname === '/api/sync' && req.method === 'GET') {
      return json(res, 200, store.changes(Number(url.searchParams.get('since') ?? 0)));
    }
    if (url.pathname === '/api/ops' && req.method === 'POST') {
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
        return json(res, 415, { error: 'Expected application/json' });
      }
      const body = await readJson(req);
      const before = store.rev;
      const rev = store.apply(body.ops ?? []);
      if (rev !== before) broadcast(rev);
      return json(res, 200, store.changes(Number(body.since ?? 0)));
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`retry: 3000\nevent: rev\ndata: ${store.rev}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    return json(res, 404, { error: 'Not found' });
  }

  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    let file = normalize(join(staticDir, path));
    if (!file.startsWith(staticDir + sep) && file !== staticDir) return json(res, 403, { error: 'Forbidden' });
    if (!existsSync(file) || !statSync(file).isFile()) {
      // Single-page app: unknown paths get the shell, missing assets get 404.
      if (extname(path)) return json(res, 404, { error: 'Not found' });
      file = join(staticDir, 'index.html');
      if (!existsSync(file)) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Arbor has not been built yet. Run `npm run build`.');
      }
    }
    const entry = loadStatic(file);
    const immutable = file.includes(`${sep}assets${sep}`);
    const headers = {
      'Content-Type': entry.type,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      ETag: entry.etag,
      Vary: 'Accept-Encoding',
      'X-Content-Type-Options': 'nosniff',
    };
    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    const gzip = entry.gzip && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    if (gzip) headers['Content-Encoding'] = 'gzip';
    const body = gzip ? entry.gzip : entry.body;
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  function loadStatic(file) {
    const mtime = statSync(file).mtimeMs;
    const cached = staticCache.get(file);
    if (cached && cached.mtime === mtime) return cached;
    const body = readFileSync(file);
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    const compressible = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/.test(type);
    const entry = {
      mtime,
      body,
      type,
      etag: `"${createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`,
      gzip: compressible && body.length > 1024 ? gzipSync(body, { level: 9 }) : null,
    };
    staticCache.set(file, entry);
    return entry;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else serveStatic(req, res, url);
    } catch (err) {
      if (err instanceof ValidationError || err instanceof SyntaxError || err instanceof BodyError) {
        json(res, 400, { error: err.message });
      } else {
        log(`error ${req.method} ${url.pathname}: ${err.stack ?? err}`);
        if (!res.headersSent) json(res, 500, { error: 'Internal error' });
        else res.end();
      }
    }
  });

  /**
   * Shuts down without waiting on open sockets: server.close() only calls back
   * once every connection has ended, and a single idle keep-alive socket (a
   * browser tab, a health check) would otherwise leave the process alive with
   * its listener already closed — running, but serving nothing.
   */
  let closing = null;
  function close() {
    // Calling this twice (two signals, or a deploy during shutdown) must not
    // close the database again: that throws and takes the process down.
    if (closing) return closing;
    clearInterval(heartbeat);
    clearInterval(daily);
    for (const res of clients) res.end();
    clients.clear();
    closing = new Promise((done) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        try {
          store.close();
        } catch (err) {
          log(`closing the database: ${err.message}`);
        }
        done();
      };
      server.close(finish);
      server.closeAllConnections?.();
      setTimeout(finish, 2000).unref?.();
    });
    return closing;
  }

  const isClosing = () => closing !== null;

  return { server, store, close, isClosing };
}

class BodyError extends Error {}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new BodyError('Request body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new BodyError('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseCookies(header) {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

// Run directly: start listening.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.ARBOR_PORT ?? 5240);
  const host = process.env.ARBOR_HOST ?? '127.0.0.1';
  const dataDir = resolve(process.env.ARBOR_DATA ?? join(here, '..', 'data'));
  const staticDir = resolve(process.env.ARBOR_STATIC ?? join(here, '..', 'dist'));
  const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);
  const { server, close, isClosing } = createArborServer({
    dataDir,
    staticDir,
    passcode: process.env.ARBOR_PASSCODE ?? '',
    passcodeHash: (process.env.ARBOR_PASSCODE_HASH ?? '').trim().toLowerCase(),
    log,
  });
  server.listen(port, host, () => {
    log(`Arbor listening on http://${host}:${port} (data: ${dataDir})`);
  });

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void close().then(() => process.exit(0));
    // Never let a shutdown hang: the service manager would keep believing we run.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  // Under the Windows service, exit when a deploy replaces the server code;
  // the service manager starts it again with the new version.
  if (process.env.ARBOR_RESTART_ON_CHANGE === '1') {
    // Hash the contents, not timestamps: a deploy that rewrites identical files,
    // a backup tool or an antivirus scan must not bounce the service.
    const fingerprint = () =>
      readdirSync(here)
        .filter((f) => f.endsWith('.mjs'))
        .sort()
        .map((f) => `${f}:${createHash('sha1').update(readFileSync(join(here, f))).digest('hex')}`)
        .join('|');
    let current = fingerprint();
    let timer;
    watch(here, (_event, file) => {
      if (!String(file ?? '').endsWith('.mjs') || stopping || isClosing()) return;
      clearTimeout(timer);
      // Wait for the copy to settle, then only act if the code really differs:
      // directory watches on Windows also fire for touches that change nothing.
      timer = setTimeout(() => {
        let next;
        try {
          next = fingerprint();
        } catch {
          return; // mid-copy; the next event will catch it
        }
        if (next === current) return;
        current = next;
        log('server code changed, restarting');
        stop();
      }, 1500);
    });
  }
}
