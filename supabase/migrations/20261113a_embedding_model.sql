-- v5.1 M-14: chat memory and the RAG corpus are Google-only (gemini-embedding-001 @ 1536 on Vertex AI).
--
-- memories.embedding and rag_documents.embedding are both vector(1536), and before this the OpenAI
-- text-embedding-3-small fallback wrote vectors of the same size into the same columns. Same size, different
-- embedding space: comparing a Gemini query against an OpenAI row gives a similarity that means nothing. Nothing
-- recorded which model wrote a row, so this adds that record.
--
--   1. embedding_model is added with NO default first, so every row that exists today stays null = "model unknown".
--   2. Only then does the column get its default, so every row the app writes from now on (app/api/memory,
--      scripts/rag-ingest.mjs) is marked with the current model without any insert changing.
--   3. match_memories / match_rag_documents only compare rows of the current model. Unknown rows drop out of
--      similarity recall (they stay listed, editable and in the plain fact list) until the re-embed run
--      (POST /api/admin/memory-reembed) gives them a Gemini vector.
--
-- rag_documents and match_rag_documents are NOT in Production (__tests__/schema-drift.snapshot.json, read
-- 2026-10-09): that half only runs where 20260601_rag_corpus.sql was applied, and is skipped elsewhere, so this file
-- applies cleanly to Production as it is. Same signatures and return types as before, so no caller changes.
-- Safe to run twice.

alter table public.memories add column if not exists embedding_model text;
alter table public.memories alter column embedding_model set default 'gemini-embedding-001@1536';
create index if not exists memories_embedding_model_idx on public.memories(embedding_model);

create or replace function public.match_memories(query_embedding vector(1536), match_count int default 5)
returns table (id uuid, fact text, similarity float)
language sql stable
as $$
  select m.id, m.fact, 1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.user_id = auth.uid()
    and m.embedding is not null
    and m.embedding_model = 'gemini-embedding-001@1536'
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

do $rag$
begin
  if to_regclass('public.rag_documents') is null then
    raise notice 'rag_documents not present: RAG half skipped';
    return;
  end if;
  alter table public.rag_documents add column if not exists embedding_model text;
  alter table public.rag_documents alter column embedding_model set default 'gemini-embedding-001@1536';
  create index if not exists rag_documents_embedding_model_idx on public.rag_documents(embedding_model);
  execute $sql$
create or replace function public.match_rag_documents(
  query_embedding      vector(1536),
  match_count          int   default 3,
  similarity_threshold float default 0.5,
  filter_lang          text  default null
)
returns table (id uuid, source text, content text, similarity float)
language sql stable
as $fn$
  select d.id, d.source, d.content, 1 - (d.embedding <=> query_embedding) as similarity
  from public.rag_documents d
  where d.embedding is not null
    and d.embedding_model = 'gemini-embedding-001@1536'
    and (filter_lang is null or d.lang = filter_lang)
    and 1 - (d.embedding <=> query_embedding) >= similarity_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$fn$;
  $sql$;
end
$rag$;
