-- ============================================================================
-- 20260802e_admin_emails.sql — grant admin access by EMAIL, from the admin panel.
--
-- Apply BY HAND in the Supabase SQL Editor. Idempotent; VERIFY block at the end.
--
-- WHY. The allowlist was code + env only (DEFAULT_ADMIN_EMAILS ∪ ADMIN_EMAILS), so adding a colleague
-- meant a Vercel env edit and a redeploy. This table is a THIRD source, merged on top — it can only ever
-- ADD admins, never remove the built-in founder.
--
-- ⚠️ THIS TABLE IS AN AUTHORISATION BOUNDARY, SO IT IS SERVICE-ROLE ONLY. RLS is enabled with NO policy
-- at all: `authenticated` and `anon` therefore match nothing and cannot read it, let alone write. Every
-- access goes through /api/admin/admins, which is itself behind isAdmin(). A SELECT policy would leak the
-- list of privileged accounts to any signed-in user — a target list.
--
-- ⚠️ AND IT MUST NEVER BE THE ONLY SOURCE. If this table is empty, unreachable, or dropped, the code
-- falls back to the env + built-in list, so a database problem can never lock the founder out of their
-- own admin panel. That is why the resolver fails CLOSED (fewer admins) rather than open.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_emails (
  -- Stored lowercase and used as the key: the lookup is a case-insensitive identity check, and a CHECK
  -- is cheaper to reason about than remembering to fold case at four call sites.
  email       text PRIMARY KEY CHECK (email = lower(email) AND position('@' in email) > 1),
  -- Audit: WHO granted this, and when. An unattributed privilege grant is unauditable.
  added_by    text NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_emails ADD COLUMN IF NOT EXISTS note text;

COMMENT ON TABLE public.admin_emails IS
  'Additional admin-panel emails, merged ON TOP of DEFAULT_ADMIN_EMAILS + the ADMIN_EMAILS env. '
  'Service-role only: RLS is on with NO policy, so no client can read or write it. Never the sole '
  'source — an empty or unreachable table falls back to code+env so the founder cannot be locked out.';

-- RLS ON, deliberately WITHOUT any policy: that denies every non-service-role request.
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_emails FROM anon, authenticated;

COMMIT;

-- ============================================================================
-- VERIFY
DO $$
DECLARE v_rls boolean; v_pol int; v_grants int;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.admin_emails'::regclass;
  IF v_rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'VERIFY FAILED — RLS is not enabled'; END IF;

  SELECT count(*) INTO v_pol FROM pg_policies WHERE schemaname='public' AND tablename='admin_emails';
  IF v_pol <> 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED — % policy(ies) exist; this table must have NONE so clients match nothing', v_pol;
  END IF;

  SELECT count(*) INTO v_grants FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='admin_emails' AND grantee IN ('anon','authenticated');
  IF v_grants <> 0 THEN RAISE EXCEPTION 'VERIFY FAILED — anon/authenticated still hold % grant(s)', v_grants; END IF;

  RAISE NOTICE 'VERIFY OK — admin_emails exists, RLS on, zero policies, no client grants (service-role only).';
END $$;

-- Add the first extra admin from here if you like (the panel does the same thing):
--   INSERT INTO public.admin_emails (email, added_by, note)
--   VALUES (lower('colleague@example.com'), 'kintsurashviligaga@gmail.com', 'ops')
--   ON CONFLICT (email) DO NOTHING;
-- ============================================================================
