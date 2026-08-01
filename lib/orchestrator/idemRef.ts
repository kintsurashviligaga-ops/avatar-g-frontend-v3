/**
 * Pure billing-ref derivation — NO env, NO supabase, NO network.
 *
 * ⚠️ IT LIVES IN ITS OWN LEAF MODULE FOR A REASON. These functions decide what gets CHARGED, so they
 * must be unit-testable — and importing produceBilling pulls in ledger → supabase/server → env/schema,
 * whose `@t3-oss/env-nextjs` ESM breaks under jest. The security property below cannot be locked by a
 * test that will not run, so the logic is separated from everything that touches the outside world.
 */
import { createHash } from 'node:crypto';

/** Stable, per-operation idempotency ref. Prefer a client-supplied key; else the server pipelineId. */
export function produceRef(kind: string, key: string): string {
  return `${kind}:${key}`;
}

/**
 * A stable, SERVER-DERIVED content fingerprint of a request body.
 *
 * Key ordering is normalised so two structurally identical bodies hash the same regardless of how the
 * client happened to serialise them — a retry must collapse, and a retry may legitimately re-encode.
 */
export function bodyFingerprint(body: unknown): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>)
        .filter((k) => k !== 'idempotencyKey' && k !== 'jobId' && k !== 'clientJobId')
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => { acc[k] = stable((v as Record<string, unknown>)[k]); return acc; }, {});
    }
    return v;
  };
  let json = '';
  try { json = JSON.stringify(stable(body) ?? null) ?? ''; } catch { json = ''; }
  return createHash('sha256').update(json).digest('hex').slice(0, 32);
}

/**
 * Derive the reservation ref for a paid produce call.
 *
 * ⚠️ THIS USED TO TRUST A CLIENT STRING OUTRIGHT — AND THAT WAS UNLIMITED FREE COMPUTE. The old body was:
 *
 *     const k = body?.idempotencyKey;
 *     const key = typeof k === 'string' && k.trim() ? k.trim().slice(0, 80) : pipelineId;
 *     return produceRef(kind, key);
 *
 * `deduct_credits` dedupes on (user_id, ref) FOREVER, with no time window, and returns success on the
 * deduped call. So any caller sending a CONSTANT `idempotencyKey` was charged exactly once and rendered
 * free for life — changing the prompt every time, because only the key decided the ref. Reachable with a
 * plain curl on all six produce surfaces (image, music, voice, avatar, interior, film): unlimited paid
 * Replicate / ElevenLabs / Veo compute for the price of a single render.
 *
 * THE FIX KEEPS THE FEATURE AND REMOVES THE HOLE. A retry is still collapsed — that is the whole point of
 * an idempotency key and it protects users from double-charges on a flaky connection — but the ref is now
 * bound to WHAT WAS ASKED FOR as well as to the key. Same key + same body (a genuine retry) → same ref →
 * charged once. Same key + different body (a new render wearing an old key) → different ref → charged,
 * as it must be.
 *
 * The client key is retained as a namespace within that, so a user who deliberately reuses a key for two
 * identical renders still pays once — unchanged, intended behaviour.
 */
export function idemRef(kind: string, pipelineId: string, body: unknown): string {
  const k = (body as { idempotencyKey?: unknown } | null | undefined)?.idempotencyKey;
  const clientKey = typeof k === 'string' && k.trim() ? k.trim().slice(0, 80) : pipelineId;
  // The fingerprint is the load-bearing half: it is derived from the request, never supplied with it.
  return produceRef(kind, `${clientKey}:${bodyFingerprint(body)}`);
}

