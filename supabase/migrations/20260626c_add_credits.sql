-- Avatar G — add_credits() RPC (referral bonuses)
-- =================================================
-- The referral redeem route (app/api/referral/redeem/route.ts) calls
--   rpc('add_credits', { p_user_id, p_amount })
-- to grant signup + referrer bonuses. The function was never created on prod, so
-- those calls silently no-op (wrapped in catch). This installs it with the EXACT
-- signature the callers use (p_amount, NOT p_credits) so referral credits land.
-- Additive + idempotent (CREATE OR REPLACE). SECURITY DEFINER so it can bump the
-- balance regardless of the caller's RLS.
--
-- Apply with `supabase db push` or the Supabase dashboard SQL editor.

CREATE OR REPLACE FUNCTION public.add_credits(p_user_id UUID, p_amount INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  UPDATE public.profiles
     SET credits_balance = COALESCE(credits_balance, 0) + p_amount
   WHERE id = p_user_id;
END;
$func$;
