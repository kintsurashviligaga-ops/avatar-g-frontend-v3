-- 20261031a_generation_jobs_document_kind.sql — to be applied to Production (zwksnayknzggdcenqqxy) by the owner in the
-- Supabase SQL Editor, this exact file, before the PR that writes 'document' rows is merged. GG approved the Library half
-- of Agent G's PDFs (Master Task v2.0, Phase 1, DOC-01) on 2026-10-31 06:15Z („Ok გააკეთე").
--
-- WHY. A PDF Agent G writes in the chat must also be in the Library and survive a refresh (DOC-01). The Library lists
-- finished generation_jobs rows, and generation_jobs_service_check allows only film, avatar, interior, image, music and
-- voice, so a PDF had nowhere to go. Filing it as one of those would put it on the wrong tab and in the wrong counts.
--
-- WHAT. The same CHECK with one more allowed value, 'document'. Written only by the server (app/api/documents/create,
-- through the service role, recordCompletedAsset), like every other generation_jobs row. NOT VALID: existing rows are
-- already within the old, narrower list, so nothing is re-scanned or locked for long; new and updated rows are checked.
--
-- Additive only: every value allowed before is still allowed, and it can be applied twice (verified on a throwaway
-- Postgres 16: 'document' refused before, accepted after, a second run changes nothing, an unknown value still refused). Until it is applied, the
-- create route's Library write is refused by the old CHECK and the PDF still appears in the chat (fail-soft).
-- Rollback (delete the document rows first, or the re-added old CHECK stays NOT VALID for them; the Library then shows
-- no PDFs and the chat card still works):
--   delete from public.generation_jobs where service_type = 'document';
--   alter table public.generation_jobs drop constraint if exists generation_jobs_service_check;
--   alter table public.generation_jobs add constraint generation_jobs_service_check
--     check (service_type in ('film','avatar','interior','image','music','voice')) not valid;

begin;

alter table public.generation_jobs drop constraint if exists generation_jobs_service_check;
alter table public.generation_jobs add constraint generation_jobs_service_check
  check (service_type in ('film','avatar','interior','image','music','voice','document')) not valid;

commit;
