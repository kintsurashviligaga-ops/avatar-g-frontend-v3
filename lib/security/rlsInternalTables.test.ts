/** @jest-environment node */
/**
 * Migration 20261008a — RLS on the internal tables the anon key could read and write, and the end of the public
 * tracking-token list. Source-shape guards (the live proof is the migration's own self-verification block).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261008a_rls_internal_tables.sql'), 'utf8')
  .replace(/--[^\n]*/g, '')
  .toLowerCase();

const OWNER_TABLES = ['smm_projects', 'smm_posts', 'smm_assets', 'agent_g_events'];
const SERVICE_ONLY = ['runtime_logs', 'job_runtime_logs', 'worker_heartbeat', 'stripe_events', 'tracking_tokens'];

test('every table is listed for RLS + revoke, in the loop for its class', () => {
  const ownerLoop = SQL.slice(SQL.indexOf("foreach t in array array['smm_projects'"), SQL.indexOf('end loop;'));
  for (const t of OWNER_TABLES) expect(ownerLoop).toContain(`'${t}'`);
  expect(ownerLoop).toContain("alter table public.%i enable row level security");
  expect(ownerLoop).toContain('revoke all on public.%i from anon, authenticated');
  expect(ownerLoop).toContain('grant select on public.%i to authenticated');

  const svcStart = SQL.indexOf("foreach t in array array['runtime_logs'");
  const svcLoop = SQL.slice(svcStart, SQL.indexOf('end loop;', svcStart));
  for (const t of SERVICE_ONLY) expect(svcLoop).toContain(`'${t}'`);
  expect(svcLoop).toContain('alter table public.%i enable row level security');
  expect(svcLoop).toContain('revoke all on public.%i from anon, authenticated');
  expect(svcLoop).not.toContain('grant');
});

test('owner tables get an owner-only SELECT for authenticated, keyed on auth.uid()', () => {
  for (const [table, column] of [['smm_projects', 'owner_id'], ['agent_g_events', 'user_id']]) {
    expect(SQL).toMatch(new RegExp(
      `create policy ${table}_owner_select on public\\.${table}\\s+for select to authenticated\\s+using \\(${column} = \\(select auth\\.uid\\(\\)\\)::text\\)`,
    ));
  }
  expect(SQL).toMatch(/create policy smm_posts_owner_select on public\.smm_posts\s+for select to authenticated[\s\S]*?p\.owner_id = \(select auth\.uid\(\)\)::text/);
  expect(SQL).toMatch(/create policy smm_assets_owner_select on public\.smm_assets\s+for select to authenticated[\s\S]*?p\.owner_id = \(select auth\.uid\(\)\)::text/);
  // Never a write policy, never an open one.
  expect(SQL).not.toMatch(/for (insert|update|delete|all)/);
  expect(SQL).not.toMatch(/using\s*\(\s*true\s*\)/);
});

test('the public tracking-token SELECT policy is dropped (the reader already uses the service role)', () => {
  expect(SQL).toContain('drop policy if exists tracking_tokens_public_policy on public.tracking_tokens;');
  const route = readFileSync(join(ROOT, 'app/api/tracking/[id]/route.ts'), 'utf8');
  const byToken = route.slice(route.indexOf('async function getByTrackingToken'), route.indexOf('new ShippingService'));
  expect(byToken).toContain('SUPABASE_SERVICE_ROLE_KEY');
});

test('idempotent: every table is guarded by to_regclass and every policy is dropped before it is created', () => {
  const creates = [...SQL.matchAll(/create policy (\w+) on/g)].map((m) => m[1]);
  expect(creates.length).toBe(4);
  for (const p of creates) expect(SQL).toContain(`drop policy if exists ${p} on`);
  expect(SQL).toContain("to_regclass(format('public.%i', t)) is not null");
});

test('the admin payments view reads stripe_events through the service role, after the admin gate', () => {
  const src = readFileSync(join(ROOT, 'app/api/admin/payments/route.ts'), 'utf8');
  const gate = src.indexOf('await isAdmin()');
  const svc = src.indexOf('createServiceRoleClient()');
  const read = src.indexOf(".from('stripe_events')");
  expect(gate).toBeGreaterThan(0);
  expect(svc).toBeGreaterThan(gate);
  expect(read).toBeGreaterThan(svc);
  expect(src.slice(svc, read)).toMatch(/await db\s*\n?\s*$/);
});
