/**
 * lib/voice/dictationMetrics.ts — how fast the composer mic really was, on someone else's phone.
 *
 * One small summary per dictation (components/chat/composer/useDictation): tap → capture running, capture running →
 * first visible text, Stop → final text, the latency of every transcription pass, and the error / abort / retry
 * counts. TIMINGS AND ENUMS ONLY — never the transcript, never audio, never a URL or a free-form string. The same
 * allow-list runs in the browser (before anything leaves it) and in POST /api/voice/dictation-metrics.
 *
 * Where it goes:
 *   1. a ring buffer on `window.__myavatarDictationMetrics` (the last DICTATION_METRICS_RING summaries) — open the
 *      console on the device and read it;
 *   2. one beacon to /api/voice/dictation-metrics, which prints one structured `[dictation-metrics]` line in the
 *      server logs (no database write). Capped per page so a looping page cannot flood it.
 *
 * Not 'use client': the route imports the sanitizer. Every browser API is guarded.
 */

export const DICTATION_METRICS_URL = '/api/voice/dictation-metrics';
/** Fired on `window` after each summary is kept (the composer's on-screen readout listens; see DictationMetricsReadout). */
export const DICTATION_METRICS_EVENT = 'myavatar:dictation-metrics';
/** Summaries kept on `window.__myavatarDictationMetrics`. */
export const DICTATION_METRICS_RING = 20;
/** Beacons per page load. */
export const DICTATION_METRICS_MAX_REPORTS = 40;
/** Per-pass arrays are cut to this length (a 2-minute dictation makes at most 11 passes). */
export const DICTATION_METRICS_MAX_PASSES = 12;
/** A serialized summary is a few hundred bytes; anything larger is not one. */
export const DICTATION_METRICS_MAX_BYTES = 2048;
/** Any timing above this (10 min) is a clock problem, not a measurement. */
const MAX_MS = 600_000;

export const DICTATION_ENGINES = ['webspeech', 'recorder'] as const;
export const DICTATION_CAPTURES = ['wav', 'mediarecorder'] as const;
export const DICTATION_LANGS = ['ka-GE', 'en-US', 'ru-RU', 'auto'] as const;
export const DICTATION_OUTCOMES = ['text', 'empty', 'error', 'cancelled', 'denied'] as const;
export const DICTATION_ERROR_CODES = [
  'stt_unavailable', 'unsupported_format', 'stt_error', 'rate_limited', 'http', 'network', 'timeout', 'auth', 'mic', 'capture', 'webspeech',
] as const;

export type DictationMetricsEngine = (typeof DICTATION_ENGINES)[number];
export type DictationMetricsCapture = (typeof DICTATION_CAPTURES)[number];
export type DictationMetricsLang = (typeof DICTATION_LANGS)[number];
export type DictationOutcome = (typeof DICTATION_OUTCOMES)[number];
export type DictationErrorCode = (typeof DICTATION_ERROR_CODES)[number];

/** The whole wire shape. Every field is a number, a boolean or one of the enums above. */
export interface DictationMetrics {
  v: 1;
  engine: DictationMetricsEngine;
  lang: DictationMetricsLang;
  outcome: DictationOutcome;
  capture?: DictationMetricsCapture;
  errorCode?: DictationErrorCode;
  /** The recorder reused a context primed in the tap (lib: useDictation primeDictationAudio). */
  warm?: boolean;
  /** Web Speech gave up and the recorder took over. */
  fallback?: boolean;
  /** Tap → capture actually running ('listening'). */
  tapToListeningMs?: number;
  /** Capture running → the first transcript text written into the box. */
  listeningToFirstTextMs?: number;
  /** Stop → the final text (recorder: the final pass settled; Web Speech: the recognizer ended). */
  stopToFinalMs?: number;
  /** Capture running → Stop. */
  listenMs?: number;
  /** Transcription passes sent (interim + final). */
  passes: number;
  /** Client round-trip of each completed pass, in order. */
  passMs: number[];
  /** The route's `stt` Server-Timing of each completed pass (Gemini time), in order. */
  serverSttMs: number[];
  /** Client round-trip of the final pass. */
  finalPassMs?: number;
  /** Interim passes aborted because Stop started the final pass. */
  aborted: number;
  /** Interim passes deferred behind one still in flight. */
  deferred: number;
  /** Passes that failed (HTTP error, network, timeout). */
  failed: number;
  /** Web Speech self-restarts (Chrome ends a continuous session on its own). */
  restarts: number;
}

const oneOf = <T extends string>(set: readonly T[], v: unknown): T | undefined =>
  typeof v === 'string' && (set as readonly string[]).includes(v) ? (v as T) : undefined;
const ms = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(v, MAX_MS))) : undefined;
const count = (v: unknown): number => {
  const n = ms(v);
  return n === undefined ? 0 : Math.min(n, 10_000);
};
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const msList = (v: unknown): number[] =>
  Array.isArray(v) ? v.slice(0, DICTATION_METRICS_MAX_PASSES).map(ms).filter((n): n is number => n !== undefined) : [];

/**
 * Anything → the allow-listed summary, or null when it is not one (no `v: 1`, or an engine / language / outcome
 * outside the enums). Unknown keys are dropped; numbers are rounded and clamped; arrays are cut.
 */
export function sanitizeDictationMetrics(raw: unknown): DictationMetrics | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  const engine = oneOf(DICTATION_ENGINES, r.engine);
  const lang = oneOf(DICTATION_LANGS, r.lang);
  const outcome = oneOf(DICTATION_OUTCOMES, r.outcome);
  if (!engine || !lang || !outcome) return null;
  const out: DictationMetrics = {
    v: 1,
    engine,
    lang,
    outcome,
    passes: count(r.passes),
    passMs: msList(r.passMs),
    serverSttMs: msList(r.serverSttMs),
    aborted: count(r.aborted),
    deferred: count(r.deferred),
    failed: count(r.failed),
    restarts: count(r.restarts),
  };
  const capture = oneOf(DICTATION_CAPTURES, r.capture);
  if (capture) out.capture = capture;
  const errorCode = oneOf(DICTATION_ERROR_CODES, r.errorCode);
  if (errorCode) out.errorCode = errorCode;
  const warm = bool(r.warm);
  if (warm !== undefined) out.warm = warm;
  const fallback = bool(r.fallback);
  if (fallback !== undefined) out.fallback = fallback;
  for (const k of ['tapToListeningMs', 'listeningToFirstTextMs', 'stopToFinalMs', 'listenMs', 'finalPassMs'] as const) {
    const n = ms(r[k]);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

/** The route's `stt;dur=…` from a Server-Timing header value, or undefined. */
export function serverTimingMs(header: string | null | undefined, name: string): number | undefined {
  if (typeof header !== 'string' || !header) return undefined;
  for (const part of header.split(',')) {
    const [metric, ...params] = part.trim().split(';');
    if (metric?.trim() !== name) continue;
    for (const p of params) {
      const m = /^\s*dur\s*=\s*"?([\d.]+)"?\s*$/.exec(p);
      if (m) return ms(Number(m[1]));
    }
  }
  return undefined;
}

type MetricsWindow = { __myavatarDictationMetrics?: DictationMetrics[] };

let sent = 0;
/** Test hook: the per-page beacon budget. */
export function __resetDictationMetricsBudget(): void { sent = 0; }

/** Append to the diagnostics ring buffer on `window` (newest last). Never throws. */
export function pushDictationMetrics(m: DictationMetrics): void {
  try {
    if (typeof window === 'undefined') return;
    const w = window as unknown as MetricsWindow;
    const ring = Array.isArray(w.__myavatarDictationMetrics) ? w.__myavatarDictationMetrics : [];
    ring.push(m);
    if (ring.length > DICTATION_METRICS_RING) ring.splice(0, ring.length - DICTATION_METRICS_RING);
    w.__myavatarDictationMetrics = ring;
    try { window.dispatchEvent(new CustomEvent(DICTATION_METRICS_EVENT)); } catch { /* an old engine */ }
  } catch { /* diagnostics only */ }
}

/** The summaries kept on this page (newest last). */
export function readDictationMetrics(): DictationMetrics[] {
  try {
    if (typeof window === 'undefined') return [];
    const ring = (window as unknown as MetricsWindow).__myavatarDictationMetrics;
    return Array.isArray(ring) ? ring.slice() : [];
  } catch {
    return [];
  }
}

/** Nearest-rank percentile (p in 0–100) of the values; null when there are none. */
export function percentile(values: readonly number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const rank = Math.min(v.length, Math.max(1, Math.ceil((p / 100) * v.length)));
  return v[rank - 1]!;
}

export interface LatencyStat { n: number; p50: number | null; p95: number | null }
export interface DictationLatency {
  dictations: number;
  tapToListening: LatencyStat;
  listeningToFirstText: LatencyStat;
  stopToFinal: LatencyStat;
}

/**
 * p50 / p95 of the three latencies a person feels, over measured dictations only: a timing a dictation did not reach
 * (no text, cancelled before listening) is left out, never counted as zero. MEASURED numbers — never a target.
 */
export function summarizeDictationLatency(list: readonly DictationMetrics[]): DictationLatency {
  const stat = (pick: (m: DictationMetrics) => number | undefined): LatencyStat => {
    const v = list.map(pick).filter((x): x is number => typeof x === 'number');
    return { n: v.length, p50: percentile(v, 50), p95: percentile(v, 95) };
  };
  return {
    dictations: list.length,
    tapToListening: stat((m) => m.tapToListeningMs),
    listeningToFirstText: stat((m) => m.listeningToFirstTextMs),
    stopToFinal: stat((m) => m.stopToFinalMs),
  };
}

/** Fire-and-forget: ring buffer + one beacon. Never throws, never awaits, never blocks the composer. */
export function reportDictationMetrics(raw: DictationMetrics): void {
  try {
    const m = sanitizeDictationMetrics(raw);
    if (!m) return;
    pushDictationMetrics(m);
    if (typeof window === 'undefined' || sent >= DICTATION_METRICS_MAX_REPORTS) return;
    sent += 1;
    const body = JSON.stringify(m);
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    // A plain string beacon (text/plain) is a CORS-simple request and carries the session cookie; the route parses
    // the text as JSON. fetch keepalive is the fallback.
    if (nav && typeof nav.sendBeacon === 'function' && nav.sendBeacon(DICTATION_METRICS_URL, body)) return;
    if (typeof fetch === 'function') {
      void fetch(DICTATION_METRICS_URL, { method: 'POST', body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
    }
  } catch { /* telemetry must never break the caller */ }
}
