-- 20260929a_p0_lockdown_public_access.sql
--
-- P0, found 2026-09-29 while preparing the Higgsfield billing saga (docs/AUDIT_2026-09.md).
--
-- Anyone holding the PUBLIC anon key — it ships in every page's JavaScript — could:
--   * call add_credits / refund_credits / credit_wallet_gel and mint unlimited credits for any account
--     (add_credits does not even write the ledger — it UPDATEs profiles.credits_balance directly);
--   * call deduct_credits / consume_free_* with ANY p_user_id and drain other people's balances;
--   * call promote_agent_config / rollback_agent_config and rewrite the production agents' prompts;
--   * read, insert, update and delete every row of profiles and credit_ledger — an anonymous request read
--     all 39 profiles and all 146 ledger rows on 2026-09-29 — plus jobs, job_steps, artifacts and
--     project_intelligence; and UPDATE any row of avatar_builder_jobs / image_architect_jobs.
--
-- Two causes:
--   1. SECURITY DEFINER functions keep Postgres's default `EXECUTE … TO PUBLIC`, and none of these checks
--      auth.uid() — they trust the p_user_id they are handed.
--   2. The policies named "Service role full access …" were created without `TO service_role`, so they
--      apply to PUBLIC. service_role has BYPASSRLS and never needed them.
--
-- Every write the app makes to these tables goes through createServiceRoleClient() — verified call site by
-- call site before writing this file. The reads a signed-in user makes of their OWN rows (balance, avatar,
-- job status) get owner-scoped policies below. `anon` keeps SELECT privilege on profiles on purpose: with no
-- anon policy it simply sees zero rows, which keeps /api/services/health's `select id limit 1` probe green.
--
-- ⚠️ NEVER write `CREATE POLICY … USING (true)` without `TO service_role`, and REVOKE EXECUTE FROM PUBLIC,
-- anon, authenticated on every new SECURITY DEFINER function. supabase/migrations/migrationSecurity.test.ts
-- enforces both for every migration from this one on.

begin;

-- 0. credit_wallet_gel existed TWICE, and every call the app made since 2026-08-02 failed.
--
--    20260523 created credit_wallet_gel(uuid, numeric, text) → integer (1 GEL = 1 credit). 20260802 meant to
--    REPLACE it with the 1 GEL = 10 credits version, but `CREATE OR REPLACE` with an added
--    `p_reason text DEFAULT 'purchase'` parameter is a different signature — it created a SECOND overload.
--    lib/billing/wallet-ledger.ts calls it with three named arguments, which both overloads accept, so
--    PostgREST answers 300 PGRST203 "Could not choose the best candidate function" (probed live
--    2026-09-29) and creditWalletGel() returns null. That is the crediting path of the Stripe and BOG
--    webhooks, Apple IAP, and the film / music-video partial-failure refunds: all silent no-ops.
--
--    One function, the intended denomination (1 credit = 0.10 GEL), idempotent on wallet_topups.ref via
--    ON CONFLICT (atomic, unlike the EXISTS-then-INSERT it replaces), ledger-insert only (the AFTER INSERT
--    trigger moves the balance — an explicit UPDATE here pays twice, see 20260802b), returns the new
--    balance as an integer because every TypeScript caller expects a number.
drop function if exists public.credit_wallet_gel(uuid, numeric, text);
drop function if exists public.credit_wallet_gel(uuid, numeric, text, text);

create function public.credit_wallet_gel(
  p_user_id uuid,
  p_amount  numeric,
  p_ref     text,
  p_reason  text default 'purchase'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
begin
  if p_user_id is not null and p_amount is not null and p_amount > 0 and coalesce(p_ref, '') <> '' then
    insert into public.wallet_topups (ref, user_id, amount_gel)
    values (p_ref, p_user_id, p_amount)
    on conflict (ref) do nothing;

    if found then
      insert into public.credit_ledger (user_id, delta, reason, metadata)
      values (p_user_id, floor(p_amount * 10)::integer, coalesce(p_reason, 'purchase'),
              jsonb_build_object('source', 'wallet_topup', 'ref', p_ref, 'amount_gel', p_amount, 'rate', 10));
    end if;
  end if;

  select credits_balance into v_balance from public.profiles where id = p_user_id;
  return coalesce(v_balance, 0);
end;
$$;

revoke execute on function public.credit_wallet_gel(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.credit_wallet_gel(uuid, numeric, text, text) to service_role;

-- 1. Functions that move money, rewrite config or touch other users' rows: service_role only.
--    A loop over pg_proc so every overload of every name is covered.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and p.proname in (
        'add_credits', 'refund_credits', 'credit_wallet_gel', 'deduct_credits',
        'consume_free_avatar_chat', 'consume_free_film', 'restore_free_avatar_chat', 'restore_free_film',
        'set_avatar_name', 'promote_agent_config', 'rollback_agent_config',
        'claim_render_job', 'fetch_next_render_job', 'get_render_job_status', 'retry_render_job',
        'set_render_job_progress', 'requeue_stale_jobs', 'claim_next_music_job',
        'prune_active_visitors', 'purge_expired_trashed_chats'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end
$$;

-- 2. The policies that were meant for service_role but were granted to everyone.
drop policy if exists "Service role full access profiles"            on public.profiles;
drop policy if exists "Service role full access credits"             on public.credit_ledger;
drop policy if exists "Service role full access jobs"                on public.jobs;
drop policy if exists "Service role full access job_steps"           on public.job_steps;
drop policy if exists "Service role full access artifacts"           on public.artifacts;
drop policy if exists "Service role full access intelligence"        on public.project_intelligence;
drop policy if exists "Service role can update avatar_builder_jobs"  on public.avatar_builder_jobs;
drop policy if exists "Service role can update image_architect_jobs" on public.image_architect_jobs;

-- 3. Owner-scoped replacements for what the app really does with a user session:
--    profiles  — ChatChrome reads its own avatar_url; /api/credits/balance and getProfile() read own row.
--    credit_ledger — a user may read their own history (nothing writes it with a user session).
--    jobs      — lib/jobs/jobs.ts, /api/jobs, /api/avatar/generate and hooks/useJobStatus create, update
--                and poll the caller's own jobs with a user session; each insert sets user_id = auth user.
drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists credit_ledger_owner_select on public.credit_ledger;
create policy credit_ledger_owner_select on public.credit_ledger
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists jobs_owner_select on public.jobs;
create policy jobs_owner_select on public.jobs
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists jobs_owner_insert on public.jobs;
create policy jobs_owner_insert on public.jobs
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists jobs_owner_update on public.jobs;
create policy jobs_owner_update on public.jobs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Belt and braces: money tables are written ONLY by service_role and SECURITY DEFINER functions,
--    so a future permissive policy cannot silently re-open them.
revoke insert, update, delete, truncate on public.profiles      from anon, authenticated;
revoke insert, update, delete, truncate on public.credit_ledger from anon, authenticated;
revoke insert, update, delete, truncate on public.wallet_topups from anon, authenticated;

-- 5. music_jobs had row level security switched OFF entirely.
alter table public.music_jobs enable row level security;

commit;
