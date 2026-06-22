/**
 * Pure FFmpeg filtergraph builder for the CPU assembly fallback (Option B).
 *
 * Produces the `-filter_complex` string + the video/audio map labels that stitch
 * N clips with xfade transitions and the audio mix. Two mastering modes:
 *   • Documentary/Commercial (default) — NARRATION-FORWARD: the spoken voiceover
 *     rules the master; music + SFX are lifted-and-ducked beneath it via a fast
 *     sidechain compressor keyed off the voice.
 *   • Music Video (opts.musicVideo) — SONG-MASTER: the vocal song rules the
 *     master at unity, the standalone narrator is OMITTED entirely, and any
 *     secondary backing (SFX) is smoothly sidechain-ducked ~−12 dB under the
 *     song's vocal/critical-frequency energy. This is the explicit fix for the
 *     narrator-vs-song overlap clash.
 * No IO, no ffmpeg import → trivially unit-testable and client-safe.
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
  /** Output orientation. 'vertical' → 1080×1920 (9:16, TikTok/Reels/Shorts). */
  orientation?: 'landscape' | 'vertical';
  /** Absolute path to a .cube 3D LUT. When set, a `lut3d=file=…` pass is applied
   *  in the master grade (after the colorbalance/eq/vignette base). The caller
   *  writes the .cube to a temp file and passes its path. */
  lut3dPath?: string;
  /** When true, a brand lower-third PNG is composited over the final graded video
   *  IN THIS SAME PASS (no separate re-encode). The caller adds the PNG as the
   *  LAST `-i` input (after all video + audio inputs); the filtergraph references
   *  it at that index. Reliable by construction — no post-stitch round-trip. */
  hasBrandOverlay?: boolean;
  /** MUSIC-VIDEO / SONG-MASTER mode. When true the vocal song (the music input)
   *  rules the master stream at unity, the standalone narrator (voice input) is
   *  OMITTED from the mix entirely (no narration over a music video — the explicit
   *  voice-overlap fix), and any secondary backing track (SFX) is smoothly
   *  sidechain-ducked ~−12 dB under the song's energy. Default/false keeps the
   *  narration-forward documentary mix. The voice input index is still RESERVED
   *  when hasVoice is true, so the brand-overlay input index is unaffected. */
  musicVideo?: boolean;
  /** MTV-style music info bug. When true, a SECOND overlay PNG (added by the caller as
   *  the LAST -i input, AFTER the brand PNG) is composited over the opening of the film
   *  with a timed opacity fade in/out (appears ~0–4.4s, then disappears). */
  hasMusicBug?: boolean;
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
  // Hard-cut (concat) stitch vs. xfade chain. A 'cut' join has NO overlap, so the
  // master lands at EXACTLY N·clipSec (5·6 = 30s) with zero pad-freeze — the honest
  // way to hit the 30-second brand promise, and the beat-synced grammar a music
  // video wants. Every other transition keeps the proven 1-second xfade chain.
  const isCut = opts.transition === 'cut';
  const trans = XFADE[opts.transition ?? 'crossfade'] ?? 'fade';
  const overlap = isCut ? 0 : TRANSITION_SEC;
  const parts: string[] = [];

  // Output canvas: 1920×1080 (16:9) by default, or 1080×1920 (9:16) for the
  // vertical TikTok/Reels/Shorts pipeline. Every clip is normalised onto this
  // exact canvas so the xfade chain never errors on mismatched dimensions.
  const vertical = opts.orientation === 'vertical';
  const W = vertical ? 1080 : 1920;
  const H = vertical ? 1920 : 1080;

  // PHASE 52 TASK 4 — the exact length of the compiled master after the xfade
  // chain. N clips each `clipSec` long, overlapped by `TRANSITION_SEC` at every
  // join: totalDur = N·clipSec − (N−1)·TRANSITION_SEC. The background audio bed
  // is later padded/trimmed to THIS value so music/SFX scale to the timeline.
  const totalDur = nClips * clipSec - Math.max(0, nClips - 1) * overlap;

  // ── Video: normalize + color-match QA pass per clip, then xfade-chain ──────
  // Per-clip finishing pass: scale EVERY clip onto a clean 1920×1080 canvas
  // (letterboxed, square pixels) so independently-generated clips share identical
  // dimensions — this both guarantees a 1080p master AND prevents the xfade chain
  // from erroring on a mismatched source. Then a uniform cinematic grade
  // (contrast + saturation + slightly lifted blacks via gamma) keeps the look
  // consistent across clips, plus a touch of unsharp for crispness.
  // Fit strategy: landscape letterboxes (decrease + pad) to preserve the full 16:9
  // frame; vertical FILLS the 9:16 canvas (increase + centre-crop) so a TikTok/
  // Reels clip is full-frame, not a thin letterboxed strip with huge black bars.
  const fit = vertical
    ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
    : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=black`;
  for (let i = 0; i < nClips; i++) {
    parts.push(
      // Trim EVERY clip to exactly `clipSec` FIRST. Generative clips routinely come
      // back off-spec (e.g. 10s when 6s was asked), so without this the timeline
      // equals the SUM of raw source lengths — the master overran 30s and the audio
      // bed (atrim'd to targetDur) ended mid-film (the duration-drift + A/V-desync
      // bug). `setpts=PTS-STARTPTS` rebases the trimmed clip to 0 for a clean
      // concat/xfade so each [v{i}] is precisely clipSec long.
      `[${i}:v]trim=0:${clipSec},setpts=PTS-STARTPTS,${fit},setsar=1,settb=AVTB,fps=${vfps},` +
        `format=yuv420p,eq=contrast=1.06:saturation=1.08:gamma=0.98,unsharp=3:3:0.3[v${i}]`,
    );
  }
  let vmap: string;
  if (nClips === 1) {
    vmap = '[v0]';
  } else if (isCut) {
    // Hard cuts: concatenate the normalised clips end-to-end. Every clip already
    // shares an identical canvas (scale+pad/crop), SAR (setsar=1), timebase
    // (settb=AVTB), fps and pixel format from the per-clip fit pass, so concat
    // never errors on a mismatch — and the master lands at EXACTLY N·clipSec.
    const labels = Array.from({ length: nClips }, (_, i) => `[v${i}]`).join('');
    parts.push(`${labels}concat=n=${nClips}:v=1:a=0[vcat]`);
    vmap = '[vcat]';
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
  // BRAND PROMISE — a "30-SECOND film". The xfade chain shortens the timeline to
  // N·clipSec − (N−1)·trans, so the full 5-clip film lands at ~26s (the reported
  // "renders 26s not 30s" bug). Pad the master to exactly the target and let the
  // tail be a cinematic slow fade-to-black (a graceful outro, never a frozen
  // hold). Short test renders (<4 clips) keep their natural length untouched.
  const MASTER_TARGET_SEC = 30;
  const targetDur = nClips >= 4 && totalDur < MASTER_TARGET_SEC ? MASTER_TARGET_SEC : totalDur;
  const padSec = Math.max(0, targetDur - totalDur);
  const fadeOutStart = padSec > 0 ? Math.max(0, totalDur - 0.3) : Math.max(0, targetDur - FADE_SEC);
  const fadeOutDur = padSec > 0 ? padSec + 0.3 : FADE_SEC;
  // A real 3D LUT pass (lut3d) layered on the base grade when a .cube is supplied
  // — the "cinematic colour grade LUT" graphics step. Escape the path for the
  // filtergraph (':' and '\' are filter syntax). Applied AFTER the base
  // colorbalance/eq so the LUT shapes the final look, BEFORE vignette/fades.
  const lutPass = opts.lut3dPath
    ? `lut3d=file='${opts.lut3dPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")}',`
    : '';
  parts.push(
    `${vmap}colorbalance=rs=-0.02:bs=0.05:rm=0.03:bm=-0.02:rh=0.05:bh=-0.05,` +
      `eq=contrast=1.04:saturation=1.06:gamma=0.98,` +
      lutPass +
      `vignette=angle=PI/4.2,` +
      (padSec > 0 ? `tpad=stop_mode=clone:stop_duration=${padSec.toFixed(2)},` : '') +
      `fade=t=in:st=0:d=${FADE_SEC},` +
      `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOutDur.toFixed(2)}[vfinal]`,
  );
  vmap = '[vfinal]';

  // ── Audio: voiceover (full) + ducked background (music ∪ sfx) ─────────────
  let ai = nClips; // audio inputs come after the N video inputs
  const voiceIdx = opts.hasVoice ? ai++ : null;
  const musicIdx = opts.hasMusic ? ai++ : null;
  const sfxIdx = opts.hasSfx ? ai++ : null;
  const bg = [musicIdx, sfxIdx].filter((x): x is number => x !== null);
  const duck = Math.max(0, Math.min(1, opts.duckPct / 100));

  // Music-video song-master ducking: a deep, SMOOTH sidechain duck of the SFX bed
  // keyed off the song so the secondary backing drops ~−12 dB whenever the song's
  // vocal/critical-frequency energy emits (−12 dB ≈ amplitude 0.25). A high ratio
  // + low threshold yields the deep, broadcast-style "pumping" duck; the slow
  // release lets the SFX swell back smoothly between vocal phrases. The song
  // itself is never attenuated — it owns the master stream at unity.
  const MV_DUCK_RATIO = 20;        // strong gain reduction → ~−12 dB under the song
  const MV_DUCK_THRESHOLD = 0.03;  // song easily exceeds this → reliable triggering

  // The pre-final audio label produced by mixing/ducking, before the master
  // timeline pad+trim is applied. Null when the film carries no audio at all.
  let apre: string | null = null;
  if (opts.musicVideo && musicIdx !== null) {
    // ── MUSIC VIDEO / SONG-MASTER ────────────────────────────────────────────
    // The vocal song rules the master. The standalone narrator (voiceIdx) is
    // intentionally OMITTED — its input index stays reserved (line above) so the
    // brand-overlay index is unaffected, but it never reaches the mix. This is the
    // explicit narrator-vs-song overlap fix.
    const song = `[${musicIdx}:a]`;
    if (sfxIdx !== null) {
      // Split the song: one copy keys the sidechain (energy detector), the other
      // is the audible master. SFX is ducked ~−12 dB under the song's energy.
      parts.push(`${song}asplit=2[songkey][songmaster]`);
      parts.push(
        `[${sfxIdx}:a][songkey]sidechaincompress=threshold=${MV_DUCK_THRESHOLD}:ratio=${MV_DUCK_RATIO}:attack=5:release=300[sfxduck]`,
      );
      parts.push(`[songmaster][sfxduck]amix=inputs=2:normalize=0[apre]`);
      apre = '[apre]';
    } else {
      // Just the song — it owns the entire master stream at unity.
      apre = song;
    }
  } else if (voiceIdx !== null && bg.length > 0) {
    let bgLabel: string;
    if (bg.length > 1) {
      parts.push(`${bg.map(i => `[${i}:a]`).join('')}amix=inputs=${bg.length}:normalize=0[bg]`);
      bgLabel = '[bg]';
    } else {
      bgLabel = `[${bg[0]}:a]`;
    }
    // NARRATION-FORWARD MIX (v329): keep the spoken voice clearly ON TOP of the
    // score — the prior mix let the music bury the narration ("video voice not
    // good" while the solo voice is fine). Three levers: (1) the music/SFX bed sits
    // lower (volume 0.6); (2) it's HARD-ducked under the voice via a fast sidechain
    // compressor (lower threshold, higher ratio, quick attack); (3) the voice is
    // lifted a touch. loudnorm later sets the overall level + ceiling.
    const ratio = Math.max(8, Math.round(8 + duck * 12)); // strong: 0%→8 … 100%→20
    parts.push(`[${voiceIdx}:a]asplit=2[vkey][vraw]`);
    parts.push(`[vraw]volume=1.25[vmix]`);
    parts.push(`${bgLabel}volume=0.6[bglow]`);
    parts.push(`[bglow][vkey]sidechaincompress=threshold=0.03:ratio=${ratio}:attack=5:release=250[bgduck]`);
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
      `${apre}apad,atrim=0:${targetDur.toFixed(2)},asetpts=N/SR/TB,` +
        `afade=t=in:st=0:d=0.5,afade=t=out:st=${Math.max(0, targetDur - 0.8).toFixed(2)}:d=0.8,` +
        `loudnorm=I=-14:TP=-1.5:LRA=11[aout]`,
    );
    amap = '[aout]';
  }

  // Brand lower-third — composited over the final graded video in THIS pass. The
  // PNG is the LAST input (index `ai`, after every video + audio input the caller
  // added). overlay=0:0 since the PNG is rendered at the exact canvas size.
  // Overlays are the LAST -i inputs (after every video + audio input), added by the
  // caller in this exact order: brand lower-third PNG, then the music info-bug PNG.
  let overlayIdx = ai;
  if (opts.hasBrandOverlay) {
    // The brand lower-third and the MTV info bug both live bottom-left. When BOTH are
    // present, hold the brand back until the bug has faded out (~4.4s) so they never
    // collide/overprint; otherwise show the brand for the whole film.
    const brandEnable = opts.hasMusicBug ? `:enable='gte(t,4.4)'` : '';
    parts.push(`${vmap}[${overlayIdx}:v]overlay=0:0:format=auto${brandEnable}[vbrand]`);
    vmap = '[vbrand]';
    overlayIdx++;
  }
  if (opts.hasMusicBug) {
    // Fade the bug PNG's alpha up then down, and composite it ONLY over the opening
    // window so it appears for the first ~4s and gracefully fades out (MTV "now playing").
    parts.push(`[${overlayIdx}:v]format=rgba,fade=t=in:st=0.3:d=0.5:alpha=1,fade=t=out:st=3.6:d=0.6:alpha=1[mbug]`);
    parts.push(`${vmap}[mbug]overlay=0:0:enable='between(t,0,4.4)'[vmbug]`);
    vmap = '[vmbug]';
    overlayIdx++;
  }

  return { filter: parts.join(';'), vmap, amap };
}
