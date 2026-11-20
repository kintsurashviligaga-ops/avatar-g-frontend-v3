/** @jest-environment node */
/**
 * Guards for supabase/migrations/20261113a_embedding_model.sql (applied by the owner, by hand). Read as text, comments
 * stripped, and compared with the tag lib/memory/embed writes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('server-only', () => ({}));
jest.mock('../ai/google/transport', () => ({ googleModelFetch: jest.fn(), googleTransportBlocker: () => null }));
jest.mock('../observability/report-error', () => ({ reportError: jest.fn() }));

import { EMBEDDING_MODEL_TAG } from './embed';

const raw = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261113a_embedding_model.sql'), 'utf8');
const sql = raw.replace(/--[^\n]*/g, '').toLowerCase();

test('the tag is the model and dimension embed() uses', () => {
  expect(EMBEDDING_MODEL_TAG).toBe('gemini-embedding-001@1536');
});

test.each(['memories', 'rag_documents'])('%s: column added with no default first, default set afterwards', (t) => {
  const normal0 = sql.replace(/ +/g, ' ');
  const add = normal0.indexOf(`alter table public.${t} add column`);
  const addLine = normal0.slice(add, normal0.indexOf(';', add));
  expect(addLine).toBe(`alter table public.${t} add column if not exists embedding_model text`);
  const normal = sql.replace(/ +/g, ' ');
  expect(normal.indexOf(`alter table public.${t} alter column embedding_model set default '${EMBEDDING_MODEL_TAG}'`)).toBeGreaterThan(
    normal.indexOf(`alter table public.${t} add column if not exists embedding_model text`),
  );
});

test.each(['match_memories', 'match_rag_documents'])('%s compares only rows of the current model, signature unchanged', (fn) => {
  const start = sql.indexOf(`create or replace function public.${fn}(`);
  expect(start).toBeGreaterThan(-1);
  const end = sql.slice(start).search(/\$(fn)?\$;/);
  const body = sql.slice(start, start + end);
  expect(body).toContain(`embedding_model = '${EMBEDDING_MODEL_TAG}'`);
  expect(body.replace(/\s+/g, ' ')).toContain('query_embedding vector(1536)');
  expect(body).not.toContain('security definer');
});

test('match_memories still limits recall to the caller (RLS-style auth.uid() filter)', () => {
  const start = sql.indexOf('create or replace function public.match_memories(');
  expect(sql.slice(start, sql.indexOf('$$;', start))).toContain('m.user_id = auth.uid()');
});

test('the rag_documents half only runs where the table exists (Production has no rag_documents)', () => {
  const guard = sql.indexOf("to_regclass('public.rag_documents') is null");
  expect(guard).toBeGreaterThan(-1);
  expect(sql.indexOf('alter table public.rag_documents')).toBeGreaterThan(guard);
  expect(sql.indexOf('create or replace function public.match_rag_documents(')).toBeGreaterThan(guard);
  // memories is altered unconditionally, before the guarded block
  expect(sql.indexOf('alter table public.memories')).toBeLessThan(guard);
});
