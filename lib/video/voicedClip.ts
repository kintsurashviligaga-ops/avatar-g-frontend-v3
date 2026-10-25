/**
 * lib/video/voicedClip.ts — deliver a direct clip whose Georgian line Google Cloud TTS speaks (lib/video/clipPrompt):
 * Veo's clip with the line in place of Veo's Latin-letter speech, fitted onto where Veo spoke, and Veo's own sound kept
 * around it (lib/video/remixOps muxVoiceOntoClip, `keepBed`). Server-only; called by GET /api/genjutsu/status once Veo's
 * clip is hosted — the talking avatar's delivery (lib/avatar/voicedClip), for a clip of 4, 6 or 8 s.
 *
 * Both files sit at fixed paths named by the job's uuid (the line was stored BEFORE the charge, by app/api/video/clip), so
 * a repeat poll re-signs the finished clip instead of muxing again. A miss is "not yet": the status route keeps polling
 * and refunds at its hard cap — a paid clip is never delivered with Veo's garbled Georgian in place of the line.
 */
import 'server-only';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { clipVoicePath, clipVoicedPath } from './directClip';
import { muxVoiceOntoClip } from './remixOps';

const WEEK_SEC = 604_800;

export async function deliverVoicedClip(clipUrl: string, uuid: string, seconds: number): Promise<string | null> {
  const out = clipVoicedPath(uuid);
  const done = await createSignedAssetUrl('renders', out, WEEK_SEC).catch(() => null);
  if (done) return done;
  const voice = await createSignedAssetUrl('renders', clipVoicePath(uuid), 3_600).catch(() => null);
  if (!voice) return null;
  return muxVoiceOntoClip(clipUrl, voice, seconds, { bucket: 'renders', path: out }, { keepBed: true });
}
