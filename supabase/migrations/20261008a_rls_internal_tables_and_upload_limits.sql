-- 20261008a — RLS on the internal tables the anon key could read and write, close the public tracking-token list,
-- and cap the `uploads` bucket. NOT APPLIED — the owner applies it.
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
-- 3. Storage bucket `uploads` (UPLOAD_BUCKET): 50 MB per object and images / video / audio only — the same policy
--    /api/upload and /api/upload/sign now enforce (lib/uploads/policy.ts, which a test keeps in step with the list
--    below). A signed upload URL is a direct PUT to storage that no route sees, so only the bucket can hold a client
--    to it. Server-side writers that can exceed 50 MB or are not media (rendered videos, RVC zips) now write to
--    `renders` instead. ⚠️ If UPLOAD_BUCKET names a different bucket in production, apply section 3 to that bucket.
--
-- Idempotent: tables missing in this environment are skipped, policies are dropped before they are created,
-- REVOKE of a privilege not held is a no-op, and the bucket row is upserted.

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

-- ── 3. The `uploads` bucket: 50 MB, images / video / audio ───────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads', 'uploads', false, 52428800,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/x-matroska',
    'video/x-msvideo', 'video/mpeg', 'video/ogg',
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac', 'audio/wav',
    'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/webm', 'audio/ogg', 'audio/opus', 'audio/flac',
    'audio/x-flac', 'audio/aiff', 'audio/x-aiff', 'audio/3gpp', 'audio/amr'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

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

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'uploads' AND file_size_limit = 52428800
                 AND allowed_mime_types IS NOT NULL AND NOT ('text/html' = ANY (allowed_mime_types))) THEN
    RAISE EXCEPTION '20261008a: the uploads bucket limits did not apply';
  END IF;
END
$$;
