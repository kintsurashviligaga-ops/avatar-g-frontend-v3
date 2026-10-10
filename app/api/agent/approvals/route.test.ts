/** @jest-environment node */
/**
 * /api/agent/approvals: a spoken yes to a studio generation is judged again and recorded (one audit row) before a Live
 * call starts the render; words that are not a clear yes are refused and the refusal audited; the user is the session's.
 */
jest.mock('server-only', () => ({}));

const mockAudit = jest.fn(async () => {});
let mockUser: { id: string } | null = { id: 'user-1' };
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { READ: { maxRequests: 100, windowMs: 60_000 } },
}));
jest.mock('../../../../lib/agent/media/montageLive', () => ({ audit: (...a: unknown[]) => (mockAudit as jest.Mock)(...a) }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const req = (body: unknown) => new NextRequest('https://myavatar.ge/api/agent/approvals', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => { jest.clearAllMocks(); mockUser = { id: 'user-1' }; });

test('a clear spoken yes is recorded under the session user, with the tool, the price and the words', async () => {
  const res = await POST(req({ channel: 'voice-transcript', said: 'კი, დაიწყე', tool: 'music', credits: 4, userId: 'someone-else' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(mockAudit).toHaveBeenCalledWith({
    userId: 'user-1', op: 'studio_run', phase: 'approve', outcome: 'ok', toolId: 'music.generate', approval: 'voice-transcript',
    credits: 4, detail: 'music; approved by voice "კი, დაიწყე"',
  });
});

test('words that are not a clear yes are refused, and the refusal is audited', async () => {
  const res = await POST(req({ channel: 'voice-transcript', said: 'how much?', tool: 'video' }));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ ok: false, error: 'approval_unclear' });
  expect(mockAudit).toHaveBeenCalledWith({ userId: 'user-1', op: 'studio_run', phase: 'approve', outcome: 'refused', toolId: 'video.generate', detail: 'approval_unclear' });
});

test('only a voice approval for a studio start_generation runs is recorded here', async () => {
  expect((await POST(req({ channel: 'tap', tool: 'image' }))).status).toBe(400);
  expect((await POST(req({ channel: 'voice-transcript', said: 'yes', tool: 'presentation' }))).status).toBe(400);
  expect((await POST(req({ channel: 'voice-transcript', said: 'yes', tool: 'image', credits: -1 }))).status).toBe(400);
  expect((await POST(req({ channel: 'voice-transcript', said: 'yes', tool: 'image', credits: 1.5 }))).status).toBe(400);
  expect(mockAudit).not.toHaveBeenCalled();
});

test('signed out: 401, nothing recorded', async () => {
  mockUser = null;
  expect((await POST(req({ channel: 'voice-transcript', said: 'yes', tool: 'image' }))).status).toBe(401);
  expect(mockAudit).not.toHaveBeenCalled();
});
