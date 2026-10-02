/** @jest-environment node */
/**
 * Every icon is the real logo, at the right size, from ONE source — and nothing else is allowed to claim the job.
 *
 * ⚠️ THREE SOURCES USED TO COMPETE. The root layout and the [locale] layout each listed `icons` (pointing at
 * /icons/favicon.ico and /apple-touch-icon.png) while app/icon.png and app/[locale]/icon.png sat unused — Next ignores
 * the app/ icon files whenever a config `icons` resolves — and the [locale] layout linked public/manifest.json while
 * the root linked app/manifest.ts. The Next file conventions are the one source now (app/favicon.ico, app/icon.png,
 * app/apple-icon.png, app/manifest.ts), all built by scripts/brand/build-assets.mjs from the transparent rocket.
 *
 * (This file lived in public/icons/, which deploys; it moved here with the rewrite.)
 *
 * ⚠️ AND public/logo.png WAS A JPEG WEARING A .png NAME — the defect that made the video watermark an
 * opaque black box. It is a real PNG now. The signature check keeps it that way.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const root = join(__dirname, '..', '..');
const at = (rel: string) => join(root, rel);

/** PNG header: signature, then IHDR carries width/height (big-endian uint32) and the colour type (6 = RGBA, 2 = RGB). */
function png(path: string) {
  const b = readFileSync(path);
  return {
    isPng: b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    w: b.readUInt32BE(16), h: b.readUInt32BE(20), colourType: b.readUInt8(25), bytes: b.length,
  };
}

describe('the icon set — the Next file conventions are the one source', () => {
  it('app/favicon.ico is a real ICO file (not a redirect route) with 16, 32 and 48 px PNG entries', () => {
    expect(statSync(at('app/favicon.ico')).isFile()).toBe(true);
    const b = readFileSync(at('app/favicon.ico'));
    expect(b.readUInt16LE(0)).toBe(0); // reserved
    expect(b.readUInt16LE(2)).toBe(1); // type: icon
    const sizes: number[] = [];
    for (let i = 0; i < b.readUInt16LE(4); i++) {
      const entry = 6 + 16 * i;
      sizes.push(b.readUInt8(entry) || 256);
      const offset = b.readUInt32LE(entry + 12);
      expect(b.subarray(offset, offset + 4).toString('hex')).toBe('89504e47'); // every image is a PNG
    }
    expect(sizes.sort((x, y) => x - y)).toEqual([16, 32, 48]);
  });

  it('app/icon.png is 512 px with transparent corners (the rounded tile)', async () => {
    const i = png(at('app/icon.png'));
    expect([i.isPng, i.w, i.h, i.colourType]).toEqual([true, 512, 512, 6]);
    const { data, info } = await sharp(at('app/icon.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511]]) expect(alpha(x!, y!)).toBe(0);
    expect(alpha(256, 256)).toBe(255);
  });

  it('app/apple-icon.png is 180 px and OPAQUE — iOS puts touch icons on an opaque tile and masks it itself', () => {
    const i = png(at('app/apple-icon.png'));
    expect([i.isPng, i.w, i.h]).toEqual([true, 180, 180]);
    expect(i.colourType).toBe(2); // RGB, no alpha channel to turn black
  });

  it.each([
    ['public/icons/icon-192x192.png', 192],
    ['public/icons/icon-512x512.png', 512],
    ['public/icons/icon-maskable-512.png', 512],
    ['public/icons/icon-1024x1024.png', 1024],
  ])('%s is a real PNG at %i px', (rel, sz) => {
    const i = png(at(rel));
    expect([i.isPng, i.w, i.h]).toEqual([true, sz, sz]);
  });

  it('the App Store and maskable icons carry no alpha (Apple refuses it; Android fills it black)', () => {
    expect(png(at('public/icons/icon-1024x1024.png')).colourType).toBe(2);
    expect(png(at('public/icons/icon-maskable-512.png')).colourType).toBe(2);
  });

  it('the maskable icon keeps the rocket inside Android\'s safe circle (radius 40 %)', async () => {
    // Android crops a maskable icon to a shape no smaller than the centre circle of 80 % width. Measured, not trusted:
    // nothing bright (the rocket) may sit outside that circle — only the dark tile may.
    const { data, info } = await sharp(at('public/icons/icon-maskable-512.png')).raw().toBuffer({ resolveWithObject: true });
    const c = info.width / 2;
    let outside = 0;
    let inside = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        const bright = Math.max(data[i]!, data[i + 1]!, data[i + 2]!) > 110;
        if (!bright) continue;
        if (Math.hypot(x + 0.5 - c, y + 0.5 - c) > 0.4 * info.width) outside++;
        else inside++;
      }
    }
    expect(inside).toBeGreaterThan(10_000); // the rocket is there…
    expect(outside).toBe(0); // …and all of it is inside the safe zone
  });

  it('every icon is built from the TRANSPARENT rocket master (an RGBA cut-out, never the opaque tile)', async () => {
    const m = await sharp(at('design/brand/rocket/rocket-master.png')).metadata();
    expect(m.hasAlpha).toBe(true);
    expect(m.channels).toBe(4);
    const script = readFileSync(at('scripts/brand/build-assets.mjs'), 'utf8');
    expect(script).toContain("'design/brand/rocket/rocket-master.png'");
    expect(script).not.toContain('myavatar-logo.png'); // the opaque 1254 px tile the old icons were cropped from
  });

  it('nothing else declares icons or a manifest — no second list for Next to prefer over the files', () => {
    for (const rel of ['app/layout.tsx', 'app/[locale]/layout.tsx']) {
      const src = readFileSync(at(rel), 'utf8');
      expect(src).not.toMatch(/^\s*icons\s*:/m);
      expect(src).not.toMatch(/^\s*manifest\s*:/m);
    }
    for (const gone of [
      'app/[locale]/icon.png', // overrode app/icon.png under /{locale}
      'app/icon.tsx', 'app/icon.ts', 'app/[locale]/icon.tsx', // a generated icon wins over every static file
      'app/favicon.ico/route.ts', // the redirect that stood where the real favicon now is
      'public/manifest.json', // the [locale] layout's second manifest
      'public/icons/site.webmanifest', 'public/icons/head-snippet.html', // a third manifest and a pasteable <link> set
      'public/apple-touch-icon.png', 'public/icons/favicon.ico', 'public/icons/icon-180x180.png', // replaced by app/*
    ]) {
      expect(existsSync(at(gone))).toBe(false);
    }
  });

  it('/favicon.png still lands on the tab icon', () => {
    const route = readFileSync(at('app/favicon.png/route.ts'), 'utf8');
    expect(route).toContain("'/icon.png'");
    expect(existsSync(at('app/icon.png'))).toBe(true);
  });
});

describe('the share card', () => {
  it('public/og-image.png is a 1200×630 PNG under 300 KB (WhatsApp and some unfurlers drop heavier cards)', () => {
    const i = png(at('public/og-image.png'));
    expect([i.isPng, i.w, i.h]).toEqual([true, 1200, 630]);
    expect(i.bytes).toBeLessThan(300 * 1024);
  });

  it('is the only one — the art pack\'s og.jpg (the home, landing and studio pages used it) is retired', () => {
    expect(existsSync(at('public/brand/v1/og.jpg'))).toBe(false);
  });
});

describe('the in-app brand mark', () => {
  /**
   * ⚠️ THE SMALL MARK IS A DIFFERENT FILE FROM THE APP ICON, AND IT WAS MISSED TWICE. Nine references
   * across BrandLogo, ChatChrome and the services page render `/brand/gemini-rocket-clean.png` — the old
   * one carried visible alpha-compositing artefacts around the fins.
   *
   * It is a CROP of the new artwork, not an extraction. Pulling the rocket onto transparency needs a
   * luminance key, and the tile's gradient overlaps the rocket's own dark tones: a low threshold leaves a
   * grey haze, a high one turns the shadowed side and left fin semi-transparent. Both were rendered and
   * rejected. Cropping the flat interior of the tile — centred on the rocket, clear of the rounded
   * corners and of the wordmark below — needs no key at all and cannot go wrong.
   */
  it('is a square 512 crop of the new artwork', () => {
    const i = png(at('public/brand/gemini-rocket-clean.png'));
    expect(i.isPng).toBe(true);
    expect([i.w, i.h]).toEqual([512, 512]);
  });

  it('the unused brand files are gone', () => {
    // Three of the four were referenced nowhere. Keeping spare logos is how a rebrand misses one.
    for (const f of ['logo-primary-transparent.png', 'rocket-logo-final.png', 'logo.png']) {
      expect(existsSync(at(`public/brand/${f}`))).toBe(false);
    }
  });

  it('public/logo.png is a PNG, not a JPEG in disguise', () => {
    // This exact lie made the video watermark an opaque black box for months.
    expect(png(at('public/logo.png')).isPng).toBe(true);
  });
});
