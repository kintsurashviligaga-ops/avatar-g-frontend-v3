/** @jest-environment node */
import { isTextPath, isWorkspaceId, normalizeWsPath, wsContentType, WS_MAX_FILE_BYTES, WS_MAX_VERSIONS } from './paths';
import { memoryBlobs, workspaceStore } from './store';

const UID = 'user_123456';
const b = (s: string) => Buffer.from(s);

function setup() {
  const blobs = memoryBlobs();
  let t = Date.parse('2026-11-06T10:00:00Z');
  let n = 0;
  const store = workspaceStore(blobs, { now: () => new Date((t += 1000)), newId: () => `ws_test${String(++n).padStart(4, '0')}` });
  return { blobs, store };
}

async function ws(store: ReturnType<typeof setup>['store']) {
  const r = await store.create(UID, 'Sales');
  if (!r.ok) throw new Error(r.message);
  return r.workspace.id;
}

describe('workspace paths', () => {
  it('takes plain relative paths and refuses every way out of the folder', () => {
    expect(normalizeWsPath('data/sales.csv')).toBe('data/sales.csv');
    expect(normalizeWsPath('./out/a.png')).toBe('out/a.png');
    expect(normalizeWsPath('ანგარიში.pdf')).toBe('ანგარიში.pdf');
    for (const bad of ['../x', '/etc/passwd', 'a//b', 'a\\b', 'a/./b', 'a/../b', '', '   ', 'x\u0000y', '.ws/manifest.json', '.ws_main.py', 'a'.repeat(201), 5, null]) {
      expect(normalizeWsPath(bad)).toBeNull();
    }
    expect(isWorkspaceId('ws_abcdef12')).toBe(true);
    expect(isWorkspaceId('ws_../x')).toBe(false);
  });

  it('knows which files are text', () => {
    expect(wsContentType('a.CSV')).toBe('text/csv');
    expect(isTextPath('x.py')).toBe(true);
    expect(isTextPath('x.png')).toBe(false);
    expect(wsContentType('x.unknown')).toBe('application/octet-stream');
  });
});

describe('workspace store', () => {
  it('creates a workspace, writes, lists and reads a file', async () => {
    const { store } = setup();
    const id = await ws(store);
    const w = await store.write(UID, id, 'data/a.csv', b('x,y\n1,2\n'), 'user');
    expect(w).toMatchObject({ ok: true, file: { path: 'data/a.csv', v: 1, bytes: 8, by: 'user', type: 'text/csv' } });
    const l = await store.files(UID, id);
    expect(l.ok && l.files.map((f) => f.path)).toEqual(['data/a.csv']);
    expect(l.ok && l.totalBytes).toBe(8);
    const r = await store.read(UID, id, 'data/a.csv');
    expect(r.ok && r.bytes.toString()).toBe('x,y\n1,2\n');
    expect((await store.list(UID)).ok).toBe(true);
  });

  it('every write is a new version; the old one stays readable and restorable', async () => {
    const { store } = setup();
    const id = await ws(store);
    await store.write(UID, id, 'a.txt', b('one'), 'user');
    await store.write(UID, id, 'a.txt', b('two'), 'agent');
    const old = await store.read(UID, id, 'a.txt', 1);
    expect(old.ok && old.bytes.toString()).toBe('one');
    const back = await store.restore(UID, id, 'a.txt', 1, 'user');
    expect(back).toMatchObject({ ok: true, file: { v: 3, by: 'restore:1' } });
    const now = await store.read(UID, id, 'a.txt');
    expect(now.ok && now.bytes.toString()).toBe('one');
    const h = await store.history(UID, id, 'a.txt');
    expect(h.ok && h.versions.map((v) => v.v)).toEqual([3, 2, 1]);
  });

  it('the same bytes again make no new version', async () => {
    const { store } = setup();
    const id = await ws(store);
    await store.write(UID, id, 'a.txt', b('same'), 'user');
    const again = await store.write(UID, id, 'a.txt', b('same'), 'agent');
    expect(again).toMatchObject({ ok: true, file: { v: 1, by: 'user' } });
  });

  it('a delete is a version too: the file leaves the list, its versions stay, restore brings it back', async () => {
    const { store } = setup();
    const id = await ws(store);
    await store.write(UID, id, 'a.txt', b('keep me'), 'user');
    expect(await store.remove(UID, id, 'a.txt', 'agent')).toEqual({ ok: true, path: 'a.txt', keptVersions: 1 });
    const l = await store.files(UID, id);
    expect(l.ok && l.files).toEqual([]);
    expect((await store.read(UID, id, 'a.txt')).ok).toBe(false);
    const back = await store.restore(UID, id, 'a.txt', 1, 'user');
    expect(back).toMatchObject({ ok: true, file: { v: 3 } });
    expect(await store.remove(UID, id, 'nope.txt', 'agent')).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('keeps at most WS_MAX_VERSIONS versions and drops the oldest bytes from storage', async () => {
    const { store, blobs } = setup();
    const id = await ws(store);
    for (let i = 1; i <= WS_MAX_VERSIONS + 3; i++) await store.write(UID, id, 'a.txt', b(`v${i}`), 'agent');
    const h = await store.history(UID, id, 'a.txt');
    expect(h.ok && h.versions.length).toBe(WS_MAX_VERSIONS);
    expect((await store.read(UID, id, 'a.txt', 1)).ok).toBe(false);
    expect((await store.read(UID, id, 'a.txt', 4)).ok).toBe(true);
    const fileBlobs = [...blobs.data.keys()].filter((k) => k.includes('/f/'));
    expect(fileBlobs).toHaveLength(WS_MAX_VERSIONS);
    // A pruned number is never reused.
    const w = await store.write(UID, id, 'a.txt', b('next'), 'agent');
    expect(w.ok && w.file.v).toBe(WS_MAX_VERSIONS + 4);
  });

  it('stores bytes under a hashed key: no user path reaches a Storage object name', async () => {
    const { store, blobs } = setup();
    const id = await ws(store);
    await store.write(UID, id, 'ანგარიში/შედეგი.csv', b('1'), 'user');
    const keys = [...blobs.data.keys()].filter((k) => k.includes('/f/'));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(new RegExp(`^${UID}/${id}/f/[0-9a-f]{40}@1$`));
  });

  it('refuses bad paths, too-large files, and another user’s or an unknown workspace', async () => {
    const { store } = setup();
    const id = await ws(store);
    expect(await store.write(UID, id, '../x', b('1'), 'user')).toMatchObject({ ok: false, error: 'bad_input' });
    expect(await store.write(UID, id, 'big.bin', Buffer.alloc(WS_MAX_FILE_BYTES + 1), 'user')).toMatchObject({ ok: false, error: 'too_large' });
    expect(await store.files('other_user1', id)).toMatchObject({ ok: false, error: 'not_found' });
    expect(await store.files(UID, 'ws_nothere1')).toMatchObject({ ok: false, error: 'not_found' });
    expect(await store.files('../etc', id)).toMatchObject({ ok: false });
  });

  it('writeMany is one change: a code run’s results land together, tagged with the run', async () => {
    const { store } = setup();
    const id = await ws(store);
    const r = await store.writeMany(UID, id, [{ path: 'out/a.png', bytes: b('p') }, { path: 'out/b.csv', bytes: b('c') }], 'run:job1');
    expect(r.ok && r.written.map((f) => [f.path, f.by])).toEqual([['out/a.png', 'run:job1'], ['out/b.csv', 'run:job1']]);
    // One bad name refuses the whole change.
    expect(await store.writeMany(UID, id, [{ path: 'ok.txt', bytes: b('1') }, { path: '/abs', bytes: b('2') }], 'run:job2')).toMatchObject({ ok: false, error: 'bad_input' });
    const l = await store.files(UID, id);
    expect(l.ok && l.files.map((f) => f.path)).toEqual(['out/a.png', 'out/b.csv']);
  });

  it('serializes writes on one instance, so concurrent writes keep every version', async () => {
    const { store } = setup();
    const id = await ws(store);
    await Promise.all([1, 2, 3, 4, 5].map((i) => store.write(UID, id, `f${i}.txt`, b(String(i)), 'agent')));
    const l = await store.files(UID, id);
    expect(l.ok && l.files.length).toBe(5);
  });

  it('ensure finds the workspace by title or makes it; snapshot and link read the live files', async () => {
    const { store } = setup();
    const a = await store.ensure(UID, 'Agent G');
    const again = await store.ensure(UID, 'agent g');
    expect(a.ok && again.ok && a.workspace.id === again.workspace.id).toBe(true);
    const id = a.ok ? a.workspace.id : '';
    await store.write(UID, id, 'x.txt', b('hello'), 'user');
    const s = await store.snapshot(UID, id);
    expect(s.ok && s.files.map((f) => [f.path, f.bytes.toString()])).toEqual([['x.txt', 'hello']]);
    const link = await store.link(UID, id, 'x.txt', 60);
    expect(link.ok && link.url).toMatch(/^mem:\/\/.*\?ttl=60$/);
  });
});
