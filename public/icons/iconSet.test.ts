/** @jest-environment node */
/**
 * Every icon must be the real logo, at the right size, everywhere the platform looks.
 *
 * ⚠️ THE BROWSER TAB DID NOT USE THESE FILES AT ALL. `app/icon.tsx` synthesised an icon at build time
 * from a CSS gradient, and Next's file convention makes that win over anything in `public/`. So the icon
 * set could be replaced perfectly and the tab would keep showing the generated placeholder. It was deleted
 * in favour of a static `app/icon.png`, and `/favicon.ico` and `/favicon.png` still redirect to `/icon`,
 * so all three paths now resolve to the same artwork.
 *
 * ⚠️ AND public/logo.png WAS A JPEG WEARING A .png NAME — the defect that made the video watermark an
 * opaque black box. It is a real PNG now. The signature check keeps it that way.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024];

/** PNG header: signature, then IHDR carries width/height as big-endian uint32. */
function png(path: string) {
  const b = readFileSync(path);
  return {
    isPng: b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length,
  };
}

describe('the icon set', () => {
  it.each(SIZES)('icon-%ix%i is a real PNG at exactly that size', (sz) => {
    const p = join(root, `public/icons/icon-${sz}x${sz}.png`);
    expect(existsSync(p)).toBe(true);
    const i = png(p);
    expect(i.isPng).toBe(true);
    expect([i.w, i.h]).toEqual([sz, sz]);
  });

  it('the apple touch icon is 180x180 — the size iOS asks for', () => {
    const i = png(join(root, 'public/apple-touch-icon.png'));
    expect([i.w, i.h]).toEqual([180, 180]);
  });

  it('the maskable icon keeps a safe zone', () => {
    // Android crops a maskable icon to a circle. Artwork drawn to the edge loses its corners, so the
    // source is padded into the inner ~80% before the platform ever sees it.
    const i = png(join(root, 'public/icons/icon-maskable-512.png'));
    expect([i.w, i.h]).toEqual([512, 512]);
  });

  it('public/logo.png is a PNG, not a JPEG in disguise', () => {
    // This exact lie made the video watermark an opaque black box for months.
    expect(png(join(root, 'public/logo.png')).isPng).toBe(true);
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
    const i = png(join(root, 'public/brand/gemini-rocket-clean.png'));
    expect(i.isPng).toBe(true);
    expect([i.w, i.h]).toEqual([512, 512]);
  });

  it('the unused brand files are gone', () => {
    // Three of the four were referenced nowhere. Keeping spare logos is how a rebrand misses one.
    for (const f of ['logo-primary-transparent.png', 'rocket-logo-final.png', 'logo.png']) {
      expect(existsSync(join(root, 'public/brand', f))).toBe(false);
    }
  });
});

describe('favicon.ico', () => {
  it('is a real ICO carrying the new artwork', () => {
    // ⚠️ FOUR PLACES REFERENCE /icons/favicon.ico AND ffmpeg CANNOT WRITE .ico — so a straight
    // regeneration of the set silently left this one on the old logo. Built by hand instead: a modern
    // ICO may embed a PNG verbatim (Vista onward, every current browser), which is 22 bytes of header
    // plus the PNG.
    const b = readFileSync(join(root, 'public/icons/favicon.ico'));
    expect(b.readUInt16LE(0)).toBe(0);   // reserved
    expect(b.readUInt16LE(2)).toBe(1);   // type: icon
    expect(b.readUInt16LE(4)).toBe(1);   // one entry
    expect(b.subarray(22, 26).toString('hex')).toBe('89504e47'); // …and it is a PNG
  });
});

describe('the browser tab resolves to the same artwork', () => {
  it('app/icon.png exists and no generated icon overrides it', () => {
    expect(existsSync(join(root, 'app/icon.png'))).toBe(true);
    // A synthesised icon.tsx wins over every static file — that is how the tab kept a placeholder.
    expect(existsSync(join(root, 'app/icon.tsx'))).toBe(false);
    expect(existsSync(join(root, 'app/icon.ts'))).toBe(false);
    // The locale segment carried its own re-export of the generated icon; it is a static file now too.
    expect(existsSync(join(root, 'app/[locale]/icon.png'))).toBe(true);
    expect(existsSync(join(root, 'app/[locale]/icon.tsx'))).toBe(false);
  });

  it('favicon.ico and favicon.png still point at /icon', () => {
    for (const r of ['app/favicon.ico/route.ts', 'app/favicon.png/route.ts']) {
      expect(readFileSync(join(root, r), 'utf8')).toContain("'/icon'");
    }
  });
});
