-- REVIEW-ONLY: isolated state-machine prototype; never apply to a shared DB.
-- Requires video-transaction.sql. This is not a worker, provider integration,
-- refund implementation or authorization to send any avatar to a provider.
-- A worker must verify owner, media, consent, pricing and provider policy again.
-- A crashed submission is intentionally stuck until reconciled by an operator:
-- no provider idempotency guarantee has been verified.

alter table public.mcp_video_jobs_prototype
  add column state text not null default 'queued' check (state in ('queued','claimed','submitting','submitted','uncertain')),
  add column lease_id uuid,
  add column lease_until timestamptz,
  add column provider_operation text check (provider_operation is null or length(provider_operation) between 1 and 2048);

-- A queued job or an expired *pre-submit* claim may be claimed. The caller's
-- random lease is required for every later transition, so stale workers lose.
create function public.mcp_video_claim_prototype(p_job uuid, p_lease uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_job is null or p_lease is null then return false; end if;
  update public.mcp_video_jobs_prototype set state='claimed', lease_id=p_lease, lease_until=clock_timestamp()+interval '60 seconds'
  where approval_id=p_job and (state='queued' or (state='claimed' and lease_until<=clock_timestamp()));
  return found;
end $$;

-- The irreversible boundary is persisted before network I/O. Neither expired
-- lease nor a retry may reset submitting; a crash is ambiguous until reconciled.
create function public.mcp_video_begin_submit_prototype(p_job uuid,p_lease uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_job is null or p_lease is null then return false; end if;
  update public.mcp_video_jobs_prototype set state='submitting', lease_until=null
  where approval_id=p_job and state='claimed' and lease_id=p_lease and lease_until>clock_timestamp();
  return found;
end $$;

-- Only the submission owner may record the provider operation. Late or
-- conflicting replies do not change the operation or schedule another call.
create function public.mcp_video_record_submit_prototype(p_job uuid,p_lease uuid,p_operation text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_job is null or p_lease is null or p_operation is null or length(p_operation) not between 1 and 2048
     or p_operation ~ '[[:cntrl:]]' then return false; end if;
  update public.mcp_video_jobs_prototype set state='submitted',provider_operation=p_operation
  where approval_id=p_job and state='submitting' and lease_id=p_lease;
  return found;
end $$;

-- Network errors are not proof that a provider failed to start the job.
create function public.mcp_video_uncertain_submit_prototype(p_job uuid,p_lease uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_job is null or p_lease is null then return false; end if;
  update public.mcp_video_jobs_prototype set state='uncertain'
  where approval_id=p_job and state='submitting' and lease_id=p_lease;
  return found;
end $$;

revoke all on function public.mcp_video_claim_prototype(uuid,uuid) from public, anon, authenticated;
revoke all on function public.mcp_video_begin_submit_prototype(uuid,uuid) from public, anon, authenticated;
revoke all on function public.mcp_video_record_submit_prototype(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.mcp_video_uncertain_submit_prototype(uuid,uuid) from public, anon, authenticated;
grant execute on function public.mcp_video_claim_prototype(uuid,uuid) to service_role;
grant execute on function public.mcp_video_begin_submit_prototype(uuid,uuid) to service_role;
grant execute on function public.mcp_video_record_submit_prototype(uuid,uuid,text) to service_role;
grant execute on function public.mcp_video_uncertain_submit_prototype(uuid,uuid) to service_role;
grant select,update on public.mcp_video_jobs_prototype to service_role;
