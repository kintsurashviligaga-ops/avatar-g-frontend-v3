/** @jest-environment node */
/** Locks the whoami self-diagnostic branches: no-user / founder / non-founder / metadata-role / fail-open. */
const mockGetUser = jest.fn();
jest.mock('../../../../lib/supabase/server', () => ({
  createRouteHandlerClient: () => ({ auth: { getUser: () => mockGetUser() } }),
}));

import { GET } from './route';

async function whoami() {
  const res = await GET();
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => mockGetUser.mockReset());

it('reports NO user when the session is not readable', async () => {
  mockGetUser.mockResolvedValue({ data: { user: null } });
  const r = await whoami();
  expect(r).toMatchObject({ hasUser: false, emailIsFounder: false, isAdmin: false });
  expect(String(r.diagnosis)).toContain('NO user');
});

it('reports founder on the founder email', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { email: 'KintsurashviliGaga@gmail.com', user_metadata: {} } } });
  const r = await whoami();
  expect(r).toMatchObject({ hasUser: true, emailIsFounder: true, isAdmin: true });
});

it('reports a non-founder account distinctly', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { email: 'someone@else.com', user_metadata: {} } } });
  const r = await whoami();
  expect(r).toMatchObject({ hasUser: true, emailIsFounder: false, isAdmin: false });
  expect(String(r.diagnosis)).toContain('non-founder');
});

it('grants isAdmin via APP_metadata role (service-role-set) for a non-founder email', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { email: 'ops@x.com', app_metadata: { role: 'admin' }, user_metadata: {} } } });
  const r = await whoami();
  expect(r).toMatchObject({ hasUser: true, emailIsFounder: false, metaRole: true, isAdmin: true });
});

it('does NOT grant isAdmin via forged client-writable user_metadata (audit B2)', async () => {
  mockGetUser.mockResolvedValue({ data: { user: { email: 'attacker@evil.com', app_metadata: {}, user_metadata: { is_admin: true, role: 'admin' } } } });
  const r = await whoami();
  expect(r).toMatchObject({ hasUser: true, emailIsFounder: false, metaRole: false, isAdmin: false });
});

it('fails open (never 500s) when getUser throws', async () => {
  mockGetUser.mockRejectedValue(new Error('auth down'));
  const r = await whoami();
  expect(r).toMatchObject({ hasUser: false, isAdmin: false });
});
