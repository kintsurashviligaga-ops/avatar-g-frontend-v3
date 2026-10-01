/** @jest-environment node */
/**
 * The 20261001b migration, read as text (it is NOT applied by anything in this repo's tests) and held to the
 * contract the TypeScript relies on: the status vocabularies match stateMachine.ts exactly, (job_id, ordinal) is
 * unique, RLS is on with owner-SELECT only and client writes revoked, the scene claim is the atomic
 * queued → submitted UPDATE … FOR UPDATE SKIP LOCKED … RETURNING, and both SECURITY DEFINER functions are
 * executable by service_role only. Comments are stripped first so a comment can never satisfy (or trip) a rule.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JOB_STATUSES, SCENE_STATUSES } from './stateMachine';

const RAW = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261001b_longform_jobs.sql'), 'utf8');
const SQL = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').toLowerCase().replace(/\s+/g, ' ');

const between = (from: string, to: string) => {
  const a = SQL.indexOf(from);
  const b = SQL.indexOf(to, a + from.length);
  return a >= 0 && b > a ? SQL.slice(a, b) : '';
};
const quoted = (list: readonly string[]) => list.map((s) => `'${s}'`).join(', ');

test('runs in one transaction', () => {
  expect(SQL.trim().startsWith('begin;')).toBe(true);
  expect(SQL.trim().endsWith('commit;')).toBe(true);
});

test('the status vocabularies are exactly the state machine\'s', () => {
  expect(SQL).toContain(`check (status in (${quoted(JOB_STATUSES)}))`);
  expect(SQL).toContain(`check (status in (${quoted(SCENE_STATUSES)}))`);
  expect(SQL).toContain("check (hold_reason in ('insufficient_credits', 'billing_unavailable', 'platform_budget', 'provider_unavailable'))");
});

test('the grid is enforced in the table too: 8…240 s in 8 s steps, ≤ 30 scenes, ≤ 3 acts', () => {
  expect(SQL).toContain('check (seconds between 8 and 240 and seconds % 8 = 0)');
  expect(SQL).toContain('check (scene_count * 8 = seconds)');
  expect(SQL).toContain('ordinal integer not null check (ordinal between 0 and 29)');
  expect(SQL).toContain('act integer not null check (act between 0 and 2)');
});

test('one row per (job, ordinal); one scene per Veo operation; the money columns exist', () => {
  expect(SQL).toContain('unique (job_id, ordinal)');
  expect(SQL).toMatch(/create unique index if not exists longform_scenes_operation_uniq on public\.longform_scenes \(operation_name\) where operation_name is not null/);
  for (const col of ['operation_name text', 'transport text', 'attempts integer', 'charge_ref text', 'charge_credits integer', 'refunded boolean', 'output_url text']) {
    expect(between('create table if not exists public.longform_scenes', ');')).toContain(col);
  }
  expect(SQL).toContain('check (not refunded or charge_ref is not null)');
});

test('RLS on; the owner may SELECT their own rows; nobody but service_role writes', () => {
  for (const t of ['longform_jobs', 'longform_scenes']) {
    expect(SQL).toContain(`alter table public.${t} enable row level security;`);
    expect(SQL).toContain(`create policy ${t}_owner_select on public.${t} for select to authenticated using (auth.uid() = user_id);`);
    expect(SQL).toContain(`revoke insert, update, delete, truncate on public.${t} from anon, authenticated;`);
  }
  // No write policy of any kind, for anyone.
  expect(SQL).not.toMatch(/create policy [a-z_]+ on public\.longform_\w+ for (insert|update|delete|all)/);
});

test('the scene claim is atomic: UPDATE … WHERE status = queued … FOR UPDATE SKIP LOCKED … RETURNING', () => {
  const fn = between('create or replace function public.claim_longform_scenes', '$$;');
  expect(fn).toContain("set status = 'submitted'");
  expect(fn).toContain('attempts = s.attempts + 1');
  expect(fn).toContain("and c.status = 'queued'");
  expect(fn).toContain('and c.charge_ref is not null'); // only scenes of a reserved act
  expect(fn).toContain('for update skip locked');
  expect(fn).toContain('returning s.*');
  const jobs = between('create or replace function public.claim_longform_jobs', '$$;');
  expect(jobs).toContain('for update skip locked');
  expect(jobs).toContain('(c.lease_until is null or c.lease_until < now())');
  expect(jobs).toContain('returning j.*');
});

test('both SECURITY DEFINER functions pin search_path and are executable by service_role only', () => {
  for (const [name, sig] of [['claim_longform_jobs', 'integer, integer'], ['claim_longform_scenes', 'uuid, integer[]']] as const) {
    const fn = between(`create or replace function public.${name}`, 'as $$');
    expect(fn).toContain('security definer');
    expect(fn).toContain('set search_path = public, pg_temp');
    expect(SQL).toContain(`revoke execute on function public.${name}(${sig}) from public, anon, authenticated;`);
    expect(SQL).toContain(`grant execute on function public.${name}(${sig}) to service_role;`);
    expect(SQL).not.toMatch(new RegExp(`grant execute on function public\\.${name}[^;]*to (public|anon|authenticated)`));
  }
});
