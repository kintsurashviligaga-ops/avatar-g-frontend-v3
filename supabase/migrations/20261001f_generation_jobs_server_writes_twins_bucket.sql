-- 20261001f — generation_jobs is written by the SERVER only; a private bucket for biometrics (applied live 2026-10-01).
--
-- ⚠️ THE DRAINER REFUND EXPLOIT. /api/cron/drain-renders (RENDER_DRAINER_ENABLED is on in production) refunds a
-- `processing` row older than 30 min that carries params._reserve. With the owner INSERT/UPDATE policies a user
-- could forge such a row, or flip a delivered, billed row back to `processing` (directly through PostgREST with
-- the public anon key, or through /api/orchestrator/jobs op:'update'), wait 30 minutes and be refunded for a
-- render they had received. Writes now go only through the service role: /api/orchestrator/jobs scopes them to the
-- caller by hand, strips `_`-prefixed params and never revives a finished or billed row. Owners keep SELECT (the
-- reload-recovery feed) and DELETE (removing a row never mints credit — the drainer refunds only rows that exist).
DROP POLICY IF EXISTS generation_jobs_owner_insert ON public.generation_jobs;
DROP POLICY IF EXISTS generation_jobs_owner_update ON public.generation_jobs;

-- Private bucket for Digital-Twin biometrics (Live Avatar voiceprints now; face captures in Wave 3). Never public;
-- the generic signers refuse it (lib/orchestrator/storage-adapter.ts refuseTwin). 25 MB per object (the free
-- tier's global cap is 50 MB — a bucket limit above it is rejected).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('twins', 'twins', false, 26214400)
ON CONFLICT (id) DO NOTHING;
