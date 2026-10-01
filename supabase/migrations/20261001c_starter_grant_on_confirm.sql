-- 20261001c — the starter grant goes to PROVEN accounts only.
--
-- ⚠️ WHAT WAS WRONG. `on_auth_user_starter_balance` ran AFTER INSERT ON auth.users, so EVERY row got the 50-credit
-- `signup_bonus` ledger entry, and `handle_new_user` (on_auth_user_created) gave every profile its free film and three
-- free avatar chats — including accounts nobody has ever proven. Since 2026-10-01 the one-field sign-in creates an
-- (unconfirmed) account for any address typed into it, so anyone could mint a ledger "purchase" and free quotas for
-- thousands of made-up or third-party addresses (security review, 2026-10-01). An unconfirmed account cannot get a
-- session, so nothing could be SPENT — but the ledger, the "credits granted" numbers and the profiles table filled
-- with grants for strangers.
--
-- NOW:
--   • INSERT, already confirmed (Google / GitHub OAuth, an admin-created confirmed user): granted at once, as before.
--   • INSERT, unconfirmed (email code, phone code, the legacy two-field sign-up): the profile exists (the app needs
--     it) but holds NO bonus and NO free film / avatar chats.
--   • UPDATE that confirms (email_confirmed_at or phone_confirmed_at goes NULL → a time — i.e. the person typed the
--     code): the bonus and the free quotas are granted, exactly once.
-- "Exactly once" is the existing `signup_bonus` ledger check: the free quotas are restored in the SAME branch, so a
-- re-confirmation (email change, a second phone) never re-grants. Accounts that already have a bonus are untouched.
--
-- The quota numbers (1 free film, 3 free avatar chats) are profiles' column defaults; they are written out here
-- because the confirm step must restore them after the insert step zeroed them. Change both together.
--
-- Trigger functions (RETURNS trigger) cannot be called through PostgREST, so nothing here is reachable as an RPC.

BEGIN;

-- ── handle_new_user: a PHONE account has no email ─────────────────────────────────────────────────────────────────
-- ⚠️ FOUND BY THIS MIGRATION'S ROLLBACK TEST. on_auth_user_created copied NEW.email into profiles.email, which is
-- NOT NULL — a phone-only auth user has email NULL, so the insert failed and GoTrue aborted the whole sign-up
-- ("Database error saving new user"). Phone sign-in would have been dead the moment the provider was switched on.
-- Same placeholder handle_auth_user_starter_balance already uses; ON CONFLICT because both insert triggers create the row.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, NEW.id::text || '@placeholder.local'), NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ── INSERT: grant only an account that arrives already proven ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_auth_user_starter_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- ⚠️ profiles.email არის NOT NULL — მისი გამოტოვება ტრიგერს ავარიულად ამთავრებდა.
  INSERT INTO public.profiles (id, email, credits_balance)
  VALUES (NEW.id, COALESCE(NEW.email, NEW.id::text || '@placeholder.local'), 0)
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email_confirmed_at IS NULL AND NEW.phone_confirmed_at IS NULL THEN
    -- Not proven yet: no bonus, and none of the profile's free quotas (handle_new_user created the row with the
    -- column defaults). The confirm trigger below grants all of it when the code is verified.
    UPDATE public.profiles
       SET free_films_remaining = 0, free_avatar_chats_remaining = 0
     WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.credit_ledger
     WHERE user_id = NEW.id AND metadata->>'kind' = 'signup_bonus'
  ) THEN
    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
    VALUES (NEW.id, 50, 'purchase',
            jsonb_build_object('kind', 'signup_bonus', 'credits', 50,
                               'ref', 'starter:' || NEW.id::text,
                               'note', 'free trial: 50 credits, max 1 video'));
  END IF;

  RETURN NEW;

-- ⚠️ საჩუქარმა რეგისტრაცია არასდროს არ უნდა შეაფერხოს: ჩავარდნისას მომხმარებელი მაინც დარეგისტრირდება.
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'starter grant skipped for %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

-- ── UPDATE: the moment an account is proven, grant what the insert withheld ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_auth_user_confirmed_starter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (
       (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
    OR (OLD.phone_confirmed_at IS NULL AND NEW.phone_confirmed_at IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  -- The profile normally exists (the insert triggers made it); recreate it if something deleted it.
  INSERT INTO public.profiles (id, email, credits_balance)
  VALUES (NEW.id, COALESCE(NEW.email, NEW.id::text || '@placeholder.local'), 0)
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.credit_ledger
     WHERE user_id = NEW.id AND metadata->>'kind' = 'signup_bonus'
  ) THEN
    INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
    VALUES (NEW.id, 50, 'purchase',
            jsonb_build_object('kind', 'signup_bonus', 'credits', 50,
                               'ref', 'starter:' || NEW.id::text,
                               'note', 'free trial: 50 credits, max 1 video (granted on confirmation)'));
    -- Restore the free quotas the insert step withheld (the profiles column defaults). GREATEST so a value an admin
    -- raised meanwhile is never lowered.
    UPDATE public.profiles
       SET free_films_remaining = GREATEST(COALESCE(free_films_remaining, 0), 1),
           free_avatar_chats_remaining = GREATEST(COALESCE(free_avatar_chats_remaining, 0), 3)
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never block a sign-in on a grant: the user is in, just without the bonus (visible in the logs).
  RAISE WARNING 'starter grant on confirm skipped for %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_confirmed_starter ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_starter
AFTER UPDATE OF email_confirmed_at, phone_confirmed_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_confirmed_starter();

-- Trigger functions are not RPCs, but keep them off every API role regardless (scripts/check-db-exposure.mjs).
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_auth_user_starter_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_auth_user_confirmed_starter() FROM PUBLIC, anon, authenticated;
-- PostgreSQL does not check EXECUTE when a trigger fires, but sign-up must never hinge on that: GoTrue writes
-- auth.users as supabase_auth_admin (not an API role). Applied live as 20261001d.
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_auth_user_starter_balance() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_auth_user_confirmed_starter() TO supabase_auth_admin;

COMMIT;
