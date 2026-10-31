-- 20261031b_sandbox_spend.sql — APPLIED to Production on 2026-10-31 ~16:38Z by GG in the Supabase SQL Editor (GG 16:34Z „ჩაწერე კი“, 16:38Z „ჩავსვი და რანს დავაჭირე“). Not verified read-only by Claude: Supabase MCP denied.
--
-- Agent G Phase 2 (Vercel Sandbox, GG 2026-10-31 16:17Z: "ლიმიტი 20$"). Every sandbox run books its worst-case cost
-- here BEFORE the sandbox is created, and replaces it with the real cost when the sandbox stops. A run that would take
-- the lifetime total over the cap is refused. Every server instance shares this database, so the $20 cap holds across
-- instances (lib/agent/sandbox/budget.ts memorySpendStore does not). Vercel Spend Management ($10 budget, alerts only)
-- is the outer warning; this table is the hard stop.
--
-- Additive only: one table, two functions. Nothing existing is altered. Rollback (the runner then refuses every run,
-- because reserve fails closed):
--   drop function public.reserve_sandbox_spend(numeric, numeric, uuid);
--   drop function public.settle_sandbox_spend(uuid, numeric);
--   drop table public.sandbox_spend;

begin;

create table if not exists public.sandbox_spend (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,                                   -- who asked (null for an owner/system run)
  reserved_usd numeric(12,6) not null check (reserved_usd >= 0 and reserved_usd <= 5),
  used_usd     numeric(12,6) check (used_usd is null or (used_usd >= 0 and used_usd <= reserved_usd)),
  created_at   timestamptz not null default now(),
  settled_at   timestamptz
);

create index if not exists sandbox_spend_created_idx on public.sandbox_spend (created_at);

-- Service role only: no policy for anon/authenticated, and no grants either.
alter table public.sandbox_spend enable row level security;
revoke all on table public.sandbox_spend from public, anon, authenticated;
grant select, insert, update on table public.sandbox_spend to service_role;

-- Returns the new reservation's id, or null when booking p_usd would take the total over p_cap.
-- The total counts the real cost of settled runs and the worst case of unsettled ones (a crashed run stays at its
-- worst case: the cap over-counts, never under-counts). A transaction-level advisory lock serialises concurrent
-- callers, so two runs cannot both see room for one.
create or replace function public.reserve_sandbox_spend(p_usd numeric, p_cap numeric, p_user uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  spent numeric;
  new_id uuid;
begin
  if p_usd is null or p_usd < 0 or p_usd > 5 then
    raise exception 'invalid_sandbox_amount' using errcode = '22023';
  end if;
  if p_cap is null or p_cap <= 0 or p_cap > 20 then
    raise exception 'invalid_sandbox_cap' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('sandbox_spend'));
  select coalesce(sum(coalesce(used_usd, reserved_usd)), 0) into spent from public.sandbox_spend;
  if spent + p_usd > p_cap then
    return null;
  end if;

  insert into public.sandbox_spend (user_id, reserved_usd) values (p_user, p_usd) returning id into new_id;
  return new_id;
end;
$$;

-- Replaces a reservation with the real cost, once. Never above the reservation (the check constraint holds that too).
create or replace function public.settle_sandbox_spend(p_id uuid, p_used numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.sandbox_spend
     set used_usd = least(greatest(coalesce(p_used, reserved_usd), 0), reserved_usd), settled_at = now()
   where id = p_id and settled_at is null;
$$;

revoke all on function public.reserve_sandbox_spend(numeric, numeric, uuid) from public, anon, authenticated;
revoke all on function public.settle_sandbox_spend(uuid, numeric) from public, anon, authenticated;
grant execute on function public.reserve_sandbox_spend(numeric, numeric, uuid) to service_role;
grant execute on function public.settle_sandbox_spend(uuid, numeric) to service_role;

commit;
