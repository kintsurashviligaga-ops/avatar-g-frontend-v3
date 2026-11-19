/**
 * lib/speech/timing.ts — where one read-aloud request's time goes, for the owner's listening trial (lib/speech/trial).
 *
 * ⚠️ EVERY CHUNK COST ABOUT 4 s BEFORE ANY AUDIO (GG's trial card, Production 2026-11-06, iPhone: 23 characters took
 * 4.8 s for 2.1 s of audio, 43 characters 5.7 s for 4.8 s). The card measured the whole request from the browser, so it
 * could not say whether those 4 s were our route's checks (rate limits, sign-in, the daily cap, the budget gate, the
 * Workload Identity token), Google, booking the usage after Google answered, or the network to Vercel. The route now
 * times each phase (`SpeechClock`) and, for a trial request only (an admin naming a model), sends them back as a
 * standard `Server-Timing` header; the card shows them under each chunk (`parseSpeechTiming`, `speechTimingRows`).
 * Nothing here changes what is called or in what order: it only reads the clock between the steps.
 */

/**
 * The route's phases, in the order they run. `wait` is the pause before a retry; `google` adds up every attempt and
 * reading Google's answer; `decode` is unwrapping the audio; `book` is recording the usage before the audio is sent,
 * which happens only off Vercel now: on Vercel the usage is booked right after the audio is sent (2026-11-06).
 */
export const SPEECH_PHASES = ['limit', 'body', 'auth', 'quota', 'model', 'budget', 'token', 'google', 'wait', 'decode', 'book'] as const;
export type SpeechPhase = (typeof SPEECH_PHASES)[number];

/** The route's own steps, before and after Google: what our server adds to every chunk. */
const OURS: readonly SpeechPhase[] = ['limit', 'body', 'auth', 'quota', 'model', 'budget', 'token', 'decode', 'book'];

export class SpeechClock {
  private readonly startedAt: number;
  private last: number;
  private readonly spent = new Map<SpeechPhase, number>();
  private attempts = 0;
  private coldMs: number | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {
    this.startedAt = this.last = now();
  }

  /** The time since the previous lap belongs to `phase` (added, so two Google attempts make one sum). */
  lap(phase: SpeechPhase): void {
    const t = this.now();
    this.spent.set(phase, (this.spent.get(phase) ?? 0) + Math.max(0, t - this.last));
    this.last = t;
  }

  /** One more call to Google (named in the header, so a retry is visible). */
  attempt(): void {
    this.attempts += 1;
  }

  /**
   * This request was the first on a fresh instance, whose route took `ms` to load before it (lib/speech/bootMark). That
   * time passed before the clock started, so it is not in the total: the browser counts it as network.
   */
  cold(ms: number): void {
    this.coldMs = Math.max(0, ms);
  }

  /** The `Server-Timing` value: every phase that ran, a cold start if there was one, then the total, in whole ms. */
  header(): string {
    const parts: string[] = [];
    for (const phase of SPEECH_PHASES) {
      const ms = this.spent.get(phase);
      if (ms === undefined) continue;
      parts.push(phase === 'google' && this.attempts > 1 ? `google;dur=${Math.round(ms)};desc="${this.attempts}"` : `${phase};dur=${Math.round(ms)}`);
    }
    if (this.coldMs !== null) parts.push(`cold;dur=${Math.round(this.coldMs)}`);
    parts.push(`total;dur=${Math.round(Math.max(0, this.now() - this.startedAt))}`);
    return parts.join(', ');
  }
}

/** One request's phases as the browser read them from `Server-Timing`. */
export interface SpeechTiming {
  readonly phases: Readonly<Partial<Record<SpeechPhase, number>>>;
  readonly totalMs: number;
  /** Calls made to Google (1 unless the route retried). */
  readonly attempts: number;
  /** Present when the request was the first on a fresh instance: how long the route took to load before it. */
  readonly coldMs?: number;
}

const PHASE_SET = new Set<string>(SPEECH_PHASES);

/** The route's `Server-Timing` header, or null when there is none or it is not the route's. Unknown names are skipped. */
export function parseSpeechTiming(header: string | null | undefined): SpeechTiming | null {
  if (!header || header.length > 1_000) return null;
  const phases: Partial<Record<SpeechPhase, number>> = {};
  let totalMs: number | null = null;
  let coldMs: number | null = null;
  let attempts = 1;
  for (const entry of header.split(',')) {
    const [rawName, ...params] = entry.split(';').map((s) => s.trim());
    const name = (rawName ?? '').toLowerCase();
    let dur: number | null = null;
    let desc: string | null = null;
    for (const p of params) {
      const m = /^(dur|desc)=(?:"([^"]*)"|([^\s"]*))$/i.exec(p);
      if (!m) continue;
      const value = m[2] ?? m[3] ?? '';
      if (m[1]!.toLowerCase() === 'dur') dur = Number(value);
      else desc = value;
    }
    if (dur === null || !Number.isFinite(dur) || dur < 0) continue;
    if (name === 'total') totalMs = dur;
    else if (name === 'cold') coldMs = dur;
    else if (PHASE_SET.has(name)) {
      phases[name as SpeechPhase] = dur;
      if (name === 'google' && desc && /^\d{1,2}$/.test(desc)) attempts = Math.max(1, Number(desc));
    }
  }
  if (totalMs === null) return null;
  return coldMs === null ? { phases, totalMs, attempts } : { phases, totalMs, attempts, coldMs };
}

/**
 * What the trial card says under a chunk: Google's time, our server's own steps, and the network (the browser's
 * measure minus the route's total), then each of our steps that took a noticeable time, longest first.
 */
export interface SpeechTimingRow {
  /** Every Google attempt, reading its answer, and the pause before a retry. */
  readonly googleMs: number;
  readonly attempts: number;
  readonly oursMs: number;
  /** null when the browser's measure is shorter than the route's (clocks cannot be compared then). */
  readonly networkMs: number | null;
  /** Part of the network figure: the route loading on a fresh instance before this request (absent when warm). */
  readonly coldMs?: number;
  readonly steps: ReadonlyArray<{ readonly phase: SpeechPhase; readonly ms: number }>;
}

/** A step shorter than this is not listed: it is not where the seconds go. */
const NOTICEABLE_MS = 50;

export function speechTimingRow(timing: SpeechTiming, browserMs: number): SpeechTimingRow {
  const oursMs = OURS.reduce((sum, p) => sum + (timing.phases[p] ?? 0), 0);
  const networkMs = browserMs >= timing.totalMs ? browserMs - timing.totalMs : null;
  const steps = OURS.map((phase) => ({ phase, ms: timing.phases[phase] ?? 0 }))
    .filter((s) => s.ms >= NOTICEABLE_MS)
    .sort((a, b) => b.ms - a.ms);
  // A retry's pause is spent because Google failed: it counts with Google.
  const googleMs = (timing.phases.google ?? 0) + (timing.phases.wait ?? 0);
  const row = { googleMs, attempts: timing.attempts, oursMs, networkMs, steps };
  return timing.coldMs === undefined ? row : { ...row, coldMs: timing.coldMs };
}
