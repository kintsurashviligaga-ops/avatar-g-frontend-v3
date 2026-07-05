/**
 * audioMix — a 4-field (dialogue · narrator · music · sfx) audio-mixer COMPILER.
 *
 * Pure: it emits an ffmpeg `-filter_complex` string (and the pieces the assembler needs) — it never runs
 * ffmpeg, so every rule is unit-testable. Rules:
 *   • voice-keyed ducking — the music score is `sidechaincompress`-ed UNDER active dialogue, at −12 dB by
 *     default (via the SHARED duckRatio map, unified with the assembler's own graph);
 *   • hard-mute window — a force-to-0 volume gate over a fixed window (default 0:06–0:08). In the
 *     standalone filterComplex it applies to the MUSIC lane only (a score-silence beat); the exported
 *     `hardMuteAf` is the same gate for a post-pass and mutes WHATEVER track it is applied to (on an
 *     already-mixed master that is the full mix — a full-silence beat).
 * Missing fields are simply omitted; a single remaining field is passed through; nothing crashes. All
 * numeric knobs are finite-checked + clamped, so a NaN/absurd input can never emit a malformed filter.
 */
import { duckRatio } from '@/lib/orchestrator/ffmpeg-filtergraph';

export interface AudioMixInputs {
  dialogue?: string | null;
  narrator?: string | null;
  music?: string | null;
  sfx?: string | null;
}

export interface AudioMixOptions {
  /** Music-under-dialogue ducking depth. Default −12 dB. */
  duckDb?: number;
  /** Force-silence window on the score. `null` disables. Default { 6, 8 }. */
  hardMute?: { startSec: number; endSec: number } | null;
  musicVolume?: number;
  sfxVolume?: number;
  dialogueVolume?: number;
  narratorVolume?: number;
}

export const DEFAULT_DUCK_DB = -12;
export const DEFAULT_HARD_MUTE = { startSec: 6, endSec: 8 } as const;

export interface AudioMixPlan {
  /** The standalone 4-field `-filter_complex` graph; inputs indexed [0..] over the PRESENT fields. */
  filterComplex: string;
  /** The graph's audio output label. */
  outLabel: string;
  /** Resolved ducking depth (−12 by default). */
  duckDb: number;
  /** An `-af` gate that mutes the ENTIRE track it is applied to inside the window (a full-silence beat on
   *  an already-mixed master). null when disabled. */
  hardMuteAf: string | null;
  fields: { dialogue: boolean; narrator: boolean; music: boolean; sfx: boolean };
  /** Number of ffmpeg inputs the graph expects. */
  inputCount: number;
}

/** The ffmpeg `volume` expression that force-mutes a track inside [startSec, endSec]. */
export function hardMuteExpr(win: { startSec: number; endSec: number } | null | undefined): string | null {
  if (!win) return null;
  const a = Number.isFinite(+win.startSec) ? Math.max(0, +win.startSec) : 0;
  const b = Number.isFinite(+win.endSec) ? Math.max(a, +win.endSec) : a;
  if (b <= a) return null; // zero/degenerate window → nothing to mute
  return `volume=enable='between(t,${a},${b})':volume=0`;
}

/** Compile the 4-field mixer. Pure — returns the graph + the params the assembler threads in. */
export function compileAudioMix(inputs: AudioMixInputs, opts: AudioMixOptions = {}): AudioMixPlan {
  const duckDb = typeof opts.duckDb === 'number' ? opts.duckDb : DEFAULT_DUCK_DB;
  const hardMute = opts.hardMute === undefined ? DEFAULT_HARD_MUTE : opts.hardMute;
  // Shared dB→ratio map at the canonical 30% ducking baseline (duckPct 30 → duck 0.3), so −12 dB → 12,
  // −18 dB → 17 — identical to the assembler's own 2-track/3-track ducking for the same input.
  const ratio = duckRatio(duckDb, 0.3);
  // Finite-check + clamp every lane volume (0..4) so a NaN/absurd input can never emit a broken filter.
  const vol = (v: number | undefined, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(4, Math.max(0, v)) : dflt);
  const dlgV = vol(opts.dialogueVolume, 1.25);
  const narrV = vol(opts.narratorVolume, 1.1);
  const musV = vol(opts.musicVolume, 0.55);
  const sfxV = vol(opts.sfxVolume, 0.8);

  const present = { dialogue: !!inputs.dialogue, narrator: !!inputs.narrator, music: !!inputs.music, sfx: !!inputs.sfx };
  const idx: Partial<Record<keyof typeof present, number>> = {};
  let n = 0;
  (['dialogue', 'narrator', 'music', 'sfx'] as const).forEach((k) => { if (present[k]) idx[k] = n++; });

  const mute = hardMuteExpr(hardMute);
  const parts: string[] = [];
  const mixLabels: string[] = [];

  // Dialogue → the ducking KEY (split: one lane to the mix, one lane to sidechain-key the music).
  if (present.dialogue) {
    parts.push(`[${idx.dialogue}:a]volume=${dlgV},asplit=2[vmix][vkey]`);
    mixLabels.push('[vmix]');
  }
  if (present.narrator) {
    parts.push(`[${idx.narrator}:a]volume=${narrV}[narr]`);
    mixLabels.push('[narr]');
  }
  if (present.music) {
    // volume → optional hard-mute → sidechain-duck under dialogue when present.
    let chain = `[${idx.music}:a]volume=${musV}`;
    if (mute) chain += `,${mute}`;
    parts.push(`${chain}[musv]`);
    if (present.dialogue) {
      parts.push(`[musv][vkey]sidechaincompress=threshold=0.03:ratio=${ratio}:attack=5:release=250[musf]`);
      mixLabels.push('[musf]');
    } else {
      mixLabels.push('[musv]');
    }
  }
  if (present.sfx) {
    parts.push(`[${idx.sfx}:a]volume=${sfxV}[sfxv]`);
    mixLabels.push('[sfxv]');
  }

  const outLabel = '[aout]';
  if (mixLabels.length === 0) {
    return { filterComplex: '', outLabel, duckDb, hardMuteAf: mute, fields: present, inputCount: 0 };
  }
  if (mixLabels.length === 1) {
    parts.push(`${mixLabels[0]}anull${outLabel}`);
  } else {
    parts.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0:dropout_transition=0${outLabel}`);
  }
  return { filterComplex: parts.join(';'), outLabel, duckDb, hardMuteAf: mute, fields: present, inputCount: n };
}
