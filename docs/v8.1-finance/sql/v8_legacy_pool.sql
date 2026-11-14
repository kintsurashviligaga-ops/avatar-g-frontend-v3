-- docs/v8.1-finance/sql/v8_legacy_pool.sql — Phase 8.1, 30-day legacy pricing (GG 2026-11-14 10:26Z).
-- NOT APPLIED. Runs on the production DB only in the DB-up test, on GG's word. Kept out of supabase/migrations on purpose,
-- so no deploy can apply it by accident.
--
-- 1. The pool: each user's balance at launch. Only ever shrinks (consume_legacy_pool), never topped up.
create table if not exists public.credit_legacy_pools (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  pool       integer not null check (pool >= 0),
  launch_at  timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.credit_legacy_pools enable row level security;
-- No policies: service role only (the app reads it server-side; users never see or write it).

-- 2. Atomic spend: takes `p_amount` from the pool only if it all fits and the 30-day window is open. Returns true when it did.
--    The charge route calls it in the same request as deduct_credits with the LEGACY price; if it returns false the route
--    charges the v8 price instead (lib/billing/margin/legacy.ts chargeFor has the same rule).
create or replace function public.consume_legacy_pool(p_user_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_amount is null or p_amount <= 0 then return false; end if;
  update public.credit_legacy_pools
     set pool = pool - p_amount
   where user_id = p_user_id
     and pool >= p_amount
     and now() >= launch_at
     and now() < launch_at + interval '30 days';
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function public.consume_legacy_pool(uuid, integer) from public, anon, authenticated;

-- 3. Give a refunded legacy charge back to the pool (a failed generation is refunded at the price it was charged).
create or replace function public.restore_legacy_pool(p_user_id uuid, p_amount integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.credit_legacy_pools set pool = pool + greatest(p_amount, 0)
   where user_id = p_user_id and now() < launch_at + interval '30 days';
$$;
revoke all on function public.restore_legacy_pool(uuid, integer) from public, anon, authenticated;

-- 4. THE SNAPSHOT, run ONCE at the moment NEXT_PUBLIC_PRICING_V8 goes on (replace the timestamp with the launch time).
-- insert into public.credit_legacy_pools (user_id, pool, launch_at)
-- select id, greatest(coalesce(credits_balance, 0), 0)::integer, '2026-12-01T00:00:00Z'::timestamptz
--   from public.profiles where coalesce(credits_balance, 0) > 0
-- on conflict (user_id) do nothing;

-- 5. Check after the snapshot:
-- select count(*) as users, sum(pool) as legacy_credits from public.credit_legacy_pools;
