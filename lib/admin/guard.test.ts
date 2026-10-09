/** @jest-environment node */
jest.mock('server-only', () => ({}));
// Stub the supabase server module so importing adminGuard doesn't pull in env-schema validation
// (which throws at module load in the test env). The panel-granted rows come from the service-role client.
const panelRows: { email: string }[] = [];
let panelFails = false;
jest.mock('../supabase/server', () => ({
  createRouteHandlerClient: () => ({}),
  createServiceRoleClient: () => ({
    from: () => ({
      select: async () => (panelFails ? { data: null, error: new Error('db down') } : { data: panelRows, error: null }),
    }),
  }),
}));

import type { User } from '@supabase/supabase-js';
import { isAdminUser, isAdminUserAsync, hasValidAdminKey, assertAdminAccess } from './guard';
import { invalidateAdminAllowlist } from '../auth/adminGuard';

const FOUNDER = 'kintsurashviligaga@gmail.com';
const CONFIRMED = '2026-01-01T00:00:00Z';
const u = (p: Partial<User>) => p as User;
const req = (headers: Record<string, string> = {}) => {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null } } as never;
};

beforeEach(() => {
  panelRows.length = 0;
  panelFails = false;
  invalidateAdminAllowlist();
});

describe('isAdminUser — server-truth only (audit B2)', () => {
  it('grants the founder email via the allowlist (case-insensitive) once it is confirmed', () => {
    expect(isAdminUser(u({ email: FOUNDER, email_confirmed_at: CONFIRMED, app_metadata: {}, user_metadata: {} }))).toBe(true);
    expect(isAdminUser(u({ email: FOUNDER.toUpperCase(), email_confirmed_at: CONFIRMED, app_metadata: {} }))).toBe(true);
  });

  it('SECURITY: an unconfirmed allowlisted email is not an admin', () => {
    expect(isAdminUser(u({ email: FOUNDER, app_metadata: {} }))).toBe(false);
    expect(isAdminUser(u({ email: FOUNDER, email_confirmed_at: null as unknown as string, app_metadata: {} }))).toBe(false);
  });

  it('SECURITY: does NOT grant a forged client-writable user_metadata admin claim', () => {
    expect(isAdminUser(u({ email: 'attacker@evil.com', email_confirmed_at: CONFIRMED, app_metadata: {}, user_metadata: { is_admin: true, role: 'admin', roles: ['owner'] } }))).toBe(false);
  });

  it('grants an app_metadata role (service-role-set, not client-writable)', () => {
    expect(isAdminUser(u({ email: 'ops@x.com', app_metadata: { role: 'admin' }, user_metadata: {} }))).toBe(true);
    expect(isAdminUser(u({ email: 'ops@x.com', app_metadata: { is_admin: true } }))).toBe(true);
    expect(isAdminUser(u({ email: 'ops@x.com', app_metadata: { roles: ['owner'] } }))).toBe(true);
  });

  it('honors the ADMIN_EMAILS env allowlist', () => {
    const saved = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = 'ceo@myavatar.ge';
    expect(isAdminUser(u({ email: 'ceo@myavatar.ge', email_confirmed_at: CONFIRMED, app_metadata: {} }))).toBe(true);
    process.env.ADMIN_EMAILS = saved;
  });

  it('denies null and a plain non-admin user', () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(u({ email: 'user@x.com', email_confirmed_at: CONFIRMED, app_metadata: {}, user_metadata: {} }))).toBe(false);
  });
});

describe('isAdminUserAsync — the one rule the page and every admin API share', () => {
  it('grants an admin added from the panel (the page used to deny them while the APIs allowed them)', async () => {
    panelRows.push({ email: 'Granted@X.com' });
    expect(await isAdminUserAsync(u({ email: 'granted@x.com', email_confirmed_at: CONFIRMED, app_metadata: {} }))).toBe(true);
  });

  it('grants an app_metadata admin (most APIs used to deny them while the page allowed them)', async () => {
    expect(await isAdminUserAsync(u({ email: 'ops@x.com', app_metadata: { role: 'admin' } }))).toBe(true);
  });

  it('SECURITY: a panel-granted email still has to be confirmed', async () => {
    panelRows.push({ email: 'granted@x.com' });
    expect(await isAdminUserAsync(u({ email: 'granted@x.com', app_metadata: {} }))).toBe(false);
  });

  it('fails CLOSED on a database error but keeps the founder', async () => {
    panelFails = true;
    expect(await isAdminUserAsync(u({ email: 'granted@x.com', email_confirmed_at: CONFIRMED, app_metadata: {} }))).toBe(false);
    expect(await isAdminUserAsync(u({ email: FOUNDER, email_confirmed_at: CONFIRMED, app_metadata: {} }))).toBe(true);
  });

  it('denies a forged user_metadata claim and null', async () => {
    expect(await isAdminUserAsync(u({ email: 'x@x.com', email_confirmed_at: CONFIRMED, app_metadata: {}, user_metadata: { is_admin: true } }))).toBe(false);
    expect(await isAdminUserAsync(null)).toBe(false);
  });
});

describe('hasValidAdminKey / assertAdminAccess', () => {
  it('validates x-admin-key against ADMIN_API_KEY', () => {
    const saved = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = 'secret';
    expect(hasValidAdminKey(req({ 'x-admin-key': 'secret' }))).toBe(true);
    expect(hasValidAdminKey(req({ 'x-admin-key': 'wrong' }))).toBe(false);
    expect(hasValidAdminKey(req({ 'x-admin-key': 'secret-and-more' }))).toBe(false);
    expect(hasValidAdminKey(req({}))).toBe(false);
    process.env.ADMIN_API_KEY = saved;
  });

  it('refuses every key while ADMIN_API_KEY is unset', () => {
    const saved = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;
    expect(hasValidAdminKey(req({ 'x-admin-key': '' }))).toBe(false);
    expect(hasValidAdminKey(req({ 'x-admin-key': 'anything' }))).toBe(false);
    process.env.ADMIN_API_KEY = saved;
  });

  it('assertAdminAccess: forged metadata → denied; founder and panel-granted admin → ok', async () => {
    panelRows.push({ email: 'granted@x.com' });
    expect((await assertAdminAccess(req({}), u({ email: 'x@x.com', email_confirmed_at: CONFIRMED, app_metadata: {}, user_metadata: { is_admin: true } }))).ok).toBe(false);
    expect((await assertAdminAccess(req({}), u({ email: FOUNDER, email_confirmed_at: CONFIRMED, app_metadata: {} }))).ok).toBe(true);
    expect((await assertAdminAccess(req({}), u({ email: 'granted@x.com', email_confirmed_at: CONFIRMED, app_metadata: {} }))).ok).toBe(true);
  });
});
