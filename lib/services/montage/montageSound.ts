/**
 * lib/services/montage/montageSound.ts — the sound of a montage master in one ffmpeg graph: the clips' own sound (or
 * the silence where every shot is muted), a music bed at the level asked, and a narration over both, which the rest
 * steps back under while it speaks.
 *
 * GG 2026-10-11 17:38Z: „ვიდეოში რომ იყოს თავისი ხმაც და ზემოდან მუსიკა დაედოს ან ნარაცია". The editor's mux
 * (lib/video/remixOps muxAudioOntoVideo 'under') halves both lanes (amix's normalize) and knows no narration, so Agent G's
 * montage mixes here:
 *
 *   base    input 0's sound: the master always has a track (surgicalOps lays silence under a muted or silent shot).
 *   music   input 1 when there is one, seeked to its start by the caller (`-ss` before its `-i`), at `gainDb`: 0 when it
 *           is the only sound, lower when the clips' own sound leads.
 *   voice   the last input when there is one, delayed to `atSec` on the master; the base and the music duck under it
 *           (sidechaincompress keyed by the voice itself) and the voice is laid on top at full level.
 *
 * The master's length decides the end (`duration=first`): a song or a narration longer than the picture stops with
 * it, a shorter one leaves the rest of the picture with what remains. A limiter keeps the sum from clipping.
 *
 * Pure: builds the graph only (./montagePipeline and lib/video/remixOps mixMontageSound run it).
 */

export interface SoundMix {
  /** A music bed: its level in dB (0 = as recorded). */
  music?: { gainDb: number };
  /** A narration: the second of the master it starts at. */
  voice?: { atSec: number };
}

/** How the rest steps back while the narration speaks: a fast attack so the first word is clear, a slow release. */
export const VOICE_DUCK = { threshold: 0.03, ratio: 9, attackMs: 15, releaseMs: 450, makeup: 1 } as const;
/** The music's level under the clips' own sound when both play („თავისი ხმაც და ზემოდან მუსიკა"). */
export const MUSIC_UNDER_OWN_DB = -10;
/**
 * The limiter's ceiling (linear, -2 dBFS): the sum of three lanes never clips. Not 0.95: the AAC encoder after the
 * limiter adds its own overshoot, and a hot track mixed at 0 dB came out at +0.17 dBFS once decoded (2026-10-13).
 */
export const LIMIT = 0.794;

const FMT = 'aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';
const db = (x: number) => (Number.isFinite(x) ? Math.max(-60, Math.min(12, x)) : 0);

/** The filtergraph and the output label for one master's sound. Inputs: 0 = master, then the music, then the voice. */
export function soundMixGraph(mix: SoundMix): { graph: string; out: string; inputs: number } {
  const parts: string[] = [`[0:a]${FMT}[base]`];
  let cur = '[base]';
  let k = 1;
  if (mix.music) {
    parts.push(`[${k}:a]${FMT},volume=${db(mix.music.gainDb).toFixed(1)}dB[mus]`);
    parts.push(`${cur}[mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[bed]`);
    cur = '[bed]';
    k += 1;
  }
  if (mix.voice) {
    const ms = Math.max(0, Math.round((Number.isFinite(mix.voice.atSec) ? mix.voice.atSec : 0) * 1000));
    // Padded with silence so the key never ends before the bed: the compressor would stop the whole mix with it.
    parts.push(`[${k}:a]${FMT}${ms ? `,adelay=delays=${ms}:all=1` : ''},apad,asplit=2[vkey][vtop]`);
    const d = VOICE_DUCK;
    parts.push(`${cur}[vkey]sidechaincompress=threshold=${d.threshold}:ratio=${d.ratio}:attack=${d.attackMs}:release=${d.releaseMs}:makeup=${d.makeup}[duck]`);
    parts.push('[duck][vtop]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[spoken]');
    cur = '[spoken]';
    k += 1;
  }
  parts.push(`${cur}alimiter=limit=${LIMIT}:level=disabled[aout]`);
  return { graph: parts.join(';'), out: 'aout', inputs: k };
}
