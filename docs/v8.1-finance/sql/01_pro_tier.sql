-- 01_pro_tier.sql — adds the Pro plan (129 ₾ / 1,550 credits a month, GG 2026-11-14) as a 4th paid tier: 'pro'.
-- Safe to run before launch: it only WIDENS allowlists, so nothing that works today stops working, and nothing sells Pro
-- until NEXT_PUBLIC_PRICING_V8 is on. Idempotent (running it twice is fine). One transaction: all or nothing.
begin;

-- 1. subscriptions.tier
alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions
  add constraint subscriptions_tier_check check (tier is null or tier in ('free', 'starter', 'creator', 'pro', 'business')) not valid;
alter table public.subscriptions validate constraint subscriptions_tier_check;

-- 2. bog_orders.tier
alter table public.bog_orders drop constraint if exists bog_orders_tier_check;
alter table public.bog_orders
  add constraint bog_orders_tier_check check (tier is null or tier in ('starter', 'creator', 'pro', 'business')) not valid;
alter table public.bog_orders validate constraint bog_orders_tier_check;

-- 3. subscription_allowance_grants.tier
alter table public.subscription_allowance_grants drop constraint if exists subscription_allowance_grants_tier_check;
alter table public.subscription_allowance_grants
  add constraint subscription_allowance_grants_tier_check check (tier in ('starter', 'creator', 'pro', 'business')) not valid;
alter table public.subscription_allowance_grants validate constraint subscription_allowance_grants_tier_check;

-- 4. grant_subscription_allowance: its tier allowlist gains 'pro'. Patches the function AS IT IS in Production (read with
--    pg_get_functiondef), so it never reverts some other later change to the function. Same signature, so no new overload.
do $$
declare
  sig constant regprocedure := 'public.grant_subscription_allowance(uuid, text, text, integer, text, text, text, timestamptz, timestamptz)'::regprocedure;
  def text := pg_get_functiondef(sig);
begin
  if position($q$('starter', 'creator', 'pro', 'business')$q$ in def) > 0 then
    raise notice 'grant_subscription_allowance already allows pro';
  elsif position($q$('starter', 'creator', 'business')$q$ in def) = 0 then
    raise exception 'grant_subscription_allowance allowlist not found: stop and ask Claude';
  else
    execute replace(def, $q$('starter', 'creator', 'business')$q$, $q$('starter', 'creator', 'pro', 'business')$q$);
  end if;
end;
$$;

commit;

-- Check: all three constraints and the function now name 'pro'.
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conname in ('subscriptions_tier_check', 'bog_orders_tier_check', 'subscription_allowance_grants_tier_check');
select position('''pro''' in pg_get_functiondef('public.grant_subscription_allowance(uuid, text, text, integer, text, text, text, timestamptz, timestamptz)'::regprocedure)) > 0 as grant_allows_pro;
