import { test, expect } from '@playwright/test';
import { balanceOf, evidence, liveUser, logExpensive, paced, rest, rows, signInToken } from '../video-core-live/_live';
import { MUSIC_PRICE, STARTED, jobRow, ledgerForJob } from './_music';

/**
 * Music Studio v1 — access, ownership, Storage/RLS and billing integrity through the app's real HTTP routes and the
 * local stack's own PostgREST and Storage (anon key, a user's token, the service role for the truth). The provider is
 * the isolated stand-in (lib/music/studio/e2eProvider), never Lyria. The `payer` and `other` users are ordinary accounts.
 */

test.describe.configure({ mode: 'serial' });

const BASE = () => (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const req = (overrides: Record<string, unknown> = {}) => ({
  v: 1, prompt: 'api check instrumental', mode: 'instrumental', modelId: 'lyria-3-clip-preview', durationSec: 30, locale: 'en', ...overrides,
});

/** The app's own routes, with a user's Supabase token as the bearer (the routes read the session from it). */
async function app(request: import('@playwright/test').APIRequestContext, method: 'GET' | 'POST', path: string, token: string | null, body?: unknown) {
  const res = await request.fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { data: JSON.stringify(body) } : {}),
    failOnStatusCode: false,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* not json */ }
  return { status: res.status(), json, text };
}

/** POST /api/music/studio/jobs, counted against the user's 5-a-minute start allowance (paced like a person would be). */
async function start(request: import('@playwright/test').APIRequestContext, userId: string, token: string, body: unknown) {
  await paced(userId);
  logExpensive(userId);
  return app(request, 'POST', '/api/music/studio/jobs', token, body);
}

async function waitFinal(request: import('@playwright/test').APIRequestContext, token: string, jobId: string) {
  for (let i = 0; i < 90; i++) {
    const s = await app(request, 'GET', `/api/music/studio/jobs/${jobId}`, token);
    if (['completed', 'failed', 'cancelled'].includes(String(s.json.status))) return s;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`job ${jobId} did not finish`);
}

let payerToken = '';
let otherToken = '';
let ownedJob = '';
let ownedPath = '';

test('anonymous callers are refused on every Music Studio route; the sweep needs the cron secret', async ({ request }) => {
  const anon = [
    await app(request, 'POST', '/api/music/studio/quote', null, req()),
    await app(request, 'POST', '/api/music/studio/jobs', null, { confirmed: true }),
    await app(request, 'GET', '/api/music/studio/jobs/00000000-0000-4000-8000-000000000000', null),
    await app(request, 'POST', '/api/music/studio/jobs/00000000-0000-4000-8000-000000000000/cancel', null, {}),
    await app(request, 'POST', '/api/music/studio/edit', null, { v: 1, sources: ['00000000-0000-4000-8000-000000000000'], format: 'mp3', locale: 'en' }),
  ];
  for (const r of anon) expect(r.status).toBe(401);
  expect((await app(request, 'GET', '/api/music/studio/sweep', null)).status).toBe(403);
  expect((await app(request, 'GET', '/api/music/studio/sweep', 'not-the-secret')).status).toBe(403);
});

test('quote → confirm: exact price, replay = same job, 4 concurrent confirms = ONE debit; tampering and expiry refused before money', async ({ request }) => {
  const payer = liveUser('payer');
  payerToken = await signInToken(payer.email);
  const before = await balanceOf(payer.id);

  const q = await app(request, 'POST', '/api/music/studio/quote', payerToken, req({ prompt: 'api piano sketch' }));
  expect(q.status).toBe(200);
  expect(q.json.credits).toBe(MUSIC_PRICE);
  expect(await balanceOf(payer.id), 'a quote never charges').toBe(before);
  const { plan, token } = q.json as { plan: Record<string, unknown> & { request: Record<string, unknown> }; token: string };

  // Without the explicit confirmation flag: refused, nothing charged.
  expect((await start(request, payer.id, payerToken, { plan, token })).status).toBe(400);
  // A changed plan under the old token (prompt, or a cheaper length): refused before any charge.
  const tampered = [
    { plan: { ...plan, request: { ...plan.request, prompt: 'something else' } }, token, confirmed: true },
    { plan: { ...plan, billedSec: 5 }, token, confirmed: true },
    { plan, token: `${token.slice(0, -4)}AAAA`, confirmed: true },
  ];
  for (const t of tampered) {
    const r = await start(request, payer.id, payerToken, t);
    expect(r.status, JSON.stringify(r.json)).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  }
  // Another user replaying the payer's quote: refused.
  const other = liveUser('other');
  otherToken = await signInToken(other.email);
  const stolen = await start(request, other.id, otherToken, { plan, token, confirmed: true });
  expect(stolen.status).toBeGreaterThanOrEqual(400);
  expect(stolen.status).toBeLessThan(500);
  expect(await balanceOf(payer.id)).toBe(before);

  // Four confirms at once → one job, one debit.
  await paced(payer.id, 5); // room for all five calls below in one window
  for (let i = 0; i < 5; i++) logExpensive(payer.id);
  const starts = await Promise.all(Array.from({ length: 4 }, () => app(request, 'POST', '/api/music/studio/jobs', payerToken, { plan, token, confirmed: true })));
  // Each answer is the job (202 new / 200 the same job again) or a 409 "quote already used" — never a second job.
  expect(starts.every((s) => STARTED.includes(s.status) || (s.status === 409 && s.json.code === 'quote_used')), JSON.stringify(starts.map((s) => [s.status, s.json.code]))).toBe(true);
  const ids = new Set(starts.filter((s) => STARTED.includes(s.status)).map((s) => String(s.json.jobId)));
  expect(ids.size).toBe(1);
  ownedJob = [...ids][0]!;
  // A later replay of the same quote returns the same job.
  const replay = await app(request, 'POST', '/api/music/studio/jobs', payerToken, { plan, token, confirmed: true });
  expect([200, 409]).toContain(replay.status);
  if (replay.status === 200) expect(replay.json.jobId).toBe(ownedJob);
  const done = await waitFinal(request, payerToken, ownedJob);
  expect(done.json.status).toBe('completed');
  expect((await ledgerForJob(payer.id, ownedJob)).map((r) => r.delta)).toEqual([-MUSIC_PRICE]);
  expect(await balanceOf(payer.id)).toBe(before - MUSIC_PRICE);
  ownedPath = String(((await jobRow(ownedJob))!.result as { path: string }).path);

  // Secrets never travel: no key of the stack in any answer.
  for (const body of [q.text, done.text, ...starts.map((s) => s.text)]) {
    expect(body).not.toContain(SERVICE());
    expect(body).not.toMatch(/service_role|x-goog-api-key|GEMINI_API_KEY|private_key/);
  }
  evidence('music-api-billing', { before, after: await balanceOf(payer.id), concurrent: starts.map((s) => s.status), jobId: ownedJob });
});

test('cross-user isolation: another user cannot read, cancel or edit the job, nor see its rows', async ({ request }) => {
  const other = liveUser('other');
  expect((await app(request, 'GET', `/api/music/studio/jobs/${ownedJob}`, otherToken)).status).toBe(404);
  expect((await app(request, 'POST', `/api/music/studio/jobs/${ownedJob}/cancel`, otherToken, {})).status).toBe(404);
  const edit = await app(request, 'POST', '/api/music/studio/edit', otherToken, { v: 1, sources: [ownedJob], ops: [{ op: 'trim', startSec: 0, endSec: 10 }], format: 'mp3', locale: 'en' });
  expect(edit.status).toBe(404);
  // PostgREST with the other user's own token and with the anon key: none of the payer's rows.
  expect(await rows(`generation_jobs?id=eq.${ownedJob}&select=id`, { token: otherToken })).toEqual([]);
  expect(await rows(`credit_ledger?user_id=eq.${liveUser('payer').id}&select=delta`, { token: otherToken })).toEqual([]);
  const anonJobs = await rest(`generation_jobs?id=eq.${ownedJob}&select=id`, 'anon');
  expect(anonJobs.status === 401 || (Array.isArray(anonJobs.body) && anonJobs.body.length === 0)).toBe(true);
  // Nobody can write a job row from the client (server-only writes), not even its owner.
  const forge = await rest('generation_jobs', { token: otherToken }, { method: 'POST', body: JSON.stringify({ user_id: other.id, service_type: 'music', status: 'completed' }) });
  expect(forge.status).toBeGreaterThanOrEqual(400);
});

test('private Storage: no anonymous or foreign read of the track; signed links expire; edit sources are ids, never URLs (SSRF)', async ({ request }) => {
  const objectUrl = `${BASE()}/storage/v1/object/renders/${ownedPath}`;
  const publicUrl = `${BASE()}/storage/v1/object/public/renders/${ownedPath}`;
  const anonRead = await fetch(objectUrl, { headers: { apikey: ANON(), Authorization: `Bearer ${ANON()}` } });
  expect(anonRead.status).toBeGreaterThanOrEqual(400);
  expect((await fetch(publicUrl)).status).toBeGreaterThanOrEqual(400);
  const foreign = await fetch(objectUrl, { headers: { apikey: ANON(), Authorization: `Bearer ${otherToken}` } });
  expect(foreign.status).toBeGreaterThanOrEqual(400);
  // The other user cannot list the payer's folder.
  const list = await fetch(`${BASE()}/storage/v1/object/list/renders`, {
    method: 'POST', headers: { apikey: ANON(), Authorization: `Bearer ${otherToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prefix: `music-studio/${liveUser('payer').id}/`, limit: 100 }),
  });
  const listed = list.ok ? ((await list.json()) as unknown[]) : [];
  expect(listed).toEqual([]);

  // A signed link works for its lifetime and not after (minted here with a 2 s life by the stack's service role).
  const sign = await fetch(`${BASE()}/storage/v1/object/sign/renders/${ownedPath}`, {
    method: 'POST', headers: { apikey: SERVICE(), Authorization: `Bearer ${SERVICE()}`, 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 2 }),
  });
  const { signedURL } = (await sign.json()) as { signedURL: string };
  const signed = `${BASE()}/storage/v1${signedURL}`;
  expect((await fetch(signed)).status).toBe(200);
  await new Promise((r) => setTimeout(r, 3500));
  expect((await fetch(signed)).status).toBeGreaterThanOrEqual(400);
  // The app's own link (status read) is short-lived too: ≤ 1 h.
  const s = await app(request, 'GET', `/api/music/studio/jobs/${ownedJob}`, payerToken);
  const url = String((s.json.result as { url: string }).url);
  const exp = JSON.parse(Buffer.from(new URL(url).searchParams.get('token')!.split('.')[1]!, 'base64url').toString()) as { exp: number; iat: number };
  expect(exp.exp - exp.iat).toBeLessThanOrEqual(3600);

  // SSRF: an edit source must be a Library id; a URL (metadata service, localhost) is refused before any fetch.
  for (const src of ['http://169.254.169.254/latest/meta-data/', 'http://localhost:54321/storage/v1/object/x', url]) {
    const r = await app(request, 'POST', '/api/music/studio/edit', payerToken, { v: 1, sources: [src], format: 'mp3', locale: 'en' });
    expect(r.status).toBe(400);
  }
  // Unknown fields (e.g. a URL to fetch) are refused by the strict schema.
  const extra = await app(request, 'POST', '/api/music/studio/edit', payerToken, { v: 1, sources: [ownedJob], format: 'mp3', locale: 'en', url: 'http://169.254.169.254/' });
  expect(extra.status).toBe(400);
});

test('insufficient credits: refused with 402 before any job, nothing owed', async ({ request }) => {
  const other = liveUser('other');
  const balance = await balanceOf(other.id);
  // Spend the other user's balance down to 2 with the LOCAL stack's service role (the real money function).
  const spend = await rest('rpc/deduct_credits', 'service', { method: 'POST', body: JSON.stringify({ p_user_id: other.id, p_amount: balance - 2, p_ref: `music-e2e-spend-down:${other.id}` }) });
  test.skip(spend.status >= 300 || (await balanceOf(other.id)) !== 2, `could not set up a 2-credit balance (deduct_credits → ${spend.status})`);
  const q = await app(request, 'POST', '/api/music/studio/quote', otherToken, req({ prompt: 'too expensive' }));
  expect(q.status).toBe(200);
  const r = await start(request, other.id, otherToken, { plan: q.json.plan, token: q.json.token, confirmed: true });
  expect(r.status).toBe(402);
  expect(await balanceOf(other.id)).toBe(2);
  const mine = await rows<{ id: string }>(`generation_jobs?user_id=eq.${other.id}&service_type=eq.music&select=id`);
  for (const j of mine) expect(await ledgerForJob(other.id, j.id)).toEqual([]);
});
