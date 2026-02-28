-- supabase/migrations/20260228300001_business_hub.sql

-- ─── business_projects ────────────────────────────────────────────────────────
create table if not exists public.business_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft','active','paused','completed','archived')),
  niche text,
  target_market text,
  language text not null default 'ka'
    check (language in ('ka','en','ru')),
  brand_name text,
  brand_kit_url text,
  root_job_id uuid null references public.jobs(id) on delete set null,
  artifacts jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_biz_proj_user
  on public.business_projects (user_id, created_at desc);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'biz_proj_updated_at') THEN
    CREATE TRIGGER biz_proj_updated_at
      BEFORE UPDATE ON public.business_projects
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

alter table public.business_projects enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_biz_projects') THEN
    CREATE POLICY "users_own_biz_projects" ON public.business_projects
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

-- ─── business_items ───────────────────────────────────────────────────────────
create table if not exists public.business_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.business_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_platform text not null default 'manual'
    check (source_platform in (
      'amazon','alibaba','aliexpress','temu',
      'ebay','etsy','facebook_marketplace','manual','other'
    )),
  source_url text,
  source_notes text,
  target_platform text not null default 'manual'
    check (target_platform in (
      'mymarket_ge','ssx_ge','zoommer_ge','vendoo_ge',
      'manual','own_site'
    )),
  shipping_partner text not null default 'manual'
    check (shipping_partner in (
      'georgian_post','dhl','fedex','ups',
      'aramex','local_courier','manual'
    )),
  tracking_number text,
  status text not null default 'planned'
    check (status in (
      'planned','sourced','payment_pending','shipped',
      'in_transit','customs','arrived','listed','sold',
      'payout_pending','payout_received','cancelled','returned'
    )),
  units integer not null default 1 check (units > 0),
  profit_snapshot_id uuid,
  listing_url text,
  artifacts jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_biz_items_project
  on public.business_items (project_id, status, created_at desc);
create index if not exists idx_biz_items_user
  on public.business_items (user_id, created_at desc);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'biz_items_updated_at') THEN
    CREATE TRIGGER biz_items_updated_at
      BEFORE UPDATE ON public.business_items
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

alter table public.business_items enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_biz_items') THEN
    CREATE POLICY "users_own_biz_items" ON public.business_items
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

-- ─── business_item_events ─────────────────────────────────────────────────────
create table if not exists public.business_item_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.business_items(id) on delete cascade,
  status text not null,
  note text,
  actor text not null default 'user'
    check (actor in ('user','system')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_biz_events_item
  on public.business_item_events (item_id, created_at asc);

alter table public.business_item_events enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_biz_events') THEN
    CREATE POLICY "users_read_own_biz_events" ON public.business_item_events FOR SELECT
      USING (item_id IN (
        SELECT id FROM public.business_items WHERE user_id = auth.uid()
      ));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_insert_biz_events') THEN
    CREATE POLICY "users_insert_biz_events" ON public.business_item_events FOR INSERT
      WITH CHECK (item_id IN (
        SELECT id FROM public.business_items WHERE user_id = auth.uid()
      ));
  END IF;
END$$;

-- ─── connector_configs ───────────────────────────────────────────────────────
create table if not exists public.connector_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connector_type text not null check (connector_type in ('source','target','shipping','payment')),
  platform_key text not null,
  display_name text not null,
  is_active boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  -- SECURITY: never store API keys or passwords in this table.
  -- Keys must live in environment variables or Supabase Vault.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform_key)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'connector_configs_updated_at') THEN
    CREATE TRIGGER connector_configs_updated_at
      BEFORE UPDATE ON public.connector_configs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

alter table public.connector_configs enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_connectors') THEN
    CREATE POLICY "users_own_connectors" ON public.connector_configs
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

-- ─── profit_snapshots ────────────────────────────────────────────────────────
create table if not exists public.profit_snapshots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid null references public.business_items(id) on delete set null,
  project_id uuid not null references public.business_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  inputs jsonb not null,
  outputs jsonb not null,
  version integer not null default 1,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists idx_profit_snap_project
  on public.profit_snapshots (project_id, created_at desc);
create index if not exists idx_profit_snap_item
  on public.profit_snapshots (item_id) where item_id is not null;

alter table public.profit_snapshots enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_profit_snapshots') THEN
    CREATE POLICY "users_own_profit_snapshots" ON public.profit_snapshots
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;
