-- Throwaway local copy of the Production objects the lease queue and the credit ledger touch.
-- Column lists, constraints, indexes, triggers and function bodies were read (SELECT only) from Production
-- zwksnayknzggdcenqqxy on 2026-10-10; nothing here was written there.
create extension if not exists pgcrypto;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator login password 'local-only' noinherit;
grant anon, authenticated, service_role to authenticator;
create schema auth; create table auth.users (id uuid primary key);
grant usage on schema public to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key default gen_random_uuid(), email text not null, tier text not null default 'FREE',
  credits_balance integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table public.generation_jobs (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade, service_type text not null,
  status text not null default 'pending', current_stage text, pct integer not null default 0, params jsonb not null default '{}'::jsonb,
  result jsonb, signed_url text, error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  cost_usd numeric, cost_gel numeric, duration_ms integer,
  constraint generation_jobs_pct_check check (pct >= 0 and pct <= 100),
  constraint generation_jobs_service_check check (service_type = any (array['film','avatar','interior','image','music','voice'])),
  constraint generation_jobs_status_check check (status = any (array['pending','processing','completed','failed'])));
create index generation_jobs_user_updated_idx on public.generation_jobs (user_id, updated_at desc);
create index generation_jobs_user_active_idx on public.generation_jobs (user_id, updated_at desc) where status = any (array['pending','processing']);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, job_id uuid, delta integer not null, reason text not null,
  metadata jsonb, created_at timestamptz not null default now(),
  constraint credit_ledger_reason_check check (reason = any (array['reserve','commit','refund','admin_adjustment','purchase'])));
create unique index idx_credit_ledger_job_reason on public.credit_ledger (job_id, reason) where job_id is not null;
create index idx_credit_ledger_user_ref on public.credit_ledger (user_id, (metadata ->> 'ref'));
create unique index credit_ledger_user_ref_positive_uniq on public.credit_ledger (user_id, (metadata ->> 'ref')) where delta > 0 and (metadata ->> 'ref') is not null;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
create trigger generation_jobs_updated_at_trigger before update on public.generation_jobs for each row execute function update_updated_at_column();

CREATE OR REPLACE FUNCTION public.update_credits_balance() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  UPDATE public.profiles SET credits_balance = credits_balance + NEW.delta, updated_at = NOW() WHERE id = NEW.user_id;
  RETURN NEW;
END;
$function$;
create trigger trigger_update_credits_balance after insert on public.credit_ledger for each row execute function update_credits_balance();

CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id uuid, p_amount integer, p_ref text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  -- Idempotency (ref lives in metadata; reason is a constrained enum).
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id AND metadata->>'ref' = p_ref AND delta < 0
  ) THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- Lock the balance row to serialize concurrent deducts.
  SELECT credits_balance INTO v_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001', DETAIL = 'no profile record';
  END IF;

  IF COALESCE(v_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits' USING ERRCODE = 'P0001',
      DETAIL = format('have %s need %s', COALESCE(v_balance, 0), p_amount);
  END IF;

  -- Append the ledger row; trigger_update_credits_balance applies the delta.
  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (p_user_id, -p_amount, 'commit', jsonb_build_object('source', 'orchestrator', 'ref', p_ref));

  -- Re-read the post-trigger balance for an accurate return value.
  SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_credits(p_user_id uuid, p_amount integer, p_ref text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: never refund the same ref twice.
  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id AND metadata->>'ref' = p_ref AND delta > 0
  ) THEN
    SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- Only credit a real profile; the trigger applies the +delta.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (p_user_id, p_amount, 'refund', jsonb_build_object('source', 'orchestrator-rollback', 'ref', p_ref));

  SELECT credits_balance INTO v_balance FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$function$;

grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
revoke execute on function public.deduct_credits(uuid, integer, text), public.refund_credits(uuid, integer, text) from public, anon, authenticated;

-- The two test accounts the suite uses (lib/agent/media/leaseIsolation.pg.test.ts).
insert into auth.users (id) values ('0e000000-0000-4000-8000-00000000000a'), ('0e000000-0000-4000-8000-00000000000b');
