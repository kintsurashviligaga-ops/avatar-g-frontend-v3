/**
 * lib/ai/google/safetyIdentifier.ts — Google's end-user abuse attribution on Vertex AI (Phase 8.9 prep).
 *
 * Google: apps with external users "can pass a unique safety_identifier key in the request labels field", so policy
 * feedback targets one end user instead of the whole project. Supported on Gemini generateContent /
 * streamGenerateContent and on Veo predictLongRunning. Value: 1–63 chars, only [a-z0-9_-]; anything else is a 400.
 * No PII: Google asks for an anonymized id or a truncated hash. Labels add no charge and need no extra IAM.
 * Docs: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/abuse-monitoring
 *       https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/add-labels-to-api-calls
 *
 * What we send: `u` + the first 40 hex chars of HMAC-SHA256(SAFETY_IDENTIFIER_SALT, account id). The salt is a server
 * secret, so the label cannot be turned back into an account id, and it is stable, so one user is always one label.
 * To find the account behind a label (a Google policy notice), recompute it for a candidate id with the same salt.
 *
 * OFF unless SAFETY_IDENTIFIER=1 AND SAFETY_IDENTIFIER_SALT is set (≥ 16 chars). Off, every body is sent byte for byte
 * as before. It never blocks a call: no user, a guest, a body that is not a JSON object, or a caller that already set
 * labels.safety_identifier → the body goes out unchanged.
 */
import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac } from 'node:crypto';

type Env = Record<string, string | undefined>;

export const SAFETY_LABEL_KEY = 'safety_identifier';
const MIN_SALT_CHARS = 16;
const VALUE_RE = /^[a-z0-9_-]{1,63}$/;

function salt(env: Env): string | null {
  const s = (env.SAFETY_IDENTIFIER_SALT ?? '').trim();
  return s.length >= MIN_SALT_CHARS ? s : null;
}

/** True only when the flag is on and a usable salt exists. */
export function safetyIdentifierEnabled(env: Env = process.env): boolean {
  return (env.SAFETY_IDENTIFIER ?? '').trim() === '1' && salt(env) !== null;
}

/** The label value for one account, or null (flag off, no salt, no id, a guest/anonymous id). */
export function safetyIdentifierFor(userId: string | null | undefined, env: Env = process.env): string | null {
  if (!safetyIdentifierEnabled(env)) return null;
  const id = (userId ?? '').trim();
  if (!id || id === 'anonymous' || id.startsWith('anon')) return null;
  const value = `u${createHmac('sha256', salt(env) as string).update(id).digest('hex').slice(0, 40)}`;
  return VALUE_RE.test(value) ? value : null;
}

// ── Per-request end user ─────────────────────────────────────────────────────────────────────────────────────────
// Routes know the account; the transports that build the Google request do not. A route sets it once with
// setEndUser(userId) after sign-in (or wraps work in runAsEndUser), and the transports read it here.
const endUser = new AsyncLocalStorage<string | null>();

export function runAsEndUser<T>(userId: string | null | undefined, fn: () => T): T {
  return endUser.run(userId ?? null, fn);
}

/** Sets the end user for the rest of the current request's async context (Node AsyncLocalStorage.enterWith). */
export function setEndUser(userId: string | null | undefined): void {
  if (!safetyIdentifierEnabled()) return; // flag off: no context is touched at all
  endUser.enterWith(userId ?? null);
}

export function currentEndUser(): string | null {
  return endUser.getStore() ?? null;
}

/**
 * Adds labels.safety_identifier to a JSON request body. Returns the input unchanged whenever no label applies, the
 * body is not a JSON object string, or the caller already set one.
 */
export function withSafetyLabel(body: unknown, userId: string | null | undefined = currentEndUser(), env: Env = process.env): unknown {
  if (typeof body !== 'string' || !body.startsWith('{')) return body;
  const value = safetyIdentifierFor(userId, env);
  if (!value) return body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return body;
  const obj = parsed as Record<string, unknown>;
  const labels = obj.labels && typeof obj.labels === 'object' && !Array.isArray(obj.labels) ? (obj.labels as Record<string, unknown>) : {};
  if (SAFETY_LABEL_KEY in labels) return body;
  return JSON.stringify({ ...obj, labels: { ...labels, [SAFETY_LABEL_KEY]: value } });
}

/** True for the Vertex methods Google documents the label on. */
export function takesSafetyLabel(methodOrUrl: string): boolean {
  return /(?:^|:)(generateContent|streamGenerateContent|predictLongRunning)(?:$|\?)/.test(methodOrUrl);
}
