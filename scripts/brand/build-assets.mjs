#!/usr/bin/env node
/**
 * The site's icon set and its share card, rebuilt from SUPPLIED artwork only. Nothing here draws the logo (brief §9:
 * "don't redraw the logo"): it scales, places and composes rasters GG supplied, over a background drawn from the brand
 * tokens. Deterministic — same inputs, same files — so re-run it whenever a source changes, then review and commit.
 *
 *   node scripts/brand/build-assets.mjs
 *
 * Sources
 *   design/brand/rocket/rocket-master.png   the TRANSPARENT rocket (RGBA 745², alpha verified: corners 0, ~56 % clear),
 *                                           cut out of the supplied raster by design/brand/rocket/extract.py
 *   docs/brand/brand-sheet-2026-09-29.webp  the sheet's own lettering — "MyAvatar.ge" + "AI CREATIVE STUDIO" — for the
 *                                           share card. ⚠️ NOT re-typeset: the repo carries no Montserrat file (next/font
 *                                           downloads it at build time), and a fallback face would be off-brand and
 *                                           machine-dependent. The sheet's lettering IS Montserrat, set by GG.
 *
 * Outputs — the ONE icon set (docs/brand/BRAND.md). Next.js links the app/ files itself; nothing else may declare icons.
 *   app/favicon.ico                    16 / 32 / 48, PNG-in-ICO — the rocket on the dark rounded tile
 *   app/icon.png                       512, rounded tile, transparent corners (browser tab, bookmarks)
 *   app/apple-icon.png                 180, OPAQUE square — iOS shows touch icons on an opaque tile and masks it itself
 *   public/icons/icon-192x192.png      manifest "any" — rounded tile
 *   public/icons/icon-512x512.png      manifest "any" — rounded tile (also the JSON-LD Organization logo)
 *   public/icons/icon-maskable-512.png manifest "maskable" — opaque, the rocket measured inside Android's safe circle
 *   public/icons/icon-1024x1024.png    App Store icon — opaque, no alpha (docs/app-store-submission.md)
 *   public/og-image.png                1200×630 share card (lib/seo/metadata.ts OG_IMAGE)
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROCKET = join(ROOT, 'design/brand/rocket/rocket-master.png');
const SHEET = join(ROOT, 'docs/brand/brand-sheet-2026-09-29.webp');

/** The sheet's hero lettering, measured on the 1254² sheet: glyphs span x 522–1163, y 208–351 (wordmark + tagline). */
const LETTERING = { left: 516, top: 200, width: 656, height: 160 };

/** Android draws a maskable icon inside a circle of 80 % of its width — the "safe zone". */
const MASKABLE_SAFE_RADIUS = 0.4;
const OG_W = 1200;
const OG_H = 630;
/** Share-card budget: WhatsApp and some unfurlers drop og:images over ~300 KB. */
const OG_MAX_BYTES = 300 * 1024;

const out = (rel) => {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  return p;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

// ── the rocket ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The master, cropped to what is visible (alpha > 2 %), plus `reach`: the farthest clearly visible pixel (alpha ≥ 25 %)
 * from the crop's centre — what has to fit inside a maskable icon's safe circle. The rocket runs corner to corner
 * (flame bottom-left, nose top-right), so its bounding box alone would over-estimate nothing and under-estimate the
 * diagonal; measuring the pixels is exact.
 */
async function loadRocket() {
  const meta = await sharp(ROCKET).metadata();
  if (!meta.hasAlpha || meta.channels !== 4) throw new Error(`${ROCKET} has no alpha channel — it must be the transparent cut-out`);
  const { data, info } = await sharp(ROCKET).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 5) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const box = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  const cx = x0 + box.width / 2;
  const cy = y0 + box.height / 2;
  let reach = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (data[(y * W + x) * 4 + 3] >= 64) reach = Math.max(reach, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
    }
  }
  const png = await sharp(ROCKET).extract(box).png().toBuffer();
  return { png, width: box.width, height: box.height, reach };
}

/** The rocket scaled so its longer side is `side` px (lanczos3; never upscaled past the master). */
async function rocketAt(rocket, side) {
  const k = side / Math.max(rocket.width, rocket.height);
  const width = Math.max(1, Math.round(rocket.width * k));
  const height = Math.max(1, Math.round(rocket.height * k));
  const png = await sharp(rocket.png).resize(width, height, { kernel: 'lanczos3' }).png().toBuffer();
  return { png, width, height, k };
}

// ── icons ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The tile the brand sheet puts the rocket on: near-black with a deep-navy lift behind the mark (the sheet's app icon is
 * dark glass, its blue depth coming from the rocket's own body colour #1873CA). Rounded → transparent corners at the
 * sheet's ~22.5 % radius, with a faint inner hairline from 64 px up; square → full bleed (iOS, Android and the App Store
 * apply their own masks and refuse — or blacken — transparency).
 */
function tileSvg(size, rounded) {
  const r = rounded ? Math.round(size * 0.225) : 0;
  const w = Math.max(1, size / 256);
  const hairline = rounded && size >= 64
    ? `<rect x="${w / 2}" y="${w / 2}" width="${size - w}" height="${size - w}" rx="${r - w / 2}" ry="${r - w / 2}" fill="none" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="${w}"/>`
    : '';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      '<defs><radialGradient id="lift" cx="50%" cy="44%" r="68%">' +
      '<stop offset="0" stop-color="#0E2747"/><stop offset="0.55" stop-color="#061223"/><stop offset="1" stop-color="#020409"/>' +
      '</radialGradient></defs>' +
      `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#lift)"/>${hairline}</svg>`,
  );
}

const roundedMask = (size) => {
  const r = Math.round(size * 0.225);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
};

/**
 * One icon at `size`: the tile, the rocket centred with its longer side at `scale` of the tile. Small sizes are drawn at
 * 4× and reduced once, so the rocket's edges and the tile's corners anti-alias together instead of each on its own grid.
 */
async function icon(rocket, size, { scale, rounded }) {
  const drawn = size < 128 ? size * 4 : size;
  const mark = await rocketAt(rocket, Math.round(drawn * scale));
  let img = sharp(tileSvg(drawn, rounded)).composite([
    { input: mark.png, left: Math.round((drawn - mark.width) / 2), top: Math.round((drawn - mark.height) / 2) },
  ]);
  if (rounded) {
    // The flame's soft glow must not spill past the tile into the transparent corners.
    img = sharp(await img.png().toBuffer()).composite([{ input: roundedMask(drawn), blend: 'dest-in' }]);
  } else {
    img = sharp(await img.png().toBuffer()).flatten({ background: '#020409' }).removeAlpha();
  }
  if (drawn !== size) img = sharp(await img.png().toBuffer()).resize(size, size, { kernel: 'lanczos3' });
  return img.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

/**
 * Android's maskable icon: full bleed, and the rocket's farthest visible pixel kept 8 % inside the safe circle
 * (radius 40 % of the icon), measured from the master's own alpha rather than guessed.
 */
async function maskableIcon(rocket, size) {
  const k = (MASKABLE_SAFE_RADIUS * size * 0.92) / rocket.reach;
  const side = Math.floor(Math.max(rocket.width, rocket.height) * k);
  return icon(rocket, size, { scale: side / size, rounded: false });
}

/** PNG-in-ICO (Windows Vista onward and every current browser): a 6-byte header, 16-byte entries, the PNGs verbatim. */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

// ── the share card ────────────────────────────────────────────────────────────────────────────────────────────

/** Separable 1-D running filter over a Float32Array plane (min, max or mean over ±r, edges clamped). */
function filter1d(src, w, h, r, horizontal, op) {
  const dst = new Float32Array(src.length);
  const n = horizontal ? w : h;
  const lines = horizontal ? h : w;
  for (let l = 0; l < lines; l++) {
    for (let i = 0; i < n; i++) {
      let acc = op === 'min' ? Infinity : op === 'max' ? -Infinity : 0;
      for (let d = -r; d <= r; d++) {
        const j = clamp(i + d, 0, n - 1);
        const v = horizontal ? src[l * w + j] : src[j * w + l];
        if (op === 'min') acc = Math.min(acc, v);
        else if (op === 'max') acc = Math.max(acc, v);
        else acc += v;
      }
      dst[horizontal ? l * w + i : i * w + l] = op === 'mean' ? acc / (2 * r + 1) : acc;
    }
  }
  return dst;
}
const filter2d = (src, w, h, r, op) => filter1d(filter1d(src, w, h, r, true, op), w, h, r, false, op);

/**
 * The sheet's lettering lifted off its navy ground into RGBA. The ground is estimated per channel by a morphological
 * opening wider than any stroke (erode, then dilate, then smooth) — it follows the sheet's gradient and the rocket's glow
 * at the left edge, which one flat colour would not. Alpha comes from how far a pixel's brightest channel rises above
 * the ground (the glyphs are white-to-ice and cyan: their brightest channel is ~255), and edge colours are
 * un-premultiplied so the anti-aliasing keeps its hue on the new background instead of carrying navy fringes.
 */
async function letteringMatte() {
  const { data, info } = await sharp(SHEET).extract(LETTERING).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const ground = [0, 1, 2].map((c) => {
    const plane = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) plane[i] = data[i * 3 + c];
    return filter2d(filter2d(filter2d(plane, w, h, 15, 'min'), w, h, 15, 'max'), w, h, 8, 'mean');
  });
  const alpha = new Float32Array(w * h);
  const core = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const vC = Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    const vB = Math.max(ground[0][i], ground[1][i], ground[2][i]);
    const raw = (vC - vB) / Math.max(1, 255 - vB);
    // Below ~5 % is the sheet's own compression noise; a short ramp keeps that from reading as a haze around the glyphs.
    alpha[i] = clamp(raw, 0, 1) * smooth((raw - 0.04) / 0.08);
    core[i] = alpha[i] > 0.5 ? 1 : 0;
  }
  // ⚠️ Only what touches a glyph survives: within 3 px of a solid glyph pixel (softened by 1 px). The sheet's rocket glow
  // brightens the ground at the crop's left edge faster than the opening can follow, and without this the card showed
  // the crop's edge as a faint blue bar beside the "M".
  const near = filter2d(filter2d(core, w, h, 3, 'max'), w, h, 1, 'mean');
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i] * near[i];
    for (let c = 0; c < 3; c++) {
      const C = data[i * 3 + c];
      const B = ground[c][i];
      rgba[i * 4 + c] = a > 0.004 ? Math.round(clamp(B + (C - B) / alpha[i], 0, 255)) : 0;
    }
    rgba[i * 4 + 3] = Math.round(a * 255);
  }
  return { png: await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), width: w, height: h };
}

/**
 * 1200×630: true black; one soft key light in the rocket's own body blue (#1873CA) behind the mark; the flame's cyan
 * trailing away down the rocket's axis, the way the sheet's hero draws its exhaust; a vignette. A night shoot, not a
 * gradient poster — one hue, no glow soup (docs/DESIGN.md §2, §6). The sheet's horizontal lockup — the rocket, then
 * "MyAvatar.ge" over "AI CREATIVE STUDIO" — is centred as one group, clear of X's 2:1 crop.
 *
 * No film grain: grain is incompressible, and even dithered to a palette it pushed the card past the 300 KB budget.
 */
async function ogImage(rocket) {
  const lettering = await letteringMatte();
  const ROCKET_SIDE = 368; // the visible rocket's longer side
  const TEXT_W = 590; // the lettering's width — the sheet's 656 px reduced, never enlarged
  const GAP = 36;
  const mark = await rocketAt(rocket, ROCKET_SIDE);
  const textH = Math.round((lettering.height * TEXT_W) / lettering.width);
  const text = await sharp(lettering.png).resize(TEXT_W, textH, { kernel: 'lanczos3' }).png().toBuffer();
  const groupW = mark.width + GAP + TEXT_W;
  const left = Math.round((OG_W - groupW) / 2);
  const markTop = Math.round((OG_H - mark.height) / 2);
  const markCx = left + mark.width / 2;
  const markCy = markTop + mark.height / 2;
  // The sheet sets the lettering's block a touch below the rocket's centre line; so does the card.
  const textLeft = left + mark.width + GAP;
  const textTop = Math.round(OG_H / 2 - textH / 2 + 8);

  // The flame core on the placed mark (~15 % across, ~77 % down its visible box); the exhaust is a soft wedge from it
  // along the rocket's axis, away from the nose (down-left, 45°), drawn UNDER the rocket.
  const flameX = left + mark.width * 0.15;
  const flameY = markTop + mark.height * 0.77;
  const TRAIL = 420;
  const HALF_W = 46;
  const ax = -Math.SQRT1_2, ay = Math.SQRT1_2; // along the axis
  const nx = Math.SQRT1_2, ny = Math.SQRT1_2; // across it
  const exhaust =
    `<polygon points="${flameX + nx * HALF_W},${flameY + ny * HALF_W} ${flameX - nx * HALF_W},${flameY - ny * HALF_W} ` +
    `${flameX + ax * TRAIL},${flameY + ay * TRAIL}" fill="url(#trail)" filter="url(#soft)"/>`;
  const light = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">` +
      '<defs>' +
      `<linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="${flameX}" y1="${flameY}" x2="${flameX + ax * TRAIL}" y2="${flameY + ay * TRAIL}">` +
      '<stop offset="0" stop-color="#22D3EE" stop-opacity="0.6"/><stop offset="0.35" stop-color="#338FE8" stop-opacity="0.24"/>' +
      '<stop offset="1" stop-color="#1873CA" stop-opacity="0"/></linearGradient>' +
      '<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>' +
      `<radialGradient id="key" gradientUnits="userSpaceOnUse" cx="${markCx}" cy="${markCy}" r="560">` +
      '<stop offset="0" stop-color="#1873CA" stop-opacity="0.42"/><stop offset="0.38" stop-color="#1873CA" stop-opacity="0.13"/>' +
      '<stop offset="0.72" stop-color="#1873CA" stop-opacity="0.03"/><stop offset="1" stop-color="#1873CA" stop-opacity="0"/></radialGradient>' +
      `<radialGradient id="flame" gradientUnits="userSpaceOnUse" cx="${markCx - mark.width * 0.36}" cy="${markCy + mark.height * 0.36}" r="230">` +
      '<stop offset="0" stop-color="#22D3EE" stop-opacity="0.16"/><stop offset="1" stop-color="#22D3EE" stop-opacity="0"/></radialGradient>' +
      `<radialGradient id="vignette" gradientUnits="userSpaceOnUse" cx="${OG_W / 2}" cy="${OG_H / 2}" r="${Math.hypot(OG_W, OG_H) / 2}">` +
      '<stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.65"/></radialGradient>' +
      '</defs>' +
      `<rect width="${OG_W}" height="${OG_H}" fill="#000"/>` +
      `<rect width="${OG_W}" height="${OG_H}" fill="url(#key)"/>` +
      `<rect width="${OG_W}" height="${OG_H}" fill="url(#flame)"/>` +
      exhaust +
      `<rect width="${OG_W}" height="${OG_H}" fill="url(#vignette)"/></svg>`,
  );

  const composed = await sharp(light)
    .composite([
      { input: mark.png, left, top: markTop },
      { input: text, left: textLeft, top: textTop },
    ])
    .removeAlpha()
    .png()
    .toBuffer();
  return sharp(composed);
}

async function encodeOg(img) {
  // Truecolour first; a palette PNG (libimagequant, dithered) only if truecolour would bust the budget.
  const truecolour = await img.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  if (truecolour.length <= OG_MAX_BYTES) return { buf: truecolour, mode: 'truecolour' };
  const palette = await img.clone().png({ palette: true, quality: 92, effort: 10, dither: 0.9, compressionLevel: 9 }).toBuffer();
  if (palette.length > OG_MAX_BYTES) throw new Error(`og-image is ${palette.length} B even as a palette PNG — over the ${OG_MAX_BYTES} B budget`);
  return { buf: palette, mode: 'palette' };
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const rocket = await loadRocket();
  const written = [];
  const write = (rel, buf) => {
    writeFileSync(out(rel), buf);
    written.push(`  ${rel}  ${statSync(join(ROOT, rel)).size} B`);
  };

  const tile = { scale: 0.76, rounded: true };
  const tiny = { scale: 0.9, rounded: true }; // ≤ 48 px: every pixel the tile can spare goes to the rocket
  const opaque = { scale: 0.7, rounded: false }; // iOS / App Store mask the corners themselves — keep the tips clear

  const icoPngs = [];
  for (const n of [16, 32, 48]) icoPngs.push({ size: n, data: await icon(rocket, n, tiny) });
  write('app/favicon.ico', ico(icoPngs));
  write('app/icon.png', await icon(rocket, 512, tile));
  write('app/apple-icon.png', await icon(rocket, 180, opaque));
  write('public/icons/icon-192x192.png', await icon(rocket, 192, tile));
  write('public/icons/icon-512x512.png', await icon(rocket, 512, tile));
  write('public/icons/icon-maskable-512.png', await maskableIcon(rocket, 512));
  write('public/icons/icon-1024x1024.png', await icon(rocket, 1024, opaque));

  const og = await encodeOg(await ogImage(rocket));
  write('public/og-image.png', og.buf);

  console.log(`rocket: ${rocket.width}×${rocket.height} visible, reach ${rocket.reach.toFixed(1)} px; og-image: ${og.mode}`);
  console.log(written.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
