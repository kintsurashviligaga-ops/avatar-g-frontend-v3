-- 20261013a_request_idempotency.sql — APPLIED to Production on 2026-10-13 ~16:12Z.
--
-- Applied by the owner in the Supabase SQL Editor (this exact file), on GG's yes of 2026-10-13 15:26Z ("ორივე":
-- this migration, then the PR #63 merge). Verified read-only right after: table present, RLS on, 0 policies, 0 rows,
-- table grants only to service_role; both functions SECURITY DEFINER with search_path=public, EXECUTE for service_role
-- only (anon and authenticated: no). No functional claim/release was run in Production (no test rows there).
--
-- R2 (GO_NO_GO_REPORT_KA.md): when Redis cannot answer, lib/orchestrator/idempotency.ts claimIdempotencyKey used to
-- answer "first" to every call, so the 60 s duplicate guard of the paid film assembly (app/api/video/assemble,
-- `assemble:<hash>`) and the per-user paid-dispatch lock of the chat (lib/chat/providerRouter, `chat-paid-dispatch`,
-- 90 s) were open: a double-pressed Start could build two masters. This table is the same guard in the database every
-- instance already shares. The code (lib/orchestrator/idempotencyStore.ts) uses it only when Redis is absent or
-- erroring, and fails open if the functions are missing. Verified on a throwaway Postgres 16 + PostgREST
-- (scripts/lease-isolation/run.sh → lib/orchestrator/idempotencyStore.pg.test.ts).
--
-- Additive only: one table, two functions. Nothing existing is altered. Rollback: drop the two functions and the table
-- (the code then fails open again):
--   drop function public.claim_request_idempotency(text, text, integer);
--   drop function public.release_request_idempotency(text, text);
--   drop table public.request_idempotency;

begin;

create table if not exists public.request_idempotency (
  -- A user id, or `anon:<film token>` for the anonymous film path: text, not a uuid, on purpose.
  owner       text not null check (char_length(owner) between 1 and 200),
  -- `assemble:<32 hex>` or `chat-paid-dispatch`; bounded so a caller cannot store payloads here.
  key         text not null check (char_length(key) between 1 and 200),
  expires_at  timestamptz not null,
  claimed_at  timestamptz not null default now(),
  primary key (owner, key)
);

create index if not exists request_idempotency_expires_idx on public.request_idempotency (expires_at);

-- Service role only: no policy for anon/authenticated, and no grants either.
alter table public.request_idempotency enable row level security;
revoke all on table public.request_idempotency from public, anon, authenticated;
grant select, insert, update, delete on table public.request_idempotency to service_role;

-- true  = this caller is the first inside the window (the key was free or had expired) — go ahead;
-- false = someone holds the key and it has not expired — a duplicate.
-- One statement, so two concurrent callers cannot both get true: the primary key serialises them, and the loser's
-- ON CONFLICT … WHERE sees the winner's unexpired row and updates nothing.
create or replace function public.claim_request_idempotency(p_owner text, p_key text, p_window_sec integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  if p_owner is null or p_key is null or char_length(p_owner) not between 1 and 200 or char_length(p_key) not between 1 and 200 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  if p_window_sec is null or p_window_sec not between 1 and 3600 then
    raise exception 'invalid_idempotency_window' using errcode = '22023';
  end if;

  insert into public.request_idempotency as r (owner, key, expires_at, claimed_at)
  values (p_owner, p_key, now() + make_interval(secs => p_window_sec), now())
  on conflict (owner, key) do update
    set expires_at = excluded.expires_at, claimed_at = excluded.claimed_at
    where r.expires_at <= now()
  returning true into claimed;

  -- Housekeeping, bounded to this owner: keys that expired more than a day ago.
  delete from public.request_idempotency where owner = p_owner and expires_at < now() - interval '1 day';

  return coalesce(claimed, false);
end;
$$;

-- Frees a key at once (the assemble Saga's rollback, the dispatch lock's finally) so an honest retry is not refused.
create or replace function public.release_request_idempotency(p_owner text, p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.request_idempotency where owner = p_owner and key = p_key;
$$;

revoke execute on function public.claim_request_idempotency(text, text, integer) from public, anon, authenticated;
revoke execute on function public.release_request_idempotency(text, text) from public, anon, authenticated;
grant execute on function public.claim_request_idempotency(text, text, integer) to service_role;
grant execute on function public.release_request_idempotency(text, text) to service_role;

commit;
