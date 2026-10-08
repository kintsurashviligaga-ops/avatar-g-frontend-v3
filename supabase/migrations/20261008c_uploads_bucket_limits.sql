-- 20261008c — cap the `uploads` bucket (UPLOAD_BUCKET): 50 MB per object and images / video / audio only.
-- NOT APPLIED. Apply it right AFTER the launch-certification code is live in Production, never before: the code on
-- `main` still writes RVC model zips (application/zip) and rendered videos that can pass 50 MB to `uploads`, and this
-- bucket rule would refuse them. The certification branch moves those server writes to `renders`.
--
-- The list and cap are the ones /api/upload and /api/upload/sign enforce (lib/uploads/policy.ts, which a test keeps
-- in step with the list below). A signed upload URL is a direct PUT to storage that no route sees, so only the bucket
-- can hold a client to it. ⚠️ If UPLOAD_BUCKET names a different bucket in production, apply this to that bucket.
--
-- Was section 3 of 20261008a until 2026-10-08, split out so the RLS part could be applied ahead of the deploy.
-- Idempotent: the bucket row is upserted.

-- ── The `uploads` bucket: 50 MB, images / video / audio ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads', 'uploads', false, 52428800,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/x-matroska',
    'video/x-msvideo', 'video/mpeg', 'video/ogg',
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac', 'audio/wav',
    'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/webm', 'audio/ogg', 'audio/opus', 'audio/flac',
    'audio/x-flac', 'audio/aiff', 'audio/x-aiff', 'audio/3gpp', 'audio/amr'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Self-verification ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'uploads' AND file_size_limit = 52428800
                 AND allowed_mime_types IS NOT NULL AND NOT ('text/html' = ANY (allowed_mime_types))) THEN
    RAISE EXCEPTION '20261008c: the uploads bucket limits did not apply';
  END IF;
END
$$;
