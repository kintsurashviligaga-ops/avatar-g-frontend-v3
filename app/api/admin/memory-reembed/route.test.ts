/** @jest-environment node */
/** POST /api/admin/memory-reembed — admin only, dry run by default, writes the current tag. Mocked DB and embed. */
let mockAdmin = true;
const mockUpdates: Array<{ table: string; patch: Record<string, unknown>; id: unknown }> = [];
const mockOrFilters: string[] = [];
let mockRows: Array<Record<string, unknown>> = [];
let mockSelectError: { message: string } | null = null;

jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/admin/guard', () => ({ assertAdminAccess: () => (mockAdmin ? { ok: true } : { ok: false, reason: 'x' }) }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../lib/memory/embed', () => ({
  EMBEDDING_MODEL_TAG: 'gemini-embedding-001@1536',
  embed: jest.fn(async () => Array.from({ length: 1536 }, () => 0.5)),
}));
jest.mock('../../../../lib/supabase/server', () => {
  const builder = (table: string) => {
    const state: { head?: boolean; gt?: string } = {};
    const b: Record<string, unknown> = {
      select: (_cols: string, opts?: { head?: boolean }) => {
        state.head = !!opts?.head;
        return b;
      },
      or: (f: string) => {
        mockOrFilters.push(f);
        return b;
      },
      order: () => b,
      limit: () => b,
      gt: (_c: string, v: string) => {
        state.gt = v;
        return b;
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async (_c: string, id: unknown) => {
          mockUpdates.push({ table, patch, id });
          return { error: null };
        },
      }),
      then: (resolve: (v: unknown) => void) => {
        if (mockSelectError) return resolve({ data: null, count: null, error: mockSelectError });
        const rows = mockRows.filter((r) => !state.gt || String(r.id) > state.gt);
        resolve(state.head ? { count: rows.length, error: null } : { data: rows, error: null });
      },
    };
    return b;
  };
  return {
    authedClientFromRequest: jest.fn(async () => ({ user: { id: 'u1' } })),
    createServiceRoleClient: () => ({ from: builder }),
  };
});

import { NextRequest } from 'next/server';
import { POST } from './route';
import { embed } from '../../../../lib/memory/embed';

const req = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/admin/memory-reembed', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  mockAdmin = true;
  mockUpdates.length = 0;
  mockOrFilters.length = 0;
  mockSelectError = null;
  mockRows = [
    { id: 'a1', fact: 'likes tea' },
    { id: 'a2', fact: 'lives in Tbilisi' },
  ];
  (embed as jest.Mock).mockClear();
});

it('404 for a non-admin, and nothing is read', async () => {
  mockAdmin = false;
  const res = await POST(req({ table: 'memories' }));
  expect(res.status).toBe(404);
  expect(mockOrFilters).toEqual([]);
});

it('400 for any table but memories (rag_documents is not in Production)', async () => {
  expect((await POST(req({ table: 'users' }))).status).toBe(400);
  expect((await POST(req({ table: 'rag_documents' }))).status).toBe(400);
});

it('a dry run by default: reports what is pending, embeds and writes nothing', async () => {
  const res = await POST(req({}));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ model: 'gemini-embedding-001@1536', dryRun: true, pendingBefore: 2, scanned: 2, updated: 0 });
  expect(embed).not.toHaveBeenCalled();
  expect(mockUpdates).toEqual([]);
  expect(mockOrFilters.every((f) => f.includes('embedding_model.neq."gemini-embedding-001@1536"'))).toBe(true);
});

it('dryRun:false writes each row with a vector and the current tag', async () => {
  const res = await POST(req({ table: 'memories', dryRun: false }));
  const body = await res.json();
  expect(body).toMatchObject({ dryRun: false, updated: 2, failed: 0, nextCursor: null });
  expect(mockUpdates.map((u) => [u.table, u.id, u.patch.embedding_model, (u.patch.embedding as number[]).length])).toEqual([
    ['memories', 'a1', 'gemini-embedding-001@1536', 1536],
    ['memories', 'a2', 'gemini-embedding-001@1536', 1536],
  ]);
});

it('409 with a plain instruction when the migration is not applied yet', async () => {
  mockSelectError = { message: 'column memories.embedding_model does not exist' };
  const res = await POST(req({ table: 'memories' }));
  expect(res.status).toBe(409);
  expect((await res.json()).error).toContain('20261113a_embedding_model.sql');
});
