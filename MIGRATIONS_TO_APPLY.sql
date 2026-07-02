-- =============================================================================
-- MIGRATIONS_TO_APPLY.sql  —  paste-ready DDL for the two new v180 agent tables
-- =============================================================================
-- WHY THIS FILE EXISTS: the Supabase Management/DDL channel is dead in this env
-- (personal access token 401, no DB password / connection string, no exec RPC),
-- so `supabase db push` cannot run here. The app code is already fail-soft, so
-- nothing crashes without these tables — the telemetry + optimizer simply don't
-- persist until you apply this.
--
-- HOW TO APPLY (2 minutes, no CLI):
--   1. Supabase dashboard → project zwksnayknzggdcenqqxy → SQL Editor → New query
--   2. Paste this ENTIRE file, Run.
--   3. Everything is additive + idempotent (CREATE ... IF NOT EXISTS): safe to
--      run more than once, and it drops/deletes NOTHING.
--
-- Verify after running:
--   select to_regclass('public.agent_execution_feedback')       as feedback_tbl,
--          to_regclass('public.prompt_optimization_proposals')  as proposals_tbl;
--   -- both columns should be non-null.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1/2 · agent_execution_feedback  (STEP 3.5 telemetry)
--   One row per asset interaction (download/edit/share/remix/discard). Feeds the
--   STEP 5 propose-only optimizer. RLS: owner-only insert/select; service role
--   (server) bypasses RLS for its own inserts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_execution_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id        UUID,
  agent_type      TEXT NOT NULL,              -- 'video' | 'audio' | 'script' | 'image'
  action          TEXT NOT NULL,              -- 'download' | 'edit' | 'share' | 'remix' | 'discard'
  model           TEXT,
  params_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_snapshot TEXT,
  latency_ms      INTEGER,
  cost_usd        NUMERIC(10,4),
  success         BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_feedback_type_created_idx
  ON public.agent_execution_feedback (agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_feedback_user_created_idx
  ON public.agent_execution_feedback (user_id, created_at DESC);

ALTER TABLE public.agent_execution_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_feedback_select_own ON public.agent_execution_feedback;
CREATE POLICY agent_feedback_select_own ON public.agent_execution_feedback
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS agent_feedback_insert_own ON public.agent_execution_feedback;
CREATE POLICY agent_feedback_insert_own ON public.agent_execution_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.agent_execution_feedback IS 'Per-interaction agent telemetry (download/edit/share/remix/discard) → feeds STEP 5 propose-only optimizer.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2/2 · prompt_optimization_proposals  (STEP 5 propose-only optimizer output)
--   The optimizer writes PROPOSALS here; it applies nothing. An admin reviews
--   and, if they choose, applies a change by hand. RLS: deny-all for anon/
--   authenticated (no policies); only the service role (via the isAdmin-gated
--   route) reads/writes. status starts 'proposed'; only a human sets the rest.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prompt_optimization_proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type    TEXT NOT NULL,                 -- 'video' | 'audio' | 'script' | 'image'
  model         TEXT,
  kind          TEXT NOT NULL,                 -- 'revise_prompt' | 'switch_model' | 'investigate'
  priority      TEXT NOT NULL DEFAULT 'medium',-- 'high' | 'medium' | 'low'
  rationale     TEXT NOT NULL,
  evidence      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'proposed', -- system only ever writes 'proposed'
  reviewed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prompt_proposals_status_created_idx
  ON public.prompt_optimization_proposals (status, created_at DESC);

-- At most one OPEN proposal per (agent_type, model, kind) so the daily runner
-- upserts instead of piling duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS prompt_proposals_open_unique
  ON public.prompt_optimization_proposals (agent_type, coalesce(model, ''), kind)
  WHERE status = 'proposed';

ALTER TABLE public.prompt_optimization_proposals ENABLE ROW LEVEL SECURITY;
-- Deny-all for anon/authenticated (no policies created). Service role bypasses RLS.

COMMENT ON TABLE public.prompt_optimization_proposals IS 'STEP 5 propose-only optimizer output. System writes status=proposed; humans apply. Never auto-mutated.';

-- =============================================================================
-- Done. Both are additive + RLS-guarded. Re-running is safe.
-- =============================================================================
