/** @jest-environment node */
/**
 * Source-shape guards for supabase/migrations/20261001a_subscription_tiers.sql — the file is NOT applied yet, so
 * these are what stands between a future edit and a re-opened money hole. The generic P0 guards
 * (lib/security/dbExposure.test.ts) cover it too; these pin what is specific to tiers, and tie the SQL to the
 * TypeScript that calls it.
 *
 * Comments are stripped first: a comment quoting a bad pattern must neither trip nor satisfy a guard.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAID_TIER_IDS, TIER_IDS } from './tiers';

const RAW = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '20261001a_subscription_tiers.sql'), 'utf8');
const SQL = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').toLowerCase().replace(/\s+/g, ' ');
const FN_SIG = 'public.grant_subscription_allowance(uuid, text, text, integer, text, text, text, timestamptz, timestamptz)';

describe('20261001a_subscription_tiers.sql', () => {
  it('is one transaction and only ever creates IF NOT EXISTS (re-runnable)', () => {
    expect(SQL.trim().startsWith('begin;')).toBe(true);
    expect(SQL.trim().endsWith('commit;')).toBe(true);
    for (const m of SQL.matchAll(/create (table|index|unique index) (?!if not exists)([a-z_.]+)/g)) {
      // The one unconditional CREATE UNIQUE INDEX sits inside a DO block that checks pg_index first.
      expect(m[0]).toBe('create unique index subscriptions_stripe_subscription_id_uniq');
    }
    // Destroys nothing (the word "truncate" may appear only inside REVOKE lists).
    expect(SQL).not.toMatch(/\bdrop table\b|\btruncate (table )?public\.|\bdelete from\b|\bdrop column\b/);
  });

  it('uses exactly the catalogue’s tier ids in its CHECKs', () => {
    const list = (ids: readonly string[]) => ids.map((t) => `'${t}'`).join(', ');
    expect(SQL).toContain(`check (tier is null or tier in (${list(TIER_IDS)}))`);
    expect(SQL).toContain(`check (tier in (${list(PAID_TIER_IDS)}))`);
    expect(SQL).toContain(`p_tier not in (${list(PAID_TIER_IDS)})`);
  });

  it('locks both tier tables to service_role writes, owner-only reads, RLS on', () => {
    for (const t of ['subscriptions', 'subscription_allowance_grants']) {
      expect(SQL).toContain(`alter table public.${t} enable row level security;`);
      expect(SQL).toContain(`revoke all on public.${t} from anon;`);
      expect(SQL).toContain(`revoke insert, update, delete, truncate on public.${t} from authenticated;`);
      expect(SQL).toMatch(new RegExp(`create policy [a-z_]+ on public\\.${t} for select to authenticated using \\(auth\\.uid\\(\\) = user_id\\);`));
    }
    // 004_saas_billing_credits' FOR ALL owner policy let a user write their own entitlement row.
    expect(SQL).toContain('drop policy if exists subscriptions_user_policy on public.subscriptions;');
    expect(SQL).not.toMatch(/create policy [^;]*for (all|insert|update|delete)/);
  });

  it('keeps the grant function private: SECURITY DEFINER, pinned search_path, EXECUTE for service_role only', () => {
    expect(SQL).toMatch(/create or replace function public\.grant_subscription_allowance\([^)]*\) returns jsonb language plpgsql security definer set search_path = public, pg_temp as \$\$/);
    expect(SQL).toContain(`revoke execute on function ${FN_SIG} from public, anon, authenticated;`);
    expect(SQL).toContain(`grant execute on function ${FN_SIG} to service_role;`);
  });

  it('the function signature is the one lib/billing/wallet-ledger.ts calls', () => {
    const head = SQL.slice(SQL.indexOf('create or replace function public.grant_subscription_allowance('), SQL.indexOf(') returns jsonb'));
    const params = [...head.matchAll(/(p_[a-z_]+) /g)].map((m) => m[1]);
    expect(params).toEqual(['p_user_id', 'p_invoice_id', 'p_tier', 'p_credits', 'p_subscription_id', 'p_customer_id', 'p_price_id', 'p_period_start', 'p_period_end']);
    const ts = readFileSync(join(__dirname, 'wallet-ledger.ts'), 'utf8');
    for (const p of params) expect(ts).toContain(`${p}:`);
  });

  it('books the allowance as a ledger INSERT with reason purchase and ref sub:<invoice id> — never refund, never an UPDATE', () => {
    const body = SQL.slice(SQL.indexOf('create or replace function public.grant_subscription_allowance'), SQL.indexOf('revoke execute on function public.grant_subscription_allowance'));
    expect(body).toContain("v_ref := 'sub:' || p_invoice_id;");
    expect(body).toMatch(/insert into public\.credit_ledger \(user_id, delta, reason, metadata\) values \(p_user_id, p_credits, 'purchase',/);
    expect(body).not.toContain("'refund'");
    // The AFTER INSERT ledger trigger moves the balance — an explicit UPDATE would pay twice (20260802b).
    expect(body).not.toMatch(/update public\.profiles/);
    // At most once per invoice, decided atomically.
    expect(body).toContain('on conflict (invoice_id) do nothing;');
    expect(SQL).toContain('invoice_id text primary key');
  });

  it('never rolls an entitlement back on a stale (redelivered) invoice', () => {
    expect(SQL).toContain('on conflict (stripe_subscription_id) do update');
    expect(SQL).toContain('where s.current_period_end is null or excluded.current_period_end >= s.current_period_end;');
  });

  it('records the trial start without stamping every existing account with the migration time', () => {
    const add = SQL.indexOf('alter table public.profiles add column if not exists trial_started_at timestamptz;');
    const backfill = SQL.indexOf('update public.profiles p set trial_started_at');
    const dflt = SQL.indexOf('alter table public.profiles alter column trial_started_at set default now();');
    expect(add).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(add);
    expect(dflt).toBeGreaterThan(backfill);
    expect(SQL).toContain('where p.trial_started_at is null;');
  });

  it('only WIDENS profiles.tier — every live value stays allowed', () => {
    expect(SQL).toContain("check (tier in ('free', 'pro', 'studio', 'enterprise', 'starter', 'creator', 'business')) not valid;");
  });

  it('ends with a VERIFY block that refuses to commit an exposed function or table', () => {
    expect(SQL).toContain("has_function_privilege('anon', v_fn, 'execute')");
    expect(SQL).toContain("credit_ledger_user_ref_positive_uniq");
    expect(SQL.lastIndexOf('verify ok')).toBeLessThan(SQL.lastIndexOf('commit;'));
  });
});
