-- v5.1 Phase 5 (M-5, M-9): versioned price book, provider cost record, daily reconciliation reports.
--
-- STATUS: PREPARED, NOT APPLIED. This file lives in docs/, NOT supabase/migrations/, so no deploy or CI step can run
-- it. GG runs it in the SQL editor of the production project (zwksnayknzggdcenqqxy) only after the database is back,
-- after a dry run on the staging project (D-14), and after reading it. Claude never runs production SQL.
--
-- Purely ADDITIVE: three new tables, no change to credit_ledger, profiles, the canonical RPCs or the BOG tables, and
-- nothing at all on the legacy public.credits ledger (B-02: untouched until GG's 01_introspect.sql output).
-- Idempotent: safe to run twice. Rollback: 20261114a_phase5_money.rollback.sql (drops only what this file creates).
-- Every table is service-role only (RLS on, no policies): prices, costs and reconciliation are never read by a browser.

begin;

create extension if not exists btree_gist;

-- ── 1. price_versions: one provider price of one (capability, model, unit) for a time window ─────────────────────────
create table if not exists public.price_versions (
  id               text primary key check (id ~ '^pv_[a-z0-9_]{2,60}$'),
  capability       text not null check (length(capability) between 1 and 80),
  model            text not null check (length(model) between 1 and 120),
  unit             text not null check (unit in ('input_mtok','output_mtok','second','kchar','minute','image','call')),
  usd_per_unit     numeric(14,6) not null check (usd_per_unit > 0),
  credits_per_unit numeric(14,4) not null check (credits_per_unit > 0),
  valid_from       timestamptz not null,
  valid_to         timestamptz,
  source_url       text not null check (source_url ~ '^https://[^[:space:]]+$'),
  fetched_at       timestamptz not null,
  approved_by      text check (approved_by is null or length(btrim(approved_by)) > 0),
  approved_at      timestamptz,
  promo            boolean not null default false,
  note             text,
  created_at       timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from),
  check (not promo or valid_to is not null),
  check ((approved_by is null) = (approved_at is null))
);

-- Two APPROVED rows for the same key may never be live at the same moment (the app also refuses an overlap: fail closed).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'price_versions_no_overlap') then
    alter table public.price_versions add constraint price_versions_no_overlap
      exclude using gist (
        capability with =, model with =, unit with =,
        tstzrange(valid_from, coalesce(valid_to, 'infinity'::timestamptz), '[)') with &&
      ) where (approved_by is not null);
  end if;
end $$;

create index if not exists price_versions_key_idx on public.price_versions (capability, model, unit, valid_from desc);

-- An approved price is history: its id, numbers, window start, source and approver never change (provider_costs and
-- every quote name it by id). Only valid_to may be set,
-- once, from null (to end it when the next price starts). A wrong approved row is ended and replaced, never edited.
create or replace function public.price_versions_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.approved_by is not null then raise exception 'price_versions: an approved price is never deleted (end it with valid_to)'; end if;
    return old;
  end if;
  if old.approved_by is not null then
    if new.id is distinct from old.id or new.capability is distinct from old.capability or new.model is distinct from old.model or new.unit is distinct from old.unit
       or new.usd_per_unit is distinct from old.usd_per_unit or new.credits_per_unit is distinct from old.credits_per_unit
       or new.valid_from is distinct from old.valid_from or new.source_url is distinct from old.source_url
       or new.fetched_at is distinct from old.fetched_at or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at or new.promo is distinct from old.promo then
      raise exception 'price_versions: an approved price is immutable (only valid_to may be set, once)';
    end if;
    if old.valid_to is not null and new.valid_to is distinct from old.valid_to then
      raise exception 'price_versions: valid_to is already set';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists price_versions_guard on public.price_versions;
create trigger price_versions_guard before update or delete on public.price_versions
  for each row execute function public.price_versions_guard();

-- ── 2. provider_costs: what Google billed us for one settled call (one row per ledger ref) ───────────────────────────
create table if not exists public.provider_costs (
  ref               text primary key check (ref ~ '^[a-z0-9][a-z0-9:_-]{2,150}$'),
  user_id           uuid not null references auth.users(id) on delete cascade,
  capability        text not null,
  model             text not null,
  price_version_ids text[] not null default '{}',
  usd               numeric(14,6) not null check (usd >= 0),
  credits_charged   integer not null check (credits_charged >= 0),
  billed_on_failure boolean not null default false,
  loss              boolean not null default false,
  loss_reason       text check (loss_reason is null or length(loss_reason) <= 200),
  created_at        timestamptz not null default now(),
  check (not loss or loss_reason is not null)
);
create index if not exists provider_costs_day_cap_idx on public.provider_costs (((timezone('UTC', created_at))::date), capability);  -- UTC day, same as the billing export
create index if not exists provider_costs_user_idx on public.provider_costs (user_id, created_at desc);

-- ── 3. reconcile_reports: the daily Cloud Billing export vs provider_costs, per capability (read-only report) ──────────
create table if not exists public.reconcile_reports (
  day            date not null,
  capability     text not null,  -- '_unlabeled' for spend without a capability label, '_total' for the day
  billed_usd     numeric(14,6) not null default 0,
  recorded_usd   numeric(14,6) not null default 0,
  drift          numeric(8,6),
  alarms         jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  primary key (day, capability)
);

-- ── 4. Locks: service role only ──────────────────────────────────────────────────────────────────────────────────────
alter table public.price_versions    enable row level security;
alter table public.provider_costs    enable row level security;
alter table public.reconcile_reports enable row level security;
revoke all on public.price_versions, public.provider_costs, public.reconcile_reports from anon, authenticated;
grant select, insert, update, delete on public.price_versions to service_role;  -- delete: drafts only (the trigger refuses an approved row)
grant select, insert on public.provider_costs, public.reconcile_reports to service_role;
grant update on public.reconcile_reports to service_role;
revoke all on function public.price_versions_guard() from public, anon, authenticated;

-- ── 5. VERIFY (raises, and so rolls back, if anything above did not take) ────────────────────────────────────────────
do $$
begin
  if to_regclass('public.price_versions') is null or to_regclass('public.provider_costs') is null or to_regclass('public.reconcile_reports') is null then
    raise exception 'VERIFY: a Phase 5 table is missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'price_versions_no_overlap') then raise exception 'VERIFY: overlap guard missing'; end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname in ('price_versions','provider_costs','reconcile_reports') and not c.relrowsecurity) then
    raise exception 'VERIFY: RLS is off on a Phase 5 table';
  end if;
  if has_table_privilege('authenticated', 'public.provider_costs', 'select') or has_table_privilege('anon', 'public.price_versions', 'select') then
    raise exception 'VERIFY: a client role can read a Phase 5 table';
  end if;
end $$;

commit;
