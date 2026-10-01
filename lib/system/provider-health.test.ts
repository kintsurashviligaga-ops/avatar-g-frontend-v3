/** @jest-environment node */
/**
 * runProviderHealthAudit({ live: true }) against a scripted global fetch — no network. Only the Gemini key is set, so
 * only the Gemini probe runs: it carries the key ONLY in the x-goog-api-key header (never `?key=`) with redirect:
 * manual, and a thrown message can never carry the key into `detail` (served by the unauthenticated /api/app/health).
 */
jest.mock('server-only', () => ({}));
jest.mock('../chat/ltxKey', () => ({ resolveLtxApiKey: () => null }));
jest.mock('../chat/mediaKeys', () => ({ resolveUdioApiKey: () => null }));

import { runProviderHealthAudit } from './provider-health';

type Init = RequestInit & { headers: Record<string, string> };

const KEY = 'AQ.test-health-key-0123456789abcdef';
const ENV_VARS = ['OPENAI_API_KEY', 'WORLDLABS_API_KEY', 'HEYGEN_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'] as const;
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

const gemini = async () => (await runProviderHealthAudit({ live: true })).providers.find((p) => p.provider === 'gemini');

test('the Gemini probe: no key in the URL, the key in the header, redirect: manual', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{"models":[]}', { status: 200 }));

  expect(await gemini()).toMatchObject({ status: 'healthy', detail: 'Models endpoint reachable' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, Init];
  expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models');
  expect(url).not.toMatch(/[?&]key=/);
  expect(url).not.toContain(KEY);
  expect(init.headers['x-goog-api-key']).toBe(KEY);
  expect(init.redirect).toBe('manual');
  expect(init.cache).toBe('no-store');
});

test('unchanged: a 403 still reads as an auth failure', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }));

  expect(await gemini()).toMatchObject({ status: 'unhealthy', detail: 'Auth failed (403)' });
});

test('a thrown message that echoes the key never reaches `detail`', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError(`Headers.append: "${KEY}" is an invalid header value.`));

  const entry = await gemini();
  expect(entry?.status).toBe('unhealthy');
  expect(entry?.detail).not.toContain(KEY);
  expect(entry?.detail).toContain('[redacted]');
});
