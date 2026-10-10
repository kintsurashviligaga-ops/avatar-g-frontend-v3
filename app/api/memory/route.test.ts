/** @jest-environment node */
/**
 * /api/memory (PART 2, G4): the user sees everything Agent G keeps about them (saved facts and the facts picked out of
 * their turns), switches the picking off, and deletes one fact or everything; every query is the session user's own.
 */
jest.mock('server-only', () => ({}));
import { fakeTables, type FakeTables } from '../../../lib/memory/testing/fakeTables';

let mockDb: FakeTables;
let mockUser: { id: string } | null;
jest.mock('../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: mockDb.client, user: mockUser })),
}));
jest.mock('../../../lib/memory/embed', () => ({ embed: jest.fn(async () => [0.1, 0.2]) }));
jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH } from './route';

const ME = 'user-a';
const call = (fn: (r: NextRequest) => Promise<Response>, query = '', body?: unknown) =>
  fn(new NextRequest(`https://myavatar.ge/api/memory${query}`, body === undefined
    ? { method: 'GET' }
    : { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => {
  mockUser = { id: ME };
  mockDb = fakeTables({
    memories: [
      { id: 'm1', user_id: ME, fact: 'I run a coffee shop', source: 'manual', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
      { id: 'm2', user_id: ME, fact: 'Georgian replies', source: 'manual', created_at: '2026-10-02T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' },
      { id: 'mx', user_id: 'user-b', fact: 'not yours', source: 'manual', created_at: '2026-10-03T00:00:00Z', updated_at: '2026-10-03T00:00:00Z' },
    ],
    user_profile_metadata: [
      { user_id: ME, key: 'name', value: 'Gaga', category: 'personal_bio', updated_at: '2026-10-05T00:00:00Z' },
      { user_id: ME, key: 'age', value: '30', category: 'personal_bio', updated_at: '2026-10-05T00:00:00Z' },
      { user_id: 'user-b', key: 'name', value: 'Someone', category: 'personal_bio', updated_at: null },
    ],
  });
});

test('signed out: 401 everywhere, nothing read or deleted', async () => {
  mockUser = null;
  expect((await call(GET)).status).toBe(401);
  expect((await call(PATCH, '', { autoMemory: false })).status).toBe(401);
  expect((await call(DELETE, '?all=1')).status).toBe(401);
  expect(mockDb.queries).toEqual([]);
});

test('GET: the saved facts, the picked-out ones (settings are not facts) and whether picking is on; only the user’s own', async () => {
  const body = await (await call(GET)).json();
  expect(body.memories.map((m: { id: string }) => m.id)).toEqual(['m2', 'm1']);
  expect(body.profile).toEqual([{ key: 'name', value: 'Gaga', updatedAt: '2026-10-05T00:00:00Z' }, { key: 'age', value: '30', updatedAt: '2026-10-05T00:00:00Z' }]);
  expect(body.autoMemory).toBe(true);
  for (const q of mockDb.queries) expect(q.filters).toContainEqual(['user_id', 'eq', ME]);

  await call(PATCH, '', { autoMemory: false, user_id: 'user-b' });
  const after = await (await call(GET)).json();
  expect(after.autoMemory).toBe(false);
  expect(after.profile.map((p: { key: string }) => p.key)).toEqual(['name', 'age']);
  expect(mockDb.tables.user_profile_metadata!.find((r) => r.key === 'memory_auto')).toMatchObject({ user_id: ME, value: 'off', category: 'setting' });

  // The profile store unreadable: the saved facts still show.
  mockDb.fail.add('user_profile_metadata');
  const partial = await (await call(GET)).json();
  expect(partial).toMatchObject({ memories: [{ id: 'm2' }, { id: 'm1' }], profile: [], autoMemory: true });
});

test('the switch turns picking back on; a bad value is not a switch', async () => {
  await call(PATCH, '', { autoMemory: false });
  expect(await (await call(PATCH, '', { autoMemory: true })).json()).toEqual({ ok: true, autoMemory: true });
  expect(mockDb.tables.user_profile_metadata!.filter((r) => r.key === 'memory_auto')).toEqual([expect.objectContaining({ value: 'on' })]);
  expect((await call(PATCH, '', { autoMemory: 'off' })).status).toBe(400); // no id → the edit path refuses it
});

test('DELETE all: every saved fact and every picked-out fact of this user; the switch stays; nobody else’s rows move', async () => {
  await call(PATCH, '', { autoMemory: false });
  const r = await call(DELETE, '?all=1');
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true, deleted: { memories: 2, profile: 2 } });
  expect(mockDb.tables.memories!.map((m) => m.id)).toEqual(['mx']);
  expect(mockDb.tables.user_profile_metadata!.map((p) => [p.user_id, p.key])).toEqual([['user-b', 'name'], [ME, 'memory_auto']]);
  expect((await (await call(GET)).json()).autoMemory).toBe(false);
});

test('DELETE all that cannot finish says so (500), it never claims it was done', async () => {
  mockDb.fail.add('memories');
  const r = await call(DELETE, '?all=1');
  expect(r.status).toBe(500);
  expect((await r.json()).ok).toBeUndefined();
});

test('DELETE one picked-out fact by its key; the switch and an unknown key are not found; one saved fact by id as before', async () => {
  expect((await call(DELETE, '?key=name')).status).toBe(200);
  expect(mockDb.tables.user_profile_metadata!.map((p) => [p.user_id, p.key])).toEqual([[ME, 'age'], ['user-b', 'name']]);
  expect((await call(DELETE, '?key=memory_auto')).status).toBe(404);
  expect((await call(DELETE, '?key=height')).status).toBe(404);
  expect((await call(DELETE, '?id=mx')).status).toBe(404); // someone else's
  expect((await call(DELETE, '?id=m1')).status).toBe(200);
  expect((await call(DELETE)).status).toBe(400);
});
