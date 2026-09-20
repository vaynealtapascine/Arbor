// Arbor's storage: one SQLite table of JSON documents with a global revision
// counter. Every write batch gets the next revision, and clients catch up by
// asking for everything changed since the last revision they saw. Deletions
// are kept as tombstones for a while so offline clients learn about them.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const KINDS = new Set(['item', 'status', 'tag', 'setting', 'view', 'template']);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const FIELD = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const MAX_DOC_BYTES = 2_000_000;
const MAX_OPS = 5000;
const TOMBSTONE_DAYS = 45;

export class ValidationError extends Error {}

export class Store {
  /** @param {string} file SQLite path, or ':memory:' */
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS entities (
        kind    TEXT    NOT NULL,
        id      TEXT    NOT NULL,
        data    TEXT    NOT NULL,
        rev     INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL,
        PRIMARY KEY (kind, id)
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS entities_rev ON entities (rev);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    this.q = {
      getMeta: this.db.prepare('SELECT value FROM meta WHERE key = ?'),
      setMeta: this.db.prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      ),
      get: this.db.prepare('SELECT data, deleted FROM entities WHERE kind = ? AND id = ?'),
      put: this.db.prepare(`
        INSERT INTO entities (kind, id, data, rev, deleted, updated) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (kind, id) DO UPDATE SET
          data = excluded.data, rev = excluded.rev, deleted = excluded.deleted, updated = excluded.updated`),
      since: this.db.prepare(
        'SELECT kind, id, data, deleted, updated FROM entities WHERE rev > ? ORDER BY rev',
      ),
      all: this.db.prepare('SELECT kind, id, data, deleted, updated FROM entities WHERE deleted = 0'),
      purgeable: this.db.prepare('SELECT MAX(rev) AS rev FROM entities WHERE deleted = 1 AND updated < ?'),
      purge: this.db.prepare('DELETE FROM entities WHERE deleted = 1 AND updated < ?'),
      counts: this.db.prepare('SELECT kind, deleted, COUNT(*) AS n FROM entities GROUP BY kind, deleted'),
    };
    this.rev = Number(this.meta('rev') ?? 0);
  }

  meta(key) {
    return this.q.getMeta.get(key)?.value;
  }

  /**
   * Applies a batch of operations atomically and returns the new revision.
   * An operation is { kind, id, set?: {field: value}, del?: boolean }.
   * `set` merges fields into the document (a null value stores null);
   * `del: true` tombstones the document, `del: false` restores it.
   */
  apply(ops) {
    if (!Array.isArray(ops)) throw new ValidationError('ops must be an array');
    if (ops.length === 0) return this.rev;
    if (ops.length > MAX_OPS) throw new ValidationError(`at most ${MAX_OPS} operations per request`);
    for (const op of ops) validate(op);

    const now = Date.now();
    const rev = this.rev + 1;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const op of ops) {
        const row = this.q.get.get(op.kind, op.id);
        const data = row ? JSON.parse(row.data) : {};
        if (op.set) {
          for (const [field, value] of Object.entries(op.set)) {
            if (value === undefined) delete data[field];
            else data[field] = value;
          }
        }
        const deleted = op.del === undefined ? (row?.deleted ?? 0) : op.del ? 1 : 0;
        const json = JSON.stringify(data);
        if (json.length > MAX_DOC_BYTES) throw new ValidationError(`${op.kind} ${op.id} is too large`);
        this.q.put.run(op.kind, op.id, json, rev, deleted, now);
      }
      this.q.setMeta.run('rev', String(rev));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    this.rev = rev;
    return rev;
  }

  /**
   * Everything a client needs to catch up from `since`. If tombstones the
   * client would need were already purged, it gets a full snapshot instead.
   */
  changes(since) {
    const floor = Number(this.meta('purgeFloor') ?? 0);
    const full = !(since > 0) || since < floor || since > this.rev;
    const rows = full ? this.q.all.all() : this.q.since.all(since);
    return {
      rev: this.rev,
      full,
      changes: rows.map((r) => ({
        kind: r.kind,
        id: r.id,
        data: JSON.parse(r.data),
        deleted: r.deleted === 1,
        updated: r.updated,
      })),
    };
  }

  /** Drops tombstones older than the retention window. */
  purgeTombstones(now = Date.now()) {
    const cutoff = now - TOMBSTONE_DAYS * 86_400_000;
    const { rev } = this.q.purgeable.get(cutoff);
    if (rev == null) return 0;
    const floor = Math.max(Number(this.meta('purgeFloor') ?? 0), Number(rev));
    this.q.setMeta.run('purgeFloor', String(floor));
    return Number(this.q.purge.run(cutoff).changes);
  }

  stats() {
    const out = {};
    for (const { kind, deleted, n } of this.q.counts.all()) {
      out[kind] ??= { live: 0, deleted: 0 };
      out[kind][deleted ? 'deleted' : 'live'] = Number(n);
    }
    return { rev: this.rev, kinds: out };
  }

  /** Writes a consistent copy of the database and keeps the newest `keep` copies. */
  backup(dir, keep = 14, now = new Date()) {
    mkdirSync(dir, { recursive: true });
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const file = join(dir, `arbor-${stamp}.sqlite`);
    if (existsSync(file)) return null;
    this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const old = readdirSync(dir)
      .filter((f) => /^arbor-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
      .sort()
      .slice(0, -keep);
    for (const f of old) rmSync(join(dir, f), { force: true });
    return file;
  }

  close() {
    this.db.close();
  }
}

function validate(op) {
  if (!op || typeof op !== 'object') throw new ValidationError('operation must be an object');
  if (!KINDS.has(op.kind)) throw new ValidationError(`unknown kind: ${op.kind}`);
  if (typeof op.id !== 'string' || !ID.test(op.id)) throw new ValidationError(`bad id: ${op.id}`);
  if (op.del !== undefined && typeof op.del !== 'boolean') throw new ValidationError('del must be boolean');
  if (op.set !== undefined) {
    if (!op.set || typeof op.set !== 'object' || Array.isArray(op.set)) {
      throw new ValidationError('set must be an object');
    }
    for (const field of Object.keys(op.set)) {
      if (!FIELD.test(field)) throw new ValidationError(`bad field name: ${field}`);
    }
  }
  if (op.set === undefined && op.del === undefined) throw new ValidationError('operation does nothing');
}
