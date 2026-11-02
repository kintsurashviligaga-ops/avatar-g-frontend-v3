-- A first-party approval is bound to one user, OAuth client, exact request and
-- price. Only the server's service role may read or change these rows.
create table if not exists public.mcp_generation_approvals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null check (length(client_id) between 1 and 256),
  request jsonb not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  quoted_credits integer not null check (quoted_credits >= 0),
  state text not null default 'pending' check (state in ('pending', 'approved', 'consumed', 'denied')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  approved_at timestamptz,
  consumed_at timestamptz
);
alter table public.mcp_generation_approvals enable row level security;
revoke all on table public.mcp_generation_approvals from public, anon, authenticated;
grant select, insert, update, delete on table public.mcp_generation_approvals to service_role;
create index if not exists mcp_generation_approvals_user_expiry_idx
  on public.mcp_generation_approvals (user_id, expires_at);
