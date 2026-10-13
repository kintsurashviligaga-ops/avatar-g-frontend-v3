import { test, expect, type APIRequestContext } from '@playwright/test';
import { assertIsolatedSupabase } from './guard';
import { balanceOf, evidence, ledgerOf, liveUser, putOwnUpload, rows, rpc, signInToken, type LedgerRow } from './_live';

/**
 * THE FILM STITCH'S MONEY, on the real `next start` server, the real ledger and real ffmpeg (no browser). An ordinary
 * account (the `payer`: admins are never charged) sends synthetic clips it uploaded to its own folder to
 * /api/video/assemble, and the ledger is read back with the service role after every call:
 *   · the first film spends the free film and no credit (consume_free_film, 20260602);
 *   · a second, different composition is debited its price exactly once (assemble:<saga>);
 *   · a stitch that cannot decode a clip is refunded: one debit, one refund, net zero, no film;
 *   · two presses at once: every delivered film is paid once and every failed one is refunded. Without Redis (this job
 *     has none, like any deployment without UPSTASH_REDIS_REST_URL) the 60 s duplicate guard is open, so both presses
 *     can make a film and be charged for it; the evidence says which happened.
 * The route's EXPENSIVE limiter is 5 calls a minute per address; a 429 is waited out, never counted as a result.
 */
const ASSEMBLE = '/api/video/assemble';
// Two 4 s clips: 8 s of film at 25 credits per 8 s (lib/credits/videoPricing videoCredits, documentary mode).
const FILM_PRICE = 25;

interface Press { status: number; body: Record<string, unknown> }

async function assemble(request: APIRequestContext, token: string, data: Record<string, unknown>, waitOut429 = true): Promise<Press> {
  for (let attempt = 0; ; attempt++) {
    const res = await request.post(ASSEMBLE, { headers: { Authorization: `Bearer ${token}` }, data, timeout: 300_000 });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status() !== 429 || !waitOut429 || attempt >= 4) return { status: res.status(), body };
    const wait = Math.min(65, Math.max(5, Number(res.headers()['retry-after']) || 30));
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

const filmRows = (all: LedgerRow[], sinceIso: string) =>
  // PostgREST writes microseconds and an offset („…12.345678+00:00"): compared as instants, never as strings.
  all.filter((r) => Date.parse(r.created_at) >= Date.parse(sinceIso) - 1000 && /^assemble(?:-single|-rollback)?:/.test(String(r.metadata?.ref ?? '')));
const freeFilmsOf = async (userId: string) =>
  (await rows<{ free_films_remaining: number | null }>(`profiles?id=eq.${userId}&select=free_films_remaining`))[0]?.free_films_remaining ?? null;
const summary = (r: LedgerRow[]) => r.map((x) => ({ delta: x.delta, ref: String(x.metadata?.ref ?? '').replace(/:[0-9a-f-]{36}$/i, ':<id>') }));

test.describe('Video Core live — the film stitch charges once, refunds a failure, and spends the free film first', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(900_000);
  test.beforeAll(() => { assertIsolatedSupabase(process.env); });

  let token = '';
  let clipA = '';
  let clipB = '';
  let broken = '';
  const payer = () => liveUser('payer');

  test('setup: the payer signs in and uploads two clips and a truncated one to its own folder', async () => {
    token = await signInToken(payer().email);
    clipA = (await putOwnUpload(payer().id, 'clip-a.mp4', 'clip-a.mp4')).url;
    clipB = (await putOwnUpload(payer().id, 'clip-b.mp4', 'clip-b.mp4')).url;
    broken = (await putOwnUpload(payer().id, 'truncated.mp4', 'truncated.mp4')).url;
    expect(await balanceOf(payer().id)).toBe(50);
    expect(await freeFilmsOf(payer().id)).toBe(1);
  });

  test('the first film spends the free film, not credits', async ({ request }) => {
    const since = new Date().toISOString();
    const r = await assemble(request, token, { segments: [{ url: clipA, durationSec: 4 }, { url: clipB, durationSec: 4 }], noMusic: true, orientation: 'vertical' });
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200);
    expect(typeof r.body.url).toBe('string');
    expect(r.body.freeFilm).toBe(true);
    expect(await balanceOf(payer().id)).toBe(50);
    expect(await freeFilmsOf(payer().id)).toBe(0);
    const mine = filmRows(await ledgerOf(payer().id), since);
    expect(mine).toEqual([]);
    evidence('billing-free-film', { status: r.status, freeFilm: r.body.freeFilm, balance: 50, freeFilmsLeft: 0, ledger: summary(mine) });
  });

  test('a different composition is debited its price exactly once', async ({ request }) => {
    const since = new Date().toISOString();
    const r = await assemble(request, token, { segments: [{ url: clipB, durationSec: 4 }, { url: clipA, durationSec: 4 }], noMusic: true, orientation: 'vertical' });
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200);
    expect(typeof r.body.url).toBe('string');
    expect(r.body.freeFilm).toBe(false);
    const mine = filmRows(await ledgerOf(payer().id), since);
    expect(mine.map((x) => x.delta)).toEqual([-FILM_PRICE]);
    expect(String(mine[0]!.metadata?.ref)).toMatch(/^assemble:/);
    expect(await balanceOf(payer().id)).toBe(50 - FILM_PRICE);
    evidence('billing-paid-film', { status: r.status, freeFilm: r.body.freeFilm, balance: 50 - FILM_PRICE, ledger: summary(mine) });
  });

  test('a stitch that cannot decode a clip delivers nothing and nets to zero (one debit, one refund at most)', async ({ request }) => {
    const before = await balanceOf(payer().id);
    const since = new Date().toISOString();
    const r = await assemble(request, token, { segments: [{ url: clipA, durationSec: 4 }, { url: broken, durationSec: 4 }], noMusic: true, orientation: 'vertical' });
    expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBeGreaterThanOrEqual(400);
    expect(r.body.url).toBeUndefined();
    const mine = filmRows(await ledgerOf(payer().id), since);
    const debits = mine.filter((x) => x.delta < 0);
    const refunds = mine.filter((x) => x.delta > 0);
    expect(debits.length).toBeLessThanOrEqual(1);
    expect(refunds.length).toBe(debits.length);
    expect(mine.reduce((s, x) => s + x.delta, 0)).toBe(0);
    expect(await balanceOf(payer().id)).toBe(before);
    evidence('billing-failed-stitch', { status: r.status, error: r.body.error, failedStep: r.body.failedStep, balanceBefore: before, balanceAfter: before, ledger: summary(mine) });
  });

  test('two presses at once: every delivered film is paid once, every failed press is refunded', async ({ request }) => {
    // Synthetic credits on this run's own stack (service role), so both presses could be paid for.
    await rpc('refund_credits', { p_user_id: payer().id, p_amount: 50, p_ref: `e2e:topup:${Date.now()}` });
    // A fresh limiter window, so neither press is a 429.
    await new Promise((r) => setTimeout(r, 61_000));
    const before = await balanceOf(payer().id);
    const since = new Date().toISOString();
    const data = { segments: [{ url: clipA, durationSec: 4 }, { url: clipB, durationSec: 4 }], noMusic: true, orientation: 'square' };
    const presses = await Promise.all([assemble(request, token, data, false), assemble(request, token, data, false)]);
    const delivered = presses.filter((p) => p.status === 200 && typeof p.body.url === 'string');
    for (const p of presses) if (p.status !== 200) expect([402, 409, 429, 500, 502]).toContain(p.status);
    const mine = filmRows(await ledgerOf(payer().id), since);
    const debits = mine.filter((x) => x.delta < 0);
    const refunds = mine.filter((x) => x.delta > 0);
    expect(debits.length - refunds.length).toBe(delivered.length);
    expect(debits.every((x) => x.delta === -FILM_PRICE)).toBe(true);
    expect(await balanceOf(payer().id)).toBe(before - FILM_PRICE * delivered.length);
    evidence('billing-double-press', {
      statuses: presses.map((p) => p.status), errors: presses.map((p) => p.body.error ?? null), delivered: delivered.length,
      duplicateGuard: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL ? 'redis' : 'absent (no Redis in this job)',
      balanceBefore: before, balanceAfter: before - FILM_PRICE * delivered.length, ledger: summary(mine),
    });
  });

  test.afterAll(async () => {
    // Leave the browser projects a fresh EXPENSIVE window (they pace themselves from a full one).
    await new Promise((r) => setTimeout(r, 61_000));
  });
});
