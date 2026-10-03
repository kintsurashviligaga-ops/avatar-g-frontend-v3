'use client';

/**
 * hooks/chat/useChatStream.ts — one streamed chat turn against `/api/chat/gemini`, extracted from
 * OmniStudio's `streamChat` closure.
 *
 * The hook owns the transport: fetch, the incremental frame parser, the watchdog and its own
 * AbortController. The streamed text goes into an external store (`components/chat/chatStreamStore.ts`),
 * not into host state, so only `<StreamingBubble>` re-renders per chunk. The host learns about the
 * outcome through callbacks and the promise `start()` returns. Persisting the turn and reading it aloud
 * stay with the host.
 *
 * ⚠️ EVERY FUNCTION THIS RETURNS KEEPS ITS IDENTITY FOR THE LIFE OF THE COMPONENT. OmniStudio's `send` has
 * about 70 dependencies. A `start` that changed identity whenever a callback option changed would rebuild
 * that callback on every render and bring back the stale-closure bugs the host's refs were added to
 * contain. So the options are read through a ref at call time. The callbacks always see the latest props,
 * and the controller object never changes.
 *
 * ⚠️ THE ABORTCONTROLLER IS THIS HOOK'S OWN. The old closure shared `genIdRef`/`abortRef` with every
 * generation lane, so a chat Stop also cancelled an image render and a new render superseded a chat
 * answer. `stop()` here aborts only the chat stream.
 *
 * ⚠️ A FAILED ANSWER MUST LOOK LIKE A FAILURE. The old client turned every non-OK response into one generic
 * "Something went wrong" and turned any stream into success. An `{error}` frame, a 401, a 413 or a stalled
 * connection now each produce a typed `ChatStreamError` with a localized message, and a 401 also calls
 * `onAuthRequired` so the host can open sign-in instead of showing an error.
 *
 * ⚠️ THE ROUTE'S OWN NOTICE WINS OVER THE GENERIC TEXT FOR ITS CODE. With `protocol: 2` every error frame used to be
 * re-worded from `code` alone, so a spent daily cap read "too many requests, try again" (with a Retry button), a
 * guest's over-long message read "sign in", and the platform budget read "your daily limit". The route now tags each
 * notice it writes with `lang`; when that is this hook's locale the notice itself is shown, and `retryable` says
 * whether a Retry button makes sense (false for every policy refusal).
 *
 * HOW A HOST READS THE OUTCOME OF A TURN (the result of `start()`, the callbacks and the store all agree):
 *   · finished: `result.status === 'done'`; `result.truncated` (also `onDone(…, { truncated })` and
 *     `store.getSnapshot().truncated`) is true when the reply stopped at the output-token limit;
 *   · failed:   `result.status === 'error'`; `result.error.message` is the text to show and `result.error.retryable`
 *     (also `onError(error)` and `store.getSnapshot().error`) is false when a Retry button would only fail again.
 */

import { useEffect, useRef, useState } from 'react';
import { createFrameParser, isChatErrorCode, type ChatErrorCode, type ChatFrame } from '@/lib/chat/sse';
import {
  createChatStreamStore,
  type ChatLocale,
  type ChatSource,
  type ChatStreamError,
  type ChatStreamErrorReason,
  type ChatStreamMeta,
  type ChatStreamStore,
  type ChatStreamUsage,
  type ChatStreamWriter,
} from '@/components/chat/chatStreamStore';

export type {
  ChatLocale,
  ChatSource,
  ChatStreamError,
  ChatStreamErrorReason,
  ChatStreamMeta,
  ChatStreamStore,
  ChatStreamUsage,
} from '@/components/chat/chatStreamStore';

export const CHAT_STREAM_ENDPOINT = '/api/chat/gemini';

/**
 * Before the first text frame the risk is a connection that never produces anything. After it, the risk
 * is a stream that stalls mid-answer. The pre-token window is tighter because 45 s of a blank bubble is
 * indistinguishable from a hang to the person waiting, while a 45 s gap inside a visibly growing answer is
 * a slow provider that is still working. Any received bytes (a keepalive, a meta frame) re-arm the timer.
 */
export const FIRST_TOKEN_TIMEOUT_MS = 20_000;
export const IDLE_TIMEOUT_MS = 45_000;

/** Caps how much of an error body is read. A misrouted HTML page can be large. */
const MAX_ERROR_BODY_CHARS = 4_000;

export interface ChatStreamResult {
  status: 'done' | 'error' | 'aborted';
  text: string;
  meta: ChatStreamMeta | null;
  sources: ChatSource[];
  usage: ChatStreamUsage | null;
  error: ChatStreamError | null;
  ttftMs: number | null;
  turnId: string | null;
  /** The server sent `{"truncated":true}`: the reply stopped at the output-token limit, so `text` is cut short. */
  truncated: boolean;
}

/** Facts about a finished reply beyond its text (an object, so more can be added without another positional arg). */
export interface ChatStreamDoneInfo {
  /** The reply stopped at the output-token limit — offer "continue" instead of presenting it as complete. */
  truncated: boolean;
}

export interface ChatStreamCallbacks {
  /** The stream completed without an error. Not called for failures or for `stop()`. */
  onDone?: (
    finalText: string,
    meta: ChatStreamMeta | null,
    sources: ChatSource[],
    usage: ChatStreamUsage | null,
    info: ChatStreamDoneInfo,
  ) => void;
  /** The stream failed. `partial` holds whatever arrived before the failure. Not called for `stop()`. */
  onError?: (error: ChatStreamError, partial: Omit<ChatStreamResult, 'status' | 'error'>) => void;
  /** The server answered 401, or sent an `auth_required` error frame. Called before `onError`. */
  onAuthRequired?: () => void;
  /** The first text frame arrived. The time-to-first-token is what the user feels as "the wait". */
  onFirstToken?: (ttftMs: number) => void;
}

export interface UseChatStreamOptions extends ChatStreamCallbacks {
  locale?: ChatLocale;
  endpoint?: string;
  firstTokenTimeoutMs?: number;
  idleTimeoutMs?: number;
  /** Injected for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Use an existing store instead of the hook's own. Read once, on the first render. */
  store?: ChatStreamStore;
}

export interface ChatStreamStartOptions {
  /** The host's id for the turn, echoed in the store snapshot and the result. */
  turnId?: string | null;
}

export interface ChatStreamController {
  readonly store: ChatStreamStore;
  /**
   * POSTs `body` as JSON and streams the answer into the store. A stream already running is aborted first
   * (it resolves as `'aborted'`). Never rejects.
   */
  start(body: unknown, opts?: ChatStreamStartOptions): Promise<ChatStreamResult>;
  /** Aborts the running stream, keeping its partial text. No-op when nothing is running. */
  stop(): void;
  /** True while a stream is in flight. */
  isActive(): boolean;
  /** Aborts any running stream and returns the store to idle. */
  reset(): void;
}

// ─── Localized messages ──────────────────────────────────────────────────────

type Localized = Record<ChatLocale, string>;

const CODE_MESSAGES: Record<ChatErrorCode, Localized> = {
  auth: {
    ka: 'AI სერვისი დროებით მიუწვდომელია (ხარვეზი ჩვენს მხარესაა). უკვე ვასწორებთ.',
    en: 'The AI service is temporarily unavailable (a problem on our side). We are fixing it.',
    ru: 'Сервис ИИ временно недоступен (проблема на нашей стороне). Мы уже исправляем.',
  },
  quota: {
    ka: 'AI სერვისი დროებით მიუწვდომელია. სცადე ცოტა ხანში.',
    en: 'The AI service is temporarily unavailable. Please try again a little later.',
    ru: 'Сервис ИИ временно недоступен. Попробуйте чуть позже.',
  },
  rate_limited: {
    ka: 'ახლა ძალიან ბევრი მოთხოვნაა. დაელოდე წამით და სცადე თავიდან.',
    en: 'Too many requests right now. Wait a moment and try again.',
    ru: 'Сейчас слишком много запросов. Подождите немного и попробуйте снова.',
  },
  model_missing: {
    ka: 'მოდელი ახლა მიუწვდომელია. სცადე თავიდან.',
    en: 'The model is unavailable right now. Please try again.',
    ru: 'Модель сейчас недоступна. Попробуйте снова.',
  },
  safety: {
    ka: 'ამ მოთხოვნაზე პასუხს ვერ გაგცემ, უსაფრთხოების ფილტრმა შეაჩერა. სცადე სხვაგვარად ჩამოაყალიბო.',
    en: "I can't answer that: the safety filter stopped it. Try rephrasing.",
    ru: 'Не могу ответить: сработал фильтр безопасности. Попробуйте переформулировать.',
  },
  network: {
    ka: 'კავშირის პრობლემაა. შეამოწმე ინტერნეტი და სცადე თავიდან.',
    en: 'Connection problem. Check your internet and try again.',
    ru: 'Проблема с подключением. Проверьте интернет и попробуйте снова.',
  },
  // The PLATFORM's AI budget (shared by everyone), not the user's own limit — that one is `daily_cap`.
  budget: {
    ka: 'პლატფორმის დღევანდელი AI ბიუჯეტი ამოიწურა. სცადე ცოტა ხანში.',
    en: "The platform's AI budget for today is used up. Please try again later.",
    ru: 'Дневной бюджет ИИ платформы исчерпан. Попробуйте позже.',
  },
  unavailable: {
    ka: 'პასუხის მიღება ვერ მოხერხდა. სცადე თავიდან.',
    en: 'Something went wrong. Please try again.',
    ru: 'Что-то пошло не так. Попробуйте снова.',
  },
  bad_request: {
    ka: 'მოთხოვნის დამუშავება ვერ მოხერხდა.',
    en: "The request couldn't be processed.",
    ru: 'Не удалось обработать запрос.',
  },
  auth_required: {
    ka: 'ჩატის გასაგრძელებლად შედი ანგარიშში.',
    en: 'Sign in to continue the chat.',
    ru: 'Войдите, чтобы продолжить чат.',
  },
  daily_cap: {
    ka: 'ჩატის დღიური ლიმიტი ამოიწურა. სცადე ხვალ.',
    en: "You've reached today's chat limit. Please come back tomorrow.",
    ru: 'Дневной лимит сообщений исчерпан. Возвращайтесь завтра.',
  },
  guest_limit: {
    ka: 'სტუმრის დღევანდელი შეტყობინებები ამოიწურა. შედი ან შექმენი უფასო ანგარიში და გააგრძელე საუბარი.',
    en: "You've used today's guest messages. Sign in or create a free account to keep chatting.",
    ru: 'Гостевые сообщения на сегодня закончились. Войдите или создайте бесплатный аккаунт, чтобы продолжить.',
  },
  too_long: {
    ka: 'შეტყობინება ძალიან გრძელია. შეამოკლე და სცადე თავიდან.',
    en: 'The message is too long. Shorten it and try again.',
    ru: 'Сообщение слишком длинное. Сократите его и попробуйте снова.',
  },
};

const REASON_MESSAGES: Partial<Record<ChatStreamErrorReason, Localized>> = {
  timeout: {
    ka: 'პასუხს ძალიან დიდი დრო სჭირდება. სცადე თავიდან.',
    en: 'The answer is taking too long. Please try again.',
    ru: 'Ответ занимает слишком много времени. Попробуйте снова.',
  },
  too_large: {
    ka: 'მიმაგრებული ფაილები ძალიან დიდია. მოაშორე ზოგი და სცადე თავიდან.',
    en: 'The attachments are too large. Remove some and try again.',
    ru: 'Вложения слишком большие. Удалите часть и попробуйте снова.',
  },
  empty: {
    ka: 'პასუხი ცარიელი დაბრუნდა. სცადე თავიდან.',
    en: 'The answer came back empty. Please try again.',
    ru: 'Ответ пришёл пустым. Попробуйте снова.',
  },
};

function normLocale(locale: string | undefined | null): ChatLocale {
  return locale === 'en' || locale === 'ru' ? locale : 'ka';
}

/** The user-facing text for a failure. A transport reason (timeout, too large, empty) wins over the code. */
export function chatErrorMessage(code: ChatErrorCode, locale?: string | null, reason?: ChatStreamErrorReason): string {
  const l = normLocale(locale);
  const byReason = reason ? REASON_MESSAGES[reason] : undefined;
  return (byReason ?? CODE_MESSAGES[code] ?? CODE_MESSAGES.unavailable)[l];
}

const RETRYABLE: ReadonlySet<ChatErrorCode> = new Set<ChatErrorCode>(['rate_limited', 'network', 'unavailable', 'model_missing']);

/** Codes that are a sign-in prompt: the host opens the sign-in sheet (`onAuthRequired`) as well as showing the text. */
const SIGN_IN_CODES: ReadonlySet<ChatErrorCode> = new Set<ChatErrorCode>(['auth_required', 'guest_limit']);

/** Longest route notice shown as is; anything longer is not a notice we wrote. */
const MAX_NOTICE_CHARS = 600;

/**
 * The route's own notice, ready to show: the legacy "⚠️ " lead is dropped (the host draws its own), whitespace is
 * trimmed, and an empty or oversized text is refused (''), so the generic text for the code is used instead.
 */
function noticeText(raw: string): string {
  const t = String(raw ?? '').replace(/^\s*\u26a0\ufe0f?\s*/u, '').trim();
  return t && t.length <= MAX_NOTICE_CHARS ? t : '';
}

function makeError(
  code: ChatErrorCode,
  locale: ChatLocale,
  reason: ChatStreamErrorReason,
  extra: { retryable?: boolean; detail?: string; status?: number; retryAfterSec?: number; message?: string } = {},
): ChatStreamError {
  const err: ChatStreamError = {
    code,
    retryable: extra.retryable ?? (RETRYABLE.has(code) || reason === 'timeout' || reason === 'empty'),
    message: extra.message || chatErrorMessage(code, locale, reason),
    reason,
  };
  if (extra.detail) err.detail = extra.detail.slice(0, 500);
  if (typeof extra.status === 'number') err.status = extra.status;
  if (typeof extra.retryAfterSec === 'number' && Number.isFinite(extra.retryAfterSec)) err.retryAfterSec = extra.retryAfterSec;
  return err;
}

// ─── HTTP failure mapping ────────────────────────────────────────────────────

function codeForStatus(status: number): ChatErrorCode {
  if (status === 401) return 'auth_required';
  if (status === 402) return 'budget';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'unavailable';
  if (status >= 400 && status < 500) return 'bad_request';
  return 'unavailable';
}

function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers?.get?.('retry-after');
  if (!raw) return undefined;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return n;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, Math.round((at - Date.now()) / 1000)) : undefined;
}

async function readErrorBody(res: Response): Promise<{ code?: ChatErrorCode; detail?: string; authRequired?: boolean }> {
  let raw = '';
  try {
    raw = (await res.text()).slice(0, MAX_ERROR_BODY_CHARS);
  } catch (_err) {
    return {};
  }
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const err = j.error;
    const out: { code?: ChatErrorCode; detail?: string; authRequired?: boolean } = {};
    if (j.authRequired === true || err === 'auth_required') out.authRequired = true;
    if (err && typeof err === 'object' && !Array.isArray(err)) {
      const e = err as Record<string, unknown>;
      if (isChatErrorCode(e.code)) out.code = e.code;
      if (typeof e.message === 'string') out.detail = e.message;
    } else if (isChatErrorCode(err)) {
      out.code = err;
    } else if (isChatErrorCode(j.code)) {
      out.code = j.code;
    }
    if (!out.detail && typeof j.message === 'string') out.detail = j.message;
    if (!out.detail && typeof err === 'string') out.detail = err;
    return out;
  } catch (_err) {
    return raw ? { detail: raw.slice(0, 200) } : {};
  }
}

async function httpFailure(res: Response, locale: ChatLocale): Promise<ChatStreamError> {
  const body = await readErrorBody(res);
  const status = res.status;
  if (status === 413) return makeError('bad_request', locale, 'too_large', { status, detail: body.detail, retryable: false });
  const code: ChatErrorCode = status === 401 || body.authRequired ? 'auth_required' : body.code ?? codeForStatus(status);
  return makeError(code, locale, 'http', {
    status,
    detail: body.detail,
    retryAfterSec: status === 429 ? parseRetryAfter(res) : undefined,
  });
}

// ─── The stream runner (framework-free, so it can be tested without React) ──

export interface RunChatStreamInput extends ChatStreamCallbacks {
  body: unknown;
  writer: ChatStreamWriter;
  signal: AbortSignal;
  /** Aborts the request. Called by the watchdog. */
  abort: () => void;
  locale?: ChatLocale;
  endpoint?: string;
  firstTokenTimeoutMs?: number;
  idleTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  turnId?: string | null;
  now?: () => number;
}

function mergeSources(prev: ChatSource[], next: ReadonlyArray<ChatSource>): ChatSource[] {
  const seen = new Set(prev.map((s) => s.url));
  const out = prev.slice();
  for (const s of next) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s.title !== undefined ? { url: s.url, title: s.title } : { url: s.url });
  }
  return out;
}

/**
 * Runs one stream to completion. Writes go to `writer`; the outcome is reported through the callbacks and
 * the returned result. Never rejects.
 */
export async function runChatStream(input: RunChatStreamInput): Promise<ChatStreamResult> {
  const locale = normLocale(input.locale);
  const firstTokenMs = input.firstTokenTimeoutMs ?? FIRST_TOKEN_TIMEOUT_MS;
  const idleMs = input.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const now = input.now ?? Date.now;
  // Wrapped, never stored bare: some embedded browsers throw "Illegal invocation" for a detached `fetch`.
  const fetchImpl: typeof fetch | undefined =
    input.fetchImpl ?? (typeof fetch === 'function' ? (url, init) => fetch(url, init) : undefined);
  const { writer, signal } = input;
  const t0 = now();

  let text = '';
  let meta: ChatStreamMeta | null = null;
  let sources: ChatSource[] = [];
  let usage: ChatStreamUsage | null = null;
  let frameError: ChatStreamError | null = null;
  let truncated = false;
  let sawDone = false;
  let ttftMs: number | null = null;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const disarm = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const arm = () => {
    disarm();
    timer = setTimeout(() => {
      timedOut = true;
      input.abort();
    }, ttftMs === null ? firstTokenMs : idleMs);
  };

  const result = (status: ChatStreamResult['status'], error: ChatStreamError | null): ChatStreamResult => ({
    status,
    text,
    meta,
    sources,
    usage,
    error,
    ttftMs,
    turnId: input.turnId ?? null,
    truncated,
  });

  const settleAbort = (): ChatStreamResult => {
    if (timedOut) return fail(makeError('network', locale, 'timeout', { retryable: true }));
    writer.abort();
    return result('aborted', null);
  };

  function fail(error: ChatStreamError): ChatStreamResult {
    // ⚠️ A stopped or superseded stream reports nothing. An await (reading an error body, say) can span the
    // user's Stop or their next send, and an onError for a turn they already abandoned would paint an error
    // under the NEW turn. The watchdog's own abort is the one abort that IS a failure.
    if ((signal.aborted && !timedOut) || !writer.isCurrent()) {
      writer.abort();
      return result('aborted', null);
    }
    writer.fail(error);
    const r = result('error', error);
    if (SIGN_IN_CODES.has(error.code)) input.onAuthRequired?.();
    input.onError?.(error, {
      text: r.text,
      meta: r.meta,
      sources: r.sources,
      usage: r.usage,
      ttftMs: r.ttftMs,
      turnId: r.turnId,
      truncated: r.truncated,
    });
    return r;
  }

  const onFrame = (frame: ChatFrame | 'DONE') => {
    if (sawDone || frameError) return; // nothing after the terminator or a failure counts
    if (frame === 'DONE') {
      sawDone = true;
      return;
    }
    if ('text' in frame) {
      if (ttftMs === null) {
        ttftMs = Math.max(0, now() - t0);
        input.onFirstToken?.(ttftMs);
        arm(); // switch the watchdog from the first-token window to the idle window
      }
      text += frame.text;
      writer.appendText(frame.text);
    } else if ('meta' in frame) {
      meta = frame.meta;
      writer.setMeta(frame.meta);
    } else if ('sources' in frame) {
      sources = mergeSources(sources, frame.sources);
      writer.setSources(sources);
    } else if ('usage' in frame) {
      usage = frame.usage;
      writer.setUsage(frame.usage);
    } else if ('truncated' in frame) {
      truncated = true;
      writer.setTruncated();
    } else if ('error' in frame) {
      // The route's notice is shown only when it is in THIS locale (`lang`); a frame without `lang` (chatStream's
      // English fallback, an older route) is re-localized by its code, so provider wording never reaches the user.
      const own = frame.error.lang === locale ? noticeText(frame.error.message) : '';
      frameError = makeError(frame.error.code, locale, 'frame', {
        retryable: frame.error.retryable,
        detail: frame.error.message,
        ...(own ? { message: own } : {}),
      });
    }
  };

  if (!fetchImpl) return fail(makeError('network', locale, 'network', { detail: 'fetch unavailable' }));

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const cancelReader = () => {
    // A pending read() must settle when we abort. Cancelling the reader resolves it as done; the
    // `signal.aborted` checks below then report the abort instead of mistaking it for a clean EOF.
    try {
      void reader?.cancel().catch(() => undefined);
    } catch (_err) {
      /* already released */
    }
  };
  signal.addEventListener('abort', cancelReader);

  try {
    arm(); // covers connection setup and the wait for the first token
    const res = await fetchImpl(input.endpoint ?? CHAT_STREAM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.body),
      credentials: 'include',
      signal,
    });

    if (!res.ok) {
      // The watchdog stays armed while the error body is read: a stalled error body must not hang the turn.
      const error = await httpFailure(res, locale);
      disarm();
      return fail(error);
    }
    if (!res.body) {
      disarm();
      return fail(makeError('unavailable', locale, 'empty', { status: res.status }));
    }
    const contentType = res.headers?.get?.('content-type') ?? '';
    if (/application\/json/i.test(contentType)) {
      // A JSON body on a 200 is not a stream: an error envelope or a misrouted request.
      const body = await readErrorBody(res);
      disarm();
      return fail(makeError(body.code ?? 'unavailable', locale, 'http', { status: res.status, detail: body.detail }));
    }

    reader = res.body.getReader();
    if (signal.aborted) cancelReader();
    const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
    const parser = createFrameParser(onFrame);
    for (;;) {
      const { value, done } = await reader.read();
      if (done || signal.aborted) break;
      arm(); // bytes arrived: the connection is alive
      if (value && decoder) parser.push(decoder.decode(value, { stream: true }));
      if (sawDone || frameError) {
        cancelReader(); // the answer is complete; don't wait for the server to close the socket
        break;
      }
    }
    if (decoder && !signal.aborted) parser.push(decoder.decode());
    parser.end();
  } catch (err) {
    disarm();
    if (signal.aborted) return settleAbort();
    return fail(makeError('network', locale, 'network', { detail: err instanceof Error ? err.message : String(err) }));
  } finally {
    disarm();
    signal.removeEventListener('abort', cancelReader);
  }

  if (signal.aborted) return settleAbort();
  if (frameError) return fail(frameError);
  if (!text) {
    // A clean close with no text and no error frame: the old route's silent "0 characters" outcome.
    return fail(makeError('unavailable', locale, 'empty'));
  }
  if (!writer.isCurrent()) return result('aborted', null);
  writer.finish();
  input.onDone?.(text, meta, sources, usage, { truncated });
  return result('done', null);
}

// ─── The hook ────────────────────────────────────────────────────────────────

interface ActiveRun {
  ac: AbortController;
}

export function useChatStream(options: UseChatStreamOptions = {}): ChatStreamController {
  // Latest options, read at call time. Assigned during render so a `start()` issued from an event
  // handler in the same commit already sees the new callbacks.
  const optsRef = useRef(options);
  optsRef.current = options;

  const activeRef = useRef<ActiveRun | null>(null);

  const [controller] = useState<ChatStreamController>(() => {
    const store = options.store ?? createChatStreamStore();

    const stop = () => {
      const run = activeRef.current;
      if (!run) return;
      activeRef.current = null;
      // ⚠️ FLUSH BEFORE THE ABORT. Text deltas are committed once per animation frame, and the abort settles only
      // after the reader's pending read resolves — a microtask later. The host reads the snapshot right after
      // stop() (OmniStudio's endChatStream keeps the partial reply), so without this the last frame's worth of
      // tokens the user had already been sent was missing from the bubble.
      store.flush();
      try {
        run.ac.abort();
      } catch (_err) {
        /* noop */
      }
    };

    const start = async (body: unknown, startOpts: ChatStreamStartOptions = {}): Promise<ChatStreamResult> => {
      stop(); // one chat stream at a time; the previous one resolves as 'aborted'
      const ac = new AbortController();
      const writer = store.begin(startOpts.turnId ?? null);
      const run: ActiveRun = { ac };
      activeRef.current = run;
      const o = optsRef.current;
      // The callbacks are wrapped so they read the options current when they FIRE, not when start() ran.
      try {
        return await runChatStream({
          body,
          writer,
          signal: ac.signal,
          abort: () => ac.abort(),
          locale: o.locale,
          endpoint: o.endpoint,
          firstTokenTimeoutMs: o.firstTokenTimeoutMs,
          idleTimeoutMs: o.idleTimeoutMs,
          fetchImpl: o.fetchImpl,
          turnId: startOpts.turnId ?? null,
          onDone: (...args) => optsRef.current.onDone?.(...args),
          onError: (...args) => optsRef.current.onError?.(...args),
          onAuthRequired: () => optsRef.current.onAuthRequired?.(),
          onFirstToken: (ms) => optsRef.current.onFirstToken?.(ms),
        });
      } finally {
        if (activeRef.current === run) activeRef.current = null;
      }
    };

    return {
      store,
      start,
      stop,
      isActive: () => activeRef.current !== null,
      reset: () => {
        stop();
        store.reset();
      },
    };
  });

  // Unmount aborts the stream, so a closed chat never keeps a socket open. The controller itself stays
  // usable: React StrictMode unmounts and remounts effects once in development.
  useEffect(() => controller.stop, [controller]);

  return controller;
}
