-- 20261009a — clear the Security Advisor's function warnings.
--
-- FOUND IN PRODUCTION ON 2026-10-09 (Security Advisor, then `pg_proc` read-only):
--   · 14 functions in `public` run with the caller's `search_path` (lint 0011 function_search_path_mutable). Five of
--     them are SECURITY DEFINER (claim_next_music_job, fetch_next_render_job, purge_expired_trashed_chats,
--     requeue_stale_jobs, set_render_job_progress); none of those five is executable by anon or authenticated, so
--     this is hardening, not an open hole. Every body names `public` tables (some unqualified, e.g. `render_jobs`) or
--     `auth.uid()`, and `match_memories` uses the `<=>` operator of `vector`, which lives in `public`. So the pinned
--     path is `public, pg_temp`: same lookups as today, minus whatever a caller puts ahead of them.
--   · 3 SECURITY DEFINER trigger functions are executable by anon and authenticated (lint 0028 / 0029):
--     chat_messages_fill_user_id, chat_messages_touch_session, support_touch_chat. PostgreSQL checks EXECUTE on a
--     trigger function only at CREATE TRIGGER, never when the trigger fires, so revoking it changes nothing for the
--     inserts and updates that fire them. They already pin `search_path = public`.
--
-- What it does not touch: EXECUTE grants on the other functions. `match_memories` is called by signed-in users
-- (app/api/chat/gemini/route.ts, `supabase.rpc('match_memories')` on the user's own client) and filters on
-- `auth.uid()`, so authenticated keeps it. No code calls the other 13 over RPC.
--
-- Idempotent. A function that does not exist in an environment is skipped, so it is safe on any database built from
-- this repo's older migrations.

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.claim_next_music_job(text)',
    'public.claim_next_music_job_debug()',
    'public.claim_next_render_job(text)',
    'public.claim_render_job()',
    'public.enqueue_music_job(text, integer)',
    'public.fail_stale_music_jobs(integer)',
    'public.fetch_next_render_job()',
    'public.match_memories(vector, integer)',
    'public.purge_expired_trashed_chats()',
    'public.requeue_stale_jobs(integer)',
    'public.set_render_job_progress(uuid, text, integer, text, text, text)',
    'public.set_updated_at()',
    'public.update_credits_balance()',
    'public.update_updated_at_column()'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
    END IF;
  END LOOP;

  FOREACH fn IN ARRAY ARRAY[
    'public.chat_messages_fill_user_id()',
    'public.chat_messages_touch_session()',
    'public.support_touch_chat()'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;
END
$$;

-- ── Self-verification ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad text;
BEGIN
  -- No function in `public` may run with the caller's search_path (extension-owned functions excluded).
  SELECT p.oid::regprocedure::text INTO bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '20261009a: % still has a mutable search_path', bad;
  END IF;

  -- No SECURITY DEFINER trigger function in `public` may be executable by anon or authenticated.
  SELECT p.oid::regprocedure::text INTO bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND p.prorettype = 'trigger'::regtype
    AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '20261009a: trigger function % is still executable by anon or authenticated', bad;
  END IF;
END
$$;
