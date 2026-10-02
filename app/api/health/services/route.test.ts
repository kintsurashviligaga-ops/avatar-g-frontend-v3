/** @jest-environment node */
/**
 * GET /api/health/services against a scripted global fetch — no network, no provider calls. The Gemini probe carries
 * the key ONLY in the x-goog-api-key header (never `?key=`: a URL lands in logs, traces and error reports) with
 * redirect: manual, and a probe's thrown message can never carry its own credential into the response.
 */
jest.mock('server-only', () => ({}));
// The admin-session leg of the gate: nobody is signed in here — only the x-admin-key header can open it.
jest.mock('../../../../lib/auth/adminGuard', () => ({ isAdmin: jest.fn(async () => false) }));

import { NextRequest } from 'next/server';
import { GET } from './route';

type Init = RequestInit & { headers: Record<string, string> };
type Result = { service: string; status: string; message: string };

const ADMIN = 'test-admin-key';
const KEY = 'AQ.test-services-key-0123456789abcdef';
const ENV_VARS = ['ADMIN_KEY', 'GEMINI_API_KEY'] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = global.fetch;
const fetchMock = jest.fn();
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

beforeEach(() => {
  for (const k of ENV_VARS) saved[k] = process.env[k];
  process.env.ADMIN_KEY = ADMIN;
  process.env.GEMINI_API_KEY = KEY;
  fetchMock.mockReset();
  // Every other configured probe gets a harmless 200; only the Gemini call is under test.
  fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
  for (const k of ENV_VARS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

async function run(): Promise<Result[]> {
  const res = await GET(new NextRequest('http://localhost/api/health/services', { headers: { 'x-admin-key': ADMIN } }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: Result[] }).results;
}

test('the admin key is accepted ONLY as a header — `?key=` (which lands in access logs) is refused', async () => {
  const viaQuery = await GET(new NextRequest(`http://localhost/api/health/services?key=${ADMIN}`));
  expect(viaQuery.status).toBe(403);
  const wrong = await GET(new NextRequest('http://localhost/api/health/services', { headers: { 'x-admin-key': 'nope' } }));
  expect(wrong.status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('an unset ADMIN_KEY matches nothing — not even an empty header', async () => {
  delete process.env.ADMIN_KEY;
  const res = await GET(new NextRequest('http://localhost/api/health/services', { headers: { 'x-admin-key': '' } }));
  expect(res.status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('the Gemini probe: no key in the URL, the key in the header, redirect: manual', async () => {
  const results = await run();

  const geminiCalls = (fetchMock.mock.calls as [string, Init][]).filter(([u]) => u.startsWith('https://generativelanguage.googleapis.com/'));
  expect(geminiCalls).toHaveLength(1);
  const [url, init] = geminiCalls[0];
  expect(url).toBe(GEMINI_URL);
  expect(url).not.toMatch(/[?&]key=/);
  expect(url).not.toContain(KEY);
  expect(init.headers['x-goog-api-key']).toBe(KEY);
  expect(init.redirect).toBe('manual');
  expect(init.signal).toBeDefined();
  expect(results.find((r) => r.service === 'Google Gemini')).toMatchObject({ status: 'CONNECTED', message: '200 OK' });
});

test('no outbound URL carries any `key=` query parameter', async () => {
  await run();
  for (const [u] of fetchMock.mock.calls as [string][]) expect(u).not.toMatch(/[?&]key=/);
});

test('a probe that throws with its key in the message reports it redacted', async () => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === GEMINI_URL) throw new TypeError(`Headers.append: "${KEY}" is an invalid header value.`);
    return new Response('{}', { status: 200 });
  });

  const gemini = (await run()).find((r) => r.service === 'Google Gemini');
  expect(gemini?.status).toBe('ERROR');
  expect(gemini?.message).not.toContain(KEY);
  expect(gemini?.message).toContain('[redacted]');
});
