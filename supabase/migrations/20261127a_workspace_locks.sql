-- 20261127a_workspace_locks.sql — NOT APPLIED. Phase 8.23 (GG 2026-11-27 13:03Z). GG runs it in the Supabase SQL
-- Editor of project zwksnayknzggdcenqqxy only when the workspace race fix (WORKSPACE_LOCKS=1) is next in the runbook.
--
-- One short lease row per Agent G workspace, so two serverless instances never change the same workspace manifest at
-- once (lib/agent/workspace/store.ts header, lib/agent/workspace/dbLock.ts). A lease ends after its TTL (at most 120 s)
-- even if the instance holding it dies. Advisory locks were not used: pg_advisory_xact_lock ends when the RPC call
-- returns, before the storage writes it should cover, and a session lock is unsafe behind the pooler.
--
-- Additive only: one table, two functions. Nothing existing is altered, and the app writes exactly as before while
-- WORKSPACE_LOCKS is unset, or when these objects are missing. Rollback:
--   drop function if exists public.workspace_lock_acquire(text, text, text, integer);
--   drop function if exists public.workspace_lock_release(text, text, text);
--   drop table if exists public.workspace_locks;

begin;

create table if not exists public.workspace_locks (
  user_id      text not null check (length(user_id) between 1 and 128),
  workspace_id text not null check (length(workspace_id) between 1 and 64),
  holder       text not null check (length(holder) between 8 and 64),
  expires_at   timestamptz not null,
  primary key (user_id, workspace_id)
);

-- Service role only: no policy for anon/authenticated, and no grants either.
alter table public.workspace_locks enable row level security;
revoke all on table public.workspace_locks from public, anon, authenticated;
grant select, insert, update, delete on table public.workspace_locks to service_role;

-- True when the caller now holds the lease (it was free, expired, or already theirs: a renew). False when another
-- holder's lease is still live. One statement, so two callers can never both get true.
create or replace function public.workspace_lock_acquire(p_user text, p_ws text, p_holder text, p_ttl integer default 30)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  got text;
begin
  if p_ttl is null or p_ttl < 1 or p_ttl > 120 then
    raise exception 'invalid_lock_ttl' using errcode = '22023';
  end if;
  insert into public.workspace_locks as l (user_id, workspace_id, holder, expires_at)
  values (p_user, p_ws, p_holder, now() + make_interval(secs => p_ttl))
  on conflict (user_id, workspace_id) do update
    set holder = excluded.holder, expires_at = excluded.expires_at
    where l.expires_at < now() or l.holder = excluded.holder
  returning l.holder into got;
  return got is not null and got = p_holder;
end;
$$;

-- Releases only the caller's own lease. Releasing a lease that has already passed to someone else does nothing.
create or replace function public.workspace_lock_release(p_user text, p_ws text, p_holder text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.workspace_locks where user_id = p_user and workspace_id = p_ws and holder = p_holder;
$$;

revoke all on function public.workspace_lock_acquire(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.workspace_lock_release(text, text, text) from public, anon, authenticated;
grant execute on function public.workspace_lock_acquire(text, text, text, integer) to service_role;
grant execute on function public.workspace_lock_release(text, text, text) to service_role;

commit;
