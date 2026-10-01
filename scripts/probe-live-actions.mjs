#!/usr/bin/env node
/**
 * scripts/probe-live-actions.mjs — does Google accept the Live voice-to-action lock? (docs/voice/LIVE_ACTIONS.md,
 * "Still to verify live"). Run by the OWNER with a funded key; never by CI, never by a test.
 *
 * For each lock the mint route (app/api/voice/live) can send, it does what the route + the browser do:
 *   1. mints a `uses: 1` ephemeral token locked to that `bidiGenerateContentSetup` (POST v1alpha/auth_tokens, the key in
 *      the x-goog-api-key HEADER), then
 *   2. opens the v1alpha BidiGenerateContentConstrained socket with the token, sends the SAME setup as its first frame,
 *      waits for `setupComplete` (or the close code / a timeout) and hangs up.
 * The three locks, in the route's fallback order:
 *   full             parity lock + functionDeclarations (+ googleSearch with --search) — a client sending `actions: true`
 *   actions-dropped  the same parity lock WITHOUT the declarations — the route's first retry after a 400
 *   no-tools         the legacy wire: model + generationConfig + systemInstruction — the browser's `tools: false` retry
 *
 * COST: a mint, and a setup that is never followed by a turn, generate nothing (setup-only probes, 2026-09-30).
 * `--turn` OPTS IN to ONE billable turn on the `full` session: it types (clientContent — no mic here) "Make me a vertical
 * video of a cat surfing", expects a prepare_generation toolCall (checked with the app's own validator), answers it as
 * the browser does, and waits for the model to SPEAK after the answer. A few cents of native-audio tokens.
 *
 * ⚠️ SECRETS: the key comes from the environment (or .env.local via @next/env) and goes ONLY into the mint's header —
 * never into a URL, never printed. The single-use token rides in the socket URL, as in the browser. Every upstream
 * text this prints is scrubbed of the key and of the minted tokens.
 *
 * ⚠️ NO DRIFT ON THE PART UNDER TEST: the declarations, the actions paragraph and the validator are imported from
 * lib/voice/liveTools.ts itself (it has no imports, so Node 24 strips its types natively). The setup builder is
 * mirrored below because lib/voice/geminiLive.ts cannot load that way (a constructor parameter property);
 * scripts/probe-live-actions.test.ts pins the mirror to buildLiveSetup. The system instruction is a short stand-in
 * for the route's platform prompt: it decides how the model talks, not whether Google accepts the lock.
 *
 * Usage (repo root, Node 24):
 *   node scripts/probe-live-actions.mjs                   # mint + setup for all three locks; nothing is generated
 *   node scripts/probe-live-actions.mjs --turn            # …plus ONE spoken turn on the full lock (billable)
 *   node scripts/probe-live-actions.mjs --search          # add googleSearch, as GEMINI_LIVE_GOOGLE_SEARCH=1 does
 *   node scripts/probe-live-actions.mjs --only full       # one lock: full | actions-dropped | no-tools
 *   node scripts/probe-live-actions.mjs --model gemini-3.1-flash-live-preview
 *   node scripts/probe-live-actions.mjs --dry             # print the frames; no key, no network
 * Node warns once that liveTools.ts has no module type (MODULE_TYPELESS_PACKAGE_JSON): harmless, and
 * `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/probe-live-actions.mjs …` hides it.
 *
 * Exit codes: 0 every probed lock reached setupComplete (and the turn passed, if asked) · 1 configuration error ·
 * 2 a lock was refused (mint or handshake) or the turn failed.
 */
import { LIVE_ACTIONS_RULE, LIVE_FUNCTION_DECLARATIONS, validateLiveToolCall } from '../lib/voice/liveTools.ts';

const AUTH_TOKEN_URL = 'https://generativelanguage.googleapis.com/v1alpha/auth_tokens';
const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

/** Keep in step with lib/ai/google/models.ts LIVE_MODELS (that file cannot load here: `@/` imports). */
export const PROBE_LIVE_MODELS = Object.freeze([
  'gemini-2.5-flash-native-audio-latest',
  'gemini-3.8-live',
  'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-preview-12-2025',
]);
export const PROBE_VARIANTS = Object.freeze(['full', 'actions-dropped', 'no-tools']);
export const PROBE_VOICE = 'Aoede';
/** The route's transcription hint for a Georgian call (TRANSCRIPTION_LANGUAGE.ka). */
export const PROBE_LANGUAGE_CODE = 'ka-GE';
export const PROBE_INSTRUCTION = 'You are the MyAvatar voice assistant on a LIVE VOICE CALL: everything you say is spoken '
  + 'aloud. Speak short natural sentences with no Markdown, lists or code. Answer in the language the user speaks.';
export const PROBE_TURN_TEXT = 'Make me a vertical video of a cat surfing.';

/** The key and every minted token, so anything printed — the last-resort catch included — can be scrubbed of them. */
const SECRETS = [];

const MINT_TIMEOUT_MS = 12_000;
const SETUP_TIMEOUT_MS = 15_000;
const TURN_TIMEOUT_MS = 45_000;
const TURN_GRACE_MS = 5_000;
const DETAIL_MAX = 300;

// ─── Pure helpers (pinned by scripts/probe-live-actions.test.ts) ─────────────────

/** argv → options. Unknown flags are an error: a typo must never silently drop `--only` and probe everything. */
export function parseProbeArgs(argv) {
  const opts = { turn: false, search: false, dry: false, only: null, model: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--turn') opts.turn = true;
    else if (a === '--search') opts.search = true;
    else if (a === '--dry') opts.dry = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--only' || a === '--model') {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) return { error: `${a} needs a value` };
      i += 1;
      if (a === '--only') {
        if (!PROBE_VARIANTS.includes(v)) return { error: `--only must be one of ${PROBE_VARIANTS.join(', ')}` };
        opts.only = v;
      } else {
        const bare = v.trim().replace(/^models\//i, '');
        if (!PROBE_LIVE_MODELS.includes(bare)) return { error: `--model must be one of ${PROBE_LIVE_MODELS.join(', ')}` };
        opts.model = bare;
      }
    } else return { error: `unknown argument: ${a}` };
  }
  if (opts.turn && opts.only && opts.only !== 'full') return { error: '--turn runs on the full lock; drop --only or use --only full' };
  return opts;
}

/** The env's Live model when allowlisted, else the default (lib/ai/google/models.ts defaultLiveModel). */
export function probeModel(requested, envModel) {
  if (requested) return requested;
  const bare = typeof envModel === 'string' ? envModel.trim().replace(/^models\//i, '') : '';
  return PROBE_LIVE_MODELS.includes(bare) ? bare : PROBE_LIVE_MODELS[0];
}

/** Mirror of lib/voice/geminiLive.ts buildLiveSetup for the options the route uses. Returns `{ setup }`. */
function buildFrame({ model, instruction, parity, tools }) {
  const resource = `models/${model}`;
  const generationConfig = {
    responseModalities: ['AUDIO'],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: PROBE_VOICE } } },
  };
  // buildLiveSetup sends thinkingBudget:0 to the 2.5 family only (3.x Live models reject thinking config).
  if (/^models\/gemini-2\.5-/i.test(resource)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const setup = { model: resource, generationConfig, systemInstruction: { parts: [{ text: instruction }] } };
  if (parity) {
    setup.inputAudioTranscription = { languageCodes: [PROBE_LANGUAGE_CODE] };
    setup.outputAudioTranscription = {};
    setup.sessionResumption = {};
    setup.contextWindowCompression = { slidingWindow: {} };
  }
  const blocks = [];
  // Declarations FIRST, search second — buildLiveSetup's order.
  if (tools.includes('live_actions')) blocks.push({ functionDeclarations: LIVE_FUNCTION_DECLARATIONS });
  if (tools.includes('google_search')) blocks.push({ googleSearch: {} });
  if (blocks.length) setup.tools = blocks;
  return { setup };
}

/** The three locks, in the route's fallback order. The actions paragraph rides only with the declarations (route rule). */
export function buildProbeVariants({ model, search }) {
  const searchTool = search ? ['google_search'] : [];
  return [
    {
      name: 'full',
      declares: true,
      frame: buildFrame({ model, instruction: `${PROBE_INSTRUCTION} ${LIVE_ACTIONS_RULE}`, parity: true, tools: ['live_actions', ...searchTool] }),
    },
    { name: 'actions-dropped', declares: false, frame: buildFrame({ model, instruction: PROBE_INSTRUCTION, parity: true, tools: searchTool }) },
    { name: 'no-tools', declares: false, frame: buildFrame({ model, instruction: PROBE_INSTRUCTION, parity: false, tools: [] }) },
  ];
}

/** Removes every secret (raw and URL-encoded) from upstream text, then bounds it. */
export function scrub(text, secrets) {
  let out = String(text ?? '');
  for (const s of secrets) {
    if (!s) continue;
    for (const form of new Set([s, encodeURIComponent(s)])) out = out.split(form).join('[redacted]');
  }
  out = out.replace(/\s+/g, ' ').trim();
  return out.length > DETAIL_MAX ? `${out.slice(0, DETAIL_MAX)}…` : out;
}

/** The answer the browser executor gives a validated call (components/voice/live/liveActions.ts), minus the UI. */
export function probeToolResponse(call) {
  const v = validateLiveToolCall(call.name, call.args);
  if (!v.ok) return { id: call.id, name: call.name, response: { ok: false, error: v.error.code, message: v.error.message } };
  if (v.action.type === 'prepare_generation') {
    return {
      id: call.id,
      name: call.name,
      response: {
        ok: true,
        summary: `Prepared a ${v.action.tool} prompt in the studio. Nothing was generated and no credits were spent: `
          + 'the user reviews it and starts it with the Run button.',
      },
    };
  }
  return { id: call.id, name: call.name, response: { ok: true, summary: 'Done.' } };
}

// ─── Network (main only) ─────────────────────────────────────────────────────────

function resolveKey(env) {
  const single = (env.GEMINI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY || '').trim();
  if (single) return single;
  return (env.GEMINI_API_KEYS || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)[0] || '';
}

async function mint(apiKey, setup) {
  const now = Date.now();
  const res = await fetch(AUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
      bidiGenerateContentSetup: setup,
    }),
    signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
  });
  const text = await res.text().catch(() => '');
  let token = '';
  if (res.ok) {
    try { token = String(JSON.parse(text).name || '').trim(); } catch { /* reported below */ }
  }
  return { status: res.status, ok: res.ok && !!token, token, detail: res.ok ? (token ? '' : 'no token in the response') : text };
}

async function frameText(data) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.text();
  return '';
}

/**
 * Opens the socket, sends `frame`, waits for setupComplete. With `turn`, then runs the one typed turn. Always closes.
 * Resolves { setup: 'complete' | 'closed' | 'timeout' | 'error', ms, close?, turn? }.
 */
function openSession(token, frame, { turn }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const result = { setup: 'pending', ms: 0 };
    const t = { calls: [], answered: false, audioChunks: 0, audioAfterAnswer: 0, transcript: '', turnComplete: false };
    let ws;
    let timer = null;
    let settled = false;
    const finish = (patch) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      Object.assign(result, patch);
      if (turn && result.setup === 'complete') result.turn = t;
      try { ws?.close(1000, 'probe done'); } catch { /* already closed */ }
      resolve(result);
    };
    const arm = (ms, onTimeout) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onTimeout, ms);
    };
    try {
      ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`);
    } catch (e) {
      finish({ setup: 'error', close: { code: 0, reason: e instanceof Error ? e.message : 'WebSocket construct failed' } });
      return;
    }
    ws.binaryType = 'arraybuffer';
    arm(SETUP_TIMEOUT_MS, () => finish({ setup: result.setup === 'complete' ? 'complete' : 'timeout', ms: Date.now() - started }));
    ws.addEventListener('open', () => ws.send(JSON.stringify(frame)));
    ws.addEventListener('error', () => { /* the close event carries the code + reason */ });
    ws.addEventListener('close', (ev) => {
      finish({ setup: result.setup === 'complete' ? 'complete' : 'closed', close: { code: ev.code, reason: ev.reason || '' } });
    });
    ws.addEventListener('message', async (ev) => {
      let msg;
      try { msg = JSON.parse(await frameText(ev.data)); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.setupComplete !== undefined && result.setup !== 'complete') {
        result.setup = 'complete';
        result.ms = Date.now() - started;
        if (!turn) { finish({}); return; }
        arm(TURN_TIMEOUT_MS, () => finish({}));
        ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: PROBE_TURN_TEXT }] }], turnComplete: true } }));
        return;
      }
      if (!turn || result.setup !== 'complete') return;
      const calls = Array.isArray(msg.toolCall?.functionCalls) ? msg.toolCall.functionCalls : [];
      if (calls.length) {
        const responses = [];
        for (const fc of calls) {
          const call = { id: typeof fc?.id === 'string' ? fc.id : '', name: typeof fc?.name === 'string' ? fc.name : '', args: fc?.args ?? {} };
          const v = validateLiveToolCall(call.name, call.args);
          t.calls.push({ name: call.name, valid: v.ok, args: call.args, ...(v.ok ? {} : { error: v.error.code }) });
          responses.push(probeToolResponse(call));
        }
        ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
        t.answered = true;
        return;
      }
      const sc = msg.serverContent;
      if (sc && typeof sc === 'object') {
        for (const p of Array.isArray(sc.modelTurn?.parts) ? sc.modelTurn.parts : []) {
          if (typeof p?.inlineData?.data === 'string' && /^audio\//i.test(p.inlineData.mimeType || '')) {
            t.audioChunks += 1;
            if (t.answered) t.audioAfterAnswer += 1;
          }
        }
        if (typeof sc.outputTranscription?.text === 'string') t.transcript += sc.outputTranscription.text;
        // The turn that matters is the one AFTER our toolResponse: the model speaking about what it did. A turn that
        // ends with no call at all gets a short grace for a late toolCall, then fails (no 45 s wait for nothing).
        if (sc.turnComplete === true && t.answered) {
          t.turnComplete = true;
          finish({});
        } else if (sc.turnComplete === true && !t.calls.length) {
          arm(TURN_GRACE_MS, () => finish({}));
        }
      }
    });
  });
}

function turnPassed(t) {
  return !!t && t.calls.some((c) => c.name === 'prepare_generation' && c.valid) && t.audioAfterAnswer > 0 && t.turnComplete;
}

const HELP = `Usage: node scripts/probe-live-actions.mjs [--turn] [--search] [--only full|actions-dropped|no-tools] [--model <id>] [--dry]
  default   mint + setup for each lock; no turn, nothing generated
  --turn    ONE billable spoken turn on the full lock (toolCall → our answer → the model speaks)
  --search  add googleSearch to the parity locks (GEMINI_LIVE_GOOGLE_SEARCH=1)
  --dry     print the frames; no key, no network`;

async function main() {
  const opts = parseProbeArgs(process.argv.slice(2));
  if (opts.error) {
    console.error(`[probe-live] ✗ ${opts.error}\n${HELP}`);
    process.exit(1);
  }
  if (opts.help) {
    console.log(HELP);
    return;
  }

  if (!opts.dry) {
    const { loadEnvConfig } = await import('@next/env');
    loadEnvConfig(process.cwd(), false, { info: () => {}, error: (...a) => console.error('[probe-live]', ...a) });
  }
  const model = probeModel(opts.model, process.env.GEMINI_LIVE_MODEL);
  const variants = buildProbeVariants({ model, search: opts.search }).filter((v) => !opts.only || v.name === opts.only);

  if (opts.dry) {
    for (const v of variants) console.log(`── ${v.name}\n${JSON.stringify(v.frame, null, 2)}`);
    return;
  }

  const apiKey = resolveKey(process.env);
  if (!apiKey) {
    console.error('[probe-live] ✗ no Gemini key: set GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEYS)');
    process.exit(1);
  }
  SECRETS.push(apiKey);
  const secrets = SECRETS;
  console.log(`[probe-live] model models/${model} · search ${opts.search ? 'on' : 'off'} · turn ${opts.turn ? 'ON (billable)' : 'off'}`);

  let failed = false;
  for (const v of variants) {
    const tools = (v.frame.setup.tools || []).map((b) => ('functionDeclarations' in b ? `functionDeclarations(${b.functionDeclarations.length})` : 'googleSearch'));
    const label = `${v.name.padEnd(16)} [${tools.join(' + ') || 'no tools'}]`;
    let m;
    try {
      m = await mint(apiKey, v.frame.setup);
    } catch (e) {
      failed = true;
      console.log(`✗ ${label} mint failed: ${scrub(e instanceof Error ? e.message : String(e), secrets)}`);
      continue;
    }
    if (!m.ok) {
      failed = true;
      console.log(`✗ ${label} mint ${m.status}: ${scrub(m.detail, secrets)}`);
      continue;
    }
    secrets.push(m.token);
    const s = await openSession(m.token, v.frame, { turn: opts.turn && v.name === 'full' });
    if (s.setup !== 'complete') {
      failed = true;
      const why = s.close ? `closed ${s.close.code} ${scrub(s.close.reason, secrets)}` : s.setup;
      console.log(`✗ ${label} mint 200 · no setupComplete (${why})`);
      continue;
    }
    console.log(`✓ ${label} mint 200 · setupComplete in ${s.ms} ms`);
    if (s.turn) {
      const t = s.turn;
      const ok = turnPassed(t);
      if (!ok) failed = true;
      const calls = t.calls.map((c) => `${c.name}${c.valid ? '' : ` (invalid: ${c.error})`} ${scrub(JSON.stringify(c.args), secrets)}`);
      console.log(`  ${ok ? '✓' : '✗'} turn "${PROBE_TURN_TEXT}"`);
      console.log(`    toolCall: ${calls.length ? calls.join(' | ') : 'none'}`);
      console.log(`    audio after our answer: ${t.audioAfterAnswer} chunk(s) of ${t.audioChunks} · turnComplete ${t.turnComplete}`);
      if (t.transcript) console.log(`    said: ${scrub(t.transcript, secrets)}`);
      if (s.close) console.log(`    the server closed the call mid-turn: ${s.close.code} ${scrub(s.close.reason, secrets)}`);
    }
  }

  const byName = Object.fromEntries(variants.map((v) => [v.name, v]));
  if (failed && byName.full) {
    console.log('[probe-live] If only `full` failed, the route already falls back to actions:false on a mint 400; a lock that mints but');
    console.log('  never completes setup is handled by the browser (useGeminiLiveSession). GEMINI_LIVE_ACTIONS=0 turns actions off.');
  }
  process.exit(failed ? 2 : 0);
}

// Runs only as a script (`node scripts/probe-live-actions.mjs`), never when the test imports the helpers above.
if (typeof process !== 'undefined' && /probe-live-actions\.mjs$/.test(process.argv[1] || '')) {
  main().catch((e) => {
    console.error(`[probe-live] ✗ ${scrub(e instanceof Error ? e.message : 'failed', SECRETS)}`);
    process.exit(2);
  });
}
