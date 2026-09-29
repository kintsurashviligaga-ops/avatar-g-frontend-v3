#!/usr/bin/env node
/**
 * Rebuild every brand raster from the SUPPLIED artwork — nothing here draws the logo (brief §9: "don't redraw
 * the logo; ask GG for the master file"). It only crops, scales, feathers and composes.
 *
 * Sources (both supplied by GG):
 *   public/myavatar-logo.png                  1254² app tile: the rocket + the name, on its own dark tile
 *   docs/brand/brand-sheet-2026-09-29.webp    the 2026-09-29 brand sheet (colours, wordmark, icon style)
 *
 * The brand sheet draws the favicon and app icons WITHOUT the name — the rocket alone on a dark tile — so the
 * rocket is cropped out of the tile's flat interior (clear of its rounded corners above and the name below;
 * measured, see ROCKET_CROP) and feathered onto a background sampled from that same crop, so no seam shows.
 *
 * Outputs:
 *   app/icon.png, app/[locale]/icon.png      browser-tab icon — rounded tile, transparent corners (512)
 *   public/icons/icon-<n>x<n>.png            rounded tile, transparent corners (16 … 512)
 *   public/icons/icon-1024x1024.png          FULL square, opaque — App Store refuses alpha
 *   public/icons/icon-180x180.png            FULL square, opaque — iOS rounds it itself
 *   public/apple-touch-icon.png              = icon-180
 *   public/icons/icon-maskable-512.png       full square, rocket inside Android's safe zone (centre 80%)
 *   public/icons/favicon.ico                 16/32/48, PNG-in-ICO
 *   public/og-image.png                      1200×630 — the sheet's hero band (rocket + wordmark + tagline)
 *
 * Usage: node scripts/brand/build-assets.mjs            (writes the files; review the diff, then commit)
 * When GG sends the master (SVG / transparent PNG), replace the sources and re-run.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TILE = join(ROOT, 'public/myavatar-logo.png');
const SHEET = join(ROOT, 'docs/brand/brand-sheet-2026-09-29.webp');

/** The rocket inside the 1254² tile: 760² from (285, 220) — inside the rounded corners, above the name (y ≥ 985). */
const ROCKET_CROP = { left: 285, top: 220, width: 760, height: 760 };
/** The sheet's top band: rocket + "MyAvatar.ge" + "AI CREATIVE STUDIO". */
const SHEET_HERO = { left: 0, top: 0, width: 1254, height: 452 };

const out = (rel) => {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  return p;
};

async function rawRgba(img) {
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Mean colour of a crop's top and bottom borders (corners excluded) — the background the rocket sits on. */
async function borderColours(crop) {
  const { data, width, height } = await rawRgba(sharp(crop));
  const mean = (y0, y1) => {
    const acc = [0, 0, 0];
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = Math.round(width * 0.2); x < Math.round(width * 0.8); x++) {
        const i = (y * width + x) * 4;
        acc[0] += data[i]; acc[1] += data[i + 1]; acc[2] += data[i + 2]; n++;
      }
    }
    return acc.map((v) => Math.round(v / n));
  };
  return { top: mean(0, 12), bottom: mean(height - 12, height) };
}

function gradient(size, top, bottom) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const t = size === 1 ? 0 : y / (size - 1);
    const c = top.map((v, k) => Math.round(v + (bottom[k] - v) * t));
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
    }
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 4 } });
}

const smooth = (t) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/**
 * The crop's alpha: a ramp from 0 at the edge to 1 at `feather` px in (hides the crop's own edge), and a deep
 * fade into the two EMPTY corners — top-left carries the tile's glass sheen, bottom-right its edge glow. The
 * rocket runs along the other diagonal (flame bottom-left → tip top-right), so fading where x+y is small or
 * large never touches it: measured, the nearest rocket pixels sit at x+y ≈ 0.59·S and ≈ 1.31·S.
 */
function featherMask(size, feather) {
  const buf = Buffer.alloc(size * size * 4, 255);
  const S = size - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = smooth(Math.min(x, y, S - x, S - y) / feather);
      const diag = (x + y) / S; // 0 at top-left … 2 at bottom-right
      const corners = smooth((diag - 0.12) / 0.36) * smooth((1.88 - diag) / 0.36);
      buf[(y * size + x) * 4 + 3] = Math.round(255 * edge * corners);
    }
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

const roundedMask = (size, radius) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);

const edgeStroke = (size, radius) => {
  const w = Math.max(1, size / 256);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect x="${w / 2}" y="${w / 2}" width="${size - w}" height="${size - w}" rx="${radius}" ry="${radius}" fill="none" stroke="#9FEFFF" stroke-opacity="0.16" stroke-width="${w}"/></svg>`,
  );
};

/**
 * One icon: the rocket crop at `scale` of the canvas, feathered onto the sampled background.
 * rounded → transparent corners (tab / install icons); otherwise a full opaque square (iOS, App Store, maskable).
 */
async function icon(size, { scale, rounded }, crop, colours) {
  const inner = Math.round(size * scale);
  const feather = Math.max(1, Math.round(inner * 0.12));
  const rocket = await sharp(crop)
    .resize(inner, inner, { kernel: 'lanczos3' })
    .ensureAlpha()
    .composite([{ input: await featherMask(inner, feather), blend: 'dest-in' }])
    .png()
    .toBuffer();
  const offset = Math.round((size - inner) / 2);
  let img = gradient(size, colours.top, colours.bottom).composite([{ input: rocket, left: offset, top: offset }]);
  if (rounded) {
    const radius = Math.round(size * 0.225);
    const flat = await img.png().toBuffer();
    img = sharp(flat).composite([
      { input: roundedMask(size, radius), blend: 'dest-in' },
      ...(size >= 32 ? [{ input: edgeStroke(size, radius), blend: 'over' }] : []),
    ]);
    return img.png({ compressionLevel: 9 }).toBuffer();
  }
  return img.flatten({ background: { r: colours.bottom[0], g: colours.bottom[1], b: colours.bottom[2] } }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

/** PNG-in-ICO (Windows Vista+ and every current browser). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function ogImage() {
  const band = await sharp(SHEET).extract(SHEET_HERO).png().toBuffer();
  const W = 1200, H = 630;
  const fgH = Math.round((SHEET_HERO.height * W) / SHEET_HERO.width);
  // The band, stretched and blurred, continues its own navy gradient into the padding; the sharp band sits
  // centred on top with feathered top/bottom edges. Nothing is redrawn.
  const bg = await sharp(band).resize(W, H, { fit: 'fill' }).blur(40).png().toBuffer();
  const fgRaw = await rawRgba(sharp(band).resize(W, fgH, { kernel: 'lanczos3' }));
  const feather = 40;
  for (let y = 0; y < fgRaw.height; y++) {
    const a = Math.min(1, y / feather, (fgRaw.height - 1 - y) / feather);
    for (let x = 0; x < fgRaw.width; x++) fgRaw.data[(y * fgRaw.width + x) * 4 + 3] = Math.round(255 * Math.max(0, a));
  }
  const fg = await sharp(fgRaw.data, { raw: { width: fgRaw.width, height: fgRaw.height, channels: 4 } }).png().toBuffer();
  return sharp(bg).composite([{ input: fg, left: 0, top: Math.round((H - fgH) / 2) }]).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const crop = await sharp(TILE).extract(ROCKET_CROP).png().toBuffer();
  const colours = await borderColours(crop);
  const written = [];
  const write = (rel, buf) => { writeFileSync(out(rel), buf); written.push(rel); };

  const tile = { scale: 0.86, rounded: true };
  const small = { scale: 0.96, rounded: true }; // ≤ 48 px: every pixel on the rocket
  const full = { scale: 0.9, rounded: false };

  for (const n of [16, 32, 48, 64, 96, 128, 192, 256, 512]) {
    write(`public/icons/icon-${n}x${n}.png`, await icon(n, n <= 48 ? small : tile, crop, colours));
  }
  const i180 = await icon(180, full, crop, colours);
  write('public/icons/icon-180x180.png', i180);
  write('public/apple-touch-icon.png', i180);
  write('public/icons/icon-1024x1024.png', await icon(1024, full, crop, colours));
  write('public/icons/icon-maskable-512.png', await icon(512, { scale: 0.66, rounded: false }, crop, colours));

  const tab = await icon(512, tile, crop, colours);
  write('app/icon.png', tab);
  write('app/[locale]/icon.png', tab);

  const icoPngs = [];
  for (const n of [16, 32, 48]) icoPngs.push({ size: n, data: await icon(n, small, crop, colours) });
  write('public/icons/favicon.ico', ico(icoPngs));

  write('public/og-image.png', await ogImage());
  console.log(`background sampled: top rgb(${colours.top}) → bottom rgb(${colours.bottom})`);
  console.log(written.map((w) => `  wrote ${w}`).join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
