/**
 * Where a user's TWIN BIOMETRICS live (the enrollment voice sample now; the poster in Wave 3) — the single
 * source of truth shared by the writer (lib/avatar/enroll.ts) and the storage signer's deny-list
 * (lib/orchestrator/storage-adapter.ts). scripts/avatar/migrate-live-avatar-voice.mjs mirrors the bucket name
 * (a test pins them equal).
 *
 * ⚠️ A DEDICATED PRIVATE BUCKET, NOT `uploads`: a twin path is GUESSABLE from the user id alone
 * (`twins/<uid>/voice.<ext>`), and many routes take a bare client-supplied path and sign it in `uploads`
 * with the service role, checking neither ownership nor prefix (edit-audio `process`, voice/train,
 * lipsync, remix, edit, edit-photo, music references, motion-control, resolveUploadRef,
 * signUploadedReference). In `uploads` a voiceprint would be one POST away for any free account. Every
 * other object there carries a Date.now()+random suffix; these do not.
 *
 * ⚠️ AND THE GENERIC SIGNER REFUSES THIS BUCKET: `reSignIfInternal` re-signs ANY `*.supabase.co` object URL
 * in whatever bucket the URL names, so a separate bucket alone is not enough — createSignedAssetUrl(s)
 * return null for it (see isTwinBucket). A future reader (Wave 3) must sign directly, scoped to
 * `twins/<caller's own uid>/`, never through the generic adapter.
 *
 * ⚠️ Deliberately NOT `process.env.UPLOAD_BUCKET` or any env override: a voiceprint must never follow an ops
 * setting into a bucket that might be public or client-path-signable.
 */
export const TWIN_PRIVATE_BUCKET = 'twins';

/** Every extension storeLiveAvatarVoice can write — a re-enroll removes the siblings it did not write. */
export const TWIN_VOICE_EXTS = ['webm', 'm4a', 'mp3', 'ogg', 'wav'] as const;

/** Deterministic per-user voice-sample object in TWIN_PRIVATE_BUCKET — one current file per user. */
export function twinVoicePath(userId: string, ext: string): string {
  return `twins/${userId}/voice.${ext}`;
}

/** True for the twin bucket, however the caller spelled it (e.g. a URL-decoded bucket from a client string). */
export function isTwinBucket(bucket: string): boolean {
  return typeof bucket === 'string' && bucket.trim().toLowerCase() === TWIN_PRIVATE_BUCKET;
}
