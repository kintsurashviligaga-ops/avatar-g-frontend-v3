-- 20261009b — make the `renders` bucket private.
-- NOT APPLIED. A database change in Production: apply only with the owner's yes.
--
-- `renders` holds the server's outputs (films, montage, decks, 3D, longform, dubbing, motion control, pipeline clips and
-- voice-overs; 494 objects in Production on 2026-10-09). It is a public bucket there, so anyone holding an object's
-- path can read it forever through /object/public/renders/<path>, whatever the signed link's lifetime says. Since
-- 20261008d the paths can no longer be listed, so this is a "leaked path stays readable" gap, not an open listing.
--
-- Safe for the code: every writer uploads with the service role and hands out a signed URL (uploadAndSign /
-- uploadBufferAndSign, checked by grep on 2026-10-09: no getPublicUrl and no /object/public/renders/ URL is built
-- anywhere in app/, lib/, components/, workers/ or services/). Signed URLs keep working on a private bucket.
-- What stops working: links of the form /object/public/renders/<path>. Production read on 2026-10-09: 3 `render_jobs`
-- rows from 2026-01-25 hold one; no `generation_jobs`, `user_creations`, `chat_messages`, `studio_jobs` or `jobs` row does.
--
-- Rollback: UPDATE storage.buckets SET public = true WHERE id = 'renders';
-- Idempotent.

UPDATE storage.buckets SET public = false WHERE id = 'renders';

-- ── Self-verification ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'renders' AND public) THEN
    RAISE EXCEPTION '20261009b: the renders bucket is still public';
  END IF;
END
$$;
