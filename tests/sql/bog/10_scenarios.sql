-- tests/sql/bog/10_scenarios.sql — the BOG money functions against a real Postgres (built by build.sh).
-- Every block raises on a broken guarantee; the run is ON_ERROR_STOP, so "ALL OK" printed at the end = all passed.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create or replace function pg_temp.bal(u uuid) returns int language sql as $$ select credits_balance from public.profiles where id = u $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if; raise notice 'ok  %', what; end $$;
set client_min_messages = notice;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'a@test.local'),
  ('00000000-0000-4000-8000-000000000002', 'b@test.local'),
  ('00000000-0000-4000-8000-000000000003', 'c@test.local');
insert into public.profiles (id, email) values ('00000000-0000-4000-8000-000000000001', 'a@test.local');
-- user 2 and 3 have NO profile row: bog_fulfill_order must create one from auth.users.

-- ── 1. top-up: credits once, however many times it is settled ────────────────────────────────────────────────
insert into public.bog_orders (shop_order_id, user_id, amount_gel, kind, credits) values
  ('myavatar-topup-aaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001', 20, 'topup', 200);
select pg_temp.check((public.bog_fulfill_order('myavatar-topup-aaaaaaaaaaaaaaaa', 'bog-1', '548888xxxxxx9893', false) ->> 'granted')::boolean, 'T1 first settlement grants');
select pg_temp.check(pg_temp.bal('00000000-0000-4000-8000-000000000001') = 200, 'T1 balance = 20 GEL x 10 = 200');
select pg_temp.check(not (public.bog_fulfill_order('myavatar-topup-aaaaaaaaaaaaaaaa', 'bog-1', null, false) ->> 'granted')::boolean, 'T1 re-settlement (callback redelivery) grants nothing');
select pg_temp.check(not (public.bog_fulfill_order('myavatar-topup-aaaaaaaaaaaaaaaa', null, null, false) ->> 'granted')::boolean, 'T1 re-settlement without BOG id (cron) grants nothing');
select pg_temp.check(pg_temp.bal('00000000-0000-4000-8000-000000000001') = 200, 'T1 balance still 200');
select pg_temp.check((select count(*) from public.credit_ledger where metadata->>'ref' = 'bog:myavatar-topup-aaaaaaaaaaaaaaaa') = 1, 'T1 exactly one ledger row');
select pg_temp.check((select status = 'completed' and card_mask = '548888xxxxxx9893' and credited_at is not null from public.bog_orders where shop_order_id = 'myavatar-topup-aaaaaaaaaaaaaaaa'), 'T1 order completed, card mask kept');

-- ── 2. a receipt for another BOG order id is refused ─────────────────────────────────────────────────────────
do $$ begin
  perform public.bog_fulfill_order('myavatar-topup-aaaaaaaaaaaaaaaa', 'bog-OTHER', null, false);
  raise exception 'FAIL: T2 mismatched BOG id was accepted';
exception when sqlstate '22023' then raise notice 'ok  T2 mismatched BOG order id raises order_id_mismatch';
end $$;
do $$ begin
  perform public.bog_fulfill_order('myavatar-topup-doesnotexist00', null, null, false);
  raise exception 'FAIL: T2 unknown order accepted';
exception when sqlstate 'P0002' then raise notice 'ok  T2 unknown order raises unknown_order';
end $$;

-- ── 3. a user without a profile row is credited (profile created from auth.users) ───────────────────────────
insert into public.bog_orders (shop_order_id, user_id, amount_gel, kind, credits) values
  ('myavatar-topup-bbbbbbbbbbbbbbbb', '00000000-0000-4000-8000-000000000002', 10, 'topup', 100);
select public.bog_fulfill_order('myavatar-topup-bbbbbbbbbbbbbbbb', 'bog-2', null, false);
select pg_temp.check(pg_temp.bal('00000000-0000-4000-8000-000000000002') = 100, 'T3 profile-less user credited 100');

-- ── 4. plan: first month, saved card → renewing subscription ────────────────────────────────────────────────
insert into public.bog_orders (shop_order_id, user_id, amount_gel, kind, tier, credits, card_saved) values
  ('myavatar-plan-cccccccccccccccc', '00000000-0000-4000-8000-000000000001', 54, 'subscription', 'starter', 230, true);
select pg_temp.check((public.bog_fulfill_order('myavatar-plan-cccccccccccccccc', 'bog-3', '411111xxxxxx1111', true) ->> 'auto_renew')::boolean, 'T4 plan with saved card auto-renews');
select pg_temp.check(pg_temp.bal('00000000-0000-4000-8000-000000000001') = 430, 'T4 allowance 230 granted (200 + 230)');
select pg_temp.check((select provider = 'bog' and tier = 'starter' and status = 'active' and bog_parent_order_id = 'bog-3'
                        and amount_gel = 54 and not cancel_at_period_end and current_period_end > now() + interval '27 days'
                      from public.subscriptions where stripe_subscription_id = 'bog:bog-3'), 'T4 subscription row: bog/starter/active/parent=bog-3/54 GEL/1 month');
select public.bog_fulfill_order('myavatar-plan-cccccccccccccccc', 'bog-3', null, true);
select pg_temp.check(pg_temp.bal('00000000-0000-4000-8000-000000000001') = 430, 'T4 plan re-settlement grants nothing');
select pg_temp.check((select count(*) from public.subscriptions where user_id = '00000000-0000-4000-8000-000000000001') = 1, 'T4 still one subscription row');

-- ── 5. plan without a saved card (merchant not enabled / Apple Pay) → one month, no renewal ─────────────────
insert into public.bog_orders (shop_order_id, user_id, amount_gel, kind, tier, credits) values
  ('myavatar-plan-dddddddddddddddd', '00000000-0000-4000-8000-000000000003', 108, 'subscription', 'creator', 525);
select pg_temp.check(not (public.bog_fulfill_order('myavatar-plan-dddddddddddddddd', 'bog-4', null, false) ->> 'auto_renew')::boolean, 'T5 plan without saved card does not auto-renew');
select pg_temp.check((select cancel_at_period_end and bog_parent_order_id is null from public.subscriptions where stripe_subscription_id = 'bog:bog-4'), 'T5 subscription ends at period end, no parent card');
select pg_temp.check((public.bog_claim_renewal((select id from public.subscriptions where stripe_subscription_id = 'bog:bog-4'), 525) ->> 'reason') = 'canceled', 'T5 renewal refused (canceled)');

-- ── 6. renewal: not due → refused; due → one order per period; charge settles → next month ──────────────────
select pg_temp.check((public.bog_claim_renewal((select id from public.subscriptions where stripe_subscription_id = 'bog:bog-3'), 230) ->> 'reason') = 'not_due', 'T6 renewal before the last hour refused (not_due)');
-- a period that ended two days ago (cron was down) is still due; the next month starts from now
update public.subscriptions set current_period_end = now() - interval '2 days' where stripe_subscription_id = 'bog:bog-3';
create temp table r6 as select public.bog_claim_renewal((select id from public.subscriptions where stripe_subscription_id = 'bog:bog-3'), 230) j;
select pg_temp.check((select (j->>'claimed')::boolean and j->>'parent_order_id' = 'bog-3' and j->>'shop_order_id' like 'myavatar-renew-%' from r6), 'T6 due renewal claimed, parent card bog-3');
select pg_temp.check((select (public.bog_claim_renewal((select id from public.subscriptions where stripe_subscription_id = 'bog:bog-3'), 230) ->> 'reason') = 'in_flight'), 'T6 second tick sees in_flight (no double charge)');
select pg_temp.check((select count(*) from public.bog_orders where kind = 'renewal') = 1, 'T6 exactly one renewal order');
select pg_temp.check((select shop_order_id ~ '^myavatar-(topup|plan|renew)-[a-z0-9-]{8,64}$' from public.bog_orders where kind = 'renewal'), 'T6 renewal id passes the app''s isBogOrderId shape');
select public.bog_fulfill_order((select j->>'shop_order_id' from r6), 'bog-5', null, false);
select pg_temp.check(pg_temp.bal('00000000-0000-4000-8000-000000000001') = 660, 'T6 renewal grants the month (430 + 230)');
select pg_temp.check((select current_period_end > now() + interval '27 days' and renewal_failures = 0 and bog_parent_order_id = 'bog-3'
                      from public.subscriptions where stripe_subscription_id = 'bog:bog-3'), 'T6 period extended a month, parent card unchanged');
select public.bog_fulfill_order((select j->>'shop_order_id' from r6), 'bog-5', null, false);
select pg_temp.check(pg_temp.bal('00000000-0000-4000-8000-000000000001') = 660, 'T6 renewal re-settlement grants nothing');

-- ── 7. three declined renewals → past_due, no more claims ───────────────────────────────────────────────────
update public.subscriptions set current_period_end = now() + interval '10 minutes' where stripe_subscription_id = 'bog:bog-3';
do $$
declare v_sub uuid := (select id from public.subscriptions where stripe_subscription_id = 'bog:bog-3'); j jsonb; i int;
begin
  for i in 1..3 loop
    update public.subscriptions set next_attempt_at = null where id = v_sub;  -- skip the 24 h back-off in the test
    j := public.bog_claim_renewal(v_sub, 230);
    if not (j->>'claimed')::boolean then raise exception 'FAIL: T7 attempt % not claimed: %', i, j; end if;
    j := public.bog_record_renewal_failure(j->>'shop_order_id', 'code_107');
    if (j->>'failures')::int <> i then raise exception 'FAIL: T7 failures % <> %', j->>'failures', i; end if;
  end loop;
  raise notice 'ok  T7 three declines recorded, one order each';
end $$;
select pg_temp.check((select status = 'past_due' and renewal_failures = 3 from public.subscriptions where stripe_subscription_id = 'bog:bog-3'), 'T7 subscription past_due after 3 declines');
select pg_temp.check((public.bog_claim_renewal((select id from public.subscriptions where stripe_subscription_id = 'bog:bog-3'), 230) ->> 'reason') = 'exhausted', 'T7 fourth claim refused (exhausted)');
select pg_temp.check(pg_temp.bal('00000000-0000-4000-8000-000000000001') = 660, 'T7 declines granted nothing');

-- ── 8. back-off: a decline blocks the next claim for a day ──────────────────────────────────────────────────
insert into public.bog_orders (shop_order_id, user_id, amount_gel, kind, tier, credits) values
  ('myavatar-plan-eeeeeeeeeeeeeeee', '00000000-0000-4000-8000-000000000002', 54, 'subscription', 'starter', 230);
select public.bog_fulfill_order('myavatar-plan-eeeeeeeeeeeeeeee', 'bog-6', null, true);
update public.subscriptions set current_period_end = now() + interval '5 minutes' where stripe_subscription_id = 'bog:bog-6';
select public.bog_record_renewal_failure(public.bog_claim_renewal((select id from public.subscriptions where stripe_subscription_id = 'bog:bog-6'), 230) ->> 'shop_order_id', 'code_116');
select pg_temp.check((public.bog_claim_renewal((select id from public.subscriptions where stripe_subscription_id = 'bog:bog-6'), 230) ->> 'reason') = 'backoff', 'T8 claim right after a decline refused (backoff)');

-- ── 9. upgrade: a new plan stops the old one renewing and names its card for deletion ───────────────────────
insert into public.bog_orders (shop_order_id, user_id, amount_gel, kind, tier, credits) values
  ('myavatar-plan-ffffffffffffffff', '00000000-0000-4000-8000-000000000002', 108, 'subscription', 'creator', 525);
create temp table r9 as select public.bog_fulfill_order('myavatar-plan-ffffffffffffffff', 'bog-7', null, true) j;
select pg_temp.check((select j->'superseded_parent_orders' = '["bog-6"]'::jsonb from r9), 'T9 upgrade returns the old card (bog-6) for deletion');
select pg_temp.check((select cancel_at_period_end from public.subscriptions where stripe_subscription_id = 'bog:bog-6'), 'T9 old plan stops renewing');
select pg_temp.check((select not cancel_at_period_end and tier = 'creator' from public.subscriptions where stripe_subscription_id = 'bog:bog-7'), 'T9 new plan renews');

-- ── 10. a renewal row needs a subscription + period (table constraint) ──────────────────────────────────────
do $$ begin
  insert into public.bog_orders (shop_order_id, user_id, amount_gel, kind, tier, credits)
  values ('myavatar-renew-bad-0000000000', '00000000-0000-4000-8000-000000000001', 54, 'renewal', 'starter', 230);
  raise exception 'FAIL: T10 renewal without subscription accepted';
exception when check_violation then raise notice 'ok  T10 renewal without subscription/period rejected by the table';
end $$;

-- ── 11. client roles cannot call the money functions or write billing tables ─────────────────────────────────
select pg_temp.check(not has_function_privilege('authenticated', 'public.bog_fulfill_order(text,text,text,boolean)', 'execute')
                 and not has_function_privilege('anon', 'public.bog_fulfill_order(text,text,text,boolean)', 'execute')
                 and not has_function_privilege('authenticated', 'public.credit_wallet_gel(uuid,numeric,text,text)', 'execute')
                 and not has_table_privilege('authenticated', 'public.bog_orders', 'insert')
                 and not has_table_privilege('anon', 'public.bog_orders', 'select'), 'T11 client roles locked out');

\echo 'ALL OK — 10_scenarios'
