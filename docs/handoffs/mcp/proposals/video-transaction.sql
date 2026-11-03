-- DESIGN PROTOTYPE ONLY. Do not apply to any shared database or enable a route.
-- The real production project is not accessible through the present connector;
-- the ledger assumptions below come from 20261002d, not live verification.
-- This does not implement a worker, media authorization, provider policy,
-- completion, retries, or refunds; therefore it is NOT a deployable migration.
-- It demonstrates the transaction boundary with a synthetic ledger fixture.

create table public.mcp_video_jobs_prototype (
  approval_id uuid primary key references public.mcp_generation_approvals(id),
  user_id uuid not null,
  request jsonb not null,
  charge_ref text not null unique,
  created_at timestamptz not null default now()
);
alter table public.mcp_video_jobs_prototype enable row level security;
revoke all on public.mcp_video_jobs_prototype from public, anon, authenticated;

-- Service callers must authenticate the user/client, verify avatar ownership,
-- price, and bind the hash before invoking this prototype. This function
-- repeats the stored approval binding, claims it once, and keeps debit and
-- queue insertion in the same transaction. An exception rolls them all back.
create function public.mcp_video_enqueue_prototype(
  p_approval uuid, p_user uuid, p_client text, p_hash text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.mcp_generation_approvals%rowtype;
  debit jsonb;
  ref text;
begin
  select * into a from public.mcp_generation_approvals where id = p_approval for update;
  if not found or a.user_id is distinct from p_user or a.client_id is distinct from p_client
     or a.request_hash is distinct from p_hash then
    raise exception 'invalid_approval';
  end if;
  -- Replays may return the existing job, but only for the original identity.
  if a.state = 'consumed' and exists (
    select 1 from public.mcp_video_jobs_prototype j where j.approval_id = a.id and j.user_id = a.user_id
  ) then return a.id; end if;
  if a.state <> 'approved' or a.expires_at <= clock_timestamp()
     or a.request->>'kind' is distinct from 'video' or a.quoted_credits <= 0 then
    raise exception 'invalid_approval';
  end if;
  ref := 'mcp-video:' || a.id::text;
  debit := public.deduct_credits_once(a.user_id, a.quoted_credits, ref);
  if (debit->>'charged') is distinct from 'true' then raise exception 'debit_not_created'; end if;
  insert into public.mcp_video_jobs_prototype (approval_id, user_id, request, charge_ref)
    values (a.id, a.user_id, a.request, ref);
  update public.mcp_generation_approvals set state = 'consumed', consumed_at = clock_timestamp() where id = a.id;
  return a.id;
end $$;
revoke all on function public.mcp_video_enqueue_prototype(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.mcp_video_enqueue_prototype(uuid, uuid, text, text) to service_role;
