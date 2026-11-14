/** @jest-environment node */
/**
 * AUTH_LOCAL_CLAIMS (Phase 8.0 P0-1): a user read from JWT claims has no `email_confirmed_at`, so an allowlisted email
 * makes it admin only after Supabase Auth confirms that email for that user id. Fails closed.
 */
const getUserById = jest.fn();
jest.mock('../supabase/server', () => ({
  createRouteHandlerClient: jest.fn(),
  createServiceRoleClient: () => ({
    auth: { admin: { getUserById } },
    from: () => ({ select: async () => ({ data: [], error: null }) }),
  }),
}));

import { isAdminIdentity } from './adminGuard';

const claimsUser = (email: string) => ({ id: 'u-1', email, app_metadata: {}, claimsOnly: true as const });
const FOUNDER = 'kintsurashviligaga@gmail.com';

beforeEach(() => getUserById.mockReset());

test('a listed email counts once Auth confirms it for that user', async () => {
  getUserById.mockResolvedValue({ data: { user: { id: 'u-1', email: FOUNDER, email_confirmed_at: '2026-01-01' } }, error: null });
  await expect(isAdminIdentity(claimsUser(FOUNDER) as never)).resolves.toBe(true);
  expect(getUserById).toHaveBeenCalledWith('u-1');
});

test('unconfirmed, different email, error or throw: not admin', async () => {
  getUserById.mockResolvedValueOnce({ data: { user: { id: 'u-1', email: FOUNDER, email_confirmed_at: null } }, error: null });
  await expect(isAdminIdentity(claimsUser(FOUNDER) as never)).resolves.toBe(false);
  getUserById.mockResolvedValueOnce({ data: { user: { id: 'u-1', email: 'other@x.ge', email_confirmed_at: '2026' } }, error: null });
  await expect(isAdminIdentity(claimsUser(FOUNDER) as never)).resolves.toBe(false);
  getUserById.mockResolvedValueOnce({ data: null, error: new Error('down') });
  await expect(isAdminIdentity(claimsUser(FOUNDER) as never)).resolves.toBe(false);
  getUserById.mockRejectedValueOnce(new Error('boom'));
  await expect(isAdminIdentity(claimsUser(FOUNDER) as never)).resolves.toBe(false);
});

test('an unlisted email never costs an Auth call', async () => {
  await expect(isAdminIdentity(claimsUser('someone@x.ge') as never)).resolves.toBe(false);
  expect(getUserById).not.toHaveBeenCalled();
});

test('a server-set admin role still wins without a call', async () => {
  await expect(isAdminIdentity({ ...claimsUser('someone@x.ge'), app_metadata: { role: 'admin' } } as never)).resolves.toBe(true);
  expect(getUserById).not.toHaveBeenCalled();
});
