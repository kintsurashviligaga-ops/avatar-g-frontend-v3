/** @jest-environment node */
/**
 * lib/studio/templateThumbs.ts + the committed lib/studio/templateThumbs.generated.ts.
 *
 * The lookup: a shipped picture → a versioned src and its real blur · no picture → null (the palette tile) · a remote
 * URL → a plain <img>, never the optimizer. And the map itself is CURRENT: every thumbnail a card points at, and every
 * image under public/templates/, has an entry whose version is the file's own hash — so the year-long immutable cache on
 * versioned thumbnails can never serve a replaced picture, and no picture ships without its placeholder.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import sharp from 'sharp';
import { TEMPLATES_BY_TOOL } from './templates';
import { TEMPLATE_THUMB_META } from './templateThumbs.generated';
import { isStaticThumb, templateThumb } from './templateThumbs';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public');
const FIX = 'node scripts/templates/build-thumb-blur.mjs';
const sha10 = (p: string) => createHash('sha256').update(readFileSync(join(PUBLIC, p))).digest('hex').slice(0, 10);

describe('templateThumb — how a card loads its picture', () => {
  test('no picture → null: the card keeps its palette tile', () => {
    expect(templateThumb(null)).toBeNull();
    expect(templateThumb(undefined)).toBeNull();
    expect(templateThumb('')).toBeNull();
  });

  test('a shipped picture the map knows → `<path>?v=<its hash>` and its own blur', () => {
    const meta = TEMPLATE_THUMB_META['/templates/video/reel.jpg']!;
    expect(templateThumb('/templates/video/reel.jpg')).toEqual({
      kind: 'static', src: `/templates/video/reel.jpg?v=${meta.v}`, blurDataURL: meta.blur,
    });
    // The presenters' faces are thumbnails too.
    expect(templateThumb('/avatars/preset-2.jpg')).toMatchObject({ kind: 'static', blurDataURL: TEMPLATE_THUMB_META['/avatars/preset-2.jpg']!.blur });
  });

  test('a shipped picture the map does not know yet → still loads, unversioned, no blur', () => {
    expect(templateThumb('/templates/video/not-produced-yet.jpg')).toEqual({ kind: 'static', src: '/templates/video/not-produced-yet.jpg' });
    // An inherited key is not an entry.
    expect(templateThumb('/constructor')).toEqual({ kind: 'static', src: '/constructor' });
  });

  test('anything that is not our own site path is REMOTE (a plain <img>; a private signed URL must not be optimizer-cached)', () => {
    for (const src of [
      'https://abc.supabase.co/storage/v1/object/sign/twins/front.jpg?token=x',
      '//cdn.example.org/a.jpg',
      'data:image/png;base64,iVBORw0KGgo=',
      'blob:https://myavatar.ge/1234',
    ]) {
      expect(templateThumb(src)).toEqual({ kind: 'remote', src });
      expect(isStaticThumb(src)).toBe(false);
    }
    expect(isStaticThumb('/templates/video/reel.jpg')).toBe(true);
  });
});

describe('next.config.js: a year of cache for VERSIONED thumbnails only', () => {
  type Rule = { source: string; has?: Array<{ type: string; key: string }>; headers: Array<{ key: string; value: string }> };
  const cacheOf = (r: Rule) => r.headers.find((h) => h.key.toLowerCase() === 'cache-control')?.value;

  test('/templates and /avatars with ?v= are immutable for a year; nothing makes the bare (replaceable) paths immutable', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require('../../next.config.js') as { headers: () => Promise<Rule[]>; images: { formats: string[]; minimumCacheTTL: number } };
    const rules = await config.headers();
    for (const dir of ['/templates', '/avatars']) {
      const mine = rules.filter((r) => r.source.startsWith(dir));
      expect(mine.map((r) => ({ source: r.source, has: r.has, cache: cacheOf(r) }))).toEqual([
        { source: `${dir}/:path*`, has: [{ type: 'query', key: 'v' }], cache: 'public, max-age=31536000, immutable' },
      ]);
    }
    // No other rule (the catch-all included) sets an immutable Cache-Control that a bare thumbnail path could match.
    expect(rules.filter((r) => /immutable/.test(cacheOf(r) ?? '') && !r.has?.some((h) => h.type === 'query' && h.key === 'v'))).toEqual([]);
    expect(config.images.formats).toEqual(['image/avif', 'image/webp']);
    expect(config.images.minimumCacheTTL).toBe(86400);
  });
});

describe('the committed map is current', () => {
  const cardThumbs = [...new Set(Object.values(TEMPLATES_BY_TOOL).flat().map((t) => t.thumb).filter(isStaticThumb))].sort();
  const imagesUnder = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []).flatMap((e) =>
    e.isDirectory() ? imagesUnder(join(dir, e.name)) : /\.(?:jpe?g|png|webp|avif)$/i.test(e.name) ? [`/${relative(PUBLIC, join(dir, e.name)).split(sep).join('/')}`] : []);

  test('every card thumbnail and every image under public/templates/ has an entry with its file\'s CURRENT hash', () => {
    const wanted = [...new Set([...cardThumbs, ...imagesUnder(join(PUBLIC, 'templates'))])].sort();
    expect(wanted.length).toBeGreaterThanOrEqual(10); // 4 template pictures + 6 presenter faces today
    const stale = wanted.filter((p) => TEMPLATE_THUMB_META[p]?.v !== sha10(p));
    expect({ stale, fix: FIX }).toEqual({ stale: [], fix: FIX });
    // …and nothing in it points at a file that is gone.
    const orphans = Object.keys(TEMPLATE_THUMB_META).filter((p) => !wanted.includes(p));
    expect({ orphans, fix: FIX }).toEqual({ orphans: [], fix: FIX });
  });

  test('every blur is a real ≤ 16 px WebP of its picture, in the picture\'s own proportions', async () => {
    for (const [p, { blur }] of Object.entries(TEMPLATE_THUMB_META)) {
      const m = /^data:image\/webp;base64,([A-Za-z0-9+/]+=*)$/.exec(blur);
      expect({ p, ok: Boolean(m) }).toEqual({ p, ok: true });
      expect(blur.length).toBeLessThan(400); // it rides in the studio's JS
      const tiny = await sharp(Buffer.from(m![1]!, 'base64')).metadata();
      const full = await sharp(join(PUBLIC, p)).metadata();
      expect(tiny.format).toBe('webp');
      expect(Math.max(tiny.width!, tiny.height!)).toBe(16);
      expect(Math.abs(tiny.width! / tiny.height! - full.width! / full.height!)).toBeLessThan(0.1);
    }
  });
});
