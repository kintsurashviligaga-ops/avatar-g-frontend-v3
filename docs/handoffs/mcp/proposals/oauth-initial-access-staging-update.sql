-- REVIEW ONLY. Staging upgrade after session-binding; never apply to production.
-- Verify the test project identity independently. Existing grants require relinking.
begin;
do $$ begin
  if exists(select 1 from public.mcp_oauth_grants) then
    raise exception 'existing grants require a separate relinking plan';
  end if;
end $$;
create or replace function public.mcp_oauth_finalize_pending(
  p_id uuid, p_user_id uuid, p_verified_upstream_user_id uuid,
  p_client_id text, p_redirect_uri text, p_resource text,
  p_grant_id uuid, p_code_hash text, p_upstream_refresh_ciphertext text, p_claim uuid,
  p_upstream_session_id uuid, p_browser_session_id uuid,
  p_upstream_access_ciphertext text, p_upstream_access_expires_at timestamptz
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare pending public.mcp_oauth_pending%rowtype;
begin
  if p_id is null or p_user_id is null or p_verified_upstream_user_id is distinct from p_user_id
    or p_grant_id is null or p_claim is null or p_upstream_session_id is null or p_browser_session_id is null
    or p_upstream_session_id=p_browser_session_id or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$'
    or p_upstream_refresh_ciphertext is null or length(p_upstream_refresh_ciphertext) not between 1 and 16384
    or p_upstream_access_ciphertext is null or length(p_upstream_access_ciphertext) not between 1 and 16384
    or p_upstream_access_expires_at is null or p_upstream_access_expires_at <= clock_timestamp()+interval '10 seconds'
    or p_upstream_access_expires_at > clock_timestamp()+interval '1 day' then return false; end if;
  select * into pending from public.mcp_oauth_pending where id = p_id for update;
  if not found or pending.user_id is distinct from p_user_id or pending.status <> 'exchanging' or pending.upstream_claim is distinct from p_claim
    or pending.expires_at <= clock_timestamp() or pending.client_id is distinct from p_client_id
    or pending.redirect_uri is distinct from p_redirect_uri or pending.resource is distinct from p_resource then return false; end if;
  insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext,upstream_session_id,upstream_access_ciphertext,upstream_access_expires_at)
    values (p_grant_id,pending.user_id,pending.client_id,pending.resource,pending.scopes,p_upstream_refresh_ciphertext,p_upstream_session_id,p_upstream_access_ciphertext,p_upstream_access_expires_at);
  insert into public.mcp_oauth_codes(code_hash,grant_id,redirect_uri,code_challenge,expires_at)
    values (p_code_hash,p_grant_id,pending.redirect_uri,pending.code_challenge,
      least(pending.expires_at,clock_timestamp()+interval '2 minutes'));
  update public.mcp_oauth_pending set status = 'consumed', upstream_verifier_ciphertext=null,upstream_claim=null where id = p_id;
  return true;
end $$;
revoke all on function public.mcp_oauth_finalize_pending(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.mcp_oauth_finalize_pending(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid,uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.mcp_oauth_finalize_pending(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid,uuid,uuid,text,timestamptz) to service_role;
commit;
