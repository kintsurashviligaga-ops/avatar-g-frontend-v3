/** @jest-environment node */
/**
 * The Connectors library: local files are validated, capped, owner-scoped and loaded for a run; every other connector says
 * HONESTLY that it is not wired — no OAuth, no token, no fake file list.
 */
jest.mock('server-only', () => ({}));

import { RESEARCH_ATTACH_MAX, RESEARCH_FILES_MAX, RESEARCH_FILE_MAX_CHARS } from '@/lib/research/context';
import { FakeDb } from '@/lib/research/testing/fakeDb';
import { RESEARCH_DB_OPTIONS } from '@/lib/research/testing/fakes';
import { createLocalFilesStore, normalizeLocalFile } from './localFiles';
import { connectorRegistry, connectorStates, SOON_CONNECTORS, soonProvider } from './registry';

const newDb = () => new FakeDb({}, RESEARCH_DB_OPTIONS);

describe('normalizeLocalFile', () => {
  test('text is tidied, NULs and control characters removed, the name made safe', () => {
    const f = normalizeLocalFile({ name: 'Q3 [final].pdf', mimeType: 'application/pdf', bytes: 1234, text: 'Line one\u0000\r\n\r\n\r\n\r\nLine\u0007two   \n' });
    expect(f).toEqual({ name: 'Q3 final .pdf', mimeType: 'application/pdf', bytes: 1234, text: 'Line one\n\nLine two', truncated: false });
  });

  test('longer than the per-file cap is cut, marked, and still within it', () => {
    const f = normalizeLocalFile({ name: 'a.txt', text: 'x'.repeat(RESEARCH_FILE_MAX_CHARS + 5_000) })!;
    expect(f.truncated).toBe(true);
    expect(f.text.length).toBeLessThanOrEqual(RESEARCH_FILE_MAX_CHARS);
    expect(f.text.endsWith('…')).toBe(true);
  });

  test.each([[{ name: 'a', text: '' }], [{ name: 'a', text: '   \n\n ' }], [{ name: 'a', text: '\u0000\u0001' }], [{ name: 'a', text: 42 }], [{ name: 'a' }]])('%j is refused', (input) => {
    expect(normalizeLocalFile(input as never)).toBeNull();
  });

  test('bytes are clamped, mime is bounded, a missing name becomes "document"', () => {
    expect(normalizeLocalFile({ name: '', text: 'hi', bytes: -5 })).toMatchObject({ name: 'document', bytes: 0, mimeType: null });
    expect(normalizeLocalFile({ name: 'a', text: 'hi', bytes: 9e15, mimeType: 'x'.repeat(500) })).toMatchObject({ bytes: 100 * 1024 * 1024 });
    expect(normalizeLocalFile({ name: 'a', text: 'hi', mimeType: 'x'.repeat(500) })!.mimeType).toHaveLength(120);
  });
});

describe('the local files store', () => {
  test('add → list → delete, owner-scoped; the list never carries the text', async () => {
    const db = newDb();
    const store = createLocalFilesStore(db as never);
    const added = await store.add('u1', { name: 'brief.md', mimeType: 'text/markdown', bytes: 20, text: 'Important clause.' });
    expect(added.ok && added.file).toMatchObject({ name: 'brief.md', chars: 'Important clause.'.length, truncated: false, mimeType: 'text/markdown' });
    await store.add('u2', { name: 'other.txt', text: 'Someone else.' });
    const list = await store.list('u1');
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('Important clause');
    const select = db.ops.find((o) => o.op === 'select' && o.cols?.includes('mime_type'))!;
    expect(select.cols).not.toContain('text_content');
    // a stranger cannot delete it; its owner can
    const id = list[0]!.id;
    expect(await store.remove('u2', id)).toBe(false);
    expect(await store.remove('u1', id)).toBe(true);
    expect(await store.list('u1')).toEqual([]);
    expect(await store.remove('u1', 'not-a-uuid')).toBe(false);
  });

  test(`the per-account cap: the ${RESEARCH_FILES_MAX + 1}th document is refused`, async () => {
    const store = createLocalFilesStore(newDb() as never);
    for (let i = 0; i < RESEARCH_FILES_MAX; i++) expect((await store.add('u1', { name: `f${i}`, text: `text ${i}` })).ok).toBe(true);
    expect(await store.add('u1', { name: 'one-too-many', text: 'x' })).toEqual({ ok: false, code: 'too_many' });
    expect((await store.add('u2', { name: 'fine', text: 'x' })).ok).toBe(true);
  });

  test('empty / unreadable text is refused (a scanned PDF extracts to nothing)', async () => {
    const store = createLocalFilesStore(newDb() as never);
    expect(await store.add('u1', { name: 'scan.pdf', text: '   ' })).toEqual({ ok: false, code: 'empty' });
    expect(await store.add('u1', { name: 'x', text: undefined })).toEqual({ ok: false, code: 'invalid' });
  });

  test('a database failure is "unavailable", never a throw into the route', async () => {
    const db = newDb();
    const store = createLocalFilesStore(db as never);
    db.failNext('research_context_files', 'insert');
    expect(await store.add('u1', { name: 'a', text: 'x' })).toEqual({ ok: false, code: 'unavailable' });
  });

  test('loadForRun: the owner\'s own documents in the order asked; a stranger\'s id, an unknown id or too many are invalid_file', async () => {
    const db = newDb();
    const store = createLocalFilesStore(db as never);
    const a = await store.add('u1', { name: 'a.txt', text: 'AAA' });
    const b = await store.add('u1', { name: 'b.txt', text: 'BBB' });
    const c = await store.add('u2', { name: 'c.txt', text: 'CCC' });
    if (!a.ok || !b.ok || !c.ok) throw new Error('setup');
    const ok = await store.loadForRun('u1', [b.file.id, a.file.id]);
    expect(ok).toEqual({ ok: true, files: [{ id: b.file.id, name: 'b.txt', text: 'BBB' }, { id: a.file.id, name: 'a.txt', text: 'AAA' }] });
    expect(await store.loadForRun('u1', [c.file.id])).toEqual({ ok: false, code: 'invalid_file' });
    expect(await store.loadForRun('u1', [a.file.id, '11111111-1111-4111-8111-111111111111'])).toEqual({ ok: false, code: 'invalid_file' });
    expect(await store.loadForRun('u1', ['not-a-uuid'])).toEqual({ ok: false, code: 'invalid_file' });
    const many = Array.from({ length: RESEARCH_ATTACH_MAX + 1 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`);
    expect(await store.loadForRun('u1', many)).toEqual({ ok: false, code: 'invalid_file' });
    expect(await store.loadForRun('u1', [])).toEqual({ ok: true, files: [] });
    db.failNext('research_context_files', 'select');
    expect(await store.loadForRun('u1', [a.file.id])).toEqual({ ok: false, code: 'unavailable' });
  });
});

describe('the registry tells the truth', () => {
  const states = async (ready: boolean) => connectorStates('u1', connectorRegistry({ localFiles: createLocalFilesStore(newDb() as never), filesTableReady: ready }));

  test('Local files is the ONLY connector that is ready; Drive and the rest are "soon"', async () => {
    const s = await states(true);
    expect(s.map((c) => [c.id, c.status])).toEqual([['local_files', 'ready'], ['google_drive', 'soon'], ['onedrive', 'soon'], ['notion', 'soon'], ['dropbox', 'soon']]);
    expect(s.find((c) => c.id === 'local_files')).toMatchObject({ fileCount: 0 });
  });

  test('without the migrated table Local files is "unavailable", never "ready"', async () => {
    expect((await states(false))[0]).toMatchObject({ id: 'local_files', status: 'unavailable' });
  });

  test('a state exposes only id, label, status and a count — no token, account or scope field can exist', async () => {
    for (const c of await states(true)) expect(Object.keys(c).sort()).toEqual(Object.keys(c.fileCount === undefined ? { id: 1, label: 1, status: 1 } : { id: 1, label: 1, status: 1, fileCount: 1 }).sort());
  });

  test.each(SOON_CONNECTORS.map((c) => [c.id, c.label] as const))('%s refuses to connect, list or read — it never pretends', async (id, label) => {
    const p = soonProvider(id, label);
    expect(await p.status()).toBe('soon');
    expect(await p.connect('u1')).toEqual({ ok: false, reason: 'not_available' });
    expect(await p.listFiles('u1')).toEqual({ ok: false, reason: 'not_connected' });
    expect(await p.read('u1', 'abc')).toEqual({ ok: false, reason: 'not_connected' });
  });

  test('Google Drive in particular is registered as "soon"', () => {
    const drive = connectorRegistry({ localFiles: null, filesTableReady: true }).find((p) => p.id === 'google_drive')!;
    expect(drive.label).toBe('Google Drive');
    return expect(Promise.resolve(drive.status())).resolves.toBe('soon');
  });

  test('local files read() hands back the stored text to the research engine', async () => {
    const store = createLocalFilesStore(newDb() as never);
    const a = await store.add('u1', { name: 'a.txt', text: 'AAA' });
    if (!a.ok) throw new Error('setup');
    const provider = connectorRegistry({ localFiles: store, filesTableReady: true })[0]!;
    expect(await provider.read('u1', a.file.id)).toEqual({ ok: true, name: 'a.txt', text: 'AAA' });
    expect(await provider.read('u2', a.file.id)).toEqual({ ok: false, reason: 'not_found' });
    expect(await provider.connect('u1')).toEqual({ ok: true });
  });
});
