#!/usr/bin/env node
/**
 * build_manifest.mjs — MyAvatar.ge 60s Showcase Commercial: pipeline scaffolder.
 *
 * Single source of truth parsed from commercial_blueprint.md §3 Master Cut-List. It:
 *   1. Computes every shot's frame math from its TC (deterministic — no hand-typed frames).
 *   2. VALIDATES contiguity (each out == next in), zero gaps/overlaps, and Σ dur == 1440.
 *   3. Creates the directory scaffold (idempotent, recursive).
 *   4. Emits commercial/asset_manifest.json (machine-readable driver for render_pipeline.sh).
 *   5. Emits commercial/AUTOMATION_MATRIX.md (human-readable status matrix).
 *
 * NOTE: this scaffolds + validates the pipeline; it does NOT render (AI-gen / capture / MoGraph
 * assets are produced by their engines, then dropped into 01_source/**). Run with `node`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FPS = 24;
const TOTAL_FRAMES = 1440; // 60.000s @ 24fps
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // .../commercial

// TC "MM:SS:FF" → absolute frame index at 24fps.
const tc2f = (tc) => {
  const [mm, ss, ff] = tc.split(':').map(Number);
  if ([mm, ss, ff].some((n) => !Number.isInteger(n)) || ff >= FPS) throw new Error(`bad TC ${tc}`);
  return mm * 60 * FPS + ss * FPS + ff;
};

// Engine → source subdir. HYBRID lands in hybrid/ (UI capture + AI-art comp).
const ENGINE_DIR = {
  'AI-GEN/MOGRAPH': '01_source/ai_gen',
  CAPTURE: '01_source/capture',
  'CAPTURE/MOGRAPH': '01_source/capture',
  MOGRAPH: '01_source/mograph',
  HYBRID: '01_source/hybrid',
  'AI-GEN + screen comp': '01_source/hybrid',
  'AI-GEN/3D': '01_source/ai_gen',
};

// The cut-list (blueprint §3). in/out TC + declared duration + beat + source + slug + prompts.
const CUT = [
  ['S01', '00:00:00', '00:01:12', 36, 'HOOK', 'AI-GEN/MOGRAPH', 'coldopen_void_particle', true],
  ['S02', '00:01:12', '00:06:00', 108, 'HOOK', 'CAPTURE', 'macro_prompt_type', false],
  ['S03', '00:06:00', '00:08:12', 60, 'HOOK', 'CAPTURE/MOGRAPH', 'prompt_complete_glow', false],
  ['S04', '00:08:12', '00:10:00', 36, 'HOOK', 'MOGRAPH', 'ignite_streak', false],
  ['S05', '00:10:00', '00:13:00', 72, 'SERVICE', 'CAPTURE/MOGRAPH', 'dashboard_6tiles', false],
  ['S06', '00:13:00', '00:17:00', 96, 'SERVICE', 'HYBRID', 'image_grid_fill', true],
  ['S07', '00:17:00', '00:21:12', 108, 'SERVICE', 'CAPTURE/MOGRAPH', 'music_composer_waveform', false],
  ['S08', '00:21:12', '00:26:00', 108, 'SERVICE', 'HYBRID', 'character_swap_wipe', true],
  ['S09', '00:26:00', '00:30:00', 96, 'SERVICE', 'MOGRAPH', 'montage_collapse', false],
  ['S10', '00:30:00', '00:34:00', 96, 'PIPELINE', 'AI-GEN/3D', 'pipeline_3d_tracks', true],
  ['S11', '00:34:00', '00:38:12', 108, 'PIPELINE', 'MOGRAPH', 'cap3_node_4lanes', false],
  ['S12', '00:38:12', '00:43:00', 108, 'PIPELINE', 'MOGRAPH', 'assembly_stack', false],
  ['S13', '00:43:00', '00:47:00', 96, 'PIPELINE', 'MOGRAPH', 'crystallize_master', false],
  ['S14', '00:47:00', '00:50:00', 72, 'PIPELINE', 'MOGRAPH', 'masterclip_flyforward', false],
  ['S15', '00:50:00', '00:55:00', 120, 'CTA', 'AI-GEN + screen comp', 'desk_reveal_display', true],
  ['S16', '00:55:00', '01:00:00', 120, 'CTA', 'MOGRAPH', 'logo_lockup_sting', false],
];

// AI-gen / hybrid prompts (blueprint §4). Only the generative shots carry a prompt/negative.
const PROMPTS = {
  S01: {
    prompt: 'Extreme minimalist dark void, near-black #0A0A0F, a single tiny luminous cyan particle drifting slowly through deep negative space, subtle volumetric haze, soft depth-of-field, cinematic, premium tech commercial, ultra-clean, 8k, HDR, gentle film grain, no text.',
    negative: 'text, logos, UI, clutter, bright colors, banding, harsh light, busy background.',
  },
  S06: {
    prompt: 'grid of photorealistic AI-generated images, diverse premium subjects (portrait, landscape, product, abstract), crisp 8k detail, consistent cinematic color, gallery-quality, cohesive palette with cyan undertone.',
    negative: 'watermark, text, garbled detail, low-res, duplicate, distorted faces.',
    note: 'AI art fills the tiles ONLY; the UI frame is real screen capture (hybrid comp).',
  },
  S08: {
    prompt: 'studio-lit portrait of a synthetic, non-identifiable human face, photorealistic, neutral expression, even soft key light, high detail skin texture, premium headshot, cohesive with cyan-accented dark set.',
    negative: 'real celebrity, recognizable person, distortion, artifacts, extra fingers, watermark, text.',
    note: 'Synthetic / model-released faces only. UI panel is real capture (hybrid comp).',
  },
  S10: {
    prompt: 'abstract 3D data-pipeline interface floating in dark space, sleek glowing cyan tracks receding into depth, clean minimalist data blocks gliding along rails, soft volumetric light, reflective floor, premium tech trailer, studio lighting, 8k, photorealistic render, shallow depth of field.',
    negative: 'text, readable labels (added in post), clutter, cartoonish, low-poly, noise, banding.',
  },
  S15: {
    prompt: 'elegant slow dolly-back reveal of a premium minimalist creative studio desk, a large unbranded studio-grade monitor (no logos) glowing softly, warm ambient room light, cyan screen rim-light, shallow depth of field, cinematic, photorealistic, 8k, high-end commercial finish, clean composition, no visible brand marks.',
    negative: 'brand logos, apple logo, visible manufacturer badge, clutter, messy desk, people, text, harsh light, lens dirt overload.',
    note: 'Corner-pin the REAL finished playback onto the monitor screen in post — do not rely on AI for legible playback.',
  },
};

// The two intentional HARD cuts (no xfade): IGNITE @ 0:08:12 and LOGO @ 0:55:00 (blueprint §9).
const HARD_CUT_INTO = new Set(['S04', 'S16']);

// Shots whose LIVE UI was end-to-end verified against production (see CAPTURE_LOG.md). This is
// UI verification, NOT a finished frame-exact recording — the .mov slot is still pending capture.
const LIVE_VERIFIED = { S02: '2026-07-05', S03: '2026-07-05', S05: '2026-07-05', S06: '2026-07-05', S07: '2026-07-05', S08: '2026-07-05' };

// ── Build + validate ────────────────────────────────────────────────────────
const shots = [];
let cursor = 0;
const errors = [];
for (const [id, inTc, outTc, declaredDur, beat, source, slug, gen] of CUT) {
  const inF = tc2f(inTc);
  const outF = tc2f(outTc);
  const dur = outF - inF;
  if (inF !== cursor) errors.push(`${id}: in-frame ${inF} != expected ${cursor} (gap/overlap)`);
  if (dur !== declaredDur) errors.push(`${id}: computed dur ${dur} != declared ${declaredDur}`);
  if (dur <= 0) errors.push(`${id}: non-positive duration ${dur}`);
  const dir = ENGINE_DIR[source];
  if (!dir) errors.push(`${id}: no engine dir for source "${source}"`);
  shots.push({
    id,
    beat,
    source,
    engine_dir: dir,
    in_tc: inTc,
    out_tc: outTc,
    in_frame: inF,
    out_frame: outF,
    dur_frames: dur,
    dur_sec: +(dur / FPS).toFixed(3),
    hard_cut_in: HARD_CUT_INTO.has(id),
    output: `${dir}/${id}_${slug}.mov`,
    ...(LIVE_VERIFIED[id] ? { live_ui_verified: LIVE_VERIFIED[id] } : {}),
    ...(gen ? { generative: true, ...PROMPTS[id] } : { generative: false }),
  });
  cursor = outF;
}
if (cursor !== TOTAL_FRAMES) errors.push(`Σ frames ${cursor} != ${TOTAL_FRAMES}`);

const beatTotals = shots.reduce((a, s) => ((a[s.beat] = (a[s.beat] || 0) + s.dur_frames), a), {});
const expectedBeats = { HOOK: 240, SERVICE: 480, PIPELINE: 480, CTA: 240 };
for (const [b, f] of Object.entries(expectedBeats)) {
  if (beatTotals[b] !== f) errors.push(`beat ${b} frames ${beatTotals[b]} != ${f}`);
}

if (errors.length) {
  console.error('✗ VALIDATION FAILED:\n' + errors.map((e) => '   - ' + e).join('\n'));
  process.exit(1);
}

// ── Directory scaffold (idempotent) ─────────────────────────────────────────
const DIRS = [
  '01_source/capture', '01_source/ai_gen', '01_source/mograph', '01_source/hybrid',
  '02_audio/vo', '02_audio/score', '02_audio/sfx', '02_audio/mix',
  '03_captions', '04_work', '05_masters',
  '06_exports/16x9_4k', '06_exports/9x16', '06_exports/1x1',
  'pipeline',
];
for (const d of DIRS) mkdirSync(resolve(ROOT, d), { recursive: true });

// ── asset_manifest.json ─────────────────────────────────────────────────────
const manifest = {
  project: 'MyAvatar.ge — 60s Premium Showcase Commercial',
  version: 1,
  concept: 'One Chat. Infinite Creation.',
  master: { fps: FPS, total_frames: TOTAL_FRAMES, runtime_sec: 60, resolution: '3840x2160', aspect: '16:9', colorspace: 'Rec.709' },
  audio: { target_lufs: -14, true_peak_dbtp: -1, lra: 11, vo_engine: 'ElevenLabs (cloned Georgian voice)', score_engine: 'MusicGen / pipeline stems' },
  brand: { base: '#0A0A0F', accent_cyan: '#00D4FF', depth_violet: '#7A5CFF' },
  beats: expectedBeats,
  hard_cuts: ['S04 (IGNITE @ 00:08:12)', 'S16 (LOGO @ 00:55:00)'],
  audio_tracks: {
    vo: ['02_audio/vo/VO1_hook.wav', '02_audio/vo/VO2_service.wav', '02_audio/vo/VO3_pipeline.wav', '02_audio/vo/VO4_cta.wav'],
    score_stems: ['pad', 'sub', 'pulse_arp', 'percussion', 'riser_impact', 'sonic_logo'].map((s) => `02_audio/score/${s}.wav`),
    mix_master: '02_audio/mix/mix_master.wav',
  },
  exports: {
    animatic_1080p: '06_exports/animatic/MyAvatar_60s_animatic_1080p.mp4', // code-generated 60s proof-of-concept
    master_prores: '05_masters/final_master.mov',
    '16x9_4k': '06_exports/16x9_4k/MyAvatar_60s_4K_16x9.mp4',
    '9x16': '06_exports/9x16/MyAvatar_9x16.mp4',
    '1x1': '06_exports/1x1/MyAvatar_1x1.mp4',
  },
  shots,
};
writeFileSync(resolve(ROOT, 'asset_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ── AUTOMATION_MATRIX.md ────────────────────────────────────────────────────
const statusOf = (s) =>
  (s.live_ui_verified ? '🟢 UI live-verified · ' : '🟡 ') + 'animatic frame ✓ · final asset pending';
const row = (s) =>
  `| ${s.id} | ${s.beat} | ${s.in_tc}–${s.out_tc} | ${s.dur_frames}f / ${s.dur_sec}s | ${s.source} | ${s.generative ? 'AI prompt ✓' : '—'} | \`${s.output}\` | ${statusOf(s)} |`;
const md = `# Commercial Render — Automation Matrix (generated)

> Generated by \`pipeline/build_manifest.mjs\` from \`commercial_blueprint.md\` §3.
> Master: ${FPS}fps · ${TOTAL_FRAMES} frames · 60.000s · 3840×2160 · Rec.709.
> Frame math VALIDATED: contiguous, no gaps/overlaps, Σ = ${TOTAL_FRAMES} ✓ · beats HOOK/SERVICE/PIPELINE/CTA = 240/480/480/240 ✓.
> 🟢 = live UI end-to-end VERIFIED against production (${Object.keys(LIVE_VERIFIED).length} beats, see \`CAPTURE_LOG.md\`). 🟡/🟢 "animatic frame ✓" = a deterministic on-brand frame was code-generated by \`gen_frames.mjs\` and compiled into the exact-60s **animatic** (\`06_exports/animatic/MyAvatar_60s_animatic_1080p.mp4\`). "final asset pending" = the polished hero clip (60fps UI capture / AE motion / AI-environmental / full audio) is still to come.

## Shot matrix (S01–S16)

| Shot | Beat | TC | Duration | Source engine | Prompt | Output path | Status |
|------|------|----|----------|---------------|--------|-------------|--------|
${shots.map(row).join('\n')}

## Pipeline stages (\`render_pipeline.sh\`)

| # | Stage | Inputs | Output | Blueprint ref |
|---|-------|--------|--------|---------------|
| 1 | ingest  | 01_source/** (16 shots dropped by their engines) | validated presence | §1 sources |
| 2 | stitch  | S01…S16 (xfade + 2 hard cuts) | 04_work/picture_silent.mov | §10.1 |
| 3 | mix     | vo/ + score/ + sfx/ (duck + loudnorm −14 LUFS) | 02_audio/mix/mix_master.wav | §10.2 |
| 4 | caption | picture + 03_captions/*_alpha.mov | 04_work/picture_capped.mov | §10.3 |
| 5 | master  | picture_capped + mix_master | 05_masters/final_master.mov | §10.4 |
| 6 | encode  | final_master | 06_exports/16x9_4k/*.mp4 (+ ProRes archive) | §10.4 |
| 7 | reframe | 16x9 4K master | 9x16 + 1x1 exports | §10.5 |

## Verify
\`\`\`bash
node commercial/pipeline/build_manifest.mjs      # regenerate + validate frame math
bash commercial/pipeline/render_pipeline.sh --check   # dry-run: check scaffold + asset presence (no render)
\`\`\`
`;
writeFileSync(resolve(ROOT, 'AUTOMATION_MATRIX.md'), md);

console.log(`✓ VALIDATED — ${shots.length} shots · Σ ${cursor} frames · beats ${JSON.stringify(beatTotals)}`);
console.log(`✓ scaffold: ${DIRS.length} dirs · manifest: asset_manifest.json · matrix: AUTOMATION_MATRIX.md`);
