/**
 * lib/ai/musicReference.ts — which `audioReference` / `voiceReference` values /api/ai/music will accept.
 *
 * ⚠️ A REFERENCE IS CLIENT TEXT THAT THE SERVER ACTS ON. The route turns it into a URL a provider can fetch:
 *   · a bare storage PATH is SIGNED with the service role (`createSignedAssetUrl`) — for ANY object in the bucket,
 *     whoever owns it. The browser's upload handshake (/api/upload/sign) hands out paths that start with the caller's
 *     own user id, so the check is cheap and exact: a path must live under `omni-uploads/<uid>/` (or `<uid>/`, the sibling
 *     /api/upload's shape). Without it one account could ask the server to sign another's audio.
 *   · an https URL is used as given. A COVER's URL is fetched by Replicate, so any public http(s) host is fine — but the
 *     well-known internal targets (loopback, link-local metadata, RFC-1918, IPv6 literals) are refused. A VOICE sample is
 *     fetched BY US (`transcodeVoiceToMp3`), which makes it an SSRF vector: only our own Supabase storage hosts pass.
 *   · a data: URL is re-hosted by the server, so it must at least declare itself audio.
 *
 * Pure: no I/O, so the whole policy is unit-tested without a server.
 */
import { isAllowedAudioUrl, isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';

export type MusicReferenceKind = 'audio' | 'voice';

const DATA_AUDIO = /^data:audio\/[a-z0-9.+-]{1,40}(;[a-z0-9=.+-]{1,60})*;base64,/i;
/** The characters a server-minted upload path uses; no dots-only segments, no backslashes, no spaces. */
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,300}$/;

/** True when `path` is a plain storage path inside THIS user's own upload folder. */
export function isOwnedUploadPath(path: string, userId: string): boolean {
  if (!userId || !SAFE_PATH.test(path) || path.includes('..') || path.includes('//')) return false;
  return path.startsWith(`omni-uploads/${userId}/`) || path.startsWith(`${userId}/`);
}

/** An empty reference means "none" and is always fine; anything else must pass the rule for its shape. */
export function isAcceptableMusicReference(ref: string, userId: string, kind: MusicReferenceKind): boolean {
  if (!ref) return true;
  if (/^data:/i.test(ref)) return DATA_AUDIO.test(ref);
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    return kind === 'voice' ? isAllowedAudioUrl(ref) : isPublicHttpUrl(ref);
  }
  return isOwnedUploadPath(ref, userId);
}
