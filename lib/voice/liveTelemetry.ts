/**
 * lib/voice/liveTelemetry.ts — tell us WHY a Live call failed on someone else's device.
 *
 * The reported „კავშირი შეწყდა · მიკროფონი ვერ ჩაირთო“ could not be diagnosed: the hook discarded the DOMException,
 * nothing was logged, and the token mints in the server logs said only "the call got that far". Every mic failure,
 * `unsupported` and `setup_failed` now leaves one small, whitelisted report:
 *
 *   1. reportError()  → console + Sentry (when a DSN is configured) — lib/observability/report-error;
 *   2. a beacon to /api/log-error → the server prints it as `[client-report]` in the Vercel logs even when its DB
 *      insert fails (sendBeacon survives the page closing; fetch keepalive is the fallback).
 *
 * The payload is an ALLOW-LIST capped at 2 KB: error name + message, the ladder's attempts, permission state, input
 * count, secure/in-app flags, a truncated UA, locale and call counters. No transcript, no tokens, no URL query string.
 * Shared by the server route (`sanitizeLiveContext`) so both ends enforce the same shape.
 *
 * Not 'use client': the route imports the sanitizer. Every browser API is guarded.
 */
import { reportError } from '@/lib/observability/report-error';

import { isInAppBrowser } from './micAcquire';

export const LIVE_TELEMETRY_MAX_BYTES = 2048;
/** A page that fails in a loop (Retry spam, a flapping device) must not flood the sink. */
export const LIVE_TELEMETRY_MAX_REPORTS = 8;
const LOG_ERROR_URL = '/api/log-error';

/** What the hook knows at failure time (everything optional). */
export interface LiveFailureContext {
  attempts?: ReadonlyArray<{ step: string; name: string; ms: number }>;
  permission?: string;
  audioInputs?: number;
  locale?: string;
  /** The playback context + mic came from the Live button's gesture prime. */
  primed?: boolean;
  /** Playback AudioContext state at failure ('running' / 'suspended' / …). */
  ctxState?: string;
  /** Token mints during this open. */
  mints?: number;
  msToMicResult?: number;
  degraded?: boolean;
}

/** The whitelisted wire shape. */
export interface LiveTelemetryPayload {
  kind: 'live_failure';
  code: string;
  name?: string;
  message?: string;
  attempts?: Array<{ step: string; name: string; ms: number }>;
  permission?: string;
  audioInputs?: number;
  secure?: boolean;
  inApp?: boolean;
  ua?: string;
  locale?: string;
  primed?: boolean;
  ctxState?: string;
  mints?: number;
  msToMicResult?: number;
  degraded?: boolean;
}

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v ? v.slice(0, max) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(v, 1e9))) : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

function prune<T extends object>(o: T): T {
  for (const k of Object.keys(o) as Array<keyof T>) if (o[k] === undefined) delete o[k];
  return o;
}

/**
 * Anything → the allow-listed payload, or null when it is not an object, has no code, or is still over the byte
 * cap after trimming the attempt list. Unknown keys are dropped, every string is length-capped.
 */
export function sanitizeLiveContext(raw: unknown): LiveTelemetryPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const code = str(r.code, 40);
  if (!code) return null;
  const attempts = Array.isArray(r.attempts)
    ? r.attempts.slice(0, 8).flatMap((a) => {
      if (!a || typeof a !== 'object') return [];
      const x = a as Record<string, unknown>;
      const step = str(x.step, 16);
      return step ? [{ step, name: str(x.name, 40) ?? '', ms: num(x.ms) ?? 0 }] : [];
    })
    : undefined;
  const payload: LiveTelemetryPayload = prune({
    kind: 'live_failure' as const,
    code,
    name: str(r.name, 60),
    message: str(r.message, 200),
    attempts: attempts?.length ? attempts : undefined,
    permission: str(r.permission, 16),
    audioInputs: num(r.audioInputs),
    secure: bool(r.secure),
    inApp: bool(r.inApp),
    ua: str(r.ua, 300),
    locale: str(r.locale, 8),
    primed: bool(r.primed),
    ctxState: str(r.ctxState, 16),
    mints: num(r.mints),
    msToMicResult: num(r.msToMicResult),
    degraded: bool(r.degraded),
  });
  if (byteLength(JSON.stringify(payload)) <= LIVE_TELEMETRY_MAX_BYTES) return payload;
  delete payload.attempts; // the only variable-length part
  return byteLength(JSON.stringify(payload)) <= LIVE_TELEMETRY_MAX_BYTES ? payload : null;
}

/** UTF-8 byte length without TextEncoder (absent in some WebViews and test DOMs). Georgian is 3 bytes a letter. */
export function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}
const byteLength = utf8Length;

export interface LiveTelemetryEnv {
  secure: boolean;
  userAgent: string;
}

function browserEnv(): LiveTelemetryEnv {
  return {
    secure: typeof window === 'undefined' || window.isSecureContext !== false,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent || '' : '',
  };
}

export function buildLiveFailurePayload(
  code: string,
  detail: { name: string; message: string } | null,
  context: LiveFailureContext,
  env: LiveTelemetryEnv = browserEnv(),
): LiveTelemetryPayload | null {
  return sanitizeLiveContext({
    code,
    name: detail?.name,
    message: detail?.message,
    attempts: context.attempts,
    permission: context.permission,
    audioInputs: context.audioInputs,
    secure: env.secure,
    inApp: isInAppBrowser(env.userAgent),
    ua: env.userAgent,
    locale: context.locale,
    primed: context.primed,
    ctxState: context.ctxState,
    mints: context.mints,
    msToMicResult: context.msToMicResult,
    degraded: context.degraded,
  });
}

let sent = 0;

/** Test hook: the per-page report budget. */
export function __resetLiveTelemetryBudget(): void { sent = 0; }

/** Fire-and-forget. Never throws, never awaits, never blocks the call UI. */
export function reportLiveFailure(code: string, detail: { name: string; message: string } | null, context: LiveFailureContext): void {
  try {
    if (sent >= LIVE_TELEMETRY_MAX_REPORTS) return;
    const payload = buildLiveFailurePayload(code, detail, context);
    if (!payload) return;
    sent += 1;

    reportError(new Error(`live:${code}:${payload.name ?? 'none'}`), { ...payload });

    if (typeof window === 'undefined') return;
    // Origin + path only: a query string can carry anything (a shared link, a campaign id) and is not ours to keep.
    const loc = window.location;
    const body = JSON.stringify({
      message: `live ${code} ${payload.name ?? ''}`.trim(),
      url: `${loc.origin}${loc.pathname}`,
      userAgent: payload.ua ?? '',
      timestamp: new Date().toISOString(),
      context: payload,
    });
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    // A plain string beacon (text/plain) is a CORS-simple request; the route parses JSON from the text either way.
    if (nav && typeof nav.sendBeacon === 'function' && nav.sendBeacon(LOG_ERROR_URL, body)) return;
    if (typeof fetch === 'function') {
      void fetch(LOG_ERROR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        credentials: 'same-origin',
      }).catch(() => {});
    }
  } catch {
    /* telemetry must never break the caller */
  }
}
