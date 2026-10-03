#!/usr/bin/env node
/**
 * scripts/site-art/build-site-art.mjs — site imagery v2's finals. Every SELECTED take of the `site` art pack
 * (scripts/site-art/manifest.json → raw/<group>/<id>-<attempt>-<n>.png, chosen with `--pack site --select`) is
 * cover-resized from the centre to the size its surface shows and written under public/:
 *
 *   vfx/<preset>      → public/vfx/<preset>.jpg                 600×800  JPEG q82   (VFX preset tiles + hero card)
 *   hero/<id>         → public/brand/video-hero/<id>.jpg        1200×514 JPEG q82   (the video tool's header banner)
 *   services/<id>     → public/services/<id>.webp               1024×1024 WebP q85  (the /services hub — the size of the 19 there)
 *   style/<id>        → public/styles/image/<id>.jpg            96×96    JPEG q82   (the image tool's style chip swatch)
 *
 * The swatch is the CENTRAL 55 % of its take (`zoom`): it shows at 24 px, where the whole balcony is a smudge of brown —
 * the cat, close up, is what makes thirteen styles tell apart.
 *
 * Then it rewrites lib/brand/siteArt.generated.ts: for every VFX tile and video banner on disk, a ≤ 16 px WebP blur for
 * next/image's placeholder and the first 10 hex of the file's SHA-256 (lib/brand/siteArt.test.ts fails when an entry
 * is stale or missing, so a replaced picture never ships with the old blur). The swatches (96 px) and the service cards
 * (they fade in over their own gradient) need none.
 *
 * ⚠️ A take is refused — never read, never written — when its id is not `<group>/<slug>` of a known group, or its file
 * is not inside <work>/raw/: the manifest is a file on disk, so a path in it is checked like any input.
 *
 * Offline and free: sharp only (a devDependency), no provider, no network.
 *
 * Usage (from the repo root):
 *   node scripts/site-art/build-site-art.mjs
 *   node scripts/site-art/build-site-art.mjs --manifest <file> --public <dir> --blur-out <file>   # e.g. a fixture
 *
 * Exit codes: 0 every selected take was built · 1 configuration error (no sharp, no manifest) · 2 a take failed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { thumbMeta } from '../templates/build-thumb-blur.mjs';

/** Where each group lands and at what size. `blur`: the group gets an entry in the generated placeholder map. */
export const TARGETS = {
  vfx: { dir: 'vfx', ext: 'jpg', width: 600, height: 800, blur: true },
  hero: { dir: 'brand/video-hero', ext: 'jpg', width: 1200, height: 514, blur: true },
  services: { dir: 'services', ext: 'webp', width: 1024, height: 1024, blur: false },
  style: { dir: 'styles/image', ext: 'jpg', width: 96, height: 96, blur: false, zoom: 0.55 },
};

const ID_RE = /^(vfx|hero|services|style)\/([a-z0-9][a-z0-9-]{0,63})$/;

export function parseSiteArtArgs(argv, root = process.cwd()) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const manifest = resolve(root, arg('--manifest') ?? 'scripts/site-art/manifest.json');
  return {
    manifest,
    work: resolve(root, arg('--work') ?? dirname(manifest)),
    publicDir: resolve(root, arg('--public') ?? 'public'),
    blurOut: resolve(root, arg('--blur-out') ?? 'lib/brand/siteArt.generated.ts'),
  };
}

/** The site path a selected id is served at (public/ is the site root). Null for an id that is not ours. */
export function sitePathFor(id) {
  const m = ID_RE.exec(String(id));
  if (!m) return null;
  const t = TARGETS[m[1]];
  return `/${t.dir}/${m[2]}.${t.ext}`;
}

/** The selected takes as build jobs, and the ones refused (bad id, a file outside raw/). */
export function siteArtJobs(manifest, work, publicDir) {
  const raw = resolve(work, 'raw') + sep;
  const jobs = [];
  const refused = [];
  for (const [id, pick] of Object.entries(manifest?.selected ?? {})) {
    const m = ID_RE.exec(id);
    if (!m) { refused.push({ id, why: 'not a site-art id (vfx|hero|services|style/<slug>)' }); continue; }
    const file = typeof pick?.file === 'string' ? pick.file : '';
    const src = resolve(work, file);
    if (!file || !src.startsWith(raw)) { refused.push({ id, why: `its file ${JSON.stringify(file)} is not under raw/` }); continue; }
    const target = TARGETS[m[1]];
    const sitePath = sitePathFor(id);
    jobs.push({ id, group: m[1], src, dst: join(publicDir, `.${sitePath}`), sitePath, target });
  }
  return { jobs, refused };
}

/** One take → its final: cover-resized from the centre, flattened onto true black, metadata stripped. */
export async function buildOne(sharp, job) {
  mkdirSync(dirname(job.dst), { recursive: true });
  const { width, height, ext, zoom } = job.target;
  let img = sharp(job.src, { failOn: 'error' }).rotate();
  if (zoom) {
    // The central box at `zoom` of the short side, kept at the final's aspect.
    const { width: w, height: h } = await sharp(job.src).metadata();
    const side = Math.round(Math.min(w, h) * zoom);
    const cw = Math.min(w, Math.round(side * Math.max(1, width / height)));
    const ch = Math.min(h, Math.round(side * Math.max(1, height / width)));
    img = img.extract({ left: Math.floor((w - cw) / 2), top: Math.floor((h - ch) / 2), width: cw, height: ch });
  }
  img = img
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .flatten({ background: '#000000' });
  img = ext === 'webp' ? img.webp({ quality: 85, effort: 6 }) : img.jpeg({ quality: 82, progressive: true, mozjpeg: true });
  const info = await img.toFile(job.dst);
  if (info.width !== width || info.height !== height) throw new Error(`came out ${info.width}×${info.height}`);
  return info;
}

/** Every image under public/<dir>, as site paths. */
function imagesUnder(publicDir, dir) {
  const full = join(publicDir, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => /\.(?:jpe?g|png|webp)$/i.test(f))
    .map((f) => `/${relative(publicDir, join(full, f)).split(sep).join('/')}`);
}

/** The generated module's text — sorted, one entry per line, so a diff shows exactly which picture changed. */
export function renderSiteArtModule(entries) {
  const lines = Object.keys(entries).sort().map((p) => `  '${p}': { v: '${entries[p].v}', blur: '${entries[p].blur}' },`);
  return [
    '// GENERATED by scripts/site-art/build-site-art.mjs — do not edit by hand. Re-run it whenever a VFX preset tile',
    '// (public/vfx/) or a video header banner (public/brand/video-hero/) is added or replaced.',
    '// `v` = the first 10 hex of the file\'s SHA-256 (lib/brand/siteArt.test.ts fails when it no longer matches the file);',
    '// `blur` = a ≤ 16 px WebP of it for next/image\'s placeholder="blur".',
    'export const SITE_ART_META: Readonly<Record<string, { readonly v: string; readonly blur: string }>> = {',
    ...lines,
    '};',
    '',
  ].join('\n');
}

/** The placeholder map over every blurred group's files on disk (built this run or before). */
export async function buildSiteArtMap(sharp, publicDir, out) {
  const paths = Object.values(TARGETS).filter((t) => t.blur).flatMap((t) => imagesUnder(publicDir, t.dir)).sort();
  const entries = {};
  for (const p of paths) entries[p] = await thumbMeta(sharp, readFileSync(join(publicDir, `.${p}`)));
  const text = renderSiteArtModule(entries);
  const before = existsSync(out) ? readFileSync(out, 'utf8') : '';
  if (before !== text) writeFileSync(out, text);
  return { count: paths.length, wrote: before !== text };
}

export async function loadSharp() {
  try {
    const mod = await import('sharp');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

const shown = (p) => {
  const r = relative(process.cwd(), p);
  return !r || r.startsWith('..') ? p : r;
};

async function main() {
  const opts = parseSiteArtArgs(process.argv.slice(2));
  if (!existsSync(opts.manifest)) {
    console.error(`no manifest at ${shown(opts.manifest)} — run the art pack and --select the takes first`);
    process.exit(1);
  }
  const sharp = await loadSharp();
  if (!sharp) {
    console.error('sharp does not resolve from node_modules — nothing built (this script installs nothing)');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(opts.manifest, 'utf8'));
  const { jobs, refused } = siteArtJobs(manifest, opts.work, opts.publicDir);
  for (const r of refused) console.log(`✗ ${r.id}: skipped — ${r.why}`);
  let failed = 0;
  for (const job of jobs) {
    if (!existsSync(job.src)) { failed++; console.log(`✗ ${job.id}: ${shown(job.src)} is missing`); continue; }
    try {
      const info = await buildOne(sharp, job);
      console.log(`✓ ${job.id} → ${shown(job.dst)} (${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB)`);
    } catch (e) {
      failed++;
      console.log(`✗ ${job.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const map = await buildSiteArtMap(sharp, opts.publicDir, opts.blurOut);
  console.log(`placeholder map ${shown(opts.blurOut)}: ${map.count} pictures${map.wrote ? '' : ' — already up to date'}`);
  console.log(`built ${jobs.length - failed} · skipped ${refused.length} · failed ${failed}`);
  process.exit(failed || refused.length ? 2 : 0);
}

// Runs only as a script, never when a test imports the helpers above.
if (typeof process !== 'undefined' && /build-site-art\.mjs$/.test(process.argv[1] || '')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
