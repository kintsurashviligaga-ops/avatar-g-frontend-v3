/** @jest-environment node */
/**
 * Phase 8.21 scenario A: Vertex answers 503 for ten minutes. With VERTEX_BREAKER=1 the transport stops calling it after a
 * few outage answers and answers callers at once with a Google-shaped 503; one probe later closes it again. Off = main.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../veo/vertexAuth', () => ({
  ...jest.requireActual('../../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

import { googleModelFetch } from './transport';
import { breakerPermit, breakerRecord, isOutage, resetVertexBreakerForTests } from './breaker';
import { jitteredRetryDelay } from '../../query/client';

const WIF = {
  GCP_PROJECT_ID: 'p', GCP_PROJECT_NUMBER: '1', GCP_SERVICE_ACCOUNT_EMAIL: 'sa@p.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'pool', GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'prov',
};
const KEYS = ['VERTEX_BREAKER', 'VERTEX_BREAKER_FAILS', 'VERTEX_BREAKER_OPEN_MS', 'GEMINI_TRANSPORT', ...Object.keys(WIF)];
const saved: Record<string, string | undefined> = {};
let t = 1_000_000;
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, WIF);
  t = 1_000_000;
  resetVertexBreakerForTests(() => t);
  fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"error":{"code":503}}', { status: 503 }));
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  fetchSpy.mockRestore();
  resetVertexBreakerForTests();
});

const body = { method: 'POST', body: '{}' };

describe('Vertex breaker', () => {
  it('off: every call goes to Vertex, as on main', async () => {
    for (let i = 0; i < 20; i++) expect((await googleModelFetch('gemini-3.5-flash', 'generateContent', body)).status).toBe(503);
    expect(fetchSpy).toHaveBeenCalledTimes(20);
  });

  it('on: after 5 outage answers it stops calling Vertex and answers 503 at once', async () => {
    process.env.VERTEX_BREAKER = '1';
    for (let i = 0; i < 100; i++) {
      const res = await googleModelFetch('gemini-3.5-flash', 'generateContent', body);
      expect(res.status).toBe(503);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    const res = await googleModelFetch('gemini-3.5-flash', 'generateContent', body);
    const json = (await res.json()) as { error: { status: string; message: string } };
    expect(json.error.status).toBe('UNAVAILABLE');
    expect(json.error.message).toMatch(/vertex_breaker_open/);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('lets one probe through after the open window; success closes it', async () => {
    process.env.VERTEX_BREAKER = '1';
    for (let i = 0; i < 5; i++) await googleModelFetch('gemini-3.5-flash', 'generateContent', body);
    t += 61_000;
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    expect((await googleModelFetch('gemini-3.5-flash', 'generateContent', body)).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await googleModelFetch('gemini-3.5-flash', 'generateContent', body)).status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(9);
  });

  it('a failed probe re-opens it', async () => {
    process.env.VERTEX_BREAKER = '1';
    for (let i = 0; i < 5; i++) await googleModelFetch('gemini-3.5-flash', 'generateContent', body);
    t += 61_000;
    await googleModelFetch('gemini-3.5-flash', 'generateContent', body);
    await googleModelFetch('gemini-3.5-flash', 'generateContent', body);
    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });

  it('is per model: an outage on one model does not block another', async () => {
    process.env.VERTEX_BREAKER = '1';
    for (let i = 0; i < 5; i++) await googleModelFetch('gemini-3.5-flash', 'generateContent', body);
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
    expect((await googleModelFetch('gemini-3.1-flash-image', 'generateContent', body)).status).toBe(200);
  });

  it('never trips on 4xx or 429, and counts network errors', () => {
    expect(isOutage(400)).toBe(false);
    expect(isOutage(429)).toBe(false);
    expect(isOutage(503)).toBe(true);
    expect(isOutage(null)).toBe(true);
    for (let i = 0; i < 50; i++) breakerRecord('m', 429, { VERTEX_BREAKER_FAILS: '5' });
    expect(breakerPermit('m').ok).toBe(true);
  });

  it('a caller abort is not an outage', async () => {
    process.env.VERTEX_BREAKER = '1';
    const ac = new AbortController();
    ac.abort();
    fetchSpy.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    for (let i = 0; i < 10; i++) await expect(googleModelFetch('gemini-3.5-flash', 'generateContent', { ...body, signal: ac.signal })).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(10);
  });
});

describe('query retry jitter (thundering herd)', () => {
  it('spreads each step over its second half and caps at 30 s', () => {
    expect(jitteredRetryDelay(0, () => 0)).toBe(500);
    expect(jitteredRetryDelay(0, () => 1)).toBe(1000);
    expect(jitteredRetryDelay(2, () => 0.5)).toBe(3000);
    expect(jitteredRetryDelay(10, () => 1)).toBe(30_000);
  });
});
