-- 99_rollback.sql — ONLY if launch must be undone. First set NEXT_PUBLIC_PRICING_V8 back off and redeploy.
-- A. Undo the launch conversion (02) for credits not yet spent: takes back min(bonus, balance) per user.
begin;
with due as (
  select c.user_id, least(c.bonus, greatest(p.credits_balance, 0))::integer as claw
    from public.credit_legacy_conversions c join public.profiles p on p.id = c.user_id
   where c.clawed_at is null
), ins as (
  insert into public.credit_ledger (user_id, delta, reason, metadata)
  select d.user_id, -d.claw, 'commit',
         jsonb_build_object('kind', 'v8_legacy_conversion_rollback', 'ref', 'v8-legacy-rb:' || d.user_id)
    from due d where d.claw > 0
  returning user_id
)
update public.credit_legacy_conversions c set clawed_back = d.claw, clawed_at = now()
  from due d where d.user_id = c.user_id;
commit;
select count(*) as rows_closed, sum(clawed_back) as credits_taken_back from public.credit_legacy_conversions;
-- B. The Pro tier (01) is only a widened allowlist: leave it. Narrowing it back fails if any Pro row exists.
