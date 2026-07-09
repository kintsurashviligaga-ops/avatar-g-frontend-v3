/**
 * lib/orchestrator/dialogueCastPlan.ts
 * ===================================
 * Multi-voice CASTING plan for the film audio assembly. Turns a parsed dialogue sheet (per-SPEAKER,
 * timecoded turns) into a spatialized premix plan: each distinct character is cast to its own ElevenLabs
 * voice seed (via the Day-2 castRoster) AND positioned in the stereo field, so a multi-speaker scene reads as
 * distinct voices coming from distinct places rather than one flat mono narrator.
 *
 * This module is PURE (no ffmpeg, no I/O, no server-only) so the cast-map resolution + the premix filtergraph
 * string are unit-testable. The assembler (lib/orchestrator/ffmpeg-assembly.ts) consumes:
 *   • resolveDialogueCastPlan(turns, env) → the per-turn plan + a multiSpeaker flag
 *   • buildDialoguePremixFilter(plan)     → the -filter_complex that pans each per-speaker stem to its
 *                                           position + time-places it (adelay) + amixes into ONE stereo
 *                                           dialogue lane. That lane then feeds the EXISTING proven
 *                                           voice-keyed sidechain, which ducks music/sfx by DIALOGUE_DUCK_DB
 *                                           (−12 dB) under it — reusing the verified duck rather than a new one.
 *
 * IMPORTANT: casting only ever changes which voice ID + stereo position a line uses. It NEVER touches TTS
 * settings — the ElevenLabs narration stability stays locked at 0.48 (lib/audio/tts-model.ts), entirely
 * separate from this module.
 */
import { castRoster, type Gender } from '@/lib/chat/dialogueCasting';

/** The −12 dB duck the multi-voice path drives music/sfx under active dialogue by (matches DEFAULT_DUCK_DB). */
export const DIALOGUE_DUCK_DB = -12;

/** A dialogue turn the assembler has a rendered stem for: who speaks, when, and (optionally) the words. */
export interface DialogueTurnInput { speaker: string; startSec: number | null; text?: string; direction?: string | null }

export interface CastPlanEntry {
  speaker: string;
  voiceId: string | null;
  gender: Gender;
  /** Stereo position in [-1 (hard left) … +1 (hard right)]; the first-cast speaker sits center (0). */
  pan: number;
  /** Constant-power stereo gains derived from `pan` (l²+r²≈1). */
  panGains: { l: number; r: number };
  /** Placement on the master timeline (seconds); null/absent turns are dropped from the spatial premix. */
  startSec: number;
}

export interface DialogueCastPlan {
  entries: CastPlanEntry[];
  distinctSpeakers: number;
  /** True only when ≥2 DISTINCT speakers AND every kept turn is timecoded — the spatial premix precondition. */
  multiSpeaker: boolean;
}

/** Stereo positions handed out to distinct speakers in first-seen order — narrator/first sits center. */
const PAN_LADDER = [0, -0.6, 0.6, -0.32, 0.32, -0.85, 0.85, -0.5, 0.5] as const;

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
/** Constant-power pan: pan −1→(l=1,r=0), 0→(0.707,0.707), +1→(0,1). */
export function panToGains(pan: number): { l: number; r: number } {
  const p = Math.max(-1, Math.min(1, pan));
  return { l: round3(Math.sqrt((1 - p) / 2)), r: round3(Math.sqrt((1 + p) / 2)) };
}

/**
 * Resolve the casting + spatial plan. Each DISTINCT speaker (first-seen order) is cast to a stable voice via
 * castRoster and given a stereo slot from PAN_LADDER. Only timecoded turns are kept (the spatial premix places
 * each line at its startSec). multiSpeaker is true only with ≥2 distinct speakers AND every kept turn timed —
 * otherwise the caller must fall back to the single-voice assembly.
 */
export function resolveDialogueCastPlan(turns: readonly DialogueTurnInput[]): DialogueCastPlan {
  const clean = (turns ?? []).filter((t) => t && typeof t.speaker === 'string' && t.speaker.trim());
  const roster = castRoster(clean.map((t) => ({ speaker: t.speaker, text: t.text ?? '', direction: t.direction ?? null })));
  const panBySpeaker = new Map<string, number>();
  let order = 0;
  const entries: CastPlanEntry[] = [];
  let anyUntimed = false;
  for (const t of clean) {
    const key = t.speaker.trim().toLowerCase();
    const cast = roster.get(key);
    if (!panBySpeaker.has(key)) { panBySpeaker.set(key, PAN_LADDER[order % PAN_LADDER.length]!); order += 1; }
    if (typeof t.startSec !== 'number' || !Number.isFinite(t.startSec)) { anyUntimed = true; continue; }
    const pan = panBySpeaker.get(key)!;
    entries.push({
      speaker: t.speaker,
      voiceId: cast?.voiceId ?? null,
      gender: cast?.gender ?? 'female',
      pan,
      panGains: panToGains(pan),
      startSec: Math.max(0, t.startSec),
    });
  }
  const distinctSpeakers = panBySpeaker.size;
  const multiSpeaker = distinctSpeakers >= 2 && entries.length >= 2 && !anyUntimed;
  return { entries, distinctSpeakers, multiSpeaker };
}

/**
 * Build the premix -filter_complex that turns N per-speaker mono stems (ffmpeg inputs 0..N-1, in `entries`
 * order) into ONE stereo dialogue lane: each stem is delayed to its startSec, panned to its speaker's stereo
 * position, then amixed. The result label is `[dialogue]`. amix uses normalize=0 so per-line levels are
 * preserved (the master graph's sidechain, not amix, does the leveling/ducking).
 */
export function buildDialoguePremixFilter(plan: DialogueCastPlan): string {
  const legs = plan.entries.map((e, i) => {
    const ms = Math.round(e.startSec * 1000);
    // adelay both channels (post-pan it is stereo); pan a mono source to the speaker's constant-power position.
    return `[${i}:a]pan=stereo|c0=${e.panGains.l}*c0|c1=${e.panGains.r}*c0,adelay=${ms}|${ms}[d${i}]`;
  });
  const labels = plan.entries.map((_, i) => `[d${i}]`).join('');
  const n = plan.entries.length;
  return `${legs.join(';')};${labels}amix=inputs=${n}:normalize=0:dropout_transition=0[dialogue]`;
}
