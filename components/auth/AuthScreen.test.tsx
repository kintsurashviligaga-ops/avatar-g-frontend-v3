import { resolveAuthCallbackUrl, withAuthTimeout, AuthTimeoutError, describeOAuthError } from './AuthScreen';

describe('resolveAuthCallbackUrl — PHASE 41 §1 dead-redirect fix', () => {
  it('binds to the live runtime origin and carries the redirect target', () => {
    expect(
      resolveAuthCallbackUrl('https://myavatar.ge', undefined, '/dashboard'),
    ).toBe('https://myavatar.ge/auth/callback?redirect=%2Fdashboard');
  });

  it('uses a Vercel preview origin instead of a hardcoded production host', () => {
    expect(
      resolveAuthCallbackUrl('https://avatar-g-pr-42.vercel.app', undefined, '/'),
    ).toBe('https://avatar-g-pr-42.vercel.app/auth/callback?redirect=%2F');
  });

  it('keeps the PATH of a fully-qualified configured URL but discards its origin', () => {
    // Configured points at production, but we are running on localhost — we must
    // complete the handshake on localhost, not cross-redirect to prod.
    expect(
      resolveAuthCallbackUrl(
        'http://localhost:3000',
        'https://myavatar.ge/auth/callback',
        '/workspace',
      ),
    ).toBe('http://localhost:3000/auth/callback?redirect=%2Fworkspace');
  });

  it('normalizes a bare configured path', () => {
    expect(
      resolveAuthCallbackUrl('https://myavatar.ge', 'auth/cb', '/'),
    ).toBe('https://myavatar.ge/auth/cb?redirect=%2F');
  });

  it('preserves an existing query string on the configured path with &', () => {
    expect(
      resolveAuthCallbackUrl('https://myavatar.ge', 'https://x.test/auth/callback?foo=1', '/home'),
    ).toBe('https://myavatar.ge/auth/callback?redirect=%2Fhome');
  });

  it('defaults an empty redirect target to root', () => {
    expect(
      resolveAuthCallbackUrl('https://myavatar.ge', undefined, ''),
    ).toBe('https://myavatar.ge/auth/callback?redirect=%2F');
  });
});

describe('withAuthTimeout — PHASE 48 §1 frozen-handshake watchdog', () => {
  it('resolves with the value when the auth call settles in time', async () => {
    await expect(withAuthTimeout(Promise.resolve({ error: null }), 50)).resolves.toEqual({ error: null });
  });

  it('propagates a real rejection (not a timeout) from the auth call', async () => {
    const boom = new Error('network down');
    await expect(withAuthTimeout(Promise.reject(boom), 50)).rejects.toBe(boom);
  });

  it('rejects with AuthTimeoutError when the handshake hangs past the deadline', async () => {
    // A promise that never settles — the exact "infinite frozen spinner" case.
    const hang = new Promise(() => {});
    await expect(withAuthTimeout(hang, 10)).rejects.toBeInstanceOf(AuthTimeoutError);
  });
});

describe('describeOAuthError — PHASE 49 §2 provider-not-enabled translation', () => {
  it('detects the GoTrue "provider is not enabled" payload and gives an actionable message', () => {
    const msg = describeOAuthError('Unsupported provider: provider is not enabled', 'google', 'en');
    expect(msg).toBe('Google sign-in is temporarily unavailable. Please sign in with your email instead.');
    // Never leaks the raw cryptic GoTrue text to the user.
    expect(msg).not.toMatch(/provider is not enabled/i);
  });

  it('localizes the disabled-provider message for Georgian', () => {
    const msg = describeOAuthError('validation_failed', 'google', 'ka');
    expect(msg).toContain('Google');
    expect(msg).toMatch(/[Ⴀ-ჿ]/); // contains Georgian script
  });

  it('localizes the disabled-provider message for Russian', () => {
    const msg = describeOAuthError('Unsupported provider', 'apple', 'ru');
    expect(msg).toContain('Apple');
    expect(msg).toMatch(/[Ѐ-ӿ]/); // contains Cyrillic script
  });

  it('passes through an unrelated real error message unchanged', () => {
    const msg = describeOAuthError('Invalid login credentials', 'google', 'en');
    expect(msg).toBe('Invalid login credentials');
  });

  it('falls back to a generic localized message when there is no error text', () => {
    expect(describeOAuthError(null, 'google', 'en')).toBe('Sign-in failed. Please try again.');
    expect(describeOAuthError('', 'google', 'ka')).toMatch(/[Ⴀ-ჿ]/);
  });
});
