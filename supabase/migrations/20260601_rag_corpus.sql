-- RAG corpus: a global (not per-user) knowledge base for grounding text
-- answers in curated Georgian (or any-language) source documents.
--
-- Mirrors the proven pgvector pattern from 20260517_memories.sql:
--   • 1536-d embeddings (matches lib/memory/embed.ts → Gemini gemini-embedding-001
--     with outputDimensionality=1536, OpenAI text-embedding-3-small fallback).
--   • ivfflat cosine index for fast ANN search.
--   • a stable SQL match function for similarity retrieval.
--
-- SECURITY: RLS is enabled with NO public policy, so anon/auth clients can read
-- nothing. Only the server's service-role key (which bypasses RLS) ingests and
-- retrieves. The corpus is therefore server-only by construction.

create extension if not exists vector;

create table if not exists public.rag_documents (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,                       -- filename / document id
  chunk_index  int  not null default 0,             -- ordinal within the source
  content      text not null,                       -- the chunk text
  lang         text not null default 'ka',          -- 'ka' | 'en' | 'ru' | ...
  embedding    vector(1536),
  created_at   timestamptz not null default now()
);

alter table public.rag_documents enable row level security;
-- Intentionally NO policy: deny all by default. Service role bypasses RLS.

create index if not exists rag_documents_source_idx
  on public.rag_documents(source, chunk_index);
create index if not exists rag_documents_embedding_idx
  on public.rag_documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Similarity search RPC. Global corpus (no per-user filter). Optional language
-- filter and a cosine-similarity floor so weak matches never pollute the prompt.
create or replace function public.match_rag_documents(
  query_embedding      vector(1536),
  match_count          int   default 3,
  similarity_threshold float default 0.5,
  filter_lang          text  default null
)
returns table (id uuid, source text, content text, similarity float)
language sql stable
as $$
  select d.id, d.source, d.content, 1 - (d.embedding <=> query_embedding) as similarity
  from public.rag_documents d
  where d.embedding is not null
    and (filter_lang is null or d.lang = filter_lang)
    and 1 - (d.embedding <=> query_embedding) >= similarity_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$$;
