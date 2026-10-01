/**
 * lib/twin/resolve.ts — the READ side of Digital Twin v0: "what is this user's twin?" for GET /api/twin, and the
 * poster /api/avatar/core serves (the Live orb, the desktop's phone-handoff poll, the imported-avatar card).
 *
 * ⚠️ TWIN FIRST, LEGACY SECOND. With the flag on, the poster is the twin's FRONT photo as a short-lived signed URL;
 * without a twin (or with the flag off) it is the legacy Live-Avatar poster exactly as before — the public
 * `avatars/live-avatars/<uid>/poster.jpg` URL. Making that legacy poster private is a later step (it needs the
 * existing files moved), so the legacy branch is unchanged here.
 */
import 'server-only';

import { liveAvatarPath } from '@/lib/avatar/enroll';
import { LEGACY_LIVE_AVATAR_BUCKET, legacyLiveAvatarDir } from './paths';
import { TWIN_URL_TTL_SEC, readTwinManifest, signOwnTwinObject, signTwinUrls, twinStorageClient, type TwinStorageClient } from './store';
import type { TwinStatusResponse } from './types';

/** GET /api/twin's answer. Throws TwinStorageError when storage cannot answer (the route says 503, not "none"). */
export async function getTwinStatus(uid: string, sb: TwinStorageClient = twinStorageClient()): Promise<TwinStatusResponse> {
  const manifest = await readTwinManifest(sb, uid);
  if (!manifest) return { status: 'none' };
  const urls = await signTwinUrls(sb, manifest);
  return {
    status: 'ready',
    committedAt: manifest.committedAt,
    consentVersion: manifest.consent.version,
    voiceVerified: false,
    expiresIn: TWIN_URL_TTL_SEC,
    urls,
  };
}

/** The twin's front photo, signed for TWIN_URL_TTL_SEC — null when there is no twin OR storage cannot say. Never throws. */
export async function resolveTwinFace(uid: string, sb: TwinStorageClient = twinStorageClient()): Promise<{ url: string; updatedAt: string } | null> {
  try {
    const manifest = await readTwinManifest(sb, uid);
    if (!manifest) return null;
    return { url: await signOwnTwinObject(sb, uid, manifest.photos.front.path), updatedAt: manifest.committedAt };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[twin] front photo unavailable — falling back to the legacy poster:', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * The legacy Live-Avatar poster, exactly as /api/avatar/core always served it: the public URL, cache-busted by the
 * object's updated_at so a re-enroll is seen by the handoff poll. Never throws.
 */
export async function resolveLegacyPoster(uid: string, sb: TwinStorageClient = twinStorageClient()): Promise<{ url: string; updatedAt: string | null } | null> {
  try {
    const api = sb.storage.from(LEGACY_LIVE_AVATAR_BUCKET);
    const { data: files } = await api.list(legacyLiveAvatarDir(uid), { limit: 10 });
    const poster = files?.find((f) => f.name === 'poster.jpg');
    if (!poster) return null;
    const base = api.getPublicUrl(liveAvatarPath(uid)).data.publicUrl;
    const updatedAt = poster.updated_at || poster.created_at || null;
    const v = updatedAt ? new Date(updatedAt).getTime() : Date.now();
    return { url: `${base}?v=${v}`, updatedAt };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[avatar/core] storage read failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** /api/avatar/core's poster: the twin's front photo when `twin` (the flag) is on and a twin exists, else the legacy one. */
export async function resolveCorePoster(
  uid: string,
  opts: { twin: boolean },
  sb: TwinStorageClient = twinStorageClient(),
): Promise<{ url: string; updatedAt: string | null; source: 'twin' | 'legacy' } | null> {
  if (opts.twin) {
    const face = await resolveTwinFace(uid, sb);
    if (face) return { ...face, source: 'twin' };
  }
  const legacy = await resolveLegacyPoster(uid, sb);
  return legacy ? { ...legacy, source: 'legacy' } : null;
}
