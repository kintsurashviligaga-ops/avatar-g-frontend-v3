/**
 * lib/avatar/voicedClip.ts — deliver a talking avatar whose Georgian line ElevenLabs speaks (lib/avatar/veoAvatar): Veo's
 * clip with the line in place of Veo's own voice, fitted onto where Veo spoke (lib/avatar/speechMatch). Server-only;
 * called by GET /api/genjutsu/status once Veo's clip is hosted.
 *
 * Both files sit at fixed paths named by the job's uuid (the line was stored there BEFORE the charge, by
 * app/api/avatar/veo), so a repeat poll re-signs the finished clip instead of muxing again, and nothing here needs a
 * job row. A miss (no line found, a failed mux) is "not yet": the status route keeps polling and refunds at its hard
 * cap, as it does for any clip that never arrives — a paid avatar is never delivered silent.
 */
import 'server-only';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { muxVoiceOntoClip } from '@/lib/video/remixOps';
import { VEO_AVATAR_SECONDS, avatarVoicePath, avatarVoicedPath } from './veoAvatar';

const WEEK_SEC = 604_800;

export async function deliverVoicedAvatar(clipUrl: string, uuid: string): Promise<string | null> {
  const out = avatarVoicedPath(uuid);
  const done = await createSignedAssetUrl('renders', out, WEEK_SEC).catch(() => null);
  if (done) return done;
  const voice = await createSignedAssetUrl('renders', avatarVoicePath(uuid), 3_600).catch(() => null);
  if (!voice) return null;
  return muxVoiceOntoClip(clipUrl, voice, VEO_AVATAR_SECONDS, { bucket: 'renders', path: out });
}
