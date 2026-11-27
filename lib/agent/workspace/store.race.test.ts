/** @jest-environment node */
// Phase 8.23: two serverless instances writing one workspace. Each "instance" is its own workspaceStore (its own
// in-instance queue) over the SAME storage, which is what two Vercel functions see.
import { memoryBlobs, memoryLock, workspaceStore, VERSION_PUT_TRIES, type BlobStore, type WorkspaceStoreOpts } from './store';

const UID = 'user_123456';
const b = (s: string) => Buffer.from(s);

function twoInstances(opts: WorkspaceStoreOpts = {}, blobs: BlobStore & { data: Map<string, Buffer> } = memoryBlobs()) {
  let n = 0;
  const base = { now: () => new Date('2026-11-27T12:00:00Z'), newId: () => `ws_race${String(++n).padStart(4, '0')}`, ...opts };
  return { blobs, a: workspaceStore(blobs, base), b: workspaceStore(blobs, base) };
}

/** Storage that lets both writers read the manifest before either uploads: the race window, made certain. */
function racyBlobs() {
  const inner = memoryBlobs();
  let gate: (() => void) | null = null;
  let held: Promise<void> | null = null;
  let reads = 0;
  const blobs = {
    ...inner,
    data: inner.data,
    async get(p: string) {
      const r = await inner.get(p);
      if (held && p.endsWith('.ws/manifest.json') && ++reads === 2) gate?.();
      if (held && p.endsWith('.ws/manifest.json')) await held;
      return r;
    },
    /** From now on, hold every manifest read until two have happened. */
    arm() { reads = 0; held = new Promise<void>((r) => { gate = r; }); },
  };
  return blobs;
}

async function newWs(store: ReturnType<typeof workspaceStore>) {
  const r = await store.create(UID, 'Race');
  if (!r.ok) throw new Error(r.message);
  return r.workspace.id;
}

describe('workspace write race, flags OFF (behaviour before Phase 8.23, kept)', () => {
  it('two instances writing the same file pick the same version and the second overwrites the first one\'s bytes', async () => {
    const blobs = racyBlobs();
    const { a, b: bStore } = twoInstances({}, blobs);
    const ws = await newWs(a);
    blobs.arm();
    const [ra, rb] = await Promise.all([a.write(UID, ws, 'x.txt', b('from A'), 'a'), bStore.write(UID, ws, 'x.txt', b('from B'), 'b')]);
    expect(ra.ok && rb.ok).toBe(true);
    if (!ra.ok || !rb.ok) return;
    expect(ra.file.v).toBe(1);
    expect(rb.file.v).toBe(1);
    const stored = [...blobs.data.entries()].filter(([k]) => k.includes('/f/')).map(([, v]) => v.toString());
    expect(stored).toHaveLength(1); // one of the two writes' bytes is gone: the bug this phase fixes
  });

  it('a store with no switches never calls putNew', async () => {
    const blobs = memoryBlobs();
    const putNew = jest.spyOn(blobs, 'putNew');
    const store = workspaceStore(blobs);
    const ws = await newWs(store);
    expect((await store.write(UID, ws, 'a.txt', b('1'), 'user')).ok).toBe(true);
    expect(putNew).not.toHaveBeenCalled();
  });
});

describe('WORKSPACE_CREATE_ONLY: create-only version blobs', () => {
  it('keeps both writers\' bytes: the second moves to the next free version', async () => {
    const blobs = racyBlobs();
    const { a, b: bStore } = twoInstances({ createOnly: true }, blobs);
    const ws = await newWs(a);
    blobs.arm();
    const [ra, rb] = await Promise.all([a.write(UID, ws, 'x.txt', b('from A'), 'a'), bStore.write(UID, ws, 'x.txt', b('from B'), 'b')]);
    expect(ra.ok && rb.ok).toBe(true);
    if (!ra.ok || !rb.ok) return;
    expect(new Set([ra.file.v, rb.file.v])).toEqual(new Set([1, 2]));
    const stored = [...blobs.data.entries()].filter(([k]) => k.includes('/f/')).map(([, v]) => v.toString()).sort();
    expect(stored).toEqual(['from A', 'from B']);
  });

  it(`answers busy (409) after ${VERSION_PUT_TRIES} taken versions and never overwrites any of them`, async () => {
    const blobs = memoryBlobs();
    const store = workspaceStore(blobs, { createOnly: true, newId: () => 'ws_busy0001' });
    const ws = await newWs(store);
    // Another writer already stored v1..v3 for this path, and its manifest update is not in yet.
    const first = await store.write(UID, ws, 'y.txt', b('mine-0'), 'user');
    expect(first.ok).toBe(true);
    const key = [...blobs.data.keys()].find((k) => k.includes('/f/'))!;
    const stem = key.slice(0, key.lastIndexOf('@'));
    for (let v = 2; v <= 1 + VERSION_PUT_TRIES; v++) blobs.data.set(`${stem}@${v}`, b(`theirs-${v}`));
    const r = await store.write(UID, ws, 'y.txt', b('mine-1'), 'user');
    expect(r).toMatchObject({ ok: false, error: 'busy' });
    for (let v = 2; v <= 1 + VERSION_PUT_TRIES; v++) expect(blobs.data.get(`${stem}@${v}`)!.toString()).toBe(`theirs-${v}`);
    // The manifest still points at the version the store wrote itself.
    const live = await store.read(UID, ws, 'y.txt');
    expect(live.ok && live.bytes.toString()).toBe('mine-0');
  });

  it('falls back to the old put when the BlobStore has no putNew', async () => {
    const { putNew: _drop, ...rest } = memoryBlobs();
    const store = workspaceStore(rest, { createOnly: true });
    const ws = await newWs(store);
    const r = await store.write(UID, ws, 'a.txt', b('1'), 'user');
    expect(r.ok && r.file.v).toBe(1);
  });

  it('restore and normal version history still work', async () => {
    const store = workspaceStore(memoryBlobs(), { createOnly: true });
    const ws = await newWs(store);
    await store.write(UID, ws, 'a.txt', b('one'), 'user');
    await store.write(UID, ws, 'a.txt', b('two'), 'user');
    const r = await store.restore(UID, ws, 'a.txt', 1, 'user');
    expect(r.ok && r.file.v).toBe(3);
    const now = await store.read(UID, ws, 'a.txt');
    expect(now.ok && now.bytes.toString()).toBe('one');
  });
});

describe('WORKSPACE_LOCKS: one writer per workspace across instances', () => {
  // Manifest reads that take a while: both writers read the old manifest before either writes it back.
  function slowManifestBlobs() {
    const inner = memoryBlobs();
    return { ...inner, data: inner.data, async get(p: string) {
      const r = await inner.get(p);
      if (p.endsWith('.ws/manifest.json')) await new Promise((res) => setTimeout(res, 15));
      return r;
    } };
  }
  const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 10)));

  it('without the lock, two instances writing different files lose one manifest entry (the bug)', async () => {
    const { a, b: bStore } = twoInstances({}, slowManifestBlobs());
    const ws = await newWs(a);
    await Promise.all([a.write(UID, ws, 'a.txt', b('A'), 'a'), bStore.write(UID, ws, 'b.txt', b('B'), 'b')]);
    const files = await a.files(UID, ws);
    expect(files.ok && files.files.length).toBe(1);
  });

  it('with the lock, the same two writes both land in the manifest', async () => {
    const lock = memoryLock();
    const { a, b: bStore } = twoInstances({ lock, sleep: realSleep }, slowManifestBlobs());
    const ws = await newWs(a);
    const [ra, rb] = await Promise.all([a.write(UID, ws, 'a.txt', b('A'), 'a'), bStore.write(UID, ws, 'b.txt', b('B'), 'b')]);
    expect(ra.ok && rb.ok).toBe(true);
    const files = await a.files(UID, ws);
    expect(files.ok && files.files.map((f) => f.path).sort()).toEqual(['a.txt', 'b.txt']);
    expect(lock.rows.size).toBe(0);
  });

  it('six concurrent writers across two instances keep every file', async () => {
    const lock = memoryLock();
    const { a, b: bStore } = twoInstances({ lock, sleep: async () => undefined });
    const ws = await newWs(a);
    const writes = Array.from({ length: 6 }, (_, i) => (i % 2 ? a : bStore).write(UID, ws, `f${i}.txt`, b(String(i)), 'x'));
    const res = await Promise.all(writes);
    expect(res.every((r) => r.ok)).toBe(true);
    const files = await a.files(UID, ws);
    expect(files.ok && files.files.map((f) => f.path).sort()).toEqual(['f0.txt', 'f1.txt', 'f2.txt', 'f3.txt', 'f4.txt', 'f5.txt']);
    expect(lock.rows.size).toBe(0); // every lease released
  });

  it('answers busy when another holder keeps the lease past the wait', async () => {
    const lock = memoryLock();
    const store = workspaceStore(memoryBlobs(), { lock, lockWaitMs: 1000, sleep: async () => undefined, newId: () => 'ws_lock0001' });
    const ws = await newWs(store);
    await lock.acquire(UID, ws, 'someone-else-1', 30);
    const acquire = jest.spyOn(lock, 'acquire');
    const r = await store.write(UID, ws, 'a.txt', b('1'), 'user');
    expect(r).toMatchObject({ ok: false, error: 'busy' });
    expect(acquire).toHaveBeenCalledTimes(1 + Math.ceil(1000 / 250));
    expect((await store.remove(UID, ws, 'a.txt', 'user')).ok).toBe(false);
  });

  it('takes over a lease whose holder died (TTL passed)', async () => {
    let t = 0;
    const lock = memoryLock(() => t);
    const store = workspaceStore(memoryBlobs(), { lock, sleep: async () => { t += 250; }, newId: () => 'ws_lock0002' });
    const ws = await newWs(store);
    await lock.acquire(UID, ws, 'dead-holder-1', 1); // 1 s lease, never released
    const r = await store.write(UID, ws, 'a.txt', b('1'), 'user');
    expect(r.ok).toBe(true);
  });

  it('writes without the lock when the lock cannot be reached (SQL not applied yet)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const lock = { acquire: jest.fn().mockRejectedValue(new Error('function workspace_lock_acquire does not exist')), release: jest.fn() };
    const store = workspaceStore(memoryBlobs(), { lock });
    const ws = await newWs(store);
    const r = await store.write(UID, ws, 'a.txt', b('1'), 'user');
    expect(r.ok).toBe(true);
    expect(lock.release).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[workspace] lock unavailable'), expect.any(String));
    warn.mockRestore();
  });

  it('releases the lease even when the write fails', async () => {
    const lock = memoryLock();
    const blobs = memoryBlobs();
    const store = workspaceStore(blobs, { lock, newId: () => 'ws_lock0003' });
    const ws = await newWs(store);
    jest.spyOn(blobs, 'put').mockRejectedValueOnce(new Error('storage down'));
    const r = await store.write(UID, ws, 'a.txt', b('1'), 'user');
    expect(r).toMatchObject({ ok: false, error: 'storage_failed' });
    expect(lock.rows.size).toBe(0);
  });
});
