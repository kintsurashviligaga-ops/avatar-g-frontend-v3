-- ============================================================================
-- 03_reconcile.sql  —  MUTATING, GUARDED.  Do NOT run until 01 + 02 are reviewed.
-- ============================================================================
-- Implements RECONCILIATION POLICY A (README §3): "canonical wins, top up the
-- positive (legacy − canonical) difference so no user ever loses credits."
-- Writes go THROUGH the canonical ledger (one credit_ledger insert per user) so
-- the balance trigger applies them and the audit trail stays intact — never a
-- raw UPDATE profiles.
--
-- SAFETY DESIGN:
--   • Ships wrapped in BEGIN … ROLLBACK. The FIRST run COMMITS NOTHING; it only
--     prints the preview of what WOULD change. Review it, then change the final
--     ROLLBACK to COMMIT to actually apply.
--   • Idempotent: every insert is tagged ref = 'recon:<RUN_TAG>:<user_id>' and
--     guarded by NOT EXISTS on that ref — re-running credits nothing twice.
--   • MAX_TOPUP_PER_USER caps any single top-up so one corrupt legacy row can't
--     mint a fortune. Set it from 02's max legitimate divergence (result D).
--
-- ASSUMPTIONS THAT 01 MUST HAVE CONFIRMED (else STOP and rewrite):
--   • public.profiles.credits_balance exists (canonical balance of record).
--   • public.credit_ledger has CANONICAL columns (user_id, delta, reason, metadata)
--     and trigger_update_credits_balance applies delta → profiles.credits_balance.
--   • Idempotency key lives in metadata->>'ref'.
--   If 01 showed the LEGACY credit_ledger shape instead, DO NOT run this file —
--   the INSERT column list below will not match. Adjust to the real shape first.
-- ============================================================================

BEGIN;

-- ── Tunables ────────────────────────────────────────────────────────────────
-- RUN_TAG: a fixed label for THIS reconciliation run (date). Keep it stable so a
-- re-run is idempotent; change it only for a genuinely new reconciliation pass.
-- MAX_TOPUP_PER_USER: hard ceiling per user (credits). Size from 02 result D.
\set RUN_TAG '2026xxxx_ledger_unify'
\set MAX_TOPUP_PER_USER 5000

-- Build the set of top-ups (policy A), capped, excluding anything already applied.
WITH candidate AS (
  SELECT
    p.id AS user_id,
    LEAST(
      GREATEST(COALESCE(c.balance, 0) - COALESCE(p.credits_balance, 0), 0),
      :MAX_TOPUP_PER_USER
    ) AS topup
  FROM public.profiles p
  LEFT JOIN public.credits c ON c.user_id = p.id
),
to_apply AS (
  SELECT user_id, topup,
         'recon:' || :'RUN_TAG' || ':' || user_id::text AS ref
  FROM candidate
  WHERE topup > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.credit_ledger l
      WHERE l.user_id = candidate.user_id
        AND l.metadata->>'ref' = 'recon:' || :'RUN_TAG' || ':' || candidate.user_id::text
    )
)
-- ── PREVIEW: what WOULD be credited (this SELECT commits nothing) ────────────
SELECT
  (SELECT COUNT(*) FROM to_apply)          AS users_to_credit,
  (SELECT COALESCE(SUM(topup), 0) FROM to_apply) AS total_credits_to_grant,
  ROUND((SELECT COALESCE(SUM(topup), 0) FROM to_apply) * 0.10, 2) AS total_gel_to_grant;

-- Uncomment the INSERT below ONLY when the preview above looks correct.
-- It appends one +delta ledger row per user; the trigger raises their balance.
--
-- INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
-- SELECT
--   user_id,
--   topup,
--   'admin_adjustment',
--   jsonb_build_object('source', 'ledger-unification', 'ref', ref, 'policy', 'A')
-- FROM (
--   WITH candidate AS (
--     SELECT p.id AS user_id,
--            LEAST(GREATEST(COALESCE(c.balance,0) - COALESCE(p.credits_balance,0), 0), :MAX_TOPUP_PER_USER) AS topup
--     FROM public.profiles p LEFT JOIN public.credits c ON c.user_id = p.id
--   )
--   SELECT user_id, topup, 'recon:' || :'RUN_TAG' || ':' || user_id::text AS ref
--   FROM candidate
--   WHERE topup > 0
--     AND NOT EXISTS (
--       SELECT 1 FROM public.credit_ledger l
--       WHERE l.user_id = candidate.user_id
--         AND l.metadata->>'ref' = 'recon:' || :'RUN_TAG' || ':' || candidate.user_id::text
--     )
-- ) x;

-- ── SAFETY: leave as ROLLBACK for the preview run. ───────────────────────────
-- When the preview + INSERT are confirmed correct, change ROLLBACK → COMMIT.
ROLLBACK;
-- COMMIT;
