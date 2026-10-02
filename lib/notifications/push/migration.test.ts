/** @jest-environment node */
/**
 * Guards for supabase/migrations/20261003d_push_subscriptions.sql. The owner applies it later, by hand, so the code must not
 * drift from it silently: a column the route writes that the table lacks would 400 every opt-in in production, and a bound
 * tighter than the validator's would refuse real browsers. Reads the SQL as text with comments stripped first (a comment
 * quoting a pattern must neither satisfy nor trip a guard). lib/security/dbExposure.test.ts also runs over this file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_ENDPOINT_CHARS } from './subscription';
import { testBrowserKeys } from './testing/keys';

const raw = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261003d_push_subscriptions.sql'), 'utf8');
const sql = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').toLowerCase();

function columns(): string[] {
  const start = sql.indexOf('create table if not exists public.push_subscriptions (');
  expect(start).toBeGreaterThan(-1);
  const body = sql.slice(start, sql.indexOf('\n);', start));
  return [...body.matchAll(/^ {2}([a-z_0-9]+)\s+(?:uuid|text|integer|timestamptz)\b/gm)].map((m) => m[1]!);
}

test('the table has exactly the columns the route and the sender use', () => {
  expect(columns().sort()).toEqual(
    ['id', 'user_id', 'endpoint', 'p256dh', 'auth', 'user_agent', 'locale', 'created_at', 'last_success_at', 'failure_count'].sort(),
  );
  expect(sql).toMatch(/user_id\s+uuid not null references auth\.users\(id\) on delete cascade/);
  expect(sql).toMatch(/endpoint\s+text not null unique/);
});

test('the bounds fit what the validator lets through (real keys, the longest endpoint)', () => {
  const k = testBrowserKeys();
  const p = /p256dh\s+text not null check \(char_length\(p256dh\) between (\d+) and (\d+)\)/.exec(sql)!;
  const a = /auth\s+text not null check \(char_length\(auth\) between (\d+) and (\d+)\)/.exec(sql)!;
  const e = /check \(char_length\(endpoint\) between \d+ and (\d+) and endpoint like 'https:\/\/%'\)/.exec(sql)!;
  expect(k.p256dh.length).toBeGreaterThanOrEqual(Number(p[1]));
  expect(k.p256dh.length).toBeLessThanOrEqual(Number(p[2]));
  expect(k.auth.length).toBeGreaterThanOrEqual(Number(a[1]));
  expect(k.auth.length).toBeLessThanOrEqual(Number(a[2]));
  expect(Number(e[1])).toBeGreaterThanOrEqual(MAX_ENDPOINT_CHARS);
});

test('RLS on; the owner may only SELECT and DELETE; client inserts and updates are revoked', () => {
  expect(sql).toContain('alter table public.push_subscriptions enable row level security;');
  const policies = [...sql.matchAll(/create policy (\w+) on public\.push_subscriptions\s+for (\w+) to (\w+) using \(([^;]*)\);/g)];
  expect(policies.map((m) => [m[2], m[3], m[4]!.trim()])).toEqual([
    ['select', 'authenticated', 'auth.uid() = user_id'],
    ['delete', 'authenticated', 'auth.uid() = user_id'],
  ]);
  expect(sql).not.toMatch(/for\s+(insert|update|all)\b/);
  expect(sql).toContain('revoke all on public.push_subscriptions from anon;');
  expect(sql).toContain('revoke insert, update, truncate on public.push_subscriptions from authenticated;');
});
