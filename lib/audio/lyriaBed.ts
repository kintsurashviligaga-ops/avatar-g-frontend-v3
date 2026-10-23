/**
 * lib/audio/lyriaBed.ts — the music bed under a film, a product ad or a Georgian song: Google Lyria 3 on Vertex AI
 * (MASTER TASK v3.1: Lyria is the authorized music path). It replaces ElevenLabs Music, deleted in PR 6.
 *
 * Only what is verified on this project is asked for (the evidence is in lib/music/studio/capabilities):
 *   - an instrumental on lyria-3-clip-preview: proven, about 30 s whatever length the film is;
 *   - a longer bed on lyria-3-pro-preview, only up to MUSIC_LYRIA_PRO_SECONDS once MUSIC_LYRIA_PRO_VERIFIED is set;
 *   - a sung song only once MUSIC_LYRIA_VOCALS_VERIFIED is set. Until then a sung bed is not made at all, and no
 *     instrumental stands in for the song that was asked for (R7, no silent substitution): the caller reports no music.
 * Budget-gated and never throws (generateLyriaTrack). Null on any miss, and nothing runs behind it.
 */
import 'server-only';
import { generateLyriaTrack, hasLyriaProvider } from '@/lib/ai/lyriaMusic';
import { lyriaProMaxSec, lyriaVocalsVerified } from '@/lib/music/studio/capabilities';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { LYRIA_CLIP_MAX_SEC, LYRIA_CLIP_MODEL, LYRIA_PRO_MODEL, musicLengthDirection } from '@/lib/studio/musicEngines';

type Env = NodeJS.ProcessEnv;

/** True when a bed can be asked for at all: Vertex configured and Lyria not switched off. */
export function lyriaBedReady(): boolean {
  return hasLyriaProvider();
}

/** The model and length a bed of `wantSec` is made at, or null when it cannot be made (a song before vocals are verified). */
export function lyriaBedPlan(wantSec: number, instrumental: boolean, env: Env = process.env): { model: string; sec: number } | null {
  if (!instrumental && !lyriaVocalsVerified(env)) return null;
  const want = Math.max(1, Math.round(Number.isFinite(wantSec) ? wantSec : LYRIA_CLIP_MAX_SEC));
  const proSec = lyriaProMaxSec(env);
  if (want > LYRIA_CLIP_MAX_SEC && proSec > LYRIA_CLIP_MAX_SEC) return { model: LYRIA_PRO_MODEL, sec: Math.min(want, proSec) };
  return { model: LYRIA_CLIP_MODEL, sec: Math.min(want, LYRIA_CLIP_MAX_SEC) };
}

/**
 * Make one bed and host it for a week. `prompt` already describes a track of `plan.sec` seconds (lib/audio/songPrompt);
 * Lyria takes no duration field, so Pro is steered to the length by the prompt and the clip makes its own ~30 s.
 */
export async function composeLyriaBed(o: {
  prompt: string;
  plan: { model: string; sec: number };
  instrumental: boolean;
  /** Where it is stored: the bucket ('uploads' unless given) and a folder in it ('films', 'productad-music'). */
  bucket?: string;
  folder: string;
  signal?: AbortSignal;
}): Promise<string | null> {
  if (!lyriaBedReady() || o.signal?.aborted) return null;
  const direction = musicLengthDirection(o.plan.sec);
  const prompt = direction ? `${o.prompt} ${direction}.` : o.prompt;
  const track = await generateLyriaTrack({ prompt, instrumental: o.instrumental, model: o.plan.model, signal: o.signal });
  if (!track) return null;
  const ext = /wav/.test(track.mime) ? 'wav' : /ogg/.test(track.mime) ? 'ogg' : 'mp3';
  const path = `${o.folder}/lyria-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return (await uploadAndSign(o.bucket ?? 'uploads', path, track.base64, track.mime, 604_800)) ?? null;
}
