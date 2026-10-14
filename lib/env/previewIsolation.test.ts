/** @jest-environment node */
import { paidWritesBlockedOnPreview, previewDataIsolated, supabaseProjectRef } from './previewIsolation';

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe('Preview data isolation', () => {
  it('reads the project ref from a Supabase URL', () => {
    expect(supabaseProjectRef('https://AbCd123.supabase.co')).toBe('abcd123');
    expect(supabaseProjectRef('https://supabase.co.evil.example')).toBeNull();
    expect(supabaseProjectRef(undefined)).toBeNull();
  });

  it('a Preview with no declaration is blocked (fail closed)', () => {
    expect(paidWritesBlockedOnPreview(env({ VERCEL_ENV: 'preview' }))).toBe(true);
    expect(paidWritesBlockedOnPreview(env({ VERCEL_ENV: 'preview', PREVIEW_ISOLATED_DB: '0' }))).toBe(true);
  });

  it('Production, development and tests are never blocked', () => {
    expect(paidWritesBlockedOnPreview(env({ VERCEL_ENV: 'production' }))).toBe(false);
    expect(paidWritesBlockedOnPreview(env({ VERCEL_ENV: 'development' }))).toBe(false);
    expect(paidWritesBlockedOnPreview(env({}))).toBe(false);
  });

  it('a declaration that still points at the Production project is ignored', () => {
    const e = env({ VERCEL_ENV: 'preview', PREVIEW_ISOLATED_DB: '1', PRODUCTION_SUPABASE_REF: 'prodref', SUPABASE_URL: 'https://prodref.supabase.co' });
    expect(previewDataIsolated(e)).toBe(false);
    expect(paidWritesBlockedOnPreview(e)).toBe(true);
  });

  it('a declared Preview on another project is isolated', () => {
    const e = env({ VERCEL_ENV: 'preview', PREVIEW_ISOLATED_DB: 'true', PRODUCTION_SUPABASE_REF: 'prodref', NEXT_PUBLIC_SUPABASE_URL: 'https://previewref.supabase.co' });
    expect(paidWritesBlockedOnPreview(e)).toBe(false);
  });

  it('with no Production ref configured, the explicit declaration alone decides', () => {
    expect(paidWritesBlockedOnPreview(env({ VERCEL_ENV: 'preview', PREVIEW_ISOLATED_DB: '1' }))).toBe(false);
  });
});

describe('the ledger refuses every debit on an unisolated Preview', () => {
  const saved = process.env.VERCEL_ENV;
  afterEach(() => { if (saved === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved; });

  it('deductCredits / deductCreditsOnce answer error before touching the database', async () => {
    jest.resetModules();
    const rpc = jest.fn();
    jest.doMock('server-only', () => ({}));
    jest.doMock('../supabase/server', () => ({ createServiceRoleClient: () => ({ rpc }) }));
    process.env.VERCEL_ENV = 'preview';
    const ledger = await import('../orchestrator/ledger');
    expect(await ledger.deductCredits('u', 5, 'r')).toEqual({ ok: false, reason: 'error' });
    expect(await ledger.deductCreditsOnce('u', 5, 'r')).toEqual({ ok: false, reason: 'error' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
