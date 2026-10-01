/**
 * lib/voice/micAcquire.ts — get a microphone stream, or the precise reason there is none.
 *
 * WHY THIS EXISTS: Live voice made ONE getUserMedia call and reduced every rejection to `mic_unavailable`, throwing
 * away `e.name` — the one fact that says what went wrong. A device held by another app (NotReadableError), a PC with
 * no input (NotFoundError), an in-app browser with no API (TypeError) and a constraint the engine refused all showed
 * the same „მიკროფონი ვერ ჩაირთო“, and nothing retried. This module is the ladder a real device needs:
 *
 *   preflight   → an insecure page or a missing API is known before any prompt (in-app browsers named as such);
 *   permission  → the Permissions API hint (short timeout): an already-denied mic is reported without prompting;
 *   full        → echo cancellation + noise suppression + AGC, mono preferred;
 *   constraints → OverconstrainedError / a constraint TypeError: ask for less (basic, then bare `{audio:true}`);
 *   busy        → NotReadable / Abort / TrackStart: ask in-page holders to release, wait 400 ms, retry, wait 1 s,
 *                 retry, then an explicit non-default device (a stale "default" route after a Bluetooth switch);
 *   not found   → count inputs: none → not_found; some → one bare try;
 *   hang guard  → only when permission is already GRANTED (a prompt the user is reading must never time out).
 *
 * Every step re-checks `isCancelled()` (End pressed while this ran) and stops a stream that resolves late, so a
 * cancelled acquisition can never leave a hot microphone behind. Pure and injectable: no module state, every
 * browser API arrives through `MicDeps`.
 */

export type MicFailure =
  | 'insecure'
  | 'in_app'
  | 'no_api'
  | 'denied'
  | 'system_denied'
  | 'not_found'
  | 'busy'
  | 'constraint'
  | 'timeout'
  | 'unknown';

export type MicStep = 'full' | 'basic' | 'bare' | 'retry1' | 'retry2' | 'device';
export type MicPermission = PermissionState | 'unknown';

/** One getUserMedia call: which rung, what came back ('ok' on success), and how long it took. */
export interface MicAttempt {
  step: MicStep;
  name: string;
  message: string;
  ms: number;
}

interface MicResultBase {
  attempts: MicAttempt[];
  permission: MicPermission;
  /** Audio inputs the browser listed, when the ladder had a reason to ask. */
  audioInputs?: number;
}
export interface MicSuccess extends MicResultBase { ok: true; stream: MediaStream }
export interface MicFailureResult extends MicResultBase {
  ok: false;
  kind: MicFailure;
  /** The DOMException name of the deciding failure (e.g. 'NotReadableError'). */
  name: string;
  message: string;
  /** The caller cancelled; nothing to show. */
  cancelled?: boolean;
}
export type MicResult = MicSuccess | MicFailureResult;

export interface MicDeps {
  /** null = the API is absent (in-app browser, insecure page, very old engine). */
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null;
  enumerateDevices: (() => Promise<MediaDeviceInfo[]>) | null;
  /** navigator.permissions.query({name:'microphone'}); null where unsupported. */
  queryPermission: (() => Promise<PermissionState>) | null;
  isSecureContext: boolean;
  userAgent: string;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Ask every other in-page mic holder to let go (lib/voice/micBus). */
  requestRelease: () => void;
}

export interface AcquireMicOptions {
  /**
   * A getUserMedia already started inside the user's tap (lib/voice/livePrime). It stands in for the `full` rung;
   * if it failed, the ladder continues from there instead of re-asking the same thing.
   */
  initial?: Promise<MediaStream> | null;
  permissionTimeoutMs?: number;
  hangTimeoutMs?: number;
}

export const MIC_CONSTRAINTS: Readonly<Record<'full' | 'basic' | 'bare', MediaStreamConstraints>> = {
  // All values are IDEAL (bare values / {ideal}), so this can never be the cause of an OverconstrainedError by
  // itself. AGC on matches the composer's dictation: Android shares one capture config per device, and three
  // different processing requests on one page is what it handles worst.
  full: { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 } } },
  basic: { audio: { echoCancellation: true } },
  bare: { audio: true },
};

/** Pauses before the two busy-device retries: long enough for a released device (or a Bluetooth HFP switch) to settle. */
export const MIC_BUSY_RETRY_DELAYS_MS: readonly [number, number] = [400, 1000];
export const MIC_PERMISSION_HINT_TIMEOUT_MS = 300;
export const MIC_HANG_TIMEOUT_MS = 15_000;

/**
 * Social in-app browsers and Android WebViews (incl. our own Capacitor shell, UA suffix `MyAvatarApp`). These are
 * where getUserMedia is missing or fails in ways a normal browser never does; the fix is "open it in a browser".
 */
const IN_APP_UA = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|TikTok|musical_ly|BytedanceWebview|MyAvatarApp|; wv\)/;

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_UA.test(userAgent || '');
}

const TIMEOUT_ERROR_NAME = 'TimeoutError';

type Classified = { kind: MicFailure; name: string; message: string };

function field(e: unknown, key: 'name' | 'message'): string {
  if (!e || (typeof e !== 'object' && typeof e !== 'function')) return typeof e === 'string' && key === 'message' ? e : '';
  const v = (e as Record<string, unknown>)[key];
  return typeof v === 'string' ? v : '';
}

/**
 * getUserMedia rejection → failure kind. Covers today's names AND the legacy ones older Chrome/Edge/WebViews still
 * throw (PermissionDeniedError, DevicesNotFoundError, TrackStartError, ConstraintNotSatisfiedError).
 */
export function classifyMicError(e: unknown): Classified {
  const name = field(e, 'name') || 'Error';
  const message = field(e, 'message').slice(0, 200);
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      // Chrome says "Permission denied by system" when the OS (macOS/Windows privacy settings) blocks the browser:
      // the site permission is fine and "allow it in the browser" would be the wrong advice.
      return { kind: /system/i.test(message) ? 'system_denied' : 'denied', name, message };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { kind: 'not_found', name, message };
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
    case 'SourceUnavailableError':
      return { kind: 'busy', name, message };
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
    // A TypeError from an EXISTING getUserMedia is a constraint dictionary the engine could not take (a missing
    // API never reaches this point — the preflight reports it).
    case 'TypeError':
      return { kind: 'constraint', name, message };
    case TIMEOUT_ERROR_NAME:
      return { kind: 'timeout', name, message };
    default:
      return { kind: 'unknown', name, message };
  }
}

function stopStream(stream: MediaStream | null | undefined): void {
  try { stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } }); } catch { /* noop */ }
}

/** Rejects with a TimeoutError when `p` has not settled in `ms`; a stream that arrives afterwards is stopped. */
function withHangGuard(p: Promise<MediaStream>, ms: number): Promise<MediaStream> {
  if (!(ms > 0)) return p;
  return new Promise<MediaStream>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      done = true;
      reject(Object.assign(new Error(`getUserMedia did not settle in ${ms} ms`), { name: TIMEOUT_ERROR_NAME }));
    }, ms);
    p.then(
      (s) => { if (done) { stopStream(s); return; } done = true; clearTimeout(timer); resolve(s); },
      (e) => { if (done) return; done = true; clearTimeout(timer); reject(e); },
    );
  });
}

const PERMISSION_STATES: ReadonlySet<string> = new Set(['granted', 'denied', 'prompt']);

async function permissionHint(query: () => Promise<PermissionState>, ms: number): Promise<MicPermission> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const p = query(); // Firefox < 119 rejects 'microphone'; some engines throw synchronously
    return await new Promise<MicPermission>((resolve) => {
      timer = setTimeout(() => resolve('unknown'), ms);
      p.then((s) => resolve(PERMISSION_STATES.has(s) ? s : 'unknown'), () => resolve('unknown'));
    });
  } catch {
    return 'unknown';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type StepOutcome = { stream: MediaStream } | { err: Classified } | { cancelled: true };

export async function acquireMic(d: MicDeps, isCancelled: () => boolean, opts: AcquireMicOptions = {}): Promise<MicResult> {
  const attempts: MicAttempt[] = [];
  let permission: MicPermission = 'unknown';
  let audioInputs: number | undefined;
  const inApp = isInAppBrowser(d.userAgent);
  const initial = opts.initial ?? null;

  const base = (): MicResultBase => ({ attempts, permission, ...(audioInputs === undefined ? {} : { audioInputs }) });
  const failure = (kind: MicFailure, name: string, message: string): MicFailureResult => ({ ok: false, kind, name, message, ...base() });
  const cancelled = (): MicFailureResult => ({ ...failure('unknown', 'AbortError', 'cancelled'), cancelled: true });
  const dropInitial = () => { if (initial) initial.then(stopStream, () => {}); };

  // ── Preflight: synchronous facts, no prompt. A primed request already proved the API exists. ──
  if (!initial) {
    if (!d.isSecureContext) return failure('insecure', 'SecurityError', 'getUserMedia needs a secure (https) context');
    if (!d.getUserMedia) {
      return failure(inApp ? 'in_app' : 'no_api', 'NotSupportedError', 'navigator.mediaDevices.getUserMedia is unavailable');
    }
  }

  // ── Permission hint. ⚠️ Only awaited when the API exists: with no Permissions API the first getUserMedia must
  // still be called synchronously (Live's start() runs inside the Retry tap). ──
  if (d.queryPermission) {
    permission = await permissionHint(d.queryPermission, opts.permissionTimeoutMs ?? MIC_PERMISSION_HINT_TIMEOUT_MS);
    if (isCancelled()) { dropInitial(); return cancelled(); }
    // Denied means getUserMedia would reject without asking anyway; saying so now skips a pointless request. (With a
    // primed request the prompt already happened — its own rejection is the better evidence.)
    if (!initial && permission === 'denied') return failure('denied', 'NotAllowedError', 'microphone permission is denied');
  }
  // A prompt may be on screen unless permission is already granted — a hang guard there would time out a user who
  // is simply reading it.
  const hangMs = permission === 'granted' ? (opts.hangTimeoutMs ?? MIC_HANG_TIMEOUT_MS) : 0;

  const tryStep = async (step: MicStep, constraints: MediaStreamConstraints, source?: Promise<MediaStream>): Promise<StepOutcome> => {
    if (isCancelled()) { if (source) source.then(stopStream, () => {}); return { cancelled: true }; }
    const t0 = d.now();
    let p: Promise<MediaStream>;
    if (source) {
      p = source;
    } else if (!d.getUserMedia) {
      return { err: { kind: inApp ? 'in_app' : 'no_api', name: 'NotSupportedError', message: 'getUserMedia is unavailable' } };
    } else {
      try { p = d.getUserMedia(constraints); } catch (e) { p = Promise.reject(e); } // a synchronous throw is a rejection
    }
    try {
      const stream = await withHangGuard(p, hangMs);
      if (isCancelled()) { stopStream(stream); return { cancelled: true }; }
      attempts.push({ step, name: 'ok', message: '', ms: Math.round(d.now() - t0) });
      return { stream };
    } catch (e) {
      const c = classifyMicError(e);
      attempts.push({ step, name: c.name, message: c.message, ms: Math.round(d.now() - t0) });
      if (isCancelled()) return { cancelled: true };
      return { err: c };
    }
  };

  const listInputs = async (): Promise<MediaDeviceInfo[] | null> => {
    if (!d.enumerateDevices) return null;
    try {
      const inputs = (await d.enumerateDevices()).filter((x) => x.kind === 'audioinput');
      audioInputs = inputs.length;
      return inputs;
    } catch {
      return null;
    }
  };

  let out = await tryStep('full', MIC_CONSTRAINTS.full, initial ?? undefined);
  if ('stream' in out) return { ok: true, stream: out.stream, ...base() };
  if ('cancelled' in out) return cancelled();
  let err = out.err;

  // 1) The engine refused the constraints: ask for less.
  if (err.kind === 'constraint') {
    for (const step of ['basic', 'bare'] as const) {
      out = await tryStep(step, MIC_CONSTRAINTS[step]);
      if ('stream' in out) return { ok: true, stream: out.stream, ...base() };
      if ('cancelled' in out) return cancelled();
      err = out.err;
      if (err.kind !== 'constraint') break;
    }
  }

  // 2) The device is held elsewhere or failed to start: release, back off, retry, then name a device explicitly.
  if (err.kind === 'busy') {
    d.requestRelease();
    for (let i = 0; i < MIC_BUSY_RETRY_DELAYS_MS.length; i++) {
      await d.sleep(MIC_BUSY_RETRY_DELAYS_MS[i]!);
      out = await tryStep(i === 0 ? 'retry1' : 'retry2', MIC_CONSTRAINTS.bare);
      if ('stream' in out) return { ok: true, stream: out.stream, ...base() };
      if ('cancelled' in out) return cancelled();
      err = out.err;
      if (err.kind !== 'busy') break;
    }
    if (err.kind === 'busy') {
      const inputs = await listInputs();
      if (isCancelled()) return cancelled();
      // 'default' / 'communications' are aliases for the very route that just failed; a concrete id can differ
      // (e.g. the built-in mic while a Bluetooth headset is mid profile switch).
      const id = inputs?.find((x) => x.deviceId && x.deviceId !== 'default' && x.deviceId !== 'communications')?.deviceId;
      if (id) {
        out = await tryStep('device', { audio: { deviceId: { exact: id } } });
        if ('stream' in out) return { ok: true, stream: out.stream, ...base() };
        if ('cancelled' in out) return cancelled();
        // A refused exact id says nothing new; a denial or a vanished device does.
        if (out.err.kind !== 'constraint' && out.err.kind !== 'unknown') err = out.err;
      }
    }
  }

  // 3) "No device": trust the device list over the error — with inputs present, one plain try.
  if (err.kind === 'not_found') {
    const inputs = await listInputs();
    if (isCancelled()) return cancelled();
    if (inputs === null || inputs.length > 0) {
      out = await tryStep('bare', MIC_CONSTRAINTS.bare);
      if ('stream' in out) return { ok: true, stream: out.stream, ...base() };
      if ('cancelled' in out) return cancelled();
      err = out.err;
    }
  }

  // Telemetry wants the input count on every failure; it is cheap and never prompts.
  if (audioInputs === undefined) {
    await listInputs();
    if (isCancelled()) return cancelled();
  }
  // In-app WebViews fail in odd, unnamed ways (a TypeError, an unknown name); their fix is always the same.
  const kind: MicFailure = inApp && (err.kind === 'constraint' || err.kind === 'unknown') ? 'in_app' : err.kind;
  return failure(kind, err.name, err.message);
}

/** The real browser's MicDeps (guarded: nothing here throws when an API is missing). */
export function browserMicDeps(requestRelease: () => void): MicDeps {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const md = nav?.mediaDevices;
  const perms = nav?.permissions;
  return {
    getUserMedia: md && typeof md.getUserMedia === 'function' ? (c) => md.getUserMedia(c) : null,
    enumerateDevices: md && typeof md.enumerateDevices === 'function' ? () => md.enumerateDevices() : null,
    queryPermission: perms && typeof perms.query === 'function'
      ? () => perms.query({ name: 'microphone' as PermissionName }).then((s) => s.state)
      : null,
    // `undefined` (very old engines, jsdom) is treated as secure: only an explicit false is a known-insecure page.
    isSecureContext: typeof window === 'undefined' || window.isSecureContext !== false,
    userAgent: nav?.userAgent ?? '',
    sleep: (ms) => new Promise<void>((r) => { setTimeout(r, ms); }),
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    requestRelease,
  };
}
