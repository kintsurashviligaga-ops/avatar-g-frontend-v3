#!/usr/bin/env node
/**
 * brand/v1 web files from the SELECTED raw outputs of the art pack (design/brand/v1/manifest.json → selected).
 * No generation here and no drawing — crop, resize and grade-safe JPEG encode. (The share image it used to composite
 * here, og.jpg, is retired: the site has ONE share card, public/og-image.png, built by scripts/brand/build-assets.mjs.)
 *
 *   node scripts/brand/build-v1.mjs            writes public/brand/v1/*.jpg (+ hero-loop.mp4 when B1 is selected,
 *                                              + reel-*.mp4/jpg when R1–R3 are)
 *
 * Sizes never upscale past the source; the script prints the real dimensions so lib/brand/v1.ts can match them.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'public/brand/v1');
/** The pack's private work dir (scripts/hf-art-pack.ts PACKS): its manifest + the local raw takes — never deployed. */
const WORK = join(ROOT, 'design/brand/v1');
const manifest = JSON.parse(readFileSync(join(WORK, 'manifest.json'), 'utf8'));
/** The committed master of a selected take (design/brand/v1) — the raw takes themselves stay local, uncommitted. */
const source = (pick) => (pick.master ? join(ROOT, pick.master) : join(WORK, pick.file));

/** shot → { name, box: [w, h], focus } — focus is sharp's crop position for `cover`. */
const TARGETS = {
  A1: [{ name: 'hero-16x9', box: [2400, 1350], focus: 'attention' }],
  A2: [{ name: 'hero-9x16', box: [1080, 1920], focus: 'attention' }],
  A3: [{ name: 'dashboard-plate', box: [1920, 1080], focus: 'centre' }],
  A4: [{ name: 'card-video', box: [1200, 1500], focus: 'attention' }],
  A5: [{ name: 'card-image', box: [1200, 1500], focus: 'attention' }],
  A6: [{ name: 'card-music', box: [1200, 1500], focus: 'attention' }],
  A7: [{ name: 'card-avatar', box: [1200, 1500], focus: 'attention' }],
  A8: [{ name: 'world-16x9', box: [2400, 1350], focus: 'centre' }],
};

const jpeg = (img) => img.jpeg({ quality: 82, progressive: true, mozjpeg: true, chromaSubsampling: '4:4:4' });

async function fit(file, [w, h], position) {
  const meta = await sharp(file).metadata();
  // Largest box of the target aspect that the source can fill without upscaling.
  const scale = Math.min(1, meta.width / w, meta.height / h);
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  return { img: sharp(file).resize(width, height, { fit: 'cover', position, kernel: 'lanczos3' }), width, height };
}

async function main() {
  const sel = manifest.selected ?? {};
  const report = [];
  for (const [shot, targets] of Object.entries(TARGETS)) {
    // A reviewed revision (e.g. A4r — lettering removed) wins over the shot it was made from.
    const pick = sel[`${shot}r2`] ?? sel[`${shot}r`] ?? sel[shot];
    if (!pick) { report.push(`${shot}: not selected — skipped`); continue; }
    const src = source(pick);
    for (const t of targets) {
      const { img, width, height } = await fit(src, t.box, t.focus === 'attention' ? sharp.strategy.attention : 'centre');
      await jpeg(img).toFile(join(OUT, `${t.name}.jpg`));
      report.push(`${shot} → ${t.name}.jpg ${width}×${height}`);
    }
  }
  if (sel.B1) {
    const src = source(sel.B1);
    if (existsSync(src)) {
      // H.264, no audio, faststart; ~2–4 MB for 5 s at 720p. The poster is the hero still.
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-vf', 'scale=1280:-2', join(OUT, 'hero-loop.mp4')]);
      report.push('B1 → hero-loop.mp4 (1280w, silent, faststart)');
    }
  }
  // R1–R3 — the landing reels (brand/v1.1): 720 px wide, silent, faststart, ~1 MB each; the poster is the loop's
  // own first frame, so nothing jumps when playback starts.
  const REELS = { R1: 'street', R2: 'product', R3: 'portrait' };
  for (const [shot, name] of Object.entries(REELS)) {
    const pick = sel[shot];
    if (!pick) { report.push(`${shot}: not selected — skipped`); continue; }
    const src = source(pick);
    if (!existsSync(src)) { report.push(`${shot}: source missing — skipped`); continue; }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-vf', 'scale=720:-2', join(OUT, `reel-${name}.mp4`)]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', join(OUT, `reel-${name}.jpg`)]);
    report.push(`${shot} → reel-${name}.mp4 + reel-${name}.jpg (720w, silent)`);
  }
  console.log(report.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
