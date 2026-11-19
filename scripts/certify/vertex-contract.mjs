#!/usr/bin/env node
/**
 * scripts/certify/vertex-contract.mjs — the v3.1 paid certification run: ONE contract call per uncertified model on the
 * Production Vertex project, inside the owner's cap (GG's card 2026-11-05 20:15Z, "სერტიფიკაცია $5": one paid call per
 * model, $5 at most in total). docs/master-v3.1/CAPABILITY_MATRIX.md "How a row becomes verified".
 *
 * What it sends is scripts/certify/vertex-contract-plan.json, and __tests__/contracts/vertex/plan.contract.test.ts
 * proves each body there is byte-for-byte what our adapter builds for the same input. So the recorded answer is the
 * answer our code would get.
 *
 * Rules this file holds (MASTER TASK v3.1):
 *  · never a second billed call: no retry of any kind, and a ledger (out/ledger.json) written BEFORE each billed call.
 *    A second run refuses while the ledger exists; `--resume` sends only the calls the ledger has never sent.
 *  · the cap: the plan's estimates must sum to no more than its capUsd (at most $5), checked before the first call.
 *  · Vertex and Google Cloud hosts only (aiplatform, texttospeech, speech); never the Gemini Developer API.
 *  · no credential is created, stored or printed: the bearer comes from `gcloud auth print-access-token` (the identity
 *    already signed in on the machine), lives in memory, and is never written to a file or a log line.
 *  · fixtures are sanitized: media bytes become {bytes, sha256}; the project id becomes {project}.
 *  · a plan may name `inputs`: a file already on disk (a recording from an earlier run), pinned by its sha256 and read
 *    relative to the plan file, usable as "{{<input id>.base64}}". A missing or changed file stops the run before any call.
 *
 *   node vertex-contract.mjs --project <id> [--plan <file>] [--out <dir>] --dry-run
 *   node vertex-contract.mjs --project <id> [--plan <file>] [--out <dir>] --confirm paid-certification [--resume]
 *
 * Output: <out>/fixtures/<call id>/{request,response,meta}.json, <out>/media/<call id>.<ext> (not for the repo),
 * <out>/summary.json and <out>/ledger.json.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const CONFIRM_WORD = 'paid-certification';
/** The owner's cap for the whole run (GG card 2026-11-05 20:15Z). A plan may ask for less, never more. */
export const OWNER_CAP_USD = 5;
const PROJECT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const ALLOWED_HOSTS = [
  /^aiplatform\.googleapis\.com$/,
  /^[a-z0-9-]+-aiplatform\.googleapis\.com$/,
  /^texttospeech\.googleapis\.com$/,
  /^[a-z0-9-]+-speech\.googleapis\.com$/,
];
const CALL_TIMEOUT_MS = 180_000;
const POLL_EVERY_MS = 15_000;
const POLL_FOR_MS = 12 * 60_000;
/** A string this long that is all base64 is media, not text. */
const MEDIA_MIN_CHARS = 512;
const BASE64_RE = /^[A-Za-z0-9+/_-]+={0,2}$/;

// ── arguments and plan ───────────────────────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  // The plan beside this script (no import.meta here: jest loads this file as CommonJS).
  const here = dirname(resolve(process.argv[1] || '.'));
  const out = { plan: join(here, 'vertex-contract-plan.json'), out: resolve('vertex-certify-out'), dryRun: false, resume: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--project') out.project = next();
    else if (a === '--plan') out.plan = resolve(next());
    else if (a === '--out') out.out = resolve(next());
    else if (a === '--confirm') out.confirm = next();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--resume') out.resume = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.project || !PROJECT_RE.test(out.project)) throw new Error('--project <Google Cloud project id> is required');
  if (!out.dryRun && out.confirm !== CONFIRM_WORD) throw new Error(`a paid run needs --confirm ${CONFIRM_WORD} (or use --dry-run)`);
  return out;
}

function hostAllowed(url) {
  let u;
  try {
    u = new URL(url.replace('{project}', 'p'));
  } catch {
    return false;
  }
  return u.protocol === 'https:' && !u.username && !u.password && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
}

/** The plan, or a thrown Error naming what is wrong. Nothing is sent for a plan that fails here. */
export function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.calls) || plan.calls.length === 0) throw new Error('plan has no calls');
  const cap = Number(plan.capUsd);
  if (!Number.isFinite(cap) || cap <= 0 || cap > OWNER_CAP_USD) throw new Error(`plan capUsd must be > 0 and ≤ ${OWNER_CAP_USD}`);
  const ids = new Set();
  for (const [id, input] of Object.entries(plan.inputs ?? {})) {
    if (!/^[a-z0-9][a-z0-9.-]{1,60}$/.test(id)) throw new Error('every input needs an id (a-z 0-9 . -)');
    if (!input || typeof input.file !== 'string' || !SAFE_INPUT_RE.test(input.file) || input.file.split('/').some((seg) => seg === '..' || seg === '.')) {
      throw new Error(`input ${id}: file must be a plain relative path inside the plan's folder`);
    }
    if (typeof input.mimeType !== 'string' || !/^[a-z]+\/[a-z0-9.+-]+$/.test(input.mimeType)) throw new Error(`input ${id}: mimeType is required`);
    if (typeof input.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(input.sha256)) throw new Error(`input ${id}: sha256 is required`);
    ids.add(id);
  }
  let total = 0;
  for (const c of plan.calls) {
    if (!c || typeof c.id !== 'string' || !/^[a-z0-9][a-z0-9.-]{1,60}$/.test(c.id)) throw new Error('every call needs an id (a-z 0-9 . -)');
    if (ids.has(c.id)) throw new Error(`duplicate call id ${c.id}`);
    ids.add(c.id);
    if (!['sync', 'lro', 'get'].includes(c.kind)) throw new Error(`${c.id}: kind must be sync, lro or get`);
    if (typeof c.url !== 'string' || !c.url.includes('{project}') && c.kind !== 'get' && !c.url.startsWith('https://texttospeech.googleapis.com/')) {
      throw new Error(`${c.id}: url must name {project}`);
    }
    if (!hostAllowed(c.url)) throw new Error(`${c.id}: ${c.url} is not a Vertex / Cloud speech host`);
    if (/generativelanguage\.googleapis\.com/.test(c.url)) throw new Error(`${c.id}: the Gemini Developer API is not allowed`);
    const est = Number(c.estimateUsd);
    if (!Number.isFinite(est) || est < 0) throw new Error(`${c.id}: estimateUsd must be a number ≥ 0`);
    if (c.kind === 'get' && est !== 0) throw new Error(`${c.id}: a get is free (estimateUsd 0)`);
    if (c.kind !== 'get' && (c.body === undefined || c.body === null)) throw new Error(`${c.id}: a ${c.kind} call needs a body`);
    for (const dep of c.requires ?? []) {
      if (!ids.has(dep)) throw new Error(`${c.id}: requires ${dep}, which is not an input or an earlier call`);
    }
    total += est;
  }
  total = Math.round(total * 1e6) / 1e6;
  if (total > cap) throw new Error(`the plan's estimates ($${total.toFixed(3)}) exceed its cap ($${cap})`);
  return { total, cap };
}

const SAFE_INPUT_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,200}$/;
const INPUT_MAX_BYTES = 10 * 1024 * 1024;

/** The plan's inputs as refs ({base64, mimeType}) plus their facts, read relative to the plan; throws on any mismatch. */
export function loadInputs(plan, planPath) {
  const refs = {};
  const facts = {};
  for (const [id, input] of Object.entries(plan.inputs ?? {})) {
    const file = join(dirname(resolve(planPath)), input.file);
    if (!existsSync(file)) throw new Error(`input ${id}: ${input.file} is not there (nothing was sent)`);
    const buf = readFileSync(file);
    if (buf.length === 0 || buf.length > INPUT_MAX_BYTES) throw new Error(`input ${id}: ${input.file} is empty or too large`);
    const sha256 = createHash('sha256').update(buf).digest('hex');
    if (sha256 !== input.sha256) throw new Error(`input ${id}: ${input.file} is not the recorded file (sha256 differs; nothing was sent)`);
    refs[id] = { base64: buf.toString('base64'), mimeType: input.mimeType };
    facts[id] = { file: input.file, bytes: buf.length, sha256, mimeType: input.mimeType };
  }
  return { refs, facts };
}

// ── references between calls ─────────────────────────────────────────────────────────────────────────────────────

const REF_RE = /^\{\{([a-z0-9][a-z0-9.-]*)\.([a-zA-Z][a-zA-Z0-9]*)\}\}$/;

/** A deep copy with every "{{id.field}}" string replaced from refs; throws `missing:<id>.<field>` when one is absent. */
export function substitute(value, refs) {
  if (typeof value === 'string') {
    const m = REF_RE.exec(value);
    if (!m) return value;
    const got = refs[m[1]]?.[m[2]];
    if (got === undefined || got === null || got === '') throw new Error(`missing:${m[1]}.${m[2]}`);
    return got;
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, refs));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, refs)]));
  return value;
}

// ── media ────────────────────────────────────────────────────────────────────────────────────────────────────────

function looksBase64(s) {
  return typeof s === 'string' && s.length >= MEDIA_MIN_CHARS && BASE64_RE.test(s.slice(0, 4096)) && BASE64_RE.test(s.slice(-512));
}

/**
 * The media in an answer: every base64 field with the mime type beside it, largest first. Covers Gemini parts
 * (inlineData {mimeType, data}), Cloud TTS (audioContent), Veo (videos[].bytesBase64Encoded) and Lyria.
 */
export function findMedia(json) {
  const found = [];
  const stack = [json];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }
    for (const [k, v] of Object.entries(cur)) {
      if (looksBase64(v)) {
        const mimeType = typeof cur.mimeType === 'string' ? cur.mimeType : typeof cur.mime_type === 'string' ? cur.mime_type : k === 'audioContent' ? 'audio/mpeg' : 'application/octet-stream';
        found.push({ field: k, base64: v, mimeType });
      } else if (v && typeof v === 'object') stack.push(v);
    }
  }
  return found.sort((a, b) => b.base64.length - a.base64.length);
}

/** 16-bit little-endian mono PCM → a WAV file (the same 44-byte header lib/speech/wav wrapPcm16 writes). */
export function wavFromPcm16(pcm, sampleRate, channels = 1) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** `audio/L16;codec=pcm;rate=24000` → 24000; null when the mime is not raw 16-bit PCM with a rate. */
export function pcmRate(mimeType) {
  const m = /^audio\/l16\b.*\brate=(\d{4,6})/i.exec(String(mimeType ?? ''));
  return m ? Number(m[1]) : null;
}

/** Duration and size facts of a media file, from its own headers (no ffprobe). Unknown formats give bytes only. */
export function mediaFacts(buf, mimeType) {
  const facts = { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), mimeType };
  try {
    if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') {
      facts.width = buf.readUInt32BE(16);
      facts.height = buf.readUInt32BE(20);
    } else if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      Object.assign(facts, jpegSize(buf));
    } else if (buf.length > 44 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
      const rate = buf.readUInt32LE(24);
      const byteRate = buf.readUInt32LE(28);
      facts.sampleRate = rate;
      facts.durationSec = byteRate ? round3((buf.length - 44) / byteRate) : undefined;
    } else if (buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
      Object.assign(facts, mp4Facts(buf));
    } else if (/mpeg|mp3/i.test(mimeType) || (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
      Object.assign(facts, mp3Facts(buf));
    }
  } catch {
    /* facts stay at bytes and sha256 */
  }
  return facts;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return {};
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return {};
}

/** MP4: duration from mvhd, the first video track's size from tkhd, and whether a sound track (smhd) exists. */
export function mp4Facts(buf) {
  const facts = {};
  const walk = (start, end, depth) => {
    let i = start;
    while (i + 8 <= end) {
      let size = buf.readUInt32BE(i);
      const type = buf.toString('ascii', i + 4, i + 8);
      let head = 8;
      if (size === 1) {
        size = Number(buf.readBigUInt64BE(i + 8));
        head = 16;
      } else if (size === 0) size = end - i;
      if (size < head || i + size > end) return;
      const body = i + head;
      if (type === 'mvhd') {
        const v = buf[body];
        const scale = v === 1 ? buf.readUInt32BE(body + 20) : buf.readUInt32BE(body + 12);
        const dur = v === 1 ? Number(buf.readBigUInt64BE(body + 24)) : buf.readUInt32BE(body + 16);
        if (scale) facts.durationSec = round3(dur / scale);
      } else if (type === 'tkhd') {
        const v = buf[body];
        const off = body + (v === 1 ? 88 : 76);
        const w = buf.readUInt32BE(off) / 65536;
        const h = buf.readUInt32BE(off + 4) / 65536;
        if (w && h && facts.width === undefined) {
          facts.width = w;
          facts.height = h;
        }
      } else if (type === 'smhd') facts.hasAudioTrack = true;
      else if (type === 'vmhd') facts.hasVideoTrack = true;
      if (['moov', 'trak', 'mdia', 'minf'].includes(type) && depth < 6) walk(body, i + size, depth + 1);
      i += size;
    }
  };
  walk(0, buf.length, 0);
  if (facts.hasAudioTrack === undefined) facts.hasAudioTrack = false;
  return facts;
}

const MP3_BITRATES = {
  // MPEG-1 Layer III, MPEG-2/2.5 Layer III (kbps)
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** MP3: walks every Layer III frame and sums its samples, so VBR files are timed right too. */
export function mp3Facts(buf) {
  let i = 0;
  if (buf.toString('ascii', 0, 3) === 'ID3') {
    const tagSize = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + tagSize;
  }
  let frames = 0;
  let seconds = 0;
  let sampleRate;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i += 1;
      continue;
    }
    const version = (buf[i + 1] >> 3) & 0x3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layer = (buf[i + 1] >> 1) & 0x3; // 1 = Layer III
    const brIdx = (buf[i + 2] >> 4) & 0xf;
    const srIdx = (buf[i + 2] >> 2) & 0x3;
    const pad = (buf[i + 2] >> 1) & 0x1;
    if (version === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) {
      i += 1;
      continue;
    }
    const kbps = MP3_BITRATES[version === 3 ? 1 : 2][brIdx];
    const rate = MP3_RATES[version][srIdx];
    const samples = version === 3 ? 1152 : 576;
    const len = Math.floor(((samples / 8) * kbps * 1000) / rate) + pad;
    if (len < 4) {
      i += 1;
      continue;
    }
    frames += 1;
    seconds += samples / rate;
    sampleRate = rate;
    i += len;
  }
  return frames ? { durationSec: round3(seconds), frames, sampleRate } : {};
}

// ── voices (Cloud TTS) ───────────────────────────────────────────────────────────────────────────────────────────

/** lib/audio/google-tts.ts voiceTierRank, unchanged (the contract test holds the two together). */
export function voiceTierRank(name) {
  const n = String(name).toLowerCase();
  if (n.includes('chirp3-hd') || n.includes('chirp-3-hd')) return 6;
  if (n.includes('chirp-hd') || n.includes('chirp')) return 5;
  if (n.includes('studio')) return 5;
  if (n.includes('neural2')) return 4;
  if (n.includes('wavenet')) return 3;
  if (n.includes('polyglot')) return 2;
  if (n.includes('standard')) return 1;
  return 0;
}

/** lib/audio/google-tts.ts pickBestGoogleVoice's choice from one voices-list answer (no cache, no request). */
export function pickVoice(voicesAnswer, languageCode, gender, variant = 0) {
  const voices = (voicesAnswer?.voices ?? []).filter((v) =>
    (v.languageCodes ?? []).some((c) => c.toLowerCase().startsWith(languageCode.toLowerCase().slice(0, 2))),
  );
  const genderMatch = gender ? voices.filter((v) => (v.ssmlGender ?? '').toUpperCase() === gender) : [];
  const pool = genderMatch.length ? genderMatch : voices;
  pool.sort((a, b) => voiceTierRank(b.name) - voiceTierRank(a.name) || a.name.localeCompare(b.name));
  const top = pool.length ? voiceTierRank(pool[0].name) : 0;
  const best = pool.filter((v) => voiceTierRank(v.name) === top).map((v) => v.name);
  return best.length ? best[Math.abs(Math.trunc(variant)) % best.length] : null;
}

// ── sanitizing ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A copy fit to commit: media → "<media bytes=N sha256=…>", the project id and number → {project}. */
export function sanitize(value, project, projectNumber) {
  const scrub = (s) => {
    let out = s.split(project).join('{project}');
    if (projectNumber) out = out.split(`projects/${projectNumber}/`).join('projects/{project}/');
    return out;
  };
  if (typeof value === 'string') {
    if (looksBase64(value)) {
      const bytes = Buffer.from(value, 'base64');
      return `<media bytes=${bytes.length} sha256=${createHash('sha256').update(bytes).digest('hex')}>`;
    }
    return scrub(value);
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v, project, projectNumber));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, project, projectNumber)]));
  return value;
}

/** The project number in a Vertex operation name (projects/<number>/locations/…), or null. */
export function projectNumberIn(name) {
  const m = /^projects\/(\d{6,20})\//.exec(String(name ?? ''));
  return m ? m[1] : null;
}

// ── the run ──────────────────────────────────────────────────────────────────────────────────────────────────────

function gcloudToken() {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (!/^[A-Za-z0-9._-]{20,}$/.test(token)) throw new Error('gcloud gave no access token (is an account signed in?)');
  return token;
}

/** Vertex operation name → its fetchPredictOperation URL (the same parts lib/veo/vertexClient reads). */
export function pollUrlFor(name) {
  const m = /^projects\/([^/]+)\/locations\/([a-z0-9-]+)\/publishers\/google\/models\/([A-Za-z0-9._-]+)\/operations\/[A-Za-z0-9_-]+$/.exec(String(name ?? ''));
  if (!m) return null;
  const host = m[2] === 'global' ? 'aiplatform.googleapis.com' : `${m[2]}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${m[1]}/locations/${m[2]}/publishers/google/models/${m[3]}:fetchPredictOperation`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { nonJson: text.slice(0, 2000) };
  }
}

export async function run(opts, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const getToken = deps.token ?? gcloudToken;
  const log = deps.log ?? ((line) => console.log(line));
  const pollEveryMs = deps.pollEveryMs ?? POLL_EVERY_MS;
  const pollForMs = deps.pollForMs ?? POLL_FOR_MS;
  const plan = JSON.parse(readFileSync(opts.plan, 'utf8'));
  const { total, cap } = validatePlan(plan);
  log(`plan: ${plan.calls.length} calls, estimate $${total.toFixed(3)}, cap $${cap}, project ${opts.project}`);
  for (const c of plan.calls) log(`  ${c.id.padEnd(22)} ${c.kind.padEnd(4)} $${Number(c.estimateUsd).toFixed(3)}  ${c.url.replace('{project}', opts.project)}`);
  const inputs = loadInputs(plan, opts.plan);
  for (const [id, f] of Object.entries(inputs.facts)) log(`  input ${id}: ${f.file} (${f.bytes} bytes, sha256 ${f.sha256.slice(0, 12)}…, matches the recording)`);
  if (opts.dryRun) {
    log('dry run: nothing sent');
    return { dryRun: true, total };
  }

  const ledgerPath = join(opts.out, 'ledger.json');
  let ledger = { startedAt: new Date().toISOString(), project: opts.project, sent: {} };
  if (existsSync(ledgerPath)) {
    if (!opts.resume) throw new Error(`${ledgerPath} exists: this plan already ran. Never repeat a billed call (use --resume to send only the calls never sent).`);
    ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    if (ledger.project !== opts.project) throw new Error('the ledger belongs to another project');
  }
  mkdirSync(join(opts.out, 'fixtures'), { recursive: true });
  mkdirSync(join(opts.out, 'media'), { recursive: true });
  const saveLedger = () => writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  saveLedger();

  const token = getToken();
  const headers = (extra = {}) => ({
    Authorization: `Bearer ${token}`,
    // User credentials name the project that pays: the same project the URL names (Cloud TTS has none in its URL).
    'x-goog-user-project': opts.project,
    ...extra,
  });
  const refs = { ...inputs.refs };
  const results = [];
  let estimateSent = 0;
  let projectNumber = null;

  const record = (call, data) => {
    const dir = join(opts.out, 'fixtures', call.id);
    mkdirSync(dir, { recursive: true });
    for (const [name, value] of Object.entries(data)) {
      writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(sanitize(value, opts.project, projectNumber), null, 2)}\n`);
    }
  };

  const keepMedia = (call, json) => {
    const media = findMedia(json);
    if (!media.length) return null;
    const top = media[0];
    let buf = Buffer.from(top.base64, 'base64');
    let mimeType = top.mimeType;
    const rate = pcmRate(mimeType);
    const out = { mimeType, base64: top.base64 };
    if (rate) {
      // Gemini TTS answers raw PCM, possibly in several parts: the route joins them in order (lib/speech/geminiAudio)
      // and wraps them in one WAV, and so does this (the WAV is what Chirp is given).
      const parts = (json?.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => typeof p?.inlineData?.data === 'string' && pcmRate(p.inlineData.mimeType) === rate)
        .map((p) => Buffer.from(p.inlineData.data, 'base64'));
      if (parts.length > 1) buf = Buffer.concat(parts);
      buf = wavFromPcm16(buf, rate);
      mimeType = 'audio/wav';
      out.wavBase64 = buf.toString('base64');
    } else if (/^audio\/(?:x-)?wav\b/i.test(mimeType ?? '') || (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WAVE')) {
      // gemini-3.8-flash-tts answers in a WAV container (plan-3 run, 2026-11-12: Chirp was SKIPPED because only raw
      // L16 PCM set wavBase64). A WAV is already what Chirp is given, so it is passed on as it came.
      mimeType = 'audio/wav';
      out.wavBase64 = buf.toString('base64');
    }
    const ext = /png/.test(mimeType) ? 'png' : /jpe?g/.test(mimeType) ? 'jpg' : /mp4/.test(mimeType) ? 'mp4' : /wav/.test(mimeType) ? 'wav' : /mpeg|mp3/.test(mimeType) ? 'mp3' : 'bin';
    writeFileSync(join(opts.out, 'media', `${call.id}.${ext}`), buf);
    out.facts = mediaFacts(buf, mimeType);
    return out;
  };

  const lro = [];
  for (const call of plan.calls) {
    if (ledger.sent[call.id]) {
      log(`${call.id}: already sent at ${ledger.sent[call.id].at} — not sent again`);
      continue;
    }
    let body;
    try {
      body = call.body === undefined ? undefined : substitute(call.body, refs);
    } catch (e) {
      log(`${call.id}: SKIPPED, ${e.message} (an earlier call gave nothing to send)`);
      results.push({ id: call.id, skipped: String(e.message) });
      continue;
    }
    const est = Number(call.estimateUsd);
    if (estimateSent + est > cap + 1e-9) {
      log(`${call.id}: SKIPPED, it would pass the cap`);
      results.push({ id: call.id, skipped: 'cap' });
      continue;
    }
    const url = call.url.replace('{project}', encodeURIComponent(opts.project));
    ledger.sent[call.id] = { at: new Date().toISOString(), estimateUsd: est };
    saveLedger(); // BEFORE the call: a crash after this line never sends it twice
    estimateSent += est;
    const started = Date.now();
    let res;
    try {
      res = await fetchImpl(url, {
        method: call.kind === 'get' ? 'GET' : 'POST',
        headers: headers(call.kind === 'get' ? {} : { 'Content-Type': call.contentType ?? 'application/json' }),
        ...(call.kind === 'get' ? {} : { body: JSON.stringify(body) }),
        redirect: 'manual',
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (e) {
      ledger.sent[call.id].error = e?.name ?? 'error';
      saveLedger();
      log(`${call.id}: NO ANSWER (${e?.name ?? 'error'}) — may be billed; not retried`);
      results.push({ id: call.id, status: 0, error: e?.name ?? 'error', ms: Date.now() - started });
      record(call, { request: { method: 'POST', url: call.url, body: call.body } });
      continue;
    }
    const json = await readJson(res);
    const ms = Date.now() - started;
    ledger.sent[call.id].status = res.status;
    saveLedger();
    log(`${call.id}: HTTP ${res.status} in ${ms} ms`);
    if (call.kind === 'lro' && res.ok && typeof json.name === 'string') {
      projectNumber = projectNumber ?? projectNumberIn(json.name);
      lro.push({ call, body, submit: json, submitStatus: res.status, started });
      continue;
    }
    const entry = { id: call.id, model: call.model, status: res.status, ms };
    let media = null;
    if (res.ok && call.kind !== 'get') media = keepMedia(call, json);
    if (media) {
      refs[call.id] = { base64: media.base64, mimeType: media.mimeType, ...(media.wavBase64 ? { wavBase64: media.wavBase64 } : {}) };
      entry.media = media.facts;
    }
    if (res.ok && call.kind === 'get' && call.pick) {
      const pick = pickVoice(json, call.pick.languageCode, call.pick.gender, call.pick.variant ?? 0);
      refs[call.id] = { pick };
      entry.pick = pick;
      // Only the asked language's voices are kept in the fixture: the rest of the list says nothing about the contract.
      json.voices = (json.voices ?? []).filter((v) => (v.languageCodes ?? []).some((c) => c.toLowerCase().startsWith(call.pick.languageCode.slice(0, 2).toLowerCase())));
    }
    if (call.id.startsWith('chirp')) entry.transcript = (json.results ?? []).map((r) => r.alternatives?.[0]?.transcript ?? '').join(' ').trim();
    if (json.usageMetadata) entry.usage = json.usageMetadata;
    results.push(entry);
    record(call, {
      request: { method: call.kind === 'get' ? 'GET' : 'POST', url: call.url, ...(call.body !== undefined ? { body: call.body } : {}) },
      response: { status: res.status, body: json },
      meta: { model: call.model, adapter: call.adapter, ms, estimateUsd: est, at: ledger.sent[call.id].at, ...(entry.media ? { media: entry.media } : {}) },
    });
  }

  // Long-running jobs: polled until done (each poll is free; the job was billed once at submit).
  await Promise.all(lro.map(async (job) => {
    const pollUrl = pollUrlFor(job.submit.name);
    const deadline = Date.now() + pollForMs;
    const polls = [];
    let op = null;
    while (pollUrl && Date.now() < deadline) {
      await sleep(pollEveryMs);
      let r;
      try {
        r = await fetchImpl(pollUrl, {
          method: 'POST',
          headers: headers({ 'Content-Type': 'application/json; charset=utf-8' }),
          body: JSON.stringify({ operationName: job.submit.name }),
          redirect: 'manual',
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        polls.push(0);
        continue;
      }
      polls.push(r.status);
      if (!r.ok) continue;
      const j = await readJson(r);
      if (j.done === true) {
        op = j;
        break;
      }
    }
    const ms = Date.now() - job.started;
    const entry = { id: job.call.id, model: job.call.model, status: job.submitStatus, ms, done: Boolean(op) };
    if (op?.error) entry.error = op.error;
    const media = op ? keepMedia(job.call, op) : null;
    if (media) entry.media = media.facts;
    if (op?.response?.raiMediaFilteredCount) entry.filtered = op.response.raiMediaFilteredCount;
    log(`${job.call.id}: ${op ? (media ? 'done with a video' : 'done without a video') : 'NOT done before the deadline (the operation name is in the fixture)'} after ${Math.round(ms / 1000)} s`);
    results.push(entry);
    record(job.call, {
      request: { method: 'POST', url: job.call.url, body: job.call.body },
      response: { status: job.submitStatus, body: job.submit },
      ...(op ? { operation: { body: op } } : {}),
      meta: { model: job.call.model, adapter: job.call.adapter, ms, polls: polls.length, estimateUsd: Number(job.call.estimateUsd), at: ledger.sent[job.call.id].at, ...(entry.media ? { media: entry.media } : {}) },
    });
  }));

  const summary = {
    project: '{project}',
    finishedAt: new Date().toISOString(),
    estimateSentUsd: Math.round(estimateSent * 1e6) / 1e6,
    capUsd: cap,
    ...(Object.keys(inputs.facts).length ? { inputs: inputs.facts } : {}),
    results: sanitize(results, opts.project, projectNumber),
  };
  writeFileSync(join(opts.out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  log(`estimate sent: $${summary.estimateSentUsd.toFixed(3)} of $${cap}; summary in ${join(opts.out, 'summary.json')}`);
  return summary;
}

if (/vertex-contract\.mjs$/.test(process.argv[1] || '')) {
  Promise.resolve()
    .then(() => run(parseArgs(process.argv.slice(2))))
    .catch((e) => {
      console.error(`refused: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    });
}
