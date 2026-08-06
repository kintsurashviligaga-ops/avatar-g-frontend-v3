-- ============================================================================
-- 20260802g_agent_video_queue.sql — durable queue for Agent G's batch video runs.
--
-- Apply BY HAND in the Supabase SQL Editor. Idempotent; VERIFY block at the end.
--
-- WHY A TABLE AND NOT AN IN-PROCESS QUEUE. Vercel functions are short-lived and there is no daemon (see
-- the project's async-render notes): a batch of 20 clips cannot be held in memory while they render. Each
-- item is a ROW with a status, and one short request advances one item. Nothing is lost when a function
-- ends, and a retry resumes exactly where it stopped.
--
-- ⚠️ SERVICE-ROLE ONLY: RLS on, ZERO policies, no client grants. The rows carry a user_id and a charge
-- reference; a SELECT policy would let one account read another's queue, and an INSERT policy would let a
-- client enqueue paid work directly, bypassing the API's auth and rate limit.
--
-- ⚠️ `charge_ref` IS UNIQUE AND PER ITEM. This is the whole billing guarantee: `deduct_credits` is
-- idempotent on its ref, so a retried drain cannot charge twice, and — the failure this codebase has
-- already shipped once — a ref shared across a batch would make items 2..N free.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.agent_video_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid NOT NULL,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Position within the batch, so results come back in the order they were submitted.
  ordinal       integer NOT NULL DEFAULT 0,
  prompt        text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 2000),
  aspect        text NOT NULL DEFAULT '16:9',
  watermark     boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','submitted','done','failed')),
  -- The provider handle once submitted; polled on the next drain.
  operation     text,
  video_url     text,
  error         text,
  credits       integer NOT NULL DEFAULT 0,
  -- ⚠️ UNIQUE, and it is what makes a retried drain safe. One item, one charge, forever.
  charge_ref    text UNIQUE,
  attempts      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- The two queries the drain runs: "oldest queued" and "oldest submitted".
CREATE INDEX IF NOT EXISTS agent_video_queue_status_idx ON public.agent_video_queue (status, created_at);
-- The status read, by batch, in submission order.
CREATE INDEX IF NOT EXISTS agent_video_queue_batch_idx  ON public.agent_video_queue (batch_id, ordinal);

COMMENT ON TABLE public.agent_video_queue IS
  'Durable per-item queue for Agent G batch video generation. One row = one clip = one charge '
  '(charge_ref is UNIQUE and per item). Service-role only: RLS on, zero policies.';

ALTER TABLE public.agent_video_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_video_queue FROM anon, authenticated;

COMMIT;

-- ============================================================================
-- VERIFY
DO $$
DECLARE v_rls boolean; v_pol int; v_grants int; v_uniq int;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.agent_video_queue'::regclass;
  IF v_rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'VERIFY FAILED — RLS is not enabled'; END IF;

  SELECT count(*) INTO v_pol FROM pg_policies WHERE schemaname='public' AND tablename='agent_video_queue';
  IF v_pol <> 0 THEN RAISE EXCEPTION 'VERIFY FAILED — % policy(ies) exist; this table must have NONE', v_pol; END IF;

  SELECT count(*) INTO v_grants FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='agent_video_queue' AND grantee IN ('anon','authenticated');
  IF v_grants <> 0 THEN RAISE EXCEPTION 'VERIFY FAILED — anon/authenticated hold % grant(s)', v_grants; END IF;

  -- The billing guarantee. Without this constraint a retried drain double-charges.
  SELECT count(*) INTO v_uniq FROM pg_constraint
   WHERE conrelid='public.agent_video_queue'::regclass AND contype='u';
  IF v_uniq < 1 THEN RAISE EXCEPTION 'VERIFY FAILED — charge_ref UNIQUE constraint missing'; END IF;

  RAISE NOTICE 'VERIFY OK — agent_video_queue: RLS on, zero policies, no client grants, charge_ref UNIQUE, 2 indexes.';
END $$;
-- ============================================================================
