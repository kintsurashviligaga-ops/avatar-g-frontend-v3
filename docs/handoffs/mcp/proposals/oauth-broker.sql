-- Disabled broker foundation. No public client can read grants or redeem tokens.
-- Runtime endpoints and independent upstream Supabase OAuth must be reviewed and
-- deployed before these tables are used. Never store raw downstream bearer tokens.
create table if not exists public.mcp_oauth_grants (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (length(client_id) between 1 and 256),
  resource text not null check (length(resource) between 1 and 2048),
  scopes text[] not null check (array_position(scopes,null) is null and scopes <@ array['mcp:read','mcp:write']::text[] and 'mcp:read' = any(scopes)),
  upstream_refresh_ciphertext text not null check (length(upstream_refresh_ciphertext) between 1 and 16384),
  upstream_access_ciphertext text check (upstream_access_ciphertext is null or length(upstream_access_ciphertext) between 1 and 16384),
  upstream_access_expires_at timestamptz,
  upstream_refresh_state text not null default 'ready' check (upstream_refresh_state in ('ready','refreshing','uncertain')),
  upstream_refresh_claim uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.mcp_oauth_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  grant_id uuid not null references public.mcp_oauth_grants(id) on delete cascade,
  redirect_uri text not null check (length(redirect_uri) between 1 and 2048),
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table if not exists public.mcp_oauth_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  grant_id uuid not null references public.mcp_oauth_grants(id) on delete cascade,
  kind text not null check (kind in ('access','refresh')),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists mcp_oauth_tokens_grant_idx on public.mcp_oauth_tokens(grant_id);

-- Pending requests are written only after the authenticated first-party user
-- and the exact registered client, redirect, resource, scopes and PKCE have
-- been validated by the server. OAuth state is opaque; never log it.
create table if not exists public.mcp_oauth_pending (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (length(client_id) between 1 and 256),
  redirect_uri text not null check (length(redirect_uri) between 1 and 2048),
  resource text not null check (length(resource) between 1 and 2048),
  scopes text[] not null check (array_position(scopes,null) is null and scopes <@ array['mcp:read','mcp:write']::text[] and 'mcp:read' = any(scopes)),
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  oauth_state text not null check (length(oauth_state) between 1 and 1024),
  status text not null default 'pending' check (status in ('pending','approved','linking','exchanging','denied','consumed')),
  upstream_state_hash text unique check (upstream_state_hash is null or upstream_state_hash ~ '^[0-9a-f]{64}$'),
  upstream_verifier_ciphertext text check (upstream_verifier_ciphertext is null or length(upstream_verifier_ciphertext) between 1 and 16384),
  upstream_claim uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.mcp_oauth_grants enable row level security;
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_oauth_tokens enable row level security;
alter table public.mcp_oauth_pending enable row level security;
revoke all on public.mcp_oauth_grants, public.mcp_oauth_codes, public.mcp_oauth_tokens, public.mcp_oauth_pending from public, anon, authenticated;
grant select, insert, update, delete on public.mcp_oauth_grants, public.mcp_oauth_codes, public.mcp_oauth_tokens, public.mcp_oauth_pending to service_role;

-- Called only after authenticating the browser user and validating the exact
-- registered OAuth client, redirect, resource, scopes and S256 challenge.
-- A hard expiry is imposed here so the caller cannot create durable requests.
create or replace function public.mcp_oauth_begin_pending(
  p_id uuid, p_user_id uuid, p_client_id text, p_redirect_uri text,
  p_resource text, p_scopes text[], p_code_challenge text, p_oauth_state text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_id is null or p_user_id is null or p_client_id is null or p_redirect_uri is null or p_resource is null
    or p_scopes is null or p_code_challenge is null or p_oauth_state is null
    or length(p_client_id) not between 1 and 256 or length(p_redirect_uri) not between 1 and 2048
    or length(p_resource) not between 1 and 2048 or length(p_oauth_state) not between 1 and 1024
    or p_code_challenge !~ '^[A-Za-z0-9_-]{43}$' or p_oauth_state ~ '[[:cntrl:]]'
    or array_position(p_scopes,null) is not null
    or not (p_scopes <@ array['mcp:read','mcp:write']::text[]) or not ('mcp:read' = any(p_scopes)) then return false; end if;
  insert into public.mcp_oauth_pending(id,user_id,client_id,redirect_uri,resource,scopes,code_challenge,oauth_state,expires_at)
    values (p_id,p_user_id,p_client_id,p_redirect_uri,p_resource,p_scopes,p_code_challenge,p_oauth_state,clock_timestamp()+interval '10 minutes');
  return true;
end $$;

-- Called after the actual signed-in user explicitly approves or denies the
-- first-party consent page. No MCP client input can assert this decision.
create or replace function public.mcp_oauth_decide_pending(
  p_id uuid, p_user_id uuid, p_approve boolean
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_id is null or p_user_id is null or p_approve is null then return false; end if;
  update public.mcp_oauth_pending set status = case when p_approve then 'approved' else 'denied' end
    where id = p_id and user_id = p_user_id and status = 'pending' and expires_at > clock_timestamp();
  return found;
end $$;

-- State and PKCE verifier are independently generated for the upstream
-- provider. Store only the hash of state and an authenticated encrypted
-- verifier; require this exact approved user and current registered client.
create or replace function public.mcp_oauth_start_upstream(
  p_id uuid, p_user_id uuid, p_client_id text, p_redirect_uri text, p_resource text,
  p_state_hash text, p_verifier_ciphertext text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' or p_verifier_ciphertext is null
    or length(p_verifier_ciphertext) not between 1 and 16384 then return false; end if;
  update public.mcp_oauth_pending set status='linking',upstream_state_hash=p_state_hash,
    upstream_verifier_ciphertext=p_verifier_ciphertext
    where id=p_id and user_id=p_user_id and client_id=p_client_id and redirect_uri=p_redirect_uri
      and resource=p_resource and status='approved' and expires_at>clock_timestamp();
  return found;
end $$;

-- Atomically burn state before contacting the upstream token endpoint. A crash
-- or ambiguous token response requires a fresh authorization, never a retry.
create or replace function public.mcp_oauth_claim_upstream_code(
  p_state_hash text, p_user_id uuid, p_client_id text, p_redirect_uri text, p_resource text, p_claim uuid
) returns table(pending_id uuid, verifier_ciphertext text, downstream_state text)
language plpgsql security invoker set search_path = '' as $$
begin
  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' or p_claim is null then return; end if;
  return query update public.mcp_oauth_pending p set status='exchanging',upstream_claim=p_claim
    where p.upstream_state_hash=p_state_hash and p.user_id=p_user_id and p.client_id=p_client_id
      and p.redirect_uri=p_redirect_uri and p.resource=p_resource and p.status='linking' and p.expires_at>clock_timestamp()
    returning p.id,p.upstream_verifier_ciphertext,p.oauth_state;
end $$;

-- Caller MUST authenticate the browser user, validate current client config,
-- verify the independent upstream OAuth JWT's signature, issuer, audience,
-- client and subject, then encrypt its refresh token bound to this new grant.
-- SQL cannot verify those upstream claims. This operation atomically creates
-- the grant and single-use code only for an approved, same-user request.
create or replace function public.mcp_oauth_finalize_pending(
  p_id uuid, p_user_id uuid, p_verified_upstream_user_id uuid,
  p_client_id text, p_redirect_uri text, p_resource text,
  p_grant_id uuid, p_code_hash text, p_upstream_refresh_ciphertext text, p_claim uuid
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare pending public.mcp_oauth_pending%rowtype;
begin
  if p_id is null or p_user_id is null or p_verified_upstream_user_id is distinct from p_user_id
    or p_grant_id is null or p_claim is null or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$'
    or p_upstream_refresh_ciphertext is null or length(p_upstream_refresh_ciphertext) not between 1 and 16384 then return false; end if;
  select * into pending from public.mcp_oauth_pending where id = p_id for update;
  if not found or pending.user_id is distinct from p_user_id or pending.status <> 'exchanging' or pending.upstream_claim is distinct from p_claim
    or pending.expires_at <= clock_timestamp() or pending.client_id is distinct from p_client_id
    or pending.redirect_uri is distinct from p_redirect_uri or pending.resource is distinct from p_resource then return false; end if;
  insert into public.mcp_oauth_grants(id,user_id,client_id,resource,scopes,upstream_refresh_ciphertext)
    values (p_grant_id,pending.user_id,pending.client_id,pending.resource,pending.scopes,p_upstream_refresh_ciphertext);
  insert into public.mcp_oauth_codes(code_hash,grant_id,redirect_uri,code_challenge,expires_at)
    values (p_code_hash,p_grant_id,pending.redirect_uri,pending.code_challenge,
      least(pending.expires_at,clock_timestamp()+interval '2 minutes'));
  update public.mcp_oauth_pending set status = 'consumed', upstream_verifier_ciphertext=null,upstream_claim=null where id = p_id;
  return true;
end $$;

-- An upstream OAuth refresh can rotate the stored credential. Claiming changes
-- ready -> refreshing before the network call. No lease timeout or retry is
-- allowed: after a crash the grant remains unusable until explicitly re-linked.
-- The caller supplies an unpredictable claim UUID and encrypts all credentials.
create or replace function public.mcp_oauth_claim_upstream_refresh(
  p_grant_id uuid, p_user_id uuid, p_client_id text, p_resource text, p_claim_id uuid
) returns text language plpgsql security invoker set search_path = '' as $$
declare previous text;
begin
  if p_claim_id is null then return null; end if;
  update public.mcp_oauth_grants set upstream_refresh_state = 'refreshing', upstream_refresh_claim = p_claim_id
    where id = p_grant_id and user_id = p_user_id and client_id = p_client_id and resource = p_resource
      and revoked_at is null and upstream_refresh_state = 'ready'
    returning upstream_refresh_ciphertext into previous;
  return previous;
end $$;

-- Only the claimant can commit the complete encrypted result. If persistence
-- fails after the upstream service rotated its token, do not retry: the row
-- remains refreshing and requires re-linking.
create or replace function public.mcp_oauth_complete_upstream_refresh(
  p_grant_id uuid, p_user_id uuid, p_client_id text, p_resource text, p_claim_id uuid,
  p_access_ciphertext text, p_refresh_ciphertext text, p_access_expires_at timestamptz
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_claim_id is null or p_access_ciphertext is null or p_refresh_ciphertext is null
    or length(p_access_ciphertext) not between 1 and 16384 or length(p_refresh_ciphertext) not between 1 and 16384
    or p_access_expires_at is null or p_access_expires_at <= clock_timestamp() then return false; end if;
  update public.mcp_oauth_grants set upstream_refresh_state = 'ready', upstream_refresh_claim = null,
    upstream_access_ciphertext = p_access_ciphertext, upstream_refresh_ciphertext = p_refresh_ciphertext,
    upstream_access_expires_at = p_access_expires_at
    where id = p_grant_id and user_id = p_user_id and client_id = p_client_id and resource = p_resource
      and revoked_at is null and upstream_refresh_state = 'refreshing' and upstream_refresh_claim = p_claim_id;
  return found;
end $$;

-- Failure is terminal for this upstream credential: no stale refresh retry.
create or replace function public.mcp_oauth_uncertain_upstream_refresh(
  p_grant_id uuid, p_user_id uuid, p_client_id text, p_resource text, p_claim_id uuid
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.mcp_oauth_grants set upstream_refresh_state = 'uncertain', upstream_refresh_claim = null,
    upstream_access_ciphertext = null, upstream_access_expires_at = null
    where id = p_grant_id and user_id = p_user_id and client_id = p_client_id and resource = p_resource
      and upstream_refresh_state = 'refreshing' and upstream_refresh_claim = p_claim_id;
  return found;
end $$;

-- Called only after the token endpoint authenticates the confidential client
-- and computes the S256 challenge from its verifier. The locked code and grant
-- bind redemption to the exact client, redirect and resource; any failed insert
-- rolls the transaction back rather than burning the code.
create or replace function public.mcp_oauth_redeem_code(
  p_code_hash text, p_client_id text, p_redirect_uri text, p_resource text,
  p_s256_challenge text, p_access_hash text, p_refresh_hash text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare c public.mcp_oauth_codes%rowtype; g public.mcp_oauth_grants%rowtype;
begin
  select * into c from public.mcp_oauth_codes where code_hash = p_code_hash for update;
  if not found then return false; end if;
  select * into g from public.mcp_oauth_grants where id = c.grant_id for update;
  if not found or g.revoked_at is not null or g.client_id is distinct from p_client_id or g.resource is distinct from p_resource
    or c.redirect_uri is distinct from p_redirect_uri or c.code_challenge is distinct from p_s256_challenge
    or c.consumed_at is not null or c.expires_at <= clock_timestamp() then return false; end if;
  update public.mcp_oauth_codes set consumed_at = clock_timestamp() where code_hash = p_code_hash;
  insert into public.mcp_oauth_tokens(token_hash, grant_id, kind, expires_at)
  values (p_access_hash, g.id, 'access', clock_timestamp() + interval '10 minutes'),
         (p_refresh_hash, g.id, 'refresh', clock_timestamp() + interval '30 days');
  return true;
end $$;

-- The refresh token is locked before rotation. A second use of a previously
-- consumed refresh token revokes the entire grant, including access tokens.
-- The caller MUST authenticate the client before invoking this operation.
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
    update public.mcp_oauth_grants set revoked_at = clock_timestamp() where id = g.id and revoked_at is null;
    return false;
  end if;
  if t.expires_at <= clock_timestamp() then return false; end if;
  update public.mcp_oauth_tokens set used_at = clock_timestamp() where token_hash = p_refresh_hash;
  insert into public.mcp_oauth_tokens(token_hash, grant_id, kind, expires_at)
  values (p_access_hash, g.id, 'access', clock_timestamp() + interval '10 minutes'),
         (p_next_refresh_hash, g.id, 'refresh', clock_timestamp() + interval '30 days');
  return true;
end $$;

-- Idempotent RFC 7009-style local revocation. The client must be authenticated
-- by the caller before invoking this function; unknown/mismatched tokens still
-- return success and never revoke another client's grant. Upstream Supabase
-- revocation is a separate operation that the future broker must implement.
create or replace function public.mcp_oauth_revoke_token(
  p_token_hash text, p_client_id text, p_resource text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare t public.mcp_oauth_tokens%rowtype; g public.mcp_oauth_grants%rowtype;
begin
  select * into t from public.mcp_oauth_tokens where token_hash = p_token_hash for update;
  if not found then return true; end if;
  select * into g from public.mcp_oauth_grants where id = t.grant_id for update;
  if not found or g.client_id is distinct from p_client_id or g.resource is distinct from p_resource then return true; end if;
  update public.mcp_oauth_grants set revoked_at = coalesce(revoked_at, clock_timestamp()) where id = g.id;
  return true;
end $$;

-- Return granted scopes only for a live access token issued to this client and
-- resource. No user identity or upstream credential is returned to the caller.
create or replace function public.mcp_oauth_access_scopes(
  p_access_hash text, p_client_id text, p_resource text
) returns text[] language sql stable security invoker set search_path = '' as $$
  select g.scopes from public.mcp_oauth_tokens t
  join public.mcp_oauth_grants g on g.id = t.grant_id
  where t.token_hash = p_access_hash and t.kind = 'access' and t.expires_at > statement_timestamp()
    and g.revoked_at is null and g.client_id = p_client_id and g.resource = p_resource
  limit 1
$$;

-- Service-only lookup; the bearer itself is never stored. A caller must verify
-- the returned upstream credential cryptographically before using it for RLS.
-- Recheck this lookup after any network refresh to observe expiry/revocation.
create or replace function public.mcp_oauth_resolve_access(
  p_access_hash text, p_client_id text, p_resource text
) returns table(grant_id uuid, user_id uuid, scopes text[], access_ciphertext text, access_expires_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select g.id,g.user_id,g.scopes,g.upstream_access_ciphertext,g.upstream_access_expires_at
  from public.mcp_oauth_tokens t join public.mcp_oauth_grants g on g.id=t.grant_id
  where t.token_hash=p_access_hash and t.kind='access' and t.expires_at>statement_timestamp()
    and t.used_at is null and g.revoked_at is null and g.client_id=p_client_id and g.resource=p_resource
    and g.upstream_refresh_state='ready' and 'mcp:read'=any(g.scopes)
  limit 1
$$;

revoke all on function public.mcp_oauth_redeem_code(text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.mcp_oauth_rotate_refresh(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.mcp_oauth_revoke_token(text,text,text) from public, anon, authenticated;
revoke all on function public.mcp_oauth_access_scopes(text,text,text) from public, anon, authenticated;
revoke all on function public.mcp_oauth_resolve_access(text,text,text) from public, anon, authenticated;
revoke all on function public.mcp_oauth_decide_pending(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.mcp_oauth_begin_pending(uuid,uuid,text,text,text,text[],text,text) from public, anon, authenticated;
revoke all on function public.mcp_oauth_start_upstream(uuid,uuid,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.mcp_oauth_claim_upstream_code(text,uuid,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.mcp_oauth_finalize_pending(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.mcp_oauth_redeem_code(text,text,text,text,text,text,text) to service_role;
grant execute on function public.mcp_oauth_rotate_refresh(text,text,text,text,text) to service_role;
grant execute on function public.mcp_oauth_revoke_token(text,text,text) to service_role;
grant execute on function public.mcp_oauth_access_scopes(text,text,text) to service_role;
grant execute on function public.mcp_oauth_resolve_access(text,text,text) to service_role;
grant execute on function public.mcp_oauth_decide_pending(uuid,uuid,boolean) to service_role;
grant execute on function public.mcp_oauth_begin_pending(uuid,uuid,text,text,text,text[],text,text) to service_role;
grant execute on function public.mcp_oauth_start_upstream(uuid,uuid,text,text,text,text,text) to service_role;
grant execute on function public.mcp_oauth_claim_upstream_code(text,uuid,text,text,text,uuid) to service_role;
grant execute on function public.mcp_oauth_finalize_pending(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid) to service_role;
revoke all on function public.mcp_oauth_claim_upstream_refresh(uuid,uuid,text,text,uuid) from public, anon, authenticated;
revoke all on function public.mcp_oauth_complete_upstream_refresh(uuid,uuid,text,text,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.mcp_oauth_uncertain_upstream_refresh(uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.mcp_oauth_claim_upstream_refresh(uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.mcp_oauth_complete_upstream_refresh(uuid,uuid,text,text,uuid,text,text,timestamptz) to service_role;
grant execute on function public.mcp_oauth_uncertain_upstream_refresh(uuid,uuid,text,text,uuid) to service_role;
