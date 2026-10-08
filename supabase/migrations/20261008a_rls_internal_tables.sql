-- 20261008a — RLS on the internal tables the anon key could read and write, and close the public tracking-token list.
-- APPLIED to Production (zwksnayknzggdcenqqxy) on 2026-10-08. None of the nine tables exists there, so it changed
-- nothing in Production; it locks them down in every environment where an older migration created them.
-- The `uploads` bucket cap that used to be section 3 of this file is now 20261008c (applied with the deploy).
--
-- 1. RLS ON + client privileges off for tables created with RLS never enabled. Supabase grants ALL on every public
--    table to anon and authenticated, so with RLS off the public anon key could SELECT / INSERT / UPDATE / DELETE:
--      smm_projects, smm_posts, smm_assets   (Social media manager projects, captions, asset URLs)
--      agent_g_events                       (Agent G conversation events, per user)
--      runtime_logs, job_runtime_logs       (request / job telemetry, user ids, routes)
--      worker_heartbeat                     (worker fleet state)
--      stripe_events                        (Stripe event log, payloads)
--    Every writer in the app is a service-role module (checked: app/api/smm/*, lib/agent-g/memory.ts,
--    lib/observability/runtime.ts, workers/shared/*, app/api/admin/stats, app/api/agents/status), and the service
--    role bypasses RLS, so nothing in the app changes.
--      • Tables with an owner column get an owner-only SELECT for `authenticated` (no client writes):
--          smm_projects.owner_id; smm_posts / smm_assets through their project; agent_g_events.user_id.
--        Both owner columns are TEXT, so they are compared with auth.uid()::text.
--      • The rest are service-role only: every privilege revoked from anon and authenticated, no policy.
--    app/api/admin/payments reads stripe_events through the service role after its admin check (same change set).
--
-- 2. tracking_tokens: 014 created `tracking_tokens_public_policy … FOR SELECT USING (TRUE)`, so anyone holding the
--    anon key could list EVERY tracking token and open every buyer's tracking page. The only reader,
--    /api/tracking/[id] → ShippingService.getShipmentForTracking, already uses the service role and looks one token
--    up by value. The policy goes and the table becomes service-role only.
--
-- Idempotent: tables missing in this environment are skipped, policies are dropped before they are created, and
-- REVOKE of a privilege not held is a no-op.

-- ── 1a. Owner-scoped tables ──────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['smm_projects', 'smm_posts', 'smm_assets', 'agent_g_events'] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    END IF;
  END LOOP;

  IF to_regclass('public.smm_projects') IS NOT NULL THEN
    DROP POLICY IF EXISTS smm_projects_owner_select ON public.smm_projects;
    CREATE POLICY smm_projects_owner_select ON public.smm_projects
      FOR SELECT TO authenticated
      USING (owner_id = (SELECT auth.uid())::text);
  END IF;

  IF to_regclass('public.smm_posts') IS NOT NULL AND to_regclass('public.smm_projects') IS NOT NULL THEN
    DROP POLICY IF EXISTS smm_posts_owner_select ON public.smm_posts;
    CREATE POLICY smm_posts_owner_select ON public.smm_posts
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.smm_projects p
        WHERE p.id = smm_posts.project_id AND p.owner_id = (SELECT auth.uid())::text
      ));
  END IF;

  IF to_regclass('public.smm_assets') IS NOT NULL AND to_regclass('public.smm_posts') IS NOT NULL
     AND to_regclass('public.smm_projects') IS NOT NULL THEN
    DROP POLICY IF EXISTS smm_assets_owner_select ON public.smm_assets;
    CREATE POLICY smm_assets_owner_select ON public.smm_assets
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.smm_posts po JOIN public.smm_projects p ON p.id = po.project_id
        WHERE po.id = smm_assets.post_id AND p.owner_id = (SELECT auth.uid())::text
      ));
  END IF;

  IF to_regclass('public.agent_g_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS agent_g_events_owner_select ON public.agent_g_events;
    CREATE POLICY agent_g_events_owner_select ON public.agent_g_events
      FOR SELECT TO authenticated
      USING (user_id = (SELECT auth.uid())::text);
  END IF;
END
$$;

-- ── 1b + 2. Service-role-only tables ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  IF to_regclass('public.tracking_tokens') IS NOT NULL THEN
    DROP POLICY IF EXISTS tracking_tokens_public_policy ON public.tracking_tokens;
  END IF;

  FOREACH t IN ARRAY ARRAY['runtime_logs', 'job_runtime_logs', 'worker_heartbeat', 'stripe_events', 'tracking_tokens'] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END
$$;

-- ── Self-verification: fail loudly if anything above did not take ────────────────────────────────────────────────
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY (ARRAY['smm_projects','smm_posts','smm_assets','agent_g_events','runtime_logs',
                               'job_runtime_logs','worker_heartbeat','stripe_events','tracking_tokens'])
    AND NOT c.relrowsecurity;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '20261008a: RLS is still off on: %', bad;
  END IF;

  SELECT string_agg(c.relname, ', ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY (ARRAY['smm_projects','smm_posts','smm_assets','agent_g_events','runtime_logs',
                               'job_runtime_logs','worker_heartbeat','stripe_events','tracking_tokens'])
    AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
         OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE')
         OR has_table_privilege('authenticated', c.oid, 'INSERT') OR has_table_privilege('authenticated', c.oid, 'UPDATE')
         OR has_table_privilege('authenticated', c.oid, 'DELETE'));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '20261008a: anon / authenticated still hold privileges on: %', bad;
  END IF;

  SELECT string_agg(c.relname, ', ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY (ARRAY['runtime_logs','job_runtime_logs','worker_heartbeat','stripe_events','tracking_tokens'])
    AND has_table_privilege('authenticated', c.oid, 'SELECT');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '20261008a: authenticated can still read service-role-only tables: %', bad;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tracking_tokens'
             AND policyname = 'tracking_tokens_public_policy') THEN
    RAISE EXCEPTION '20261008a: tracking_tokens_public_policy still exists';
  END IF;
END
$$;
