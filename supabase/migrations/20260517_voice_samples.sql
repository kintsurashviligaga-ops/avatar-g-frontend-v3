create table if not exists public.voice_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider text not null default 'elevenlabs',
  external_id text not null,
  preview_url text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.voice_samples enable row level security;

create policy "voice_samples_owner_select" on public.voice_samples
  for select using (auth.uid() = user_id);
create policy "voice_samples_owner_insert" on public.voice_samples
  for insert with check (auth.uid() = user_id);
create policy "voice_samples_owner_delete" on public.voice_samples
  for delete using (auth.uid() = user_id);
create policy "voice_samples_owner_update" on public.voice_samples
  for update using (auth.uid() = user_id);

create index if not exists voice_samples_user_id_idx on public.voice_samples(user_id, created_at desc);
