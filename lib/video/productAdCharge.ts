/**
 * lib/video/productAdCharge.ts — who may render a product ad's SECONDARY clips without paying for them.
 *
 * A product ad fires one POST /api/video/remix per clip. The ad is billed ONCE, on its primary clip (no
 * sceneIndex, or sceneIndex 0), at the full video tier; the secondary clips (sceneIndex >= 1) ride on that
 * charge and skip the debit, so a 30s/48s ad costs one video price and not one per clip.
 *
 * ⚠️ "SKIP THE DEBIT" USED TO BE DECIDED BY THE CALLER ALONE. The only thing that made a clip secondary was
 * the request saying `sceneIndex >= 1` — nothing asked whether a primary had ever been paid for. So a
 * signed-in caller could send ONLY secondaries, never the primary, and render unlimited Veo clips (Standard
 * tier ≈ $3.20 each) for 0 credits. It also meant a user whose primary was refused for insufficient credits
 * still received every other clip of the ad for free.
 *
 * The rule now: a secondary clip is free ONLY when the ledger already holds a net debit for its ad — the
 * primary's txnRef, under THIS user, for the SAME jobId — and each (jobId, sceneIndex) renders at most once
 * per window. What decides the charge is what the ledger shows was taken, never what the request claims.
 *
 * Pure except for the injected dependencies (no env, no network at import) so the rule is unit-testable;
 * the route supplies the ledger read, the admin check and the Redis claim.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PRODUCT_AD_LENGTHS, quoteCredits } from '@/lib/credits/quote';
import { sceneCountForDuration } from '@/lib/video/sceneGrid';

/** A 60s ad on the 5s grid is 12 clips: the primary (0) plus secondaries 1..11. */
export const PRODUCT_AD_MAX_SCENE_INDEX = 11;
/** How long one (jobId, sceneIndex) stays spent once it has rendered. */
export const PRODUCT_AD_SCENE_WINDOW_SEC = 3600;
/**
 * How old the primary's debit may be and still carry its secondaries. ⚠️ Without an age limit the per-scene claim
 * (an hour) was the only bound, so ONE paid ad re-opened eleven free Veo clips every hour, forever, by replaying its
 * jobId. An honest ad's clips all leave the browser within minutes of its primary.
 */
export const PRODUCT_AD_PRIMARY_MAX_AGE_SEC = 1800;
/** The Redis marker a SECONDARY sets when it is admitted; the primary's refund path reads it (see the route). */
export function productAdSecondariesKey(jobId: string): string {
  return `productad-secondaries:${jobId}`;
}
/**
 * The highest clip index the PAID length covers. The ad price is the film price for its length (lib/credits/quote): the
 * longest offered length the net debit pays for, in 8 s clips, minus the primary. A one-clip ad has no secondaries.
 * ⚠️ This used to let any paid ad (25 credits) run six clips, so the 48 s ad's five extra Veo clips rode on a one-clip
 * price (pricing audit, 2026-10-10).
 */
export function maxSecondarySceneIndexFor(netPaid: number): number {
  for (const len of [...PRODUCT_AD_LENGTHS].reverse()) {
    if (netPaid >= quoteCredits({ tool: 'product', seconds: len })) {
      return Math.min(PRODUCT_AD_MAX_SCENE_INDEX, sceneCountForDuration(len) - 1);
    }
  }
  return 0;
}
/**
 * How long a secondary waits for its primary's debit to land.
 *
 * ⚠️ THE CLIPS OF ONE AD ARE FIRED CONCURRENTLY, NOT PRIMARY-FIRST. OmniStudio runs them through a
 * worker pool (CLIP_CONCURRENCY, default 4), so clips 0–3 leave the browser in the same instant and a
 * secondary routinely reaches this gate BEFORE the primary's deduct_credits has committed. Checking the
 * ledger exactly once would randomly 402 an honest ad's clips 1–3. So the secondary polls for a bounded
 * window: an honest primary lands within a second or two; a request with no primary waits it out and is
 * refused, having spent nothing.
 */
export const PRODUCT_AD_PRIMARY_WAIT_MS = 15_000;
export const PRODUCT_AD_PRIMARY_POLL_MS = 1_500;
/**
 * Once a debit is seen, wait this long and read again before admitting the clip.
 *
 * ⚠️ THE PRIMARY'S EARLY REFUNDS ARE CALLER-TRIGGERABLE. The route debits first and validates after, so a
 * primary sent with no photo, an oversized image, or a `budgetCapUsd` it cannot meet is charged and then
 * refunded a few hundred milliseconds later. Without a second read, secondaries fired into that window
 * would see "paid" and render for free off a charge that nets to zero. 3s is noise next to a 60–240s
 * render, and it outlasts every pre-render refund path.
 */
export const PRODUCT_AD_PRIMARY_SETTLE_MS = 3_000;
/**
 * More ledger rows than any honest ad can produce under one jobId (an honest ad writes ONE debit, plus at
 * most one refund). Hitting it means the rows were manufactured — and a truncated read could drop the
 * refunds and keep the debits, which would read as "paid". So hitting the cap refuses, it never guesses.
 */
export const PRODUCT_AD_LEDGER_ROW_CAP = 50;

/**
 * The jobIds the client mints (`product_<seq>_<ms>`, lib/jobs/jobQueue makeId) — letters, digits, `_ . -`.
 * No `:`, so a jobId can never be spelled as a prefix of another ad's ref (`a` vs `a:25`), and no PostgREST
 * wildcard (`*`) or `%`, so the LIKE below cannot be widened by the caller.
 */
const JOB_ID_RE = /^[A-Za-z0-9_.-]{1,120}$/;

/**
 * The idempotency ref the remix route charges under: `remix:<op>:<jobId>:<amount>:<bodyFingerprint>`.
 *
 * Built HERE, and used by the route, so the ref that is charged and the prefix that the secondary gate
 * searches for can never drift apart — a drift would silently 402 every honest multi-clip ad.
 */
export function remixTxnPrefix(op: string, key: string): string {
  return `remix:${op}:${key}:`;
}
export function remixTxnRef(op: string, key: string, amount: number, fingerprint: string): string {
  return `${remixTxnPrefix(op, key)}${amount}:${fingerprint}`;
}

/** What follows the prefix on the primary's DEBIT row: `<amount>:<hex fingerprint>`, nothing else. */
const DEBIT_TAIL = /^\d+:[0-9a-f]+$/;
/** What follows it on a CREDIT-BACK of that debit: `<amount>:<hex>:refund` (or any `:<suffix>`). */
const CREDIT_TAIL = /^\d+:[0-9a-f]+:.+$/;

/**
 * Same predicate the route has always used to call a productad clip "secondary" — kept identical so no
 * request moves between the charged and the uncharged path; the gate then decides whether it is VALID.
 */
export function isProductAdSecondaryRequest(sceneIndex: unknown): boolean {
  const n = Number(sceneIndex);
  return Number.isFinite(n) && Math.floor(n) >= 1;
}

/** An integer 1..PRODUCT_AD_MAX_SCENE_INDEX (number or plain-digit string), else null. */
export function parseSecondarySceneIndex(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= PRODUCT_AD_MAX_SCENE_INDEX ? n : null;
}

export interface LedgerRow {
  delta?: unknown;
  metadata?: { ref?: unknown } | null;
  /** ISO timestamp (credit_ledger.created_at). A debit older than PRODUCT_AD_PRIMARY_MAX_AGE_SEC carries nothing. */
  created_at?: unknown;
}

/**
 * Credits the ad's primary still holds: debits under the primary's ref shape minus every credit-back of
 * them, floored at 0.
 *
 * ⚠️ NET, NOT "A DEBIT EXISTS". The route refunds a primary that fails early — no photo, a bad image, a
 * budget cap the CALLER can set (`budgetCapUsd`) — and those refunds land within a second of the debit.
 * A bare existence check would let one charge-then-refund cycle (net cost 0) unlock eleven free clips.
 * (The settle re-read in the gate covers the same cycle when it is fired concurrently.)
 * The tail of the ref is re-checked exactly here, so the LIKE prefix can only ever narrow the match.
 */
export function primaryNetDebit(rows: readonly LedgerRow[], jobId: string, nowMs: number = Date.now()): number {
  const prefix = remixTxnPrefix('productad', jobId);
  const oldest = nowMs - PRODUCT_AD_PRIMARY_MAX_AGE_SEC * 1000;
  let taken = 0;
  let given = 0;
  for (const row of rows) {
    const ref = row?.metadata?.ref;
    if (typeof ref !== 'string' || !ref.startsWith(prefix)) continue;
    const tail = ref.slice(prefix.length);
    const delta = Number(row.delta);
    if (!Number.isFinite(delta) || delta === 0) continue;
    if (delta < 0 && DEBIT_TAIL.test(tail)) {
      // A stale primary carries nothing (the row always has created_at; an unparseable one is treated as stale).
      const at = row.created_at === undefined ? nowMs : Date.parse(String(row.created_at));
      if (Number.isFinite(at) && at >= oldest) taken += -delta;
    } else if (delta > 0 && CREDIT_TAIL.test(tail)) given += delta;
  }
  return Math.max(0, taken - given);
}

/**
 * Read the ad's primary net debit from credit_ledger. null = the ledger could not be read (or looked
 * manufactured) — the caller must then refuse, never guess, because this gate is what releases free work.
 */
export async function readProductAdPrimaryNetDebit(
  sb: SupabaseClient | null,
  userId: string,
  jobId: string,
): Promise<number | null> {
  if (!sb || !userId || !JOB_ID_RE.test(jobId)) return null;
  // `_` and `%` are LIKE wildcards and jobIds contain underscores — escape them (as netDebitedForRef in
  // lib/orchestrator/ledger.ts does); primaryNetDebit then re-checks the prefix exactly in JS.
  const pattern = `${remixTxnPrefix('productad', jobId).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  try {
    const { data, error } = await sb
      .from('credit_ledger')
      .select('delta, metadata, created_at')
      .eq('user_id', userId)
      .like('metadata->>ref', pattern)
      .limit(PRODUCT_AD_LEDGER_ROW_CAP);
    if (error) return null;
    const rows = (data ?? []) as LedgerRow[];
    if (rows.length >= PRODUCT_AD_LEDGER_ROW_CAP) return null;
    return primaryNetDebit(rows, jobId);
  } catch {
    return null;
  }
}

export type SecondaryClipRefusal = 'auth' | 'scene-index' | 'no-job' | 'unpaid' | 'ledger' | 'scene-spent';

export type SecondaryClipVerdict =
  | { ok: true; sceneIndex: number; admin: boolean }
  | { ok: false; status: 400 | 401 | 402 | 409; reason: SecondaryClipRefusal; error: string };

export interface SecondaryClipDeps {
  isAdmin(userId: string): Promise<boolean>;
  /** Net credits the ad's primary holds under this user; null when the ledger cannot be read. */
  primaryNetDebit(userId: string, jobId: string): Promise<number | null>;
  /** SET-NX claim for `windowSec`; true = first claim (claimIdempotencyKey — fail-open without Redis). */
  claim(userId: string, key: string, windowSec: number): Promise<boolean>;
  sleep?(ms: number): Promise<void>;
  now?(): number;
  waitMs?: number;
  pollMs?: number;
  settleMs?: number;
}

/** Redis key for one clip of one ad (namespaced under the user by claimIdempotencyKey). */
export function productAdSceneKey(jobId: string, sceneIndex: number): string {
  return `productad-scene:${jobId}:${sceneIndex}`;
}

const UNPAID_MESSAGE =
  'This clip belongs to a product ad that has not been paid for. Start the ad again from the Product Ad panel.';

/**
 * Decide whether a productad SECONDARY clip (sceneIndex >= 1) may render without its own charge.
 *
 * Order matters: the cheap shape checks first, then the ledger (bounded wait), and the per-scene claim
 * LAST — so a request refused for an unpaid ad never burns the scene, and an honest clip that merely beat
 * its primary to the ledger is not locked out of its own slot.
 *
 * Admins skip the ledger requirement (they bypass billing everywhere in this route), but the scene-index
 * range and the once-per-window bound are not billing — they apply to everyone.
 */
export async function gateProductAdSecondaryClip(
  input: { userId: string | null; jobId: string | null; sceneIndex: unknown },
  deps: SecondaryClipDeps,
): Promise<SecondaryClipVerdict> {
  const { userId, jobId } = input;
  if (!userId) return { ok: false, status: 401, reason: 'auth', error: 'Sign in to use this edit.' };

  const sceneIndex = parseSecondarySceneIndex(input.sceneIndex);
  if (sceneIndex === null) {
    return { ok: false, status: 400, reason: 'scene-index', error: `Invalid clip index — expected a whole number from 1 to ${PRODUCT_AD_MAX_SCENE_INDEX}.` };
  }
  if (!jobId || !JOB_ID_RE.test(jobId)) return { ok: false, status: 402, reason: 'no-job', error: UNPAID_MESSAGE };

  const admin = await deps.isAdmin(userId).catch(() => false);
  if (!admin) {
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const now = deps.now ?? (() => Date.now());
    const pollMs = Math.max(1, deps.pollMs ?? PRODUCT_AD_PRIMARY_POLL_MS);
    const deadline = now() + Math.max(0, deps.waitMs ?? PRODUCT_AD_PRIMARY_WAIT_MS);
    const settleMs = Math.max(0, deps.settleMs ?? PRODUCT_AD_PRIMARY_SETTLE_MS);
    const read = () => deps.primaryNetDebit(userId, jobId).catch((): number | null => null);
    const paid = (n: number | null): boolean => typeof n === 'number' && n > 0;
    let net = await read();
    while (!paid(net) && now() + pollMs <= deadline) {
      await sleep(pollMs);
      net = await read();
    }
    // A debit that is about to be refunded is not a payment — read it again once the early refunds are due.
    if (paid(net) && settleMs > 0) {
      await sleep(settleMs);
      net = await read();
    }
    if (!paid(net)) {
      return net === null
        ? { ok: false, status: 402, reason: 'ledger', error: 'Credit ledger unavailable — please retry.' }
        : { ok: false, status: 402, reason: 'unpaid', error: UNPAID_MESSAGE };
    }
    if (sceneIndex > maxSecondarySceneIndexFor(net as number)) {
      return { ok: false, status: 402, reason: 'unpaid', error: 'This clip is beyond the ad length that was paid for.' };
    }
  }

  const fresh = await deps.claim(userId, productAdSceneKey(jobId, sceneIndex), PRODUCT_AD_SCENE_WINDOW_SEC).catch(() => true);
  if (!fresh) return { ok: false, status: 409, reason: 'scene-spent', error: 'This clip of the ad was already rendered.' };
  return { ok: true, sceneIndex, admin };
}
