-- MyAvatar.ge — generation_jobs.position_in_queue (Task 6, durable queue position)
-- =============================================================================
-- Adds the 1-based queue position a WAITING client job carries (status 'pending'), so a page
-- reload can restore the whole queue layout ("In Queue: #1"), not just the rendering jobs.
-- NULL once a job starts rendering or reaches a terminal state (completed | failed | canceled).
--
-- Strictly ADDITIVE + IDEMPOTENT: nullable, no default needed, no backfill, no RLS change (the
-- existing owner-scoped policies already gate every row). Safe to run more than once. The app
-- is written to fail-open if this column is absent (create/select fall back), so applying this
-- migration only ENABLES the feature — it never gates the existing durable-progress flow.
--
-- Apply via POST /api/admin/run-migration (generation_jobs is allow-listed) or the SQL editor.

ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS position_in_queue integer;

COMMENT ON COLUMN public.generation_jobs.position_in_queue IS
  '1-based queue position while a client job waits (status pending); NULL once rendering/terminal.';
