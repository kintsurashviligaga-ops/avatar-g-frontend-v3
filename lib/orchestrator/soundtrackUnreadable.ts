/**
 * lib/orchestrator/soundtrackUnreadable.ts — the assembler's named refusal of an audio lane that has no readable audio
 * stream (round 3, P1: "missing / invalid audio"). Before, a soundtrack ffmpeg could not open died INSIDE the one encode
 * command as execFile's raw "Command failed: <argv>…" — unnamed, so the assemble route could only answer the generic
 * `assembly_failed`, and the user could not tell "your music file is unreadable" from "the stitch crashed". Now every
 * audio lane (music, voice, sfx) is probed for an audio stream before the encode is built; a lane without one throws this,
 * nothing is encoded or hosted, and the route answers `422 music_unreadable` after the saga compensated the attempt.
 */

export type SoundtrackLane = 'music' | 'voice' | 'sfx';

const LANE_LABEL: Record<SoundtrackLane, string> = { music: 'soundtrack', voice: 'narration', sfx: 'sound-effects' };

export class SoundtrackUnreadable extends Error {
  readonly code = 'music_unreadable' as const;
  readonly lane: SoundtrackLane;
  constructor(lane: SoundtrackLane) {
    super(`${LANE_LABEL[lane]} lane: music_unreadable — the ${LANE_LABEL[lane]} file has no readable audio stream; nothing was encoded`);
    this.name = 'SoundtrackUnreadable';
    this.lane = lane;
  }
}

/** `err` is the assembler's audio-lane refusal (instanceof-safe across module copies: the code and the lane are checked). */
export function isSoundtrackUnreadable(err: unknown): err is SoundtrackUnreadable {
  return err instanceof SoundtrackUnreadable
    || (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'music_unreadable' && typeof (err as { lane?: unknown }).lane === 'string');
}

/** What the client shows: which file, that nothing was rendered or charged, and the way out. */
export function describeSoundtrackRefusal(lane: SoundtrackLane): string {
  return `The ${LANE_LABEL[lane]} file could not be read as audio, so the video was not assembled. Nothing was rendered and this attempt was not charged — attach another ${LANE_LABEL[lane]} file, or render without it.`;
}
