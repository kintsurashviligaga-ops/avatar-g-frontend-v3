-- ============================================================================
-- 20260807b_voice_calls.sql — the voice-call log the webhook has always written to.
--
-- Apply BY HAND in the Supabase SQL Editor. Idempotent; VERIFY block at the end.
--
-- ⚠️ THE TABLE DOES NOT EXIST AND THE CODE HAS ALWAYS ASSUMED IT DID. lib/voice/repository.ts inserts,
-- reads and updates `voice_calls` from five places; the dev server logs
-- `voice.repository.insert_failed: Could not find the table 'public.voice_calls'` on every call. So every
-- voice call ever placed has gone unrecorded: no transcript, no duration, no credit accounting.
--
-- ⚠️ `vapi_call_id` IS UNIQUE, AND THAT IS THE WHOLE POINT. Vapi RETRIES its webhooks — the route itself
-- retries up to four times on failure. Without this constraint one call becomes several rows, each with
-- its own `credits_used`, and the user is billed once per delivery attempt rather than once per call.
--
-- ⚠️ `status` DELIBERATELY HAS NO CHECK. It comes from the PROVIDER, not from us, and a strict list would
-- reject a status Vapi adds later — turning an unknown value into a LOST CALL RECORD. For an append-only
-- webhook sink, refusing the row is worse than storing a string we do not recognise. `direction` does
-- carry a CHECK, because lib/voice/webhook-processing.ts derives it from a closed set of our own.
--
-- ⚠️ `user_id` IS NULLABLE. An inbound call from a number that belongs to nobody is still a call, and
-- NOT NULL here would make the webhook fail closed and drop exactly the records worth having.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.voice_calls (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable on purpose — see the header. ON DELETE SET NULL keeps the call record (and its billing
  -- history) after an account is removed; the transcript is scrubbed separately if ever needed.
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- The provider's id for this call. UNIQUE = one row per call, however many times Vapi delivers it.
  vapi_call_id      text UNIQUE,
  direction         text NOT NULL DEFAULT 'web'
                    CHECK (direction IN ('inbound','outbound','web','unknown')),
  -- Provider-supplied; no CHECK by design (see the header).
  status            text NOT NULL DEFAULT 'initiated',
  duration_seconds  integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  transcript        text,
  summary           text,
  -- Never negative: a call that refunds credits is a refund elsewhere, not a negative charge here.
  credits_used      integer NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  phone_number      text,
  -- The provider's failure reason for a call that did not complete. The repository writes this on every
  -- insert; a schema without it fails the insert outright, which is how a whole table goes missing
  -- without anyone noticing — the write errors, the log line scrolls past, and no call is ever recorded.
  error             text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,

  -- A call cannot end before it began.
  CONSTRAINT voice_calls_ends_after_start CHECK (ended_at IS NULL OR ended_at >= created_at)
);

-- The two reads the app makes: a user's own history, and a lookup by provider id on webhook delivery.
CREATE INDEX IF NOT EXISTS voice_calls_user_idx ON public.voice_calls (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_calls_created_idx ON public.voice_calls (created_at DESC);

COMMENT ON TABLE public.voice_calls IS
  'Voice call log written by the Vapi webhook. Service-role only: RLS on, zero policies — rows hold call '
  'transcripts and phone numbers. vapi_call_id is UNIQUE so a retried webhook cannot bill a call twice.';

ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.voice_calls FROM anon, authenticated;

COMMIT;

-- ============================================================================
-- VERIFY
DO $$
DECLARE v_rls boolean; v_pol int; v_grants int; v_uniq int;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.voice_calls'::regclass;
  IF v_rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'VERIFY FAILED — RLS is not enabled'; END IF;

  SELECT count(*) INTO v_pol FROM pg_policies WHERE schemaname='public' AND tablename='voice_calls';
  IF v_pol <> 0 THEN RAISE EXCEPTION 'VERIFY FAILED — % policy(ies) exist; transcripts must not be client-readable', v_pol; END IF;

  SELECT count(*) INTO v_grants FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='voice_calls' AND grantee IN ('anon','authenticated');
  IF v_grants <> 0 THEN RAISE EXCEPTION 'VERIFY FAILED — anon/authenticated hold % grant(s)', v_grants; END IF;

  -- The billing guarantee: without it a retried webhook charges the same call again.
  SELECT count(*) INTO v_uniq FROM pg_constraint
   WHERE conrelid='public.voice_calls'::regclass AND contype='u';
  IF v_uniq < 1 THEN RAISE EXCEPTION 'VERIFY FAILED — vapi_call_id UNIQUE constraint missing; a retried webhook would bill twice'; END IF;

  RAISE NOTICE 'VERIFY OK — voice_calls: RLS on, zero policies, no client grants, vapi_call_id UNIQUE, 2 indexes.';
END $$;
-- ============================================================================
