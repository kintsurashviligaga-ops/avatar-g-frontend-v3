#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Move legacy Live-Avatar VOICE SAMPLES out of the PUBLIC `avatars` bucket into the PRIVATE twin bucket.
 *
 *   node scripts/avatar/migrate-live-avatar-voice.mjs          # DRY RUN (default) — lists avatars/live-avatars/<uid>/voice.*
 *   node scripts/avatar/migrate-live-avatar-voice.mjs --yes    # copy → verify → delete the public copy, one file at a time
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY, from the environment or .env.local
 * in the current directory. Run it from the repo root. The OWNER runs this against prod — it is never run by CI.
 *
 * Why: until Wave 1, lib/avatar/enroll.ts wrote every enrollment voice sample (a voiceprint) to
 * `avatars/live-avatars/<uid>/voice.<ext>` — a PUBLIC bucket, so anyone with the URL could fetch it. New writes now
 * go to the dedicated PRIVATE `twins` bucket at `twins/<uid>/voice.<ext>` — NOT `uploads`, whose bare paths many
 * routes sign for any signed-in caller (see lib/avatar/twinStorage.ts). Nothing reads either path, so moving them
 * breaks nothing. The poster (`poster.jpg`) in the same folder is NOT touched: the Live orb still reads it publicly
 * until Wave 3.
 *
 * ⚠️ ORDER IS THE SAFETY: copy, then VERIFY the private object (exists, same size), and only then delete the public
 * one. Any miss leaves the public file where it is and is reported — a re-run picks it up. supabase-js storage
 * RETURNS `{ error }` and never throws, so every call's error is read, not caught.
 * ⚠️ ONE SAMPLE PER USER: if `twins/<uid>/voice.*` already holds a sample (any extension — a newer enrollment since
 * the Wave 1 deploy, an earlier run, or the newer of two legacy files, which is processed first), the copy is skipped
 * and only the public file is deleted — a stale voiceprint is never carried over next to the current one.
 * ⚠️ `--yes` creates the `twins` bucket (private) if it is missing, then refuses to run unless it reports
 * `public: false` — a voiceprint must never be "moved" into another public bucket.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const LEGACY_BUCKET = 'avatars';
export const LEGACY_PREFIX = 'live-avatars';
/** Must match TWIN_PRIVATE_BUCKET / twinVoicePath in lib/avatar/twinStorage.ts (a test pins them equal). */
export const PRIVATE_BUCKET = 'twins';
export const twinVoicePath = (uid, ext) => `twins/${uid}/voice.${ext}`;

const PAGE = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VOICE_RE = /^voice\.([a-z0-9]{2,5})$/i;
const EXT_MIME = { webm: 'audio/webm', m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav' };

/** Every entry under `prefix`, across pages. Throws (with the storage message) on a list error. */
async function listAll(bucket, prefix) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** Newest first (updated_at, then created_at); entries without a timestamp sort last. */
const stamp = (e) => String(e.updated_at || e.created_at || '');
const newestFirst = (a, b) => stamp(b).localeCompare(stamp(a));

/**
 * Find every legacy public voice sample. Read-only. Folders that are not a user id and files that are not
 * `voice.<ext>` (the poster, anything else) are ignored. Within one user the NEWEST sample comes first, so a
 * user who enrolled from two browsers (voice.webm + voice.m4a) has the current one copied and the stale one
 * only deleted (see moveVoice).
 * @returns {Promise<Array<{ uid: string, ext: string, from: string, to: string, size: number | null, mimetype: string }>>}
 */
export async function findLegacyVoices(sb) {
  const legacy = sb.storage.from(LEGACY_BUCKET);
  const folders = (await listAll(legacy, LEGACY_PREFIX)).filter((e) => !e.id && UUID_RE.test(e.name));
  const items = [];
  for (const folder of folders) {
    const uid = folder.name;
    for (const f of (await listAll(legacy, `${LEGACY_PREFIX}/${uid}`)).sort(newestFirst)) {
      const m = f.id ? VOICE_RE.exec(f.name) : null;
      if (!m) continue;
      const ext = m[1].toLowerCase();
      const size = typeof f.metadata?.size === 'number' ? f.metadata.size : null;
      const mimetype = f.metadata?.mimetype || EXT_MIME[ext] || 'application/octet-stream';
      items.push({ uid, ext, from: `${LEGACY_PREFIX}/${uid}/${f.name}`, to: twinVoicePath(uid, ext), size, mimetype });
    }
  }
  return items;
}

const isAlreadyExists = (error) =>
  !!error && (String(error.statusCode) === '409' || error.status === 409 || /already exists|duplicate/i.test(error.message ?? ''));

/**
 * Make sure the target bucket exists — creating it PRIVATE when missing (the app self-provisions it on the first
 * enrollment too, but this may run first) — and refuse unless it then says it is private.
 */
export async function ensurePrivateTarget(sb) {
  let { data, error } = await sb.storage.getBucket(PRIVATE_BUCKET);
  if (error || !data) {
    const { error: mkErr } = await sb.storage.createBucket(PRIVATE_BUCKET, { public: false });
    if (mkErr && !isAlreadyExists(mkErr)) throw new Error(`target bucket "${PRIVATE_BUCKET}" missing and could not be created: ${mkErr.message}`);
    ({ data, error } = await sb.storage.getBucket(PRIVATE_BUCKET));
    if (error || !data) throw new Error(`target bucket "${PRIVATE_BUCKET}" unreadable: ${error?.message ?? 'not found'}`);
  }
  if (data.public !== false) throw new Error(`target bucket "${PRIVATE_BUCKET}" is PUBLIC — refusing to move voiceprints into it`);
}

/** Every private voice sample of this user (`twins/<uid>/voice.*`, any extension). */
async function privateVoices(sb, uid) {
  const { data, error } = await sb.storage.from(PRIVATE_BUCKET).list(`twins/${uid}`, { limit: 100 });
  if (error) throw new Error(`private list: ${error.message}`);
  return (data ?? []).filter((e) => !!e.id && VOICE_RE.test(e.name));
}

/**
 * Move ONE sample: copy → verify → delete the public copy.
 * - If the user ALREADY has a private sample of ANY extension (a newer enrollment since the Wave 1 deploy, an earlier
 *   run, or the newer legacy file processed just before this one), the copy is SKIPPED — that sample is the current
 *   one — and only the public copy is removed. One voiceprint per user, never a stale sibling.
 * - Upload is `upsert: false`: a private copy that appears between that check and the upload is likewise kept.
 * @returns {Promise<{ status: 'moved' | 'already-private' | 'failed', reason?: string }>}
 */
export async function moveVoice(sb, item) {
  try {
    const legacy = sb.storage.from(LEGACY_BUCKET);
    if ((await privateVoices(sb, item.uid)).length) {
      const { error: rmErr } = await legacy.remove([item.from]);
      if (rmErr) return { status: 'failed', reason: `delete public copy: ${rmErr.message} (a private sample is in place)` };
      return { status: 'already-private' };
    }
    const { data: blob, error: dlErr } = await legacy.download(item.from);
    if (dlErr || !blob) return { status: 'failed', reason: `download: ${dlErr?.message ?? 'empty'}` };
    // ⚠️ Re-upload as a Buffer, not the Blob: storage-js sends a Blob as multipart and IGNORES `contentType`.
    const buf = Buffer.from(await blob.arrayBuffer());
    const bytes = buf.byteLength;

    const { error: upErr } = await sb.storage
      .from(PRIVATE_BUCKET)
      .upload(item.to, buf, { contentType: item.mimetype, upsert: false });
    const already = isAlreadyExists(upErr);
    if (upErr && !already) return { status: 'failed', reason: `upload: ${upErr.message}` };

    const entry = (await privateVoices(sb, item.uid)).find((e) => e.name === `voice.${item.ext}`) ?? null;
    if (!entry) return { status: 'failed', reason: 'verify: private copy not found after upload' };
    const privSize = typeof entry.metadata?.size === 'number' ? entry.metadata.size : null;
    if (!already && privSize !== null && privSize !== bytes) {
      return { status: 'failed', reason: `verify: size mismatch (public ${bytes} B, private ${privSize} B)` };
    }

    const { error: rmErr } = await legacy.remove([item.from]);
    if (rmErr) return { status: 'failed', reason: `delete public copy: ${rmErr.message} (private copy is in place)` };
    return { status: already ? 'already-private' : 'moved' };
  } catch (e) {
    return { status: 'failed', reason: e instanceof Error ? e.message : String(e) };
  }
}

const kb = (n) => (n === null ? '?' : `${(n / 1024).toFixed(1)} KB`);

/** List (default) or, with `yes`, move. Returns a summary; never exits the process itself. */
export async function run(sb, { yes = false, log = console.log } = {}) {
  const items = await findLegacyVoices(sb);
  log(`${items.length} public voice sample(s) in ${LEGACY_BUCKET}/${LEGACY_PREFIX}/${yes ? '' : '  (DRY RUN — nothing is changed)'}`);
  for (const it of items) log(`  ${it.from}  ${kb(it.size)}  ${it.mimetype}  → ${PRIVATE_BUCKET}/${it.to}`);
  const summary = { found: items.length, moved: 0, alreadyPrivate: 0, failed: 0, failures: [] };
  if (!yes) {
    if (items.length) log('Re-run with --yes to move them (copy → verify → delete the public copy).');
    return summary;
  }
  if (!items.length) return summary;

  await ensurePrivateTarget(sb);
  for (const it of items) {
    const r = await moveVoice(sb, it);
    if (r.status === 'moved') summary.moved++;
    else if (r.status === 'already-private') summary.alreadyPrivate++;
    else {
      summary.failed++;
      summary.failures.push({ from: it.from, reason: r.reason });
    }
    log(`  ${r.status.padEnd(15)} ${it.from}${r.reason ? `  — ${r.reason}` : ''}`);
  }
  log(`moved ${summary.moved}, already private ${summary.alreadyPrivate}, failed ${summary.failed} (failed ones are still public — re-run).`);
  return summary;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function loadEnvLocal() {
  const file = resolve(process.cwd(), '.env.local');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--yes');
  if (unknown.length) {
    console.error(`unknown argument(s): ${unknown.join(' ')}\nusage: node scripts/avatar/migrate-live-avatar-voice.mjs [--yes]`);
    process.exit(2);
  }
  loadEnvLocal();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    console.error('migrate-live-avatar-voice: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(2);
  }
  // Imported here, not at the top, so the exported helpers load without the Supabase client (jest).
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const summary = await run(sb, { yes: args.includes('--yes') });
  process.exit(summary.failed ? 1 : 0);
}

// Run only as a CLI (not when jest imports the helpers). No import.meta — the jest transform is CommonJS.
if (/migrate-live-avatar-voice\.mjs$/.test(process.argv[1] ?? '')) {
  main().catch((e) => {
    console.error(`migrate-live-avatar-voice: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
