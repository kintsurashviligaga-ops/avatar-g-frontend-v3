-- Stripe Connect Accounts Table
-- Phase 6: Marketplace Seller Onboarding

create table if not exists public.stripe_connect_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  stripe_account_id text unique not null,
  connected boolean default false,
  charges_enabled boolean default false,
  payouts_enabled boolean default false,
  details_submitted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_stripe_connect_accounts_user_id
  on public.stripe_connect_accounts(user_id);

create index if not exists idx_stripe_connect_accounts_account_id
  on public.stripe_connect_accounts(stripe_account_id);

alter table public.stripe_connect_accounts enable row level security;

create policy "Users can view own connect account"
  on public.stripe_connect_accounts
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own connect account"
  on public.stripe_connect_accounts
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own connect account"
  on public.stripe_connect_accounts
  for update
  using (auth.uid() = user_id);
