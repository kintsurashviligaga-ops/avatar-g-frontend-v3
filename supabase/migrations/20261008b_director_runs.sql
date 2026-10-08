-- 20261008b — `director_runs`: the stored state of the V1–V6 video director's runs (lib/video/director/run.ts).
-- NOT APPLIED — the owner applies it. Until it is, the director-run routes stay off (VIDEO_DIRECTOR_RUNS unset) and
-- nothing in the app reads or writes this table.
--
-- One row per run. `record` is the whole DirectorRunRecord (the frozen storyboard as approved, every shot's status,
-- attempt, charge and Veo operation, every ShotError). `state` and `version` repeat two of its fields so that each step
-- is ONE compare-and-set — UPDATE … WHERE id = $1 AND user_id = $2 AND version = $expected — and two concurrent steps
-- can never charge or submit the same shot twice.
--
-- SERVICE-ROLE ONLY: the routes read and write through the service role after their own auth check, and the record
-- holds Veo operation names the browser must not see. RLS is on with no policy and every client privilege revoked.
--
-- Idempotent: IF NOT EXISTS everywhere, REVOKE of a privilege not held is a no-op.

CREATE TABLE IF NOT EXISTS public.director_runs (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  state       text NOT NULL CHECK (state IN ('running', 'waiting_for_shot_decision', 'completed', 'cancelled')),
  version     integer NOT NULL CHECK (version >= 1),
  record      jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS director_runs_user_created_idx ON public.director_runs (user_id, created_at DESC);

ALTER TABLE public.director_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.director_runs FROM anon, authenticated;

-- ── Self-verification ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = 'director_runs' AND c.relrowsecurity) THEN
    RAISE EXCEPTION '20261008b: RLS is off on director_runs';
  END IF;
  IF has_table_privilege('anon', 'public.director_runs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.director_runs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.director_runs', 'INSERT')
     OR has_table_privilege('authenticated', 'public.director_runs', 'UPDATE') THEN
    RAISE EXCEPTION '20261008b: anon / authenticated still hold privileges on director_runs';
  END IF;
END
$$;
