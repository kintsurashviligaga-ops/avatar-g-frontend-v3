-- Avatar G — credit_wallet_gel column + agent_evolution_traces ledger
-- =====================================================================
-- Adds:
--   1. credits.balance_gel        NUMERIC(12,2) — fractional GEL balance
--                                  alongside the existing integer balance
--                                  so the front-end can display 52.00 ₾.
--   2. agent_evolution_traces     ledger of every downstream agent run, used
--                                  by the Founder Audit Mode to compute
--                                  wholesale spend vs. retail inflows and the
--                                  3.5x–4.0x net-profit-margin multiplier.
--
-- All changes are ADDITIVE (IF NOT EXISTS). No data is dropped, no existing
-- column is repurposed. Safe to re-run.
--
-- Apply with `supabase db push` or via the Supabase dashboard SQL editor.

-- ── 1. credits.balance_gel ─────────────────────────────────────────────────
ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS balance_gel NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Seed the new column from the integer balance for existing rows.
-- (1 credit ≈ 1 ₾ per credit_wallet_gel() reconciliation.)
UPDATE public.credits
   SET balance_gel = balance::NUMERIC
 WHERE balance_gel = 0;

COMMENT ON COLUMN public.credits.balance_gel IS
  'Fractional GEL wallet balance. Mirrors integer balance for legacy compat; '
  'authoritative for fractional charges and Founder audit math.';

-- ── 2. agent_evolution_traces ─────────────────────────────────────────────
-- One row per worker-agent invocation. Captures the unit-cost paid downstream
-- (Replicate / RunPod / ElevenLabs / OpenAI / etc.) and the retail amount
-- charged to the user wallet, so the audit engine can join the two.

CREATE TABLE IF NOT EXISTS public.agent_evolution_traces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_id        TEXT NOT NULL,                  -- 'image-agent', 'music-agent', etc.
  worker_kind     TEXT NOT NULL,                  -- 'replicate' | 'runpod' | 'elevenlabs' | 'openai' | 'gemini' | 'nanobanana'
  action          TEXT,                            -- 'generate_image', 'tts', etc.
  prompt_summary  TEXT,                            -- short (first 200 chars) — analytics-friendly
  output_summary  TEXT,                            -- short result blurb / URL
  cost_wholesale_gel  NUMERIC(12,4) NOT NULL DEFAULT 0,  -- what WE paid the provider
  cost_retail_gel     NUMERIC(12,4) NOT NULL DEFAULT 0,  -- what the user paid us
  latency_ms      INTEGER,
  status          TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded','failed','timeout')),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_evolution_traces_user_time_idx
  ON public.agent_evolution_traces (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_evolution_traces_agent_time_idx
  ON public.agent_evolution_traces (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_evolution_traces_worker_time_idx
  ON public.agent_evolution_traces (worker_kind, created_at DESC);

ALTER TABLE public.agent_evolution_traces ENABLE ROW LEVEL SECURITY;

-- Owners can read their own traces; the founder (service-role) reads all via
-- the platform RPC and bypasses RLS automatically.
DROP POLICY IF EXISTS agent_traces_owner_select ON public.agent_evolution_traces;
CREATE POLICY agent_traces_owner_select ON public.agent_evolution_traces
  FOR SELECT USING (auth.uid() = user_id);

-- ── 3. founder_financial_audit() RPC ──────────────────────────────────────
-- Aggregates wholesale spend and retail inflows over a window. Restricted to
-- service-role callers (the Founder Audit Mode passes the service key).

CREATE OR REPLACE FUNCTION public.founder_financial_audit(
  p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_until TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  wholesale_spend_gel  NUMERIC(14,4),
  retail_inflows_gel   NUMERIC(14,4),
  net_margin_gel       NUMERIC(14,4),
  margin_multiplier    NUMERIC(8,3),
  worker_count         INTEGER,
  user_count           INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wholesale NUMERIC(14,4) := 0;
  v_retail    NUMERIC(14,4) := 0;
  v_workers   INTEGER := 0;
  v_users     INTEGER := 0;
BEGIN
  SELECT
    COALESCE(SUM(cost_wholesale_gel), 0),
    COALESCE(SUM(cost_retail_gel), 0),
    COUNT(*)::INTEGER,
    COUNT(DISTINCT user_id)::INTEGER
  INTO v_wholesale, v_retail, v_workers, v_users
  FROM public.agent_evolution_traces
  WHERE created_at >= p_since AND created_at < p_until AND status = 'succeeded';

  RETURN QUERY SELECT
    v_wholesale,
    v_retail,
    (v_retail - v_wholesale),
    CASE WHEN v_wholesale > 0 THEN (v_retail / v_wholesale) ELSE NULL END,
    v_workers,
    v_users;
END;
$$;

COMMENT ON FUNCTION public.founder_financial_audit IS
  'Founder-only aggregate: wholesale infra spend, retail wallet inflows, net '
  'margin, and the multiplier (target 3.5x–4.0x). Service-role only.';

-- ── done ──────────────────────────────────────────────────────────────────
