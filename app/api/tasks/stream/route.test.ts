/** @jest-environment node */
/**
 * GET /api/tasks/stream: the caller's task as Server-Sent Events, relayed from /api/tasks with the caller's own session.
 */
import { NextRequest } from 'next/server';

jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { TASKS: { maxRequests: 120, windowMs: 60_000 } },
}));

import { GET } from './route';

const ID = '11111111-2222-4333-8444-555555555555';
const TASK = {
  id: ID, kind: 'agent-montage', service: 'film', status: 'completed', stage: 'completed', pct: 100, attempt: 1,
  result: null, error: null, cancellable: false, label: null, position: null, createdAt: null, updatedAt: null,
};
const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; mockUser = null; });

const req = (q: string, headers: Record<string, string> = {}) => new NextRequest(`https://myavatar.ge/api/tasks/stream${q}`, { headers });

test('a session is required, and an id the route can read', async () => {
  expect((await GET(req(`?id=${ID}`))).status).toBe(401);
  mockUser = { id: 'u1' };
  expect((await GET(req('?id=../../etc'))).status).toBe(404);
});

test('it relays /api/tasks with the caller’s own session and streams agent_progress, then end', async () => {
  mockUser = { id: 'u1' };
  const calls: Array<[string, RequestInit | undefined]> = [];
  global.fetch = jest.fn(async (u: string | URL | Request, init?: RequestInit) => {
    calls.push([String(u), init]);
    return new Response(JSON.stringify({ ok: true, task: TASK }), { status: 200 });
  }) as typeof fetch;
  const res = await GET(req(`?id=${ID}&after=4&lang=en`, { cookie: 'sb=abc' }));
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const text = await res.text();
  expect(calls[0]![0]).toBe(`https://myavatar.ge/api/tasks?id=${ID}&after=4`);
  expect((calls[0]![1]!.headers as Record<string, string>).cookie).toBe('sb=abc');
  expect(text).toContain('event: agent_progress');
  const data = JSON.parse(text.split('\n').find((l) => l.startsWith('data: {"type"'))!.slice(6));
  expect(data).toMatchObject({ type: 'agent_progress', task_id: ID, current_step: data.total_steps, status: 'completed' });
  expect(data.step_details.title).toBe('Saving');
  expect(text.trimEnd().endsWith('data: {"status":"completed"}')).toBe(true);
});

test('a task that is not the caller’s is gone', async () => {
  mockUser = { id: 'u1' };
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ ok: false, error: 'not_found', message: 'No such task.' }), { status: 404 })) as typeof fetch;
  const text = await (await GET(req(`?id=${ID}`))).text();
  expect(text).toBe('event: gone\ndata: {"error":"not_found"}\n\n');
});
