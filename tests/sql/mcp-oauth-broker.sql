-- Synthetic integration fixture: execute ONLY against a disposable test DB.
-- This exercises the service-role functions, not an OAuth HTTP server.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001');
insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext)
values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',
        'test-client','https://mcp.example.test/api/mcp/gemini',array['mcp:read'], 'test-ciphertext');
insert into public.mcp_oauth_codes(code_hash,grant_id,redirect_uri,code_challenge,expires_at)
values (repeat('a',64),'00000000-0000-4000-8000-000000000002',
        'https://client.example.test/callback',repeat('c',43),clock_timestamp()+interval '1 minute');
insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext)
values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',
        'test-client','https://mcp.example.test/api/mcp/gemini',array['mcp:read'], 'test-ciphertext');
insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext)
values ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001',
        'test-client','https://mcp.example.test/api/mcp/gemini',array['mcp:read'], 'initial-refresh-ciphertext');
insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext)
values ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',
        'test-client','https://mcp.example.test/api/mcp/gemini',array['mcp:read'], 'old-ciphertext');
insert into public.mcp_oauth_tokens(token_hash,grant_id,kind,expires_at)
values (repeat('9',64),'00000000-0000-4000-8000-000000000003','refresh',clock_timestamp()+interval '1 day');

do $$
declare ok boolean; granted_scopes text[]; claimed text;
begin
  if has_function_privilege('anon','public.mcp_oauth_redeem_code(text,text,text,text,text,text,text)','execute') then
    raise exception 'anonymous client can redeem codes';
  end if;
  if has_table_privilege('authenticated','public.mcp_oauth_grants','select') then
    raise exception 'authenticated users can read grants';
  end if;
  if has_function_privilege('authenticated','public.mcp_oauth_revoke_token(text,text,text)','execute') then
    raise exception 'authenticated users can call revocation directly';
  end if;
  if has_function_privilege('anon','public.mcp_oauth_claim_upstream_refresh(uuid,uuid,text,text,uuid)','execute') then
    raise exception 'anonymous user can claim upstream refresh';
  end if;
  select public.mcp_oauth_claim_upstream_refresh('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000009',
    'test-client','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000006') into claimed;
  if claimed is not null then raise exception 'wrong owner claimed refresh'; end if;
  select public.mcp_oauth_claim_upstream_refresh('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001',
    'test-client','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000006') into claimed;
  if claimed is distinct from 'initial-refresh-ciphertext' then raise exception 'valid refresh claim rejected'; end if;
  select public.mcp_oauth_claim_upstream_refresh('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001',
    'test-client','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000007') into claimed;
  if claimed is not null then raise exception 'second refresh claimant accepted'; end if;
  select public.mcp_oauth_complete_upstream_refresh('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001',
    'test-client','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000007',
    'access-ciphertext','next-refresh-ciphertext',clock_timestamp()+interval '1 minute') into ok;
  if ok then raise exception 'wrong claim completed upstream refresh'; end if;
  select public.mcp_oauth_uncertain_upstream_refresh('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001',
    'test-client','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000006') into ok;
  if not ok then raise exception 'failed refresh not marked uncertain'; end if;
  select public.mcp_oauth_claim_upstream_refresh('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001',
    'test-client','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000008') into claimed;
  if claimed is not null then raise exception 'uncertain upstream credential was retried'; end if;
  select public.mcp_oauth_claim_upstream_refresh('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',
    'test-client','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000006') into claimed;
  if claimed is distinct from 'old-ciphertext' then raise exception 'new grant claim rejected'; end if;
  select public.mcp_oauth_complete_upstream_refresh('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',
    'test-client','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000006',
    'access-ciphertext','next-refresh-ciphertext',clock_timestamp()+interval '1 minute') into ok;
  if not ok then raise exception 'valid upstream refresh not completed'; end if;
  select public.mcp_oauth_claim_upstream_refresh('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',
    'test-client','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000007') into claimed;
  if claimed is distinct from 'next-refresh-ciphertext' then raise exception 'rotated credential not persisted'; end if;
  select public.mcp_oauth_redeem_code(repeat('a',64),'test-client','https://evil.example/callback',
    'https://mcp.example.test/api/mcp/gemini',repeat('c',43),repeat('b',64),repeat('d',64)) into ok;
  if ok then raise exception 'wrong redirect accepted'; end if;
  select public.mcp_oauth_redeem_code(repeat('a',64),null,'https://client.example.test/callback',
    'https://mcp.example.test/api/mcp/gemini',repeat('c',43),repeat('b',64),repeat('d',64)) into ok;
  if ok then raise exception 'null client accepted'; end if;
  select public.mcp_oauth_redeem_code(repeat('a',64),'test-client','https://client.example.test/callback',
    'https://mcp.example.test/api/mcp/gemini',repeat('c',43),repeat('b',64),repeat('d',64)) into ok;
  if not ok then raise exception 'valid code rejected'; end if;
  select public.mcp_oauth_access_scopes(repeat('b',64),'test-client','https://mcp.example.test/api/mcp/gemini') into granted_scopes;
  if granted_scopes is distinct from array['mcp:read']::text[] then raise exception 'live access scopes unavailable'; end if;
  select public.mcp_oauth_access_scopes(repeat('b',64),'wrong-client','https://mcp.example.test/api/mcp/gemini') into granted_scopes;
  if granted_scopes is not null then raise exception 'wrong client obtained scopes'; end if;
  select public.mcp_oauth_redeem_code(repeat('a',64),'test-client','https://client.example.test/callback',
    'https://mcp.example.test/api/mcp/gemini',repeat('c',43),repeat('e',64),repeat('f',64)) into ok;
  if ok then raise exception 'authorization code replay accepted'; end if;
  select public.mcp_oauth_rotate_refresh(repeat('d',64),'wrong-client',
    'https://mcp.example.test/api/mcp/gemini',repeat('e',64),repeat('f',64)) into ok;
  if ok then raise exception 'wrong client accepted'; end if;
  select public.mcp_oauth_rotate_refresh(repeat('d',64),'test-client',
    'https://mcp.example.test/api/mcp/gemini',repeat('e',64),repeat('f',64)) into ok;
  if not ok then raise exception 'valid refresh rejected'; end if;
  select public.mcp_oauth_rotate_refresh(repeat('d',64),'test-client',
    'https://mcp.example.test/api/mcp/gemini',repeat('1',64),repeat('2',64)) into ok;
  if ok then raise exception 'refresh replay accepted'; end if;
  if not exists(select 1 from public.mcp_oauth_grants where id='00000000-0000-4000-8000-000000000002' and revoked_at is not null) then
    raise exception 'replay did not revoke grant';
  end if;
  select public.mcp_oauth_access_scopes(repeat('b',64),'test-client','https://mcp.example.test/api/mcp/gemini') into granted_scopes;
  if granted_scopes is not null then raise exception 'revoked access token retained scopes'; end if;
  select public.mcp_oauth_revoke_token(repeat('9',64),'wrong-client','https://mcp.example.test/api/mcp/gemini') into ok;
  if not ok or exists(select 1 from public.mcp_oauth_grants where id='00000000-0000-4000-8000-000000000003' and revoked_at is not null) then
    raise exception 'wrong client revoked a grant';
  end if;
  select public.mcp_oauth_revoke_token(repeat('9',64),'test-client','https://wrong.example/api/mcp/gemini') into ok;
  if not ok or exists(select 1 from public.mcp_oauth_grants where id='00000000-0000-4000-8000-000000000003' and revoked_at is not null) then
    raise exception 'wrong resource revoked a grant';
  end if;
  select public.mcp_oauth_revoke_token(repeat('9',64),'test-client','https://mcp.example.test/api/mcp/gemini') into ok;
  if not ok or not exists(select 1 from public.mcp_oauth_grants where id='00000000-0000-4000-8000-000000000003' and revoked_at is not null) then
    raise exception 'valid revocation failed';
  end if;
  select public.mcp_oauth_revoke_token(repeat('9',64),'test-client','https://mcp.example.test/api/mcp/gemini') into ok;
  if not ok then raise exception 'repeated revocation not idempotent'; end if;
  select public.mcp_oauth_revoke_token(repeat('0',64),'test-client','https://mcp.example.test/api/mcp/gemini') into ok;
  if not ok then raise exception 'unknown token response not idempotent'; end if;
end $$;
rollback;
