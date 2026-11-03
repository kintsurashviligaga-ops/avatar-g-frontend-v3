-- REVIEW-ONLY staging proposal. Apply only after the session-binding update;
-- verify the target independently. No remote logout worker is enabled.
-- Reject existing grants: their revocation state needs a separate review.
begin;
do $$ begin
  if exists(select 1 from public.mcp_oauth_grants) then
    raise exception 'existing grants require a separate revocation migration plan';
  end if;
end $$;
alter table public.mcp_oauth_grants
  add column upstream_logout_state text not null default 'none' check (upstream_logout_state in ('none','waiting_refresh','queued','claimed','sending','unconfirmed','done','no_access')),
  add column upstream_logout_claim uuid,
  add column upstream_logout_claim_until timestamptz;
create or replace function public.mcp_oauth_complete_upstream_refresh_v2(
  p_grant_id uuid, p_user_id uuid, p_client_id text, p_resource text, p_claim_id uuid,
  p_access_ciphertext text, p_refresh_ciphertext text, p_access_expires_at timestamptz, p_verified_session_id uuid
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_claim_id is null or p_verified_session_id is null or p_access_ciphertext is null or p_refresh_ciphertext is null
    or length(p_access_ciphertext) not between 1 and 16384 or length(p_refresh_ciphertext) not between 1 and 16384
    or p_access_expires_at is null or p_access_expires_at <= clock_timestamp() then return false; end if;
  update public.mcp_oauth_grants set upstream_refresh_state = 'ready', upstream_refresh_claim = null,
    upstream_access_ciphertext = p_access_ciphertext, upstream_refresh_ciphertext = p_refresh_ciphertext,
    upstream_access_expires_at = p_access_expires_at,
    upstream_logout_state = case when revoked_at is not null and upstream_logout_state='waiting_refresh'
      then case when p_access_expires_at>clock_timestamp()+interval '10 seconds' then 'queued' else 'no_access' end
      else upstream_logout_state end
    where id = p_grant_id and user_id = p_user_id and client_id = p_client_id and resource = p_resource
      and upstream_session_id = p_verified_session_id and upstream_refresh_state = 'refreshing' and upstream_refresh_claim = p_claim_id
      and (revoked_at is null or upstream_logout_state='waiting_refresh');
  return found;
end $$;

create or replace function public.mcp_oauth_uncertain_upstream_refresh(
  p_grant_id uuid, p_user_id uuid, p_client_id text, p_resource text, p_claim_id uuid
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.mcp_oauth_grants set upstream_refresh_state = 'uncertain', upstream_refresh_claim = null,
    upstream_access_ciphertext = null, upstream_access_expires_at = null,
    upstream_logout_state = case when revoked_at is not null then 'unconfirmed' else upstream_logout_state end
    where id = p_grant_id and user_id = p_user_id and client_id = p_client_id and resource = p_resource
      and upstream_refresh_state = 'refreshing' and upstream_refresh_claim = p_claim_id;
  return found;
end $$;

create or replace function public.mcp_oauth_mark_revoked(p_grant_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.mcp_oauth_grants set revoked_at=clock_timestamp(),
    upstream_logout_state=case
      when upstream_refresh_state='refreshing' then 'waiting_refresh'
      when upstream_refresh_state='uncertain' then 'unconfirmed'
      when upstream_access_ciphertext is null or upstream_access_expires_at is null
        or upstream_access_expires_at<=clock_timestamp()+interval '10 seconds' then 'no_access'
      else 'queued' end
    where id=p_grant_id and revoked_at is null;
  return found;
end $$;

-- A future worker may reserve only an already-revoked grant's verified,
-- encrypted access token. No refresh token or plaintext credential is returned.
-- The claim is safe to reclaim only before the worker enters 'sending'.
create or replace function public.mcp_oauth_claim_logout(p_grant_id uuid, p_claim uuid)
returns table(user_id uuid, client_id text, resource text, upstream_session_id uuid, access_ciphertext text)
language plpgsql security invoker set search_path = '' as $$
begin
  if p_grant_id is null or p_claim is null then return; end if;
  update public.mcp_oauth_grants set upstream_logout_state='no_access'
    where id=p_grant_id and revoked_at is not null and upstream_logout_state='queued'
      and (upstream_access_ciphertext is null or upstream_access_expires_at is null or upstream_access_expires_at<=clock_timestamp()+interval '10 seconds');
  return query update public.mcp_oauth_grants g set upstream_logout_state='claimed',upstream_logout_claim=p_claim,
    upstream_logout_claim_until=clock_timestamp()+interval '30 seconds'
    where g.id=p_grant_id and g.revoked_at is not null and g.upstream_logout_state='queued' and g.upstream_refresh_state='ready'
      and g.upstream_access_ciphertext is not null and g.upstream_access_expires_at>clock_timestamp()+interval '10 seconds'
    returning g.user_id,g.client_id,g.resource,g.upstream_session_id,g.upstream_access_ciphertext;
end $$;

-- Call immediately before any network request. Once sending begins the claim
-- is never leased or retried automatically, even if the worker disappears.
create or replace function public.mcp_oauth_begin_logout(p_grant_id uuid, p_claim uuid, p_session_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.mcp_oauth_grants set upstream_logout_state='sending',upstream_logout_claim_until=null
    where id=p_grant_id and revoked_at is not null and upstream_logout_state='claimed'
      and upstream_logout_claim=p_claim and upstream_session_id=p_session_id
      and upstream_logout_claim_until>clock_timestamp() and upstream_access_expires_at>clock_timestamp()+interval '10 seconds';
  return found;
end $$;

-- Recover only claims that expired before the sending transition. Never use a
-- timer to retry an ambiguous network call. A stale claim cannot enter sending.
create or replace function public.mcp_oauth_recover_logout_claim(p_grant_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.mcp_oauth_grants set upstream_logout_claim=null,upstream_logout_claim_until=null,
    upstream_logout_state=case when upstream_access_ciphertext is not null and upstream_access_expires_at>clock_timestamp()+interval '10 seconds'
      then 'queued' else 'no_access' end
    where id=p_grant_id and revoked_at is not null and upstream_logout_state='claimed' and upstream_logout_claim_until<=clock_timestamp();
  return found;
end $$;

create or replace function public.mcp_oauth_finish_logout(p_grant_id uuid, p_claim uuid, p_session_id uuid, p_confirmed boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_confirmed is null then return false; end if;
  update public.mcp_oauth_grants set upstream_logout_state=case when p_confirmed then 'done' else 'unconfirmed' end,
    upstream_logout_claim=null,upstream_logout_claim_until=null
    where id=p_grant_id and revoked_at is not null and upstream_logout_state='sending'
      and upstream_logout_claim=p_claim and upstream_session_id=p_session_id;
  return found;
end $$;

create or replace function public.mcp_oauth_rotate_refresh(
  p_refresh_hash text, p_client_id text, p_resource text, p_access_hash text, p_next_refresh_hash text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare t public.mcp_oauth_tokens%rowtype; g public.mcp_oauth_grants%rowtype;
begin
  select * into t from public.mcp_oauth_tokens where token_hash = p_refresh_hash and kind = 'refresh' for update;
  if not found then return false; end if;
  select * into g from public.mcp_oauth_grants where id = t.grant_id for update;
  if not found or g.client_id is distinct from p_client_id or g.resource is distinct from p_resource or g.revoked_at is not null then return false; end if;
  if t.used_at is not null then
    perform public.mcp_oauth_mark_revoked(g.id);
    return false;
  end if;
  if t.expires_at <= clock_timestamp() then return false; end if;
  update public.mcp_oauth_tokens set used_at = clock_timestamp() where token_hash = p_refresh_hash;
  insert into public.mcp_oauth_tokens(token_hash, grant_id, kind, expires_at)
  values (p_access_hash, g.id, 'access', clock_timestamp() + interval '10 minutes'),
         (p_next_refresh_hash, g.id, 'refresh', clock_timestamp() + interval '30 days');
  return true;
end $$;

create or replace function public.mcp_oauth_revoke_token(
  p_token_hash text, p_client_id text, p_resource text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare t public.mcp_oauth_tokens%rowtype; g public.mcp_oauth_grants%rowtype;
begin
  select * into t from public.mcp_oauth_tokens where token_hash = p_token_hash for update;
  if not found then return true; end if;
  select * into g from public.mcp_oauth_grants where id = t.grant_id for update;
  if not found or g.client_id is distinct from p_client_id or g.resource is distinct from p_resource then return true; end if;
  perform public.mcp_oauth_mark_revoked(g.id);
  return true;
end $$;

revoke all on function public.mcp_oauth_complete_upstream_refresh(uuid,uuid,text,text,uuid,text,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.mcp_oauth_complete_upstream_refresh_v2(uuid,uuid,text,text,uuid,text,text,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.mcp_oauth_mark_revoked(uuid) from public, anon, authenticated;
revoke all on function public.mcp_oauth_claim_logout(uuid,uuid) from public, anon, authenticated;
revoke all on function public.mcp_oauth_begin_logout(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.mcp_oauth_recover_logout_claim(uuid) from public, anon, authenticated;
revoke all on function public.mcp_oauth_finish_logout(uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.mcp_oauth_complete_upstream_refresh_v2(uuid,uuid,text,text,uuid,text,text,timestamptz,uuid) to service_role;
grant execute on function public.mcp_oauth_mark_revoked(uuid) to service_role;
grant execute on function public.mcp_oauth_claim_logout(uuid,uuid) to service_role;
grant execute on function public.mcp_oauth_begin_logout(uuid,uuid,uuid) to service_role;
grant execute on function public.mcp_oauth_recover_logout_claim(uuid) to service_role;
grant execute on function public.mcp_oauth_finish_logout(uuid,uuid,uuid,boolean) to service_role;
commit;
