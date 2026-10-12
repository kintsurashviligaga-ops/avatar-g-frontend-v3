-- 010 — what the Production-read core (scripts/lease-isolation/schema.sql) leaves out and the Video Core path needs on a
-- real Supabase stack: the profile columns the studio reads, the trace ledger, Row Level Security as Production has it,
-- and the two storage buckets. Applied by ./apply.sh to the THROWAWAY local stack inside the CI runner only.
--
-- Provenance, line by line, so nobody mistakes this for a Production dump (there is none; none was asked for):
--   · RLS on profiles / credit_ledger and the write revokes — supabase/migrations/20260929a §3–§4 (applied in Production);
--   · generation_jobs' four owner policies — 20260523 (applied); 20261001f, applied after this file, drops two of them;
--   · agent_evolution_traces — the table section of 20260528 (that migration as a whole does not replay: it needs
--     public.credits); Production holds the table (docs/handoffs/2026-10-08-production-schema-drift.md);
--   · the extra profile columns — every column the code selects from profiles (grep of .from('profiles') on this
--     branch), nullable with the defaults 20261001c names; Production's full column list was never read for this.
--   · the `renders` bucket starts public, as it was in Production before 20261009b (applied after this file).

-- ── profiles: the columns the studio and the starter grant read ────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists display_name text,
  add column if not exists metadata jsonb,
  add column if not exists role text,
  add column if not exists free_films_remaining integer default 1,
  add column if not exists free_avatar_chats_remaining integer default 3,
  add column if not exists avatar_name text,
  add column if not exists is_avatar_named boolean default false,
  add column if not exists referral_code text,
  add column if not exists referral_count integer default 0,
  add column if not exists referral_credits_earned integer default 0,
  add column if not exists referral_redeemed boolean default false,
  add column if not exists referral_used_code text;

-- ── agent_evolution_traces: the full trace row lib/observability/agentTrace.ts writes ──────────────────────────────
drop table if exists public.agent_evolution_traces;
create table public.agent_evolution_traces (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  agent_id        text not null,
  worker_kind     text not null,
  action          text,
  prompt_summary  text,
  output_summary  text,
  cost_wholesale_gel  numeric(12,4) not null default 0,
  cost_retail_gel     numeric(12,4) not null default 0,
  latency_ms      integer,
  status          text not null default 'succeeded' check (status in ('succeeded','failed','timeout')),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index agent_evolution_traces_user_time_idx on public.agent_evolution_traces (user_id, created_at desc);
alter table public.agent_evolution_traces enable row level security;
create policy agent_traces_owner_select on public.agent_evolution_traces for select using (auth.uid() = user_id);

-- ── Row Level Security, as 20260929a / 20260523 left it in Production ──────────────────────────────────────────────
alter table public.profiles enable row level security;
create policy profiles_owner_select on public.profiles for select to authenticated using (auth.uid() = id);

alter table public.credit_ledger enable row level security;
create policy credit_ledger_owner_select on public.credit_ledger for select to authenticated using (auth.uid() = user_id);

-- Money tables are written ONLY by service_role and SECURITY DEFINER functions (20260929a §4).
revoke insert, update, delete, truncate on public.profiles      from anon, authenticated;
revoke insert, update, delete, truncate on public.credit_ledger from anon, authenticated;

alter table public.generation_jobs enable row level security;
create policy generation_jobs_owner_select on public.generation_jobs for select using (auth.uid() = user_id);
create policy generation_jobs_owner_insert on public.generation_jobs for insert with check (auth.uid() = user_id);
create policy generation_jobs_owner_update on public.generation_jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy generation_jobs_owner_delete on public.generation_jobs for delete using (auth.uid() = user_id);

grant all on public.agent_evolution_traces to service_role;

-- ── Storage: `renders` as Production had it before 20261009b (public); 20261008c upserts `uploads` itself ──────────
insert into storage.buckets (id, name, public) values ('renders', 'renders', true) on conflict (id) do nothing;
