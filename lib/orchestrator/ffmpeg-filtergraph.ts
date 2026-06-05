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
const TRANSITION_SEC = 1; // 1s crossfade (offset = clipSec - 1)

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

  // PHASE 52 TASK 4 — the exact length of the compiled master after the xfade
  // chain. N clips each `clipSec` long, overlapped by `TRANSITION_SEC` at every
  // join: totalDur = N·clipSec − (N−1)·TRANSITION_SEC. The background audio bed
  // is later padded/trimmed to THIS value so music/SFX scale to the timeline.
  const totalDur = nClips * clipSec - Math.max(0, nClips - 1) * TRANSITION_SEC;

  // ── Video: normalize + color-match QA pass per clip, then xfade-chain ──────
  // Per-clip finishing pass: scale EVERY clip onto a clean 1920×1080 canvas
  // (letterboxed, square pixels) so independently-generated clips share identical
  // dimensions — this both guarantees a 1080p master AND prevents the xfade chain
  // from erroring on a mismatched source. Then a uniform cinematic grade
  // (contrast + saturation + slightly lifted blacks via gamma) keeps the look
  // consistent across clips, plus a touch of unsharp for crispness.
  for (let i = 0; i < nClips; i++) {
    parts.push(
      `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
        `pad=1920:1080:-1:-1:color=black,setsar=1,settb=AVTB,fps=${vfps},` +
        `format=yuv420p,eq=contrast=1.06:saturation=1.08:gamma=0.98,unsharp=3:3:0.3[v${i}]`,
    );
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

  // ── Cinematic master grade + bookends, applied ONCE to the assembled timeline:
  //   • colorbalance — a subtle teal-orange film look (cool shadows, warm
  //     highlights), the signature Hollywood colour signature;
  //   • eq          — a gentle finishing contrast/saturation with lifted blacks;
  //   • vignette    — soft edge falloff that draws the eye to centre frame;
  //   • fade in/out — fade up from black at the head, fade to black at the tail.
  // (No film grain: it inflated the encoded bitrate ~5× — high-entropy noise
  // defeats H.264 compression — for a marginal, subjective texture gain.)
  const FADE_SEC = 0.6;
  parts.push(
    `${vmap}colorbalance=rs=-0.02:bs=0.05:rm=0.03:bm=-0.02:rh=0.05:bh=-0.05,` +
      `eq=contrast=1.04:saturation=1.06:gamma=0.98,` +
      `vignette=angle=PI/4.2,` +
      `fade=t=in:st=0:d=${FADE_SEC},` +
      `fade=t=out:st=${Math.max(0, totalDur - FADE_SEC).toFixed(2)}:d=${FADE_SEC}[vfinal]`,
  );
  vmap = '[vfinal]';

  // ── Audio: voiceover (full) + ducked background (music ∪ sfx) ─────────────
  let ai = nClips; // audio inputs come after the N video inputs
  const voiceIdx = opts.hasVoice ? ai++ : null;
  const musicIdx = opts.hasMusic ? ai++ : null;
  const sfxIdx = opts.hasSfx ? ai++ : null;
  const bg = [musicIdx, sfxIdx].filter((x): x is number => x !== null);
  const duck = Math.max(0, Math.min(1, opts.duckPct / 100));

  // The pre-final audio label produced by mixing/ducking, before the master
  // timeline pad+trim is applied. Null when the film carries no audio at all.
  let apre: string | null = null;
  if (voiceIdx !== null && bg.length > 0) {
    let bgLabel: string;
    if (bg.length > 1) {
      parts.push(`${bg.map(i => `[${i}:a]`).join('')}amix=inputs=${bg.length}:normalize=0[bg]`);
      bgLabel = '[bg]';
    } else {
      bgLabel = `[${bg[0]}:a]`;
    }
    // True dynamic ducking: the voice keys a sidechain compressor on the
    // music/SFX bed, dropping it (~duck dB) only while the voiceover speaks,
    // then recovering — much cleaner than a constant volume cut.
    const ratio = Math.max(2, Math.round(2 + duck * 18)); // 0%→2 … 100%→20
    parts.push(`[${voiceIdx}:a]asplit=2[vkey][vmix]`);
    parts.push(`${bgLabel}[vkey]sidechaincompress=threshold=0.05:ratio=${ratio}:attack=20:release=300[bgduck]`);
    parts.push(`[bgduck][vmix]amix=inputs=2:normalize=0[apre]`);
    apre = '[apre]';
  } else if (voiceIdx !== null) {
    apre = `[${voiceIdx}:a]`;
  } else if (bg.length > 0) {
    if (bg.length > 1) {
      parts.push(`${bg.map(i => `[${i}:a]`).join('')}amix=inputs=${bg.length}:normalize=0[apre]`);
      apre = '[apre]';
    } else {
      apre = `[${bg[0]}:a]`;
    }
  }

  // PHASE 52 TASK 4 — scale the final audio bed to the master video timeline.
  // Without this, a music/SFX track shorter than the compiled film leaves a
  // silent tail and a longer track bleeds past the last frame (the "audio does
  // not track the render" defect). `apad` tops the stream up with silence, then
  // `atrim`+`asetpts` hard-cut it to the exact compiled duration so the bed and
  // the picture end on the same frame regardless of source clip lengths.
  let amap: string | null = null;
  if (apre !== null) {
    // Scale the bed to the picture timeline, then MASTER it: gentle audio fade
    // in/out so the track never clicks on at full level, and EBU R128 loudness
    // normalisation to a streaming-standard −14 LUFS (−1.5 dBTP ceiling) so every
    // film plays back at a consistent, broadcast-grade volume.
    parts.push(
      `${apre}apad,atrim=0:${totalDur.toFixed(2)},asetpts=N/SR/TB,` +
        `afade=t=in:st=0:d=0.5,afade=t=out:st=${Math.max(0, totalDur - 0.8).toFixed(2)}:d=0.8,` +
        `loudnorm=I=-14:TP=-1.5:LRA=11[aout]`,
    );
    amap = '[aout]';
  }

  return { filter: parts.join(';'), vmap, amap };
}
