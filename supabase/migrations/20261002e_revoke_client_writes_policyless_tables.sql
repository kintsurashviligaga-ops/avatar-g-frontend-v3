-- 20261002d — take client WRITE privileges off tables whose RLS grants no client write anyway (NOT APPLIED — owner applies).
--
-- Found by the 2026-10-02 security lockdown (read-only introspection of project zwksnayknzggdcenqqxy):
-- Supabase's default `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated` left INSERT/UPDATE/DELETE/TRUNCATE
-- on these tables for BOTH client roles. Every one has RLS ON and NO insert/update/delete policy, so PostgREST refuses
-- every client write today — the privileges are inert. They are revoked anyway, because RLS is then the ONLY thing
-- between the public anon key and money/config rows: one permissive policy added later, or RLS switched off during a
-- debugging session, and pricing tiers, feature flags, agent configs or credit history become writable by anyone.
-- Same reasoning as 20260929a (which did this for profiles / credit_ledger / wallet_topups).
--
-- NOTHING IN THE APP WRITES THESE AS A CLIENT ROLE: every writer is a service-role module (checked: no browser
-- supabase-js write, no session-client write; and a client write is refused by RLS today regardless). SELECT is left
-- as it is (RLS decides it). generation_jobs keeps DELETE — the owner-delete policy (removing one's own history row)
-- is intentional (20261001f); only INSERT/UPDATE/TRUNCATE go, matching the policies 20261001f dropped.
--
-- ⚠️ bog_orders has the same shape (ALL privileges to both roles, only an owner-SELECT policy) but belongs to the BOG
-- billing rewrite — reported there, deliberately NOT touched here.
--
-- Idempotent: REVOKE of a privilege not held is a no-op, and a table missing in this environment is skipped.

DO $$
DECLARE
  t text;
  client_write_tables text[] := ARRAY[
    'pricing_tiers', 'commission_rules', 'feature_flags',             -- runtime billing + flag config (admin panel, service role)
    'credit_transactions', 'transactions',                            -- legacy money history
    'agent_configs', 'prompt_optimization_proposals',                 -- agent self-optimisation config
    'agent_evolution_traces', 'project_intelligence', 'artifacts',    -- server-written pipeline/telemetry rows
    'job_steps', 'clip_cache', 'generation_checkpoints',
    'music_jobs', 'Music_jobs', 'analytics_events'
  ];
BEGIN
  FOREACH t IN ARRAY client_write_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;

  IF to_regclass('public.generation_jobs') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, TRUNCATE ON public.generation_jobs FROM anon, authenticated;
  END IF;
END
$$;

-- Self-verification: fail loudly if any client role still holds a write privilege on the tables above.
DO $$
DECLARE
  leftover text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO leftover
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY (ARRAY['pricing_tiers','commission_rules','feature_flags','credit_transactions','transactions',
                               'agent_configs','prompt_optimization_proposals','agent_evolution_traces','project_intelligence',
                               'artifacts','job_steps','clip_cache','generation_checkpoints','music_jobs','Music_jobs',
                               'analytics_events'])
    AND (has_table_privilege('anon', c.oid, 'INSERT') OR has_table_privilege('anon', c.oid, 'UPDATE')
         OR has_table_privilege('anon', c.oid, 'DELETE')
         OR has_table_privilege('authenticated', c.oid, 'INSERT') OR has_table_privilege('authenticated', c.oid, 'UPDATE')
         OR has_table_privilege('authenticated', c.oid, 'DELETE'));
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION '20261002d: client roles still hold write privileges on: %', leftover;
  END IF;

  IF to_regclass('public.generation_jobs') IS NOT NULL
     AND (has_table_privilege('anon', 'public.generation_jobs', 'INSERT') OR has_table_privilege('anon', 'public.generation_jobs', 'UPDATE')
          OR has_table_privilege('authenticated', 'public.generation_jobs', 'INSERT')
          OR has_table_privilege('authenticated', 'public.generation_jobs', 'UPDATE')) THEN
    RAISE EXCEPTION '20261002d: client roles can still INSERT/UPDATE public.generation_jobs';
  END IF;
END
$$;
