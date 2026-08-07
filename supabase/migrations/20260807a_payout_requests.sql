-- ============================================================================
-- 20260807a_payout_requests.sql — the affiliate payout ledger.
--
-- Apply BY HAND in the Supabase SQL Editor. Idempotent; VERIFY block at the end.
--
-- ⚠️ THE TABLE DOES NOT EXIST AND THE CODE HAS ALWAYS ASSUMED IT DID. Five routes read and write
-- `payout_requests`; every one of them has been failing since it was written. The admin approve route
-- discarded the error and returned 200, so the panel reported payouts as approved that were never
-- recorded anywhere.
--
-- ⚠️ SERVICE-ROLE ONLY: RLS on, ZERO policies. These rows are money owed to people. A SELECT policy would
-- let one affiliate read another's balance; an UPDATE policy would let the payee change their own amount
-- or mark their own request approved — which is precisely the class of hole just closed in the API gate.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.payout_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Money in the smallest unit. NEVER a float: 0.1 + 0.2 is not 0.3, and this is somebody's payout.
  amount_cents    integer NOT NULL CHECK (amount_cents > 0),
  currency        text NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','paid')),
  method          text,
  destination     text,
  -- ⚠️ WHO DECIDED, AND WHEN. A money action with no author is not auditable. The API guards on
  -- `status = 'pending'` so a second approve matches no row, which is what makes these single-valued.
  approved_by     uuid REFERENCES auth.users(id),
  approved_at     timestamptz,
  rejected_by     uuid REFERENCES auth.users(id),
  rejected_at     timestamptz,
  reject_reason   text,
  paid_at         timestamptz,
  -- The provider's transfer id, once money actually moves. UNIQUE so a replayed payout cannot be
  -- recorded twice against one transfer.
  transfer_ref    text UNIQUE,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- A decision must carry its author. Without this a row can say 'approved' with approved_by NULL, which
  -- is exactly the unauditable state the columns were added to prevent.
  CONSTRAINT payout_decision_has_author CHECK (
    (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)) AND
    (status <> 'rejected' OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL))
  )
);

-- ⚠️ ONE OPEN REQUEST PER AFFILIATE. Without this an affiliate can queue five 'pending' rows for the same
-- balance and have each approved separately — the same money paid five times.
CREATE UNIQUE INDEX IF NOT EXISTS payout_requests_one_open_idx
  ON public.payout_requests (affiliate_id) WHERE status = 'pending';

-- The admin queue: oldest pending first.
CREATE INDEX IF NOT EXISTS payout_requests_status_idx ON public.payout_requests (status, requested_at);
CREATE INDEX IF NOT EXISTS payout_requests_affiliate_idx ON public.payout_requests (affiliate_id, requested_at DESC);

COMMENT ON TABLE public.payout_requests IS
  'Affiliate payout ledger. Service-role only: RLS on, zero policies — these rows are money owed, and the '
  'payee must not be able to read others'' or edit their own. Decisions carry approved_by/rejected_by.';

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payout_requests FROM anon, authenticated;

COMMIT;

-- ============================================================================
-- VERIFY
DO $$
DECLARE v_rls boolean; v_pol int; v_grants int; v_open int; v_auth int;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.payout_requests'::regclass;
  IF v_rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'VERIFY FAILED — RLS is not enabled'; END IF;

  SELECT count(*) INTO v_pol FROM pg_policies WHERE schemaname='public' AND tablename='payout_requests';
  IF v_pol <> 0 THEN RAISE EXCEPTION 'VERIFY FAILED — % policy(ies) exist; this table must have NONE', v_pol; END IF;

  SELECT count(*) INTO v_grants FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='payout_requests' AND grantee IN ('anon','authenticated');
  IF v_grants <> 0 THEN RAISE EXCEPTION 'VERIFY FAILED — anon/authenticated hold % grant(s)', v_grants; END IF;

  SELECT count(*) INTO v_open FROM pg_indexes
   WHERE schemaname='public' AND indexname='payout_requests_one_open_idx';
  IF v_open <> 1 THEN RAISE EXCEPTION 'VERIFY FAILED — the one-open-request-per-affiliate index is missing'; END IF;

  SELECT count(*) INTO v_auth FROM pg_constraint
   WHERE conrelid='public.payout_requests'::regclass AND conname='payout_decision_has_author';
  IF v_auth <> 1 THEN RAISE EXCEPTION 'VERIFY FAILED — a decision could be recorded with no author'; END IF;

  RAISE NOTICE 'VERIFY OK — payout_requests: RLS on, zero policies, no client grants, one open request per affiliate, every decision authored.';
END $$;
-- ============================================================================
