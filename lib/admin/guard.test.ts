/** @jest-environment node */
jest.mock('server-only', () => ({}));
// Stub the supabase server module so importing adminGuard doesn't pull in env-schema validation
// (which throws at module load in the test env). adminAllowlist() itself only reads process.env.
jest.mock('../supabase/server', () => ({ createRouteHandlerClient: () => ({}) }));

import type { User } from '@supabase/supabase-js';
import { isAdminUser, hasValidAdminKey, assertAdminAccess } from './guard';

const FOUNDER = 'kintsurashviligaga@gmail.com';
const u = (p: Partial<User>) => p as User;
const req = (headers: Record<string, string> = {}) => {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null } } as never;
};

describe('isAdminUser — server-truth only (audit B2)', () => {
  it('grants the founder email via the allowlist (case-insensitive)', () => {
    expect(isAdminUser(u({ email: FOUNDER, app_metadata: {}, user_metadata: {} }))).toBe(true);
    expect(isAdminUser(u({ email: FOUNDER.toUpperCase(), app_metadata: {} }))).toBe(true);
  });

  it('SECURITY: does NOT grant a forged client-writable user_metadata admin claim', () => {
    expect(isAdminUser(u({ email: 'attacker@evil.com', app_metadata: {}, user_metadata: { is_admin: true, role: 'admin', roles: ['owner'] } }))).toBe(false);
  });

  it('grants an app_metadata role (service-role-set, not client-writable)', () => {
    expect(isAdminUser(u({ email: 'ops@x.com', app_metadata: { role: 'admin' }, user_metadata: {} }))).toBe(true);
    expect(isAdminUser(u({ email: 'ops@x.com', app_metadata: { is_admin: true } }))).toBe(true);
    expect(isAdminUser(u({ email: 'ops@x.com', app_metadata: { roles: ['owner'] } }))).toBe(true);
  });

  it('honors the ADMIN_EMAILS env allowlist', () => {
    const saved = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = 'ceo@myavatar.ge';
    expect(isAdminUser(u({ email: 'ceo@myavatar.ge', app_metadata: {} }))).toBe(true);
    process.env.ADMIN_EMAILS = saved;
  });

  it('denies null and a plain non-admin user', () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(u({ email: 'user@x.com', app_metadata: {}, user_metadata: {} }))).toBe(false);
  });
});

describe('hasValidAdminKey / assertAdminAccess', () => {
  it('validates x-admin-key against ADMIN_API_KEY', () => {
    const saved = process.env.ADMIN_API_KEY;
    process.env.ADMIN_API_KEY = 'secret';
    expect(hasValidAdminKey(req({ 'x-admin-key': 'secret' }))).toBe(true);
    expect(hasValidAdminKey(req({ 'x-admin-key': 'wrong' }))).toBe(false);
    expect(hasValidAdminKey(req({}))).toBe(false);
    process.env.ADMIN_API_KEY = saved;
  });

  it('assertAdminAccess: forged metadata → denied; founder → ok', () => {
    expect(assertAdminAccess(req({}), u({ email: 'x@x.com', app_metadata: {}, user_metadata: { is_admin: true } })).ok).toBe(false);
    expect(assertAdminAccess(req({}), u({ email: FOUNDER, app_metadata: {} })).ok).toBe(true);
  });
});
