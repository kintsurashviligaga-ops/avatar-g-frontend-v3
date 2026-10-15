/** @jest-environment node */
import { assertIsolatedSupabase, assertPreviewTargets, assertResolvesToThisMachine, NotIsolatedError, PRODUCTION_SUPABASE_REF } from './guard';

const ok = { VIDEO_CORE_LIVE_E2E: '1', NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.video-core-e2e.test:54321' } as unknown as NodeJS.ProcessEnv;

describe('the real-backend E2E refuses anything but a local Supabase (fail-closed)', () => {
  test('the .test stack name or a loopback stack, with the explicit opt-in, passes', () => {
    expect(assertIsolatedSupabase(ok)).toEqual({ supabaseUrl: 'http://supabase.video-core-e2e.test:54321', host: 'supabase.video-core-e2e.test' });
    expect(() => assertIsolatedSupabase({ ...ok, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' })).not.toThrow();
    // the workflow's TLS front (a CA made for the run only) on the same reserved name
    expect(() => assertIsolatedSupabase({ ...ok, NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.video-core-e2e.test:54443', SUPABASE_URL: 'https://supabase.video-core-e2e.test:54443' })).not.toThrow();
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

  test('Preview mode: only a vcore-e2e alias, only with a quick tunnel of this run, never the site or Production', () => {
    const tunnel = 'https://calm-river-1234.trycloudflare.com';
    const base = 'https://vcore-e2e-0123456789ab.vercel.app';
    expect(assertPreviewTargets({ ...ok, PLAYWRIGHT_BASE_URL: base, E2E_APP_SUPABASE_URL: tunnel })).toEqual({ preview: true });
    expect(() => assertIsolatedSupabase({ ...ok, PLAYWRIGHT_BASE_URL: base, E2E_APP_SUPABASE_URL: tunnel })).not.toThrow();
    expect(assertPreviewTargets({ ...ok, PLAYWRIGHT_BASE_URL: 'http://localhost:3000' })).toEqual({ preview: false });
    expect(assertPreviewTargets(ok)).toEqual({ preview: false });
    // The site, the main project's Previews, any other host: refused.
    for (const b of ['https://myavatar.ge', 'https://avatar-g-frontend-v3-git-450092-kintsurashviligaga-ops-projects.vercel.app', 'http://vcore-e2e-0123456789ab.vercel.app', 'https://vcore-e2e-0123456789ab.vercel.app.evil.com']) {
      expect(() => assertIsolatedSupabase({ ...ok, PLAYWRIGHT_BASE_URL: b, E2E_APP_SUPABASE_URL: tunnel })).toThrow(NotIsolatedError);
    }
    // A Preview without its tunnel, a tunnel that is not one, Production or a hosted project as the app's database: refused.
    expect(() => assertIsolatedSupabase({ ...ok, PLAYWRIGHT_BASE_URL: base })).toThrow(/needs E2E_APP_SUPABASE_URL/);
    expect(() => assertIsolatedSupabase({ ...ok, PLAYWRIGHT_BASE_URL: base, E2E_APP_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` })).toThrow(/Production/);
    expect(() => assertIsolatedSupabase({ ...ok, PLAYWRIGHT_BASE_URL: base, E2E_APP_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' })).toThrow(/hosted Supabase/);
    expect(() => assertIsolatedSupabase({ ...ok, PLAYWRIGHT_BASE_URL: base, E2E_APP_SUPABASE_URL: 'http://calm-river-1234.trycloudflare.com' })).toThrow(/https/);
    expect(() => assertIsolatedSupabase({ ...ok, PLAYWRIGHT_BASE_URL: base, E2E_APP_SUPABASE_URL: 'https://example.com' })).toThrow(/quick tunnel/);
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
