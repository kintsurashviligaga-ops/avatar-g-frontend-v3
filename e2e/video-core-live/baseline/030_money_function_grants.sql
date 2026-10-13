-- 030 — who may run the free-film functions 20260602_free_film_promo created (applied before this file, verbatim): the
-- service role only, as supabase/migrations/20260929a §1 left them in Production (that migration as a whole does not
-- replay here: most of the functions it names are not in this baseline). /api/video/assemble spends a new account's one
-- free film through consume_free_film and hands it back through restore_free_film when the render fails.
revoke execute on function public.consume_free_film(uuid) from public, anon, authenticated;
revoke execute on function public.restore_free_film(uuid) from public, anon, authenticated;
grant execute on function public.consume_free_film(uuid) to service_role;
grant execute on function public.restore_free_film(uuid) to service_role;
