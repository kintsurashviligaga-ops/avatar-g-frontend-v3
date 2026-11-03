-- REVIEW-ONLY staging update. Verify target project independently before execution.
-- Refuses any pre-existing grant; no migration of existing credentials is safe.
-- Apply before the matching preview code, never to production. Does not enable logout.
begin;
do $$ begin
  if exists(select 1 from public.mcp_oauth_grants) then
    raise exception 'existing grants require a separately reviewed relinking plan';
  end if;
end $$;
alter table public.mcp_oauth_grants add column upstream_session_id uuid not null;
create unique index mcp_oauth_grants_upstream_session_unique on public.mcp_oauth_grants(upstream_session_id);

create or replace function public.mcp_oauth_enforce_session_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.upstream_session_id is distinct from old.upstream_session_id then
    raise exception 'upstream session binding is immutable';
  end if;
  return new;
end $$;
drop trigger if exists mcp_oauth_grant_session_immutable on public.mcp_oauth_grants;
create trigger mcp_oauth_grant_session_immutable before update of upstream_session_id on public.mcp_oauth_grants
  for each row execute function public.mcp_oauth_enforce_session_immutable();

create or replace function public.mcp_oauth_finalize_pending(
  p_id uuid, p_user_id uuid, p_verified_upstream_user_id uuid,
  p_client_id text, p_redirect_uri text, p_resource text,
  p_grant_id uuid, p_code_hash text, p_upstream_refresh_ciphertext text, p_claim uuid,
  p_upstream_session_id uuid, p_browser_session_id uuid
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare pending public.mcp_oauth_pending%rowtype;
begin
  if p_id is null or p_user_id is null or p_verified_upstream_user_id is distinct from p_user_id
    or p_grant_id is null or p_claim is null or p_upstream_session_id is null or p_browser_session_id is null
    or p_upstream_session_id=p_browser_session_id or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$'
    or p_upstream_refresh_ciphertext is null or length(p_upstream_refresh_ciphertext) not between 1 and 16384 then return false; end if;
  select * into pending from public.mcp_oauth_pending where id = p_id for update;
  if not found or pending.user_id is distinct from p_user_id or pending.status <> 'exchanging' or pending.upstream_claim is distinct from p_claim
    or pending.expires_at <= clock_timestamp() or pending.client_id is distinct from p_client_id
    or pending.redirect_uri is distinct from p_redirect_uri or pending.resource is distinct from p_resource then return false; end if;
  insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext,upstream_session_id)
    values (p_grant_id,pending.user_id,pending.client_id,pending.resource,pending.scopes,p_upstream_refresh_ciphertext,p_upstream_session_id);
  insert into public.mcp_oauth_codes(code_hash,grant_id,redirect_uri,code_challenge,expires_at)
    values (p_code_hash,p_grant_id,pending.redirect_uri,pending.code_challenge,
      least(pending.expires_at,clock_timestamp()+interval '2 minutes'));
  update public.mcp_oauth_pending set status = 'consumed', upstream_verifier_ciphertext=null,upstream_claim=null where id = p_id;
  return true;
end $$;

create or replace function public.mcp_oauth_resolve_access_v2(
  p_access_hash text, p_client_id text, p_resource text
) returns table(grant_id uuid, user_id uuid, scopes text[], access_ciphertext text, access_expires_at timestamptz, upstream_session_id uuid)
language sql stable security invoker set search_path = '' as $$
  select g.id,g.user_id,g.scopes,g.upstream_access_ciphertext,g.upstream_access_expires_at,g.upstream_session_id
  from public.mcp_oauth_tokens t join public.mcp_oauth_grants g on g.id=t.grant_id
  where t.token_hash=p_access_hash and t.kind='access' and t.expires_at>statement_timestamp()
    and t.used_at is null and g.revoked_at is null and g.client_id=p_client_id and g.resource=p_resource
    and g.upstream_refresh_state='ready' and 'mcp:read'=any(g.scopes)
  limit 1
$$;

revoke all on function public.mcp_oauth_finalize_pending(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid) from public, anon, authenticated, service_role;
revoke all on function public.mcp_oauth_finalize_pending(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.mcp_oauth_resolve_access_v2(text,text,text) from public, anon, authenticated;
grant execute on function public.mcp_oauth_finalize_pending(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid,uuid,uuid) to service_role;
grant execute on function public.mcp_oauth_resolve_access_v2(text,text,text) to service_role;
commit;
