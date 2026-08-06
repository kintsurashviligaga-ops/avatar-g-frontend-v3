-- ============================================================================
-- 20260802f_active_visitors.sql — who is on the site right now.
--
-- Apply BY HAND in the Supabase SQL Editor. Idempotent; VERIFY block at the end.
--
-- ⚠️ THIS IS A PRESENCE TABLE, NOT AN ANALYTICS LOG. It holds ONE row per visitor, overwritten on every
-- heartbeat — it never grows with history. A visitors table that appends would be the single
-- fastest-growing table in the product (one row per visitor per 45s) for a number the admin reads as a
-- single integer.
--
-- ⚠️ NO IP, NO USER-AGENT, NO REFERRER. The `id` is a random opaque token the browser generates and keeps
-- in localStorage; it identifies a browser for counting and nothing else. `user_id` is filled only when
-- the visitor is signed in. Storing an IP here would turn a live counter into a location log for every
-- anonymous reader of the terms page, which is not what "how many people are on the site" needs.
--
-- ⚠️ SERVICE-ROLE ONLY: RLS on, ZERO policies, no client grants. Anonymous visitors are counted, but they
-- write through /api/presence/ping (rate-limited) rather than touching the table — a public, unauthed
-- INSERT policy would be an unbounded write faucet on the cheapest endpoint in the product.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.active_visitors (
  -- Opaque browser token (crypto.randomUUID), NOT a user id and NOT derived from anything personal.
  id          text PRIMARY KEY CHECK (char_length(id) BETWEEN 8 AND 64),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Coarse: which SECTION they are in, never the full URL (a signed asset URL or a query string could
  -- carry a token, and this table is read by admins).
  section     text CHECK (section IS NULL OR char_length(section) <= 40),
  last_seen   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.active_visitors ADD COLUMN IF NOT EXISTS section text;

-- The only query the admin panel runs: count rows newer than the window.
CREATE INDEX IF NOT EXISTS active_visitors_last_seen_idx ON public.active_visitors (last_seen DESC);

COMMENT ON TABLE public.active_visitors IS
  'Live presence: ONE row per browser, overwritten each heartbeat, never appended. No IP/UA/referrer. '
  'Service-role only (RLS on, zero policies). Rows older than the window are swept by prune_active_visitors().';

ALTER TABLE public.active_visitors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.active_visitors FROM anon, authenticated;

-- ⚠️ WITHOUT THIS THE TABLE NEVER SHRINKS. A visitor who closes the tab stops pinging but their row
-- stays forever, so the "active now" count would only ever go up. Called opportunistically by the admin
-- read — no cron needed, and the table is small enough that the delete is trivial.
CREATE OR REPLACE FUNCTION public.prune_active_visitors()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.active_visitors WHERE last_seen < now() - interval '15 minutes';
$$;

COMMIT;

-- ============================================================================
-- VERIFY
DO $$
DECLARE v_rls boolean; v_pol int; v_grants int; v_idx int; v_fn int;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.active_visitors'::regclass;
  IF v_rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'VERIFY FAILED — RLS is not enabled'; END IF;

  SELECT count(*) INTO v_pol FROM pg_policies WHERE schemaname='public' AND tablename='active_visitors';
  IF v_pol <> 0 THEN RAISE EXCEPTION 'VERIFY FAILED — % policy(ies) exist; this table must have NONE', v_pol; END IF;

  SELECT count(*) INTO v_grants FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='active_visitors' AND grantee IN ('anon','authenticated');
  IF v_grants <> 0 THEN RAISE EXCEPTION 'VERIFY FAILED — anon/authenticated hold % grant(s)', v_grants; END IF;

  SELECT count(*) INTO v_idx FROM pg_indexes WHERE tablename='active_visitors' AND indexname='active_visitors_last_seen_idx';
  IF v_idx <> 1 THEN RAISE EXCEPTION 'VERIFY FAILED — last_seen index missing'; END IF;

  SELECT count(*) INTO v_fn FROM pg_proc WHERE proname='prune_active_visitors';
  IF v_fn <> 1 THEN RAISE EXCEPTION 'VERIFY FAILED — prune_active_visitors() missing; the table would never shrink'; END IF;

  RAISE NOTICE 'VERIFY OK — active_visitors: RLS on, zero policies, no client grants, index + prune present.';
END $$;
-- ============================================================================
