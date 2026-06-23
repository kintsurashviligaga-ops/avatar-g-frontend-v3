-- Avatar G — FIX 1: free STARTER videos bumped 1 → 3 (testing phase)
-- Created: 2026-06-23
--
-- The credit wall at /api/video/assemble (ASSEMBLE_COST credits) blocked the full
-- music-video pipeline for signed-in users once their single founder free film was
-- spent and their GEL balance was 0.00 → the assemble step raised "insufficient
-- credits". Product decision (for now): every account gets enough free videos to
-- TEST the full pipeline end-to-end without paying — at least THREE full 30s videos.
--
-- This reuses the existing, race-safe consume_free_film / restore_free_film RPCs
-- (20260602_free_film_promo.sql) unchanged; it only raises the GRANT:
--   • new users default to 3 free films (was 1)
--   • existing users are topped up to AT LEAST 3 (GREATEST → never lowers a higher
--     balance, e.g. a promo/admin grant), so current test accounts can run the
--     pipeline immediately.
--
-- REVERTING (when the free trial ends): set the default back to 1 and stop the
-- backfill — the consume/restore logic needs no change.

-- ── new users: default 3 free films ─────────────────────────────────────────
ALTER TABLE public.profiles ALTER COLUMN free_films_remaining SET DEFAULT 3;

-- ── existing users: ensure everyone has at least 3 to test with ─────────────
-- GREATEST keeps any already-higher balance intact and is safe to re-run.
UPDATE public.profiles
   SET free_films_remaining = GREATEST(COALESCE(free_films_remaining, 0), 3);

COMMENT ON COLUMN public.profiles.free_films_remaining IS
  'Free 30-second films remaining. Testing-phase grant = 3 (FIX 1, 2026-06-23); was 1 (founder promo). Decremented by consume_free_film, restored by restore_free_film.';
