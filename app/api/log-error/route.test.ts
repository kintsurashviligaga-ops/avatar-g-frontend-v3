/** @jest-environment node */
/**
 * POST /api/log-error — the client report sink: a REAL rate limit (its own bucket in the WRITE budget), the report
 * printed as `[client-report]` in production BEFORE the insert (so a failing table never loses it), an insert shaped
 * like the repo migration (route, message, code, details, severity, meta), an allow-listed ≤ 2 KB `context`, no query
 * strings kept, and 200 whatever the database does. Everything external is mocked.
 */
const mockCheckRateLimit = jest.fn(async (..._a: unknown[]): Promise<unknown> => null);
jest.mock('../../../lib/api/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
  RATE_LIMITS: { WRITE: { maxRequests: 20, windowMs: 60_000, keyPrefix: 'rl:write' } },
}));
const mockInsert = jest.fn(async (_row: unknown): Promise<{ error: unknown }> => ({ error: null }));
const mockFrom = jest.fn((_t: string) => ({ insert: (row: unknown) => mockInsert(row) }));
jest.mock('../../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => mockFrom(t) }) }));
jest.mock('../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));

import { NextRequest, NextResponse } from 'next/server';

import { POST } from './route';

const env = process.env as Record<string, string | undefined>;
const ORIGINAL_NODE_ENV = env.NODE_ENV;

const post = (body: unknown, raw?: string, contentType = 'application/json') =>
  new NextRequest('https://myavatar.ge/api/log-error', {
    method: 'POST',
    headers: { 'content-type': contentType, 'user-agent': 'UA-Header' },
    body: raw ?? JSON.stringify(body),
  });

const liveReport = (context: Record<string, unknown> = {}) => ({
  message: 'live mic_busy NotReadableError',
  url: 'https://myavatar.ge/ka/dashboard?voice=1&secret=abc#x',
  userAgent: 'Mozilla/5.0 Test',
  timestamp: '2026-09-30T10:00:00.000Z',
  context: { kind: 'live_failure', code: 'mic_busy', name: 'NotReadableError', message: 'Could not start audio source', attempts: [{ step: 'full', name: 'NotReadableError', ms: 12 }], secure: true, ...context },
});

let warn: jest.SpyInstance;
let info: jest.SpyInstance;
let error: jest.SpyInstance;

beforeEach(() => {
  mockCheckRateLimit.mockReset();
  mockCheckRateLimit.mockResolvedValue(null);
  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ error: null });
  mockFrom.mockClear();
  env.NODE_ENV = 'production';
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  env.NODE_ENV = ORIGINAL_NODE_ENV;
  warn.mockRestore();
  info.mockRestore();
  error.mockRestore();
});

test('a real rate limit: its own bucket inside the WRITE budget; a 429 is returned as-is and nothing is logged', async () => {
  const limited = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  mockCheckRateLimit.mockResolvedValueOnce(limited);
  const res = await POST(post(liveReport()));
  expect(res.status).toBe(429);
  expect(mockCheckRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({ keyPrefix: 'rl:write' }), 'log-error');
  expect(mockInsert).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
});

test('production: the report is printed as [client-report] BEFORE the insert, and survives a failing insert', async () => {
  const order: string[] = [];
  warn.mockImplementation(() => { order.push('warn'); });
  mockInsert.mockImplementation(async () => { order.push('insert'); return { error: { message: 'column "route" does not exist' } }; });
  const res = await POST(post(liveReport()));
  expect(res.status).toBe(200);
  expect((await res.json()).data).toEqual({ logged: false, reason: 'database_unavailable' });
  expect(order).toEqual(['warn', 'insert']);
  expect(warn.mock.calls[0]![0]).toBe('[client-report]');
  const line = JSON.parse(warn.mock.calls[0]![1] as string);
  expect(line).toMatchObject({ kind: 'live_failure', route: '/ka/dashboard', context: { code: 'mic_busy', name: 'NotReadableError' } });
});

test('the insert matches the migration columns (route, message, code, details, severity, meta) — never the old ones', async () => {
  const res = await POST(post(liveReport()));
  expect((await res.json()).data).toEqual({ logged: true });
  expect(mockFrom).toHaveBeenCalledWith('error_logs');
  const row = mockInsert.mock.calls[0]![0] as Record<string, unknown>;
  expect(Object.keys(row).sort()).toEqual(['code', 'details', 'message', 'meta', 'route', 'severity']);
  expect(row).toMatchObject({
    route: '/ka/dashboard', // no query string, no fragment
    message: 'live mic_busy NotReadableError',
    code: 'NotReadableError',
    severity: 'warn',
    details: { context: expect.objectContaining({ code: 'mic_busy', attempts: [{ step: 'full', name: 'NotReadableError', ms: 12 }] }) },
    meta: expect.objectContaining({ kind: 'live_failure', ua: 'Mozilla/5.0 Test', clientTimestamp: '2026-09-30T10:00:00.000Z' }),
  });
  expect(JSON.stringify(row)).not.toContain('secret=abc');
});

test('an error-boundary report (no context) still logs, as severity error with its digest', async () => {
  await POST(post({ message: 'boom', digest: 'd1', url: 'https://myavatar.ge/en/pricing', stack: 'Error: boom\n at x' }));
  const row = mockInsert.mock.calls[0]![0] as Record<string, unknown>;
  expect(row).toMatchObject({ route: '/en/pricing', message: 'boom', code: 'd1', severity: 'error', details: { digest: 'd1', stack: 'Error: boom\n at x' } });
  expect((row.meta as Record<string, unknown>).ua).toBe('UA-Header'); // falls back to the request header
});

test('the context is allow-listed: unknown keys never reach the log or the table', async () => {
  await POST(post(liveReport({ token: 'ya29.secret', transcript: 'private words' })));
  const all = JSON.stringify([warn.mock.calls, mockInsert.mock.calls]);
  expect(all).not.toContain('ya29.secret');
  expect(all).not.toContain('private words');
});

test('an oversized context is rejected (413); a context without a code is invalid (400); a huge body is 413', async () => {
  const big = await POST(post(liveReport({ message: 'x'.repeat(3000) })));
  expect(big.status).toBe(413);
  const noCode = await POST(post({ message: 'm', url: 'https://myavatar.ge/', context: { name: 'X' } }));
  expect(noCode.status).toBe(400);
  const huge = await POST(post(null, JSON.stringify({ message: 'm', url: 'https://myavatar.ge/', stack: 'x'.repeat(20_000) })));
  expect(huge.status).toBe(413);
  expect(mockInsert).not.toHaveBeenCalled();
});

test('missing message/url → 400; invalid JSON → 400', async () => {
  expect((await POST(post({ url: 'https://myavatar.ge/' }))).status).toBe(400);
  expect((await POST(post({ message: 'x' }))).status).toBe(400);
  expect((await POST(post(null, '{not json'))).status).toBe(400);
});

test('a sendBeacon body (text/plain) is parsed like JSON', async () => {
  const res = await POST(post(null, JSON.stringify(liveReport()), 'text/plain;charset=UTF-8'));
  expect(res.status).toBe(200);
  expect(mockInsert).toHaveBeenCalledTimes(1);
});

test('a throwing database still answers 200 (reporting never breaks the page)', async () => {
  mockInsert.mockImplementationOnce(async () => { throw new Error('network'); });
  const res = await POST(post(liveReport()));
  expect(res.status).toBe(200);
  expect((await res.json()).data).toEqual({ logged: false, reason: 'server_error' });
  expect(warn).toHaveBeenCalledWith('[client-report]', expect.any(String));
});

test('outside production nothing is inserted', async () => {
  env.NODE_ENV = 'development';
  const res = await POST(post(liveReport()));
  expect((await res.json()).data).toEqual({ logged: false, reason: 'development' });
  expect(mockInsert).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled(); // (the dev echo is console.info, which next.config's removeConsole strips)
});
