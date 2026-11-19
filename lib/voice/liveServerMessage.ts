/**
 * lib/voice/liveServerMessage.ts — the parity parser for Gemini Live server frames (Vertex relay and the browser).
 *
 * Kept apart from geminiLive.ts so server code that only reads frames (e.g. the avatar studio presenter) does not
 * import the browser session module. geminiLive.ts re-exports everything here.
 */

/** A session-resumption handle as Live sends it: printable ASCII, at most 4 KB (shared with the setup builder). */
export const RESUMPTION_HANDLE_RE = /^[\x21-\x7E]{1,4096}$/;

export type LiveServerEvent =
  | { kind: 'setupComplete' }
  | { kind: 'audio'; data: string; mimeType: string }
  /** A talking avatar's picture AND voice: a fragmented-MP4 piece (lib/voice/fmp4), base64. Avatars stream it
   *  continuously, idle frames included, so a `video` event never means the model is speaking. */
  | { kind: 'video'; data: string; mimeType: string }
  | { kind: 'inputTranscript'; text: string; final?: boolean }
  | { kind: 'outputTranscript'; text: string; final?: boolean }
  | { kind: 'turnComplete' }
  | { kind: 'interrupted' }
  | { kind: 'goAway'; timeLeftMs?: number }
  | { kind: 'resumption'; handle: string; resumable: boolean }
  | { kind: 'usage'; totalTokens?: number }
  | { kind: 'toolCall'; calls: Array<{ id: string; name: string; args: unknown }> }
  | { kind: 'toolCallCancellation'; ids: string[] }
  /** The model started a Google Search (an `executableCode` part calling google_search) — the queries it asked. */
  | { kind: 'searchStart'; queries: string[] }
  /** serverContent.groundingMetadata: what was searched and the pages the answer stands on. */
  | { kind: 'grounding'; queries: string[]; sources: LiveSource[] }
  | { kind: 'error'; message: string };

export interface LiveSource { title: string; uri: string }

const MAX_QUERIES = 4;
const MAX_SOURCES = 6;

function cleanQueries(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const q of raw) {
    if (typeof q !== 'string') continue;
    const t = q.replace(/\s+/g, ' ').trim().slice(0, 160);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_QUERIES) break;
  }
  return out;
}

/** `print(google_search.search(queries=["a", "b"]))` → ['a', 'b']. Bounded; anything else → []. */
export function searchQueriesFromCode(code: unknown): string[] {
  if (typeof code !== 'string' || code.length > 4000 || !/google_search/.test(code)) return [];
  const list = /queries\s*=\s*\[([^\]]{0,2000})\]/.exec(code);
  const single = list ? null : /query\s*=\s*("(?:[^"\\]|\\.){0,300}"|'(?:[^'\\]|\\.){0,300}')/.exec(code);
  const body = list?.[1] ?? single?.[1] ?? '';
  const found: string[] = [];
  const re = /"((?:[^"\\]|\\.){0,300})"|'((?:[^'\\]|\\.){0,300})'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null && found.length < MAX_QUERIES * 2) found.push((m[1] ?? m[2] ?? '').replace(/\\(.)/g, '$1'));
  return cleanQueries(found);
}

/** groundingMetadata → the queries and the web sources (http(s) only, de-duplicated, bounded). */
export function groundingOf(raw: unknown): { queries: string[]; sources: LiveSource[] } | null {
  if (!isObj(raw)) return null;
  const queries = cleanQueries(raw.webSearchQueries);
  const sources: LiveSource[] = [];
  const chunks = Array.isArray(raw.groundingChunks) ? raw.groundingChunks : [];
  for (const c of chunks) {
    const web = isObj(c) && isObj(c.web) ? c.web : null;
    const uri = web && typeof web.uri === 'string' ? web.uri.trim() : '';
    if (!/^https?:\/\//i.test(uri) || uri.length > 2048 || sources.some((x) => x.uri === uri)) continue;
    const title = web && typeof web.title === 'string' && web.title.trim() ? web.title.trim().slice(0, 120) : '';
    sources.push({ title, uri });
    if (sources.length >= MAX_SOURCES) break;
  }
  return queries.length || sources.length ? { queries, sources } : null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const nonNegInt = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;

/** google.protobuf.Duration → ms. Canonical JSON is a string ("9s", "0.500s"); a {seconds, nanos} object is
 *  tolerated. Anything else → undefined (the caller should treat goAway as "reconnect now"). */
export function parseDurationMs(v: unknown): number | undefined {
  if (typeof v === 'string') {
    const m = /^\s*(\d{1,12}(?:\.\d{1,9})?)s\s*$/.exec(v);
    return m ? Math.round(parseFloat(m[1]!) * 1000) : undefined;
  }
  if (isObj(v)) {
    const s = typeof v.seconds === 'string' ? Number(v.seconds) : v.seconds;
    const n = v.nanos === undefined ? 0 : v.nanos;
    if (typeof s === 'number' && Number.isFinite(s) && s >= 0 && typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      return Math.round(s * 1000 + n / 1e6);
    }
  }
  return undefined;
}

function transcriptOf(v: unknown): { text: string; final?: boolean } | null {
  if (!isObj(v)) return null;
  const text = typeof v.text === 'string' ? v.text : '';
  const finished = v.finished === true;
  // A bare `finished` marker (empty text) is still a useful "close this caption" signal.
  if (!text && !finished) return null;
  return finished ? { text, final: true } : { text };
}

function parseMessageObject(msg: Obj): LiveServerEvent[] {
  const events: LiveServerEvent[] = [];

  if (msg.setupComplete !== undefined && msg.setupComplete !== null) events.push({ kind: 'setupComplete' });

  const sc = msg.serverContent;
  if (isObj(sc)) {
    // Barge-in first: the consumer must flush playback before anything else in this frame.
    if (sc.interrupted === true) events.push({ kind: 'interrupted' });

    const input = transcriptOf(sc.inputTranscription);
    if (input) events.push({ kind: 'inputTranscript', ...input });
    // ⚠️ interimInputTranscription ("subject to frequent updates") is deliberately NOT surfaced: whether it
    // is a delta or a replacement is undocumented, and a consumer that appends inputTranscript text would
    // duplicate every word. Revisit after a live check.

    const modelTurn = sc.modelTurn;
    const parts = isObj(modelTurn) && Array.isArray(modelTurn.parts) ? modelTurn.parts : [];
    for (const p of parts) {
      if (!isObj(p)) continue;
      const inline = p.inlineData;
      if (isObj(inline) && typeof inline.data === 'string' && inline.data.length > 0) {
        const mimeType = typeof inline.mimeType === 'string' ? inline.mimeType : '';
        if (mimeType.toLowerCase().startsWith('audio/')) events.push({ kind: 'audio', data: inline.data, mimeType });
        else if (mimeType.toLowerCase().startsWith('video/')) events.push({ kind: 'video', data: inline.data, mimeType });
      }
      // ⚠️ Text parts are NOT surfaced: native-audio sessions answer in AUDIO only (the words arrive as
      // outputTranscription), and the text parts a thinking model does emit are thought summaries — a
      // reasoning trace must never become a caption or a chat-thread message.
      // A Google Search the model is about to run arrives as generated code; only its QUERIES are surfaced.
      if (isObj(p.executableCode)) {
        const queries = searchQueriesFromCode(p.executableCode.code);
        if (queries.length) events.push({ kind: 'searchStart', queries });
      }
    }

    const grounding = groundingOf(sc.groundingMetadata);
    if (grounding) events.push({ kind: 'grounding', ...grounding });

    const output = transcriptOf(sc.outputTranscription);
    if (output) events.push({ kind: 'outputTranscript', ...output });

    if (sc.turnComplete === true) events.push({ kind: 'turnComplete' });
  }

  const tc = msg.toolCall;
  if (isObj(tc) && Array.isArray(tc.functionCalls)) {
    const calls: Array<{ id: string; name: string; args: unknown }> = [];
    for (const fc of tc.functionCalls) {
      if (!isObj(fc) || typeof fc.name !== 'string' || !fc.name) continue;
      calls.push({ id: typeof fc.id === 'string' ? fc.id : '', name: fc.name, args: fc.args === undefined ? {} : fc.args });
    }
    if (calls.length) events.push({ kind: 'toolCall', calls });
  }

  const tcc = msg.toolCallCancellation;
  if (isObj(tcc) && Array.isArray(tcc.ids)) {
    // Bounded: ids only ever name calls this session made; a flood of junk must not become a flood of UI work.
    const ids = tcc.ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256).slice(0, 64);
    if (ids.length) events.push({ kind: 'toolCallCancellation', ids });
  }

  if (isObj(msg.goAway)) {
    const timeLeftMs = parseDurationMs(msg.goAway.timeLeft);
    events.push(timeLeftMs === undefined ? { kind: 'goAway' } : { kind: 'goAway', timeLeftMs });
  }

  const sru = msg.sessionResumptionUpdate;
  if (isObj(sru)) {
    const raw = typeof sru.newHandle === 'string' ? sru.newHandle : '';
    const handle = RESUMPTION_HANDLE_RE.test(raw) ? raw : '';
    // proto3 JSON omits `false`; per the reference newHandle is empty whenever resumable=false, so a
    // non-empty handle with no flag means resumable.
    const resumable = handle.length > 0 && sru.resumable !== false;
    events.push({ kind: 'resumption', handle, resumable });
  }

  const um = msg.usageMetadata;
  if (isObj(um)) {
    const total = nonNegInt(um.totalTokenCount);
    const prompt = nonNegInt(um.promptTokenCount);
    const response = nonNegInt(um.responseTokenCount);
    const totalTokens = total ?? (prompt !== undefined || response !== undefined ? (prompt ?? 0) + (response ?? 0) : undefined);
    events.push(totalTokens === undefined ? { kind: 'usage' } : { kind: 'usage', totalTokens });
  }

  // Not a documented server message (the WS reports failures as close codes), but tolerate an
  // `{error:{message}}` / `{error:"…"}` frame so it can never be silently dropped.
  const err = msg.error;
  if (typeof err === 'string' && err.trim()) events.push({ kind: 'error', message: err.slice(0, 500) });
  else if (isObj(err)) {
    const m = typeof err.message === 'string' && err.message.trim() ? err.message : 'Live API error';
    events.push({ kind: 'error', message: m.slice(0, 500) });
  }

  return events;
}

/**
 * Parse ONE server frame (the JSON object, or its raw JSON string) into parity events, in the order a
 * player should apply them: setupComplete, interrupted, inputTranscript, audio…, searchStart, outputTranscript,
 * grounding, turnComplete, toolCall, toolCallCancellation, goAway, resumption, usage, error. A frame can yield several
 * (e.g. audio + turnComplete + usage). Unknown kinds (generationComplete, waitingForInput, …) yield
 * nothing. Malformed input → []. Never throws.
 */
export function parseLiveServerMessage(raw: unknown): LiveServerEvent[] {
  try {
    let value: unknown = raw;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return []; }
    }
    return isObj(value) ? parseMessageObject(value) : [];
  } catch {
    // Hostile shapes (throwing getters/proxies) must never break the socket's message loop.
    return [];
  }
}

/**
 * Build the authenticated WS URL. The credential dictates BOTH the query param AND the version+method:
 * ephemeral token → v1alpha/BidiGenerateContentConstrained + ?access_token; api key (dev-only) →
 * v1beta/BidiGenerateContent + ?key. `wsBase` overrides only the host (tests / future host changes). A relay ticket
 * (config.relayUrl) opens our Live relay instead, which speaks the same wire to the browser.
 */
