-- Avatar G — pipeline checkpoints + cost columns (Pipeline Iteration, Phase 7B/6B)
-- ================================================================================
-- Additive + idempotent. Activates the fail-open features shipped in this iteration:
--   • generation_checkpoints — per-clip render checkpoints (lib/pipeline/checkpoints.ts)
--     so a re-render / re-assemble reuses surviving clips instead of re-paying.
--   • generation_jobs cost columns — admin-queryable cost/duration (also written to
--     result JSONB today, so the app works with or without these columns).
-- Apply via the Supabase dashboard SQL editor or `supabase db push`.

-- Per-clip checkpoints (job_id == the film token; scene_index is 0-based).
CREATE TABLE IF NOT EXISTS public.generation_checkpoints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        TEXT NOT NULL,
  scene_index   INTEGER NOT NULL,
  clip_url      TEXT NOT NULL,
  checkpoint_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, scene_index)
);
CREATE INDEX IF NOT EXISTS generation_checkpoints_job_idx
  ON public.generation_checkpoints (job_id);
-- Service-role only (server writes/reads); RLS on with no public policy.
ALTER TABLE public.generation_checkpoints ENABLE ROW LEVEL SECURITY;

-- Optional cross-render clip cache (keyed by a scene+character signature). Reserved
-- for a future same-user clip-reuse optimization; safe to create now.
CREATE TABLE IF NOT EXISTS public.clip_cache (
  cache_key  TEXT PRIMARY KEY,
  clip_url   TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clip_cache_expires_idx ON public.clip_cache (expires_at);
ALTER TABLE public.clip_cache ENABLE ROW LEVEL SECURITY;

-- Admin-queryable cost + duration on generation_jobs (also in result JSONB).
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS cost_usd     DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS cost_gel     DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS duration_ms  INTEGER;
