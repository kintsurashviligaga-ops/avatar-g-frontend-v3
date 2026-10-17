/**
 * lib/avatar/voicedClip.ts — deliver a talking avatar whose Georgian line ElevenLabs speaks (lib/avatar/veoAvatar):
 * Veo's clip with its mouth redrawn by sync.so to the line, at the line's natural speed and length (GG, 2026-10-17
 * 12:29Z: „ვიდეო უნდა ერგებოდეს აუდიოს ხანგრძლივობას და არა პირიქით"). Server-only; called by GET /api/genjutsu/status
 * on every poll once Veo's clip is hosted.
 *
 * One poll moves the job one step, so no poll waits on sync.so:
 *   1. the finished file exists at its fixed path → re-signed (a repeat poll never pays twice);
 *   2. no lip sync yet → the line gets a short silent tail (where the mouth closes and the face holds), sync.so is asked
 *      once (Redis claim + sync.so's own Idempotency-Key on the job's uuid), and its id is kept for six hours;
 *   3. a lip sync in flight → asked how it is doing; once done, its picture gets OUR line as its sound (laySyncedVoice)
 *      and is hosted at the fixed path, and what it cost us is booked with the platform's spend.
 *
 * A miss on our side (storage, Redis, an outage, the plan's one-job-at-a-time limit) is "not yet": the status route keeps
 * polling and refunds at its hard cap. A refusal a retry cannot change (a bad key, no credits, a face it will not take,
 * a failed generation) is `failed`: the status route refunds at once. A paid avatar is never delivered without its line.
 */
import 'server-only';
import { mp3DurationSec } from '@/lib/audio/mp3Duration';
import { redisDelete, redisGetString, redisSetIfNotExists, redisSetString } from '@/lib/platform/redis';
import { SYNC_MODELS, SYNC_USD_PER_SEC, pollLipsync, startLipsync, syncModel, type SyncModel } from '@/lib/providers/syncso';
import { recordUsage } from '@/lib/services/billing/BillingGuard';
import { estimateCost } from '@/lib/services/billing/costModel';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { laySyncedVoice, padVoiceTail } from '@/lib/video/remixOps';
import { VEO_AVATAR_SECONDS, avatarVoicePath, avatarVoicedPath } from './veoAvatar';

const WEEK_SEC = 604_800;
/** sync.so fetches its inputs while it works; six hours outlasts any job the status route keeps open. */
const INPUT_TTL_SEC = 21_600;
const STATE_TTL_SEC = 21_600;
/** Held while one poll asks sync.so; a poll that dies mid-start frees it for the next. */
const CLAIM_TTL_SEC = 120;
const STARTING = 'starting';
/** The silence after the line: long enough for the mouth to close and the face to hold, short enough not to linger. */
export const TAIL_SEC = 0.6;

export type VoicedDelivery = { state: 'ready'; url: string } | { state: 'pending' } | { state: 'failed'; reason: string };

const stateKey = (uuid: string): string => `avatar:lipsync:${uuid}`;
const bookedKey = (uuid: string): string => `avatar:lipsync:${uuid}:booked`;
export const avatarSyncLinePath = (uuid: string): string => `avatar-veo/${uuid}/line-tail.wav`;

/** The tail the line gets: TAIL_SEC, or what is left of Veo's clip when the line nearly fills it (never past it). */
export function tailPadSec(lineSec: number | null): number {
  if (lineSec === null || !Number.isFinite(lineSec) || lineSec <= 0) return 0;
  return Math.max(0, Math.min(TAIL_SEC, Math.round((VEO_AVATAR_SECONDS - lineSec) * 1000) / 1000));
}

/** What sync.so is asked to cost us, by the model and the seconds it returned (the line's length when it gave none). */
export function syncCostUsd(model: SyncModel, seconds: number): number {
  return Math.round(SYNC_USD_PER_SEC[model] * Math.max(0, seconds) * 1_000_000) / 1_000_000;
}

interface Held { id: string; model: SyncModel; lineSec: number | null }

function readHeld(raw: string | null): Held | null {
  if (!raw || raw === STARTING) return null;
  try {
    const j = JSON.parse(raw) as Partial<Held>;
    if (typeof j.id !== 'string' || !j.id) return null;
    const model = (SYNC_MODELS as readonly string[]).includes(j.model ?? '') ? (j.model as SyncModel) : SYNC_MODELS[0];
    return { id: j.id, model, lineSec: typeof j.lineSec === 'number' ? j.lineSec : null };
  } catch {
    return null;
  }
}

async function lineSeconds(voiceUrl: string): Promise<number | null> {
  try {
    const res = await fetch(voiceUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return mp3DurationSec(new Uint8Array(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

export async function deliverVoicedAvatar(clipUrl: string, uuid: string): Promise<VoicedDelivery> {
  const out = avatarVoicedPath(uuid);
  const done = await createSignedAssetUrl('renders', out, WEEK_SEC).catch(() => null);
  if (done) return { state: 'ready', url: done };

  const raw = await redisGetString(stateKey(uuid)).catch(() => null);
  const held = readHeld(raw);
  if (held) return collect(held, uuid);
  if (raw === STARTING) return { state: 'pending' };
  if (!(await redisSetIfNotExists(stateKey(uuid), STARTING, CLAIM_TTL_SEC).catch(() => false))) return { state: 'pending' };

  const release = async (): Promise<void> => { await redisDelete(stateKey(uuid)).catch(() => {}); };
  const voice = await createSignedAssetUrl('renders', avatarVoicePath(uuid), INPUT_TTL_SEC).catch(() => null);
  if (!voice) { await release(); return { state: 'pending' }; }
  const lineSec = await lineSeconds(voice);
  const pad = tailPadSec(lineSec);
  const line = (pad > 0 ? await padVoiceTail(voice, pad, { bucket: 'renders', path: avatarSyncLinePath(uuid) }) : null) ?? voice;

  const model = syncModel();
  const started = await startLipsync({ videoUrl: clipUrl, audioUrl: line, idempotencyKey: `myavatar-avatar-${uuid}`, model });
  if (!started.ok) {
    await release();
    // eslint-disable-next-line no-console
    console.warn('[avatar.lipsync] start:', started.reason, started.code);
    return started.reason === 'refused' || started.reason === 'not_configured'
      ? { state: 'failed', reason: `sync.so ${started.code}` }
      : { state: 'pending' };
  }
  const next: Held = { id: started.id, model, lineSec: lineSec === null ? null : lineSec + pad };
  await redisSetString(stateKey(uuid), JSON.stringify(next), STATE_TTL_SEC).catch(() => {});
  return { state: 'pending' };
}

async function collect(held: Held, uuid: string): Promise<VoicedDelivery> {
  const got = await pollLipsync(held.id);
  if (got.state === 'pending') return { state: 'pending' };
  if (got.state === 'failed') {
    // eslint-disable-next-line no-console
    console.warn('[avatar.lipsync] failed:', got.code);
    return { state: 'failed', reason: `sync.so ${got.code}` };
  }
  // Our line as the sound: the tailed one sync.so drew from, else the line as ElevenLabs made it.
  const line = (await createSignedAssetUrl('renders', avatarSyncLinePath(uuid), 3_600).catch(() => null))
    ?? (await createSignedAssetUrl('renders', avatarVoicePath(uuid), 3_600).catch(() => null));
  if (!line) return { state: 'pending' };
  const url = await laySyncedVoice(got.url, line, { bucket: 'renders', path: avatarVoicedPath(uuid) });
  if (!url) return { state: 'pending' };
  if (await redisSetIfNotExists(bookedKey(uuid), '1', STATE_TTL_SEC).catch(() => false)) {
    const seconds = got.seconds ?? held.lineSec ?? VEO_AVATAR_SECONDS;
    await recordUsage(estimateCost({ service: 'avatar', model: `sync.so ${held.model}`, units: 1, unitCostUsd: syncCostUsd(held.model, seconds) }))
      .catch(() => {});
  }
  return { state: 'ready', url };
}
