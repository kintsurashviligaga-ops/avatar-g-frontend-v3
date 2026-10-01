/**
 * lib/studio/musicRegen.ts — the music RE-ROLL contract behind OmniStudio's "Regenerate" button on a track.
 *
 * A re-roll must re-run the SAME request that produced the track (same brief + settings → a fresh variation).
 *
 * ⚠️ THE SPEC USED TO CARRY ONLY prompt / genre / instrumental / lyrics. The re-roll POST therefore sent no
 * `durationSec` (the route defaults to 30 s — a 60 s, 90 s or full song came back as a 30 s clip), no
 * `voiceType` (the singer's gender was silently dropped) and no `tempo`. The spec now records all three, and the
 * body builder re-validates them, because the spec is persisted with the message (localStorage, any older build)
 * and a reloaded bubble re-rolls from whatever was stored.
 *
 * Pure and client-safe — imported by the studio component; the route clamps every field again server-side.
 */

export type MusicTempo = 'slow' | 'medium' | 'fast';
export type MusicVoiceType = 'female' | 'male' | 'duet';

export type MusicRegenSpec = {
  kind: 'music';
  prompt: string;
  genre: string;
  instrumental: boolean;
  lyrics?: string;
  /** 0 = "full song", otherwise 15–90. ABSENT on specs persisted before this field existed → the route's 30 s default. */
  durationSec?: number;
  tempo?: MusicTempo;
  /** Sung-vocal gender — a SONG only; never stored on an instrumental. */
  voiceType?: MusicVoiceType;
};

const TEMPOS: ReadonlySet<string> = new Set<MusicTempo>(['slow', 'medium', 'fast']);
const VOICES: ReadonlySet<string> = new Set<MusicVoiceType>(['female', 'male', 'duet']);

/** The route's own clamp (app/api/ai/music, `durationSec`): 0 = full song, anything else 15–90. Junk → undefined. */
function normDuration(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return v === 0 ? 0 : Math.max(15, Math.min(90, Math.round(v)));
}

/**
 * Build a re-roll spec from the values the original request ACTUALLY SENT (not the live panel — the user may
 * have changed it since). Lyrics and voiceType are dropped on an instrumental, exactly as the request drops them.
 */
export function makeMusicRegenSpec(m: {
  prompt: string; genre: string; instrumental: boolean; lyrics?: string;
  durationSec?: number; tempo?: string; voiceType?: string;
}): MusicRegenSpec {
  const durationSec = normDuration(m.durationSec);
  const tempo = typeof m.tempo === 'string' && TEMPOS.has(m.tempo) ? (m.tempo as MusicTempo) : undefined;
  const voiceType = !m.instrumental && typeof m.voiceType === 'string' && VOICES.has(m.voiceType) ? (m.voiceType as MusicVoiceType) : undefined;
  const lyrics = !m.instrumental && typeof m.lyrics === 'string' && m.lyrics.trim() ? m.lyrics : undefined;
  return {
    kind: 'music',
    prompt: m.prompt,
    genre: m.genre,
    instrumental: m.instrumental,
    ...(lyrics ? { lyrics } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(tempo ? { tempo } : {}),
    ...(voiceType ? { voiceType } : {}),
  };
}

/** The /api/ai/music POST body for a re-roll. A field the spec lacks is OMITTED, so the route applies its own default. */
export function musicRegenBody(spec: MusicRegenSpec): Record<string, unknown> {
  const s = makeMusicRegenSpec(spec);
  return {
    prompt: s.prompt,
    style: s.genre,
    instrumental: s.instrumental,
    ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
    ...(s.tempo ? { tempo: s.tempo } : {}),
    ...(s.voiceType ? { voiceType: s.voiceType } : {}),
    ...(s.lyrics ? { lyrics: s.lyrics } : {}),
  };
}

/**
 * The seconds the route BILLS this re-roll at (a re-roll never carries an audioReference, so no flat-30 cover
 * rule): full song → the 90 s tier, absent → the route's 30 s default. Feeds the credit toast so the deduction
 * shown is the deduction made.
 */
export function musicRegenBilledSeconds(spec: MusicRegenSpec): number {
  const d = normDuration(spec.durationSec);
  return d === undefined ? 30 : d === 0 ? 90 : d;
}
