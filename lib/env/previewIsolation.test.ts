/** @jest-environment node */
import { paidWritesBlockedOnPreview, previewIsolationVerdict, supabaseProjectRef, validProjectRef } from './previewIsolation';

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe('Preview data isolation', () => {
  const PROD = 'zwksnayknzggdcenqqxy';
  const PREV = 'abcdefghijklmnopqrst';
  const proven = {
    VERCEL_ENV: 'preview', PREVIEW_ISOLATED_DB: '1', PREVIEW_SUPABASE_REF: PREV, PRODUCTION_SUPABASE_REF: PROD,
    SUPABASE_URL: `https://${PREV}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${PREV}.supabase.co`,
  };

  it('reads the project ref from a Supabase URL', () => {
    expect(supabaseProjectRef('https://AbCd123.supabase.co')).toBe('abcd123');
    expect(supabaseProjectRef('https://abcd.supabase.co/rest/v1')).toBe('abcd');
    expect(supabaseProjectRef('https://supabase.co.evil.example')).toBeNull();
    expect(supabaseProjectRef('https://abcd.supabase.co.evil.example')).toBeNull();
    expect(supabaseProjectRef(undefined)).toBeNull();
  });

  it('validates the project ref shape', () => {
    expect(validProjectRef(PROD)).toBe(PROD);
    expect(validProjectRef(' ZWKSNAYKNZGGDCENQQXY ')).toBe(PROD);
    expect(validProjectRef('prodref')).toBeNull();
    expect(validProjectRef('zwksnayknzggdcenqqxy.supabase.co')).toBeNull();
    expect(validProjectRef('')).toBeNull();
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

  it('an unknown Vercel target is treated as a Preview', () => {
    expect(paidWritesBlockedOnPreview(env({ VERCEL_ENV: 'staging' }))).toBe(true);
    expect(paidWritesBlockedOnPreview(env({ ...proven, VERCEL_ENV: 'staging' }))).toBe(false);
  });

  it('a fully proven Preview is isolated', () => {
    expect(previewIsolationVerdict(env(proven))).toEqual({ isolated: true, previewRef: PREV });
    expect(paidWritesBlockedOnPreview(env(proven))).toBe(false);
  });

  it('FORGED: PREVIEW_ISOLATED_DB=1 alone never proves isolation', () => {
    const e = env({ VERCEL_ENV: 'preview', PREVIEW_ISOLATED_DB: '1', SUPABASE_URL: `https://${PREV}.supabase.co` });
    expect(previewIsolationVerdict(e)).toEqual({ isolated: false, reason: 'preview_ref_missing_or_malformed' });
    expect(paidWritesBlockedOnPreview(e)).toBe(true);
  });

  it('MISSING Production ref fails closed', () => {
    const { PRODUCTION_SUPABASE_REF: _p, ...rest } = proven;
    expect(previewIsolationVerdict(env(rest))).toEqual({ isolated: false, reason: 'production_ref_missing_or_malformed' });
    expect(previewIsolationVerdict(env({ ...proven, PRODUCTION_SUPABASE_REF: 'prodref' }))).toMatchObject({ isolated: false });
  });

  it('malformed Preview ref fails closed', () => {
    expect(previewIsolationVerdict(env({ ...proven, PREVIEW_SUPABASE_REF: 'short' }))).toMatchObject({ isolated: false, reason: 'preview_ref_missing_or_malformed' });
  });

  it('equal refs fail closed', () => {
    const e = env({ ...proven, PREVIEW_SUPABASE_REF: PROD, SUPABASE_URL: `https://${PROD}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` });
    expect(previewIsolationVerdict(e)).toMatchObject({ isolated: false, reason: 'refs_equal' });
  });

  it('FORGED Production ref cannot launder the real Production project', () => {
    const e = env({
      ...proven, PREVIEW_SUPABASE_REF: PROD, PRODUCTION_SUPABASE_REF: 'zzzzzzzzzzzzzzzzzzzz',
      SUPABASE_URL: `https://${PROD}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    });
    expect(previewIsolationVerdict(e)).toMatchObject({ isolated: false, reason: 'preview_ref_is_known_production' });
    expect(paidWritesBlockedOnPreview(e)).toBe(true);
  });

  it('a declaration whose URL still points at Production is ignored', () => {
    const e = env({ ...proven, SUPABASE_URL: `https://${PROD}.supabase.co` });
    expect(previewIsolationVerdict(e)).toMatchObject({ isolated: false, reason: 'supabase_url_mismatch' });
  });

  it('ambiguous: the two Supabase URLs disagree', () => {
    const e = env({ ...proven, NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` });
    expect(paidWritesBlockedOnPreview(e)).toBe(true);
  });

  it('no Supabase URL, or a custom domain, fails closed', () => {
    const { SUPABASE_URL: _a, NEXT_PUBLIC_SUPABASE_URL: _b, ...noUrl } = proven;
    expect(previewIsolationVerdict(env(noUrl))).toMatchObject({ isolated: false, reason: 'no_supabase_url' });
    expect(previewIsolationVerdict(env({ ...proven, SUPABASE_URL: 'https://db.myavatar.ge' }))).toMatchObject({ isolated: false, reason: 'supabase_url_unparseable' });
  });

  it('a database URL that names Production fails closed', () => {
    const e = env({ ...proven, DATABASE_URL: `postgresql://postgres.${PROD}:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres` });
    expect(previewIsolationVerdict(e)).toMatchObject({ isolated: false, reason: 'db_url_names_production' });
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
    expect(await ledger.refundCredits('u', 5, 'r:refund')).toEqual({ ok: false, reason: 'error' });
    expect(await ledger.grantCredits('u', 5, 'g', 'admin')).toEqual({ ok: false, reason: 'error' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
