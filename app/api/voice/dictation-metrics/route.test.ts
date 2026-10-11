/** @jest-environment node */
/** POST /api/voice/dictation-metrics: timings and enums only reach the log; anything else is refused. */
jest.mock('server-only', () => ({}));
const getAuthenticatedUser = jest.fn(async (): Promise<{ id: string } | null> => ({ id: 'user-1' }));
jest.mock('../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  RATE_LIMITS: { READ: {} },
  checkRateLimit: jest.fn(async () => null),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { metricsLog, platformOf } from '../../../../lib/voice/dictationMetricsLog';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SUMMARY = {
  v: 1, engine: 'recorder', lang: 'ka-GE', outcome: 'text', capture: 'wav', warm: true,
  tapToListeningMs: 212.4, listeningToFirstTextMs: 1630, stopToFinalMs: 910, listenMs: 4200,
  passes: 4, passMs: [880, 910, 1020, 905], serverSttMs: [640, 700, 760, 690], finalPassMs: 905,
  aborted: 1, deferred: 0, failed: 0, restarts: 0,
};

const post = (body: string, headers: Record<string, string> = {}) => new NextRequest('https://myavatar.ge/api/voice/dictation-metrics', {
  method: 'POST', body, headers: { host: 'myavatar.ge', 'user-agent': IPHONE, 'content-type': 'text/plain', ...headers },
});

let logged: string[] = [];
const realWrite = metricsLog.write;
beforeEach(() => {
  logged = [];
  metricsLog.write = (line) => { logged.push(line); };
});
afterEach(() => { metricsLog.write = realWrite; });

test('a summary is logged once, with the device family and nothing that is not on the allow-list', async () => {
  const res = await POST(post(JSON.stringify({ ...SUMMARY, transcript: 'გამარჯობა', url: 'https://x.test/a' })));
  expect(res.status).toBe(204);
  expect(logged).toHaveLength(1);
  const line = JSON.parse(logged[0]!);
  expect(line).toMatchObject({ engine: 'recorder', lang: 'ka-GE', tapToListeningMs: 212, stopToFinalMs: 910, platform: 'ios' });
  expect(logged[0]).not.toMatch(/გამარჯობა|x\.test|transcript|user-1/);
});

test('no session: 401, nothing logged (dictation itself needs one)', async () => {
  getAuthenticatedUser.mockResolvedValueOnce(null);
  expect((await POST(post(JSON.stringify(SUMMARY)))).status).toBe(401);
  expect(logged).toEqual([]);
});

test('not JSON, not a summary, too big, or from another site: refused and not logged', async () => {
  expect((await POST(post('nope'))).status).toBe(400);
  expect((await POST(post(JSON.stringify({ ...SUMMARY, v: 2 })))).status).toBe(400);
  expect((await POST(post(JSON.stringify({ ...SUMMARY, engine: 'whisper' })))).status).toBe(400);
  expect((await POST(post('x'.repeat(5000)))).status).toBe(413);
  expect((await POST(post(JSON.stringify(SUMMARY), { origin: 'https://evil.example' })))).toHaveProperty('status', 403);
  expect(logged).toEqual([]);
});

test('platformOf: one enum per device family', () => {
  expect(platformOf(IPHONE)).toBe('ios');
  expect(platformOf('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
  expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)')).toBe('mac');
  expect(platformOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
  expect(platformOf(null)).toBe('other');
});
