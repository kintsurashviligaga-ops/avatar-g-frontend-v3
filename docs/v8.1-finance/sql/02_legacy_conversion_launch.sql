-- 02_legacy_conversion_launch.sql — RUN ONCE, right after NEXT_PUBLIC_PRICING_V8 goes live (the deployment is READY).
-- GG chose this on the decision card 2026-11-14 15:21Z ("Top up balances 1.7x at launch"); the per-charge pool was dropped.
--
-- v8 prices are about 1.7x today's (video 1.72-1.77x, image 1.6x, song 1.83x). So every balance held at launch is
-- multiplied by 1.7: the credits a user already owns buy what they bought before. On day 30, 04_legacy_conversion_day30.sql
-- takes back whatever part of that extra is still unspent (credits bought after launch are never touched).
begin;

create table if not exists public.credit_legacy_conversions (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  balance_before integer not null check (balance_before > 0),
  bonus          integer not null check (bonus >= 0),
  launch_at      timestamptz not null,
  clawed_back    integer,
  clawed_at      timestamptz
);
alter table public.credit_legacy_conversions enable row level security; -- no policies: service role only

-- One row per user with a positive balance. `on conflict do nothing` makes a second run harmless.
insert into public.credit_legacy_conversions (user_id, balance_before, bonus, launch_at)
select p.id, p.credits_balance::integer, ceil(p.credits_balance * 0.7)::integer, now()
  from public.profiles p
 where coalesce(p.credits_balance, 0) > 0
on conflict (user_id) do nothing;

-- The bonus goes in through the ledger (trigger_update_credits_balance moves the balance; nothing writes profiles directly).
-- 'purchase' is one of the three reasons credit_ledger_reason_check accepts; metadata.kind marks it as the v8 conversion.
insert into public.credit_ledger (user_id, delta, reason, metadata)
select c.user_id, c.bonus, 'purchase',
       jsonb_build_object('kind', 'v8_legacy_conversion', 'ref', 'v8-legacy:' || c.user_id, 'balance_before', c.balance_before, 'multiplier', 1.7)
  from public.credit_legacy_conversions c
 where c.bonus > 0
   and not exists (select 1 from public.credit_ledger l
                    where l.user_id = c.user_id and l.metadata->>'kind' = 'v8_legacy_conversion');

commit;

-- Check (paste into the thread): users converted, credits added, and that every bonus landed exactly once.
select count(*) as users, sum(balance_before) as before, sum(bonus) as bonus_added from public.credit_legacy_conversions;
select count(*) as ledger_rows, sum(delta) as ledger_bonus from public.credit_ledger where metadata->>'kind' = 'v8_legacy_conversion';
