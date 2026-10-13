import { test, expect, type APIRequestContext } from '@playwright/test';
import { assertIsolatedSupabase } from './guard';
import {
  balanceOf, evidence, ledgerOf, liveUser, longCall, noteTransportCut, putOwnUpload, rows, rpc, signInToken, storageList, type LedgerRow,
} from './_live';

/**
 * THE FILM STITCH'S MONEY, on the real server (`next start` in the CI job, the Vercel Preview in the Preview job), the
 * real ledger and real ffmpeg (no browser). An ordinary account (the `payer`: admins are never charged) sends synthetic
 * clips it uploaded to its own folder to /api/video/assemble, and the ledger is read back with the service role after
 * every call:
 *   · the first film spends the free film and no credit (consume_free_film, 20260602);
 *   · a second, different composition is debited its price exactly once (assemble:<saga>);
 *   · a stitch that cannot decode a clip is refunded: one debit, one refund, net zero, no film;
 *   · two presses at once: every delivered film is paid once and every failed one is refunded. Without Redis (this job
 *     has none, like any deployment without UPSTASH_REDIS_REST_URL) the 60 s duplicate guard is open, so both presses
 *     can make a film and be charged for it; the evidence says which happened.
 * Every stitch is judged twice: by its answer, and by what the server left behind — the ledger, the free film and the
 * masters in the `renders` bucket (one folder per saga, renders/<saga>/<ms>.mp4, lib/orchestrator/ffmpeg-assembly). A
 * call whose connection breaks before its answer (Preview run 38369812054 on 9faec08: `read ETIMEDOUT` 38 s into the
 * first stitch, through Playwright's request client) is judged by the second alone, waited out up to the route's own
 * 600 s, and recorded for transport.spec, which fails the run on it by name. Two calls go through Playwright's client
 * and two through Node's own (_live longCall: a fresh connection, no TCP keepalive), so a cut also names its client.
 * The route's EXPENSIVE limiter is 5 calls a minute per address; a 429 is waited out, never counted as a result.
 */
const ASSEMBLE = '/api/video/assemble';
// Two 4 s clips: 8 s of film at 25 credits per 8 s (lib/credits/videoPricing videoCredits, documentary mode).
const FILM_PRICE = 25;
// The route's maxDuration is 600 s; a call is given that and a little more.
const CALL_MS = 620_000;

type Client = 'playwright' | 'node';
interface Press { status: number; body: Record<string, unknown>; ms: number; client: Client; transport?: string }

const baseURL = (): string => String(test.info().project.use.baseURL ?? 'http://localhost:3000');

async function assemble(request: APIRequestContext, token: string, data: Record<string, unknown>, client: Client, waitOut429 = true): Promise<Press> {
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now();
    let status = 0;
    let body: Record<string, unknown> = {};
    let retryAfter: unknown;
    let transport: string | undefined;
    if (client === 'node') {
      const r = await longCall('POST', new URL(ASSEMBLE, baseURL()).href, { headers: { Authorization: `Bearer ${token}` }, json: data, timeoutMs: CALL_MS });
      ({ status, body, transport } = r);
      retryAfter = r.headers['retry-after'];
    } else {
      try {
        const res = await request.post(ASSEMBLE, { headers: { Authorization: `Bearer ${token}` }, data, timeout: CALL_MS });
        status = res.status();
        body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        retryAfter = res.headers()['retry-after'];
      } catch (e) {
        transport = String(e instanceof Error ? e.message : e).split('\n')[0];
      }
    }
    const ms = Date.now() - t0;
    if (status !== 429 || !waitOut429 || attempt >= 4) return { status, body, ms, client, ...(transport ? { transport } : {}) };
    const wait = Math.min(65, Math.max(5, Number(retryAfter) || 30));
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

const filmRows = (all: LedgerRow[], sinceIso: string) =>
  // PostgREST writes microseconds and an offset („…12.345678+00:00"): compared as instants, never as strings.
  all.filter((r) => Date.parse(r.created_at) >= Date.parse(sinceIso) - 1000 && /^assemble(?:-single|-rollback)?:/.test(String(r.metadata?.ref ?? '')));
const freeFilmsOf = async (userId: string) =>
  (await rows<{ free_films_remaining: number | null }>(`profiles?id=eq.${userId}&select=free_films_remaining`))[0]?.free_films_remaining ?? null;
const summary = (r: LedgerRow[]) => r.map((x) => ({ delta: x.delta, ref: String(x.metadata?.ref ?? '').replace(/:[0-9a-f-]{36}$/i, ':<id>') }));

/** What the server left behind since a call: the masters it hosted (new saga folders), the film's ledger rows, the free films. */
interface Server { masters: string[]; ledger: LedgerRow[]; freeFilms: number | null }
const sagaFolders = async (): Promise<Set<string>> =>
  new Set((await storageList('renders')).filter((o) => o.id === null && o.name.startsWith('saga_')).map((o) => o.name));
async function serverSince(userId: string, sinceIso: string, before: Set<string>): Promise<Server> {
  const fresh = [...(await sagaFolders())].filter((f) => !before.has(f));
  const masters = (await Promise.all(fresh.map(async (f) =>
    (await storageList('renders', f)).filter((o) => o.id !== null && o.name.endsWith('.mp4')).map((o) => `${f}/${o.name}`)))).flat();
  return { masters, ledger: filmRows(await ledgerOf(userId), sinceIso), freeFilms: await freeFilmsOf(userId) };
}
const debitsOf = (s: Server) => s.ledger.filter((x) => x.delta < 0).length;
const refundsOf = (s: Server) => s.ledger.filter((x) => x.delta > 0).length;

/**
 * The server's account of the calls since `sinceIso`. When every call was answered it is read once (the master is hosted
 * before the answer). When a connection broke, it is read every 5 s until `done` holds or the route's own budget has
 * passed, and the cut is recorded (transport.spec fails the run on it).
 */
async function judge(presses: Press[], label: string, userId: string, sinceIso: string, before: Set<string>, done: (s: Server) => boolean): Promise<Server> {
  const cut = presses.filter((p) => p.transport || p.status === 0);
  if (!cut.length) return serverSince(userId, sinceIso, before);
  const t0 = Date.now();
  let s = await serverSince(userId, sinceIso, before);
  while (!done(s) && Date.now() - t0 < CALL_MS) {
    await new Promise((r) => setTimeout(r, 5_000));
    s = await serverSince(userId, sinceIso, before);
  }
  const settledMs = Date.now() - t0;
  for (const p of cut) {
    noteTransportCut({
      spec: 'billing', call: label, client: p.client, connectionLivedMs: p.ms, error: p.transport ?? 'no answer',
      server: { settled: done(s), settledMsAfterTheCut: settledMs, masters: s.masters.length, ledger: summary(s.ledger), freeFilms: s.freeFilms },
    });
    test.info().annotations.push({ type: 'transport-cut', description: `${label}: ${p.client} client, ${p.transport ?? 'no answer'} after ${p.ms} ms; server ${done(s) ? `settled ${settledMs} ms later` : 'did not settle'}` });
  }
  return s;
}

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
    const before = await sagaFolders();
    const since = new Date().toISOString();
    const r = await assemble(request, token, { segments: [{ url: clipA, durationSec: 4 }, { url: clipB, durationSec: 4 }], noMusic: true, orientation: 'vertical' }, 'playwright');
    // Settled: a master is hosted, or the free film is back (the saga handed it back on a failure).
    const server = await judge([r], 'free-film', payer().id, since, before, (s) => s.masters.length > 0 || s.freeFilms === 1);
    if (!r.transport) {
      expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200);
      expect(typeof r.body.url).toBe('string');
      expect(r.body.freeFilm).toBe(true);
    }
    expect(server.masters, 'one film hosted').toHaveLength(1);
    expect(server.freeFilms).toBe(0);
    expect(server.ledger).toEqual([]);
    expect(await balanceOf(payer().id)).toBe(50);
    evidence('billing-free-film', { client: r.client, ms: r.ms, transport: r.transport ?? null, status: r.status, freeFilm: r.body.freeFilm ?? null, balance: 50, freeFilmsLeft: server.freeFilms, masters: server.masters.length, ledger: summary(server.ledger) });
  });

  test('a different composition is debited its price exactly once', async ({ request }) => {
    const before = await sagaFolders();
    const since = new Date().toISOString();
    const r = await assemble(request, token, { segments: [{ url: clipB, durationSec: 4 }, { url: clipA, durationSec: 4 }], noMusic: true, orientation: 'vertical' }, 'node');
    const server = await judge([r], 'paid-film', payer().id, since, before, (s) => s.masters.length > 0 || refundsOf(s) > 0);
    if (!r.transport) {
      expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBe(200);
      expect(typeof r.body.url).toBe('string');
      expect(r.body.freeFilm).toBe(false);
    }
    expect(server.masters, 'one film hosted').toHaveLength(1);
    expect(server.ledger.map((x) => x.delta)).toEqual([-FILM_PRICE]);
    expect(String(server.ledger[0]!.metadata?.ref)).toMatch(/^assemble:/);
    expect(await balanceOf(payer().id)).toBe(50 - FILM_PRICE);
    evidence('billing-paid-film', { client: r.client, ms: r.ms, transport: r.transport ?? null, status: r.status, freeFilm: r.body.freeFilm ?? null, balance: 50 - FILM_PRICE, masters: server.masters.length, ledger: summary(server.ledger) });
  });

  test('a stitch that cannot decode a clip delivers nothing and nets to zero (one debit, one refund at most)', async ({ request }) => {
    const balance = await balanceOf(payer().id);
    const before = await sagaFolders();
    const since = new Date().toISOString();
    const r = await assemble(request, token, { segments: [{ url: clipA, durationSec: 4 }, { url: broken, durationSec: 4 }], noMusic: true, orientation: 'vertical' }, 'playwright');
    const server = await judge([r], 'failed-stitch', payer().id, since, before, (s) => refundsOf(s) >= debitsOf(s) && debitsOf(s) > 0);
    if (!r.transport) {
      expect(r.status, JSON.stringify(r.body).slice(0, 400)).toBeGreaterThanOrEqual(400);
      expect(r.body.url).toBeUndefined();
    }
    expect(server.masters).toEqual([]);
    expect(debitsOf(server)).toBeLessThanOrEqual(1);
    expect(refundsOf(server)).toBe(debitsOf(server));
    expect(server.ledger.reduce((sum, x) => sum + x.delta, 0)).toBe(0);
    expect(await balanceOf(payer().id)).toBe(balance);
    evidence('billing-failed-stitch', { client: r.client, ms: r.ms, transport: r.transport ?? null, status: r.status, error: r.body.error ?? null, failedStep: r.body.failedStep ?? null, balanceBefore: balance, balanceAfter: balance, ledger: summary(server.ledger) });
  });

  test('two presses at once: every delivered film is paid once, every failed press is refunded', async ({ request }) => {
    // Synthetic credits on this run's own stack (service role), so both presses could be paid for.
    await rpc('refund_credits', { p_user_id: payer().id, p_amount: 50, p_ref: `e2e:topup:${Date.now()}` });
    // A fresh limiter window, so neither press is a 429.
    await new Promise((r) => setTimeout(r, 61_000));
    const balance = await balanceOf(payer().id);
    const before = await sagaFolders();
    const since = new Date().toISOString();
    const data = { segments: [{ url: clipA, durationSec: 4 }, { url: clipB, durationSec: 4 }], noMusic: true, orientation: 'square' };
    const presses = await Promise.all([assemble(request, token, data, 'node', false), assemble(request, token, data, 'node', false)]);
    // Settled: every debit has its master or its refund.
    const server = await judge(presses, 'double-press', payer().id, since, before, (s) => debitsOf(s) > 0 && s.masters.length + refundsOf(s) >= debitsOf(s));
    const answered = presses.filter((p) => !p.transport);
    for (const p of answered) if (p.status !== 200) expect([402, 409, 429, 500, 502]).toContain(p.status);
    const delivered = server.masters.length;
    // Every answered press that says it delivered has its master; with every press answered the two counts agree.
    expect(answered.filter((p) => p.status === 200 && typeof p.body.url === 'string').length).toBeLessThanOrEqual(delivered);
    if (answered.length === presses.length) expect(answered.filter((p) => p.status === 200 && typeof p.body.url === 'string').length).toBe(delivered);
    expect(debitsOf(server) - refundsOf(server)).toBe(delivered);
    expect(server.ledger.filter((x) => x.delta < 0).every((x) => x.delta === -FILM_PRICE)).toBe(true);
    expect(await balanceOf(payer().id)).toBe(balance - FILM_PRICE * delivered);
    evidence('billing-double-press', {
      clients: presses.map((p) => p.client), ms: presses.map((p) => p.ms), transport: presses.map((p) => p.transport ?? null),
      statuses: presses.map((p) => p.status), errors: presses.map((p) => p.body.error ?? null), delivered,
      duplicateGuard: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL ? 'redis' : 'absent (no Redis in this job)',
      balanceBefore: balance, balanceAfter: balance - FILM_PRICE * delivered, ledger: summary(server.ledger),
    });
  });

  test.afterAll(async () => {
    // Leave the browser projects a fresh EXPENSIVE window (they pace themselves from a full one).
    await new Promise((r) => setTimeout(r, 61_000));
  });
});
