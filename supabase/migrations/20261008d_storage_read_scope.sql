-- 20261008d — stop anyone from reading every stored file.
--
-- ⚠️ FOUND IN PRODUCTION ON 2026-10-08 (read-only check, `pg_policies`): `storage.objects` carries a PERMISSIVE SELECT
-- policy "Public read music 1q2q05_0" for role `public` with `USING (true)`. The name says "music", but the condition
-- names no bucket, so it lets anon and authenticated (both hold SELECT on the table) list and download EVERY object in
-- EVERY bucket, the private ones included: `uploads` (user photos, videos, voice samples), `studio`, `twins`. The anon
-- key ships in every browser bundle, so this is open to anyone. The policy is not in this repo: it was made in the
-- dashboard.
--
-- The fix keeps what the policy was meant to do (read the public `music` bucket) and nothing more. What it does not
-- break, checked on 2026-10-08:
--   · Production buckets: avatars, music, renders (public), fonts, studio, twins, uploads (private). Every server route
--     that signs, lists, downloads or removes in them uses the service role, which RLS does not touch. Browser uploads
--     go through signed upload URLs (`uploadToSignedUrl`), authorised by the token, not by this policy.
--   · Code that does read storage as anon / authenticated targets buckets Production does not have:
--     `private-invoices` (lib/invoice/pdf.ts), `invoices-private` (lib/invoices/pdfGenerator.ts) and
--     `avatar-g-outputs` (app/api/app/outputs, which has its own owner-only policy in 20260216_service_jobs_outputs).
--     If those buckets are ever created, they need owner-scoped policies of their own, never `USING (true)`.
--   · Gateway logs, 2026-09-30 19:00Z to 2026-10-08 19:45Z: 0 storage requests made as anon or authenticated other than
--     public-bucket reads and signed uploads. Nothing legitimate uses the open read, and nobody was seen using it.
--
-- Idempotent, and a no-op where the policy does not exist. Safe to apply before or after the deploy of this branch.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND policyname = 'Public read music 1q2q05_0') THEN
    ALTER POLICY "Public read music 1q2q05_0" ON storage.objects USING (bucket_id = 'music');
  END IF;
END
$$;

-- ── Self-verification ────────────────────────────────────────────────────────────────────────────────────────────
-- No SELECT policy that anon or authenticated can use may leave the bucket open.
DO $$
DECLARE
  open_policy text;
BEGIN
  SELECT policyname INTO open_policy
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND cmd IN ('SELECT', 'ALL')
    AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
    AND (qual IS NULL OR btrim(qual) IN ('true', '(true)'))
  LIMIT 1;
  IF open_policy IS NOT NULL THEN
    RAISE EXCEPTION '20261008d: storage.objects policy % still lets anyone read every bucket', open_policy;
  END IF;
END
$$;
