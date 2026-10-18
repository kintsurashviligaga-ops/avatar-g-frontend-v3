/**
 * lib/music/studio/capabilities.ts — what Music Studio v1 may offer, and why. Google Lyria only (PROJECT_MASTER R7).
 *
 * Every capability carries its evidence. One that has not been seen working on this project's own account is not
 * offered: the request is refused as `unsupported` before any quote, so nothing can be charged for it.
 *
 *   lyria-3-clip-preview, instrumental — PROVEN. Vertex AI, owner account, 2026-10-08 (docs/handoffs/
 *     2026-10-08-gcp-part0-report.md, T2.3): HTTP 200, MP3 30.8 s, stereo 44.1 kHz, 192 kbps, ≈ $0.04.
 *   lyria-3-clip-preview, sung vocals — NOT VERIFIED on this project. Google documents vocals for Lyria 3, but no run
 *     here has produced and checked one. Offered only once the owner-approved paid test (Phase 8) has, by setting
 *     MUSIC_LYRIA_VOCALS_VERIFIED=1. Until then a song request is `unsupported`.
 *   lyria-3-pro-preview — NOT VERIFIED (it answered 500 "high demand" when lib/ai/lyriaMusic was written). Hidden unless
 *     MUSIC_LYRIA_PRO_VERIFIED=1, and even then only up to the length it was verified at (MUSIC_LYRIA_PRO_SECONDS). It
 *     makes every panel length over 30 s (60 / 90 / Full song ≈ 180 s, lib/studio/musicEngines) — the clip makes 30 s.
 *   Lyria RealTime, remix, extension, stems, cover, voice conversion — not implemented on an approved engine: never offered.
 *
 * Length: Lyria takes no duration parameter. The clip model returns its own ~30 s; Pro is steered to the length by the
 * prompt (lib/music/studio/prompt). Neither is ever described as exact.
 */
import { isEnabledByDefault, isTruthyFlag } from '@/lib/env/flag';
import { googleTransportKind, googleTransportProblems } from '@/lib/ai/google/transport';
import { LYRIA_CLIP_MODEL, LYRIA_PRO_MODEL, LYRIA_CLIP_MAX_SEC, musicTargetSec, offeredMusicLengths } from '@/lib/studio/musicEngines';
import type { MusicRequest } from './contracts';
import { MusicError } from './errors';

type Env = NodeJS.ProcessEnv;
export type Transport = 'vertex' | 'gemini_api';
export type Evidence = 'proven' | 'unverified';

export interface MusicModelCapability {
  id: string;
  label: string;
  /** The lengths a request may name, in seconds — the model's own output length, never a promise of exactness. */
  durationsSec: number[];
  exactDuration: false;
  instrumental: { offered: boolean; evidence: Evidence };
  vocals: { offered: boolean; evidence: Evidence };
  /** Languages lyrics may be written in. The model is told the language; how well it sings it is not verified. */
  lyricsLanguages: readonly ('ka' | 'en' | 'ru')[];
  evidence: string;
}

export interface MusicCapabilities {
  enabled: boolean;
  configured: boolean;
  transport: Transport | null;
  /** True when Vertex is the transport — the approved, preferred one. */
  preferredTransport: boolean;
  models: MusicModelCapability[];
  /** Operations Music Studio does NOT offer, stated so the UI can say so instead of hiding them silently. */
  unsupported: readonly string[];
  /** Deterministic edits (ffmpeg, no model). */
  edits: readonly string[];
}

export const CLIP_MODEL = LYRIA_CLIP_MODEL;
export const PRO_MODEL = LYRIA_PRO_MODEL;
export const UNSUPPORTED_OPS = [
  'remix', 'extend', 'stem_separation', 'vocal_removal', 'cover', 'voice_conversion', 'dubbing', 'realtime',
] as const;
export const EDIT_OPS = ['trim', 'volume', 'mute', 'fade_in', 'fade_out', 'join', 'convert'] as const;

/** Music Studio v1 is off until the owner switches it on (MUSIC_STUDIO_ENABLED=1). */
export function musicStudioEnabled(env: Env = process.env): boolean {
  return isTruthyFlag(env.MUSIC_STUDIO_ENABLED);
}

/**
 * The longest track Lyria 3 Pro is verified for (MUSIC_LYRIA_PRO_SECONDS, 30–600), or 0 while MUSIC_LYRIA_PRO_VERIFIED is
 * off. The one gate /api/ai/music, its engines status (the panel's lengths) and this matrix all read.
 */
export function lyriaProMaxSec(env: Env = process.env): number {
  const proSec = Math.round(Number(env.MUSIC_LYRIA_PRO_SECONDS));
  return isTruthyFlag(env.MUSIC_LYRIA_PRO_VERIFIED) && Number.isFinite(proSec) && proSec >= 30 && proSec <= 600 ? proSec : 0;
}

function transportOf(env: Env): Transport | null {
  try {
    const kind = googleTransportKind(env);
    return googleTransportProblems(kind, env).length === 0 ? kind : null;
  } catch {
    return null;
  }
}

export function musicCapabilities(env: Env = process.env): MusicCapabilities {
  const transport = transportOf(env);
  const lyriaOn = isEnabledByDefault(env.LYRIA_ENABLED);
  const vocals = isTruthyFlag(env.MUSIC_LYRIA_VOCALS_VERIFIED);
  const models: MusicModelCapability[] = [{
    id: CLIP_MODEL,
    label: 'Lyria 3 Clip',
    durationsSec: [30],
    exactDuration: false,
    instrumental: { offered: true, evidence: 'proven' },
    vocals: { offered: vocals, evidence: vocals ? 'proven' : 'unverified' },
    lyricsLanguages: ['ka', 'en', 'ru'],
    evidence: 'Vertex AI 2026-10-08: 200, MP3 30.8 s instrumental (gcp-part0-report T2.3)',
  }];
  // The panel's lengths over 30 s, as the seconds the request names (Full song → 180): each within the verified length.
  const proLengths = offeredMusicLengths(lyriaProMaxSec(env)).map(musicTargetSec).filter((s) => s > LYRIA_CLIP_MAX_SEC);
  if (proLengths.length) {
    models.push({
      id: PRO_MODEL,
      label: 'Lyria 3 Pro',
      durationsSec: proLengths,
      exactDuration: false,
      instrumental: { offered: true, evidence: 'proven' },
      vocals: { offered: vocals, evidence: vocals ? 'proven' : 'unverified' },
      lyricsLanguages: ['ka', 'en', 'ru'],
      evidence: 'owner-verified via MUSIC_LYRIA_PRO_VERIFIED',
    });
  }
  return {
    enabled: musicStudioEnabled(env),
    configured: lyriaOn && transport !== null,
    transport,
    preferredTransport: transport === 'vertex',
    models,
    unsupported: UNSUPPORTED_OPS,
    edits: EDIT_OPS,
  };
}

/** Refuse anything the capability matrix does not offer. Runs at quote AND at start (the matrix may change between). */
export function validateCapability(request: MusicRequest, caps: MusicCapabilities): MusicModelCapability {
  if (!caps.enabled) throw new MusicError('not_enabled', 'Music Studio is not enabled.', 503);
  if (!caps.configured || !caps.transport) throw new MusicError('not_configured', 'The Google music engine is not configured.', 503);
  const model = caps.models.find((m) => m.id === request.modelId);
  if (!model) throw new MusicError('unsupported', 'This music model is not available.', 400);
  if (request.mode === 'song' && !model.vocals.offered) {
    throw new MusicError('unsupported', 'Sung vocals are not verified on this model yet. Choose an instrumental.', 400);
  }
  if (request.mode === 'instrumental' && !model.instrumental.offered) throw new MusicError('unsupported', 'Instrumentals are not available on this model.', 400);
  if (!model.durationsSec.includes(request.durationSec)) {
    throw new MusicError('unsupported', `This model makes ${model.durationsSec.join(' / ')} s tracks only.`, 400);
  }
  if (request.lyricsLanguage && !model.lyricsLanguages.includes(request.lyricsLanguage)) {
    throw new MusicError('unsupported', 'This lyrics language is not offered.', 400);
  }
  return model;
}
