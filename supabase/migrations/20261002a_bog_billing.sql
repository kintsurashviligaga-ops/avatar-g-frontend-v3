-- 20261002a_bog_billing.sql — Bank of Georgia (api.bog.ge): PAYG top-ups + monthly plans charged to a saved card.
--
-- Written 2026-10-02 against the LIVE shape of project zwksnayknzggdcenqqxy (read-only first):
--   · public.bog_orders exists with 0 rows: shop_order_id PK, bog_order_id, user_id, amount_gel, status, created_at,
--     updated_at; RLS on, owner-select policy only — but `authenticated` still held INSERT and `anon` SELECT grants.
--   · public.subscriptions / subscription_allowance_grants do NOT exist (20261001a was never applied).
--   · credit_wallet_gel(uuid, numeric, text, text) is the single top-up primitive (wallet_topups.ref PK, floor(amount×10)).
--
-- Sections 1, 2 and 5 below are COPIED VERBATIM from 20261001a (the subscriptions entitlement table, the per-invoice
-- grant ledger and grant_subscription_allowance) — CREATE … IF NOT EXISTS / CREATE OR REPLACE with the identical
-- signature, so 20261001a and this file may be applied in either order. 20261001a's profiles changes (trial_started_at,
-- the widened profiles.tier CHECK) are NOT here: they belong to the Stripe-tier activation, not to BOG.
--
-- Then the BOG part:
--   · subscriptions: provider ('stripe' | 'bog') + the saved card BOG charges (bog_parent_order_id), the GEL amount,
--     renewal back-off. A BOG plan's row is keyed stripe_subscription_id = 'bog:<parent order id>' (the column predates
--     a second provider; resolveUserTier reads tier/status/current_period_end and works unchanged).
--   · bog_orders: kind (topup | subscription | renewal), what the order is worth (tier, credits), the period a renewal
--     pays for; client write grants revoked.
--   · bog_fulfill_order          the ONE money call per paid order (top-up → credit_wallet_gel; plan → allowance + period)
--   · bog_claim_renewal          insert a due renewal's order under the subscription's row lock (cron overlap-safe)
--   · bog_record_renewal_failure a declined renewal: back off a day, three strikes → past_due
--
-- ⚠️ THE P0 RULES (20260929a) APPLY: every SECURITY DEFINER function has EXECUTE revoked from public, anon and
-- authenticated; no policy is USING (true); money/entitlement tables are written by service_role only.
-- lib/security/dbExposure.test.ts and lib/billing/bogBillingMigration.test.ts enforce this file's shape.

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


-- ─── 6. subscriptions — the BOG columns ─────────────────────────────────────────────────────────────────────────
alter table public.subscriptions
  add column if not exists provider            text not null default 'stripe',
  add column if not exists bog_parent_order_id text,
  add column if not exists amount_gel          numeric(10, 2),
  add column if not exists card_mask           text,
  add column if not exists renewal_failures    integer not null default 0,
  add column if not exists next_attempt_at     timestamptz,
  add column if not exists canceled_at         timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.subscriptions'::regclass and conname = 'subscriptions_provider_check') then
    alter table public.subscriptions add constraint subscriptions_provider_check check (provider in ('stripe', 'bog'));
  end if;
end
$$;

create index if not exists subscriptions_bog_due_idx
  on public.subscriptions (current_period_end)
  where provider = 'bog' and status in ('active', 'past_due') and not cancel_at_period_end;

-- ─── 7. bog_orders — what each order is worth, and the period a renewal pays for ───────────────────────────────
alter table public.bog_orders
  add column if not exists kind            text not null default 'topup',
  add column if not exists tier            text,
  add column if not exists credits         integer,
  add column if not exists subscription_id uuid,
  add column if not exists period_start    timestamptz,
  add column if not exists period_end      timestamptz,
  add column if not exists attempt         integer not null default 1,
  add column if not exists card_mask       text,
  add column if not exists card_saved      boolean not null default false,
  add column if not exists reject_reason   text,
  add column if not exists credited_at     timestamptz,
  add column if not exists locale          text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.bog_orders'::regclass and conname = 'bog_orders_subscription_id_fkey') then
    alter table public.bog_orders
      add constraint bog_orders_subscription_id_fkey foreign key (subscription_id) references public.subscriptions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.bog_orders'::regclass and conname = 'bog_orders_kind_check') then
    alter table public.bog_orders add constraint bog_orders_kind_check check (kind in ('topup', 'subscription', 'renewal'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.bog_orders'::regclass and conname = 'bog_orders_tier_check') then
    alter table public.bog_orders add constraint bog_orders_tier_check check (tier is null or tier in ('starter', 'creator', 'business'));
  end if;
  -- A plan order must say what it grants; a renewal must say which subscription and which period it pays for.
  if not exists (select 1 from pg_constraint where conrelid = 'public.bog_orders'::regclass and conname = 'bog_orders_plan_shape_check') then
    alter table public.bog_orders add constraint bog_orders_plan_shape_check check (
      (kind = 'topup' or (tier is not null and credits is not null and credits > 0))
      and (kind <> 'renewal' or (subscription_id is not null and period_start is not null))
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.bog_orders'::regclass and conname = 'bog_orders_amount_check') then
    alter table public.bog_orders add constraint bog_orders_amount_check check (amount_gel > 0);
  end if;
end
$$;

-- One BOG order id ↔ one of ours; at most one live (pending or paid) renewal per subscription period.
create unique index if not exists bog_orders_bog_order_id_uniq on public.bog_orders (bog_order_id) where bog_order_id is not null;
create unique index if not exists bog_orders_renewal_period_uniq
  on public.bog_orders (subscription_id, period_start)
  where kind = 'renewal' and status in ('pending', 'completed');
create index if not exists bog_orders_pending_idx on public.bog_orders (created_at) where status = 'pending';
create index if not exists bog_orders_subscription_idx on public.bog_orders (subscription_id);

-- ⚠️ bog_orders decides what a payment is worth, so a user must never write one. RLS already blocked the
-- leftover client grants; the REVOKE is the real guarantee (a policy can only narrow a privilege).
alter table public.bog_orders enable row level security;
revoke all on public.bog_orders from anon;
revoke insert, update, delete, truncate on public.bog_orders from authenticated;
grant select, insert, update, delete on public.bog_orders to service_role;

-- ─── 8. bog_fulfill_order — the ONE money call per paid BOG order ──────────────────────────────────────────────
-- Under the order's row lock, in one transaction:
--   topup        → credit_wallet_gel(user, amount, 'bog:<order>')  (wallet_topups.ref PK → at most once; revenue row)
--   subscription → grant_subscription_allowance(invoice 'bog:<order>') + a new subscriptions row (provider 'bog'),
--                  renewing only if BOG saved the card; other live BOG plans of the user stop renewing
--   renewal      → grant_subscription_allowance(invoice 'bog:<order>') extending the existing subscription
-- An already-completed order answers granted=false and moves nothing (callback + reconcile + cron may race).
-- ⚠️ The order row is the price list here: amount and credits were written at checkout by the server. The caller
-- has already checked the receipt's amount/currency against that row.
create or replace function public.bog_fulfill_order(
  p_shop_order_id text,
  p_bog_order_id  text,
  p_card_mask     text,
  p_card_saved    boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o            public.bog_orders%rowtype;
  s            public.subscriptions%rowtype;
  v_bog_id     text    := nullif(btrim(coalesce(p_bog_order_id, '')), '');
  v_mask       text    := nullif(btrim(coalesce(p_card_mask, '')), '');
  v_saved      boolean := coalesce(p_card_saved, false);
  v_balance    integer;
  v_granted    boolean := false;
  v_grant      jsonb;
  v_sub_key    text;
  v_start      timestamptz;
  v_end        timestamptz;
  v_superseded text[]  := '{}';
begin
  select * into o from public.bog_orders where shop_order_id = p_shop_order_id for update;
  if not found then
    raise exception 'unknown_order' using errcode = 'P0002';
  end if;
  if o.bog_order_id is not null and v_bog_id is not null and o.bog_order_id <> v_bog_id then
    raise exception 'order_id_mismatch' using errcode = '22023';
  end if;

  if o.status = 'completed' then
    select credits_balance into v_balance from public.profiles where id = o.user_id;
    if o.subscription_id is not null then
      select * into s from public.subscriptions where id = o.subscription_id;
    end if;
    return jsonb_build_object(
      'granted', false,
      'kind', o.kind,
      'credits', case when o.kind = 'topup' then floor(o.amount_gel * 10)::integer else coalesce(o.credits, 0) end,
      'balance', coalesce(v_balance, 0),
      'subscription_id', o.subscription_id,
      'tier', o.tier,
      'period_end', o.period_end,
      'auto_renew', case when o.kind = 'topup' or s.id is null then null
                         else (not s.cancel_at_period_end and s.bog_parent_order_id is not null) end,
      'superseded_parent_orders', '[]'::jsonb);
  end if;

  -- A ledger row for a user with no profile moves no balance (the trigger UPDATEs zero rows) — make sure it exists.
  if not exists (select 1 from public.profiles where id = o.user_id) then
    insert into public.profiles (id, email, credits_balance)
    select u.id, coalesce(u.email, u.id::text || '@placeholder.local'), 0
      from auth.users u
     where u.id = o.user_id
    on conflict (id) do nothing;
    if not exists (select 1 from public.profiles where id = o.user_id) then
      raise exception 'unknown_user' using errcode = 'P0002';
    end if;
  end if;

  if o.kind = 'topup' then
    v_granted := not exists (select 1 from public.wallet_topups where ref = 'bog:' || o.shop_order_id);
    v_balance := public.credit_wallet_gel(o.user_id, o.amount_gel, 'bog:' || o.shop_order_id, 'purchase');
    update public.bog_orders
       set status       = 'completed',
           credited_at  = now(),
           updated_at   = now(),
           bog_order_id = coalesce(bog_order_id, v_bog_id),
           card_mask    = coalesce(v_mask, card_mask)
     where shop_order_id = o.shop_order_id;
    return jsonb_build_object(
      'granted', v_granted, 'kind', 'topup', 'credits', floor(o.amount_gel * 10)::integer,
      'balance', coalesce(v_balance, 0), 'subscription_id', null, 'tier', null, 'period_end', null,
      'auto_renew', null, 'superseded_parent_orders', '[]'::jsonb);
  end if;

  if o.tier is null or o.credits is null or o.credits <= 0 then
    raise exception 'invalid_plan_order' using errcode = '22023';
  end if;

  if o.kind = 'subscription' then
    v_start   := now();
    v_end     := v_start + interval '1 month';
    v_sub_key := 'bog:' || coalesce(o.bog_order_id, v_bog_id, o.shop_order_id);
  else
    select * into s from public.subscriptions where id = o.subscription_id for update;
    if not found then
      raise exception 'unknown_subscription' using errcode = 'P0002';
    end if;
    v_start   := o.period_start;
    v_end     := coalesce(o.period_end, o.period_start + interval '1 month');
    v_sub_key := s.stripe_subscription_id;
  end if;

  v_grant   := public.grant_subscription_allowance(
                 o.user_id, 'bog:' || o.shop_order_id, o.tier, o.credits, v_sub_key, null, null, v_start, v_end);
  v_granted := coalesce((v_grant ->> 'granted')::boolean, false);

  update public.subscriptions
     set provider             = 'bog',
         amount_gel           = o.amount_gel,
         card_mask            = coalesce(v_mask, card_mask),
         bog_parent_order_id  = case when o.kind = 'subscription'
                                     then case when v_saved then coalesce(o.bog_order_id, v_bog_id) else null end
                                     else bog_parent_order_id end,
         -- No saved card → the plan is one prepaid month that simply ends; the renewal cron never touches it.
         cancel_at_period_end = case when o.kind = 'subscription' then not v_saved else cancel_at_period_end end,
         renewal_failures     = 0,
         next_attempt_at      = null,
         updated_at           = now()
   where stripe_subscription_id = v_sub_key
  returning * into s;
  if s.id is null then
    raise exception 'subscription_not_written' using errcode = 'P0002';
  end if;

  if o.kind = 'subscription' then
    -- One renewing BOG plan per user: older ones stop renewing (their paid period still runs out). The caller
    -- deletes their saved cards at BOG.
    select coalesce(array_agg(x.bog_parent_order_id) filter (where x.bog_parent_order_id is not null), '{}')
      into v_superseded
      from public.subscriptions x
     where x.user_id = o.user_id and x.provider = 'bog' and x.id <> s.id
       and x.status in ('active', 'past_due') and not x.cancel_at_period_end;
    update public.subscriptions x
       set cancel_at_period_end = true,
           canceled_at          = coalesce(x.canceled_at, now()),
           updated_at           = now()
     where x.user_id = o.user_id and x.provider = 'bog' and x.id <> s.id
       and x.status in ('active', 'past_due') and not x.cancel_at_period_end;
  end if;

  update public.bog_orders
     set status          = 'completed',
         credited_at     = now(),
         updated_at      = now(),
         subscription_id = s.id,
         period_start    = v_start,
         period_end      = v_end,
         bog_order_id    = coalesce(bog_order_id, v_bog_id),
         card_mask       = coalesce(v_mask, card_mask),
         card_saved      = case when o.kind = 'subscription' then v_saved else card_saved end
   where shop_order_id = o.shop_order_id;

  select credits_balance into v_balance from public.profiles where id = o.user_id;
  return jsonb_build_object(
    'granted', v_granted,
    'kind', o.kind,
    'credits', o.credits,
    'balance', coalesce(v_balance, 0),
    'subscription_id', s.id,
    'tier', o.tier,
    'period_end', v_end,
    'auto_renew', (not s.cancel_at_period_end and s.bog_parent_order_id is not null),
    'superseded_parent_orders', to_jsonb(v_superseded));
end;
$$;

revoke execute on function public.bog_fulfill_order(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.bog_fulfill_order(text, text, text, boolean) to service_role;

-- ─── 9. bog_claim_renewal — the cron's lock on one period's charge ──────────────────────────────────────────────
-- Due = renewing BOG plan whose period ends within the hour. The order id is deterministic per period and attempt
-- ('myavatar-renew-<yyyymmdd>-<n>-<sub>'), and the partial unique index allows one live renewal per period, so two
-- overlapping ticks cannot both charge. A charge already in flight is handed back (in_flight) for the caller to
-- finish with the SAME id — BOG's Idempotency-Key is derived from it.
create or replace function public.bog_claim_renewal(p_subscription_id uuid, p_credits integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s         public.subscriptions%rowtype;
  v_live    record;
  v_id      text;
  v_end     timestamptz;
  v_attempt integer;
begin
  if p_subscription_id is null or p_credits is null or p_credits <= 0 then
    raise exception 'invalid_claim' using errcode = '22023';
  end if;
  select * into s from public.subscriptions where id = p_subscription_id for update;
  if not found or s.provider <> 'bog' then
    return jsonb_build_object('claimed', false, 'reason', 'not_bog');
  end if;
  if s.status not in ('active', 'past_due') then
    return jsonb_build_object('claimed', false, 'reason', 'inactive');
  end if;
  if s.cancel_at_period_end then
    return jsonb_build_object('claimed', false, 'reason', 'canceled');
  end if;
  if coalesce(s.bog_parent_order_id, '') = '' or s.amount_gel is null or s.amount_gel <= 0 or s.tier is null then
    return jsonb_build_object('claimed', false, 'reason', 'no_saved_card');
  end if;
  if s.current_period_end is null or s.current_period_end > now() + interval '1 hour' then
    return jsonb_build_object('claimed', false, 'reason', 'not_due');
  end if;

  select shop_order_id, status, bog_order_id into v_live
    from public.bog_orders
   where subscription_id = s.id and kind = 'renewal' and period_start = s.current_period_end
     and status in ('pending', 'completed')
   limit 1;
  if found then
    return jsonb_build_object('claimed', false, 'reason', 'in_flight', 'shop_order_id', v_live.shop_order_id,
      'status', v_live.status, 'bog_order_id', v_live.bog_order_id, 'parent_order_id', s.bog_parent_order_id);
  end if;

  if s.renewal_failures >= 3 then
    return jsonb_build_object('claimed', false, 'reason', 'exhausted');
  end if;
  if s.next_attempt_at is not null and s.next_attempt_at > now() then
    return jsonb_build_object('claimed', false, 'reason', 'backoff');
  end if;

  v_attempt := s.renewal_failures + 1;
  -- Paid late (cron outage, retries) → still a full month from now.
  v_end     := greatest(s.current_period_end, now()) + interval '1 month';
  v_id      := 'myavatar-renew-' || to_char(s.current_period_end at time zone 'UTC', 'YYYYMMDD') || '-' || v_attempt
               || '-' || replace(left(s.id::text, 18), '-', '');
  insert into public.bog_orders
    (shop_order_id, user_id, amount_gel, status, kind, tier, credits, subscription_id, period_start, period_end, attempt, card_mask)
  values
    (v_id, s.user_id, s.amount_gel, 'pending', 'renewal', s.tier, p_credits, s.id, s.current_period_end, v_end, v_attempt, s.card_mask)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'conflict', 'shop_order_id', v_id);
  end if;
  return jsonb_build_object('claimed', true, 'reason', null, 'shop_order_id', v_id,
    'parent_order_id', s.bog_parent_order_id, 'bog_order_id', null, 'status', 'pending');
end;
$$;

revoke execute on function public.bog_claim_renewal(uuid, integer) from public, anon, authenticated;
grant execute on function public.bog_claim_renewal(uuid, integer) to service_role;

-- ─── 10. bog_record_renewal_failure — a declined renewal ────────────────────────────────────────────────────────
-- Back off a day; the third decline in a row marks the subscription past_due (no more automatic attempts — the plan's
-- entitlement already ended at current_period_end, resolveUserTier gates on it). Idempotent: only a pending renewal
-- moves.
create or replace function public.bog_record_renewal_failure(p_shop_order_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o          public.bog_orders%rowtype;
  v_failures integer;
begin
  select * into o from public.bog_orders where shop_order_id = p_shop_order_id for update;
  if not found or o.kind <> 'renewal' then
    return jsonb_build_object('recorded', false, 'reason', 'not_a_renewal');
  end if;
  if o.status <> 'pending' then
    return jsonb_build_object('recorded', false, 'reason', o.status);
  end if;
  update public.bog_orders
     set status = 'rejected', reject_reason = left(coalesce(p_reason, 'rejected'), 200), updated_at = now()
   where shop_order_id = o.shop_order_id;
  update public.subscriptions
     set renewal_failures = renewal_failures + 1,
         next_attempt_at  = case when renewal_failures + 1 >= 3 then null else now() + interval '1 day' end,
         status           = case when renewal_failures + 1 >= 3 then 'past_due' else status end,
         updated_at       = now()
   where id = o.subscription_id
  returning renewal_failures into v_failures;
  return jsonb_build_object('recorded', true, 'failures', coalesce(v_failures, 0));
end;
$$;

revoke execute on function public.bog_record_renewal_failure(text, text) from public, anon, authenticated;
grant execute on function public.bog_record_renewal_failure(text, text) to service_role;

-- ─── VERIFY — raise (rolling back the whole file) if a guarantee did not take ────────────────────────────────
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.grant_subscription_allowance(uuid, text, text, integer, text, text, text, timestamptz, timestamptz)',
    'public.bog_fulfill_order(text, text, text, boolean)',
    'public.bog_claim_renewal(uuid, integer)',
    'public.bog_record_renewal_failure(text, text)'
  ] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'VERIFY FAILED — % is executable by a client role', v_fn;
    end if;
  end loop;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('grant_subscription_allowance', 'bog_fulfill_order', 'bog_claim_renewal', 'bog_record_renewal_failure')) <> 4 then
    raise exception 'VERIFY FAILED — a BOG/allowance function has more than one overload';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'credit_wallet_gel') <> 1 then
    raise exception 'VERIFY FAILED — credit_wallet_gel must have exactly one overload (bog_fulfill_order calls it)';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.subscriptions'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.subscription_allowance_grants'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.bog_orders'::regclass) then
    raise exception 'VERIFY FAILED — row level security is off on a billing table';
  end if;
  if has_table_privilege('authenticated', 'public.subscriptions', 'INSERT')
     or has_table_privilege('authenticated', 'public.subscriptions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.bog_orders', 'INSERT')
     or has_table_privilege('authenticated', 'public.bog_orders', 'UPDATE')
     or has_table_privilege('anon', 'public.bog_orders', 'SELECT')
     or has_table_privilege('anon', 'public.subscriptions', 'SELECT')
     or has_table_privilege('authenticated', 'public.subscription_allowance_grants', 'INSERT') then
    raise exception 'VERIFY FAILED — a client role can write (or anon can read) a billing table';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'credit_ledger' and indexname = 'credit_ledger_user_ref_positive_uniq'
  ) then
    raise exception 'VERIFY FAILED — credit_ledger_user_ref_positive_uniq (the grant idempotency backstop) is missing';
  end if;
  raise notice 'VERIFY OK — BOG billing: tables locked to service_role, functions private, one overload each.';
end
$$;

commit;
