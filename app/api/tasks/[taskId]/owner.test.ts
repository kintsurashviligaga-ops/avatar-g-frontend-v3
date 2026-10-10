/** @jest-environment node */
/**
 * The older Agent G pipeline's task routes (agent_g_tasks) read through the service role, which bypasses RLS: before
 * 2026-10-09 anyone holding a task's id, signed in or not, could read its plan and results or cancel it. Now a session
 * is required and the caller's user id is on every read and write, so anyone else's task is the same 404 as none.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
jest.mock('../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: jest.fn(async () => mockUser) }));

type Filter = [string, unknown];
const mockOps: Array<{ table: string; op: string; filters: Filter[]; patch?: unknown }> = [];
const TASK = { id: '11111111-2222-3333-4444-555555555555', user_id: 'owner', status: 'processing', goal: 'g', plan: null, results: { secret: 1 }, created_at: null, updated_at: null };
jest.mock('../../../../lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const filters: Filter[] = [];
      let op = 'select';
      let patch: unknown;
      const rows = () => {
        if (table !== 'agent_g_tasks') return [];
        return [TASK].filter((r) => filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v));
      };
      const q = {
        select: () => q,
        update: (p: unknown) => { op = 'update'; patch = p; return q; },
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        in: () => q,
        order: () => q,
        maybeSingle: async () => { mockOps.push({ table, op, filters: [...filters] }); return { data: rows()[0] ?? null, error: null }; },
        then: (res: (v: unknown) => unknown) => { mockOps.push({ table, op, filters: [...filters], patch }); return Promise.resolve({ data: rows(), error: null }).then(res); },
      };
      return q;
    },
  }),
}));

import { NextRequest } from 'next/server';
import { GET } from './status/route';
import { POST } from './cancel/route';

const ID = TASK.id;
const ctx = { params: { taskId: ID } };
const req = (method = 'GET') => new NextRequest(`https://myavatar.ge/api/tasks/${ID}/status`, { method });

beforeEach(() => {
  mockOps.length = 0;
});

test('signed out: 401 for status and cancel, before any row is read', async () => {
  mockUser = null;
  expect((await GET(req(), ctx)).status).toBe(401);
  expect((await POST(req('POST'), ctx)).status).toBe(401);
  expect(mockOps).toEqual([]);
});

test("someone else's task: the same 404 as none, read with the caller's id, and nothing is written", async () => {
  mockUser = { id: 'stranger' };
  const status = await GET(req(), ctx);
  expect(status.status).toBe(404);
  expect(JSON.stringify(await status.json())).not.toContain('secret');
  expect((await POST(req('POST'), ctx)).status).toBe(404);
  expect(mockOps.every((o) => o.op === 'select')).toBe(true);
  expect(mockOps.filter((o) => o.table === 'agent_g_tasks').every((o) => o.filters.some(([k, v]) => k === 'user_id' && v === 'stranger'))).toBe(true);
});

test('the owner reads and cancels; the update carries the owner id too', async () => {
  mockUser = { id: 'owner' };
  const status = await GET(req(), ctx);
  expect(status.status).toBe(200);
  expect(await status.json()).toMatchObject({ taskId: ID, status: 'processing' });
  const cancel = await POST(req('POST'), ctx);
  expect(cancel.status).toBe(200);
  const update = mockOps.find((o) => o.table === 'agent_g_tasks' && o.op === 'update');
  expect(update?.filters).toEqual([['id', ID], ['user_id', 'owner']]);
});
