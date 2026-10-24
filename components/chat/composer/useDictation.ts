'use client';

/**
 * useDictation — the composer mic: speech → text in the box. Extracted from OmniStudio (`toggleMic` :6020,
 * `startRecorderFallback` :5853, `stopDictationEcho` :4690) with the same product rules:
 *
 *  · Web Speech first where it can do the language (Chrome's engine is Google's and handles Georgian), with the
 *    8 s / 2.5 s-after-`onspeechstart` watchdog, the restart budget for Chrome's self-ending `onend`,
 *    `no-speech` as non-fatal, and a session memory of languages the engine rejected.
 *  · The language is the one the user SPEAKS (lib/voice/speechLang): their typed native script, else the language the
 *    server heard last time, else Georgian for a Georgian UI, else 'auto' — the recorder, where Gemini identifies it
 *    (Web Speech cannot) and the answer is remembered for the next dictation. Never a translation.
 *  · Apple's engine (iOS and macOS Safari) has no Georgian, so `ka` there goes straight to the recorder.
 *  · Otherwise, record and POST to /api/voice/transcribe, streaming interim passes into the box on the
 *    `lib/voice/interimCadence` back-off, then one final pass on Stop.
 *  · NO AUTO-SEND. Dictation fills the box and waits for the user to tap Send (product decision; the
 *    hands-free auto-submit was reverted on purpose). This hook has no way to send by construction.
 *  · `stopEcho()` must run on every COMMITTED send, or a late transcription re-fills the emptied box.
 *  · Guests never record: `onAuthRequired` is called instead (the STT route spends provider credits).
 *
 * THE STATE IS THE TRUTH (`phase`): 'starting' from the tap until capture really runs (asking for the mic, waking the
 * audio context) → 'listening' (the recognizer reported start, or the recorder's worklet is connected to a running
 * context) → 'processing' (the recorder's final pass after Stop) → 'idle'. `recording` (= starting | listening) and
 * `transcribing` (= processing) remain for older callers. It used to flip to "recording" on the tap and stay there
 * while getUserMedia and the AudioContext were still spinning up, so the first words were spoken into nothing.
 *
 * ⚠️ THE RECORDER NOW SENDS 16 kHz MONO WAV, NOT webm/mp4. MediaRecorder produces webm (Chrome) or mp4
 * (Safari), and Gemini's documented audio formats are WAV, MP3, AIFF, AAC, OGG and FLAC — the transcribe
 * route's own comment says its Gemini leg "REJECTS the webm/mp4 the browser mic actually records". The
 * recorder path therefore captures PCM through the AudioWorklet (`public/worklets/pcm-capture-processor.js`) and
 * wraps it in a WAV header, which every leg of the route accepts. MediaRecorder stays as the fallback for a browser
 * with no AudioWorklet (or an AudioContext that will not start), so the mic always does something.
 *
 * ⚠️ THE AUDIO CONTEXT USED TO BE BORN AFTER THE PERMISSION AWAIT, AND REBUILT EVERY TIME. `new AudioContext()` and
 * `audioWorklet.addModule()` ran only once getUserMedia had resolved — serially, outside the tap's user activation
 * (iOS keeps such a context 'suspended') — and the context was closed after every clip. Now `primeDictationAudio()`
 * runs SYNCHRONOUSLY in the tap, before the getUserMedia await: it creates (or reuses) one context, resumes it inside
 * the gesture and starts the worklet load, all in parallel with the permission prompt. The context and its loaded
 * worklet are kept, asleep (`suspend()`), for the next dictation. The old build-after-await capture remains as the
 * second fallback (`createColdWavCapture`), then MediaRecorder.
 *
 * ⚠️ WAV IS ~8× BIGGER THAN OPUS, AND VERCEL CAPS A REQUEST AT ~4.5 MB. 16 kHz × 16 bit = 32 kB/s, so a
 * clip is capped at `MAX_RECORD_SEC` (120 s ≈ 3.8 MB) and stops itself there. Every pass re-sends the whole
 * clip so far (the interim cadence keeps that O(n log n), and interim passes stop after ~1 minute).
 *
 * ⚠️ STOP USED TO WAIT FOR THE INTERIM PASS IN FLIGHT, THEN RE-SEND THE WHOLE CLIP. The final pass awaited the
 * running interim round-trip first, so Stop cost up to two Gemini calls back to back. Stop now ABORTS the in-flight
 * interim (its words are in the final pass's clip anyway) and starts the final pass at once; an interim answer that
 * still arrives after Stop is dropped, never written over the final.
 *
 * ⚠️ A DUE PASS WAS SWALLOWED WHILE ANOTHER WAS IN FLIGHT. The tick marked the pass as done before checking for one
 * in flight, so on a slow network most scheduled passes silently never ran and the text froze. A pass that comes due
 * while one is in flight is now deferred (at most one) and runs the moment the previous one returns.
 *
 * ⚠️ THE ROUTE'S `code` WAS IGNORED. /api/voice/transcribe answers 200 `{ text: '', code }` when Gemini could not run
 * (`stt_unavailable`, `unsupported_format`), and the hook read that as "heard nothing" — the user's sentence vanished
 * without a word. On the FINAL pass a code (or any failure) is now shown at once, localized; interim misses stay
 * silent and only a second consecutive interim failure warns, as before.
 *
 * ⚠️ stopEcho() DID NOT STOP CHROME'S RECOGNIZER. OmniStudio's version stopped the recognizer without marking
 * the stop as intentional, and Chrome's `onend` then took it for its own silence timeout and restarted it (up
 * to 8 times) — the mic stayed live after Send, discarding what it heard. Here `stopEcho` marks the stop
 * intentional and `onend` also refuses to restart a dictation that is no longer the current one.
 *
 * ⚠️ WEB SPEECH OVERWROTE WHAT THE USER TYPED. Its results were written as a plain string, so a keyboard edit during
 * dictation was replaced by the next result. It now uses the recorder's rule — a box that changed since our last
 * write is the user's — and continues AFTER their text, skipping the utterance that was in progress (it was partly
 * on screen when they edited, so appending it would repeat words). Results are kept per index and joined with
 * `mergeSpeech`, so a re-delivered final or Android's cumulative results never duplicate words.
 *
 * ⚠️ A NON-OK RESPONSE USED TO COUNT AS SUCCESS. The old recorder parsed any response and reset its failure
 * streak, so a 429 from the shared READ bucket (`{error}`, no `text`) looked like "heard nothing" and the
 * warning never showed. `!res.ok` is a failure now, and 401 means "sign in" (`onAuthRequired`), not a retry.
 *
 * `setValue` must accept an updater (a React `setState`): late passes read the LIVE value and keep a keyboard edit
 * instead of clobbering it.
 *
 * ⚠️ THE MIC IS SHARED WITH LIVE VOICE. Opening Live while this held the device (Android's recognizer holds it
 * exclusively; the recorder's tracks used to stop only AFTER `finish()` resolved, up to 1.5 s for MediaRecorder)
 * made Live's getUserMedia fail with NotReadableError. The hook now listens on lib/voice/micBus: a release request
 * stops the recognizer and the recorder's tracks SYNCHRONOUSLY, keeping what was already dictated (the final pass
 * still runs on the audio captured so far).
 *
 * METRICS (lib/voice/dictationMetrics): one summary per dictation — tap → listening, listening → first text,
 * Stop → final text, every pass's latency, error / abort / deferral / restart counts, engine and language. Timings
 * and enums only, never the transcript. Kept on `window.__myavatarDictationMetrics` and beaconed to
 * /api/voice/dictation-metrics.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { audioExtFor } from '@/lib/voice/audioExt';
import {
  DICTATION_METRICS_MAX_PASSES,
  reportDictationMetrics,
  serverTimingMs,
  type DictationErrorCode,
  type DictationMetrics,
  type DictationOutcome,
} from '@/lib/voice/dictationMetrics';
import { MAX_INTERIM_MS, shouldRunInterimAt } from '@/lib/voice/interimCadence';
import { useMicRelease } from '@/lib/voice/micBus';
import {
  isSpeechLang,
  loadLearnedSpeechLang,
  resolveSpeechLang,
  saveLearnedSpeechLang,
  type SpeechLang,
  type SttRequestLang,
} from '@/lib/voice/speechLang';

// ─── Web Speech shapes (not in the TS DOM lib) ───────────────────────────────────────────────────────────

interface SRAlternative { readonly transcript: string }
interface SRResult { readonly isFinal: boolean; readonly length: number; readonly [i: number]: SRAlternative }
export interface SREvent { readonly resultIndex: number; readonly results: { readonly length: number; readonly [i: number]: SRResult } }
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  /** `error` is a code: 'no-speech', 'language-not-supported', 'service-not-allowed', 'not-allowed', 'aborted'… */
  onerror: ((e: { error?: string }) => void) | null;
  /** The ENGINE heard speech — separates "the user has not started" from "this engine produces nothing". */
  onspeechstart: (() => void) | null;
  /** The engine began listening (optional: not every engine fires it). */
  onstart?: (() => void) | null;
  /** Audio capture began (optional: not every engine fires it). */
  onaudiostart?: (() => void) | null;
  start(): void;
  stop(): void;
}
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// ─── Capture ─────────────────────────────────────────────────────────────────────────────────────────────

export type DictationEngine = 'webspeech' | 'wav' | 'mediarecorder';
export type { SpeechLang } from '@/lib/voice/speechLang';
/** See the file header: what the mic is really doing. */
export type DictationPhase = 'idle' | 'starting' | 'listening' | 'processing';

/** One recording. `snapshot()` is the whole clip so far as a decodable file; `finish()` stops and returns it. */
export interface CaptureSession {
  readonly engine: 'wav' | 'mediarecorder';
  readonly mimeType: string;
  /** Below this a clip is too short to be worth a round-trip. */
  readonly minBytes: number;
  /** Built on the context primed in the tap (metrics only). */
  readonly warm?: boolean;
  seconds(): number;
  snapshot(): Blob | null;
  finish(): Promise<Blob | null>;
}
/** Builds a capture on a live mic stream. `onLevel` gets the RMS (0..1) of each frame, for silence auto-stop. */
export type CaptureFactory = (stream: MediaStream, onLevel: (rms: number) => void) => Promise<CaptureSession>;

export interface DictationDeps {
  speechRecognition(): SpeechRecognitionCtor | undefined;
  userAgent(): string;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  /** Tried in order; the first that resolves wins. Default: primed AudioWorklet WAV, cold WAV, then MediaRecorder. */
  captureFactories: CaptureFactory[];
  /** Called SYNCHRONOUSLY in the tap, before getUserMedia: wake the recorder's audio. Default primeDictationAudio. */
  primeCapture(): void;
  /** No capture used the primed audio (mic denied, cancelled): let it sleep. Default parkDictationAudio. */
  parkCapture(): void;
  /** One summary per dictation (timings and enums only). Default: ring buffer + beacon (lib/voice/dictationMetrics). */
  reportMetrics(m: DictationMetrics): void;
  fetch: typeof fetch;
  now(): number;
  /** Used when `authed` is not passed: `<html data-authed="0">` (published by ChatChrome) means a guest. */
  isGuest(): boolean;
  /** The language the server heard on an earlier clip (lib/voice/speechLang; localStorage by default). */
  loadSpeechLang(): SpeechLang | null;
  saveSpeechLang(lang: SpeechLang): void;
}

export interface UseDictationOptions {
  locale?: string;
  /**
   * The language the user is evidently using — their latest TYPED message's native script (lib/voice/speechLang
   * `typedSpeechLang`). Wins over everything else; null/undefined = unknown (the remembered language, a Georgian UI,
   * or the recorder's auto-detect decide — see resolveSpeechLang).
   */
  speechLang?: SpeechLang | null;
  /** The composer text now; dictation appends after it. */
  value: string;
  setValue: Dispatch<SetStateAction<string>>;
  /** false = guest (never records). Omitted = read `<html data-authed>`. */
  authed?: boolean;
  /** Called instead of recording for a guest, and when the STT route answers 401. */
  onAuthRequired?: () => void;
  /** Blurred by `stopEcho()` so a mobile IME commits its buffer (a programmatic clear alone does not show). */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  /** Default '/api/voice/transcribe'. */
  transcribeUrl?: string;
  deps?: Partial<DictationDeps>;
}

export interface UseDictationResult {
  /** 'starting' (mic / audio warming up) → 'listening' (capture running) → 'processing' (final pass) → 'idle'. */
  phase: DictationPhase;
  /** `phase` is 'starting' or 'listening'. */
  recording: boolean;
  /** `phase` is 'processing': the recorder's final pass is in flight after Stop. */
  transcribing: boolean;
  engine: DictationEngine | null;
  /** Localized warning (transcription failed / not responding, mic blocked), or null. */
  warn: string | null;
  /** 'voice' while the box text came from dictation; send() reads it to tag the turn (inputMethod). */
  inputSourceRef: MutableRefObject<'text' | 'voice'>;
  /** Start, or stop (with a final pass) when starting / listening. */
  toggle(): Promise<void>;
  /** Intentional stop, with the final pass. */
  stop(): void;
  /** For every committed send: discard pending transcription, stop both recognizers, reset, blur. */
  stopEcho(): void;
  /** The keyboard changed the box (call from the textarea's onChange). */
  markTyped(): void;
  clearWarn(): void;
}

// ─── Tunables ────────────────────────────────────────────────────────────────────────────────────────────

export const WAV_SAMPLE_RATE = 16_000;
export const PCM_WORKLET_URL = '/worklets/pcm-capture-processor.js';
export const PCM_WORKLET_NAME = 'pcm-capture-processor';
/**
 * How often the recorder checks the interim cadence (lib/voice/interimCadence counts captured-audio milliseconds) —
 * also MediaRecorder's timeslice, so its snapshot is never more than this stale.
 */
export const TICK_MS = 300;
/** See the file header: 120 s of 16 kHz WAV ≈ 3.8 MB, under the ~4.5 MB request ceiling. */
export const MAX_RECORD_SEC = 120;
export const SILENCE_RMS = 0.035;
export const SILENCE_HOLD_MS = 1300;
export const TRANSCRIBE_TIMEOUT_MS = 30_000;
export const WEB_SPEECH_START_WATCHDOG_MS = 8000;
export const WEB_SPEECH_AFTER_SPEECH_WATCHDOG_MS = 2500;
export const WEB_SPEECH_MAX_RESTARTS = 8;
/** The primed context's worklet must be loaded by then, or the next capture is tried. */
export const WORKLET_LOAD_TIMEOUT_MS = 4000;
/** A context that will not resume within this is given up on (iOS can leave one 'suspended' / 'interrupted'). */
export const CONTEXT_RESUME_TIMEOUT_MS = 1000;
/** The primed context is replaced after this many captures, so nothing a capture left behind can accumulate. */
export const WARM_CONTEXT_MAX_SESSIONS = 20;

// ─── Pure helpers ────────────────────────────────────────────────────────────────────────────────────────

type Lang = 'ka' | 'en' | 'ru';
const langOf = (locale?: string): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

export function speechLangFor(locale?: string): SpeechLang {
  const l = langOf(locale);
  return l === 'en' ? 'en-US' : l === 'ru' ? 'ru-RU' : 'ka-GE';
}

/**
 * Apple's speech engine: iOS/iPadOS (every browser there is WebKit) and macOS Safari. Tested on the ENGINE,
 * not the device — macOS Safari exposes `webkitSpeechRecognition` with the same Georgian-less engine.
 */
export function isAppleSpeechEngine(ua: string): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (/safari/i.test(ua) && !/chrome|chromium|crios|android|edg/i.test(ua));
}

export function concatInt16(chunks: ReadonlyArray<Int16Array>, total?: number): Int16Array {
  const n = total ?? chunks.reduce((s, c) => s + c.length, 0);
  const out = new Int16Array(n);
  let o = 0;
  for (const c of chunks) {
    if (o + c.length > n) { out.set(c.subarray(0, n - o), o); break; }
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/**
 * Resample int16 PCM down to `outRate` by averaging each output sample's input window (a box filter).
 * Crude, but it low-passes before decimating — plain point sampling (or the linear interpolation in
 * lib/voice/pcm.ts) folds everything above 8 kHz back into the speech band as hiss. Only used when the
 * browser refused a 16 kHz AudioContext and captured at 44.1/48 kHz.
 */
export function downsampleTo16k(input: Int16Array, inputRate: number, outRate = WAV_SAMPLE_RATE): Int16Array {
  if (!(inputRate > 0) || !(outRate > 0) || input.length === 0) return new Int16Array(0);
  if (inputRate <= outRate) return input;
  const ratio = inputRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j] ?? 0;
    out[i] = Math.round(sum / (end - start));
  }
  return out;
}

/** A 16-bit mono PCM WAV file (44-byte RIFF header + little-endian samples). */
export function buildWavBytes(pcm: Int16Array, sampleRate = WAV_SAMPLE_RATE): Uint8Array {
  const dataBytes = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i] ?? 0, true);
  return new Uint8Array(buf);
}

/**
 * 'transcription' — interim passes keep failing (OmniStudio's exact words); 'mic' — no microphone;
 * 'unavailable' — the route's `stt_unavailable`; 'format' — `unsupported_format`; 'rate_limited' — a 429;
 * 'failed' — the final pass failed for any other reason.
 */
export type DictationWarningKind = 'transcription' | 'mic' | 'unavailable' | 'format' | 'rate_limited' | 'failed';

export function dictationWarning(kind: DictationWarningKind, locale?: string): string {
  const l = langOf(locale);
  const pick = (en: string, ru: string, ka: string) => (l === 'en' ? en : l === 'ru' ? ru : ka);
  switch (kind) {
    case 'mic':
      return pick(
        'Microphone access is blocked — allow it in your browser settings.',
        'Нет доступа к микрофону — разрешите его в настройках браузера.',
        'მიკროფონზე წვდომა დაბლოკილია — ნება დართე ბრაუზერის პარამეტრებში.',
      );
    case 'unavailable':
      return pick(
        'Speech recognition is unavailable right now — type your message or try again shortly.',
        'Распознавание речи сейчас недоступно — напишите сообщение или попробуйте чуть позже.',
        'მეტყველების ამოცნობა ახლა მიუწვდომელია — დაწერე შეტყობინება ან სცადე ცოტა მოგვიანებით.',
      );
    case 'format':
      return pick(
        "This browser's recording format isn't supported — type your message or try another browser.",
        'Формат записи этого браузера не поддерживается — напишите сообщение или откройте другой браузер.',
        'ამ ბრაუზერის ჩანაწერის ფორმატი არ არის მხარდაჭერილი — დაწერე შეტყობინება ან სცადე სხვა ბრაუზერი.',
      );
    case 'rate_limited':
      return pick(
        'Too many voice requests — wait a moment and try again.',
        'Слишком много голосовых запросов — подождите немного и попробуйте снова.',
        'ძალიან ბევრი ხმოვანი მოთხოვნაა — ცოტა დაიცადე და თავიდან სცადე.',
      );
    case 'failed':
      return pick(
        "Couldn't transcribe your recording — please try again.",
        'Не удалось расшифровать запись — попробуйте ещё раз.',
        'ჩანაწერის ტრანსკრიფცია ვერ მოხერხდა — სცადე თავიდან.',
      );
    default:
      // OmniStudio's exact words.
      return pick(
        'Transcription is not responding — your words may not be captured.',
        'Расшифровка не отвечает — слова могут не записаться.',
        'ტრანსკრიფცია არ პასუხობს — სიტყვები შესაძლოა არ ჩაიწეროს.',
      );
  }
}

/**
 * The FINAL pass asks the route for its diagnostics (`?diag=1`). The route answers them to an admin only (the owner)
 * and ignores the flag for anyone else, so only the owner's warning can carry Google's reason.
 * ⚠️ GG's mic on Production (2026-10-24) said only "speech recognition is unavailable right now": the route's
 * `stt_unavailable` stands for every Google failure (access, quota, a refused request, a missing model), and the
 * reason was in a server log nobody could read.
 */
export function transcribeUrlFor(base: string, kind: 'interim' | 'final'): string {
  if (kind !== 'final') return base;
  return `${base}${base.includes('?') ? '&' : '?'}diag=1`;
}

/** Google's reason from the route's admin diagnostics, bounded and without the project's path; null when none. */
export function ownerSttReason(diag: unknown): string | null {
  const raw = diag && typeof diag === 'object' ? (diag as { geminiError?: unknown }).geminiError : null;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return raw.replace(/projects\/[^/\s"'`]{1,200}/g, 'projects/…').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** The route's `code` (a 200 with no text) → the localized warning for a final pass. */
export function sttCodeWarning(code: string, locale?: string): string {
  return dictationWarning(code === 'stt_unavailable' ? 'unavailable' : code === 'unsupported_format' ? 'format' : 'failed', locale);
}

const sttCodeMetric = (code: string): DictationErrorCode =>
  (code === 'stt_unavailable' || code === 'unsupported_format' ? code : 'stt_error');

const normSpeech = (s: string): string => s.toLowerCase().replace(/[\s.,!?;:…"«»„“”]+/gu, ' ').trim();

/**
 * Join two pieces of recognized speech without repeating words. Android Chrome's continuous recognizer reports
 * CUMULATIVE results ("hello", then "hello world" as a NEW result) — joined naively the box reads "hello hello world".
 * When `next` already starts with everything in `acc` (on a word boundary, ignoring case and punctuation), it
 * replaces it instead of being appended.
 */
export function mergeSpeech(acc: string, next: string): string {
  const a = acc.trim();
  const n = next.trim();
  if (!a) return n;
  if (!n) return a;
  const na = normSpeech(a);
  const nn = normSpeech(n);
  if (na && (nn === na || nn.startsWith(`${na} `))) return n;
  return `${a} ${n}`;
}

// ─── Default captures (browser) ──────────────────────────────────────────────────────────────────────────

type ACCtor = typeof AudioContext;
function audioContextCtor(): ACCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACCtor }).webkitAudioContext;
}

function closeQuietly(ctx: AudioContext): void {
  try { void ctx.close().catch(() => undefined); } catch { /* noop */ }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms); });
  return Promise.race([p, guard]).finally(() => { if (timer) clearTimeout(timer); });
}

/** Wire the mic into a RUNNING context whose worklet module is loaded. Throws when the node cannot be built. */
function startWavSession(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  onLevel: (rms: number) => void,
  warm: boolean,
  release: () => Promise<void>,
): CaptureSession {
  const node = new AudioWorkletNode(ctx, PCM_WORKLET_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit', // a stereo mic is mixed down; the processor reads channel 0 only
    processorOptions: { frameSize: Math.max(128, Math.round(ctx.sampleRate / 10)) }, // ~100 ms frames
  });
  const sink = ctx.createGain();
  sink.gain.value = 0; // pulled by the graph so process() runs, but silent
  const rate = ctx.sampleRate;
  const chunks: Int16Array[] = [];
  let samples = 0;
  let closed = false;
  node.port.onmessage = (ev: MessageEvent) => {
    const d = ev.data as { type?: string; buffer?: ArrayBuffer; rms?: number } | null;
    if (closed || !d || d.type !== 'pcm16' || !d.buffer || typeof d.buffer.byteLength !== 'number') return;
    const pcm = new Int16Array(d.buffer);
    chunks.push(pcm);
    samples += pcm.length;
    onLevel(typeof d.rms === 'number' ? d.rms : 0);
  };
  source.connect(node);
  node.connect(sink);
  sink.connect(ctx.destination);
  const encode = (): Blob | null => {
    if (!samples) return null;
    const all = concatInt16(chunks, samples);
    const pcm = rate === WAV_SAMPLE_RATE ? all : downsampleTo16k(all, rate);
    return new Blob([buildWavBytes(pcm, WAV_SAMPLE_RATE) as BlobPart], { type: 'audio/wav' });
  };
  return {
    engine: 'wav',
    mimeType: 'audio/wav',
    minBytes: 44 + WAV_SAMPLE_RATE * 2 * 0.25, // a quarter second
    warm,
    seconds: () => samples / rate,
    snapshot: encode,
    finish: async () => {
      const blob = encode();
      if (!closed) {
        closed = true;
        node.port.onmessage = null;
        // The processor returns false from process() once told to stop, so a reused context does not keep a dead
        // node running (an older cached worklet ignores the message; WARM_CONTEXT_MAX_SESSIONS bounds that case).
        try { node.port.postMessage({ type: 'stop' }); } catch { /* noop */ }
        try { source.disconnect(); } catch { /* noop */ }
        try { node.disconnect(); } catch { /* noop */ }
        try { sink.disconnect(); } catch { /* noop */ }
        await release();
      }
      return blob;
    },
  };
}

/** The context primed in the tap: created once, its worklet module loading from the start, reused while healthy. */
interface WarmAudio {
  ctx: AudioContext;
  /** `audioWorklet.addModule` — started at creation, in parallel with the permission prompt. */
  ready: Promise<void>;
  /** The module failed to load or the context would not run: replaced on the next prime. */
  failed: boolean;
  /** Captures built on it so far. */
  sessions: number;
  /** Captures running on it now (never closed or replaced while > 0). */
  active: number;
}

let warmAudio: WarmAudio | null = null;
/** Firefox cannot connect a mic to a context at another rate: after the first refusal, prime at the native rate. */
let preferNativeRate = false;

function createWarmAudio(): WarmAudio | null {
  const AC = audioContextCtor();
  if (!AC || typeof AudioWorkletNode === 'undefined') return null;
  let ctx: AudioContext;
  try {
    ctx = preferNativeRate ? new AC() : new AC({ sampleRate: WAV_SAMPLE_RATE });
  } catch {
    try { ctx = new AC(); } catch { return null; }
  }
  if (!ctx.audioWorklet) { closeQuietly(ctx); return null; }
  const w: WarmAudio = { ctx, ready: Promise.resolve(), failed: false, sessions: 0, active: 0 };
  try {
    w.ready = ctx.audioWorklet.addModule(PCM_WORKLET_URL);
  } catch (err) {
    w.ready = Promise.reject(err);
  }
  w.ready.catch(() => { w.failed = true; });
  return w;
}

function disposeWarm(w: WarmAudio): void {
  if (warmAudio === w) warmAudio = null;
  if (w.active === 0) closeQuietly(w.ctx);
}

/**
 * SYNCHRONOUS and gesture-safe — call it inside the tap, before any await. Creates (or reuses) the recorder's audio
 * context, resumes it while the user activation is live (iOS keeps a context started outside a gesture 'suspended')
 * and starts loading the worklet, all in parallel with the getUserMedia prompt. Never throws; false = no AudioWorklet.
 */
export function primeDictationAudio(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const old = warmAudio;
    if (old && old.active === 0 && (old.failed || old.ctx.state === 'closed' || old.sessions >= WARM_CONTEXT_MAX_SESSIONS)) {
      disposeWarm(old);
    }
    if (!warmAudio) warmAudio = createWarmAudio();
    const w = warmAudio;
    if (!w) return false;
    if (w.ctx.state !== 'running') {
      try { void w.ctx.resume().catch(() => undefined); } catch { /* noop */ }
    }
    return true;
  } catch {
    return false;
  }
}

/** Let an idle primed context sleep (nothing captured on it: the mic was refused, or the dictation cancelled). */
export function parkDictationAudio(): void {
  const w = warmAudio;
  if (!w || w.active > 0 || w.ctx.state !== 'running') return;
  try { void w.ctx.suspend().catch(() => undefined); } catch { /* noop */ }
}

/** Close the primed context if it is idle (Live voice is taking over the audio hardware). */
export function releaseDictationAudio(): void {
  const w = warmAudio;
  if (w && w.active === 0) disposeWarm(w);
}

/** Test hook: forget the primed context and the native-rate preference. */
export function __resetDictationAudio(): void {
  warmAudio = null;
  preferNativeRate = false;
}

/** AudioWorklet → int16 PCM → WAV, on the context primed in the tap. Throws when it cannot, so the next is tried. */
export const createWavCapture: CaptureFactory = async (stream, onLevel) => {
  // Not primed in a gesture (Web Speech fell back to the recorder after its watchdog): warm up now.
  if (!warmAudio || warmAudio.failed || warmAudio.ctx.state === 'closed') primeDictationAudio();
  let w = warmAudio;
  if (!w) throw new Error('AudioWorklet unavailable');
  let source: MediaStreamAudioSourceNode;
  try {
    source = w.ctx.createMediaStreamSource(stream);
  } catch (err) {
    // ⚠️ Firefox refuses to connect a mic to a context whose rate differs from the device's. Remember it, and rebuild
    // the primed context at the native rate (`snapshot()` downsamples to 16 kHz).
    if (preferNativeRate || w.active > 0) throw err;
    preferNativeRate = true;
    disposeWarm(w);
    primeDictationAudio();
    w = warmAudio;
    if (!w) throw err;
    source = w.ctx.createMediaStreamSource(stream);
  }
  const wa = w;
  const ctx = wa.ctx;
  wa.active += 1;
  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    wa.active = Math.max(0, wa.active - 1);
    if (wa.active > 0) return;
    // Kept, asleep, with its worklet loaded, for the next dictation; one that was replaced meanwhile is closed.
    if (warmAudio === wa) await ctx.suspend().catch(() => undefined);
    else await ctx.close().catch(() => undefined);
  };
  try {
    await withTimeout(wa.ready, WORKLET_LOAD_TIMEOUT_MS, 'worklet load');
    // Normally already running (resumed in the tap). UNCERTAIN (not device-tested): iOS can interrupt a context when
    // the capture starts; a resume while the page is capturing is then the best remaining chance.
    if (ctx.state !== 'running') await withTimeout(ctx.resume(), CONTEXT_RESUME_TIMEOUT_MS, 'resume').catch(() => undefined);
    if (ctx.state !== 'running') throw new Error(`AudioContext ${ctx.state}`);
    const session = startWavSession(ctx, source, onLevel, true, release);
    wa.sessions += 1;
    return session;
  } catch (err) {
    try { source.disconnect(); } catch { /* noop */ }
    wa.failed = true; // the next tap builds a fresh one inside its gesture
    await release();
    throw err;
  }
};

/** The old path: a fresh context built after getUserMedia and closed after the clip. The primed capture's fallback. */
export const createColdWavCapture: CaptureFactory = async (stream, onLevel) => {
  const AC = audioContextCtor();
  if (!AC || typeof AudioWorkletNode === 'undefined') throw new Error('AudioWorklet unavailable');
  let ctx: AudioContext;
  try { ctx = new AC({ sampleRate: WAV_SAMPLE_RATE }); } catch { ctx = new AC(); }
  try {
    let source: MediaStreamAudioSourceNode;
    try {
      source = ctx.createMediaStreamSource(stream);
    } catch {
      // ⚠️ Firefox: capture at the native rate instead and downsample in `snapshot()`.
      await ctx.close().catch(() => undefined);
      ctx = new AC();
      source = ctx.createMediaStreamSource(stream);
    }
    if (!ctx.audioWorklet) throw new Error('AudioWorklet unavailable');
    await ctx.audioWorklet.addModule(PCM_WORKLET_URL);
    // UNCERTAIN (not device-tested): whether iOS lets a context made after the getUserMedia await run without
    // a fresh gesture. A context that will not start throws here, and MediaRecorder takes over.
    if (ctx.state !== 'running') await withTimeout(ctx.resume(), CONTEXT_RESUME_TIMEOUT_MS, 'resume').catch(() => undefined);
    if (ctx.state !== 'running') throw new Error(`AudioContext ${ctx.state}`);
    const c = ctx;
    return startWavSession(ctx, source, onLevel, false, async () => { await c.close().catch(() => undefined); });
  } catch (err) {
    await ctx.close().catch(() => undefined);
    throw err;
  }
};

/** The old path: MediaRecorder in whatever container the platform records (webm / mp4). */
export const createMediaRecorderCapture: CaptureFactory = async (stream, onLevel) => {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder unavailable');
  let chosen = '';
  for (const c of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/mpeg']) {
    try { if (MediaRecorder.isTypeSupported(c)) { chosen = c; break; } } catch { /* noop */ }
  }
  const rec = chosen ? new MediaRecorder(stream, { mimeType: chosen }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  const type = () => rec.mimeType || chosen || 'audio/webm';
  const snapshot = () => (chunks.length ? new Blob(chunks, { type: type() }) : null);
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  // Level meter for silence auto-stop — best effort; without it the manual Stop still works.
  let closed = false;
  let raf = 0;
  let meter: AudioContext | null = null;
  const stopMeter = () => {
    if (raf) { try { cancelAnimationFrame(raf); } catch { /* noop */ } raf = 0; }
    const m = meter;
    meter = null;
    if (m) void m.close().catch(() => undefined);
  };
  try {
    const AC = audioContextCtor();
    if (AC && typeof requestAnimationFrame === 'function') {
      meter = new AC();
      const analyser = meter.createAnalyser();
      analyser.fftSize = 512;
      meter.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (closed) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = ((buf[i] ?? 128) - 128) / 128; sum += v * v; }
        onLevel(Math.sqrt(sum / buf.length));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
  } catch { stopMeter(); }
  const started = Date.now();
  rec.start(TICK_MS);
  return {
    engine: 'mediarecorder',
    get mimeType() { return type(); },
    minBytes: 1600,
    seconds: () => (Date.now() - started) / 1000,
    snapshot,
    // The last timeslice arrives in `dataavailable` AFTER stop(), so the clip is only whole once `onstop` fires.
    finish: () => new Promise<Blob | null>((resolve) => {
      closed = true;
      stopMeter();
      if (rec.state === 'inactive') { resolve(snapshot()); return; }
      let settled = false;
      const done = () => { if (settled) return; settled = true; clearTimeout(guard); resolve(snapshot()); };
      const guard = setTimeout(done, 1500);
      rec.onstop = done;
      try { rec.stop(); } catch { done(); }
    }),
  };
};

function stopStream(stream: MediaStream | null | undefined): void {
  try { stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } }); } catch { /* noop */ }
}

/** Defaults, overridden only by the injected deps that are actually defined (an explicit `undefined` keeps the default). */
function withDefaults<T extends object>(defaults: T, over: Partial<T> | undefined): T {
  const out = { ...defaults };
  if (over) {
    for (const k of Object.keys(over) as Array<keyof T>) {
      const v = over[k];
      if (v !== undefined) out[k] = v as T[keyof T];
    }
  }
  return out;
}

const defaultDeps = (): DictationDeps => ({
  speechRecognition: () => {
    if (typeof window === 'undefined') return undefined;
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  },
  userAgent: () => (typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''),
  getUserMedia: (c) => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return Promise.reject(Object.assign(new Error('getUserMedia unavailable'), { name: 'NotSupportedError' }));
    }
    return navigator.mediaDevices.getUserMedia(c);
  },
  captureFactories: [createWavCapture, createColdWavCapture, createMediaRecorderCapture],
  primeCapture: () => { primeDictationAudio(); },
  parkCapture: parkDictationAudio,
  reportMetrics: reportDictationMetrics,
  fetch: (...args) => fetch(...args),
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  isGuest: () => typeof document !== 'undefined' && document.documentElement?.dataset?.authed === '0',
  loadSpeechLang: loadLearnedSpeechLang,
  saveSpeechLang: saveLearnedSpeechLang,
});

// ─── The hook ────────────────────────────────────────────────────────────────────────────────────────────

/** One dictation, from the tap to its end: what the phase belongs to, and what the metrics summary reports. */
interface Run {
  lang: SttRequestLang;
  engine: 'webspeech' | 'recorder';
  capture: 'wav' | 'mediarecorder' | null;
  warm: boolean | null;
  fallback: boolean;
  tapAt: number;
  listeningAt: number | null;
  firstTextAt: number | null;
  stopAt: number | null;
  passes: number;
  passMs: number[];
  serverSttMs: number[];
  finalPassMs: number | null;
  aborted: number;
  deferred: number;
  failed: number;
  restarts: number;
  errorCode: DictationErrorCode | null;
  wroteText: boolean;
  done: boolean;
}

interface RecorderState {
  run: Run;
  /** 'auto' until the first transcript names the language; then that language, for the rest of the clip. */
  lang: SttRequestLang;
  base: string;
  stream: MediaStream;
  session: CaptureSession | null;
  timer: ReturnType<typeof setInterval> | null;
  /** Captured-audio ms at which the last interim pass was sent (0 = none yet). */
  lastPassMs: number;
  inFlight: Promise<void> | null;
  /** The in-flight interim pass — Stop aborts it. */
  interimCtrl: AbortController | null;
  /** An interim pass came due while one was in flight; it runs the moment that one returns (never more than one). */
  pending: boolean;
  stopped: boolean;
  /** Stop happened: no interim result may land any more. */
  finalStarted: boolean;
  /** Levels are arriving (a meter exists for this capture). */
  metered: boolean;
  /** Captured-audio ms of the first level above SILENCE_RMS. */
  speechAtMs: number | null;
  spoke: boolean;
  quietSince: number;
  failStreak: number;
}

/** What Web Speech has heard in this dictation, by result index, and where it goes in the box. */
interface WebSpeechText {
  base: string;
  /** Text from earlier recognizer sessions (Chrome restarts itself; the indices start again from 0). */
  committed: string;
  /** This session's final results, by result index. */
  finals: string[];
  interim: string;
  /** Results up to this index are ignored: the utterance in progress when the user edited the box. */
  skipThrough: number;
  maxIndex: number;
}

function heardText(ws: WebSpeechText): string {
  let finals = '';
  for (const f of ws.finals) if (f) finals = mergeSpeech(finals, f);
  return mergeSpeech(mergeSpeech(ws.committed, finals), ws.interim);
}

/** A failed pass, with the metrics code. */
class PassFailure extends Error {
  readonly code: DictationErrorCode;
  constructor(code: DictationErrorCode) {
    super(code);
    this.code = code;
  }
}

export function useDictation(options: UseDictationOptions): UseDictationResult {
  const [phase, setPhaseState] = useState<DictationPhase>('idle');
  const [engine, setEngine] = useState<DictationEngine | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  // Every returned function is stable: they read the latest options through refs (OmniStudio's send() lists
  // its dependencies by hand; a callback that changed identity every render would churn all of them).
  const optsRef = useRef(options);
  optsRef.current = options;
  const depsRef = useRef<DictationDeps>(withDefaults(defaultDeps(), options.deps));
  depsRef.current = withDefaults(defaultDeps(), options.deps);
  const valueRef = useRef(options.value);
  valueRef.current = options.value;

  const inputSourceRef = useRef<'text' | 'voice'>('text');
  const phaseRef = useRef<DictationPhase>('idle');
  /** The current dictation. A callback from one that ended (or was superseded) never touches the state. */
  const runRef = useRef<Run | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wsRef = useRef<WebSpeechText | null>(null);
  const recorderRef = useRef<RecorderState | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sttDiscardRef = useRef(false);
  const lastWriteRef = useRef('');
  const micStopRequestedRef = useRef(false);
  const unsupportedLangsRef = useRef<Set<string>>(new Set());
  // `transcribe` (a 401) needs `stopRecorder`, which is defined after it; the ref breaks the cycle.
  const stopRecorderRef = useRef<((finalPass: boolean) => Promise<void>) | null>(null);

  const setPhase = useCallback((p: DictationPhase) => { phaseRef.current = p; setPhaseState(p); }, []);
  /** Phase changes from a dictation that is no longer the current one are ignored. */
  const setPhaseFor = useCallback((run: Run, p: DictationPhase) => { if (runRef.current === run) setPhase(p); }, [setPhase]);

  const beginRun = useCallback((lang: SttRequestLang, eng: Run['engine']): Run => {
    const run: Run = {
      lang, engine: eng, capture: null, warm: null, fallback: false,
      tapAt: depsRef.current.now(), listeningAt: null, firstTextAt: null, stopAt: null,
      passes: 0, passMs: [], serverSttMs: [], finalPassMs: null,
      aborted: 0, deferred: 0, failed: 0, restarts: 0, errorCode: null, wroteText: false, done: false,
    };
    runRef.current = run;
    setPhase('starting');
    return run;
  }, [setPhase]);

  const markListening = useCallback((run: Run) => {
    if (runRef.current !== run) return;
    if (run.listeningAt === null) run.listeningAt = depsRef.current.now();
    if (phaseRef.current === 'starting') setPhase('listening');
  }, [setPhase]);

  const markText = useCallback((run: Run) => {
    run.wroteText = true;
    if (run.firstTextAt === null) run.firstTextAt = depsRef.current.now();
  }, []);

  /** The dictation is over: back to idle (if it is still the current one) and one metrics summary. Idempotent. */
  const finishRun = useCallback((run: Run, outcome?: DictationOutcome) => {
    if (run.done) return;
    run.done = true;
    if (runRef.current === run) {
      runRef.current = null;
      setPhase('idle');
    }
    const d = depsRef.current;
    const now = d.now();
    const span = (from: number | null, to: number | null): number | undefined =>
      (from !== null && to !== null && to >= from ? Math.round(to - from) : undefined);
    const summary: DictationMetrics = {
      v: 1,
      engine: run.engine,
      lang: run.lang,
      outcome: outcome ?? (run.errorCode ? 'error' : run.wroteText ? 'text' : 'empty'),
      passes: run.passes,
      passMs: run.passMs.map(Math.round),
      serverSttMs: run.serverSttMs.map(Math.round),
      aborted: run.aborted,
      deferred: run.deferred,
      failed: run.failed,
      restarts: run.restarts,
    };
    if (run.capture) summary.capture = run.capture;
    if (run.errorCode) summary.errorCode = run.errorCode;
    if (run.warm !== null) summary.warm = run.warm;
    if (run.fallback) summary.fallback = true;
    const tapToListening = span(run.tapAt, run.listeningAt);
    if (tapToListening !== undefined) summary.tapToListeningMs = tapToListening;
    const toFirstText = span(run.listeningAt, run.firstTextAt);
    if (toFirstText !== undefined) summary.listeningToFirstTextMs = toFirstText;
    const stopToFinal = span(run.stopAt, now);
    if (stopToFinal !== undefined) summary.stopToFinalMs = stopToFinal;
    const listen = span(run.listeningAt, run.stopAt ?? now);
    if (listen !== undefined) summary.listenMs = listen;
    if (run.finalPassMs !== null) summary.finalPassMs = Math.round(run.finalPassMs);
    try { d.reportMetrics(summary); } catch { /* metrics never break dictation */ }
  }, [setPhase]);
  const finishRunRef = useRef(finishRun);
  finishRunRef.current = finishRun;

  const transcribe = useCallback(async (r: RecorderState, blob: Blob | null, kind: 'interim' | 'final'): Promise<void> => {
    const run = r.run;
    if (sttDiscardRef.current || runRef.current !== run || !blob || blob.size < (r.session?.minBytes ?? 1600)) return;
    if (kind === 'interim' && r.finalStarted) return;
    const d = depsRef.current;
    const o = optsRef.current;
    const ctrl = new AbortController();
    if (kind === 'interim') r.interimCtrl = ctrl;
    abortRef.current = ctrl;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, TRANSCRIBE_TIMEOUT_MS);
    // Our own abort (Stop, a send), a dictation that is over, or an interim answer arriving after Stop: dropped.
    const stale = () => sttDiscardRef.current || runRef.current !== run || (ctrl.signal.aborted && !timedOut)
      || (kind === 'interim' && r.finalStarted);
    const t0 = d.now();
    run.passes += 1;
    try {
      const fd = new FormData();
      // The extension must match the bytes — Whisper-class legs dispatch on it (lib/voice/audioExt).
      fd.append('audio', blob, `clip.${audioExtFor(blob.type || r.session?.mimeType)}`);
      fd.append('language', r.lang);
      const res = await d.fetch(transcribeUrlFor(o.transcribeUrl ?? '/api/voice/transcribe', kind), { method: 'POST', body: fd, credentials: 'same-origin', signal: ctrl.signal });
      // Re-check AFTER the await: a send() while this was in flight already emptied the box.
      if (stale()) return;
      if (res.status === 401) {
        r.failStreak = 0;
        run.errorCode = 'auth';
        try { o.onAuthRequired?.(); } catch { /* noop */ }
        void stopRecorderRef.current?.(false);
        return;
      }
      if (!res.ok) throw new PassFailure(res.status === 429 ? 'rate_limited' : 'http');
      const j = (await res.json().catch(() => ({}))) as { text?: unknown; language?: unknown; code?: unknown; diag?: unknown };
      if (stale()) return;
      const took = d.now() - t0;
      if (run.passMs.length < DICTATION_METRICS_MAX_PASSES) run.passMs.push(took);
      let serverTiming: string | null = null;
      try { serverTiming = res.headers?.get?.('server-timing') ?? null; } catch { /* no headers */ }
      const sttMs = serverTimingMs(serverTiming, 'stt');
      if (sttMs !== undefined && run.serverSttMs.length < DICTATION_METRICS_MAX_PASSES) run.serverSttMs.push(sttMs);
      if (kind === 'final') run.finalPassMs = took;
      const t = typeof j.text === 'string' ? j.text.trim() : '';
      const code = typeof j.code === 'string' ? j.code.trim() : '';
      // The language the server HEARD: remembered for the next dictation (which can then use the instant Web Speech
      // engine in it), and pinned for the rest of an auto-detected clip so its passes stay consistent.
      if (t && isSpeechLang(j.language)) {
        if (r.lang === 'auto') r.lang = j.language;
        try { d.saveSpeechLang(j.language); } catch { /* a convenience */ }
      }
      if (t) {
        const next = r.base + t;
        markText(run);
        // Read the LIVE box: if the user typed since our last write, keep their edit and do not re-tag it as
        // voice (a late final pass would otherwise clobber it and tag a typed turn as spoken).
        o.setValue((cur) => {
          if (cur !== '' && cur !== lastWriteRef.current) return cur;
          lastWriteRef.current = next;
          inputSourceRef.current = 'voice';
          return next;
        });
      } else if (code) {
        // A 200 with `code` = the engine could not run. An interim miss stays silent; on the FINAL pass this was the
        // user's whole dictation, so say so now instead of leaving an unchanged box.
        if (kind === 'final') {
          run.errorCode = sttCodeMetric(code);
          const why = ownerSttReason(j.diag);
          setWarn(why ? `${sttCodeWarning(code, o.locale)} (${why})` : sttCodeWarning(code, o.locale));
        }
        return;
      }
      r.failStreak = 0;
      setWarn(null);
    } catch (err) {
      if (stale()) return;
      run.failed += 1;
      const why: DictationErrorCode = err instanceof PassFailure ? err.code : timedOut ? 'timeout' : 'network';
      if (kind === 'final') {
        // The last chance for these words: say so at once.
        run.errorCode = why;
        setWarn(dictationWarning(why === 'rate_limited' ? 'rate_limited' : 'failed', o.locale));
      } else {
        // Shown only after the SECOND consecutive failure, so one flaky interim pass stays invisible.
        r.failStreak += 1;
        if (r.failStreak >= 2) setWarn(dictationWarning('transcription', o.locale));
      }
    } finally {
      clearTimeout(timer);
      if (abortRef.current === ctrl) abortRef.current = null;
      if (r.interimCtrl === ctrl) r.interimCtrl = null;
    }
  }, [markText]);

  const stopRecorder = useCallback(async (finalPass: boolean): Promise<void> => {
    const r = recorderRef.current;
    if (!r || r.stopped) return;
    const run = r.run;
    r.stopped = true;
    r.finalStarted = true;
    r.pending = false;
    recorderRef.current = null;
    if (r.timer) { clearInterval(r.timer); r.timer = null; }
    streamRef.current = null;
    // Stop never waits behind an interim pass: abort it — the final pass re-sends the whole clip anyway.
    if (r.interimCtrl) {
      run.aborted += 1;
      try { r.interimCtrl.abort(); } catch { /* noop */ }
      r.interimCtrl = null;
    }
    if (run.stopAt === null) run.stopAt = depsRef.current.now();
    const wantFinal = finalPass && !sttDiscardRef.current && !!r.session && runRef.current === run;
    setPhaseFor(run, wantFinal ? 'processing' : 'idle');
    setEngine(null);
    try {
      // finish() FIRST (it snapshots the WAV / asks MediaRecorder for its last chunk synchronously), THEN release
      // the device, THEN wait. ⚠️ The tracks used to stop only after `await finish()` — up to 1.5 s of a hot mic
      // that Live voice, opened right after, could not get.
      const finishing = r.session ? r.session.finish().catch(() => null) : Promise.resolve(null);
      stopStream(r.stream);
      const blob = await finishing;
      if (!wantFinal) return;
      await transcribe(r, blob, 'final');
    } finally {
      finishRun(run, wantFinal ? undefined : run.errorCode ? 'error' : run.wroteText ? 'text' : 'cancelled');
    }
  }, [finishRun, setPhaseFor, transcribe]);
  stopRecorderRef.current = stopRecorder;

  const startRecorder = useCallback(async (lang: SttRequestLang, run: Run): Promise<void> => {
    const d = depsRef.current;
    sttDiscardRef.current = false; // a fresh dictation accepts transcription again
    // Reentrancy guard: a double start must not open two mics (the loser stream would stay HOT).
    if (streamRef.current || recorderRef.current) return;
    run.engine = 'recorder';
    // ⚡ INSIDE THE TAP, before the first await: wake the audio context and start loading the worklet, in parallel
    // with the permission prompt / device start below (see the file header).
    try { d.primeCapture(); } catch { /* the capture builds its own */ }
    let stream: MediaStream;
    try {
      stream = await d.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      try { d.parkCapture(); } catch { /* noop */ }
      if (runRef.current !== run) return; // cancelled while the prompt was up
      setEngine(null);
      run.errorCode = 'mic';
      const name = (err as { name?: string } | null)?.name ?? '';
      if (/NotAllowed|Security|NotFound|NotReadable|NotSupported/.test(name)) setWarn(dictationWarning('mic', optsRef.current.locale));
      finishRun(run, 'denied');
      return;
    }
    // Stopped (or superseded) while the permission prompt was up: release this stream, record nothing.
    if (runRef.current !== run || streamRef.current || recorderRef.current || micStopRequestedRef.current) {
      stopStream(stream);
      try { d.parkCapture(); } catch { /* noop */ }
      if (runRef.current === run) finishRun(run, 'cancelled');
      return;
    }
    streamRef.current = stream;
    const base = valueRef.current ? `${valueRef.current.trimEnd()} ` : '';
    // Seed "our last write" with the box AS IT IS, so a clip that only reaches the final pass still
    // recognises an untouched box.
    // ⚠️ OMNISTUDIO SEEDED IT WITH `base`, WHICH HAS A TRAILING SPACE. The takeover check compares the live
    // box with this value, and 'text' is not 'text ' — so on the recorder path (every Georgian dictation on
    // Safari/iOS) a box that already held text was always judged "edited by the user" and the transcript was
    // silently dropped. Only an empty box ever received dictation there.
    lastWriteRef.current = valueRef.current;
    const r: RecorderState = {
      run, lang, base, stream, session: null, timer: null, lastPassMs: 0, inFlight: null, interimCtrl: null,
      pending: false, stopped: false, finalStarted: false, metered: false, speechAtMs: null,
      spoke: false, quietSince: 0, failStreak: 0,
    };
    recorderRef.current = r;
    // Hands-free stop: once the user has spoken and then stays quiet for SILENCE_HOLD_MS, stop (no auto-send).
    const onLevel = (rms: number) => {
      if (r.stopped) return;
      r.metered = true;
      const now = depsRef.current.now();
      if (rms > SILENCE_RMS) {
        if (r.speechAtMs === null) r.speechAtMs = (r.session?.seconds() ?? 0) * 1000;
        r.spoke = true;
        r.quietSince = 0;
        return;
      }
      if (!r.spoke) return;
      if (!r.quietSince) { r.quietSince = now; return; }
      if (now - r.quietSince > SILENCE_HOLD_MS) void stopRecorder(true);
    };
    let session: CaptureSession | null = null;
    for (const make of d.captureFactories) {
      try { session = await make(stream, onLevel); break; } catch { /* try the next capture */ }
    }
    if (r.stopped) { // stopped while the capture was being built (stopRecorder already ended the dictation)
      await session?.finish().catch(() => null);
      stopStream(stream);
      return;
    }
    if (!session) {
      stopStream(stream);
      streamRef.current = null;
      recorderRef.current = null;
      try { d.parkCapture(); } catch { /* noop */ }
      setEngine(null);
      setWarn(dictationWarning('mic', optsRef.current.locale));
      run.errorCode = 'capture';
      finishRun(run, 'error');
      return;
    }
    r.session = session;
    run.capture = session.engine;
    run.warm = session.warm === true;
    const runInterim = (): void => {
      r.pending = false;
      const s = r.session;
      if (r.stopped || r.finalStarted || !s || sttDiscardRef.current || runRef.current !== run) return;
      const at = s.seconds() * 1000;
      if (at > MAX_INTERIM_MS) return; // past the ceiling a deferred pass is dropped too
      r.lastPassMs = at;
      const p = transcribe(r, s.snapshot(), 'interim');
      r.inFlight = p;
      void p.finally(() => {
        if (r.inFlight === p) r.inFlight = null;
        // The pass that came due meanwhile runs NOW, not at the next due time — the text keeps moving.
        if (r.pending) runInterim();
      });
    };
    r.timer = setInterval(() => {
      const s = r.session;
      if (r.stopped || !s) return;
      const sec = s.seconds();
      if (sec >= MAX_RECORD_SEC) { void stopRecorder(true); return; }
      if (sttDiscardRef.current || r.pending) return;
      // Interim passes back off as the clip grows (lib/voice/interimCadence); each re-sends the whole clip.
      if (!shouldRunInterimAt(sec * 1000, r.lastPassMs, { metered: r.metered, onsetMs: r.speechAtMs })) return;
      // ⚠️ A due pass is DEFERRED behind the one in flight, never consumed (see the file header).
      if (r.inFlight) { r.pending = true; run.deferred += 1; return; }
      runInterim();
    }, TICK_MS);
    setEngine(session.engine);
    markListening(run);
  }, [finishRun, markListening, stopRecorder, transcribe]);

  /** Web Speech: write what was heard after `base`, unless the user edited the box since our last write. */
  const writeWebSpeech = useCallback((run: Run, ws: WebSpeechText) => {
    if (heardText(ws)) markText(run);
    optsRef.current.setValue((cur) => {
      if (wsRef.current !== ws) return cur;
      if (cur !== lastWriteRef.current) {
        // The user typed (or cleared the box) while dictating: their text is the new base, and the utterance in
        // progress is dropped — part of it was on screen when they edited, so appending it would repeat words.
        ws.base = cur.trim() ? `${cur.trimEnd()} ` : '';
        ws.committed = '';
        ws.finals = [];
        ws.interim = '';
        ws.skipThrough = ws.maxIndex;
        lastWriteRef.current = cur;
        return cur;
      }
      const heard = heardText(ws);
      if (!heard) return cur;
      const next = `${ws.base}${heard}`.replace(/\s+/g, ' ').trimStart();
      if (next === cur) return cur;
      lastWriteRef.current = next;
      inputSourceRef.current = 'voice';
      return next;
    });
  }, [markText]);

  const stop = useCallback(() => {
    // Mark the stop INTENTIONAL first, so the recognizer's onend does not take it for Chrome's own timeout.
    micStopRequestedRef.current = true;
    const run = runRef.current;
    if (run && run.stopAt === null) run.stopAt = depsRef.current.now();
    const rec = recognitionRef.current;
    try { rec?.stop(); } catch { /* noop */ }
    if (recorderRef.current) { void stopRecorder(true); return; }
    // Still asking for the mic (the permission prompt may be up): the dictation is over NOW; startRecorder releases
    // the stream that arrives later.
    if (!rec && run && runRef.current === run && phaseRef.current === 'starting') finishRun(run, 'cancelled');
  }, [finishRun, stopRecorder]);

  const toggle = useCallback(async (): Promise<void> => {
    const ph = phaseRef.current;
    if (ph === 'starting' || ph === 'listening') { stop(); return; }
    // The final pass is still writing into the box; a new dictation now would race it.
    if (ph === 'processing') return;
    const o = optsRef.current;
    const d = depsRef.current;
    const guest = o.authed === false || (o.authed === undefined && d.isGuest());
    if (guest) {
      try { o.onAuthRequired?.(); } catch { /* noop */ }
      return;
    }
    micStopRequestedRef.current = false;
    setWarn(null);
    // The language the user SPEAKS, not merely the UI's (lib/voice/speechLang): typed native script → heard before →
    // Georgian UI → 'auto'. Web Speech cannot detect a language, so 'auto' goes to the recorder, where Gemini does.
    let learned: SpeechLang | null = null;
    try { learned = d.loadSpeechLang(); } catch { /* unknown */ }
    const want = resolveSpeechLang({ locale: o.locale, typed: o.speechLang ?? null, learned });
    const SR = want === 'auto' ? undefined : d.speechRecognition();
    const webSpeech = want !== 'auto' && !!SR && !(isAppleSpeechEngine(d.userAgent()) && want.startsWith('ka'))
      && !unsupportedLangsRef.current.has(want);
    // The tap shows 'starting' at once; 'listening' only once capture really runs.
    const run = beginRun(want, webSpeech ? 'webspeech' : 'recorder');
    if (want === 'auto' || !SR || !webSpeech) { await startRecorder(want, run); return; }
    const lang: SpeechLang = want;
    try {
      const rec = new SR();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      sttDiscardRef.current = false;
      const ws: WebSpeechText = {
        base: valueRef.current ? `${valueRef.current.trimEnd()} ` : '',
        committed: '', finals: [], interim: '', skipThrough: -1, maxIndex: -1,
      };
      wsRef.current = ws;
      lastWriteRef.current = valueRef.current; // the box as it is = "our" text (see startRecorder's ⚠️)
      let fellBack = false;
      let gotResult = false;
      let restarts = 0;
      const toRecorder = () => {
        if (fellBack) return;
        fellBack = true;
        try { rec.stop(); } catch { /* noop */ }
        if (recognitionRef.current === rec) recognitionRef.current = null;
        if (wsRef.current === ws) wsRef.current = null;
        if (runRef.current !== run) return;
        run.fallback = true;
        run.listeningAt = null; // re-measured when the recorder's capture runs
        setPhaseFor(run, 'starting');
        setEngine(null);
        void startRecorder(lang, run);
      };
      const listening = () => { if (!fellBack) markListening(run); };
      // Until the engine reports speech, wait long (a user pausing to think is not a dead engine); once it
      // has heard speech and still produces nothing, the engine is at fault and 2.5 s is plenty.
      let watchdog = setTimeout(() => { if (!gotResult) toRecorder(); }, WEB_SPEECH_START_WATCHDOG_MS);
      rec.onstart = listening;
      rec.onaudiostart = listening;
      rec.onspeechstart = () => {
        listening();
        if (gotResult || fellBack) return;
        clearTimeout(watchdog);
        watchdog = setTimeout(() => { if (!gotResult) toRecorder(); }, WEB_SPEECH_AFTER_SPEECH_WATCHDOG_MS);
      };
      rec.onresult = (e: SREvent) => {
        if (sttDiscardRef.current || fellBack || runRef.current !== run) return; // a send() discarded this dictation
        gotResult = true;
        clearTimeout(watchdog);
        listening();
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res) continue;
          if (i > ws.maxIndex) ws.maxIndex = i;
          if (i <= ws.skipThrough) continue;
          const txt = res[0]?.transcript ?? '';
          // By index, not appended: a final delivered twice is still one final.
          if (res.isFinal) ws.finals[i] = txt;
          else interim += txt;
        }
        ws.interim = interim;
        writeWebSpeech(run, ws);
      };
      // Chrome ends recognition by itself after silence even with continuous = true: restart it unless the
      // user (or a send) stopped it. A BUDGET, not a flag — an engine that ends at once would otherwise spin.
      rec.onend = () => {
        clearTimeout(watchdog);
        if (fellBack) return;
        if (runRef.current !== run) { // ended elsewhere (a send, an error) — never restart a dictation that is over
          if (recognitionRef.current === rec) recognitionRef.current = null;
          return;
        }
        if (!micStopRequestedRef.current && !sttDiscardRef.current && restarts < WEB_SPEECH_MAX_RESTARTS) {
          restarts += 1;
          run.restarts += 1;
          // The next session numbers its results from 0 again: keep what this one heard.
          let finals = '';
          for (const f of ws.finals) if (f) finals = mergeSpeech(finals, f);
          ws.committed = mergeSpeech(ws.committed, finals);
          ws.finals = [];
          ws.interim = '';
          ws.skipThrough = -1;
          ws.maxIndex = -1;
          try { rec.start(); return; } catch { /* fall through to ending cleanly */ }
        }
        if (recognitionRef.current === rec) recognitionRef.current = null;
        setEngine(null);
        finishRun(run);
      };
      rec.onerror = (ev) => {
        const code = ev && typeof ev.error === 'string' ? ev.error : '';
        if (code === 'no-speech') return; // the user has not spoken yet; the watchdog still covers a dead engine
        clearTimeout(watchdog);
        if (code === 'language-not-supported' || code === 'service-not-allowed') {
          // Permanent for this language: go straight to the recorder for the rest of the session.
          unsupportedLangsRef.current.add(lang);
          // eslint-disable-next-line no-console
          console.warn(`[stt] Web Speech rejected lang=${lang} (${code}) — using the recorder for this session`);
        }
        if (fellBack || runRef.current !== run) return;
        if (!gotResult && !micStopRequestedRef.current && !sttDiscardRef.current) { toRecorder(); return; }
        // The user's stop: onend (which follows) ends the dictation. Any other error after results: end it here,
        // so onend cannot restart a broken engine.
        if (micStopRequestedRef.current || sttDiscardRef.current) return;
        if (!run.wroteText) run.errorCode = 'webspeech';
        if (recognitionRef.current === rec) recognitionRef.current = null;
        setEngine(null);
        finishRun(run);
      };
      recognitionRef.current = rec;
      rec.start();
      setEngine('webspeech');
      return;
    } catch {
      recognitionRef.current = null; // fall through to the recorder
      wsRef.current = null;
    }
    await startRecorder(lang, run);
  }, [beginRun, finishRun, markListening, setPhaseFor, startRecorder, stop, writeWebSpeech]);

  const stopEcho = useCallback(() => {
    sttDiscardRef.current = true;
    micStopRequestedRef.current = true;
    const run = runRef.current;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    wsRef.current = null;
    try { rec?.stop(); } catch { /* noop */ }
    void stopRecorder(false);
    try { abortRef.current?.abort(); } catch { /* noop */ }
    abortRef.current = null;
    if (run) finishRun(run, run.wroteText ? 'text' : 'cancelled');
    setPhase('idle');
    setEngine(null);
    try { optsRef.current.textareaRef?.current?.blur(); } catch { /* noop */ }
  }, [finishRun, setPhase, stopRecorder]);

  // Another feature (Live voice) needs the microphone NOW. Like stop(), but the device is released before this
  // returns: the recognizer is told to stop (its final result still lands in the box) and the recorder's tracks
  // stop synchronously; the recorder's final pass then transcribes what was captured. Nothing dictated is lost.
  const releaseMic = useCallback(() => {
    releaseDictationAudio(); // an idle primed context gives the audio hardware back too
    const stream = streamRef.current;
    const run = runRef.current;
    if (!run && !stream && !recognitionRef.current) return;
    micStopRequestedRef.current = true; // also makes a getUserMedia still in flight drop its stream
    if (run && run.stopAt === null) run.stopAt = depsRef.current.now();
    const rec = recognitionRef.current;
    try { rec?.stop(); } catch { /* noop */ }
    stopStream(stream);
    if (recorderRef.current) { void stopRecorder(true); return; }
    if (!rec && run && runRef.current === run && phaseRef.current === 'starting') finishRun(run, 'cancelled');
  }, [finishRun, stopRecorder]);
  useMicRelease(releaseMic, 'dictation');

  const markTyped = useCallback(() => { inputSourceRef.current = 'text'; }, []);
  const clearWarn = useCallback(() => setWarn(null), []);

  // Unmount: nothing may keep the mic open or write into a composer that is gone.
  useEffect(() => () => {
    sttDiscardRef.current = true;
    micStopRequestedRef.current = true;
    const run = runRef.current;
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    recognitionRef.current = null;
    wsRef.current = null;
    void stopRecorderRef.current?.(false);
    try { abortRef.current?.abort(); } catch { /* noop */ }
    if (run) finishRunRef.current(run, run.wroteText ? 'text' : 'cancelled');
  }, []);

  return {
    phase,
    recording: phase === 'starting' || phase === 'listening',
    transcribing: phase === 'processing',
    engine, warn, inputSourceRef, toggle, stop, stopEcho, markTyped, clearWarn,
  };
}
