-- supabase/migrations/20260228400001_credits_billing.sql
-- Credits tables: user_credits (cached balance per user) + credits_ledger (immutable audit log)

-- ─── user_credits (cached balance per user) ───────────────────────────────────
create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null default 'trial'
    check (plan_id in ('trial','pro','business','executive')),
  balance integer not null default 0,
  period_start timestamptz not null default now(),
  period_end timestamptz not null default (now() + interval '30 days'),
  flagged_soft_cap boolean not null default false,
  updated_at timestamptz not null default now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'user_credits_updated_at'
  ) THEN
    CREATE TRIGGER user_credits_updated_at
      BEFORE UPDATE ON public.user_credits
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

alter table public.user_credits enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_credits'
  ) THEN
    CREATE POLICY "users_read_own_credits" ON public.user_credits
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── credits_ledger (immutable audit log of all credit changes) ───────────────
create table if not exists public.credits_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_credits_ledger_user
  on public.credits_ledger (user_id, created_at desc);

alter table public.credits_ledger enable row level security;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_ledger'
  ) THEN
    CREATE POLICY "users_read_own_ledger" ON public.credits_ledger
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
