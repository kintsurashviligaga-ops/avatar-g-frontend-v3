/**
 * lib/twin/resolve.ts — the READ side of Digital Twin v0: "what is this user's twin?" for GET /api/twin, and the
 * poster /api/avatar/core serves (the Live orb, the desktop's phone-handoff poll, the imported-avatar card).
 *
 * The saved Live Avatar comes first in /api/avatar/core (lib/avatar/liveAvatar.ts, private since 2026-10-24); with the
 * flag on and no Live Avatar, the poster is the twin's FRONT photo as a short-lived signed URL. The old public
 * `avatars/live-avatars/<uid>/poster.jpg` URL is never served any more — liveAvatar.ts moves that file private.
 */
import 'server-only';

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
