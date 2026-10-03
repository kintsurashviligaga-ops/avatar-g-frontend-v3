/** @jest-environment node */
/**
 * lib/brand/siteArt.ts + the committed lib/brand/siteArt.generated.ts (site imagery v2).
 *
 * Every banner the video header names ships; the placeholder map is CURRENT — every VFX tile and banner on disk has an
 * entry whose `v` is the file's own hash, and no entry outlives its file — so a replaced picture never loads under the
 * old picture's blur. And the finals are the sizes their surfaces were designed for.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { SITE_ART_META } from './siteArt.generated';
import { VIDEO_HERO_ART, siteArt } from './siteArt';

const PUBLIC = join(process.cwd(), 'public');
const FIX = 'node scripts/site-art/build-site-art.mjs';
const sha10 = (p: string) => createHash('sha256').update(readFileSync(join(PUBLIC, p))).digest('hex').slice(0, 10);
const filesIn = (dir: string) => (existsSync(join(PUBLIC, dir)) ? readdirSync(join(PUBLIC, dir)).filter((f) => /\.(jpe?g|png|webp)$/.test(f)).map((f) => `/${dir}/${f}`) : []);

test('every video header banner ships, at 1200×514 (21:9)', async () => {
  for (const p of Object.values(VIDEO_HERO_ART)) {
    expect(existsSync(join(PUBLIC, p))).toBe(true);
    const m = await sharp(join(PUBLIC, p)).metadata();
    expect([m.width, m.height]).toEqual([1200, 514]);
  }
});

test('every VFX tile is 600×800 (3:4)', async () => {
  const tiles = filesIn('vfx');
  expect(tiles.length).toBeGreaterThanOrEqual(24);
  for (const p of tiles) {
    const m = await sharp(join(PUBLIC, p)).metadata();
    expect([m.width, m.height]).toEqual([600, 800]);
  }
});

test(`the placeholder map is current — if this fails, run: ${FIX}`, () => {
  const onDisk = [...filesIn('vfx'), ...filesIn('brand/video-hero')].sort();
  expect(Object.keys(SITE_ART_META).sort()).toEqual(onDisk);
  for (const p of onDisk) {
    expect(SITE_ART_META[p]!.v).toBe(sha10(p));
    expect(SITE_ART_META[p]!.blur).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/=]{20,}$/);
  }
});

test('siteArt: a mapped picture carries its blur; anything else loads plain — an inherited key is not an entry', () => {
  expect(siteArt(VIDEO_HERO_ART.fast)).toEqual({ src: VIDEO_HERO_ART.fast, blurDataURL: SITE_ART_META[VIDEO_HERO_ART.fast]!.blur });
  expect(siteArt('/vfx/not-made-yet.jpg')).toEqual({ src: '/vfx/not-made-yet.jpg' });
  expect(siteArt('constructor')).toEqual({ src: 'constructor' });
});
