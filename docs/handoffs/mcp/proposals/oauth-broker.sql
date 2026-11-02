-- Disabled broker foundation. No public client can read grants or redeem tokens.
-- Runtime endpoints and independent upstream Supabase OAuth must be reviewed and
-- deployed before these tables are used. Never store raw downstream bearer tokens.
create table if not exists public.mcp_oauth_grants (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (length(client_id) between 1 and 256),
  resource text not null check (length(resource) between 1 and 2048),
  scopes text[] not null check (scopes <@ array['mcp:read','mcp:write']::text[] and 'mcp:read' = any(scopes)),
  upstream_refresh_ciphertext text not null check (length(upstream_refresh_ciphertext) between 1 and 16384),
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

alter table public.mcp_oauth_grants enable row level security;
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_oauth_tokens enable row level security;
revoke all on public.mcp_oauth_grants, public.mcp_oauth_codes, public.mcp_oauth_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.mcp_oauth_grants, public.mcp_oauth_codes, public.mcp_oauth_tokens to service_role;

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

revoke all on function public.mcp_oauth_redeem_code(text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.mcp_oauth_rotate_refresh(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.mcp_oauth_revoke_token(text,text,text) from public, anon, authenticated;
grant execute on function public.mcp_oauth_redeem_code(text,text,text,text,text,text,text) to service_role;
grant execute on function public.mcp_oauth_rotate_refresh(text,text,text,text,text) to service_role;
grant execute on function public.mcp_oauth_revoke_token(text,text,text) to service_role;
