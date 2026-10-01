import { readSignInDeepLink, signInPath } from './signIn';

describe('signInPath — the sign-in address (there is no sign-in page)', () => {
  it('opens the studio sheet, in the right language', () => {
    expect(signInPath('en')).toBe('/en/dashboard?auth=login');
    expect(signInPath('ru', { mode: 'signup' })).toBe('/ru/dashboard?auth=signup');
    expect(signInPath('xx')).toBe('/ka/dashboard?auth=login'); // unknown locale → the default, never a 404
  });
  it('carries the return path, the plan and the referral', () => {
    const q = new URL(signInPath('ka', { mode: 'signup', redirect: '/ka/memory', plan: 'pro', ref: 'ABC123' }), 'http://x').searchParams;
    expect(Object.fromEntries(q)).toEqual({ auth: 'signup', redirect: '/ka/memory', plan: 'pro', ref: 'ABC123' });
  });
});

describe('readSignInDeepLink', () => {
  it('is null for any other address', () => {
    expect(readSignInDeepLink('')).toBeNull();
    expect(readSignInDeepLink('?tool=image')).toBeNull();
    expect(readSignInDeepLink('?auth=admin')).toBeNull();
  });
  it('reads what the old /login and /signup pages understood (as next.config.js forwards it)', () => {
    expect(readSignInDeepLink('?redirect=%2Fen%2Fmemory&auth=login')).toEqual({
      mode: 'login', redirect: '/en/memory', error: null, plan: null, ref: null,
    });
    expect(readSignInDeepLink('?plan=pro&ref=abc123&auth=signup')).toMatchObject({ mode: 'signup', plan: 'pro', ref: 'abc123' });
    expect(readSignInDeepLink('?error=access_denied&auth=login')?.error).toBe('access_denied');
    expect(readSignInDeepLink('?next=/ka/pricing&auth=login')?.redirect).toBe('/ka/pricing');
  });
  it('never returns an open redirect or an auth self-loop', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\tevil', 'javascript:alert(1)', '/ka/login', '/auth']) {
      expect(readSignInDeepLink(`?auth=login&redirect=${encodeURIComponent(bad)}`)?.redirect).toBeNull();
    }
  });
  it('bounds what it keeps', () => {
    expect(readSignInDeepLink(`?auth=login&error=${'x'.repeat(5000)}`)?.error).toHaveLength(300);
  });
});
