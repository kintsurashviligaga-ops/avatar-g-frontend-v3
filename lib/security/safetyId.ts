/**
 * lib/security/safetyId.ts — the per-user safety identifier (v5.1 Phase 6, spec §27 "safety identifier design").
 * PREPARED, NOT WIRED: nothing calls `vertexRequestLabels` yet, and `SAFETY_LABELS` is off unless set to `on`.
 *
 * Why: when Google (or our own monitoring) reports that one stream of requests broke the usage policy, we must be able to
 * find the ONE account behind it, and switch off that account instead of the whole project, WITHOUT sending Google a
 * user id, an email or a name. Vertex has no dedicated end-user field on generateContent; its only per-request metadata
 * is `labels` (keys and values ≤ 63 chars, lowercase letters, digits, `_` and `-`, a key starts with a letter; read
 * 2026-11-13, docs/v5.1-phase6/03-safety-identifiers.md). Labels also flow into the Cloud Billing export, which is what
 * M-9 reconciliation needs anyway (`cap`).
 *
 * The id: `u` + the first 40 hex chars of HMAC-SHA256(SAFETY_ID_SECRET, userId). Stable per user (so a report maps back),
 * pseudonymous (Google cannot reverse it without our secret), and rotatable (a new secret = new ids; the old mapping is
 * gone with the old secret). No secret, a too-short secret, or no user → NO label at all: never the raw id (fail closed).
 * Anonymous traffic carries `sid=anon`, so it is still separable from signed-in traffic.
 */
import { createHmac } from 'node:crypto';

type Env = Readonly<Record<string, string | undefined>>;

/** A secret shorter than this is treated as missing: a guessable key would make the ids reversible by brute force. */
export const SAFETY_SECRET_MIN_CHARS = 32;
const LABEL_RE = /^[a-z][a-z0-9_-]{0,62}$/;
const VALUE_RE = /^[a-z0-9_-]{0,63}$/;

export function safetyLabelsEnabled(env: Env = process.env): boolean {
  return String(env.SAFETY_LABELS || '').trim().toLowerCase() === 'on';
}

/** The pseudonymous id for one user, or null when it cannot be made safely. */
export function safetyIdFor(userId: string | null | undefined, env: Env = process.env): string | null {
  const secret = String(env.SAFETY_ID_SECRET || '');
  const uid = String(userId || '').trim();
  if (!uid || secret.length < SAFETY_SECRET_MIN_CHARS) return null;
  return `u${createHmac('sha256', secret).update(uid, 'utf8').digest('hex').slice(0, 40)}`;
}

/** Normalise a free-form value into Google's label alphabet, or null when nothing usable is left. */
export function labelValue(raw: string): string | null {
  const v = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 63);
  return v && VALUE_RE.test(v) ? v : null;
}

/**
 * The `labels` map for one Vertex request: `sid` (the safety id, or `anon`) and `cap` (the capability, for billing
 * reconciliation). Empty when the flag is off. A signed-in user whose id cannot be made safely gets NO `sid`, never a
 * raw id, and the caller is told why so it can be reported.
 */
export function vertexRequestLabels(
  input: { userId?: string | null; capability: string },
  env: Env = process.env,
): { labels: Record<string, string>; problem?: 'no_secret' } {
  if (!safetyLabelsEnabled(env)) return { labels: {} };
  const labels: Record<string, string> = {};
  const cap = labelValue(input.capability);
  if (cap) labels.cap = cap;
  if (!input.userId) {
    labels.sid = 'anon';
    return { labels };
  }
  const sid = safetyIdFor(input.userId, env);
  if (!sid) return { labels, problem: 'no_secret' };
  labels.sid = sid;
  return { labels };
}

/** True when every key and value obeys Google's label rules (a guard for tests and for the wiring PR). */
export function labelsValid(labels: Record<string, string>): boolean {
  return Object.entries(labels).every(([k, v]) => LABEL_RE.test(k) && VALUE_RE.test(v));
}
