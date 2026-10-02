/**
 * lib/security/secretMatch.ts — constant-time comparison of a presented shared secret against the configured one.
 *
 * Dependency-free on purpose (no `server-only`, no Next imports) so webhook handlers and their unit tests can use it
 * without pulling the session machinery in.
 *
 * ⚠️ AN UNSET SECRET NEVER MATCHES. Several routes in this repo compared `provided !== process.env.X` inside an
 * `if (secret && …)` guard — so when the env var was missing the whole check was SKIPPED and the door stood open
 * (Agent G's internal dispatch, the Telegram webhook, the WhatsApp signature). Here an empty or missing `expected` is a
 * refusal, full stop — the same reading as lib/api/cronAuth: a misconfigured lock is a locked lock.
 */
import { timingSafeEqual } from 'node:crypto';

export function secretMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  const want = (expected ?? '').trim();
  const got = (provided ?? '').trim();
  if (!want || !got) return false;
  const a = Buffer.from(got, 'utf8');
  const b = Buffer.from(want, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
