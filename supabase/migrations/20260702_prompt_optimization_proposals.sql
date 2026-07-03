-- MyAvatar.ge — prompt_optimization_proposals (STEP 5, propose-only optimizer)
-- =============================================================================
-- The self-improving loop writes PROPOSALS here (never applies them). An admin reviews and,
-- if they choose, applies a change by hand — the system moves nothing on its own. Additive +
-- idempotent. RLS: NO anon/authenticated policies (deny-all); only the service role (server,
-- via the isAdmin-gated route) reads/writes. `status` starts 'proposed'; only a human sets
-- 'accepted' | 'rejected' | 'applied'.
--
-- Apply with `supabase db push` or paste into the Supabase dashboard SQL editor.

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

-- Reviewers pull open proposals worst-first.
CREATE INDEX IF NOT EXISTS prompt_proposals_status_created_idx
  ON public.prompt_optimization_proposals (status, created_at DESC);

-- De-dupe: at most one OPEN proposal per (agent_type, model, kind). Lets the runner upsert
-- instead of piling identical proposals every day.
CREATE UNIQUE INDEX IF NOT EXISTS prompt_proposals_open_unique
  ON public.prompt_optimization_proposals (agent_type, coalesce(model, ''), kind)
  WHERE status = 'proposed';

ALTER TABLE public.prompt_optimization_proposals ENABLE ROW LEVEL SECURITY;
-- Deny-all for anon/authenticated (no policies created). The service role bypasses RLS; the
-- admin API route (lib/auth/adminGuard) is the only human entry point.

COMMENT ON TABLE public.prompt_optimization_proposals IS 'STEP 5 propose-only optimizer output. System writes status=proposed; humans apply. Never auto-mutated.';
