-- Migration: Ensure required tables exist for avatars and render_jobs

-- Avatars table (if not exists)
create table if not exists public.avatars (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    image_url text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Render jobs table (if not exists)
create table if not exists public.render_jobs (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    status text,
    result_url text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Index for fast lookup
create index if not exists idx_avatars_owner_id on public.avatars(owner_id);
create index if not exists idx_render_jobs_owner_id on public.render_jobs(owner_id);
