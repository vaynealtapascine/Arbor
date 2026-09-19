// The client's copy of the database.
//
// `base` is what the server has confirmed; `inflight` and `pending` are local
// writes on their way to the server. The reactive maps the UI reads are always
// base + inflight + pending, so edits show instantly and survive going offline.
// Everything is persisted to IndexedDB so the app opens with data even without
// a connection, and queued writes are sent once the server is reachable.
import { idbGet, idbSet } from './idb';
import type { Doc, Item, Kind, Op, Status, SyncResponse, Tag } from './types';
import { sameValue } from './util';

type Entry = { data: Doc; deleted: boolean; updated: number };
type Snapshot = { v: 1; rev: number; base: [string, Entry][]; pending: Op[] };

export type SyncState = 'loading' | 'synced' | 'syncing' | 'offline' | 'auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new ApiError(res.status, detail.error ?? res.statusText);
  }
  return res.json();
}

const keyOf = (kind: Kind, id: string) => `${kind}:${id}`;
const splitKey = (k: string) => {
  const i = k.indexOf(':');
  return [k.slice(0, i) as Kind, k.slice(i + 1)] as const;
};

function mergeOps(a: Op, b: Op): Op {
  const out: Op = { kind: b.kind, id: b.id };
  if (a.set || b.set) out.set = { ...a.set, ...b.set };
  const del = b.del ?? a.del;
  if (del !== undefined) out.del = del;
  return out;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function normalize(kind: Kind, id: string, d: Doc): Doc {
  switch (kind) {
    case 'item':
      return {
        id,
        parent: typeof d.parent === 'string' ? d.parent : null,
        pos: str(d.pos, 'a0'),
        title: str(d.title),
        note: str(d.note),
        status: typeof d.status === 'string' ? d.status : null,
        tags: Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string') : [],
        hidden: d.hidden === true,
        archived: d.archived === true,
        archivedAt: typeof d.archivedAt === 'number' ? d.archivedAt : null,
        created: typeof d.created === 'number' ? d.created : 0,
        doneAt: typeof d.doneAt === 'number' ? d.doneAt : null,
        prevStatus: typeof d.prevStatus === 'string' ? d.prevStatus : null,
      } satisfies Item;
    case 'status':
      return {
        id,
        name: str(d.name, 'Status'),
        icon: (d.icon as Status['icon']) ?? null,
        color: str(d.color, '#8b8b8b'),
        pos: str(d.pos, 'a0'),
        done: d.done === true,
      } satisfies Status;
    case 'tag':
      return {
        id,
        name: str(d.name, 'tag'),
        icon: (d.icon as Tag['icon']) ?? null,
        color: str(d.color, '#8b8b8b'),
        pos: str(d.pos, 'a0'),
      } satisfies Tag;
    default:
      return { ...d };
  }
}

export class Replica {
  items: Record<string, Item> = $state({});
  statuses: Record<string, Status> = $state({});
  tags: Record<string, Tag> = $state({});
  settings: Record<string, Doc> = $state({});
  state: SyncState = $state('loading');
  pendingCount = $state(0);
  /** Local snapshot restored (or known empty): safe to render. */
  loaded = $state(false);
  /** At least one successful exchange with the server this session. */
  online = $state(false);
  lastError = $state('');

  private base = new Map<string, Entry>();
  private rev = 0;
  private pending = new Map<string, Op>();
  private inflight: Map<string, Op> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private flushDeadline = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = 1000;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private events: EventSource | null = null;
  private firstSync: Promise<void>;
  private resolveFirstSync!: () => void;
  private remoteListeners = new Set<(keys: string[]) => void>();

  constructor() {
    this.firstSync = new Promise((r) => (this.resolveFirstSync = r));
  }

  /** Resolves after the first successful exchange with the server. */
  whenSynced() {
    return this.firstSync;
  }

  /** Called with entity keys ("item:abc") changed by other devices. */
  onRemoteChange(fn: (keys: string[]) => void) {
    this.remoteListeners.add(fn);
    return () => this.remoteListeners.delete(fn);
  }

  async start() {
    const snap = await idbGet<Snapshot>('replica');
    if (snap?.v === 1) {
      this.rev = snap.rev;
      for (const [k, e] of snap.base) this.base.set(k, e);
      for (const op of snap.pending) this.pending.set(keyOf(op.kind, op.id), op);
      for (const k of new Set([...this.base.keys(), ...this.pending.keys()])) this.refresh(k);
      this.pendingCount = this.pending.size;
    }
    this.loaded = true;
    this.state = 'syncing';
    addEventListener('online', () => this.reconnect());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.reconnect();
      else this.persistNow();
    });
    addEventListener('pagehide', () => this.persistNow());
    setInterval(() => {
      if (this.state !== 'auth' && (!this.events || this.events.readyState === EventSource.CLOSED)) this.reconnect();
    }, 15_000);
    this.reconnect();
  }

  /** (Re)opens the event stream, pulls what we missed and sends what we queued. */
  reconnect() {
    if (this.state === 'auth') return;
    void this.pull().then(() => {
      if (this.state === 'auth') return;
      this.flush();
      if (!this.events || this.events.readyState === EventSource.CLOSED) this.listen();
    });
  }

  async login(passcode: string) {
    await api('/api/login', { passcode });
    this.state = 'syncing';
    this.reconnect();
  }

  private listen() {
    this.events?.close();
    const es = new EventSource('/api/events');
    es.addEventListener('rev', (e) => {
      if (Number((e as MessageEvent).data) !== this.rev) void this.pull();
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED && this.state !== 'auth') this.setOffline('Event stream closed');
    };
    this.events = es;
  }

  // ---- reading

  /** The raw merged document (including tombstoned ones), for computing undo. */
  peek(kind: Kind, id: string): { data: Doc; deleted: boolean } | null {
    const k = keyOf(kind, id);
    const b = this.base.get(k);
    let data: Doc | null = b ? { ...b.data } : null;
    let deleted = b?.deleted ?? false;
    for (const layer of [this.inflight, this.pending]) {
      const op = layer?.get(k);
      if (!op) continue;
      data = { ...(data ?? {}), ...op.set };
      if (op.del !== undefined) deleted = op.del;
    }
    return data ? { data, deleted } : null;
  }

  /** Last time the server recorded a change to this entity. */
  updatedAt(kind: Kind, id: string): number {
    return this.base.get(keyOf(kind, id))?.updated ?? 0;
  }

  // ---- writing

  mutate(ops: Op[]) {
    if (!ops.length) return;
    for (const op of ops) {
      const k = keyOf(op.kind, op.id);
      const prev = this.pending.get(k);
      this.pending.set(k, prev ? mergeOps(prev, op) : { ...op });
      this.refresh(k);
    }
    this.pendingCount = this.pending.size + (this.inflight?.size ?? 0);
    if (this.state === 'synced') this.state = 'syncing';
    this.persistSoon();
    this.flushSoon();
  }

  /** Sends queued writes now (e.g. before the page goes away). */
  flushNow() {
    clearTimeout(this.flushTimer);
    this.flushDeadline = 0;
    this.flush();
  }

  private flushSoon() {
    const now = Date.now();
    if (!this.flushDeadline) this.flushDeadline = now + 1500;
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(
      () => {
        this.flushDeadline = 0;
        this.flush();
      },
      Math.min(250, Math.max(0, this.flushDeadline - now)),
    );
  }

  private serial<T>(task: () => Promise<T>): Promise<T | undefined> {
    const run = this.chain.then(task, task).catch((err) => {
      this.handleError(err);
      return undefined;
    });
    this.chain = run;
    return run;
  }

  private flush() {
    return this.serial(async () => {
      if (!this.pending.size || this.state === 'auth') return;
      const sent = this.pending;
      this.inflight = sent;
      this.pending = new Map();
      try {
        const res = await api<SyncResponse>('/api/ops', { since: this.rev, ops: [...sent.values()] });
        this.inflight = null;
        this.apply(res, [...sent.keys()], false);
      } catch (err) {
        // Put the batch back underneath anything written since.
        const back = new Map(sent);
        for (const [k, op] of this.pending) back.set(k, back.has(k) ? mergeOps(back.get(k)!, op) : op);
        this.pending = back;
        this.inflight = null;
        throw err;
      } finally {
        this.pendingCount = this.pending.size;
      }
      if (this.pending.size) this.flushSoon();
    });
  }

  private pull() {
    return this.serial(async () => {
      const res = await api<SyncResponse>(`/api/sync?since=${this.rev}`);
      this.apply(res, [], true);
    });
  }

  private apply(res: SyncResponse, local: string[], fromPull: boolean) {
    const touched = new Set(local);
    const remote: string[] = [];
    if (res.full) {
      for (const k of this.base.keys()) touched.add(k);
      this.base.clear();
    }
    for (const c of res.changes) {
      const k = keyOf(c.kind, c.id);
      const prev = this.base.get(k);
      if (!prev || !sameValue(prev.data, c.data) || prev.deleted !== c.deleted) {
        if (!local.includes(k)) remote.push(k);
      }
      this.base.set(k, { data: c.data, deleted: c.deleted, updated: c.updated });
      touched.add(k);
    }
    this.rev = res.rev;
    for (const k of touched) this.refresh(k);
    this.retryDelay = 1000;
    this.lastError = '';
    this.online = true;
    this.state = this.pending.size || this.inflight?.size ? 'syncing' : 'synced';
    this.persistSoon();
    this.resolveFirstSync();
    if (remote.length && (fromPull || local.length)) for (const fn of this.remoteListeners) fn(remote);
  }

  private handleError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      this.state = 'auth';
      this.events?.close();
      return;
    }
    this.setOffline(err instanceof Error ? err.message : String(err));
  }

  private setOffline(reason: string) {
    this.state = 'offline';
    this.lastError = reason;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.reconnect(), this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
  }

  // ---- view maintenance

  private target(kind: Kind): Record<string, Doc> {
    switch (kind) {
      case 'item':
        return this.items as unknown as Record<string, Doc>;
      case 'status':
        return this.statuses as unknown as Record<string, Doc>;
      case 'tag':
        return this.tags as unknown as Record<string, Doc>;
      default:
        return this.settings;
    }
  }

  /** Recomputes one entity in the reactive view, touching only fields that changed. */
  private refresh(k: string) {
    const [kind, id] = splitKey(k);
    const merged = this.peek(kind, id);
    const map = this.target(kind);
    if (!merged || merged.deleted) {
      if (id in map) delete map[id];
      return;
    }
    const next = normalize(kind, id, merged.data);
    const cur = map[id];
    if (!cur) {
      map[id] = next;
      return;
    }
    for (const f of Object.keys(next)) if (!sameValue(cur[f], next[f])) cur[f] = next[f];
    for (const f of Object.keys(cur)) if (!(f in next)) delete cur[f];
  }

  // ---- persistence

  private persistSoon() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistNow(), 500);
  }

  private persistNow() {
    clearTimeout(this.persistTimer);
    const pending = new Map(this.inflight ?? []);
    for (const [k, op] of this.pending) pending.set(k, pending.has(k) ? mergeOps(pending.get(k)!, op) : op);
    const snap: Snapshot = { v: 1, rev: this.rev, base: [...this.base], pending: [...pending.values()] };
    void idbSet('replica', snap);
  }
}
