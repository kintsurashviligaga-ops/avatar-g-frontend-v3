/**
 * lib/chat/filmEngines.ts — the four generation legs of the 30-second film, as the operator reports name them
 * (GET /api/system/film-readiness and /api/system/film-selftest).
 *
 * Every leg runs on Google on Vertex AI (MASTER TASK v3.1, docs/VEO_ENGINE.md):
 *   storyboard — Gemini image frames (lib/ai/geminiImage, GEMINI_FRAME_MODEL)
 *   director   — Veo clips (lib/veo: the Vertex config plus the Veo bucket)
 *   score      — Lyria (lib/audio/lyriaBed), unless LYRIA_ENABLED switches it off
 *   voice      — Cloud TTS, with Gemini-TTS for Georgian (lib/audio/google-tts)
 * Until 2026-10-23 the reports named Nano Banana, LTX, Udio and ElevenLabs here, and the self-test marked Replicate and
 * LTX as critical: engines the film no longer uses, so a Google-only deploy read DEGRADED and was told to add them.
 *
 * Reads only an injected env map, does no I/O, and returns env-variable NAMES and booleans, never a value. Whether the
 * credentials work is the free live checks' job (/api/health/public).
 */
import 'server-only';
import { googleTransportKind, googleTransportProblems } from '@/lib/ai/google/transport';
import { vertexAiConfigProblems, vertexConfigProblems, type EnvSource } from '@/lib/veo/vertexAuth';
import { isEnabledByDefault } from '@/lib/env/flag';

export type FilmLeg = 'storyboard' | 'director' | 'score' | 'voice';

export interface FilmLegReadiness {
  agent: FilmLeg;
  /** The engine that serves the leg, e.g. "Gemini gemini-3.1-flash-image on Vertex AI". */
  engine: string;
  role: string;
  present: boolean;
  /** What keeps the leg from serving: env-variable names, suffixed when set but unusable. [] when it can serve. */
  missing: string[];
}

/** The Gemini transport's problems. A GEMINI_TRANSPORT other than vertex is a problem, never a second transport. */
function geminiProblems(env: EnvSource): string[] {
  const e = env as NodeJS.ProcessEnv;
  try {
    return googleTransportProblems(googleTransportKind(e), e);
  } catch {
    return ['GEMINI_TRANSPORT (must be vertex or unset)'];
  }
}

function leg(agent: FilmLeg, engine: string, role: string, missing: string[]): FilmLegReadiness {
  return { agent, engine, role, present: missing.length === 0, missing };
}

export function computeFilmEngines(env: EnvSource = process.env): FilmLegReadiness[] {
  const gemini = geminiProblems(env);
  const frameModel = (env.GEMINI_FRAME_MODEL || 'gemini-3.1-flash-image').trim();
  const lyriaOff = isEnabledByDefault(env.LYRIA_ENABLED) ? [] : ['LYRIA_ENABLED (off)'];
  return [
    leg('storyboard', `Gemini ${frameModel} on Vertex AI`, 'Storyboard frames and the identity-locked first frame', gemini),
    leg('director', 'Veo on Vertex AI', 'Clip render', vertexConfigProblems(env)),
    leg('score', 'Lyria on Vertex AI', 'The film’s music bed (a miss is no music, never a second engine)', [...gemini, ...lyriaOff]),
    leg('voice', 'Google Cloud TTS (Gemini-TTS for Georgian)', 'Narration and dialogue', vertexAiConfigProblems(env)),
  ];
}

/** The same legs keyed by leg, for a report that names each one. */
export function filmEnginesByLeg(env: EnvSource = process.env): Record<FilmLeg, FilmLegReadiness> {
  const [storyboard, director, score, voice] = computeFilmEngines(env) as [FilmLegReadiness, FilmLegReadiness, FilmLegReadiness, FilmLegReadiness];
  return { storyboard, director, score, voice };
}
