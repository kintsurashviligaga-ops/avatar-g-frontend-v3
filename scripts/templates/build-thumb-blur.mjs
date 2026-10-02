#!/usr/bin/env node
/**
 * scripts/templates/build-thumb-blur.mjs — the template gallery's placeholders. For every template thumbnail it writes
 * one entry into lib/studio/templateThumbs.generated.ts:
 *   · `v`    — the first 10 hex of the file's SHA-256. The gallery requests `<path>?v=<v>`, so a replaced picture is a NEW
 *              URL: the year-long immutable cache on versioned thumbnails (next.config.js) can never serve the old one.
 *   · `blur` — the picture shrunk to ≤ 16 px on its long side, as a WebP data URL, for next/image's placeholder="blur".
 *
 * WHICH PICTURES: every `thumb: '/…'` in lib/studio/templates.ts (the avatar cards point at /avatars/preset-*.jpg) PLUS
 * every image under public/templates/ — so a picture that build-thumbs.mjs just wrote is picked up on the next run even
 * before its card's `thumb:` line points at it. build-thumbs.mjs runs this after every build into public/templates.
 *
 * Deterministic and re-runnable: same files in → byte-identical module out (sorted keys, fixed encoder settings), and
 * the file is rewritten only when its content changes. Offline and free: sharp only (a devDependency), no network.
 *
 * Usage (from the repo root):
 *   node scripts/templates/build-thumb-blur.mjs            # (re)write the map
 *   node scripts/templates/build-thumb-blur.mjs --check    # exit 2 if the committed map is stale; writes nothing
 *   … --root <dir> --templates <file> --out <file>         # e.g. a fixture
 *
 * Exit codes: 0 written / up to date · 1 configuration error (no sharp) · 2 stale (--check) or an image failed to read.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/** The long side of a placeholder. next/image's own static-import placeholders are 8 px; 16 keeps a hint of shape. */
export const BLUR_SIZE = 16;
/** First hex chars of the SHA-256 kept as the cache-busting version — change detection, not security. */
export const VERSION_LENGTH = 10;
/** A thumbnail path as the site serves it: under public/, an image extension, nothing that climbs out. */
const PUBLIC_IMAGE_RE = /^\/[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_.-]*)*\.(?:jpe?g|png|webp|avif)$/i;
/** `thumb: '/…'` in lib/studio/templates.ts (a quoted site path; `null` and remote URLs are not ours to version). */
const THUMB_LINE_RE = /\bthumb:\s*'(\/[^'\n]{1,200})'/g;

const GENERATED = 'lib/studio/templateThumbs.generated.ts';

export function parseBlurArgs(argv, root = process.cwd()) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const base = resolve(root, arg('--root') ?? '.');
  return {
    root: base,
    publicDir: join(base, 'public'),
    templates: resolve(base, arg('--templates') ?? 'lib/studio/templates.ts'),
    // The Interior designer's and the Photographer's cards (lib/studio/templates.interior.ts / .photoshoot.ts).
    extraTemplates: [resolve(base, 'lib/studio/templates.interior.ts'), resolve(base, 'lib/studio/templates.photoshoot.ts')],
    out: resolve(base, arg('--out') ?? GENERATED),
    check: argv.includes('--check'),
  };
}

/** A path as the operator reads it: repo-relative inside the repo, absolute outside (a fixture in a temp dir). */
const shown = (p) => {
  const r = relative(process.cwd(), p);
  return !r || r.startsWith('..') ? p : r;
};

/** Every image file under `dir` (recursive), as site paths relative to `publicDir`. Missing dir → none. */
function imagesUnder(dir, publicDir) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...imagesUnder(full, publicDir));
    else if (/\.(?:jpe?g|png|webp|avif)$/i.test(entry.name)) found.push(`/${relative(publicDir, full).split(sep).join('/')}`);
  }
  return found;
}

/**
 * The pictures the map covers, sorted: `paths` exist under public/; `missing` are `thumb:` lines whose file does not
 * (lib/studio/templates.test.ts fails on those); `refused` are paths that are not plain public image paths.
 */
export function collectThumbPaths({ publicDir, templatesSource }) {
  const fromCards = [...templatesSource.matchAll(THUMB_LINE_RE)].map((m) => m[1]);
  const fromDisk = imagesUnder(join(publicDir, 'templates'), publicDir);
  const paths = [];
  const missing = [];
  const refused = [];
  const root = resolve(publicDir) + sep;
  for (const p of [...new Set([...fromCards, ...fromDisk])].sort()) {
    if (!PUBLIC_IMAGE_RE.test(p) || p.includes('..') || !resolve(publicDir, `.${p}`).startsWith(root)) { refused.push(p); continue; }
    (existsSync(resolve(publicDir, `.${p}`)) ? paths : missing).push(p);
  }
  return { paths, missing, refused };
}

/** The file's version: the first VERSION_LENGTH hex of its SHA-256. */
export const thumbVersion = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, VERSION_LENGTH);

/** One picture → `{ v, blur }`. Flattened onto black like the card art (build-thumbs.mjs), EXIF-rotated, ≤ 16 px. */
export async function thumbMeta(sharp, bytes) {
  const tiny = await sharp(bytes, { failOn: 'error' })
    .rotate()
    .flatten({ background: '#000000' })
    .resize(BLUR_SIZE, BLUR_SIZE, { fit: 'inside' })
    .webp({ quality: 60, effort: 6 })
    .toBuffer();
  return { v: thumbVersion(bytes), blur: `data:image/webp;base64,${tiny.toString('base64')}` };
}

/** The generated module's text — sorted, one entry per line, so a diff shows exactly which picture changed. */
export function renderBlurModule(entries) {
  const lines = Object.keys(entries).sort().map((p) => `  '${p}': { v: '${entries[p].v}', blur: '${entries[p].blur}' },`);
  return [
    '// GENERATED by scripts/templates/build-thumb-blur.mjs — do not edit by hand. Re-run it whenever a template thumbnail',
    '// is added or replaced (`node scripts/templates/build-thumb-blur.mjs`; build-thumbs.mjs runs it after every build).',
    '// `v` = the first 10 hex of the file\'s SHA-256 (the gallery requests `<path>?v=<v>`); `blur` = a ≤ 16 px WebP of it',
    '// for next/image\'s placeholder="blur". lib/studio/templateThumbs.test.ts fails when an entry is stale or missing.',
    'export const TEMPLATE_THUMB_META: Readonly<Record<string, { readonly v: string; readonly blur: string }>> = {',
    ...lines,
    '};',
    '',
  ].join('\n');
}

/** The entries a module text holds (for the change summary). Tolerates a missing or hand-broken file → {}. */
export function parseBlurModule(text) {
  const out = {};
  for (const m of String(text ?? '').matchAll(/^ {2}'([^']+)': \{ v: '([0-9a-f]+)', blur: '([^']+)' \},$/gm)) out[m[1]] = { v: m[2], blur: m[3] };
  return out;
}

/**
 * Builds the map. Writes `opts.out` only when its text changes (and never with `opts.check`). Returns the summary:
 * what was added / changed / removed against the existing file, what failed to read, and whether it is (now) current.
 */
export async function buildBlurMap(opts, sharp) {
  const templatesSource = [opts.templates, ...(opts.extraTemplates ?? [])]
    .map((f) => (existsSync(f) ? readFileSync(f, 'utf8') : ''))
    .join('\n');
  const { paths, missing, refused } = collectThumbPaths({ publicDir: opts.publicDir, templatesSource });
  const entries = {};
  const failed = [];
  for (const p of paths) {
    try {
      entries[p] = await thumbMeta(sharp, readFileSync(resolve(opts.publicDir, `.${p}`)));
    } catch (e) {
      failed.push({ path: p, why: e instanceof Error ? e.message : String(e) });
    }
  }
  const text = renderBlurModule(entries);
  const before = existsSync(opts.out) ? readFileSync(opts.out, 'utf8') : '';
  const old = parseBlurModule(before);
  const added = Object.keys(entries).filter((p) => !old[p]);
  const changed = Object.keys(entries).filter((p) => old[p] && (old[p].v !== entries[p].v || old[p].blur !== entries[p].blur));
  const removed = Object.keys(old).filter((p) => !entries[p]);
  const current = before === text;
  if (!current && !opts.check && !failed.length) writeFileSync(opts.out, text);
  return { entries, text, added, changed, removed, missing, refused, failed, current, wrote: !current && !opts.check && !failed.length };
}

/** sharp, if it resolves — `null` otherwise (the caller says so; nothing is installed). */
export async function loadSharp() {
  try {
    const mod = await import('sharp');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

/** One line for the operator: where the map is and what moved. */
export function formatBlurSummary(r, out) {
  const n = Object.keys(r.entries).length;
  const delta = `+${r.added.length} new · ~${r.changed.length} changed · -${r.removed.length} removed`;
  const lines = [`blur map ${shown(out)}: ${n} picture${n === 1 ? '' : 's'} (${delta})${r.current ? ' — already up to date' : ''}`];
  for (const p of r.missing) lines.push(`  ! ${p}: a card's thumb: points here but the file is missing`);
  for (const p of r.refused) lines.push(`  ✗ ${p}: not a plain public image path — skipped`);
  for (const f of r.failed) lines.push(`  ✗ ${f.path}: ${f.why}`);
  return lines;
}

async function main() {
  const opts = parseBlurArgs(process.argv.slice(2));
  const sharp = await loadSharp();
  if (!sharp) {
    console.error('sharp does not resolve from node_modules — nothing built (this script installs nothing)');
    process.exit(1);
  }
  const r = await buildBlurMap(opts, sharp);
  for (const line of formatBlurSummary(r, opts.out)) console.log(line);
  if (opts.check && !r.current) console.log(`stale — run: node scripts/templates/build-thumb-blur.mjs`);
  process.exit(r.failed.length || (opts.check && !r.current) ? 2 : 0);
}

// Runs only as a script, never when a test (or build-thumbs.mjs) imports the helpers above.
if (typeof process !== 'undefined' && /build-thumb-blur\.mjs$/.test(process.argv[1] || '')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
