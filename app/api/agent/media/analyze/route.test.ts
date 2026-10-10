/** @jest-environment node */
/**
 * /api/agent/media/analyze over HTTP: closed everywhere (404, before the session is read) unless AGENT_G_FILE_ANALYSIS
 * opens it, a Preview included; `admin` lets only admins in; signed-out callers get 401; the user id always comes from
 * the session, never the body; a refusal keeps its own status. The executor is tested in
 * lib/agent/media/analyzeExec.test.ts.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string; email?: string } | null = null;
jest.mock('../../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
}));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { READ: { maxRequests: 100, windowMs: 60_000 }, EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } },
}));
jest.mock('../../../../../lib/admin/guard', () => ({ isAdminUser: (u: { email?: string } | null) => u?.email === 'admin@example.com' }));
jest.mock('../../../../../lib/agent/media/analyzeLive', () => ({ liveAnalyzeDeps: () => ({ live: true }) }));
jest.mock('../../../../../lib/agent/media/analyzeExec', () => ({
  analyzeMedia: jest.fn(async () => ({ ok: true, analysis: { summary: 's' }, source: { kind: 'file', type: 'video', durationSec: 3 }, model: 'm', usage: {} })),
}));

import { NextRequest } from 'next/server';
import { authedClientFromRequest } from '../../../../../lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '../../../../../lib/api/rate-limit';
import { analyzeMedia } from '../../../../../lib/agent/media/analyzeExec';
import { GET, POST } from './route';

const ENV = { ...process.env };
const req = (body?: unknown) =>
  new NextRequest('https://myavatar.ge/api/agent/media/analyze', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
const FILE_BODY = { source: { kind: 'file', ref: 'omni-uploads/user-1/clip.mp4' }, focus: 'moments', lang: 'ka', question: 'q?', userId: 'someone-else' };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV };
  delete process.env.AGENT_G_FILE_ANALYSIS;
  delete process.env.VERCEL_ENV;
  mockUser = { id: 'user-1', email: 'admin@example.com' };
});
afterAll(() => { process.env = ENV; });

describe('closed unless the owner opens it', () => {
  test('unset: 404 before the session is read, on a Preview too; GET says not enabled', async () => {
    for (const vercelEnv of [undefined, 'preview', 'production']) {
      if (vercelEnv) process.env.VERCEL_ENV = vercelEnv;
      else delete process.env.VERCEL_ENV;
      expect((await POST(req(FILE_BODY))).status).toBe(404);
      expect(await (await GET(req())).json()).toEqual({ enabled: false });
    }
    expect(authedClientFromRequest).not.toHaveBeenCalled();
    expect(analyzeMedia).not.toHaveBeenCalled();
  });

  test('`off` closes it; a value it does not know is off', async () => {
    for (const v of ['off', '0', 'false', 'maybe']) {
      process.env.AGENT_G_FILE_ANALYSIS = v;
      expect((await POST(req(FILE_BODY))).status).toBe(404);
    }
    expect(analyzeMedia).not.toHaveBeenCalled();
  });

  test('`admin`: a signed-out caller 401, a non-admin 404, an admin in', async () => {
    process.env.AGENT_G_FILE_ANALYSIS = 'admin';
    mockUser = null;
    expect((await POST(req(FILE_BODY))).status).toBe(401);
    mockUser = { id: 'user-2', email: 'someone@example.com' };
    expect((await POST(req(FILE_BODY))).status).toBe(404);
    expect(await (await GET(req())).json()).toEqual({ enabled: false });
    expect(analyzeMedia).not.toHaveBeenCalled();
    mockUser = { id: 'user-1', email: 'admin@example.com' };
    expect((await POST(req(FILE_BODY))).status).toBe(200);
    expect(await (await GET(req())).json()).toEqual({ enabled: true });
  });

  test('`on` opens it to every signed-in user', async () => {
    process.env.AGENT_G_FILE_ANALYSIS = 'on';
    mockUser = { id: 'user-2', email: 'someone@example.com' };
    expect((await POST(req(FILE_BODY))).status).toBe(200);
  });
});

describe('open', () => {
  beforeEach(() => { process.env.AGENT_G_FILE_ANALYSIS = 'admin'; });

  test('the user is the session\'s, never the body\'s; the request is rate limited as an expensive call', async () => {
    const res = await POST(req(FILE_BODY));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(analyzeMedia).toHaveBeenCalledWith({ live: true }, {
      userId: 'user-1', source: { kind: 'file', ref: 'omni-uploads/user-1/clip.mp4' }, focus: 'moments', question: 'q?', lang: 'ka',
    });
    expect(checkRateLimit).toHaveBeenCalledWith(expect.anything(), RATE_LIMITS.EXPENSIVE, 'user-1');
  });

  test('a YouTube link is passed as a link source', async () => {
    await POST(req({ source: { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' } }));
    expect(analyzeMedia).toHaveBeenCalledWith({ live: true }, { userId: 'user-1', source: { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' } });
  });

  test('a rate-limited caller is answered by the limiter, nothing runs', async () => {
    (checkRateLimit as jest.Mock).mockResolvedValueOnce(new Response('{"error":"rate_limited"}', { status: 429 }));
    expect((await POST(req(FILE_BODY))).status).toBe(429);
    expect(analyzeMedia).not.toHaveBeenCalled();
  });

  test('no source, or a malformed one: 400, nothing runs', async () => {
    for (const body of [{}, { source: 'u/a.mp4' }, { source: { kind: 'file' } }, { source: { kind: 'web', url: 'https://x.test' } }, 'not json']) {
      const res = await POST(req(body));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, error: 'bad_input' });
    }
    expect(analyzeMedia).not.toHaveBeenCalled();
  });

  test('each refusal keeps its own status', async () => {
    const cases: Array<[string, number]> = [
      ['media_not_yours', 403], ['unsupported_type', 422], ['too_long', 422], ['not_youtube', 422], ['reference_refused', 422],
      ['not_configured', 503], ['budget', 503], ['rate_limited', 429], ['model_failed', 502], ['bad_answer', 502], ['bad_input', 400],
    ];
    for (const [error, status] of cases) {
      (analyzeMedia as jest.Mock).mockResolvedValueOnce({ ok: false, error, message: 'm' });
      const res = await POST(req(FILE_BODY));
      expect({ error, status: res.status }).toEqual({ error, status });
      expect(await res.json()).toEqual({ ok: false, error, message: 'm' });
    }
  });
});
