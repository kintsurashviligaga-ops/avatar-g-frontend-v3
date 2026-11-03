import { createHash, randomBytes } from 'node:crypto';

/** Independent random state and PKCE secret for the upstream exchange. */
export function newUpstreamRequest(): { state: string; verifier: string; challenge: string } {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  return { state, verifier, challenge: createHash('sha256').update(verifier, 'ascii').digest('base64url') };
}

export function upstreamStateDigest(state: string): string | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
  return createHash('sha256').update('myavatar-mcp:upstream-state:v1\0', 'utf8').update(state, 'ascii').digest('hex');
}
