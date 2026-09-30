/**
 * The chat stream's wire codec: one encoder for the route, one incremental parser for the browser.
 * Pure and isomorphic. No Node APIs and no DOM, so the server and the client share one copy and can't drift.
 *
 * Wire format, as `app/api/chat/gemini/route.ts` has always emitted it:
 *
 *   data: {"meta":{"provider":"gemini","model":"gemini-3.8-flash"}}\n\n
 *   data: {"text":"გამარჯობა"}\n\n
 *   data: [DONE]\n\n
 *
 * New frames use the same envelope: `{sources}`, `{usage}` and `{error}`. The legacy `{text}` / `{meta}` /
 * `[DONE]` frames parse unchanged, so the route and the client can ship separately in either order.
 *
 * ⚠️ THE OLD CLIENT LOST FRAMES THAT WERE SPLIT ACROSS CHUNKS. It split the buffer on `\n\n`. That only
 * worked while the only separator ever sent was LF-LF. A proxy that rewrote line endings to CRLF made every
 * frame wait in the buffer until the stream ended. A `data:` line with nothing after it, or one ending in a
 * bare CR, fell through the regex, and so did a JSON line that failed to parse. This parser works line by
 * line and follows the SSE line rules (LF, CRLF or bare CR). It carries the unterminated tail over to the
 * next chunk and only dispatches complete lines, so a frame split across any number of chunks still arrives
 * whole.
 *
 * ⚠️ ONE `data:` LINE IS ONE FRAME. `JSON.stringify` escapes every CR and LF inside strings, so an encoded
 * frame can never span two lines. Parsing each line on its own means a producer that leaves out the blank
 * separator line still works. We don't join multi-line `data:` fields the way the SSE spec describes
 * because no producer of ours emits them.
 *
 * ⚠️ BYTES → STRING IS THE CALLER'S JOB, WITH `TextDecoder.decode(chunk, { stream: true })`. A Georgian
 * letter is 3 bytes in UTF-8, and a network chunk can end in the middle of one. A decoder without
 * `stream: true` turns that into two U+FFFD characters, and no parser can repair them afterwards.
 */

export type ChatErrorCode =
  | 'auth'
  | 'quota'
  | 'rate_limited'
  | 'model_missing'
  | 'safety'
  | 'network'
  | 'budget'
  | 'unavailable'
  | 'bad_request'
  | 'auth_required';

export type ChatFrame =
  | { text: string }
  | { meta: { provider: string; model: string; partial?: boolean } }
  | { sources: Array<{ url: string; title?: string }> }
  | { usage: { model: string; inputTokens?: number; outputTokens?: number; totalTokens?: number } }
  | { error: { code: ChatErrorCode; retryable: boolean; message: string } };

/** Every code the client knows how to localize. The order matches the `ChatErrorCode` union. */
export const CHAT_ERROR_CODES: readonly ChatErrorCode[] = [
  'auth',
  'quota',
  'rate_limited',
  'model_missing',
  'safety',
  'network',
  'budget',
  'unavailable',
  'bad_request',
  'auth_required',
] as const;

const ERROR_CODE_SET: ReadonlySet<string> = new Set(CHAT_ERROR_CODES);

export function isChatErrorCode(v: unknown): v is ChatErrorCode {
  return typeof v === 'string' && ERROR_CODE_SET.has(v);
}

/**
 * Codes that are worth retrying when the producer didn't say. A burst limit, a dropped connection and an
 * upstream outage can clear up; a bad key, an empty wallet, a safety stop or a malformed request won't.
 */
const RETRYABLE_BY_DEFAULT: ReadonlySet<ChatErrorCode> = new Set<ChatErrorCode>(['rate_limited', 'network', 'unavailable']);

const DONE_PAYLOAD = '[DONE]';

/**
 * ⚠️ A LINE THAT NEVER ENDS MUST NOT GROW THE BUFFER FOREVER. A broken proxy or a misrouted non-SSE body
 * with no line breaks would otherwise buffer until the tab runs out of memory. Real frames are far smaller
 * than this: a text delta is a few hundred characters and a sources list is a few KB. Anything longer is
 * dropped whole, up to its next line break.
 */
export const MAX_SSE_LINE_CHARS = 1_000_000;

/** Encodes one frame as an SSE event: `data: <json>\n\n`, or `data: [DONE]\n\n` for the terminator. */
export function encodeFrame(frame: ChatFrame | 'DONE'): string {
  if (frame === 'DONE') return `data: ${DONE_PAYLOAD}\n\n`;
  return `data: ${JSON.stringify(frame)}\n\n`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finiteCount(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

/**
 * ⚠️ ONLY http(s) LINKS SURVIVE. Source chips render as anchors. A `javascript:` or `data:` URL arriving in
 * a sources frame, from a compromised upstream or a prompt-injected grounding result, would be one tap from
 * script execution. The codec is where server data enters the browser, so the scheme is checked here once
 * and not in every component that renders a link.
 */
const SAFE_URL = /^https?:\/\//i;

function decodeSources(v: unknown): ChatFrame | null {
  if (!Array.isArray(v)) return null;
  const sources: Array<{ url: string; title?: string }> = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!url || !SAFE_URL.test(url)) continue;
    const title = typeof item.title === 'string' && item.title.trim() ? item.title : undefined;
    sources.push(title !== undefined ? { url, title } : { url });
  }
  return sources.length > 0 ? { sources } : null;
}

function decodeMeta(v: unknown): ChatFrame | null {
  if (!isRecord(v) || typeof v.provider !== 'string' || typeof v.model !== 'string') return null;
  const meta: { provider: string; model: string; partial?: boolean } = { provider: v.provider, model: v.model };
  if (typeof v.partial === 'boolean') meta.partial = v.partial;
  return { meta };
}

function decodeUsage(v: unknown): ChatFrame | null {
  if (!isRecord(v) || typeof v.model !== 'string') return null;
  const usage: { model: string; inputTokens?: number; outputTokens?: number; totalTokens?: number } = { model: v.model };
  const input = finiteCount(v.inputTokens);
  const output = finiteCount(v.outputTokens);
  const total = finiteCount(v.totalTokens);
  if (input !== undefined) usage.inputTokens = input;
  if (output !== undefined) usage.outputTokens = output;
  if (total !== undefined) usage.totalTokens = total;
  return { usage };
}

/**
 * ⚠️ AN ERROR FRAME IS NEVER DROPPED FOR BEING MALFORMED. The point of the typed error is that a failed
 * answer shows up as a failure and not as an empty bubble. So an unknown code is decoded as `'unavailable'`,
 * a bare string is taken as the message, and a missing `retryable` falls back to the code's default. It is
 * never discarded.
 */
function decodeError(v: unknown): ChatFrame | null {
  if (typeof v === 'string') {
    return { error: { code: 'unavailable', retryable: RETRYABLE_BY_DEFAULT.has('unavailable'), message: v } };
  }
  if (!isRecord(v)) return null;
  const code: ChatErrorCode = isChatErrorCode(v.code) ? v.code : 'unavailable';
  const retryable = typeof v.retryable === 'boolean' ? v.retryable : RETRYABLE_BY_DEFAULT.has(code);
  const message = typeof v.message === 'string' ? v.message : '';
  return { error: { code, retryable, message } };
}

/**
 * Decodes one `data:` payload into frames. It returns an empty array for anything unusable: malformed
 * JSON, a non-object, an unknown shape, or an empty text delta.
 *
 * One object may carry several known keys. No producer of ours sends that, but a legacy or third-party one
 * might, so each key becomes its own frame, in the order meta → text → sources → usage → error. That matches
 * the legacy client, which stamped the model badge before appending text from the same object.
 */
function decodePayload(payload: string): Array<ChatFrame | 'DONE'> {
  if (payload === DONE_PAYLOAD) return ['DONE'];
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (_err) {
    return []; // keepalive text, a truncated line or a proxy banner. Skip it and don't kill the stream.
  }
  if (!isRecord(parsed)) return [];
  const out: ChatFrame[] = [];
  if ('meta' in parsed) {
    const f = decodeMeta(parsed.meta);
    if (f) out.push(f);
  }
  if (typeof parsed.text === 'string' && parsed.text.length > 0) out.push({ text: parsed.text });
  if ('sources' in parsed) {
    const f = decodeSources(parsed.sources);
    if (f) out.push(f);
  }
  if ('usage' in parsed) {
    const f = decodeUsage(parsed.usage);
    if (f) out.push(f);
  }
  if ('error' in parsed) {
    const f = decodeError(parsed.error);
    if (f) out.push(f);
  }
  return out;
}

/**
 * Applies the SSE field rules to one complete line and returns the `data` value, or null. Blank lines,
 * `:` comments and the other fields (`event`, `id`, `retry`) are ignored.
 */
function dataValue(line: string): string | null {
  if (line === '' || line.charCodeAt(0) === 0x3a /* ':' */) return null;
  const colon = line.indexOf(':');
  const field = colon === -1 ? line : line.slice(0, colon);
  if (field !== 'data') return null;
  const value = colon === -1 ? '' : line.slice(colon + 1).trim();
  return value === '' ? null : value;
}

const LINE_BREAK = /\r\n|\r|\n/;

/**
 * An incremental parser for the chat stream. `push()` takes decoded text chunks of any size and split
 * point. `end()` flushes a final line that had no terminator, which happens when a server closes without
 * a trailing newline, and resets the parser.
 *
 * ⚠️ A trailing bare CR is treated as a complete line break. If it turns out to be the first half of a
 * CRLF split across two chunks, the LF that follows just makes a blank line, and blank lines are ignored.
 * So a frame is never held back waiting for a byte that may not arrive.
 *
 * If `onFrame` throws, the error reaches the caller of `push()`/`end()` and the rest of that chunk's lines
 * are not dispatched. The internal buffer has already moved past them, so the parser stays consistent.
 */
export function createFrameParser(onFrame: (frame: ChatFrame | 'DONE') => void): { push(chunk: string): void; end(): void } {
  let buf = '';
  let started = false;
  // True while we're dropping an oversized line, until its line break arrives.
  let discarding = false;

  const dispatchLine = (line: string) => {
    // The same cap applies to a line that arrived complete, so an oversized frame is dropped
    // however the chunks happened to fall.
    if (line.length > MAX_SSE_LINE_CHARS) return;
    const payload = dataValue(line);
    if (payload === null) return;
    for (const frame of decodePayload(payload)) onFrame(frame);
  };

  return {
    push(chunk: string) {
      if (typeof chunk !== 'string' || chunk.length === 0) return;
      if (!started) {
        started = true;
        // Per the SSE spec, one leading BOM is not part of the first line.
        if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
      }
      const lines = (buf + chunk).split(LINE_BREAK);
      buf = lines.pop() ?? '';
      if (discarding && lines.length > 0) {
        lines.shift(); // the tail end of the oversized line
        discarding = false;
      }
      if (buf.length > MAX_SSE_LINE_CHARS) {
        buf = '';
        discarding = true;
      }
      for (const line of lines) dispatchLine(line);
    },
    end() {
      const tail = discarding ? '' : buf;
      buf = '';
      started = false;
      discarding = false;
      if (tail) dispatchLine(tail);
    },
  };
}

/**
 * Decodes a complete SSE body in one call. Meant for tests and for callers that buffered the whole
 * response. Streaming consumers should use `createFrameParser`.
 */
export function decodeFrames(body: string): Array<ChatFrame | 'DONE'> {
  const frames: Array<ChatFrame | 'DONE'> = [];
  const parser = createFrameParser((f) => frames.push(f));
  parser.push(body);
  parser.end();
  return frames;
}
