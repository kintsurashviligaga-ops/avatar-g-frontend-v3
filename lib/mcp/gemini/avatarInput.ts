import 'server-only';

import { z } from 'zod';
import { isTwinBucket } from '../../avatar/twinStorage';
import { describeSupabaseObjectUrl, ownStorageHosts } from '../../orchestrator/storage-adapter';
import { ownsUploadObject, uploadBucket } from '../../security/callerMedia';

/** A storage reference only. A future worker must independently recheck it,
 * sniff the downloaded bytes, and enforce the provider's image/person policy.
 * This helper never signs, fetches, or submits media. */
export type OwnedAvatarInput = { bucket: string; path: string };

/** `loadAvatar` must be an authenticated owner-scoped database lookup, not a
 * model-supplied object. Production schema uses both owner_id and user_id in
 * different migrations, so an ambiguous or conflicting record is rejected. */
export async function resolveOwnedAvatarInput(
  avatarId: unknown,
  userId: unknown,
  loadAvatar: (id: string, userId: string) => Promise<unknown>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OwnedAvatarInput | null> {
  const id = z.string().uuid().safeParse(avatarId);
  const user = z.string().uuid().safeParse(userId);
  if (!id.success || !user.success) return null;

  try {
    const result = await loadAvatar(id.data, user.data);
    if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
    const row = result as Record<string, unknown>;
    if (row.id !== id.data) return null;
    const ownerValues = [row.owner_id, row.user_id];
    if (ownerValues.some((x) => x !== undefined && x !== null && (typeof x !== 'string' || !x))) return null;
    const owners = ownerValues.filter((x): x is string => typeof x === 'string');
    if (owners.length === 0 || owners.some((x) => x !== user.data)) return null;
    if (typeof row.preview_image_url !== 'string' || row.preview_image_url.length > 4096) return null;

    const url = new URL(row.preview_image_url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
        !/^\/storage\/v1\/object\/(?:sign|public)\//.test(url.pathname)) return null;
    const ref = describeSupabaseObjectUrl(row.preview_image_url, env);
    if (!ref || isTwinBucket(ref.bucket) || !ownStorageHosts(env).has(ref.host) || ref.bucket !== uploadBucket(env) ||
        !ownsUploadObject(ref.path, user.data)) return null;
    return { bucket: ref.bucket, path: ref.path };
  } catch {
    // A failed lookup or malformed URL is never a reason to broaden access.
    return null;
  }
}
