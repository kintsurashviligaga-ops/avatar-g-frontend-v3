/**
 * audioMix — a 4-field (dialogue · narrator · music · sfx) audio-mixer COMPILER.
 *
 * Pure: it emits an ffmpeg `-filter_complex` string (and the pieces the assembler needs) — it never runs
 * ffmpeg, so every rule is unit-testable. Rules are DRIVEN BY THE PARSED SCRIPT (no hardcoded window):
 *   • ducking — the score drops under dialogue. When explicit `dialogueSpans` are supplied it is
 *     TIME-driven (music volume → duck-gain during each span); with no spans it falls back to the
 *     signal-driven `sidechaincompress` under the voice lane. Depth defaults to −12 dB.
 *   • hard-mute — every window in `muteWindows` force-mutes the score to 0 (a silence beat). In the
 *     standalone filterComplex this applies to the MUSIC lane only; the exported `hardMuteAf` is the same
 *     gate for a post-pass and mutes WHATEVER track it is applied to (on a mixed master, the full mix).
 * Missing fields are omitted; a single field is passed through; no window → no mute. All numeric knobs are
 * finite-checked + clamped, so a NaN/absurd input can never emit a malformed filter.
 */
import { duckRatio } from '@/lib/orchestrator/ffmpeg-filtergraph';

export interface MixWindow {
  startSec: number;
  endSec: number;
}

export interface AudioMixInputs {
  dialogue?: string | null;
  narrator?: string | null;
  music?: string | null;
  sfx?: string | null;
}

export interface AudioMixOptions {
  /** Music-under-dialogue ducking depth. Default −12 dB. */
  duckDb?: number;
  /** Explicit dialogue spans (from the parsed script) → TIME-driven music ducking. */
  dialogueSpans?: MixWindow[];
  /** Explicit score hard-mute / silence-beat windows (from the parsed script). */
  muteWindows?: MixWindow[];
  /** Legacy single hard-mute window (mapped to a one-element muteWindows when muteWindows is absent). */
  hardMute?: MixWindow | null;
  musicVolume?: number;
  sfxVolume?: number;
  dialogueVolume?: number;
  narratorVolume?: number;
}

export const DEFAULT_DUCK_DB = -12;

export interface AudioMixPlan {
  /** The standalone 4-field `-filter_complex` graph; inputs indexed [0..] over the PRESENT fields. */
  filterComplex: string;
  outLabel: string;
  duckDb: number;
  /** An `-af` gate that mutes the ENTIRE track it is applied to across ALL mute windows (a silence beat
   *  on an already-mixed master). null when there are no windows. */
  hardMuteAf: string | null;
  fields: { dialogue: boolean; narrator: boolean; music: boolean; sfx: boolean };
  inputCount: number;
  /** How many mute windows were actually applied. */
  muteWindowCount: number;
}

/** The ffmpeg timeline expression that is true inside ANY of the given windows (OR via `+`). null if none valid. */
export function windowsExpr(windows: readonly MixWindow[] | null | undefined): string | null {
  const valid = (windows ?? [])
    .map((w) => ({ a: Number.isFinite(+w.startSec) ? Math.max(0, +w.startSec) : 0, b: Number.isFinite(+w.endSec) ? +w.endSec : 0 }))
    .filter((w) => w.b > w.a);
  if (!valid.length) return null;
  return valid.map((w) => `between(t,${w.a},${w.b})`).join('+');
}

/** An `-af` fragment force-muting a track across all windows. null when no valid window. */
export function muteAf(windows: readonly MixWindow[] | null | undefined): string | null {
  const expr = windowsExpr(windows);
  return expr ? `volume=enable='${expr}':volume=0` : null;
}

/** Back-compat single-window helper. */
export function hardMuteExpr(win: MixWindow | null | undefined): string | null {
  return win ? muteAf([win]) : null;
}

/**
 * Clamp a set of windows to a [0, maxSec] master timeline: DROP windows that start at/after maxSec (or are
 * degenerate) and TRIM any that overrun maxSec. Returns the survivors + a count of fully-dropped windows so
 * the caller can log a silently-lost silence beat. Guards the case where the script's declared duration
 * diverges from the assembler's DERIVED master length — an out-of-range `between(t,a,b)` would otherwise
 * never fire and drop the requested mute with no trace.
 */
export function clampWindows(windows: readonly MixWindow[] | null | undefined, maxSec: number): { windows: MixWindow[]; dropped: number } {
  const cap = Number.isFinite(maxSec) && maxSec > 0 ? maxSec : 0;
  let dropped = 0;
  const out: MixWindow[] = [];
  for (const w of windows ?? []) {
    const a = Number.isFinite(+w.startSec) ? Math.max(0, +w.startSec) : 0;
    const bRaw = Number.isFinite(+w.endSec) ? +w.endSec : 0;
    const b = Math.min(bRaw, cap);
    if (!(b > a) || a >= cap) { dropped++; continue; }
    out.push({ startSec: a, endSec: b });
  }
  return { windows: out, dropped };
}

/** Compile the 4-field mixer. Pure — returns the graph + the params the assembler threads in. */
export function compileAudioMix(inputs: AudioMixInputs, opts: AudioMixOptions = {}): AudioMixPlan {
  const duckDb = typeof opts.duckDb === 'number' && Number.isFinite(opts.duckDb) ? opts.duckDb : DEFAULT_DUCK_DB;
  // Script-driven windows (no hardcoded default): explicit muteWindows, else the legacy single hardMute, else none.
  const muteWindows: MixWindow[] = opts.muteWindows ?? (opts.hardMute ? [opts.hardMute] : []);
  const dialogueSpans: MixWindow[] = opts.dialogueSpans ?? [];

  // Shared dB→ratio map at the canonical 30% baseline (−12 dB → 12, −18 dB → 17), and the equivalent
  // linear gain for TIME-driven ducking (−12 dB → ~0.251).
  const ratio = duckRatio(duckDb, 0.3);
  const duckGain = Math.min(1, Math.max(0, Math.pow(10, duckDb / 20)));

  const vol = (v: number | undefined, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(4, Math.max(0, v)) : dflt);
  const dlgV = vol(opts.dialogueVolume, 1.25);
  const narrV = vol(opts.narratorVolume, 1.1);
  const musV = vol(opts.musicVolume, 0.55);
  const sfxV = vol(opts.sfxVolume, 0.8);

  const present = { dialogue: !!inputs.dialogue, narrator: !!inputs.narrator, music: !!inputs.music, sfx: !!inputs.sfx };
  const idx: Partial<Record<keyof typeof present, number>> = {};
  let n = 0;
  (['dialogue', 'narrator', 'music', 'sfx'] as const).forEach((k) => { if (present[k]) idx[k] = n++; });

  const muteExpr = windowsExpr(muteWindows);
  const duckExpr = windowsExpr(dialogueSpans);
  const parts: string[] = [];
  const mixLabels: string[] = [];

  if (present.dialogue) {
    parts.push(`[${idx.dialogue}:a]volume=${dlgV},asplit=2[vmix][vkey]`);
    mixLabels.push('[vmix]');
  }
  if (present.narrator) {
    parts.push(`[${idx.narrator}:a]volume=${narrV}[narr]`);
    mixLabels.push('[narr]');
  }
  if (present.music) {
    const chain = [`[${idx.music}:a]volume=${musV}`];
    if (muteExpr) chain.push(`volume=enable='${muteExpr}':volume=0`);
    if (duckExpr) {
      // TIME-driven ducking under the script's dialogue spans (explicit, no signal detection needed).
      chain.push(`volume=enable='${duckExpr}':volume=${duckGain.toFixed(3)}`);
      parts.push(`${chain.join(',')}[musf]`);
      mixLabels.push('[musf]');
    } else if (present.dialogue) {
      // No explicit spans → signal-driven sidechain under the voice lane (as before).
      parts.push(`${chain.join(',')}[musv]`);
      parts.push(`[musv][vkey]sidechaincompress=threshold=0.03:ratio=${ratio}:attack=5:release=250[musf]`);
      mixLabels.push('[musf]');
    } else {
      parts.push(`${chain.join(',')}[musv]`);
      mixLabels.push('[musv]');
    }
  }
  if (present.sfx) {
    parts.push(`[${idx.sfx}:a]volume=${sfxV}[sfxv]`);
    mixLabels.push('[sfxv]');
  }

  const outLabel = '[aout]';
  const muteWindowCount = muteExpr ? muteExpr.split('+').length : 0;
  if (mixLabels.length === 0) {
    return { filterComplex: '', outLabel, duckDb, hardMuteAf: muteAf(muteWindows), fields: present, inputCount: 0, muteWindowCount };
  }
  if (mixLabels.length === 1) {
    parts.push(`${mixLabels[0]}anull${outLabel}`);
  } else {
    parts.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0:dropout_transition=0${outLabel}`);
  }
  return { filterComplex: parts.join(';'), outLabel, duckDb, hardMuteAf: muteAf(muteWindows), fields: present, inputCount: n, muteWindowCount };
}
