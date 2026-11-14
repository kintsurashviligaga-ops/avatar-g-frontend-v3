-- 04_legacy_conversion_day30.sql — RUN ONCE, 30 days after launch (02 must have run). Takes back the UNSPENT part of each
-- launch bonus. Spending is counted as coming out of the old balance and its bonus first (the user's favour), and credits
-- added after launch (top-ups, plan allowances, refunds) are never taken back:
--   claw = min(bonus, max(0, balance_now - credits_added_since_launch))
begin;

with added as (
  select l.user_id, coalesce(sum(l.delta), 0) as since_launch
    from public.credit_ledger l
    join public.credit_legacy_conversions c on c.user_id = l.user_id
   where l.delta > 0 and l.created_at >= c.launch_at
     and coalesce(l.metadata->>'kind', '') <> 'v8_legacy_conversion'
   group by l.user_id
), due as (
  select c.user_id,
         least(c.bonus, greatest(0, p.credits_balance - coalesce(a.since_launch, 0)))::integer as claw
    from public.credit_legacy_conversions c
    join public.profiles p on p.id = c.user_id
    left join added a on a.user_id = c.user_id
   where c.clawed_at is null
     and now() >= c.launch_at + interval '30 days'
), ins as (
  insert into public.credit_ledger (user_id, delta, reason, metadata)
  select d.user_id, -d.claw, 'commit',
         jsonb_build_object('kind', 'v8_legacy_conversion_end', 'ref', 'v8-legacy-end:' || d.user_id)
    from due d where d.claw > 0
  returning user_id
)
update public.credit_legacy_conversions c
   set clawed_back = d.claw, clawed_at = now()
  from due d where d.user_id = c.user_id;

commit;

select count(*) filter (where clawed_at is not null) as closed, sum(clawed_back) as credits_taken_back,
       sum(bonus) - sum(coalesce(clawed_back, 0)) as bonus_spent
  from public.credit_legacy_conversions;
