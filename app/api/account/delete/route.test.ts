/** @jest-environment node */
/** POST /api/account/delete with ACCOUNT_DELETE_V2=on: soft auth delete (ledger/BOG survive), no financial table touched. */
const UID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const deleted: string[] = [];
const removed: string[] = [];
const deleteUser = jest.fn(async (..._a: unknown[]) => ({ error: null }));
const signOut = jest.fn(async () => ({}));
let user: { id: string } | null = { id: UID };

jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: { auth: { signOut } }, user })),
  createServiceRoleClient: jest.fn(() => ({
    from: (table: string) => ({ delete: () => ({ eq: async () => { deleted.push(table); return { error: null }; } }) }),
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => ({ data: prefix === UID ? [{ name: 'a.png', id: 'f1' }] : [], error: null }),
        remove: async (paths: string[]) => { removed.push(...paths.map((p) => `${bucket}/${p}`)); return { error: null }; },
      }),
    },
    auth: { admin: { deleteUser } },
  })),
}));

import { POST } from './route';
import { FINANCIAL_TABLES } from '../../../../lib/privacy/accountDeletion';

beforeEach(() => { deleted.length = 0; removed.length = 0; deleteUser.mockClear(); user = { id: UID }; process.env.ACCOUNT_DELETE_V2 = 'on'; });
afterAll(() => { delete process.env.ACCOUNT_DELETE_V2; });

test('v2: files and personal rows go, the auth user is soft-deleted, no financial table is touched', async () => {
  const res = await POST(new Request('https://myavatar.ge/api/account/delete', { method: 'POST' }));
  expect(res.status).toBe(200);
  expect(deleteUser).toHaveBeenCalledWith(UID, true);
  expect(removed).toContain(`avatars/${UID}/a.png`);
  for (const f of FINANCIAL_TABLES) expect(deleted).not.toContain(f);
  expect(deleted).toContain('chat_sessions');
  expect(signOut).toHaveBeenCalled();
});

test('v2: an auth failure is a 500, signed out caller a 401', async () => {
  deleteUser.mockResolvedValueOnce({ error: { message: 'x' } } as never);
  expect((await POST(new Request('https://x/', { method: 'POST' }))).status).toBe(500);
  user = null;
  expect((await POST(new Request('https://x/', { method: 'POST' }))).status).toBe(401);
});

test('flag off: legacy flow (hard delete) is unchanged', async () => {
  delete process.env.ACCOUNT_DELETE_V2;
  await POST(new Request('https://x/', { method: 'POST' }));
  expect(deleteUser).toHaveBeenCalledWith(UID);
});
