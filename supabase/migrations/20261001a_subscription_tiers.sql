-- 20261001a_subscription_tiers.sql — the database side of subscription tiers (lib/billing/tiers.ts).
--
-- ⚠️ NOT APPLIED. Written 2026-10-01 against the LIVE shape read from pg_catalog / information_schema on project
-- zwksnayknzggdcenqqxy (read-only). Apply it as step 3 of the activation checklist in docs/billing/TIERS.md — and
-- BEFORE any STRIPE_PRICE_<TIER> is set, because the webhook's grant calls the function defined here.
-- Then run `node scripts/check-db-exposure.mjs`.
--
-- Additive and re-runnable: CREATE … IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, guarded DO blocks, CREATE OR REPLACE
-- of a function with an unchanged signature. A VERIFY block at the end raises (and rolls everything back) if a
-- money guarantee did not take.
--
-- What the live database looked like when this was written:
--   · public.subscriptions DOES NOT EXIST. Three repo migrations disagree about it (001_stripe_subscriptions,
--     004_saas_billing_credits, 20260214_avatar_g_saas) and none was ever applied. Every subscriptions read/write in
--     the app today fails — see "known money bugs" in docs/billing/TIERS.md. This file creates it in the 001 shape
--     (the one lib/stripe/subscriptions.ts writes) plus `tier`, and tolerates the other two shapes if present.
--   · public.webhook_events, user_profiles, affiliate_* do not exist either (not created here — out of scope).
--   · credit_ledger(id, user_id, job_id, delta, reason, metadata, created_at); reason CHECK accepts 'purchase';
--     UNIQUE (user_id, metadata->>'ref') WHERE delta > 0 — the idempotency backstop every grant relies on;
--     AFTER INSERT trigger update_credits_balance() moves profiles.credits_balance. No FK from user_id to profiles.
--   · profiles.tier text NOT NULL DEFAULT 'FREE' CHECK IN ('FREE','PRO','STUDIO','ENTERPRISE'); 97% FREE.
--
-- ⚠️ THE P0 RULES (20260929a) APPLY: every SECURITY DEFINER function here has EXECUTE revoked from public, anon and
-- authenticated; no policy is `USING (true)`; money/entitlement tables are written by service_role only.
-- lib/security/dbExposure.test.ts and lib/billing/subscriptionTiersMigration.test.ts enforce this file's shape.

begin;

-- ─── 1. subscriptions — the entitlement row resolveUserTier() reads ──────────────────────────────────────────
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id     text,
  stripe_subscription_id text not null,
  stripe_price_id        text,
  tier                   text,
  status                 text not null default 'incomplete',
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- If one of the older shapes already exists, give it every column the app and the grant function write.
alter table public.subscriptions
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id        text,
  add column if not exists tier                   text,
  add column if not exists status                 text,
  add column if not exists current_period_start   timestamptz,
  add column if not exists current_period_end     timestamptz,
  add column if not exists cancel_at_period_end   boolean default false,
  add column if not exists created_at             timestamptz default now(),
  add column if not exists updated_at             timestamptz default now();

-- The tier vocabulary is lib/billing/tiers.ts TIER_IDS — subscriptionTiersMigration.test.ts keeps them equal.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.subscriptions'::regclass and conname = 'subscriptions_tier_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_tier_check
      check (tier is null or tier in ('free', 'starter', 'creator', 'business')) not valid;
  end if;
end
$$;
alter table public.subscriptions validate constraint subscriptions_tier_check;

-- ON CONFLICT (stripe_subscription_id) needs a plain unique index on exactly that column. The older shapes
-- already declare it UNIQUE; only add one when nothing equivalent exists.
do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = 'public.subscriptions'::regclass
       and i.indisunique
       and i.indnkeyatts = 1
       and i.indpred is null
       and a.attname = 'stripe_subscription_id'
  ) then
    create unique index subscriptions_stripe_subscription_id_uniq on public.subscriptions (stripe_subscription_id);
  end if;
end
$$;

create index if not exists subscriptions_user_id_idx            on public.subscriptions (user_id);
create index if not exists subscriptions_stripe_customer_id_idx on public.subscriptions (stripe_customer_id);

-- ⚠️ A SUBSCRIPTION ROW IS AN ENTITLEMENT, SO A USER MUST NEVER WRITE ONE. 004_saas_billing_credits created
-- `subscriptions_user_policy … FOR ALL USING (auth.uid() = user_id)`: anyone could INSERT their own row with
-- tier 'business', status 'active' and a period ending in 2099. Owners may READ their row; only service_role
-- (BYPASSRLS, the webhook) writes. The REVOKE is the real guarantee — a policy can only narrow a privilege.
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_user_policy               on public.subscriptions;
drop policy if exists "Users can view own subscriptions"      on public.subscriptions;
drop policy if exists "Service role can manage subscriptions" on public.subscriptions;
drop policy if exists subscriptions_owner_select              on public.subscriptions;
create policy subscriptions_owner_select on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.subscriptions from anon;
revoke insert, update, delete, truncate on public.subscriptions from authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

-- ─── 2. subscription_allowance_grants — one row per paid invoice that granted a monthly allowance ─────────────
-- invoice_id is the PRIMARY KEY: the second delivery of the same invoice.paid cannot grant twice even if the
-- ledger's own ref index were missing. ledger_ref is pinned to 'sub:'||invoice_id so the audit row and the
-- credit_ledger row can always be joined.
create table if not exists public.subscription_allowance_grants (
  invoice_id             text primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,
  tier                   text not null,
  credits                integer not null,
  stripe_subscription_id text,
  stripe_price_id        text,
  period_start           timestamptz,
  period_end             timestamptz,
  ledger_ref             text not null,
  granted_at             timestamptz not null default now(),
  constraint subscription_allowance_grants_tier_check    check (tier in ('starter', 'creator', 'business')),
  constraint subscription_allowance_grants_credits_check check (credits > 0),
  constraint subscription_allowance_grants_ref_check     check (ledger_ref = 'sub:' || invoice_id)
);

create index if not exists subscription_allowance_grants_user_idx
  on public.subscription_allowance_grants (user_id, granted_at desc);

alter table public.subscription_allowance_grants enable row level security;
drop policy if exists subscription_allowance_grants_owner_select on public.subscription_allowance_grants;
create policy subscription_allowance_grants_owner_select on public.subscription_allowance_grants
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.subscription_allowance_grants from anon;
revoke insert, update, delete, truncate on public.subscription_allowance_grants from authenticated;
grant select, insert, update, delete on public.subscription_allowance_grants to service_role;

-- ─── 3. profiles.trial_started_at — the one-time trial RECORD ──────────────────────────────────────────────────
-- The trial itself is the existing signup grants (50 credits via handle_auth_user_starter_balance, 1 free film,
-- 3 free avatar replies — lib/billing/tiers.ts TRIAL). This only records WHEN it started, so "has this account had
-- its trial" no longer means reading ledger metadata. Backfilled from the signup_bonus ledger row (else the
-- profile's created_at); new rows default to now(), which is signup time — the trigger creates the profile.
-- ⚠️ THE DEFAULT IS SET AFTER THE BACKFILL ON PURPOSE: `ADD COLUMN … DEFAULT now()` would stamp every existing
-- account with the migration's timestamp.
alter table public.profiles add column if not exists trial_started_at timestamptz;

update public.profiles p
   set trial_started_at = coalesce(
         (select min(l.created_at) from public.credit_ledger l
           where l.user_id = p.id and l.metadata->>'kind' = 'signup_bonus'),
         p.created_at)
 where p.trial_started_at is null;

alter table public.profiles alter column trial_started_at set default now();

comment on column public.profiles.trial_started_at is
  'When this account''s one-time free trial began (= signup). The trial is the existing signup grants — 50 credits, '
  '1 free film, 3 free avatar replies — not a separate balance, and it does not expire. See lib/billing/tiers.ts TRIAL.';

-- ─── 4. profiles.tier — let the owner comp the new tier names ────────────────────────────────────────────────
-- Live CHECK is ('FREE','PRO','STUDIO','ENTERPRISE'). Widen it (never narrow): every value it allowed stays
-- allowed, so no existing row can fail it. resolveUserTier maps PRO→creator, STUDIO/ENTERPRISE→business.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles' and column_name = 'tier'
  ) then
    if exists (
      select 1 from pg_constraint
       where conrelid = 'public.profiles'::regclass and conname = 'profiles_tier_check'
         and pg_get_constraintdef(oid) not like '%CREATOR%'
    ) then
      alter table public.profiles drop constraint profiles_tier_check;
    end if;
    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.profiles'::regclass and conname = 'profiles_tier_check'
    ) then
      alter table public.profiles
        add constraint profiles_tier_check
        check (tier in ('FREE', 'PRO', 'STUDIO', 'ENTERPRISE', 'STARTER', 'CREATOR', 'BUSINESS')) not valid;
    end if;
  end if;
end
$$;

-- ─── 5. grant_subscription_allowance — the webhook's ONE atomic call per paid invoice ─────────────────────────
-- In one transaction: make sure the profile row exists (a ledger row for a user with no profile moves no balance —
-- the trigger UPDATEs zero rows and the credits vanish), record the grant (PK on invoice_id → at most once), write
-- the ledger row (reason 'purchase' — NOT 'refund', which is how one-time tier packs are still booked), and
-- refresh the entitlement row in `subscriptions`.
--
-- ⚠️ LEDGER INSERT ONLY. The AFTER INSERT trigger moves profiles.credits_balance; an explicit UPDATE here would pay
-- twice (20260802b_fix_double_credit.sql).
-- ⚠️ A STALE INVOICE MUST NOT ROLL THE ENTITLEMENT BACK. Stripe retries old deliveries for days; the subscription
-- row only moves when the incoming period ends at or after the stored one.
-- ⚠️ IF YOU CHANGE THE PARAMETER LIST, DROP THE OLD SIGNATURE FIRST. `create or replace` with a different list
-- makes a second overload, and two overloads made every credit_wallet_gel call ambiguous (PGRST203) for two months.
create or replace function public.grant_subscription_allowance(
  p_user_id         uuid,
  p_invoice_id      text,
  p_tier            text,
  p_credits         integer,
  p_subscription_id text,
  p_customer_id     text,
  p_price_id        text,
  p_period_start    timestamptz,
  p_period_end      timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref     text;
  v_granted boolean := false;
  v_balance integer;
begin
  if p_user_id is null
     or coalesce(p_invoice_id, '') = ''
     or p_credits is null or p_credits <= 0
     or p_tier is null or p_tier not in ('starter', 'creator', 'business') then
    raise exception 'invalid_allowance_grant' using errcode = '22023';
  end if;
  v_ref := 'sub:' || p_invoice_id;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    insert into public.profiles (id, email, credits_balance)
    select u.id, coalesce(u.email, u.id::text || '@placeholder.local'), 0
      from auth.users u
     where u.id = p_user_id
    on conflict (id) do nothing;
    if not exists (select 1 from public.profiles where id = p_user_id) then
      raise exception 'unknown_user' using errcode = 'P0002';
    end if;
  end if;

  insert into public.subscription_allowance_grants
    (invoice_id, user_id, tier, credits, stripe_subscription_id, stripe_price_id, period_start, period_end, ledger_ref)
  values
    (p_invoice_id, p_user_id, p_tier, p_credits, p_subscription_id, p_price_id, p_period_start, p_period_end, v_ref)
  on conflict (invoice_id) do nothing;

  if found then
    insert into public.credit_ledger (user_id, delta, reason, metadata)
    values (p_user_id, p_credits, 'purchase',
            jsonb_build_object('kind', 'subscription_allowance', 'ref', v_ref, 'tier', p_tier,
                               'invoice_id', p_invoice_id, 'stripe_subscription_id', p_subscription_id,
                               'stripe_price_id', p_price_id));
    v_granted := true;
  end if;

  if coalesce(p_subscription_id, '') <> '' then
    insert into public.subscriptions as s
      (user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, status,
       current_period_start, current_period_end, cancel_at_period_end, updated_at)
    values
      (p_user_id, p_customer_id, p_subscription_id, p_price_id, p_tier, 'active',
       coalesce(p_period_start, now()), coalesce(p_period_end, now()), false, now())
    on conflict (stripe_subscription_id) do update
      set stripe_customer_id   = coalesce(excluded.stripe_customer_id, s.stripe_customer_id),
          stripe_price_id      = excluded.stripe_price_id,
          tier                 = excluded.tier,
          status               = 'active',
          current_period_start = excluded.current_period_start,
          current_period_end   = excluded.current_period_end,
          updated_at           = now()
      where s.current_period_end is null
         or excluded.current_period_end >= s.current_period_end;
  end if;

  select credits_balance into v_balance from public.profiles where id = p_user_id;
  return jsonb_build_object('granted', v_granted, 'balance', coalesce(v_balance, 0), 'ref', v_ref);
end;
$$;

revoke execute on function public.grant_subscription_allowance(uuid, text, text, integer, text, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.grant_subscription_allowance(uuid, text, text, integer, text, text, text, timestamptz, timestamptz)
  to service_role;

-- ─── VERIFY — raise (rolling back the whole file) if a guarantee did not take ────────────────────────────────
do $$
declare
  v_fn text := 'public.grant_subscription_allowance(uuid, text, text, integer, text, text, text, timestamptz, timestamptz)';
begin
  if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'VERIFY FAILED — grant_subscription_allowance is executable by a client role';
  end if;
  if (select count(*) from pg_proc where proname = 'grant_subscription_allowance' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'VERIFY FAILED — grant_subscription_allowance has more than one overload';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.subscriptions'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.subscription_allowance_grants'::regclass) then
    raise exception 'VERIFY FAILED — row level security is off on a tier table';
  end if;
  if has_table_privilege('authenticated', 'public.subscriptions', 'INSERT')
     or has_table_privilege('authenticated', 'public.subscriptions', 'UPDATE')
     or has_table_privilege('anon', 'public.subscriptions', 'SELECT')
     or has_table_privilege('authenticated', 'public.subscription_allowance_grants', 'INSERT')
     or has_table_privilege('anon', 'public.subscription_allowance_grants', 'SELECT') then
    raise exception 'VERIFY FAILED — a client role can write (or anon can read) a tier table';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.credit_ledger'::regclass and conname = 'credit_ledger_reason_check'
       and pg_get_constraintdef(oid) like '%purchase%'
  ) then
    raise exception 'VERIFY FAILED — credit_ledger.reason does not accept ''purchase''';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'credit_ledger' and indexname = 'credit_ledger_user_ref_positive_uniq'
  ) then
    raise exception 'VERIFY FAILED — credit_ledger_user_ref_positive_uniq (the grant idempotency backstop) is missing';
  end if;
  raise notice 'VERIFY OK — subscription tiers: tables locked to service_role, grant function private, ledger ready.';
end
$$;

commit;
