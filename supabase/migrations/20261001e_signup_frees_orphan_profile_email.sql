-- 20261001e — a sign-up must not die on an ORPHANED profile's email (applied live 2026-10-01).
--
-- profiles.email is UNIQUE. 18 profiles have no auth.users row (deleted accounts, the admin seed, old test rows). When
-- one of them still holds an address, signing up with that address made handle_new_user raise 23505 and GoTrue
-- aborted the whole sign-up ("Database error saving new user") — with the one-line sign-in, the person is told
-- nothing useful and can never get in (security review, 2026-10-01).
-- Non-destructive: the orphan keeps its row, ledger and history; only its email is renamed so the address is free.
-- A LIVE profile (one with an auth user) holding the address is left alone — that is a real conflict.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.email IS NOT NULL THEN
    UPDATE public.profiles p
       SET email = p.id::text || '@orphan.invalid'
     WHERE lower(p.email) = lower(NEW.email)
       AND p.id <> NEW.id
       AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
  END IF;
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, NEW.id::text || '@placeholder.local'), NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
