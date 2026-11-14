-- 00_preflight.sql — READ ONLY. Run first, the moment Supabase is back. Changes nothing.
-- Every row should say ok = true. If one says false, stop and send the result to Claude.

select 'db reachable' as check, true as ok
union all
select 'subscriptions_tier_check exists',
       exists (select 1 from pg_constraint where conrelid = 'public.subscriptions'::regclass and conname = 'subscriptions_tier_check')
union all
select 'bog_orders_tier_check exists',
       exists (select 1 from pg_constraint where conrelid = 'public.bog_orders'::regclass and conname = 'bog_orders_tier_check')
union all
select 'subscription_allowance_grants_tier_check exists',
       exists (select 1 from pg_constraint where conrelid = 'public.subscription_allowance_grants'::regclass and conname = 'subscription_allowance_grants_tier_check')
union all
select 'grant_subscription_allowance has the 3-tier allowlist',
       position($q$('starter', 'creator', 'business')$q$ in pg_get_functiondef('public.grant_subscription_allowance(uuid, text, text, integer, text, text, text, timestamptz, timestamptz)'::regprocedure)) > 0
union all
select 'balance trigger on credit_ledger exists',
       exists (select 1 from pg_trigger where tgrelid = 'public.credit_ledger'::regclass and tgname = 'trigger_update_credits_balance')
union all
select 'no pro tier rows yet',
       not exists (select 1 from public.subscriptions where tier = 'pro');

-- For the record (paste the numbers into the thread):
select count(*) filter (where credits_balance > 0) as users_with_balance,
       coalesce(sum(credits_balance) filter (where credits_balance > 0), 0) as credits_outstanding
  from public.profiles;
