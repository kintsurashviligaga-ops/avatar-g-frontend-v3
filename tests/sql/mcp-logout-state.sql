-- Synthetic tests; disposable local database only. No remote logout is called.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('20000000-0000-4000-8000-000000000001');
insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_session_id,upstream_refresh_ciphertext,upstream_access_ciphertext,upstream_access_expires_at)
select ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000001','client',
  'https://example.test/api/mcp/gemini',array['mcp:read'],('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'encrypted-refresh',case when i=5 then null else 'encrypted-access' end,
  case when i=5 then null else clock_timestamp()+interval '10 minutes' end
from generate_series(2,6) i;
insert into public.mcp_oauth_tokens(token_hash,grant_id,kind,expires_at)
select repeat(i::text,64),('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'access',clock_timestamp()+interval '1 hour'
from generate_series(2,6) i;
do $$
declare ok boolean; cipher text;
begin
  if has_function_privilege('anon','public.mcp_oauth_claim_logout(uuid,uuid)','execute') or
     has_function_privilege('authenticated','public.mcp_oauth_begin_logout(uuid,uuid,uuid)','execute') then
    raise exception 'public role can access logout worker'; end if;
  select public.mcp_oauth_revoke_token(repeat('2',64),'client','https://example.test/api/mcp/gemini') into ok;
  if not ok or not exists(select 1 from public.mcp_oauth_grants where id='20000000-0000-4000-8000-000000000002' and upstream_logout_state='queued') then
    raise exception 'valid revoke did not queue'; end if;
  select access_ciphertext into cipher from public.mcp_oauth_claim_logout('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001');
  if cipher is distinct from 'encrypted-access' then raise exception 'valid logout claim failed'; end if;
  update public.mcp_oauth_grants set upstream_logout_claim_until=clock_timestamp()-interval '1 second' where id='20000000-0000-4000-8000-000000000002';
  select public.mcp_oauth_recover_logout_claim('20000000-0000-4000-8000-000000000002') into ok;
  if not ok then raise exception 'pre-send claim was not recovered'; end if;
  select public.mcp_oauth_begin_logout('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002') into ok;
  if ok then raise exception 'stale claimant began logout'; end if;
  select access_ciphertext into cipher from public.mcp_oauth_claim_logout('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002');
  if cipher is null then raise exception 'recovered task could not be claimed'; end if;
  select public.mcp_oauth_begin_logout('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000099') into ok;
  if ok then raise exception 'wrong session began logout'; end if;
  select public.mcp_oauth_begin_logout('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002') into ok;
  if not ok then raise exception 'valid claimant could not begin'; end if;
  select public.mcp_oauth_recover_logout_claim('20000000-0000-4000-8000-000000000002') into ok;
  if ok then raise exception 'sending request was retried'; end if;
  select public.mcp_oauth_finish_logout('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',false) into ok;
  if not ok or not exists(select 1 from public.mcp_oauth_grants where id='20000000-0000-4000-8000-000000000002' and upstream_logout_state='unconfirmed') then
    raise exception 'ambiguous logout was not terminal'; end if;

  select public.mcp_oauth_claim_upstream_refresh('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','client',
    'https://example.test/api/mcp/gemini','50000000-0000-4000-8000-000000000001') into cipher;
  if cipher is null then raise exception 'initial refresh claim failed'; end if;
  perform public.mcp_oauth_revoke_token(repeat('3',64),'client','https://example.test/api/mcp/gemini');
  if not exists(select 1 from public.mcp_oauth_grants where id='20000000-0000-4000-8000-000000000003' and upstream_logout_state='waiting_refresh') then
    raise exception 'in-flight refresh not marked'; end if;
  select public.mcp_oauth_claim_upstream_refresh('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','client',
    'https://example.test/api/mcp/gemini','50000000-0000-4000-8000-000000000002') into cipher;
  if cipher is not null then raise exception 'revoked grant claimed a new refresh'; end if;
  select public.mcp_oauth_complete_upstream_refresh_v2('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',
    'client','https://example.test/api/mcp/gemini','50000000-0000-4000-8000-000000000001','new-encrypted-access','new-encrypted-refresh',
    clock_timestamp()+interval '10 minutes','30000000-0000-4000-8000-000000000099') into ok;
  if ok then raise exception 'wrong session completed refresh'; end if;
  select public.mcp_oauth_complete_upstream_refresh_v2('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',
    'client','https://example.test/api/mcp/gemini','50000000-0000-4000-8000-000000000001','new-encrypted-access','new-encrypted-refresh',
    clock_timestamp()+interval '10 minutes','30000000-0000-4000-8000-000000000003') into ok;
  if not ok or not exists(select 1 from public.mcp_oauth_grants where id='20000000-0000-4000-8000-000000000003' and revoked_at is not null and upstream_logout_state='queued') then
    raise exception 'revoked refresh did not queue encrypted result'; end if;
  if exists(select 1 from public.mcp_oauth_resolve_access_v2(repeat('3',64),'client','https://example.test/api/mcp/gemini')) then
    raise exception 'completed refresh restored revoked access'; end if;
  select access_ciphertext into cipher from public.mcp_oauth_claim_logout('20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003');
  if cipher is distinct from 'new-encrypted-access' then raise exception 'logout did not use rotated encrypted access'; end if;

  perform public.mcp_oauth_claim_upstream_refresh('20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','client',
    'https://example.test/api/mcp/gemini','50000000-0000-4000-8000-000000000003');
  perform public.mcp_oauth_revoke_token(repeat('4',64),'client','https://example.test/api/mcp/gemini');
  perform public.mcp_oauth_uncertain_upstream_refresh('20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','client',
    'https://example.test/api/mcp/gemini','50000000-0000-4000-8000-000000000003');
  if not exists(select 1 from public.mcp_oauth_grants where id='20000000-0000-4000-8000-000000000004' and upstream_logout_state='unconfirmed') then
    raise exception 'ambiguous refresh did not block logout'; end if;
  perform public.mcp_oauth_revoke_token(repeat('5',64),'client','https://example.test/api/mcp/gemini');
  if not exists(select 1 from public.mcp_oauth_grants where id='20000000-0000-4000-8000-000000000005' and upstream_logout_state='no_access') then
    raise exception 'missing access credential did not block logout'; end if;
end $$;
rollback;
