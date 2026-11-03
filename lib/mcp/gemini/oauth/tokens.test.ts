/** @jest-environment node */
import { newOpaqueToken, opaqueTokenDigest, verifyS256Pkce } from './tokens';

test('generates distinct opaque tokens and separates token types', () => {
  const first = newOpaqueToken('access');
  const second = newOpaqueToken('access');
  expect(first).not.toBe(second);
  expect(opaqueTokenDigest('access', first)).toMatch(/^[a-f0-9]{64}$/);
  expect(opaqueTokenDigest('refresh', first)).toBeNull();
  expect(opaqueTokenDigest('access', first + '!')).toBeNull();
});

test('verifies the RFC 7636 S256 example and rejects invalid or mismatched input', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
  expect(verifyS256Pkce(verifier, challenge)).toBe(true);
  expect(verifyS256Pkce(verifier + 'x', challenge)).toBe(false);
  expect(verifyS256Pkce('short', challenge)).toBe(false);
  expect(verifyS256Pkce(verifier, challenge + '=')).toBe(false);
});
