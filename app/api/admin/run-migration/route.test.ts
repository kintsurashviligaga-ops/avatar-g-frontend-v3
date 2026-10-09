/** @jest-environment node */
/**
 * run-migration runs SQL on the production database. It must be off by default, and once switched on it must need
 * BOTH a signed-in admin AND its own key — the general ADMIN_KEY alone used to open it.
 */
const mockGetUser = jest.fn();
const mockIsAdmin = jest.fn();
jest.mock('../../../../lib/supabase/server', () => ({
  createRouteHandlerClient: () => ({ auth: { getUser: () => mockGetUser() } }),
}));
jest.mock('../../../../lib/auth/adminGuard', () => ({ isAdminIdentity: (u: unknown) => mockIsAdmin(u) }));

import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const ENV = { ...process.env };
const call = (method: 'GET' | 'POST', key?: string) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key !== undefined) headers['x-admin-key'] = key;
  const req = new NextRequest('https://myavatar.ge/api/admin/run-migration?file=20260523_wallet_and_onboarding.sql', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify({ file: '20260523_wallet_and_onboarding.sql' }) : undefined,
  });
  return method === 'GET' ? GET(req) : POST(req);
};

const fetchSpy = jest.fn();
beforeEach(() => {
  process.env = { ...ENV, MIGRATION_RUN_KEY: 'mig-key', ADMIN_KEY: 'admin-key' };
  delete process.env.ADMIN_MIGRATION_ROUTE;
  delete process.env.SUPABASE_ACCESS_TOKEN;
  mockGetUser.mockResolvedValue({ data: { user: { email: 'founder@x.com' } } });
  mockIsAdmin.mockResolvedValue(true);
  fetchSpy.mockReset();
  global.fetch = fetchSpy as unknown as typeof fetch;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => {
  process.env = ENV;
});

describe('run-migration gate', () => {
  it('is a plain 404 while ADMIN_MIGRATION_ROUTE is not "enabled", even for an admin with the right key', async () => {
    for (const m of ['GET', 'POST'] as const) {
      const r = await call(m, 'mig-key');
      expect(r.status).toBe(404);
    }
    process.env.ADMIN_MIGRATION_ROUTE = 'true';
    expect((await call('POST', 'mig-key')).status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe('switched on', () => {
    beforeEach(() => {
      process.env.ADMIN_MIGRATION_ROUTE = 'enabled';
    });

    it('refuses the right key without a signed-in admin', async () => {
      mockIsAdmin.mockResolvedValue(false);
      expect((await call('POST', 'mig-key')).status).toBe(401);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refuses an admin with no key, a wrong key, or the general ADMIN_KEY', async () => {
      for (const k of [undefined, 'wrong', 'admin-key', 'mig-key-and-more']) {
        expect((await call('POST', k)).status).toBe(401);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refuses everything when MIGRATION_RUN_KEY is unset', async () => {
      delete process.env.MIGRATION_RUN_KEY;
      expect((await call('POST', '')).status).toBe(401);
      expect((await call('POST', 'admin-key')).status).toBe(401);
    });

    it('lets a signed-in admin with the migration key past the gate', async () => {
      // No SQL path is configured in the test env, so the route stops at "could not execute" — past the gate, not 401/404.
      const r = await call('POST', 'mig-key');
      expect([401, 404]).not.toContain(r.status);
    });
  });
});
