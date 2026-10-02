/** @jest-environment node */
/**
 * runProviderHealthAudit({ live: true }) against a scripted global fetch — no network. Only the Gemini key is set, so
 * only the Gemini probe runs: it carries the key ONLY in the x-goog-api-key header (never `?key=`) with redirect:
 * manual, and a thrown message can never carry the key into `detail` (served by /api/app/health).
 *
 * The Gemini probe asks TWO questions: the free model listing (reachability + auth) and ONE generated token (billing) —
 * listing alone stayed green for days while every real call answered 402. Probes run side by side under a deadline, so
 * one hung vendor can no longer time the whole audit out.
 */
jest.mock('server-only', () => ({}));
jest.mock('../chat/ltxKey', () => ({ resolveLtxApiKey: () => null }));
jest.mock('../chat/mediaKeys', () => ({ resolveUdioApiKey: () => null }));

import { runProviderHealthAudit } from './provider-health';

type Init = RequestInit & { headers: Record<string, string> };

const KEY = 'AQ.test-health-key-0123456789abcdef';
const ENV_VARS = ['OPENAI_API_KEY', 'WORLDLABS_API_KEY', 'HEYGEN_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL_FLASH'] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  for (const k of ENV_VARS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.GEMINI_API_KEY = KEY;
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
  for (const k of ENV_VARS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const gemini = async (opts: { deadlineMs?: number } = {}) =>
  (await runProviderHealthAudit({ live: true, ...opts })).providers.find((p) => p.provider === 'gemini');
const listingOk = () => new Response('{"models":[]}', { status: 200 });
const generation = (status: number) => new Response('{}', { status });

test('the Gemini probe: the key rides only in the header, redirect manual, no key in any URL — on BOTH requests', async () => {
  fetchMock.mockResolvedValueOnce(listingOk()).mockResolvedValueOnce(generation(200));

  expect(await gemini()).toMatchObject({ status: 'healthy', detail: 'Models and generation OK' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [listUrl, listInit] = fetchMock.mock.calls[0] as [string, Init];
  const [genUrl, genInit] = fetchMock.mock.calls[1] as [string, Init];
  expect(listUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models');
  expect(genUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  for (const [url, init] of [[listUrl, listInit], [genUrl, genInit]] as Array<[string, Init]>) {
    expect(url).not.toMatch(/[?&]key=/);
    expect(url).not.toContain(KEY);
    expect(init.headers['x-goog-api-key']).toBe(KEY);
    expect(init.redirect).toBe('manual');
    expect(init.cache).toBe('no-store');
  }
  expect(genInit.method).toBe('POST');
  expect(JSON.parse(String(genInit.body)).generationConfig.maxOutputTokens).toBe(1); // one token: well under $0.0001
});

test('the generation probe follows the registry flash tier, so it never names a retired model', async () => {
  process.env.GEMINI_MODEL_FLASH = 'gemini-3.7-flash';
  fetchMock.mockResolvedValueOnce(listingOk()).mockResolvedValueOnce(generation(200));
  await gemini();
  expect((fetchMock.mock.calls[1] as [string])[0]).toContain('/models/gemini-3.7-flash:generateContent');
});

test('THE BLIND SPOT: a listing that works but a generation that answers 402 is UNHEALTHY — out of credit', async () => {
  fetchMock.mockResolvedValueOnce(listingOk()).mockResolvedValueOnce(generation(402));
  expect(await gemini()).toMatchObject({ status: 'unhealthy', detail: 'Out of credit (402): the prepaid balance is empty' });
});

test('a model this key may not call (404) is unhealthy and says which one', async () => {
  fetchMock.mockResolvedValueOnce(listingOk()).mockResolvedValueOnce(generation(404));
  expect(await gemini()).toMatchObject({ status: 'unhealthy', detail: 'Model gemini-3.8-flash is not available to this key (404)' });
});

test('rate limited (429) is reachable, not an outage', async () => {
  fetchMock.mockResolvedValueOnce(listingOk()).mockResolvedValueOnce(generation(429));
  expect(await gemini()).toMatchObject({ status: 'healthy', detail: 'Reachable, rate limited (429)' });
});

test('unchanged: a 403 on the listing still reads as an auth failure — and no generation is attempted', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));

  expect(await gemini()).toMatchObject({ status: 'unhealthy', detail: 'Auth failed (403)' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a thrown message that echoes the key never reaches `detail`', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError(`Headers.append: "${KEY}" is an invalid header value.`));

  const entry = await gemini();
  expect(entry?.status).toBe('unhealthy');
  expect(entry?.detail).not.toContain(KEY);
  expect(entry?.detail).toContain('[redacted]');
});

test('a provider that never answers gets a "no answer" verdict at the deadline instead of hanging the audit', async () => {
  process.env.OPENAI_API_KEY = 'sk-test-openai';
  fetchMock.mockImplementation((url: string) =>
    String(url).includes('openai.com')
      ? new Promise(() => { /* never settles */ })
      : Promise.resolve(String(url).includes(':generateContent') ? generation(200) : listingOk()),
  );
  const started = Date.now();
  const report = await runProviderHealthAudit({ live: true, deadlineMs: 40 });
  expect(Date.now() - started).toBeLessThan(2_000);
  const by = Object.fromEntries(report.providers.map((p) => [p.provider, p]));
  expect(by.openai).toMatchObject({ status: 'unhealthy', detail: 'No answer within 40 ms' });
  expect(by.gemini).toMatchObject({ status: 'healthy' }); // the hung vendor did not take the others down with it
  expect(report.providers.map((p) => p.provider)).toEqual(['openai', 'udio', 'worldlabs', 'heygen', 'ltx', 'anthropic', 'gemini']);
});

test('without ?live nothing is fetched at all', async () => {
  const report = await runProviderHealthAudit({ live: false });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(report.providers.find((p) => p.provider === 'gemini')).toMatchObject({ status: 'configured' });
});
