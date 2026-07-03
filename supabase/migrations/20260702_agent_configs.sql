-- MyAvatar.ge — agent_configs (STEP 5, versioned live config + approval promotion)
-- =============================================================================
-- Live prompts/params for a target ('kling' | 'elevenlabs' | …) are VERSIONED here: exactly one
-- row per target is is_active=true. Approving a prompt_optimization_proposals row PROMOTES a NEW
-- version (is_active=true) and deactivates the prior — which stays for instant ROLLBACK. The
-- optimizer NEVER promotes; only an admin action (via promote_agent_config) does. Additive +
-- idempotent. RLS: deny-all (service-role only, behind the isAdmin-gated route).
--
-- Apply with `supabase db push` or paste into the Supabase dashboard SQL editor.

CREATE TABLE IF NOT EXISTS public.agent_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target      TEXT NOT NULL,                 -- 'kling' | 'elevenlabs' | model id
  version     INTEGER NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  params      JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- version is unique per target; at most ONE active row per target (the live config).
CREATE UNIQUE INDEX IF NOT EXISTS agent_configs_target_version ON public.agent_configs (target, version);
CREATE UNIQUE INDEX IF NOT EXISTS agent_configs_one_active ON public.agent_configs (target) WHERE is_active;

ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
-- deny-all (no anon/authenticated policies); service role bypasses RLS.

COMMENT ON TABLE public.agent_configs IS 'STEP 5 versioned live config. One active row per target; promotion keeps the prior version for rollback. Never auto-mutated.';

-- Proposals carry the concrete change to promote (additive to prompt_optimization_proposals).
ALTER TABLE public.prompt_optimization_proposals ADD COLUMN IF NOT EXISTS proposed_params  JSONB;
ALTER TABLE public.prompt_optimization_proposals ADD COLUMN IF NOT EXISTS proposed_prompt  TEXT;

-- Atomic promotion: deactivate the current active for the target, insert the next version as
-- active, return the new version. A function call runs in one transaction → no window with two
-- active rows (and the partial unique index is a hard backstop).
CREATE OR REPLACE FUNCTION public.promote_agent_config(p_target TEXT, p_params JSONB, p_prompt TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next FROM public.agent_configs WHERE target = p_target;
  UPDATE public.agent_configs SET is_active = false WHERE target = p_target AND is_active;
  INSERT INTO public.agent_configs (target, version, is_active, params, prompt)
  VALUES (p_target, v_next, true, COALESCE(p_params, '{}'::jsonb), p_prompt);
  RETURN v_next;
END;
$$;

-- Instant rollback: re-activate a prior version for a target (deactivating the current active).
CREATE OR REPLACE FUNCTION public.rollback_agent_config(p_target TEXT, p_version INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.agent_configs SET is_active = false WHERE target = p_target AND is_active;
  UPDATE public.agent_configs SET is_active = true  WHERE target = p_target AND version = p_version;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_agent_config(TEXT, JSONB, TEXT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.rollback_agent_config(TEXT, INTEGER) FROM anon, authenticated;
