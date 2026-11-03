-- ADDITIVE PROPOSAL ONLY. Review and verify the target project independently
-- before execution. The experimental broker remains disabled in production.
-- This adds one function; it does not change or replace any existing table.
begin;
create or replace function public.mcp_oauth_deny_pending(
  p_id uuid, p_user_id uuid, p_client_id text, p_redirect_uri text, p_resource text
) returns table(oauth_state text) language plpgsql security invoker set search_path = '' as $$
begin
  return query update public.mcp_oauth_pending p set status='denied'
    where p.id=p_id and p.user_id=p_user_id and p.client_id=p_client_id and p.redirect_uri=p_redirect_uri
      and p.resource=p_resource and p.status='pending' and p.expires_at>clock_timestamp()
    returning p.oauth_state;
end $$;
revoke all on function public.mcp_oauth_deny_pending(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.mcp_oauth_deny_pending(uuid,uuid,text,text,text) to service_role;
commit;
