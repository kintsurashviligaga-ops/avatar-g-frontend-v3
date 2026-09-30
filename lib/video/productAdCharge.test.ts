/** @jest-environment node */
/**
 * The product-ad secondary-clip gate: a clip that skips its own charge must be riding on a PAID primary.
 *
 * ⚠️ THE HOLE THIS LOCKS: the only thing that made a productad clip free was the request saying
 * `sceneIndex >= 1`. A caller could send only secondaries — never the primary — and render unlimited Veo
 * clips for 0 credits. These tests pin the rule that replaced it: jobId required, a NET ledger debit for
 * that jobId's primary under this user, sceneIndex a whole number 1..11, each (jobId, sceneIndex) once.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import {
  PRODUCT_AD_MAX_SCENE_INDEX,
  PRODUCT_AD_SCENE_WINDOW_SEC,
  PRODUCT_AD_LEDGER_ROW_CAP,
  PRODUCT_AD_PRIMARY_MAX_AGE_SEC,
  gateProductAdSecondaryClip,
  maxSecondarySceneIndexFor,
  productAdSecondariesKey,
  isProductAdSecondaryRequest,
  parseSecondarySceneIndex,
  primaryNetDebit,
  productAdSceneKey,
  readProductAdPrimaryNetDebit,
  remixTxnRef,
  type LedgerRow,
  type SecondaryClipDeps,
} from './productAdCharge';

const USER = 'user-1';
const JOB = 'product_3_1790000000000';
/** Exactly the ref the route charges a 30s primary under. */
const primaryBody = { op: 'productad', imageUrl: 'https://x/p.png', preset: 'luxury', aspect: '9:16', jobId: JOB, productDurationSec: 30, sceneIndex: 0 };
const PRIMARY_REF = remixTxnRef('productad', JOB, 25, bodyFingerprint(primaryBody));

const debit = (ref: string, amount = 25): LedgerRow => ({ delta: -amount, metadata: { ref } });
const credit = (ref: string, amount = 25): LedgerRow => ({ delta: amount, metadata: { ref } });

/** Fake deps with a fake clock: sleep advances time, so the bounded wait runs instantly. */
function deps(over: Partial<SecondaryClipDeps> & { reads?: Array<number | null> } = {}) {
  let t = 0;
  const reads = over.reads ?? [25];
  let i = 0;
  const calls = { reads: 0, claims: [] as Array<{ uid: string; key: string; ttl: number }> };
  const d: SecondaryClipDeps = {
    isAdmin: async () => false,
    primaryNetDebit: async () => { calls.reads += 1; const v = reads[Math.min(i, reads.length - 1)]; i += 1; return v ?? null; },
    claim: async (uid, key, ttl) => { calls.claims.push({ uid, key, ttl }); return true; },
    sleep: async (ms) => { t += ms; },
    now: () => t,
    ...over,
  };
  return { d, calls };
}

describe('the ref the route charges is the ref the gate reads', () => {
  it('builds `remix:<op>:<jobId>:<amount>:<fingerprint>`', () => {
    expect(PRIMARY_REF).toMatch(new RegExp(`^remix:productad:${JOB}:25:[0-9a-f]{32}$`));
  });

  it('the route charges through remixTxnRef, not a hand-rolled template', () => {
    const route = readFileSync(join(__dirname, '../../app/api/video/remix/route.ts'), 'utf8');
    expect(route).toContain('const txnRef = remixTxnRef(op, jobId ?? crypto.randomUUID(), chargeAmount, bodyFingerprint(body));');
    expect(route).not.toMatch(/const txnRef = `remix:/);
  });
});

describe('primaryNetDebit', () => {
  it('counts the primary debit', () => {
    expect(primaryNetDebit([debit(PRIMARY_REF)], JOB)).toBe(25);
  });

  it('a refunded primary holds nothing — a charge-then-refund cycle unlocks no free clips', () => {
    expect(primaryNetDebit([debit(PRIMARY_REF), credit(`${PRIMARY_REF}:refund`)], JOB)).toBe(0);
  });

  it('nets across several primaries of the same ad', () => {
    const other = remixTxnRef('productad', JOB, 45, bodyFingerprint({ ...primaryBody, productDurationSec: 60 }));
    expect(primaryNetDebit([debit(PRIMARY_REF), credit(`${PRIMARY_REF}:refund`), debit(other, 45)], JOB)).toBe(45);
  });

  it('ignores another jobId, another op, and refs that only look like the prefix', () => {
    const rows: LedgerRow[] = [
      debit(remixTxnRef('productad', 'product_9_1', 25, 'ab'.repeat(16))), // another ad
      debit(remixTxnRef('restyle', JOB, 15, 'cd'.repeat(16))),              // another op, same jobId
      debit(`remix:productad:${JOB}:25:${'ef'.repeat(16)}:extra`),           // debit with a trailing segment
      credit(`remix:productad:${JOB}:25:${'ab'.repeat(16)}`),                // a positive row is not a debit
      { delta: -25, metadata: null },
      { delta: 'x', metadata: { ref: PRIMARY_REF } },
    ];
    expect(primaryNetDebit(rows, JOB)).toBe(0);
  });

  it('a jobId cannot borrow a charge by spelling itself as a prefix of another ad (`a` vs `a:25`)', () => {
    const refOfA = remixTxnRef('productad', 'a', 25, 'ab'.repeat(16));
    expect(primaryNetDebit([debit(refOfA)], 'a:25')).toBe(0);
    expect(primaryNetDebit([debit(refOfA)], 'a')).toBe(25);
  });
});

describe('scene index', () => {
  it('classifies secondaries exactly as the route always has', () => {
    expect(isProductAdSecondaryRequest(undefined)).toBe(false);
    expect(isProductAdSecondaryRequest(0)).toBe(false);
    expect(isProductAdSecondaryRequest(-1)).toBe(false);
    expect(isProductAdSecondaryRequest(1)).toBe(true);
    expect(isProductAdSecondaryRequest('4')).toBe(true);
    expect(isProductAdSecondaryRequest(1.5)).toBe(true); // secondary — and then refused by the range check
    expect(isProductAdSecondaryRequest(9999)).toBe(true);
  });

  it.each([1, 5, PRODUCT_AD_MAX_SCENE_INDEX, '3', ' 7 '])('accepts %p', (v) => {
    expect(parseSecondarySceneIndex(v)).toBe(Number(v));
  });

  it.each([0, -1, 12, 9999, 1.5, NaN, Infinity, '1e1', '2.0', '', true, [2], null, undefined])('rejects %p', (v) => {
    expect(parseSecondarySceneIndex(v)).toBeNull();
  });
});

describe('gateProductAdSecondaryClip', () => {
  const input = { userId: USER, jobId: JOB, sceneIndex: 2 };

  it('allows a secondary whose primary debit is in the ledger, and claims its scene for the hour', async () => {
    const { d, calls } = deps({ reads: [25] });
    await expect(gateProductAdSecondaryClip(input, d)).resolves.toEqual({ ok: true, sceneIndex: 2, admin: false });
    expect(calls.claims).toEqual([{ uid: USER, key: productAdSceneKey(JOB, 2), ttl: PRODUCT_AD_SCENE_WINDOW_SEC }]);
  });

  it('refuses without a jobId — before reading the ledger or burning the scene', async () => {
    for (const jobId of [null, '']) {
      const { d, calls } = deps();
      const v = await gateProductAdSecondaryClip({ ...input, jobId }, d);
      expect(v).toMatchObject({ ok: false, status: 402, reason: 'no-job' });
      expect(calls.reads).toBe(0);
      expect(calls.claims).toHaveLength(0);
    }
  });

  it('refuses a jobId outside the client charset (colons, LIKE / PostgREST wildcards)', async () => {
    for (const jobId of ['a:25', 'product_%', 'x*', 'a b']) {
      const { d } = deps();
      await expect(gateProductAdSecondaryClip({ ...input, jobId }, d)).resolves.toMatchObject({ ok: false, status: 402, reason: 'no-job' });
    }
  });

  it('refuses when no primary debit ever lands — after a bounded wait, without burning the scene', async () => {
    const { d, calls } = deps({ reads: [0] });
    const v = await gateProductAdSecondaryClip(input, d);
    expect(v).toMatchObject({ ok: false, status: 402, reason: 'unpaid' });
    expect(calls.reads).toBeGreaterThan(1); // it waited for a concurrent primary…
    expect(calls.reads).toBeLessThan(20);   // …but not forever
    expect(calls.claims).toHaveLength(0);
  });

  it('refuses (never frees) when the ledger cannot be read', async () => {
    const { d, calls } = deps({ reads: [null] });
    await expect(gateProductAdSecondaryClip(input, d)).resolves.toMatchObject({ ok: false, status: 402, reason: 'ledger' });
    expect(calls.claims).toHaveLength(0);
  });

  it('waits for a primary fired concurrently — clip 1 may reach the server before clip 0 is charged', async () => {
    const { d } = deps({ reads: [0, 0, 25, 25] });
    await expect(gateProductAdSecondaryClip(input, d)).resolves.toMatchObject({ ok: true, sceneIndex: 2 });
  });

  it('refuses when the primary is refunded during the settle window (charge-then-refund, fired concurrently)', async () => {
    const { d, calls } = deps({ reads: [25, 0] });
    await expect(gateProductAdSecondaryClip(input, d)).resolves.toMatchObject({ ok: false, status: 402, reason: 'unpaid' });
    expect(calls.claims).toHaveLength(0);
  });

  it.each([0, 12, 1.5, 'x', -3])('refuses sceneIndex %p as out of range', async (sceneIndex) => {
    const { d, calls } = deps();
    await expect(gateProductAdSecondaryClip({ ...input, sceneIndex }, d)).resolves.toMatchObject({ ok: false, status: 400, reason: 'scene-index' });
    expect(calls.reads).toBe(0);
  });

  it('renders each (jobId, sceneIndex) at most once per window', async () => {
    const { d } = deps({ claim: async () => false });
    await expect(gateProductAdSecondaryClip(input, d)).resolves.toMatchObject({ ok: false, status: 409, reason: 'scene-spent' });
  });

  it('refuses a signed-out caller', async () => {
    const { d } = deps();
    await expect(gateProductAdSecondaryClip({ ...input, userId: null }, d)).resolves.toMatchObject({ ok: false, status: 401 });
  });

  it('admins bypass the ledger requirement (as they bypass billing), but not the range or the per-scene bound', async () => {
    const { d, calls } = deps({ isAdmin: async () => true, reads: [0] });
    await expect(gateProductAdSecondaryClip(input, d)).resolves.toEqual({ ok: true, sceneIndex: 2, admin: true });
    expect(calls.reads).toBe(0);
    expect(calls.claims).toHaveLength(1);
    const again = deps({ isAdmin: async () => true });
    await expect(gateProductAdSecondaryClip({ ...input, sceneIndex: 12 }, again.d)).resolves.toMatchObject({ ok: false, status: 400 });
  });
});

describe('readProductAdPrimaryNetDebit', () => {
  /** Chainable fake of the one supabase-js query the reader makes. */
  function fakeSb(result: { data: unknown; error: unknown }) {
    const seen: Record<string, unknown[]> = {};
    const q = {
      select: (...a: unknown[]) => { seen.select = a; return q; },
      eq: (...a: unknown[]) => { seen.eq = a; return q; },
      like: (...a: unknown[]) => { seen.like = a; return q; },
      limit: async (...a: unknown[]) => { seen.limit = a; return result; },
    };
    const sb = { from: (t: string) => { seen.from = [t]; return q; } } as unknown as SupabaseClient;
    return { sb, seen };
  }

  it('reads this user’s rows under the escaped primary prefix and nets them', async () => {
    const { sb, seen } = fakeSb({ data: [debit(PRIMARY_REF)], error: null });
    await expect(readProductAdPrimaryNetDebit(sb, USER, JOB)).resolves.toBe(25);
    expect(seen.from).toEqual(['credit_ledger']);
    expect(seen.eq).toEqual(['user_id', USER]);
    // `_` in the jobId is a LIKE wildcard — escaped, so it cannot widen the match.
    expect(seen.like).toEqual(['metadata->>ref', 'remix:productad:product\\_3\\_1790000000000:%']);
    expect(seen.limit).toEqual([PRODUCT_AD_LEDGER_ROW_CAP]);
  });

  it('returns null (refuse) on a read error, a missing client, or a manufactured pile of rows', async () => {
    await expect(readProductAdPrimaryNetDebit(fakeSb({ data: null, error: { message: 'x' } }).sb, USER, JOB)).resolves.toBeNull();
    await expect(readProductAdPrimaryNetDebit(null, USER, JOB)).resolves.toBeNull();
    const pile = Array.from({ length: PRODUCT_AD_LEDGER_ROW_CAP }, () => debit(PRIMARY_REF));
    await expect(readProductAdPrimaryNetDebit(fakeSb({ data: pile, error: null }).sb, USER, JOB)).resolves.toBeNull();
  });
});

describe('the route wiring', () => {
  const route = readFileSync(join(__dirname, '../../app/api/video/remix/route.ts'), 'utf8');

  it('gates a secondary before the debit block and frees the mutex on refusal', () => {
    const gateAt = route.indexOf('await gateProductAdSecondaryClip(');
    const debitAt = route.indexOf('await deductCredits(remixUid, chargeAmount, txnRef)');
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(debitAt);
    expect(route.slice(gateAt, gateAt + 1400)).toMatch(/if \(!gate\.ok\) \{\s*await releaseIdem\(\);/);
  });

  it('skips the Kling (Replicate) leg when the pipeline is Google-only, keeping the free Ken Burns fallback', () => {
    expect(route).toContain('veoAd?.url || (isGoogleOnly() ? null : await klingI2v(startImg, adPrompt, aspectP))');
    expect(route).toContain('const url = animated || (await kenBurnsClip(startImg, 5, aspectP));');
    expect(route).toContain("if (!animated) await refundCharge('fallback-kenburns');");
  });
});

describe('a paid primary is recent and covers only the length it paid for', () => {
  const NOW = Date.parse('2026-09-30T12:00:00Z');
  const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();

  it('a primary older than the age limit carries nothing (one ad cannot re-open free clips every hour)', () => {
    const rows: LedgerRow[] = [{ ...debit(PRIMARY_REF), created_at: at(PRODUCT_AD_PRIMARY_MAX_AGE_SEC + 60) }];
    expect(primaryNetDebit(rows, JOB, NOW)).toBe(0);
    const fresh: LedgerRow[] = [{ ...debit(PRIMARY_REF), created_at: at(120) }];
    expect(primaryNetDebit(fresh, JOB, NOW)).toBe(25);
  });

  it('an unparseable timestamp is stale, never fresh', () => {
    expect(primaryNetDebit([{ ...debit(PRIMARY_REF), created_at: 'not a date' }], JOB, NOW)).toBe(0);
  });

  it('a 25-credit ad covers clips up to index 5; a 45-credit ad the full twelve', () => {
    expect(maxSecondarySceneIndexFor(25)).toBe(5);
    expect(maxSecondarySceneIndexFor(45)).toBe(PRODUCT_AD_MAX_SCENE_INDEX);
  });

  it('the gate refuses a clip beyond the paid length — and does not burn its scene', async () => {
    const { d, calls } = deps({ reads: [25, 25] });
    const verdict = await gateProductAdSecondaryClip({ userId: USER, jobId: JOB, sceneIndex: 7 }, d);
    expect(verdict).toMatchObject({ ok: false, status: 402, reason: 'unpaid' });
    expect(calls.claims).toHaveLength(0);
    const { d: d45 } = deps({ reads: [45, 45] });
    await expect(gateProductAdSecondaryClip({ userId: USER, jobId: JOB, sceneIndex: 7 }, d45)).resolves.toMatchObject({ ok: true, sceneIndex: 7 });
  });

  it('the secondaries marker is per job', () => {
    expect(productAdSecondariesKey(JOB)).toBe(`productad-secondaries:${JOB}`);
  });
});

describe('the route keeps a primary\'s charge once its secondaries were admitted', () => {
  const route = readFileSync(join(__dirname, '..', '..', 'app', 'api', 'video', 'remix', 'route.ts'), 'utf8');
  it('marks the job when a secondary is admitted, and the primary refund path checks that mark first', () => {
    expect(route).toMatch(/claimIdempotencyKey\(remixUid, productAdSecondariesKey\(jobId\), 3600\)/);
    const refundAt = route.indexOf('const refundCharge = async');
    const markCheck = route.indexOf('noSecondaryAdmitted', refundAt);
    const refundCall = route.indexOf('refundCredits(remixUid', refundAt);
    expect(markCheck).toBeGreaterThan(refundAt);
    expect(markCheck).toBeLessThan(refundCall);
  });
});
