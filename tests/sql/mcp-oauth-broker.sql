-- Synthetic integration fixture: execute ONLY against a disposable test DB.
-- This exercises the service-role functions, not an OAuth HTTP server.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001');
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000050');
insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext,upstream_session_id)
values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',
        'test-client','https://mcp.example.test/api/mcp/gemini',array['mcp:read'], 'test-ciphertext','00000000-0000-4000-8000-000000000042');
insert into public.mcp_oauth_codes(code_hash,grant_id,redirect_uri,code_challenge,expires_at)
values (repeat('a',64),'00000000-0000-4000-8000-000000000002',
        'https://client.example.test/callback',repeat('c',43),clock_timestamp()+interval '1 minute');
insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext,upstream_session_id)
values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',
        'test-client','https://mcp.example.test/api/mcp/gemini',array['mcp:read'], 'test-ciphertext','00000000-0000-4000-8000-000000000043');
insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext,upstream_session_id)
values ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001',
        'test-client','https://mcp.example.test/api/mcp/gemini',array['mcp:read'], 'initial-refresh-ciphertext','00000000-0000-4000-8000-000000000044');
insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext,upstream_session_id)
values ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',
        'test-client','https://mcp.example.test/api/mcp/gemini',array['mcp:read'], 'old-ciphertext','00000000-0000-4000-8000-000000000045');
insert into public.mcp_oauth_tokens(token_hash,grant_id,kind,expires_at)
values (repeat('9',64),'00000000-0000-4000-8000-000000000003','refresh',clock_timestamp()+interval '1 day');
insert into public.mcp_oauth_pending(id,user_id,client_id,redirect_uri,resource,scopes,code_challenge,oauth_state,expires_at)
values
  ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001','test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',array['mcp:read','mcp:write'],repeat('c',43),'opaque-state',clock_timestamp()+interval '2 minutes'),
  ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',array['mcp:read'],repeat('c',43),'opaque-state',clock_timestamp()+interval '2 minutes'),
  ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001','test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',array['mcp:read'],repeat('c',43),'opaque-state',clock_timestamp()-interval '1 minute');

do $$
declare ok boolean; granted_scopes text[]; claimed text; i integer;
begin
  for i in 1..11 loop
    select public.mcp_oauth_begin_pending(('10000000-0000-4000-8000-' || lpad(to_hex(i),12,'0'))::uuid,
      '00000000-0000-4000-8000-000000000050','test-client','https://client.example.test/callback',
      'https://mcp.example.test/api/mcp/gemini',array['mcp:read'],repeat('c',43),'opaque-state') into ok;
    if ok is distinct from (i <= 10) then raise exception 'per-user pending limit failed'; end if;
  end loop;
  if has_function_privilege('anon','public.mcp_oauth_redeem_code(text,text,text,text,text,text,text)','execute') then
    raise exception 'anonymous client can redeem codes';
  end if;
  if has_table_privilege('authenticated','public.mcp_oauth_grants','select') then
    raise exception 'authenticated users can read grants';
  end if;
  if has_function_privilege('authenticated','public.mcp_oauth_revoke_token(text,text,text)','execute') then
    raise exception 'authenticated users can call revocation directly';
  end if;
  if has_table_privilege('authenticated','public.mcp_oauth_pending','select') or
     has_function_privilege('authenticated','public.mcp_oauth_decide_pending(uuid,uuid,boolean)','execute') or
     has_function_privilege('authenticated','public.mcp_oauth_deny_pending(uuid,uuid,text,text,text)','execute') or
     has_function_privilege('authenticated','public.mcp_oauth_begin_pending(uuid,uuid,text,text,text,text[],text,text)','execute') then
    raise exception 'authenticated user can access broker consent storage directly';
  end if;
  select public.mcp_oauth_begin_pending('00000000-0000-4000-8000-000000000026','00000000-0000-4000-8000-000000000001',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',
    array['mcp:read',null],repeat('c',43),'opaque-state') into ok;
  if ok then raise exception 'null scope accepted'; end if;
  select public.mcp_oauth_begin_pending('00000000-0000-4000-8000-000000000026','00000000-0000-4000-8000-000000000001',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',
    array['mcp:read'],repeat('c',43),E'bad\nstate') into ok;
  if ok then raise exception 'control character accepted in state'; end if;
  select public.mcp_oauth_begin_pending('00000000-0000-4000-8000-000000000026','00000000-0000-4000-8000-000000000001',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',
    array['mcp:read'],repeat('c',43),'opaque-state') into ok;
  if not ok or not exists (select 1 from public.mcp_oauth_pending where id='00000000-0000-4000-8000-000000000026'
    and status='pending' and expires_at <= clock_timestamp()+interval '10 minutes') then
    raise exception 'valid pending request not safely stored';
  end if;
  select public.mcp_oauth_finalize_pending('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',
    '00000000-0000-4000-8000-000000000024',repeat('7',64),'ciphertext','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000041') into ok;
  if ok then raise exception 'grant created before user approval'; end if;
  select public.mcp_oauth_decide_pending('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000099',true) into ok;
  if ok then raise exception 'wrong user approved request'; end if;
  if exists(select 1 from public.mcp_oauth_deny_pending('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000099',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini')) or
     exists(select 1 from public.mcp_oauth_deny_pending('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001',
    'wrong-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini')) or
     exists(select 1 from public.mcp_oauth_deny_pending('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001',
    'test-client','https://evil.example/callback','https://mcp.example.test/api/mcp/gemini')) or
     exists(select 1 from public.mcp_oauth_deny_pending('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001',
    'test-client','https://client.example.test/callback','https://evil.example/api/mcp/gemini')) or
     exists(select 1 from public.mcp_oauth_deny_pending('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini')) then
    raise exception 'unauthorized or expired denial returned state'; end if;
  if not exists(select 1 from public.mcp_oauth_deny_pending('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini') where oauth_state='opaque-state') then
    raise exception 'valid denial did not return bound state'; end if;
  if exists(select 1 from public.mcp_oauth_deny_pending('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini')) then
    raise exception 'denial state replay accepted'; end if;
  select public.mcp_oauth_decide_pending('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001',true) into ok;
  if ok then raise exception 'denied request approved on replay'; end if;
  select public.mcp_oauth_decide_pending('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001',true) into ok;
  if ok then raise exception 'expired request approved'; end if;
  select public.mcp_oauth_decide_pending('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',true) into ok;
  if not ok then raise exception 'valid consent rejected'; end if;
  select public.mcp_oauth_start_upstream('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000099',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',repeat('a',64),'encrypted-verifier') into ok;
  if ok then raise exception 'wrong user started upstream'; end if;
  select public.mcp_oauth_start_upstream('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',repeat('a',64),'encrypted-verifier') into ok;
  if not ok then raise exception 'approved user could not start upstream'; end if;
  if exists(select 1 from public.mcp_oauth_claim_upstream_code(repeat('b',64),'00000000-0000-4000-8000-000000000001',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000030')) then
    raise exception 'wrong state accepted'; end if;
  if exists(select 1 from public.mcp_oauth_claim_upstream_code(repeat('a',64),'00000000-0000-4000-8000-000000000099',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000030')) then
    raise exception 'wrong user claimed upstream code'; end if;
  if not exists(select 1 from public.mcp_oauth_claim_upstream_code(repeat('a',64),'00000000-0000-4000-8000-000000000001',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000030')
    where verifier_ciphertext='encrypted-verifier' and downstream_state='opaque-state') then
    raise exception 'valid upstream claim rejected'; end if;
  if exists(select 1 from public.mcp_oauth_claim_upstream_code(repeat('a',64),'00000000-0000-4000-8000-000000000001',
    'test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini','00000000-0000-4000-8000-000000000031')) then
    raise exception 'upstream state replay accepted'; end if;
  select public.mcp_oauth_finalize_pending('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',
    '00000000-0000-4000-8000-000000000024',repeat('7',64),'ciphertext','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000041') into ok;
  if ok then raise exception 'wrong upstream claim finalized'; end if;
  select public.mcp_oauth_finalize_pending('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000099','test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',
    '00000000-0000-4000-8000-000000000024',repeat('7',64),'ciphertext','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000041') into ok;
  if ok then raise exception 'wrong upstream identity accepted'; end if;
  select public.mcp_oauth_finalize_pending('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','test-client','https://evil.example/callback','https://mcp.example.test/api/mcp/gemini',
    '00000000-0000-4000-8000-000000000024',repeat('7',64),'ciphertext','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000041') into ok;
  if ok then raise exception 'changed redirect accepted'; end if;
  select public.mcp_oauth_finalize_pending('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',
    '00000000-0000-4000-8000-000000000024',repeat('7',64),'ciphertext','00000000-0000-4000-8000-000000000030',null,'00000000-0000-4000-8000-000000000041') into ok;
  if ok then raise exception 'missing upstream session accepted'; end if;
  select public.mcp_oauth_finalize_pending('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',
    '00000000-0000-4000-8000-000000000024',repeat('7',64),'ciphertext','00000000-0000-4000-8000-000000000030',
    '00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000040') into ok;
  if ok then raise exception 'identical browser and upstream sessions accepted'; end if;
  select public.mcp_oauth_finalize_pending('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',
    '00000000-0000-4000-8000-000000000024',repeat('7',64),'ciphertext','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000041') into ok;
  if not ok then raise exception 'valid consent could not create grant'; end if;
  if not exists (select 1 from public.mcp_oauth_grants where id='00000000-0000-4000-8000-000000000024' and scopes=array['mcp:read','mcp:write'] and upstream_session_id='00000000-0000-4000-8000-000000000040') or
     not exists (select 1 from public.mcp_oauth_codes where code_hash=repeat('7',64) and code_challenge=repeat('c',43)) then
    raise exception 'grant or PKCE code binding missing';
  end if;
  begin
    update public.mcp_oauth_grants set upstream_session_id='00000000-0000-4000-8000-000000000041' where id='00000000-0000-4000-8000-000000000024';
    raise exception 'session binding changed';
  exception when raise_exception then
    if sqlerrm <> 'upstream session binding is immutable' then raise; end if;
  end;
  begin
    insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext,upstream_session_id)
      values ('00000000-0000-4000-8000-000000000027','00000000-0000-4000-8000-000000000001','test-client',
        'https://mcp.example.test/api/mcp/gemini',array['mcp:read'],'ciphertext','00000000-0000-4000-8000-000000000040');
    raise exception 'upstream session reused across grants';
  exception when unique_violation then null; end;
  select public.mcp_oauth_finalize_pending('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','test-client','https://client.example.test/callback','https://mcp.example.test/api/mcp/gemini',
    '00000000-0000-4000-8000-000000000025',repeat('8',64),'ciphertext','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000041') into ok;
  if ok then raise exception 'consent reused to create another grant'; end if;
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
  if has_function_privilege('authenticated','public.mcp_oauth_resolve_access(text,text,text)','execute') then
    raise exception 'authenticated user can resolve broker grant'; end if;
  if not exists(select 1 from public.mcp_oauth_resolve_access_v2(repeat('b',64),'test-client','https://mcp.example.test/api/mcp/gemini')
    where user_id='00000000-0000-4000-8000-000000000001' and grant_id='00000000-0000-4000-8000-000000000002'
      and upstream_session_id='00000000-0000-4000-8000-000000000042') then
    raise exception 'valid access did not resolve expected user and grant'; end if;
  if exists(select 1 from public.mcp_oauth_resolve_access(repeat('b',64),'wrong-client','https://mcp.example.test/api/mcp/gemini')) or
     exists(select 1 from public.mcp_oauth_resolve_access(repeat('b',64),'test-client','https://evil.example/api/mcp/gemini')) then
    raise exception 'wrong client or resource resolved grant'; end if;
  update public.mcp_oauth_tokens set expires_at=clock_timestamp()-interval '1 second' where token_hash=repeat('b',64);
  if exists(select 1 from public.mcp_oauth_resolve_access(repeat('b',64),'test-client','https://mcp.example.test/api/mcp/gemini')) then
    raise exception 'expired bearer resolved grant'; end if;
  update public.mcp_oauth_tokens set expires_at=clock_timestamp()+interval '1 minute' where token_hash=repeat('b',64);
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
  if exists(select 1 from public.mcp_oauth_resolve_access(repeat('b',64),'test-client','https://mcp.example.test/api/mcp/gemini')) then
    raise exception 'revoked bearer resolved grant'; end if;
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
