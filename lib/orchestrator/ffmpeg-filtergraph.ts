/**
 * Pure FFmpeg filtergraph builder for the CPU assembly fallback (Option B).
 *
 * Produces the `-filter_complex` string + the video/audio map labels that stitch
 * N clips with xfade transitions and a dual-track audio mix (voiceover at full
 * level; music + SFX attenuated by the ducking percentage). No IO, no ffmpeg
 * import → trivially unit-testable and client-safe.
 *
 * Mirrors the GPU worker (runpod-worker/handler.py) but uses a constant `volume`
 * attenuation for ducking instead of sidechaincompress — predictable + fast on
 * a CPU serverless node. (The GPU path keeps true dynamic sidechain ducking.)
 */

export interface FilterGraphOpts {
  nClips: number;
  hasVoice: boolean;
  hasMusic: boolean;
  hasSfx: boolean;
  fps: number;          // 24 native; CPU path does not interpolate to 60
  duckPct: number;      // 0–100, background attenuation under the voice
  clipSec?: number;     // per-clip seconds (default 6)
  transition?: string;  // crossfade | dissolve | wipe | fade_to_black
}

const XFADE: Record<string, string> = {
  crossfade: 'fade',
  dissolve: 'dissolve',
  wipe: 'wiperight',
  fade_to_black: 'fadeblack',
};
const TRANSITION_SEC = 0.5;

export function buildFilterComplex(opts: FilterGraphOpts): {
  filter: string;
  vmap: string;
  amap: string | null;
} {
  const nClips = Math.max(1, Math.floor(opts.nClips));
  const clipSec = opts.clipSec ?? 6;
  const vfps = opts.fps >= 30 ? 30 : 24; // CPU stays native (no 60fps minterpolate)
  const trans = XFADE[opts.transition ?? 'crossfade'] ?? 'fade';
  const parts: string[] = [];

  // ── Video: normalize each clip, then xfade-chain ──────────────────────────
  for (let i = 0; i < nClips; i++) {
    parts.push(`[${i}:v]settb=AVTB,fps=${vfps},format=yuv420p[v${i}]`);
  }
  let vmap: string;
  if (nClips === 1) {
    vmap = '[v0]';
  } else {
    let prev = 'v0';
    let offset = clipSec - TRANSITION_SEC;
    for (let i = 1; i < nClips; i++) {
      const out = `vx${i}`;
      parts.push(`[${prev}][v${i}]xfade=transition=${trans}:duration=${TRANSITION_SEC}:offset=${offset.toFixed(2)}[${out}]`);
      prev = out;
      offset += clipSec - TRANSITION_SEC;
    }
    vmap = `[${prev}]`;
  }

  // ── Audio: voiceover (full) + ducked background (music ∪ sfx) ─────────────
  let ai = nClips; // audio inputs come after the N video inputs
  const voiceIdx = opts.hasVoice ? ai++ : null;
  const musicIdx = opts.hasMusic ? ai++ : null;
  const sfxIdx = opts.hasSfx ? ai++ : null;
  const bg = [musicIdx, sfxIdx].filter((x): x is number => x !== null);
  const duck = Math.max(0, Math.min(1, opts.duckPct / 100));
  const bgVol = (1 - duck).toFixed(2);

  let amap: string | null = null;
  if (voiceIdx !== null && bg.length > 0) {
    let bgLabel: string;
    if (bg.length > 1) {
      parts.push(`${bg.map(i => `[${i}:a]`).join('')}amix=inputs=${bg.length}:normalize=0[bg]`);
      bgLabel = '[bg]';
    } else {
      bgLabel = `[${bg[0]}:a]`;
    }
    parts.push(`${bgLabel}volume=${bgVol}[bgduck]`);
    parts.push(`[bgduck][${voiceIdx}:a]amix=inputs=2:normalize=0[aout]`);
    amap = '[aout]';
  } else if (voiceIdx !== null) {
    amap = `[${voiceIdx}:a]`;
  } else if (bg.length > 0) {
    if (bg.length > 1) {
      parts.push(`${bg.map(i => `[${i}:a]`).join('')}amix=inputs=${bg.length}:normalize=0[aout]`);
      amap = '[aout]';
    } else {
      amap = `[${bg[0]}:a]`;
    }
  }

  return { filter: parts.join(';'), vmap, amap };
}
