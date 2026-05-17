-- Task 3: per-user fact memory store + similarity search RPC
--
-- This is a brand-new table independent of the existing JSONB-blob
-- `agent_g_memory` (kept untouched). Holds individual facts, both
-- manually added by the user and auto-extracted, with optional
-- embeddings for similarity injection into the chat system prompt.

create extension if not exists vector;

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fact text not null,
  source text not null default 'manual' check (source in ('auto','manual')),
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memories enable row level security;

drop policy if exists "memories_owner_all" on public.memories;
create policy "memories_owner_all" on public.memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists memories_user_id_idx on public.memories(user_id, created_at desc);
create index if not exists memories_embedding_idx on public.memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Similarity search RPC (RLS-enforced: only returns rows for auth.uid()).
create or replace function public.match_memories(query_embedding vector(1536), match_count int default 5)
returns table (id uuid, fact text, similarity float)
language sql stable
as $$
  select m.id, m.fact, 1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.user_id = auth.uid() and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit match_count;
$$;
