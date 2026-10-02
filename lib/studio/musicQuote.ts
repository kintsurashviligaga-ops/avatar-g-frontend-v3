/**
 * lib/studio/musicQuote.ts — what ONE press of the Music tool's Create button costs, in credits.
 *
 * ⚠️ THE NUMBER ON THE BUTTON MUST BE THE NUMBER ON THE BILL. /api/ai/music reserves
 * `creditCostFor('music', { seconds: billSeconds })` where
 *
 *     billSeconds = audioReference ? 30 : (durationSec === 0 ? 90 : durationSec)
 *
 * so (a) "Full song" (0) is billed at the 90 s tier and (b) a COVER — the picked track's melody re-imagined by
 * MusicGen — is a flat 30 s whatever the length picker says. The panel's button, the composer's price line and the
 * route all read this one arithmetic, and the quote itself goes through lib/credits/quote (the shared function).
 *
 * Pure and isomorphic: no React, no env.
 */
import { quoteCredits } from '@/lib/credits/quote';

/** The track lengths the panel offers (0 = "Full song", billed at the 90 s tier; 15 is a legacy value). */
export type MusicDuration = 0 | 15 | 30 | 60 | 90;

/** The lengths the Create screen shows, in order. */
export const MUSIC_DURATIONS = [30, 60, 90, 0] as const satisfies readonly MusicDuration[];

export interface MusicQuoteInput {
  /** The length picker's value. */
  duration: number;
  /** The run is a COVER: a reference track is attached, used as a melody, and no trained voice overrides it. */
  cover?: boolean;
}

/**
 * True when the request will carry an `audioReference` (a cover) — mirrors OmniStudio's runMusicJob:
 * an attached track in 'cover' mode, and not the trained-voice path (which sends no reference at all).
 */
export function isCoverRun(o: { hasAudio: boolean; audioMode: 'cover' | 'voice'; trainedVoiceActive: boolean }): boolean {
  return o.hasAudio && o.audioMode === 'cover' && !o.trainedVoiceActive;
}

/** The seconds the route bills this request at (its `billSeconds`). */
export function musicBilledSeconds(o: MusicQuoteInput): number {
  if (o.cover) return 30;
  return o.duration === 0 ? 90 : o.duration;
}

/** Credits for one press — the shared quote, at the seconds the route bills. */
export function musicQuote(o: MusicQuoteInput): number {
  return quoteCredits({ tool: 'music', seconds: musicBilledSeconds(o) });
}
