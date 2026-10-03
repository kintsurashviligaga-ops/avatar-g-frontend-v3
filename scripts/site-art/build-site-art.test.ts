/** @jest-environment node */
/**
 * scripts/site-art/build-site-art.mjs — selected takes → the finals under public/, run here against a fixture manifest in a
 * temp dir (nothing touches the real public/ or the network): each group lands at its own size and path, a bad id or a
 * file outside raw/ is refused unread, and every selection in the real manifest maps to a file that ships.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { TARGETS, buildOne, buildSiteArtMap, siteArtJobs, sitePathFor } from './build-site-art.mjs';

type Job = { id: string; group: string; src: string; dst: string; sitePath: string; target: (typeof TARGETS)[keyof typeof TARGETS] };

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'site-art-build-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

test('each group has its site path', () => {
  expect(sitePathFor('vfx/fire')).toBe('/vfx/fire.jpg');
  expect(sitePathFor('hero/lite')).toBe('/brand/video-hero/lite.jpg');
  expect(sitePathFor('services/voice')).toBe('/services/voice.webp');
  expect(sitePathFor('style/line-art')).toBe('/styles/image/line-art.jpg');
  for (const bad of ['fire', 'vfx/', 'vfx/../x', 'other/fire', 'vfx/Fire', 'vfx/a/b']) expect(sitePathFor(bad)).toBeNull();
});

test('a bad id, or a file outside raw/, is refused — never read, never written', () => {
  const work = join(tmp, 'work');
  const { jobs, refused } = siteArtJobs({
    selected: {
      'vfx/fire': { file: 'raw/vfx/fire-1-2.png' },
      'nope/x': { file: 'raw/nope/x-1-0.png' },
      'vfx/ice': { file: '../../etc/passwd' },
      'hero/lite': { file: '' },
    },
  }, work, join(tmp, 'public'));
  expect(jobs.map((j: Job) => j.id)).toEqual(['vfx/fire']);
  expect(refused.map((r: { id: string }) => r.id).sort()).toEqual(['hero/lite', 'nope/x', 'vfx/ice']);
});

test('a take lands at its surface\'s size — and a swatch is its centre, close up', async () => {
  const raw = join(tmp, 'work/raw');
  mkdirSync(join(raw, 'style'), { recursive: true });
  mkdirSync(join(raw, 'vfx'), { recursive: true });
  // A 1024² take: black, with a white 200² square in the middle — the swatch's 55 % crop must be mostly white.
  const square = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#ffffff' } }).png().toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#000000' } })
    .composite([{ input: square, left: 412, top: 412 }]).png().toFile(join(raw, 'style/anime-1-0.png'));
  await sharp({ create: { width: 896, height: 1152, channels: 3, background: '#335577' } }).png().toFile(join(raw, 'vfx/fire-1-0.png'));
  const pub = join(tmp, 'public');
  const { jobs } = siteArtJobs({ selected: { 'style/anime': { file: 'raw/style/anime-1-0.png' }, 'vfx/fire': { file: 'raw/vfx/fire-1-0.png' } } }, join(tmp, 'work'), pub);
  for (const j of jobs as Job[]) await buildOne(sharp, j);
  const sw = await sharp(join(pub, 'styles/image/anime.jpg')).stats();
  expect((await sharp(join(pub, 'styles/image/anime.jpg')).metadata()).width).toBe(96);
  expect(sw.channels[0]!.mean).toBeGreaterThan(30); // without the crop the square is ~4 % of the frame
  expect(await sharp(join(pub, 'vfx/fire.jpg')).metadata()).toMatchObject({ width: 600, height: 800, format: 'jpeg' });
  const map = await buildSiteArtMap(sharp, pub, join(tmp, 'map.ts'));
  expect(map.count).toBe(1); // the VFX tile has a blur; the swatch needs none
  expect(readFileSync(join(tmp, 'map.ts'), 'utf8')).toContain("'/vfx/fire.jpg': { v: '");
});

test('every selection in the committed manifest is a site-art id whose final ships', () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'scripts/site-art/manifest.json'), 'utf8')) as { selected: Record<string, unknown> };
  const ids = Object.keys(manifest.selected);
  expect(ids.length).toBe(48);
  for (const id of ids) {
    const p = sitePathFor(id);
    expect(p).not.toBeNull();
    expect(existsSync(join(process.cwd(), 'public', p!))).toBe(true);
  }
});
