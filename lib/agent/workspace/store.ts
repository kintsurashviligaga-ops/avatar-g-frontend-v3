/**
 * lib/agent/workspace/store.ts — a user's workspaces and their files, with versions (GG's 2026-11-06 audit, ACTION 2).
 *
 * Kept in the user's private storage (a private bucket, every object under their user id), so it needs no new table:
 *
 *   {uid}/index.json                          the user's workspaces: id, title, created, updated
 *   {uid}/{ws}/.ws/manifest.json              each live file's current version, size, hash, who wrote it; each file's
 *                                             history (the last WS_MAX_VERSIONS versions, deletes included)
 *   {uid}/{ws}/f/{key(path)}@{v}              the bytes of version v of `path`. Never overwritten: a write is a new
 *                                             version, so the one before stays readable and restorable. key(path) is
 *                                             a hash of the path: Storage refuses many characters a user's file name
 *                                             can have (Georgian letters among them), and the manifest holds the name.
 *
 * A delete marks the file deleted (a version with no bytes); restore brings any kept version back as a new version.
 * Nothing the user had is lost by an agent's write or delete until it falls out of the WS_MAX_VERSIONS history.
 *
 * ⚠️ ONE WRITER AT A TIME PER WORKSPACE, PER INSTANCE. The manifest is read, changed and written back; two writes at
 * once on one instance are queued here, but two serverless instances writing the same workspace in the same second
 * can still lose one manifest update (the bytes stay in storage, the manifest misses them). A chat writes one step at
 * a time, so this is accepted for v1 and named here, not hidden.
 *
 * Every effect is a BlobStore passed in: tests run on a Map; live.ts wires Supabase Storage.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  cleanTitle, isWorkspaceId, normalizeWsPath, wsContentType,
  WS_MAX_FILE_BYTES, WS_MAX_FILES, WS_MAX_TOTAL_BYTES, WS_MAX_VERSIONS, WS_MAX_WORKSPACES,
} from './paths';

export interface BlobStore {
  get(path: string): Promise<Buffer | null>;
  put(path: string, bytes: Buffer, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  /** A link that opens the object for `ttlSec` seconds, or null. */
  sign(path: string, ttlSec: number, downloadName?: string): Promise<string | null>;
}

export interface WorkspaceInfo { id: string; title: string; createdAt: string; updatedAt: string }

export interface FileVersion {
  v: number;
  bytes: number;
  sha256: string;
  updatedAt: string;
  /** 'user' | 'agent' | 'run:<jobId>' | 'restore:<v>' */
  by: string;
  deleted?: true;
}

export interface WsFile extends FileVersion { path: string; type: string }

interface Manifest {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Live files only. */
  files: Record<string, FileVersion>;
  /** Every path ever written, newest last, at most WS_MAX_VERSIONS each. */
  history: Record<string, FileVersion[]>;
  /** Highest version number ever given per path, so a number is never reused after pruning. */
  last: Record<string, number>;
}

export type WsError = 'bad_input' | 'not_found' | 'too_large' | 'too_many' | 'storage_failed';
export type WsResult<T> = ({ ok: true } & T) | { ok: false; error: WsError; message: string };

const fail = (error: WsError, message: string) => ({ ok: false as const, error, message });

const indexPath = (uid: string) => `${uid}/index.json`;
const manifestPath = (uid: string, ws: string) => `${uid}/${ws}/.ws/manifest.json`;
const blobPath = (uid: string, ws: string, path: string, v: number) =>
  `${uid}/${ws}/f/${createHash('sha256').update(path).digest('hex').slice(0, 40)}@${v}`;

export function newWorkspaceId(): string {
  return `ws_${randomBytes(8).toString('hex')}`;
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** A user id as the store will use it in a path: a uuid-like token only. */
function okUid(uid: string): boolean {
  return /^[A-Za-z0-9_-]{6,64}$/.test(uid);
}

export interface WorkspaceStoreOpts { now?: () => Date; newId?: () => string }

export function workspaceStore(blobs: BlobStore, opts: WorkspaceStoreOpts = {}) {
  const now = () => (opts.now ? opts.now() : new Date()).toISOString();
  const newId = opts.newId ?? newWorkspaceId;
  const queues = new Map<string, Promise<unknown>>();

  /** Run `fn` after every earlier write to the same key on this instance. */
  function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    queues.set(key, next);
    void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => undefined);
    return next;
  }

  async function readJson<T>(path: string): Promise<T | null> {
    const b = await blobs.get(path);
    if (!b) return null;
    try { return JSON.parse(b.toString('utf8')) as T; } catch { return null; }
  }
  const writeJson = (path: string, v: unknown) => blobs.put(path, Buffer.from(JSON.stringify(v)), 'application/json');

  async function index(uid: string): Promise<WorkspaceInfo[]> {
    const j = await readJson<{ workspaces?: WorkspaceInfo[] }>(indexPath(uid));
    return Array.isArray(j?.workspaces) ? j!.workspaces.filter((w) => isWorkspaceId(w?.id)) : [];
  }

  async function manifest(uid: string, ws: string): Promise<Manifest | null> {
    if (!okUid(uid) || !isWorkspaceId(ws)) return null;
    const m = await readJson<Manifest>(manifestPath(uid, ws));
    if (!m || m.id !== ws) return null;
    m.files ??= {}; m.history ??= {}; m.last ??= {};
    return m;
  }

  async function touchIndex(uid: string, m: Manifest): Promise<void> {
    await serial(`idx:${uid}`, async () => {
      const list = await index(uid);
      const i = list.findIndex((w) => w.id === m.id);
      const row = { id: m.id, title: m.title, createdAt: m.createdAt, updatedAt: m.updatedAt };
      if (i >= 0) list[i] = row; else list.push(row);
      await writeJson(indexPath(uid), { workspaces: list });
    });
  }

  function pushHistory(m: Manifest, path: string, ver: FileVersion): number[] {
    const h = (m.history[path] ??= []);
    h.push(ver);
    const dropped: number[] = [];
    while (h.length > WS_MAX_VERSIONS) {
      const old = h.shift()!;
      if (!old.deleted) dropped.push(old.v);
    }
    return dropped;
  }

  const store = {
    async list(uid: string): Promise<WsResult<{ workspaces: WorkspaceInfo[] }>> {
      if (!okUid(uid)) return fail('bad_input', 'user');
      try {
        const w = await index(uid);
        return { ok: true, workspaces: w.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
      } catch { return fail('storage_failed', 'Storage did not answer.'); }
    },

    async create(uid: string, title?: unknown): Promise<WsResult<{ workspace: WorkspaceInfo }>> {
      if (!okUid(uid)) return fail('bad_input', 'user');
      try {
        const existing = await index(uid);
        if (existing.length >= WS_MAX_WORKSPACES) return fail('too_many', `At most ${WS_MAX_WORKSPACES} workspaces.`);
        const at = now();
        const m: Manifest = { id: newId(), title: cleanTitle(title), createdAt: at, updatedAt: at, files: {}, history: {}, last: {} };
        await writeJson(manifestPath(uid, m.id), m);
        await touchIndex(uid, m);
        return { ok: true, workspace: { id: m.id, title: m.title, createdAt: at, updatedAt: at } };
      } catch { return fail('storage_failed', 'Storage did not answer.'); }
    },

    /** The workspace with this title (case-insensitive), made if missing: Agent G's default „main". */
    async ensure(uid: string, title: string): Promise<WsResult<{ workspace: WorkspaceInfo }>> {
      const l = await store.list(uid);
      if (!l.ok) return l;
      const t = cleanTitle(title).toLowerCase();
      const found = l.workspaces.find((w) => w.title.toLowerCase() === t);
      return found ? { ok: true, workspace: found } : store.create(uid, title);
    },

    async files(uid: string, ws: string): Promise<WsResult<{ workspace: WorkspaceInfo; files: WsFile[]; totalBytes: number }>> {
      try {
        const m = await manifest(uid, ws);
        if (!m) return fail('not_found', 'No such workspace.');
        const files = Object.entries(m.files)
          .map(([path, f]) => ({ path, type: wsContentType(path), ...f }))
          .sort((a, b) => a.path.localeCompare(b.path));
        return {
          ok: true,
          workspace: { id: m.id, title: m.title, createdAt: m.createdAt, updatedAt: m.updatedAt },
          files,
          totalBytes: files.reduce((s, f) => s + f.bytes, 0),
        };
      } catch { return fail('storage_failed', 'Storage did not answer.'); }
    },

    async history(uid: string, ws: string, rawPath: unknown): Promise<WsResult<{ path: string; versions: FileVersion[] }>> {
      const path = normalizeWsPath(rawPath);
      if (!path) return fail('bad_input', 'A file path inside the workspace is needed.');
      try {
        const m = await manifest(uid, ws);
        if (!m) return fail('not_found', 'No such workspace.');
        const versions = m.history[path];
        if (!versions?.length) return fail('not_found', 'No such file.');
        return { ok: true, path, versions: [...versions].reverse() };
      } catch { return fail('storage_failed', 'Storage did not answer.'); }
    },

    /** The bytes of `path` (its live version, or version `v` if kept). */
    async read(uid: string, ws: string, rawPath: unknown, v?: number): Promise<WsResult<{ path: string; version: FileVersion; bytes: Buffer }>> {
      const path = normalizeWsPath(rawPath);
      if (!path) return fail('bad_input', 'A file path inside the workspace is needed.');
      try {
        const m = await manifest(uid, ws);
        if (!m) return fail('not_found', 'No such workspace.');
        const ver = v === undefined ? m.files[path] : m.history[path]?.find((h) => h.v === v && !h.deleted);
        if (!ver) return fail('not_found', v === undefined ? 'No such file.' : 'That version is not kept.');
        const bytes = await blobs.get(blobPath(uid, ws, path, ver.v));
        if (!bytes) return fail('storage_failed', 'The file could not be read.');
        return { ok: true, path, version: ver, bytes };
      } catch { return fail('storage_failed', 'Storage did not answer.'); }
    },

    /** Write several files as one change (a code run's results). Each is a new version; the old one stays kept. */
    async writeMany(uid: string, ws: string, items: Array<{ path: unknown; bytes: Buffer }>, by: string): Promise<WsResult<{ written: WsFile[] }>> {
      if (!items.length) return { ok: true, written: [] };
      const clean: Array<{ path: string; bytes: Buffer }> = [];
      for (const it of items) {
        const path = normalizeWsPath(it.path);
        if (!path) return fail('bad_input', `Not a workspace path: ${String(it.path).slice(0, 80)}`);
        if (!Buffer.isBuffer(it.bytes)) return fail('bad_input', 'bytes');
        if (it.bytes.length > WS_MAX_FILE_BYTES) return fail('too_large', `${path} is over ${WS_MAX_FILE_BYTES / 1024 / 1024} MB.`);
        clean.push({ path, bytes: it.bytes });
      }
      return serial(`ws:${uid}:${ws}`, async () => {
        try {
          const m = await manifest(uid, ws);
          if (!m) return fail('not_found', 'No such workspace.');
          const next = { ...m.files };
          for (const it of clean) next[it.path] = { v: 0, bytes: it.bytes.length, sha256: '', updatedAt: '', by };
          if (Object.keys(next).length > WS_MAX_FILES) return fail('too_many', `At most ${WS_MAX_FILES} files in a workspace.`);
          const total = Object.values(next).reduce((s, f) => s + f.bytes, 0);
          if (total > WS_MAX_TOTAL_BYTES) return fail('too_large', `A workspace holds at most ${WS_MAX_TOTAL_BYTES / 1024 / 1024} MB.`);

          const at = now();
          const written: WsFile[] = [];
          const drop: string[] = [];
          for (const it of clean) {
            const hash = sha(it.bytes);
            const cur = m.files[it.path];
            // The same bytes again: nothing new to keep.
            if (cur && cur.sha256 === hash) { written.push({ path: it.path, type: wsContentType(it.path), ...cur }); continue; }
            const v = (m.last[it.path] ?? 0) + 1;
            await blobs.put(blobPath(uid, ws, it.path, v), it.bytes, wsContentType(it.path));
            const ver: FileVersion = { v, bytes: it.bytes.length, sha256: hash, updatedAt: at, by };
            m.last[it.path] = v;
            m.files[it.path] = ver;
            for (const old of pushHistory(m, it.path, ver)) drop.push(blobPath(uid, ws, it.path, old));
            written.push({ path: it.path, type: wsContentType(it.path), ...ver });
          }
          m.updatedAt = at;
          await writeJson(manifestPath(uid, ws), m);
          if (drop.length) await blobs.remove(drop).catch(() => undefined);
          await touchIndex(uid, m).catch(() => undefined);
          return { ok: true, written };
        } catch { return fail('storage_failed', 'Storage did not answer.'); }
      });
    },

    async write(uid: string, ws: string, path: unknown, bytes: Buffer, by: string): Promise<WsResult<{ file: WsFile }>> {
      const r = await store.writeMany(uid, ws, [{ path, bytes }], by);
      return r.ok ? { ok: true, file: r.written[0]! } : r;
    },

    /** Mark `path` deleted. Its kept versions stay; restore brings one back. */
    async remove(uid: string, ws: string, rawPath: unknown, by: string): Promise<WsResult<{ path: string; keptVersions: number }>> {
      const path = normalizeWsPath(rawPath);
      if (!path) return fail('bad_input', 'A file path inside the workspace is needed.');
      return serial(`ws:${uid}:${ws}`, async () => {
        try {
          const m = await manifest(uid, ws);
          if (!m) return fail('not_found', 'No such workspace.');
          if (!m.files[path]) return fail('not_found', 'No such file.');
          const at = now();
          const v = (m.last[path] ?? 0) + 1;
          m.last[path] = v;
          delete m.files[path];
          const drop = pushHistory(m, path, { v, bytes: 0, sha256: '', updatedAt: at, by, deleted: true });
          m.updatedAt = at;
          await writeJson(manifestPath(uid, ws), m);
          if (drop.length) await blobs.remove(drop.map((o) => blobPath(uid, ws, path, o))).catch(() => undefined);
          await touchIndex(uid, m).catch(() => undefined);
          return { ok: true, path, keptVersions: (m.history[path] ?? []).filter((h) => !h.deleted).length };
        } catch { return fail('storage_failed', 'Storage did not answer.'); }
      });
    },

    /** Bring version `v` of `path` back as its newest version (works after a delete too). */
    async restore(uid: string, ws: string, rawPath: unknown, v: number, by: string): Promise<WsResult<{ file: WsFile }>> {
      const old = await store.read(uid, ws, rawPath, v);
      if (!old.ok) return old;
      return store.write(uid, ws, old.path, old.bytes, by === 'user' ? `restore:${v}` : `${by};restore:${v}`);
    },

    /** A link that downloads the live version of `path` for `ttlSec` seconds. */
    async link(uid: string, ws: string, rawPath: unknown, ttlSec = 7 * 24 * 3600): Promise<WsResult<{ path: string; url: string; version: FileVersion }>> {
      const path = normalizeWsPath(rawPath);
      if (!path) return fail('bad_input', 'A file path inside the workspace is needed.');
      try {
        const m = await manifest(uid, ws);
        if (!m) return fail('not_found', 'No such workspace.');
        const ver = m.files[path];
        if (!ver) return fail('not_found', 'No such file.');
        const url = await blobs.sign(blobPath(uid, ws, path, ver.v), ttlSec, path.split('/').pop());
        if (!url) return fail('storage_failed', 'No link could be made.');
        return { ok: true, path, url, version: ver };
      } catch { return fail('storage_failed', 'Storage did not answer.'); }
    },

    /** Every live file's bytes, for a code run (at most WS_MAX_TOTAL_BYTES by construction). */
    async snapshot(uid: string, ws: string): Promise<WsResult<{ files: Array<{ path: string; bytes: Buffer; sha256: string }> }>> {
      const l = await store.files(uid, ws);
      if (!l.ok) return l;
      try {
        const out: Array<{ path: string; bytes: Buffer; sha256: string }> = [];
        for (const f of l.files) {
          const b = await blobs.get(blobPath(uid, ws, f.path, f.v));
          if (!b) return fail('storage_failed', `${f.path} could not be read.`);
          out.push({ path: f.path, bytes: b, sha256: f.sha256 });
        }
        return { ok: true, files: out };
      } catch { return fail('storage_failed', 'Storage did not answer.'); }
    },
  };
  return store;
}

export type WorkspaceStore = ReturnType<typeof workspaceStore>;

/** A BlobStore on a Map: the tests' storage. */
export function memoryBlobs(): BlobStore & { data: Map<string, Buffer> } {
  const data = new Map<string, Buffer>();
  return {
    data,
    async get(p) { return data.get(p) ?? null; },
    async put(p, b) { data.set(p, Buffer.from(b)); },
    async remove(ps) { for (const p of ps) data.delete(p); },
    async sign(p, ttl) { return data.has(p) ? `mem://${p}?ttl=${ttl}` : null; },
  };
}
