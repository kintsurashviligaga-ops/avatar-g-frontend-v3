/** @jest-environment node */
/**
 * AUTH_LOCAL_CLAIMS (Phase 8.0 P0-1): a signed-in API call can be verified from the JWT itself, with no round trip to
 * Supabase Auth. Off by default; on, the user comes from getClaims() and getUser() is never called; an allowlisted
 * admin email still has to be confirmed by Auth.
 */
import { isClaimsOnly, localClaimsEnabled, userFromClaims, verifiedClaimsUser } from './localClaims';

const CLAIMS = {
  sub: 'u-1', aud: 'authenticated', role: 'authenticated', email: 'gg@example.ge', phone: '',
  app_metadata: { provider: 'google' }, user_metadata: { full_name: 'GG' }, is_anonymous: false, exp: 9e9,
};

describe('localClaimsEnabled', () => {
  test.each([['1', true], ['on', true], ['TRUE', true], ['', false], ['0', false], [undefined, false], ['off', false]])(
    'AUTH_LOCAL_CLAIMS=%p → %p', (v, on) => expect(localClaimsEnabled({ AUTH_LOCAL_CLAIMS: v })).toBe(on));
});

describe('userFromClaims', () => {
  test('carries what the token carries, invents nothing, and is marked', () => {
    const u = userFromClaims(CLAIMS)!;
    expect(u).toMatchObject({ id: 'u-1', aud: 'authenticated', email: 'gg@example.ge', app_metadata: { provider: 'google' }, user_metadata: { full_name: 'GG' } });
    expect(u.phone).toBeUndefined();
    expect(u.created_at).toBe('');
    expect((u as { email_confirmed_at?: string }).email_confirmed_at).toBeUndefined();
    expect(isClaimsOnly(u)).toBe(true);
    expect(isClaimsOnly({ id: 'x' })).toBe(false);
  });
  test('no subject → no user', () => {
    expect(userFromClaims({ email: 'a@b.c' })).toBeNull();
    expect(userFromClaims(null)).toBeNull();
  });
});

describe('verifiedClaimsUser', () => {
  test('a verified token gives its user; an error, no claims or a throw gives null', async () => {
    expect((await verifiedClaimsUser({ getClaims: async () => ({ data: { claims: CLAIMS }, error: null }) }))?.id).toBe('u-1');
    expect(await verifiedClaimsUser({ getClaims: async () => ({ data: null, error: new Error('invalid JWT') }) })).toBeNull();
    expect(await verifiedClaimsUser({ getClaims: async () => ({ data: { claims: undefined }, error: null }) })).toBeNull();
    expect(await verifiedClaimsUser({ getClaims: async () => { throw new Error('boom'); } })).toBeNull();
  });
  test('a bearer token is the one verified', async () => {
    const getClaims = jest.fn(async () => ({ data: { claims: CLAIMS }, error: null }));
    await verifiedClaimsUser({ getClaims }, 'jwt-abc');
    expect(getClaims).toHaveBeenCalledWith('jwt-abc');
  });
});
