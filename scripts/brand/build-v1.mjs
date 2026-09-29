#!/usr/bin/env node
/**
 * brand/v1 web files from the SELECTED raw outputs of the art pack (public/brand/v1/manifest.json → selected).
 * No generation here and no drawing — crop, resize, grade-safe JPEG encode, and one composite: the share image,
 * where the brand lockup from GG's sheet is laid over the world still in code (docs/DESIGN.md: no text is ever
 * baked into a generated image).
 *
 *   node scripts/brand/build-v1.mjs            writes public/brand/v1/*.jpg (+ hero-loop.mp4 when B1 is selected)
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
const manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
const SHEET = join(ROOT, 'docs/brand/brand-sheet-2026-09-29.webp');
/** The committed master of a selected take (design/brand/v1) — the raw takes themselves stay local, uncommitted. */
const source = (pick) => (pick.master ? join(ROOT, pick.master) : join(OUT, pick.file));

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

/**
 * The share image: the world still, darkened toward the left, with the sheet's own lockup (rocket + "MyAvatar.ge"
 * + "AI CREATIVE STUDIO") SCREEN-blended on — its navy ground crushed to black first, so only light remains.
 */
async function og(worldFile) {
  const W = 1200, H = 630;
  const base = await sharp(worldFile).resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer();
  const veil = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#0A0A0A" stop-opacity="0.92"/><stop offset="0.55" stop-color="#0A0A0A" stop-opacity="0.55"/><stop offset="1" stop-color="#0A0A0A" stop-opacity="0.15"/></linearGradient><linearGradient id="b" x1="0" x2="0" y1="0" y2="1"><stop offset="0.6" stop-color="#0A0A0A" stop-opacity="0"/><stop offset="1" stop-color="#0A0A0A" stop-opacity="0.7"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#b)"/></svg>`,
  );
  // The WHOLE top band of the sheet (rocket, its flame streak, wordmark, tagline): cropping into it cut the flame's
  // glow and left a hard edge. Its navy ground is crushed to black, then its edges are feathered to black too, so
  // the SCREEN blend adds only light — no rectangle can show.
  const lockupW = 920;
  const lockupH = Math.round((452 * lockupW) / 1254);
  const crushed = await sharp(SHEET).extract({ left: 0, top: 0, width: 1254, height: 452 }).resize(lockupW, lockupH).linear(1.35, -52).removeAlpha().raw().toBuffer();
  const feathered = Buffer.from(crushed);
  const F = 90; // px of fade at every edge
  for (let y = 0; y < lockupH; y++) {
    for (let x = 0; x < lockupW; x++) {
      const d = Math.min(x, y, lockupW - 1 - x, lockupH - 1 - y);
      const t = Math.max(0, Math.min(1, d / F));
      const k = t * t * (3 - 2 * t);
      const i = (y * lockupW + x) * 3;
      feathered[i] = Math.round(crushed[i] * k); feathered[i + 1] = Math.round(crushed[i + 1] * k); feathered[i + 2] = Math.round(crushed[i + 2] * k);
    }
  }
  const lockup = await sharp(feathered, { raw: { width: lockupW, height: lockupH, channels: 3 } }).png().toBuffer();
  const img = sharp(base).composite([
    { input: veil },
    { input: lockup, left: 8, top: Math.round((H - lockupH) / 2), blend: 'screen' },
  ]);
  return jpeg(img).toFile(join(OUT, 'og.jpg'));
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
  if (sel.A8) {
    await og(source(sel.A8));
    report.push('A8 → og.jpg 1200×630 (lockup composited in code)');
  }
  if (sel.B1) {
    const src = source(sel.B1);
    if (existsSync(src)) {
      // H.264, no audio, faststart; ~2–4 MB for 5 s at 720p. The poster is the hero still.
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-vf', 'scale=1280:-2', join(OUT, 'hero-loop.mp4')]);
      report.push('B1 → hero-loop.mp4 (1280w, silent, faststart)');
    }
  }
  console.log(report.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
