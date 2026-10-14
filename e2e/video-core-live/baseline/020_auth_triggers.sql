-- 020 — the two INSERT triggers on auth.users that give a new account its profile and (when it arrives confirmed) its
-- 50-credit starter grant. The functions are 20261001c's (applied before this file, verbatim); the trigger names are
-- the ones Production uses: on_auth_user_created (handle_new_user) and on_auth_user_starter_balance (20260802d).
-- 20261001c already created the third one, on_auth_user_confirmed_starter (AFTER UPDATE).
-- A public-schema dump would not carry these (they live on auth.users), which is one more reason this baseline is
-- built from the repo instead.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_starter_balance on auth.users;
create trigger on_auth_user_starter_balance after insert on auth.users for each row execute function public.handle_auth_user_starter_balance();
