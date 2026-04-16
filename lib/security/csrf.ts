/**
 * CSRF Protection — Double-Submit Cookie Pattern
 *
 * Flow:
 * 1. Client calls GET /api/auth/csrf → receives signed token in Set-Cookie + JSON body.
 * 2. Client includes the token in the `X-CSRF-Token` header on every mutation.
 * 3. Server validates the header value matches the cookie value before processing.
 *
 * The signed token format: `<random>.<hmac-sha256(random, secret)>`
 * This prevents token-guessing even if the cookie is stolen from another origin,
 * since CSRF exploits can read cookies but cannot read response headers.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

const CSRF_COOKIE = '__Host-csrf';
const CSRF_HEADER = 'x-csrf-token';
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function getSecret(): string {
  const secret = process.env.CSRF_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('CSRF_SECRET env var is required');
  return secret;
}

function sign(value: string): string {
  return createHmac('sha256', getSecret()).update(value).digest('hex');
}

/** Generate a new signed CSRF token. */
export function generateCsrfToken(): { token: string; cookie: string } {
  const random = randomBytes(32).toString('hex');
  const sig = sign(random);
  const token = `${random}.${sig}`;
  const cookie = `${CSRF_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${TOKEN_TTL_MS / 1000}`;
  return { token, cookie };
}

/** Verify a CSRF token from the request header against the cookie. */
export function verifyCsrfToken(req: NextRequest): boolean {
  const headerToken = req.headers.get(CSRF_HEADER);
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;

  if (!headerToken || !cookieToken) return false;
  if (headerToken !== cookieToken) return false;

  const [random, sig] = headerToken.split('.');
  if (!random || !sig) return false;

  const expected = sign(random);
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/** Server Component helper — reads the CSRF token from the cookie store. */
export async function getServerCsrfToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CSRF_COOKIE)?.value ?? null;
}

/** HTTP methods that mutate state and require CSRF verification. */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function requiresCsrf(method: string): boolean {
  return MUTATION_METHODS.has(method.toUpperCase());
}
