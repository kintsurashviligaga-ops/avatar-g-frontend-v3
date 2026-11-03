import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** These primitives do not issue or persist a grant. The broker must enforce
 * expiry, client, redirect, resource, scope, rotation and atomic consumption. */
export type OpaqueTokenKind = 'code' | 'access' | 'refresh';
const prefixes: Record<OpaqueTokenKind, string> = { code: 'ma_code_', access: 'ma_at_', refresh: 'ma_rt_' };
const verifierPattern = /^[A-Za-z0-9._~-]{43,128}$/;
const challengePattern = /^[A-Za-z0-9_-]{43}$/;

/** 256 random bits; persist only its domain-separated SHA-256 digest. */
export function newOpaqueToken(kind: OpaqueTokenKind): string {
  return prefixes[kind] + randomBytes(32).toString('base64url');
}

export function opaqueTokenDigest(kind: OpaqueTokenKind, token: string): string | null {
  const prefix = prefixes[kind];
  if (!token.startsWith(prefix) || !/^[A-Za-z0-9_-]{43}$/.test(token.slice(prefix.length))) return null;
  return createHash('sha256').update(`myavatar-mcp:${kind}:v1\0`, 'utf8').update(token, 'utf8').digest('hex');
}

/** S256 PKCE only; reject malformed verifier/challenge before comparison. */
export function verifyS256Pkce(verifier: string, challenge: string): boolean {
  if (!verifierPattern.test(verifier) || !challengePattern.test(challenge)) return false;
  const expected = Buffer.from(createHash('sha256').update(verifier, 'ascii').digest('base64url'), 'ascii');
  const actual = Buffer.from(challenge, 'ascii');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
