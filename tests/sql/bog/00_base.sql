-- tests/sql/bog/00_base.sql — the minimum of Supabase + the pre-BOG schema that the BOG billing migrations sit on.
-- Shapes copied from the Production catalog (read-only pg_attribute / pg_constraint / pg_indexes / pg_get_functiondef,
-- 2026-10-12), so the money functions run against the same tables, constraints and trigger they meet in Production.
-- LOCAL TEST DATABASE ONLY — never apply this to a real project.
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.jobs (id uuid primary key default gen_random_uuid());

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  tier text not null default 'FREE' check (tier = any (array['FREE','PRO','STUDIO','ENTERPRISE'])),
  credits_balance integer not null default 0 check (credits_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_id uuid references public.jobs(id) on delete set null,
  delta integer not null,
  reason text not null check (reason = any (array['reserve','commit','refund','admin_adjustment','purchase'])),
  metadata jsonb,
  created_at timestamptz not null default now()
);
create unique index credit_ledger_user_ref_positive_uniq on public.credit_ledger (user_id, (metadata ->> 'ref'))
  where delta > 0 and (metadata ->> 'ref') is not null;
create unique index credit_ledger_user_ref_negative_uniq on public.credit_ledger (user_id, (metadata ->> 'ref'))
  where delta < 0 and (metadata ->> 'ref') is not null;

create or replace function public.update_credits_balance() returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
BEGIN
  UPDATE public.profiles SET credits_balance = credits_balance + NEW.delta, updated_at = NOW() WHERE id = NEW.user_id;
  RETURN NEW;
END;
$function$;
create trigger trigger_update_credits_balance after insert on public.credit_ledger for each row execute function update_credits_balance();

create table public.wallet_topups (
  ref text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_gel numeric(12,2) not null,
  created_at timestamptz not null default now()
);

-- credit_wallet_gel: Production's body (pg_get_functiondef), identical to 20260929a_p0_lockdown_public_access.sql.
create function public.credit_wallet_gel(p_user_id uuid, p_amount numeric, p_ref text, p_reason text default 'purchase'::text)
 returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
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
$function$;
revoke execute on function public.credit_wallet_gel(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.credit_wallet_gel(uuid, numeric, text, text) to service_role;
