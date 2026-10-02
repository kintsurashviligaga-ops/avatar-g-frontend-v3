/**
 * Source-shape guards for supabase/migrations/20261002a_bog_billing.sql — the money rules a reviewer must not have
 * to re-derive. The live proof is the rollback-only dry run recorded in the commit and scripts/check-db-exposure.mjs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG = join(__dirname, '..', '..', 'supabase', 'migrations');
const RAW = readFileSync(join(MIG, '20261002a_bog_billing.sql'), 'utf8');
const TIERS_RAW = readFileSync(join(MIG, '20261001a_subscription_tiers.sql'), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const SQL = stripComments(RAW).toLowerCase();

/** The text between two section headers of a migration (comments kept — they are part of the copy). */
const section = (src: string, from: RegExp, to: RegExp) => {
  const a = src.search(from);
  const b = src.search(to);
  expect(a).toBeGreaterThanOrEqual(0);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

describe('20261002a_bog_billing.sql', () => {
  it('is one transaction', () => {
    expect(SQL.trim().startsWith('begin;')).toBe(true);
    expect(SQL.trim().endsWith('commit;')).toBe(true);
  });

  it('carries 20261001a’s subscriptions, grant table and grant function VERBATIM (either may be applied first)', () => {
    const tables = (src: string) => section(src, /^-- ─── 1\. subscriptions/m, /^-- ─── (3\. profiles|5\. grant_subscription_allowance)/m);
    const fn = (src: string) => section(src, /^-- ─── 5\. grant_subscription_allowance/m, /^-- ─── (VERIFY|6\. subscriptions)/m);
    expect(tables(RAW).trim()).toBe(tables(TIERS_RAW).trim());
    expect(fn(RAW).trim()).toBe(fn(TIERS_RAW).trim());
  });

  it('does not touch profiles (20261001a’s trial/tier changes belong to the Stripe activation)', () => {
    expect(SQL).not.toMatch(/alter\s+table\s+public\.profiles/);
    expect(SQL).not.toMatch(/update\s+public\.profiles/);
  });

  it('takes client writes off bog_orders and keeps RLS on', () => {
    expect(SQL).toContain('alter table public.bog_orders enable row level security;');
    expect(SQL).toContain('revoke all on public.bog_orders from anon;');
    expect(SQL).toContain('revoke insert, update, delete, truncate on public.bog_orders from authenticated;');
  });

  it('allows at most one live renewal per subscription period, and one of our orders per BOG order', () => {
    expect(SQL).toMatch(/create unique index if not exists bog_orders_renewal_period_uniq\s+on public\.bog_orders \(subscription_id, period_start\)\s+where kind = 'renewal' and status in \('pending', 'completed'\)/);
    expect(SQL).toMatch(/create unique index if not exists bog_orders_bog_order_id_uniq on public\.bog_orders \(bog_order_id\) where bog_order_id is not null/);
  });

  it.each([
    ['bog_fulfill_order', 'text, text, text, boolean'],
    ['bog_claim_renewal', 'uuid, integer'],
    ['bog_record_renewal_failure', 'text, text'],
  ])('%s is SECURITY DEFINER, search_path pinned, EXECUTE for service_role only', (fn, sig) => {
    const def = SQL.match(new RegExp(`create or replace function public\\.${fn}\\(([\\s\\S]*?)\\$\\$`));
    expect(def).not.toBeNull();
    expect(def?.[1]).toMatch(/security definer/);
    expect(def?.[1]).toMatch(/set search_path = public, pg_temp/);
    expect(SQL).toContain(`revoke execute on function public.${fn}(${sig}) from public, anon, authenticated;`);
    expect(SQL).toContain(`grant execute on function public.${fn}(${sig}) to service_role;`);
  });

  it('the function parameters are the ones lib/billing/wallet-ledger.ts sends', () => {
    const ts = readFileSync(join(__dirname, 'wallet-ledger.ts'), 'utf8');
    for (const p of ['p_shop_order_id', 'p_bog_order_id', 'p_card_mask', 'p_card_saved', 'p_subscription_id', 'p_credits', 'p_reason']) {
      expect(SQL).toContain(p);
      expect(ts).toContain(`${p}:`);
    }
  });

  it('a top-up is booked through credit_wallet_gel with ref bog:<order> (revenue lands in wallet_topups)', () => {
    expect(SQL).toContain("public.credit_wallet_gel(o.user_id, o.amount_gel, 'bog:' || o.shop_order_id, 'purchase')");
  });

  it('a plan month is booked through grant_subscription_allowance with invoice bog:<order> — never a direct balance UPDATE', () => {
    expect(SQL).toContain("public.grant_subscription_allowance(\n                 o.user_id, 'bog:' || o.shop_order_id, o.tier, o.credits, v_sub_key");
    expect(SQL).not.toMatch(/update\s+public\.profiles\s+set\s+credits_balance/);
  });

  it('an already-completed order answers granted=false before touching any money', () => {
    const body = SQL.slice(SQL.indexOf('create or replace function public.bog_fulfill_order'));
    const completedGuard = body.indexOf("if o.status = 'completed' then");
    expect(completedGuard).toBeGreaterThan(0);
    expect(completedGuard).toBeLessThan(body.indexOf('credit_wallet_gel'));
    expect(completedGuard).toBeLessThan(body.indexOf('grant_subscription_allowance'));
  });

  it('ends with a VERIFY block that refuses to commit an exposed function or table', () => {
    expect(SQL).toContain('verify failed');
    expect(SQL).toMatch(/has_function_privilege\('anon', v_fn, 'execute'\)/);
    expect(SQL).toMatch(/has_table_privilege\('authenticated', 'public\.bog_orders', 'insert'\)/);
  });
});
