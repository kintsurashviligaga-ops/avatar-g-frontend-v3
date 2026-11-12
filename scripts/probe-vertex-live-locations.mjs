#!/usr/bin/env node
/**
 * scripts/probe-vertex-live-locations.mjs — which Vertex location answers the Live websocket for a model?
 * (v5.1 M-2, PR #292: the relay can dial gemini-3.8-live at us-central1 today; `eu` is closer to Georgia but
 * UNVERIFIED, and europe-west4 closed with 1008 "publisher model not found" earlier.)
 *
 * For each location it does what the relay does (lib/voice/relay/session.ts vertexLiveUrl + vertexModelResource):
 * opens the Vertex BidiGenerateContent socket with the signed-in gcloud identity, sends ONE setup frame, waits for
 * `setupComplete` (or the close code / a 15 s timeout) and hangs up.
 *
 * COST: setup only. No audio, no text and no turn are ever sent, so nothing is generated and nothing is billed.
 *
 * SECRETS: the bearer comes from `gcloud auth print-access-token`, lives in memory, goes only into the socket's
 * Authorization header and is never printed. The project id is printed as {project}.
 *
 * Usage (repo root, Node 22+):
 *   node scripts/probe-vertex-live-locations.mjs --project <id>
 *   node scripts/probe-vertex-live-locations.mjs --project <id> --model gemini-3.8-live --locations eu,us-central1
 *   node scripts/probe-vertex-live-locations.mjs --project <id> --dry      # print URLs and frames; no network
 *
 * Exit codes: 0 at least one location reached setupComplete · 1 configuration error · 2 no location answered.
 */
import { execFileSync } from 'node:child_process';

export const DEFAULT_MODEL = 'gemini-3.8-live';
export const DEFAULT_LOCATIONS = Object.freeze(['us-central1', 'us', 'eu', 'europe-west4']);
const PROJECT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const WAIT_MS = 15_000;

/** Mirrors lib/voice/relay/session.ts vertexLiveUrl (pinned by scripts/probe-vertex-live-locations.test.ts). */
export function liveUrl(location) {
  const host =
    location === 'global'
      ? 'aiplatform.googleapis.com'
      : location === 'us' || location === 'eu'
        ? `aiplatform.${location}.rep.googleapis.com`
        : `${location}-aiplatform.googleapis.com`;
  return `wss://${host}/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`;
}

export function setupFrame(project, location, model) {
  return {
    setup: {
      model: `projects/${project}/locations/${location}/publishers/google/models/${model}`,
      generationConfig: { responseModalities: ['AUDIO'] },
    },
  };
}

function args(argv) {
  const out = { model: DEFAULT_MODEL, locations: [...DEFAULT_LOCATIONS], dry: false, project: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') out.dry = true;
    else if (a === '--project') out.project = argv[++i] ?? '';
    else if (a === '--model') out.model = argv[++i] ?? '';
    else if (a === '--locations') out.locations = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!PROJECT_RE.test(out.project)) throw new Error('--project <id> is required');
  if (!/^[a-z0-9.-]+$/.test(out.model)) throw new Error('--model looks wrong');
  if (!out.locations.length || out.locations.some((l) => !/^[a-z0-9-]+$/.test(l))) throw new Error('--locations looks wrong');
  return out;
}

async function openSocket(url, token) {
  try {
    const { default: WS } = await import('ws');
    return new WS(url, { headers: { Authorization: `Bearer ${token}` }, handshakeTimeout: 10_000 });
  } catch {
    // Node's built-in WebSocket (undici) takes a non-standard `headers` option.
    return new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
  }
}

function probe(url, frame, token, project) {
  const scrub = (s) => String(s ?? '').split(token).join('***').split(project).join('{project}').slice(0, 300);
  return new Promise(async (done) => {
    const started = Date.now();
    let settled = false;
    let ws;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws?.close(); } catch {}
      done({ ...result, ms: Date.now() - started });
    };
    const timer = setTimeout(() => finish({ ok: false, why: `no answer in ${WAIT_MS / 1000} s` }), WAIT_MS);
    try {
      ws = await openSocket(url, token);
    } catch (e) {
      return finish({ ok: false, why: scrub(e?.message) });
    }
    const on = (ev, fn) => (ws.on ? ws.on(ev, fn) : ws.addEventListener(ev, fn));
    on('open', () => ws.send(JSON.stringify(frame)));
    on('message', (m) => {
      const raw = m?.data ?? m;
      const text = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
      if (text.includes('setupComplete')) finish({ ok: true, why: 'setupComplete' });
      else finish({ ok: false, why: `unexpected first frame: ${scrub(text)}` });
    });
    on('close', (a, b) => {
      const code = typeof a === 'number' ? a : a?.code;
      const reason = typeof a === 'number' ? b : a?.reason;
      finish({ ok: false, why: `closed ${code} ${scrub(reason)}`.trim() });
    });
    on('error', (e) => finish({ ok: false, why: scrub(e?.message ?? e?.error?.message ?? 'socket error') }));
    on('unexpected-response', (_req, res) => finish({ ok: false, why: `HTTP ${res?.statusCode} on upgrade` }));
  });
}

async function main() {
  let opts;
  try {
    opts = args(process.argv.slice(2));
  } catch (e) {
    console.error(String(e.message));
    process.exit(1);
  }
  const { project, model, locations, dry } = opts;
  if (dry) {
    for (const loc of locations) {
      console.log(loc, liveUrl(loc));
      console.log('  ', JSON.stringify(setupFrame('{project}', loc, model)));
    }
    return;
  }
  let token;
  try {
    token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    console.error('gcloud auth print-access-token failed: sign in with `gcloud auth login` first');
    process.exit(1);
  }
  console.log(`model ${model}, setup-only (nothing is generated or billed)`);
  let anyOk = false;
  for (const loc of locations) {
    const r = await probe(liveUrl(loc), setupFrame(project, loc, model), token, project);
    anyOk ||= r.ok;
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${loc.padEnd(14)} ${String(r.ms).padStart(5)} ms  ${r.why}`);
  }
  process.exit(anyOk ? 0 : 2);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
