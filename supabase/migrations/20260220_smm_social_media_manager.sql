create extension if not exists pgcrypto;

create table if not exists public.smm_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  title text not null,
  goal text not null,
  audience_lang text not null,
  platforms text[] not null default '{}',
  brand_voice text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.smm_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.smm_projects(id) on delete cascade,
  day_index integer not null,
  title text not null,
  hook text not null,
  caption text not null,
  hashtags text[] not null default '{}',
  status text not null default 'draft',
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.smm_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.smm_posts(id) on delete cascade,
  type text not null,
  provider text not null,
  status text not null default 'pending',
  url text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_smm_projects_owner_created on public.smm_projects(owner_id, created_at desc);
create index if not exists idx_smm_posts_project_day on public.smm_posts(project_id, day_index asc);
create index if not exists idx_smm_assets_post_created on public.smm_assets(post_id, created_at desc);
