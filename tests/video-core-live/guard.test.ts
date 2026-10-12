/** @jest-environment node */
import { assertIsolatedSupabase, assertResolvesToThisMachine, NotIsolatedError, PRODUCTION_SUPABASE_REF } from './guard';

const ok = { VIDEO_CORE_LIVE_E2E: '1', NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.video-core-e2e.test:54321' } as unknown as NodeJS.ProcessEnv;

describe('the real-backend E2E refuses anything but a local Supabase (fail-closed)', () => {
  test('the .test stack name or a loopback stack, with the explicit opt-in, passes', () => {
    expect(assertIsolatedSupabase(ok)).toEqual({ supabaseUrl: 'http://supabase.video-core-e2e.test:54321', host: 'supabase.video-core-e2e.test' });
    expect(() => assertIsolatedSupabase({ ...ok, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })).not.toThrow();
    expect(() => assertIsolatedSupabase({ ...ok, E2E_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })).not.toThrow();
  });

  test('without the opt-in it refuses, whatever the URL', () => {
    expect(() => assertIsolatedSupabase({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' } as unknown as NodeJS.ProcessEnv)).toThrow(NotIsolatedError);
    expect(() => assertIsolatedSupabase({ ...ok, VIDEO_CORE_LIVE_E2E: 'true' })).toThrow(/VIDEO_CORE_LIVE_E2E/);
  });

  test('the Production project is refused by URL, by connection string and by any database variable', () => {
    expect(() => assertIsolatedSupabase({ ...ok, NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` })).toThrow(/Production/);
    expect(() => assertIsolatedSupabase({ ...ok, SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` })).toThrow(/Production/);
    expect(() => assertIsolatedSupabase({ ...ok, DATABASE_URL: `postgresql://postgres.${PRODUCTION_SUPABASE_REF}:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres` })).toThrow(/Production/);
    expect(() => assertIsolatedSupabase({ ...ok, E2E_DB_URL: `postgresql://postgres@db.${PRODUCTION_SUPABASE_REF}.supabase.co:5432/postgres` })).toThrow(/Production/);
  });

  test('any hosted or other database host is refused, not only Production', () => {
    expect(() => assertIsolatedSupabase({ ...ok, NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' })).toThrow(/hosted Supabase/);
    expect(() => assertIsolatedSupabase({ ...ok, POSTGRES_URL: 'postgresql://u:p@db.other.supabase.co:5432/postgres' })).toThrow(/hosted Supabase/);
    expect(() => assertIsolatedSupabase({ ...ok, E2E_DB_URL: 'postgresql://u:p@10.0.0.5:5432/postgres' })).toThrow(/neither a loopback/);
    expect(() => assertIsolatedSupabase({ ...ok, NEXT_PUBLIC_SUPABASE_URL: 'https://myavatar.ge' })).toThrow(/neither a loopback/);
    expect(() => assertIsolatedSupabase({ ...ok, NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.video-core-e2e.test.evil.com:54321' })).toThrow(/neither a loopback/);
  });

  test('a missing or malformed URL is refused, never defaulted', () => {
    expect(() => assertIsolatedSupabase({ VIDEO_CORE_LIVE_E2E: '1' } as unknown as NodeJS.ProcessEnv)).toThrow(/missing or not a URL/);
    expect(() => assertIsolatedSupabase({ ...ok, NEXT_PUBLIC_SUPABASE_URL: '127.0.0.1:54321' })).toThrow(NotIsolatedError);
  });

  test('the stack name must resolve only to this machine', async () => {
    const own = () => new Set(['127.0.0.1', '::1', '1.2.3.4']);
    await expect(assertResolvesToThisMachine('supabase.video-core-e2e.test', async () => [{ address: '1.2.3.4' }], own)).resolves.toEqual(['1.2.3.4']);
    await expect(assertResolvesToThisMachine('localhost', async () => [{ address: '127.0.0.1' }, { address: '::1' }], own)).resolves.toHaveLength(2);
    // A hosted project resolves to someone else's address.
    await expect(assertResolvesToThisMachine(`${PRODUCTION_SUPABASE_REF}.supabase.co`, async () => [{ address: '104.18.38.10' }], own)).rejects.toThrow(/not this machine/);
    // One foreign answer among local ones is enough to refuse.
    await expect(assertResolvesToThisMachine('mixed.test', async () => [{ address: '1.2.3.4' }, { address: '8.8.8.8' }], own)).rejects.toThrow(/8\.8\.8\.8/);
    await expect(assertResolvesToThisMachine('nowhere.test', async () => { throw new Error('ENOTFOUND'); }, own)).rejects.toThrow(/does not resolve/);
    await expect(assertResolvesToThisMachine('empty.test', async () => [], own)).rejects.toThrow(/resolves to nothing/);
  });
});
