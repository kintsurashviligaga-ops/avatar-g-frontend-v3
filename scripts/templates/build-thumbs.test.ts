/** @jest-environment node */
/**
 * scripts/templates/build-thumbs.mjs — selected art-pack takes → the 600×800 card JPEGs, plus the `thumb:` lines to
 * change. Run here against a fixture manifest in a temp dir; nothing touches public/ or the network.
 *
 * ⚠️ The card source it reads is lib/studio/templates.ts with the 20 shot cards' `thumb:` put back to null — the state a
 * build STARTS from. Once the pictures are built and the lines applied (they are), the real file says "already points at"
 * and a test that pinned it would fail for the right work; the fixture keeps this suite about the script, not about
 * which pictures happen to exist today.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { parseShots } from '../hf-art-pack';
import { blurMapOptsFor, parseThumbArgs, publicThumbPath, thumbJobs, thumbLineChanges } from './build-thumbs.mjs';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts/templates/build-thumbs.mjs');
const TEMPLATES_TS = join(ROOT, 'lib/studio/templates.ts');
// The original 20 (video / image / music) — the interior/ and photoshoot/ shots are checked in thumbs.shoot.test.ts.
const templateIds = parseShots(readFileSync(join(ROOT, 'scripts/templates/thumbs.md'), 'utf8')).map((s) => s.id).filter((id) => !/^(interior|photoshoot)\//.test(id));

/** templates.ts as a build finds it: every shot card's `thumb: '/templates/<id>.jpg'` put back to `thumb: null`. */
const beforeBuild = (source: string): string =>
  templateIds.reduce((acc, id) => acc.replace(`thumb: '/templates/${id}.jpg',`, 'thumb: null,'), source);
const BEFORE_SOURCE = beforeBuild(readFileSync(TEMPLATES_TS, 'utf8'));

type Change = { id: string; state: 'change' | 'already' | 'missing'; line: number | null; before: string | null; after: string | null };

describe('the thumb: lines it prints', () => {
  const source = BEFORE_SOURCE;
  const lines = source.split('\n');

  test('every one of the 20 thumbnail shots finds its own card\'s thumb: line, with the exact edit', () => {
    const changes = thumbLineChanges(source, templateIds) as Change[];
    expect(changes).toHaveLength(20);
    for (const c of changes) {
      expect(c.state).toBe('change');
      expect(lines[c.line! - 1]).toBe(c.before);
      expect(c.before).toMatch(/^\s*thumb: null,/);
      expect(c.after).toBe(c.before!.replace('thumb: null', `thumb: '${publicThumbPath(c.id)}'`));
    }
    // The teaser's line is the teaser's: the next card's thumb is never picked up.
    const teaser = changes.find((c) => c.id === 'video/teaser')!;
    expect(lines.slice(teaser.line! - 6, teaser.line!).join('\n')).toContain("tool: 'video', id: 'teaser',");
  });
  test('a card that already points at its file says so; an unknown card is reported, not guessed', () => {
    expect((thumbLineChanges(source, ['video/reel']) as Change[])[0]).toMatchObject({ state: 'already' });
    expect((thumbLineChanges(source, ['video/nope']) as Change[])[0]).toMatchObject({ state: 'missing', line: null });
  });
});

describe('the selected takes it will read', () => {
  test('only template ids, only files inside raw/', () => {
    const { jobs, refused } = thumbJobs({
      selected: {
        'video/teaser': { url: 'u', file: 'raw/video/teaser-1-0.png', attempt: 1 },
        A1: { url: 'u', file: 'raw/A1-1-0.png', attempt: 1 },
        'music/jazz': { url: 'u', file: 'raw/../../../etc/passwd', attempt: 1 },
        'image/abs': { url: 'u', file: '/etc/passwd', attempt: 1 },
        'image/none': { url: 'u', attempt: 1 },
      },
    }, '/w', '/o') as { jobs: Array<{ id: string; src: string; dst: string }>; refused: Array<{ id: string }> };
    expect(jobs).toEqual([{ id: 'video/teaser', src: '/w/raw/video/teaser-1-0.png', dst: '/o/video/teaser.jpg', publicPath: '/templates/video/teaser.jpg' }]);
    expect(refused.map((r) => r.id)).toEqual(['A1', 'music/jazz', 'image/abs', 'image/none']);
  });
});

describe('a run against a fixture manifest', () => {
  let dir: string;
  let templatesTs: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'build-thumbs-'));
    templatesTs = join(dir, 'templates.before.ts');
    writeFileSync(templatesTs, BEFORE_SOURCE);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const take = async (rel: string, width: number, height: number, format: 'png' | 'jpeg') => {
    const file = join(dir, 'work', rel);
    mkdirSync(dirname(file), { recursive: true });
    const img = sharp({ create: { width, height, channels: 3, background: { r: 20, g: 60, b: 120 } } });
    writeFileSync(file, await (format === 'png' ? img.png() : img.jpeg()).toBuffer());
  };
  const run = (manifest: unknown) => {
    writeFileSync(join(dir, 'work/manifest.json'), JSON.stringify(manifest));
    return spawnSync(process.execPath, [SCRIPT, '--manifest', join(dir, 'work/manifest.json'), '--out', join(dir, 'out'), '--templates', templatesTs], {
      cwd: ROOT, encoding: 'utf8', timeout: 60_000,
    });
  };

  test('FLUX (880×1168 png) and Imagen (896×1280 jpeg) takes come out 600×800 JPEGs, and the edits are printed', async () => {
    await take('raw/video/teaser-1-0.png', 880, 1168, 'png');
    await take('raw/image/poster-2-3.jpg', 896, 1280, 'jpeg');
    const r = run({
      selected: {
        'video/teaser': { url: 'https://replicate.delivery/x/out-0.png', file: 'raw/video/teaser-1-0.png', attempt: 1 },
        'image/poster': { url: 'inline:image/jpeg', file: 'raw/image/poster-2-3.jpg', attempt: 2 },
      },
    });
    expect({ status: r.status, stderr: r.stderr }).toMatchObject({ status: 0 });
    for (const id of ['video/teaser', 'image/poster']) {
      const meta = await sharp(join(dir, 'out', `${id}.jpg`)).metadata();
      expect(meta).toMatchObject({ format: 'jpeg', width: 600, height: 800 });
    }
    expect(r.stdout).toMatch(/templates\.before\.ts:\d+ {2}video\/teaser\n {2}- thumb: null, palette: \['#06121F', '#4DB6FF'\],\n {2}\+ thumb: '\/templates\/video\/teaser\.jpg', palette: \['#06121F', '#4DB6FF'\],/);
    expect(r.stdout).toContain("+ thumb: '/templates/image/poster.jpg',");
    expect(r.stdout).toContain('built 2 · skipped 0 · failed 0');
    // It printed the edit; it did not make it.
    expect(readFileSync(templatesTs, 'utf8')).toBe(BEFORE_SOURCE);
  });

  test('a bad entry is refused and a missing file is reported — the run says so and exits 2; nothing escapes out/', async () => {
    await take('raw/music/rnb-beat-1-0.png', 880, 1168, 'png');
    const r = run({
      selected: {
        'music/rnb-beat': { url: 'u', file: 'raw/music/rnb-beat-1-0.png', attempt: 1 },
        'music/jazz': { url: 'u', file: 'raw/../../escape.png', attempt: 1 },
        'video/noir': { url: 'u', file: 'raw/video/noir-1-0.png', attempt: 1 },
      },
    });
    expect(r.status).toBe(2);
    expect(r.stdout).toMatch(/✗ music\/jazz: skipped — its file "raw\/\.\.\/\.\.\/escape\.png" is not under raw\//);
    expect(r.stdout).toMatch(/✗ video\/noir: .*is missing/);
    expect(r.stdout).toContain('built 1 · skipped 1 · failed 1');
    expect(readdirSync(join(dir, 'out'))).toEqual(['music']);
    expect(existsSync(join(dir, 'out/music/rnb-beat.jpg'))).toBe(true);
  });

  test('a build into <public>/templates refreshes the blur/version map; a fixture `--out` alone never touches the real one', async () => {
    const REAL_MAP = join(ROOT, 'lib/studio/templateThumbs.generated.ts');
    const realBefore = readFileSync(REAL_MAP, 'utf8');
    await take('raw/video/teaser-1-0.png', 880, 1168, 'png');
    writeFileSync(join(dir, 'work/manifest.json'), JSON.stringify({
      selected: { 'video/teaser': { url: 'u', file: 'raw/video/teaser-1-0.png', attempt: 1 } },
    }));
    const r = spawnSync(process.execPath, [SCRIPT, '--manifest', join(dir, 'work/manifest.json'), '--out', join(dir, 'public/templates'),
      '--blur-out', join(dir, 'map.ts'), '--templates', templatesTs], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
    expect({ status: r.status, stderr: r.stderr }).toMatchObject({ status: 0 });
    expect(r.stdout).toMatch(/blur map .*map\.ts: \d+ pictures? \(\+\d+ new/);
    const map = readFileSync(join(dir, 'map.ts'), 'utf8');
    const v = createHash('sha256').update(readFileSync(join(dir, 'public/templates/video/teaser.jpg'))).digest('hex').slice(0, 10);
    expect(map).toContain(`'/templates/video/teaser.jpg': { v: '${v}', blur: 'data:image/webp;base64,`);
    // The `--out`-only runs above built into a fixture folder: the committed map is untouched.
    expect(readFileSync(REAL_MAP, 'utf8')).toBe(realBefore);
    expect(blurMapOptsFor(parseThumbArgs(['--out', join(dir, 'out')]))).toBeNull();
    expect(blurMapOptsFor(parseThumbArgs([], ROOT))).toEqual({
      publicDir: join(ROOT, 'public'), templates: TEMPLATES_TS, out: REAL_MAP, check: false,
      // …and the Interior designer's / Photographer's card files are scanned for `thumb:` lines too.
      extraTemplates: [join(ROOT, 'lib/studio/templates.interior.ts'), join(ROOT, 'lib/studio/templates.photoshoot.ts')],
    });
  });

  test('no manifest: a configuration error, nothing built', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--manifest', join(dir, 'nope.json'), '--out', join(dir, 'out')], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no manifest/);
    expect(existsSync(join(dir, 'out'))).toBe(false);
  });
});
