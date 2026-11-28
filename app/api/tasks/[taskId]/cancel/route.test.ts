/** @jest-environment node */
/**
 * Phase 8.25 — Cancel pressed the second a task finishes (CANCEL_RACE_GUARD). Mocked Supabase: the read sees
 * `processing`, the worker writes `completed` before the cancel's update lands. With the guard the update is a
 * compare-and-set and the finished result survives; without it (today) the result is overwritten.
 */
type Row = { id: string; user_id: string; status: string; results: unknown };

let row: Row;
let finishBeforeUpdate = false;
const updates: Array<{ table: string; filters: Array<[string, unknown]> }> = [];

function query(table: string) {
  const filters: Array<[string, unknown]> = [];
  let patch: Record<string, unknown> | null = null;
  const matches = () =>
    filters.every(([k, v]) => {
      if (table !== 'agent_g_tasks') return true;
      if (k === 'in:status') return (v as string[]).includes(row.status);
      return (row as unknown as Record<string, unknown>)[k] === v;
    });
  const run = () => {
    if (patch && table === 'agent_g_tasks') {
      if (finishBeforeUpdate) { row = { ...row, status: 'completed', results: { video: 'done.mp4' } }; finishBeforeUpdate = false; }
      updates.push({ table, filters: [...filters] });
      if (matches()) { row = { ...row, ...(patch as Partial<Row>) }; return { data: [{ id: row.id }], error: null }; }
      return { data: [], error: null };
    }
    if (patch) { updates.push({ table, filters: [...filters] }); return { data: [], error: null }; }
    return { data: matches() ? { ...row } : null, error: null };
  };
  const chain: Record<string, unknown> = {
    select: () => chain,
    update: (p: Record<string, unknown>) => { patch = p; return chain; },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return chain; },
    in: (k: string, v: unknown) => { filters.push([`in:${k}`, v]); return chain; },
    maybeSingle: async () => run(),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return chain;
}

jest.mock('../../../../../lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => query(t) }) }));
jest.mock('../../../../../lib/supabase/auth', () => ({ getAuthenticatedUser: async () => ({ id: 'u1' }) }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const ID = '11111111-2222-3333-4444-555555555555';
const call = () => POST(new NextRequest(`https://myavatar.ge/api/tasks/${ID}/cancel`, { method: 'POST' }), { params: { taskId: ID } });

beforeEach(() => {
  row = { id: ID, user_id: 'u1', status: 'processing', results: null };
  finishBeforeUpdate = false;
  updates.length = 0;
  delete process.env.CANCEL_RACE_GUARD;
});

test('guard on: a running task is cancelled', async () => {
  process.env.CANCEL_RACE_GUARD = '1';
  const res = await call();
  expect(res.status).toBe(200);
  expect(row.status).toBe('failed');
});

test('guard on: the task finished the same second → 409 already_finished, the result is kept', async () => {
  process.env.CANCEL_RACE_GUARD = '1';
  finishBeforeUpdate = true;
  const res = await call();
  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: 'already_finished', status: 'completed' });
  expect(row).toMatchObject({ status: 'completed', results: { video: 'done.mp4' } });
  // The subtasks were not touched either.
  expect(updates.some((u) => u.table === 'agent_g_subtasks')).toBe(false);
});

test('guard off (today): the same race overwrites the finished result — the bug the flag fixes', async () => {
  finishBeforeUpdate = true;
  const res = await call();
  expect(res.status).toBe(200);
  expect(row.status).toBe('failed');
  expect(row.results).toMatchObject({ cancelled: true });
});

test('an already-finished task is refused before any write, either way', async () => {
  row.status = 'completed';
  const res = await call();
  expect(res.status).toBe(409);
  expect(updates).toHaveLength(0);
});
