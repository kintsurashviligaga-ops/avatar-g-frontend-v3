-- MyAvatar.ge — agent_execution_feedback (STEP 3.5, self-improvement telemetry)
-- =============================================================================
-- One row per asset interaction (download/edit/share/remix/discard). A later
-- (STEP 5) offline judge compares low-signal vs high-signal generations to
-- PROPOSE (never auto-apply) prompt/param tweaks. Additive + idempotent.
-- RLS: a user inserts + reads ONLY their own rows; the service role bypasses
-- RLS for server-side inserts (recordAgentFeedback in lib/agent/feedback.ts).
--
-- Apply with `supabase db push` or paste into the Supabase dashboard SQL editor.

CREATE TABLE IF NOT EXISTS public.agent_execution_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id        UUID,                       -- library/generation asset, if any
  agent_type      TEXT NOT NULL,              -- 'video' | 'audio' | 'script' | 'image'
  action          TEXT NOT NULL,              -- 'download' | 'edit' | 'share' | 'remix' | 'discard'
  model           TEXT,                       -- e.g. 'kling-v1.6-standard'
  params_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_snapshot TEXT,
  latency_ms      INTEGER,
  cost_usd        NUMERIC(10,4),
  success         BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query axis for the STEP 5 judge: "recent interactions for this agent_type".
CREATE INDEX IF NOT EXISTS agent_feedback_type_created_idx
  ON public.agent_execution_feedback (agent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_feedback_user_created_idx
  ON public.agent_execution_feedback (user_id, created_at DESC);

ALTER TABLE public.agent_execution_feedback ENABLE ROW LEVEL SECURITY;

-- Owner-only read.
DROP POLICY IF EXISTS agent_feedback_select_own ON public.agent_execution_feedback;
CREATE POLICY agent_feedback_select_own ON public.agent_execution_feedback
  FOR SELECT USING (auth.uid() = user_id);

-- Owner-only insert (client may file its own signal; service role bypasses RLS).
DROP POLICY IF EXISTS agent_feedback_insert_own ON public.agent_execution_feedback;
CREATE POLICY agent_feedback_insert_own ON public.agent_execution_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.agent_execution_feedback IS 'Per-interaction agent telemetry (download/edit/share/remix/discard) → feeds STEP 5 propose-only optimizer.';
