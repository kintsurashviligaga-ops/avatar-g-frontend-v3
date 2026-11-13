/** @jest-environment node */
/** lib/memory/reembed: batching, cursor, dry run and failure rules, with mocked database and embed calls. */
import { clampLimit, pendingFilter, reembedBatch, REEMBED_MAX_LIMIT, type ReembedDeps, type ReembedRow } from './reembed';

const TAG = 'gemini-embedding-001@1536';
const vec = (n: number) => Array.from({ length: 1536 }, () => n);

function fakeDeps(rows: ReembedRow[], over: Partial<ReembedDeps> = {}) {
  const saved: Array<{ id: string; tag: string; len: number }> = [];
  const deps: ReembedDeps = {
    countPending: jest.fn(async () => rows.length),
    fetchBatch: jest.fn(async ({ cursor, limit }) => rows.filter((r) => !cursor || r.id > cursor).slice(0, limit)),
    embed: jest.fn(async () => vec(0.1)),
    save: jest.fn(async ({ id, tag, embedding }) => {
      saved.push({ id, tag, len: embedding.length });
      return true;
    }),
    ...over,
  };
  return { deps, saved };
}

const rows = (n: number): ReembedRow[] => Array.from({ length: n }, (_, i) => ({ id: `id-${String(i).padStart(3, '0')}`, text: `fact ${i}` }));

test('a dry run is the default: it counts and lists, but embeds and writes nothing', async () => {
  const { deps, saved } = fakeDeps(rows(3));
  const r = await reembedBatch({ table: 'memories', tag: TAG }, deps);
  expect(r).toMatchObject({ dryRun: true, pendingBefore: 3, scanned: 3, updated: 0, failed: 0, nextCursor: null });
  expect(deps.embed).not.toHaveBeenCalled();
  expect(saved).toEqual([]);
});

test('a real run gives every row a 1536 vector and the current tag', async () => {
  const { deps, saved } = fakeDeps(rows(3));
  const r = await reembedBatch({ table: 'memories', tag: TAG, dryRun: false }, deps);
  expect(r).toMatchObject({ updated: 3, failed: 0, failedIds: [] });
  expect(saved.map((s) => s.tag)).toEqual([TAG, TAG, TAG]);
  expect(saved.every((s) => s.len === 1536)).toBe(true);
});

test('a full batch hands back a cursor; following it reaches the end without repeating a row', async () => {
  const all = rows(5);
  const { deps, saved } = fakeDeps(all);
  const first = await reembedBatch({ table: 'rag_documents', tag: TAG, dryRun: false, limit: 2 }, deps);
  expect(first.nextCursor).toBe('id-001');
  const second = await reembedBatch({ table: 'rag_documents', tag: TAG, dryRun: false, limit: 2, cursor: first.nextCursor }, deps);
  const third = await reembedBatch({ table: 'rag_documents', tag: TAG, dryRun: false, limit: 2, cursor: second.nextCursor }, deps);
  expect(third.nextCursor).toBeNull();
  expect(saved.map((s) => s.id)).toEqual(all.map((r) => r.id));
});

test('a row whose embed fails (or whose text is empty) is left as it was and reported, never written with no vector', async () => {
  const embedFn = jest.fn(async (t: string) => (t === 'fact 1' ? null : vec(0.2)));
  const input = [...rows(3), { id: 'id-009', text: '   ' }];
  const { deps, saved } = fakeDeps(input, { embed: embedFn });
  const r = await reembedBatch({ table: 'memories', tag: TAG, dryRun: false }, deps);
  expect(r).toMatchObject({ updated: 2, failed: 2, failedIds: ['id-001', 'id-009'] });
  expect(saved.map((s) => s.id)).toEqual(['id-000', 'id-002']);
  expect(embedFn).not.toHaveBeenCalledWith('   ');
});

test('a failed save counts as a failure', async () => {
  const { deps } = fakeDeps(rows(2), { save: jest.fn(async () => false) });
  const r = await reembedBatch({ table: 'memories', tag: TAG, dryRun: false }, deps);
  expect(r).toMatchObject({ updated: 0, failed: 2 });
});

test('limit is clamped to 1..200 and defaults to 50', () => {
  expect(clampLimit(undefined)).toBe(50);
  expect(clampLimit(0)).toBe(1);
  expect(clampLimit(10_000)).toBe(REEMBED_MAX_LIMIT);
  expect(clampLimit('7')).toBe(50);
});

test('the pending filter catches no embedding, no tag and another tag, with the tag quoted', () => {
  expect(pendingFilter(TAG)).toBe('embedding.is.null,embedding_model.is.null,embedding_model.neq."gemini-embedding-001@1536"');
  expect(pendingFilter('a"b')).not.toContain('a"b');
});
