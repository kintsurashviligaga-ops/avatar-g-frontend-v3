#!/usr/bin/env node
/**
 * scripts/templates/build-thumbs.mjs — the template gallery's finals. Every SELECTED take of the `templates` art pack
 * (scripts/templates/manifest.json → raw/<tool>/<id>-<attempt>-<n>.<ext>, chosen with `art:templates -- --select`) is
 * cover-resized to the card's 600×800 and written to public/templates/<tool>/<id>.jpg. Then it prints the `thumb:`
 * lines of lib/studio/templates.ts to change.
 *
 * ⚠️ It PRINTS those lines and edits nothing: a card points at its picture only after someone has looked at the
 * built file, and lib/studio/templates.test.ts refuses a `thumb` whose file is missing.
 *
 * Offline and free: no provider, no network. sharp is used only if it resolves from node_modules (it is a
 * devDependency); nothing is installed.
 *
 * After a build it refreshes the gallery's blur/version map (build-thumb-blur.mjs → lib/studio/templateThumbs.generated
 * .ts) — a derived file like the JPEGs themselves, so a new picture never ships without its placeholder and its
 * cache-busting version. Only for a build into a `…/templates` folder under a public/ root: the default, or `--out` +
 * `--blur-out` together (a fixture).
 *
 * Usage (from the repo root):
 *   node scripts/templates/build-thumbs.mjs
 *   node scripts/templates/build-thumbs.mjs --manifest <file> --out <dir> --templates <file>   # e.g. a fixture
 * `--work` (where raw/ lives) defaults to the manifest's folder; `--out` to public/templates.
 *
 * Exit codes: 0 every selected take was built · 1 configuration error (no sharp, no manifest) · 2 a take failed.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { buildBlurMap, formatBlurSummary } from './build-thumb-blur.mjs';

export const THUMB_WIDTH = 600;
export const THUMB_HEIGHT = 800;
/** A template card's id: `<tool>/<id>`, lowercase — the manifest key and the file path under public/templates/. */
const TEMPLATE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}\/[a-z0-9][a-z0-9-]{0,63}$/;
/** How far below a card's `tool:, id:` line its `thumb:` may sit (the card objects are a few lines long). */
const THUMB_LOOKAHEAD = 12;

export function parseThumbArgs(argv, root = process.cwd()) {
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const manifest = resolve(root, arg('--manifest') ?? 'scripts/templates/manifest.json');
  const out = resolve(root, arg('--out') ?? 'public/templates');
  const blurOut = arg('--blur-out');
  return {
    manifest,
    work: resolve(root, arg('--work') ?? dirname(manifest)),
    out,
    templates: resolve(root, arg('--templates') ?? 'lib/studio/templates.ts'),
    // The real map only for the real folder: a fixture build (`--out` alone) must never rewrite the committed module.
    blurOut: blurOut ? resolve(root, blurOut)
      : out === resolve(root, 'public/templates') ? resolve(root, 'lib/studio/templateThumbs.generated.ts') : null,
  };
}

/**
 * The blur map's options for a build, or null when there is none to refresh: the map's keys are site paths
 * (`/templates/…`), so the thumbnails must land in a folder named `templates` whose parent is the public root.
 */
export function blurMapOptsFor(opts) {
  if (!opts.blurOut || basename(opts.out) !== 'templates') return null;
  return { publicDir: dirname(opts.out), templates: opts.templates, out: opts.blurOut, check: false };
}

/** A path as the operator reads it: repo-relative inside the repo, absolute outside (a fixture in a temp dir). */
const shown = (p) => {
  const r = relative(process.cwd(), p);
  return !r || r.startsWith('..') ? p : r;
};

/** The card's public path, as lib/studio/templates.ts spells it (public/ is the site root). */
export const publicThumbPath = (id) => `/templates/${id}.jpg`;

/**
 * The selected takes as build jobs. A take is refused (never read, never written) when its id is not a template id or
 * its file is not inside <work>/raw/ — the manifest is a file on disk, so a path in it is checked like any input.
 */
export function thumbJobs(manifest, work, out) {
  const raw = resolve(work, 'raw') + sep;
  const jobs = [];
  const refused = [];
  for (const [id, pick] of Object.entries(manifest?.selected ?? {})) {
    if (!TEMPLATE_ID_RE.test(id)) { refused.push({ id, why: 'not a template id (<tool>/<id>)' }); continue; }
    const file = typeof pick?.file === 'string' ? pick.file : '';
    const src = resolve(work, file);
    if (!file || !src.startsWith(raw)) { refused.push({ id, why: `its file ${JSON.stringify(file)} is not under raw/` }); continue; }
    jobs.push({ id, src, dst: join(out, `${id}.jpg`), publicPath: publicThumbPath(id) });
  }
  return { jobs, refused };
}

/**
 * For each id, the `thumb:` line of its card in lib/studio/templates.ts: where it is, what it says, what it should say.
 * `state`: change | already (it already points there) | missing (no card, or no thumb line in reach).
 */
export function thumbLineChanges(source, ids) {
  const lines = source.split('\n');
  return ids.map((id) => {
    const [tool, name] = id.split('/');
    const head = lines.findIndex((l) => l.includes(`tool: '${tool}', id: '${name}',`));
    if (head < 0) return { id, state: 'missing', line: null, before: null, after: null };
    for (let j = head; j < Math.min(lines.length, head + THUMB_LOOKAHEAD); j++) {
      if (j > head && lines[j].includes('tool: \'')) break; // the next card
      if (!/^\s*thumb: /.test(lines[j])) continue;
      const before = lines[j];
      const after = before.replace(/thumb: (?:null|'[^'\n]{0,200}')/, `thumb: '${publicThumbPath(id)}'`);
      return { id, state: before === after ? 'already' : 'change', line: j + 1, before, after };
    }
    return { id, state: 'missing', line: null, before: null, after: null };
  });
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

/** One take → a 600×800 JPEG: cover-resized from the centre, flattened onto true black, metadata stripped. */
export async function buildThumb(sharp, src, dst) {
  mkdirSync(dirname(dst), { recursive: true });
  const info = await sharp(src, { failOn: 'error' })
    .rotate()
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover', position: 'centre' })
    .flatten({ background: '#000000' })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toFile(dst);
  if (info.width !== THUMB_WIDTH || info.height !== THUMB_HEIGHT) throw new Error(`came out ${info.width}×${info.height}`);
  return info;
}

/** Builds every selected take. Returns what was built, refused and failed, and the `thumb:` lines to change. */
export async function buildThumbs(opts, sharp, log = console.log) {
  const manifest = JSON.parse(readFileSync(opts.manifest, 'utf8'));
  const { jobs, refused } = thumbJobs(manifest, opts.work, opts.out);
  for (const r of refused) log(`✗ ${r.id}: skipped — ${r.why}`);
  const built = [];
  const failed = [];
  for (const job of jobs) {
    if (!existsSync(job.src)) { failed.push({ id: job.id, why: 'the selected file is missing' }); log(`✗ ${job.id}: ${shown(job.src)} is missing`); continue; }
    try {
      const info = await buildThumb(sharp, job.src, job.dst);
      built.push(job);
      log(`✓ ${job.id} → ${shown(job.dst)} (${info.width}×${info.height}, ${Math.round(info.size / 1024)} KB)`);
    } catch (e) {
      failed.push({ id: job.id, why: e instanceof Error ? e.message : String(e) });
      log(`✗ ${job.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const changes = existsSync(opts.templates) ? thumbLineChanges(readFileSync(opts.templates, 'utf8'), built.map((b) => b.id)) : [];
  return { built, refused, failed, changes };
}

/** The `thumb:` lines to change, printed as a reviewable diff (file:line, then − / +). */
export function formatChanges(changes, templatesPath) {
  const where = shown(templatesPath);
  const out = [];
  const todo = changes.filter((c) => c.state === 'change');
  if (todo.length) out.push(`thumb: lines to change in ${where} (${todo.length}):`);
  for (const c of todo) out.push(`${where}:${c.line}  ${c.id}`, `  - ${c.before.trim()}`, `  + ${c.after.trim()}`);
  for (const c of changes.filter((x) => x.state === 'already')) out.push(`${where}:${c.line}  ${c.id} already points at ${publicThumbPath(c.id)}`);
  for (const c of changes.filter((x) => x.state === 'missing')) out.push(`${c.id}: no card with a thumb: line found in ${where} — set it by hand`);
  return out;
}

async function main() {
  const opts = parseThumbArgs(process.argv.slice(2));
  if (!existsSync(opts.manifest)) {
    console.error(`no manifest at ${shown(opts.manifest)} — run the art pack and --select the takes first`);
    process.exit(1);
  }
  const sharp = await loadSharp();
  if (!sharp) {
    console.error('sharp does not resolve from node_modules — nothing built (this script installs nothing)');
    process.exit(1);
  }
  const r = await buildThumbs(opts, sharp);
  if (!r.built.length && !r.failed.length) console.log('nothing selected yet — pick takes with `npm run art:templates -- --select <id>:<attempt> --output <n>`');
  for (const line of formatChanges(r.changes, opts.templates)) console.log(line);
  console.log(`built ${r.built.length} · skipped ${r.refused.length} · failed ${r.failed.length}`);
  const blurOpts = blurMapOptsFor(opts);
  const blur = blurOpts ? await buildBlurMap(blurOpts, sharp) : null;
  if (blur) for (const line of formatBlurSummary(blur, blurOpts.out)) console.log(line);
  process.exit(r.failed.length || r.refused.length || blur?.failed.length ? 2 : 0);
}

// Runs only as a script, never when a test imports the helpers above.
if (typeof process !== 'undefined' && /build-thumbs\.mjs$/.test(process.argv[1] || '')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
