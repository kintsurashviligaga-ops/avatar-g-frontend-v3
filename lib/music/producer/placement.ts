/**
 * lib/music/producer/placement.ts — "Use in Video": where a Music Producer track sits in a film, and the ffmpeg mix. Pure.
 *
 * A Director's Workflow film is its scene cards joined in order (lib/video/directorsWorkflow/finalCut), so a scene's place
 * in the film is the sum of the scenes before it. The structural `PlacementScene` matches DwScene (id, order, seconds) so
 * this file needs nothing from the video branch.
 *
 *   • Scene N, span 'scene' (the default): the track starts with scene N and is trimmed to that scene.
 *   • Scene N, span 'to_end': it starts with scene N and runs to the end of the track or the film, whichever is first.
 *   • Whole film: from 0:00 to the end of the track or the film. A track shorter than the film plays once and fades out;
 *     the plan says so (it is never looped behind the user's back).
 *   • Always a 0.5 s fade in and out (shorter for a very short cue), the music 6 dB under the film's own sound, and dipped
 *     further while someone speaks (sidechain from the film's audio). The film's dialogue stays at full level.
 *   • The picture is never re-encoded (-c:v copy); only the audio is mixed.
 */

export interface PlacementScene { id: string; order: number; seconds: number }

export type CueTarget = { kind: 'scene'; scene: number } | { kind: 'film' };
export type CueSpan = 'scene' | 'to_end';

export const CUE_FADE_SEC = 0.5;
export const CUE_GAIN_DB = -6;

export interface Cue {
  /** Where the music starts in the film. */
  startSec: number;
  /** How long it plays (trimmed from the start of the track). */
  durSec: number;
  fadeInSec: number;
  fadeOutSec: number;
  gainDb: number;
  filmSec: number;
  /** The scene it starts with (1-based), or null for the whole film. */
  scene: number | null;
  notes: Array<'track_shorter_than_film' | 'track_shorter_than_scene' | 'trimmed_to_scene' | 'trimmed_to_film'>;
}

export type CueCheck = { ok: true; cue: Cue } | { ok: false; reason: 'no_scene' | 'empty_film' | 'track_unmeasured' };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const filmLength = (scenes: readonly PlacementScene[]): number => scenes.reduce((n, s) => n + Math.max(0, s.seconds), 0);

/** Where scene N (1-based, by `order`) starts and ends in the film; null if there is no such scene. */
export function sceneWindow(scenes: readonly PlacementScene[], n: number): { start: number; end: number } | null {
  const sorted = [...scenes].sort((a, b) => a.order - b.order);
  if (!Number.isInteger(n) || n < 1 || n > sorted.length) return null;
  let start = 0;
  for (let i = 0; i < n - 1; i++) start += sorted[i]?.seconds ?? 0;
  return { start: r3(start), end: r3(start + (sorted[n - 1]?.seconds ?? 0)) };
}

export function planCue(input: { scenes: readonly PlacementScene[]; target: CueTarget; span?: CueSpan; trackSec: number }): CueCheck {
  const filmSec = r3(filmLength(input.scenes));
  if (!(filmSec > 0)) return { ok: false, reason: 'empty_film' };
  if (!(input.trackSec > 0)) return { ok: false, reason: 'track_unmeasured' };
  const notes: Cue['notes'] = [];
  let startSec = 0;
  let windowSec = filmSec;
  let scene: number | null = null;
  if (input.target.kind === 'scene') {
    const w = sceneWindow(input.scenes, input.target.scene);
    if (!w) return { ok: false, reason: 'no_scene' };
    scene = input.target.scene;
    startSec = w.start;
    windowSec = (input.span ?? 'scene') === 'scene' ? w.end - w.start : filmSec - w.start;
  }
  const durSec = r3(Math.min(input.trackSec, windowSec));
  if (input.trackSec > windowSec) notes.push(scene != null && (input.span ?? 'scene') === 'scene' ? 'trimmed_to_scene' : 'trimmed_to_film');
  else if (input.trackSec < windowSec) notes.push(scene != null && (input.span ?? 'scene') === 'scene' ? 'track_shorter_than_scene' : 'track_shorter_than_film');
  const fade = r3(Math.min(CUE_FADE_SEC, durSec / 4));
  return { ok: true, cue: { startSec: r3(startSec), durSec, fadeInSec: fade, fadeOutSec: fade, gainDb: CUE_GAIN_DB, filmSec, scene, notes } };
}

/** The audio graph: input 0 = the film, input 1 = the track. */
export function cueFilter(cue: Cue, filmHasAudio: boolean): string {
  const ms = Math.round(cue.startSec * 1000);
  const outAt = r3(Math.max(0, cue.durSec - cue.fadeOutSec));
  const music = `[1:a]atrim=0:${cue.durSec},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${cue.fadeInSec},afade=t=out:st=${outAt}:d=${cue.fadeOutSec},volume=${cue.gainDb}dB,adelay=${ms}|${ms}[m]`;
  if (!filmHasAudio) return `${music};[m]apad[aout]`;
  return [
    music,
    '[0:a]asplit=2[dlg][sc]',
    // Dips the music further while the film's own sound (the scene's dialogue) is loud; the dialogue itself is untouched.
    '[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[md]',
    '[dlg][md]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]',
  ].join(';');
}

export function cueArgs(film: string, track: string, out: string, cue: Cue, filmHasAudio: boolean): string[] {
  return [
    '-hide_banner', '-y', '-i', film, '-i', track,
    '-filter_complex', cueFilter(cue, filmHasAudio),
    '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', String(cue.filmSec), '-movflags', '+faststart', out,
  ];
}

/** "Use in Video → Montage": what the montage render route (/api/v2/montage/render) takes for its music bed. */
export function montageHandoff(trackUrl: string): { musicUrl: string; musicStartSec: number; musicGainDb: number } {
  return { musicUrl: trackUrl, musicStartSec: 0, musicGainDb: CUE_GAIN_DB };
}
