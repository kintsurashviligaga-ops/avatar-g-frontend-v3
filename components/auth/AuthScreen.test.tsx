import { resolveAuthCallbackUrl } from './AuthScreen';

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
