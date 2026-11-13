-- v5.1 Phase 6 — DRAFT, NOT APPLIED. GG decision R-2 (2026-11-13 16:47Z): chats of users who have not signed in for
-- 365 days may be purged; the account, wallet, ledger and BOG history are KEPT.
-- Apply only after GREEN, after 01_fk_cascades_readonly.sql has been reviewed, and with GG's OK. A cron calls it daily.
-- chat_messages go with their session (ON DELETE CASCADE on session_id). Batched so one run never locks for long.
create or replace function public.purge_inactive_chats(p_days int default 365, p_limit int default 500)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare n integer;
begin
  if p_days < 365 then raise exception 'p_days must be >= 365'; end if;
  with doomed as (
    select s.session_id
    from public.chat_sessions s
    join auth.users u on u.id = s.user_id
    where u.last_sign_in_at is not null                       -- unknown last sign-in: never purged
      and u.last_sign_in_at < now() - make_interval(days => p_days)
    limit p_limit
  )
  delete from public.chat_sessions cs using doomed d where cs.session_id = d.session_id;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.purge_inactive_chats(int, int) from public, anon, authenticated;
grant execute on function public.purge_inactive_chats(int, int) to service_role;
