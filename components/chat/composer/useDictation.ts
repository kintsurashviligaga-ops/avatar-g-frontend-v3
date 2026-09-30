'use client';

/**
 * useDictation — the composer mic: speech → text in the box. Extracted from OmniStudio (`toggleMic` :6020,
 * `startRecorderFallback` :5853, `stopDictationEcho` :4690) with the same product rules:
 *
 *  · Web Speech first where it can do the language (Chrome's engine is Google's and handles Georgian), with the
 *    8 s / 2.5 s-after-`onspeechstart` watchdog, the restart budget for Chrome's self-ending `onend`,
 *    `no-speech` as non-fatal, and a session memory of languages the engine rejected.
 *  · Apple's engine (iOS and macOS Safari) has no Georgian, so `ka` there goes straight to the recorder.
 *  · Otherwise, record and POST to /api/voice/transcribe, streaming interim passes into the box on the
 *    `lib/voice/interimCadence` back-off, then one final pass on Stop.
 *  · NO AUTO-SEND. Dictation fills the box and waits for the user to tap Send (product decision; the
 *    hands-free auto-submit was reverted on purpose). This hook has no way to send by construction.
 *  · `stopEcho()` must run on every COMMITTED send, or a late transcription re-fills the emptied box.
 *  · Guests never record: `onAuthRequired` is called instead (the STT route spends provider credits).
 *
 * ⚠️ THE RECORDER NOW SENDS 16 kHz MONO WAV, NOT webm/mp4. MediaRecorder produces webm (Chrome) or mp4
 * (Safari), and Gemini's documented audio formats are WAV, MP3, AIFF, AAC, OGG and FLAC — the transcribe
 * route's own comment says its Gemini leg "REJECTS the webm/mp4 the browser mic actually records". The
 * recorder path therefore captures PCM through the existing AudioWorklet
 * (`public/worklets/pcm-capture-processor.js`, unchanged) and wraps it in a WAV header, which every leg of
 * the route accepts. MediaRecorder stays as the fallback for a browser with no AudioWorklet (or an
 * AudioContext that will not start), so the mic always does something.
 *
 * ⚠️ WAV IS ~8× BIGGER THAN OPUS, AND VERCEL CAPS A REQUEST AT ~4.5 MB. 16 kHz × 16 bit = 32 kB/s, so a
 * clip is capped at `MAX_RECORD_SEC` (120 s ≈ 3.8 MB) and stops itself there. Every pass re-sends the whole
 * clip so far (the interim cadence keeps that O(n log n), and interim passes stop after ~1 minute).
 *
 * ⚠️ stopEcho() DID NOT STOP CHROME'S RECOGNIZER. OmniStudio's version stopped the recognizer without marking
 * the stop as intentional, and Chrome's `onend` then took it for its own silence timeout and restarted it (up
 * to 8 times) — the mic stayed live after Send, discarding what it heard. Here `stopEcho` marks the stop
 * intentional and `onend` also refuses to restart a discarded dictation.
 *
 * ⚠️ A NON-OK RESPONSE USED TO COUNT AS SUCCESS. The old recorder parsed any response and reset its failure
 * streak, so a 429 from the shared READ bucket (`{error}`, no `text`) looked like "heard nothing" and the
 * warning never showed. `!res.ok` is a failure now, and 401 means "sign in" (`onAuthRequired`), not a retry.
 *
 * `setValue` must accept an updater (a React `setState`): the recorder's late passes read the LIVE value and
 * keep a keyboard edit instead of clobbering it.
 *
 * ⚠️ THE MIC IS SHARED WITH LIVE VOICE. Opening Live while this held the device (Android's recognizer holds it
 * exclusively; the recorder's tracks used to stop only AFTER `finish()` resolved, up to 1.5 s for MediaRecorder)
 * made Live's getUserMedia fail with NotReadableError. The hook now listens on lib/voice/micBus: a release request
 * stops the recognizer and the recorder's tracks SYNCHRONOUSLY, keeping what was already dictated (the final pass
 * still runs on the audio captured so far).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { audioExtFor } from '@/lib/voice/audioExt';
import { shouldRunInterim } from '@/lib/voice/interimCadence';
import { useMicRelease } from '@/lib/voice/micBus';

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
  start(): void;
  stop(): void;
}
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// ─── Capture ─────────────────────────────────────────────────────────────────────────────────────────────

export type DictationEngine = 'webspeech' | 'wav' | 'mediarecorder';
export type SpeechLang = 'ka-GE' | 'en-US' | 'ru-RU';

/** One recording. `snapshot()` is the whole clip so far as a decodable file; `finish()` stops and returns it. */
export interface CaptureSession {
  readonly engine: 'wav' | 'mediarecorder';
  readonly mimeType: string;
  /** Below this a clip is too short to be worth a round-trip. */
  readonly minBytes: number;
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
  /** Tried in order; the first that resolves wins. Default: AudioWorklet WAV, then MediaRecorder. */
  captureFactories: CaptureFactory[];
  fetch: typeof fetch;
  now(): number;
  /** Used when `authed` is not passed: `<html data-authed="0">` (published by ChatChrome) means a guest. */
  isGuest(): boolean;
}

export interface UseDictationOptions {
  locale?: string;
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
  recording: boolean;
  /** The recorder's final pass is in flight after Stop. */
  transcribing: boolean;
  engine: DictationEngine | null;
  /** Localized warning (transcription not responding, mic blocked), or null. */
  warn: string | null;
  /** 'voice' while the box text came from dictation; send() reads it to tag the turn and auto-play the reply. */
  inputSourceRef: MutableRefObject<'text' | 'voice'>;
  /** Start, or stop (with a final pass) when recording. */
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
/** One interim "chunk" — the tick `lib/voice/interimCadence` counts in (was MediaRecorder's timeslice). */
export const TICK_MS = 1200;
/** See the file header: 120 s of 16 kHz WAV ≈ 3.8 MB, under the ~4.5 MB request ceiling. */
export const MAX_RECORD_SEC = 120;
export const SILENCE_RMS = 0.035;
export const SILENCE_HOLD_MS = 1300;
export const TRANSCRIBE_TIMEOUT_MS = 30_000;
export const WEB_SPEECH_START_WATCHDOG_MS = 8000;
export const WEB_SPEECH_AFTER_SPEECH_WATCHDOG_MS = 2500;
export const WEB_SPEECH_MAX_RESTARTS = 8;

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

export function dictationWarning(kind: 'transcription' | 'mic', locale?: string): string {
  const l = langOf(locale);
  if (kind === 'mic') {
    return l === 'en' ? 'Microphone access is blocked — allow it in your browser settings.'
      : l === 'ru' ? 'Нет доступа к микрофону — разрешите его в настройках браузера.'
        : 'მიკროფონზე წვდომა დაბლოკილია — ნება დართე ბრაუზერის პარამეტრებში.';
  }
  // OmniStudio's exact words.
  return l === 'en' ? 'Transcription is not responding — your words may not be captured.'
    : l === 'ru' ? 'Расшифровка не отвечает — слова могут не записаться.'
      : 'ტრანსკრიფცია არ პასუხობს — სიტყვები შესაძლოა არ ჩაიწეროს.';
}

// ─── Default captures (browser) ──────────────────────────────────────────────────────────────────────────

type ACCtor = typeof AudioContext;
function audioContextCtor(): ACCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACCtor }).webkitAudioContext;
}

/** AudioWorklet → int16 PCM → WAV. Throws when the browser cannot, so the next factory is tried. */
export const createWavCapture: CaptureFactory = async (stream, onLevel) => {
  const AC = audioContextCtor();
  if (!AC || typeof AudioWorkletNode === 'undefined') throw new Error('AudioWorklet unavailable');
  let ctx: AudioContext;
  try { ctx = new AC({ sampleRate: WAV_SAMPLE_RATE }); } catch { ctx = new AC(); }
  let source: MediaStreamAudioSourceNode;
  try {
    source = ctx.createMediaStreamSource(stream);
  } catch {
    // ⚠️ Firefox refuses to connect a mic to a context whose rate differs from the device's. Capture at the
    // native rate instead and downsample in `snapshot()`.
    await ctx.close().catch(() => undefined);
    ctx = new AC();
    source = ctx.createMediaStreamSource(stream);
  }
  let node: AudioWorkletNode;
  let sink: GainNode;
  try {
    if (!ctx.audioWorklet) throw new Error('AudioWorklet unavailable');
    await ctx.audioWorklet.addModule(PCM_WORKLET_URL);
    // UNCERTAIN (not device-tested): whether iOS lets a context made after the getUserMedia await run without
    // a fresh gesture. A context that will not start throws here, and MediaRecorder takes over.
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    if (ctx.state !== 'running') throw new Error(`AudioContext ${ctx.state}`);
    node = new AudioWorkletNode(ctx, PCM_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit', // a stereo mic is mixed down; the processor reads channel 0 only
      processorOptions: { frameSize: Math.max(128, Math.round(ctx.sampleRate / 10)) }, // ~100 ms frames
    });
    sink = ctx.createGain();
    sink.gain.value = 0; // pulled by the graph so process() runs, but silent
  } catch (err) {
    await ctx.close().catch(() => undefined);
    throw err;
  }
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
    seconds: () => samples / rate,
    snapshot: encode,
    finish: async () => {
      const blob = encode();
      if (!closed) {
        closed = true;
        node.port.onmessage = null;
        try { source.disconnect(); node.disconnect(); sink.disconnect(); } catch { /* noop */ }
        await ctx.close().catch(() => undefined);
      }
      return blob;
    },
  };
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
  captureFactories: [createWavCapture, createMediaRecorderCapture],
  fetch: (...args) => fetch(...args),
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  isGuest: () => typeof document !== 'undefined' && document.documentElement?.dataset?.authed === '0',
});

// ─── The hook ────────────────────────────────────────────────────────────────────────────────────────────

interface RecorderState {
  lang: SpeechLang;
  base: string;
  stream: MediaStream;
  session: CaptureSession | null;
  timer: ReturnType<typeof setInterval> | null;
  ticks: number;
  lastPass: number;
  inFlight: Promise<void> | null;
  stopped: boolean;
  spoke: boolean;
  quietSince: number;
  failStreak: number;
}

export function useDictation(options: UseDictationOptions): UseDictationResult {
  const [recording, setRecordingState] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
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
  const recordingRef = useRef(false);
  const transcribingRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<RecorderState | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sttDiscardRef = useRef(false);
  const sttBaseRef = useRef('');
  const sttFinalRef = useRef('');
  const lastWriteRef = useRef('');
  const micStopRequestedRef = useRef(false);
  const unsupportedLangsRef = useRef<Set<string>>(new Set());
  // `transcribe` (a 401) needs `stopRecorder`, which is defined after it; the ref breaks the cycle.
  const stopRecorderRef = useRef<((finalPass: boolean) => Promise<void>) | null>(null);

  const setRec = useCallback((v: boolean) => { recordingRef.current = v; setRecordingState(v); }, []);
  const setTrans = useCallback((v: boolean) => { transcribingRef.current = v; setTranscribing(v); }, []);

  const transcribe = useCallback(async (r: RecorderState, blob: Blob | null): Promise<void> => {
    if (sttDiscardRef.current || !blob || blob.size < (r.session?.minBytes ?? 1600)) return;
    const d = depsRef.current;
    const o = optsRef.current;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), TRANSCRIBE_TIMEOUT_MS);
    try {
      const fd = new FormData();
      // The extension must match the bytes — Whisper-class legs dispatch on it (lib/voice/audioExt).
      fd.append('audio', blob, `clip.${audioExtFor(blob.type || r.session?.mimeType)}`);
      fd.append('language', r.lang);
      const res = await d.fetch(o.transcribeUrl ?? '/api/voice/transcribe', { method: 'POST', body: fd, credentials: 'same-origin', signal: ctrl.signal });
      // Re-check AFTER the await: a send() while this was in flight already emptied the box.
      if (sttDiscardRef.current) return;
      if (res.status === 401) {
        r.failStreak = 0;
        try { o.onAuthRequired?.(); } catch { /* noop */ }
        void stopRecorderRef.current?.(false);
        return;
      }
      if (!res.ok) throw new Error(`transcribe HTTP ${res.status}`);
      const j = (await res.json().catch(() => ({}))) as { text?: unknown };
      if (sttDiscardRef.current) return;
      const t = typeof j.text === 'string' ? j.text.trim() : '';
      if (t) {
        const next = r.base + t;
        // Read the LIVE box: if the user typed since our last write, keep their edit and do not re-tag it as
        // voice (a late final pass would otherwise clobber it and wrongly auto-play the reply).
        o.setValue((cur) => {
          if (cur !== '' && cur !== lastWriteRef.current) return cur;
          lastWriteRef.current = next;
          inputSourceRef.current = 'voice';
          return next;
        });
      }
      r.failStreak = 0;
      setWarn(null);
    } catch {
      if (sttDiscardRef.current) return;
      // Shown only after the SECOND consecutive failure, so one flaky pass stays invisible.
      r.failStreak += 1;
      if (r.failStreak >= 2) setWarn(dictationWarning('transcription', o.locale));
    } finally {
      clearTimeout(timer);
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, []);

  const stopRecorder = useCallback(async (finalPass: boolean): Promise<void> => {
    const r = recorderRef.current;
    if (!r || r.stopped) return;
    r.stopped = true;
    recorderRef.current = null;
    if (r.timer) { clearInterval(r.timer); r.timer = null; }
    streamRef.current = null;
    setRec(false);
    setEngine(null);
    const wantFinal = finalPass && !sttDiscardRef.current && !!r.session;
    if (wantFinal) setTrans(true);
    try {
      // finish() FIRST (it snapshots the WAV / asks MediaRecorder for its last chunk synchronously), THEN release
      // the device, THEN wait. ⚠️ The tracks used to stop only after `await finish()` — up to 1.5 s of a hot mic
      // that Live voice, opened right after, could not get.
      const finishing = r.session ? r.session.finish().catch(() => null) : Promise.resolve(null);
      stopStream(r.stream);
      const blob = await finishing;
      if (!wantFinal) return;
      // Await the pass already in flight (never a polling loop), then one final pass over the whole clip.
      if (r.inFlight) await r.inFlight.catch(() => undefined);
      await transcribe(r, blob);
    } finally {
      if (wantFinal) setTrans(false);
    }
  }, [setRec, setTrans, transcribe]);
  stopRecorderRef.current = stopRecorder;

  const startRecorder = useCallback(async (lang: SpeechLang): Promise<void> => {
    const d = depsRef.current;
    sttDiscardRef.current = false; // a fresh dictation accepts transcription again
    // Reentrancy guard: a double tap must not open two mics (the loser stream would stay HOT).
    if (streamRef.current || recorderRef.current) return;
    let stream: MediaStream;
    try {
      stream = await d.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      setRec(false);
      setEngine(null);
      const name = (err as { name?: string } | null)?.name ?? '';
      if (/NotAllowed|Security|NotFound|NotReadable|NotSupported/.test(name)) setWarn(dictationWarning('mic', optsRef.current.locale));
      return;
    }
    // Stopped (or a second start won) while the permission prompt was up: release this stream, record nothing.
    if (streamRef.current || recorderRef.current || micStopRequestedRef.current) {
      stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
      if (!recorderRef.current) { setRec(false); setEngine(null); }
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
      lang, base, stream, session: null, timer: null, ticks: 0, lastPass: 0, inFlight: null,
      stopped: false, spoke: false, quietSince: 0, failStreak: 0,
    };
    recorderRef.current = r;
    // Hands-free stop: once the user has spoken and then stays quiet for SILENCE_HOLD_MS, stop (no auto-send).
    const onLevel = (rms: number) => {
      if (r.stopped) return;
      const now = depsRef.current.now();
      if (rms > SILENCE_RMS) { r.spoke = true; r.quietSince = 0; return; }
      if (!r.spoke) return;
      if (!r.quietSince) { r.quietSince = now; return; }
      if (now - r.quietSince > SILENCE_HOLD_MS) void stopRecorder(true);
    };
    let session: CaptureSession | null = null;
    for (const make of d.captureFactories) {
      try { session = await make(stream, onLevel); break; } catch { /* try the next capture */ }
    }
    if (r.stopped) { // stopped while the capture was being built
      await session?.finish().catch(() => null);
      stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
      return;
    }
    if (!session) {
      stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
      streamRef.current = null;
      recorderRef.current = null;
      setRec(false);
      setEngine(null);
      setWarn(dictationWarning('mic', optsRef.current.locale));
      return;
    }
    r.session = session;
    r.timer = setInterval(() => {
      if (r.stopped || !r.session) return;
      r.ticks += 1;
      if (r.session.seconds() >= MAX_RECORD_SEC) { void stopRecorder(true); return; }
      // Interim passes back off as the clip grows (lib/voice/interimCadence); each re-sends the whole clip.
      if (!shouldRunInterim(r.ticks, r.lastPass)) return;
      r.lastPass = r.ticks;
      if (r.inFlight || sttDiscardRef.current) return;
      const p = transcribe(r, r.session.snapshot());
      r.inFlight = p;
      void p.finally(() => { if (r.inFlight === p) r.inFlight = null; });
    }, TICK_MS);
    setRec(true);
    setEngine(session.engine);
  }, [setRec, stopRecorder, transcribe]);

  const stop = useCallback(() => {
    // Mark the stop INTENTIONAL first, so the recognizer's onend does not take it for Chrome's own timeout.
    micStopRequestedRef.current = true;
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    void stopRecorder(true);
  }, [stopRecorder]);

  const toggle = useCallback(async (): Promise<void> => {
    if (recordingRef.current) { stop(); return; }
    // The final pass is still writing into the box; a new dictation now would race it.
    if (transcribingRef.current) return;
    const o = optsRef.current;
    const d = depsRef.current;
    const guest = o.authed === false || (o.authed === undefined && d.isGuest());
    if (guest) {
      try { o.onAuthRequired?.(); } catch { /* noop */ }
      return;
    }
    micStopRequestedRef.current = false;
    setWarn(null);
    // Instant capture UI: flip to "recording" on the tap, before the recognizer / getUserMedia spins up.
    // Every failure path below reverts it.
    setRec(true);
    const lang = speechLangFor(o.locale);
    const SR = d.speechRecognition();
    if (SR && !(isAppleSpeechEngine(d.userAgent()) && lang.startsWith('ka')) && !unsupportedLangsRef.current.has(lang)) {
      try {
        const rec = new SR();
        rec.lang = lang;
        rec.continuous = true;
        rec.interimResults = true;
        sttDiscardRef.current = false;
        sttBaseRef.current = valueRef.current ? `${valueRef.current.trimEnd()} ` : '';
        sttFinalRef.current = '';
        let fellBack = false;
        let gotResult = false;
        let restarts = 0;
        const toRecorder = () => {
          if (fellBack) return;
          fellBack = true;
          try { rec.stop(); } catch { /* noop */ }
          if (recognitionRef.current === rec) recognitionRef.current = null;
          void startRecorder(lang);
        };
        // Until the engine reports speech, wait long (a user pausing to think is not a dead engine); once it
        // has heard speech and still produces nothing, the engine is at fault and 2.5 s is plenty.
        let watchdog = setTimeout(() => { if (!gotResult) toRecorder(); }, WEB_SPEECH_START_WATCHDOG_MS);
        rec.onspeechstart = () => {
          if (gotResult || fellBack) return;
          clearTimeout(watchdog);
          watchdog = setTimeout(() => { if (!gotResult) toRecorder(); }, WEB_SPEECH_AFTER_SPEECH_WATCHDOG_MS);
        };
        rec.onresult = (e: SREvent) => {
          if (sttDiscardRef.current) return; // a send() discarded this dictation
          gotResult = true;
          clearTimeout(watchdog);
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (!res) continue;
            const txt = res[0]?.transcript ?? '';
            if (res.isFinal) sttFinalRef.current += txt;
            else interim += txt;
          }
          inputSourceRef.current = 'voice';
          optsRef.current.setValue((sttBaseRef.current + sttFinalRef.current + interim).replace(/\s+/g, ' ').trimStart());
        };
        // Chrome ends recognition by itself after silence even with continuous = true: restart it unless the
        // user (or a send) stopped it. A BUDGET, not a flag — an engine that ends at once would otherwise spin.
        rec.onend = () => {
          clearTimeout(watchdog);
          if (fellBack) return;
          if (!micStopRequestedRef.current && !sttDiscardRef.current && restarts < WEB_SPEECH_MAX_RESTARTS) {
            restarts += 1;
            try { rec.start(); return; } catch { /* fall through to ending cleanly */ }
          }
          if (recognitionRef.current === rec) recognitionRef.current = null;
          setRec(false);
          setEngine(null);
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
          if (!gotResult && !micStopRequestedRef.current && !sttDiscardRef.current) toRecorder();
          else {
            if (recognitionRef.current === rec) recognitionRef.current = null;
            setRec(false);
            setEngine(null);
          }
        };
        recognitionRef.current = rec;
        rec.start();
        setEngine('webspeech');
        return;
      } catch {
        recognitionRef.current = null; // fall through to the recorder
      }
    }
    await startRecorder(lang);
  }, [setRec, startRecorder, stop]);

  const stopEcho = useCallback(() => {
    sttDiscardRef.current = true;
    micStopRequestedRef.current = true;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    try { rec?.stop(); } catch { /* noop */ }
    void stopRecorder(false);
    try { abortRef.current?.abort(); } catch { /* noop */ }
    abortRef.current = null;
    sttBaseRef.current = '';
    sttFinalRef.current = '';
    setRec(false);
    setEngine(null);
    try { optsRef.current.textareaRef?.current?.blur(); } catch { /* noop */ }
  }, [setRec, stopRecorder]);

  // Another feature (Live voice) needs the microphone NOW. Like stop(), but the device is released before this
  // returns: the recognizer is told to stop (its final result still lands in the box) and the recorder's tracks
  // stop synchronously; the recorder's final pass then transcribes what was captured. Nothing dictated is lost.
  const releaseMic = useCallback(() => {
    const stream = streamRef.current;
    if (!recordingRef.current && !stream && !recognitionRef.current) return;
    micStopRequestedRef.current = true; // also makes a getUserMedia still in flight drop its stream
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    stopStream(stream);
    void stopRecorder(true);
  }, [stopRecorder]);
  useMicRelease(releaseMic, 'dictation');

  const markTyped = useCallback(() => { inputSourceRef.current = 'text'; }, []);
  const clearWarn = useCallback(() => setWarn(null), []);

  // Unmount: nothing may keep the mic open or write into a composer that is gone.
  useEffect(() => () => {
    sttDiscardRef.current = true;
    micStopRequestedRef.current = true;
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    recognitionRef.current = null;
    void stopRecorderRef.current?.(false);
    try { abortRef.current?.abort(); } catch { /* noop */ }
  }, []);

  return { recording, transcribing, engine, warn, inputSourceRef, toggle, stop, stopEcho, markTyped, clearWarn };
}
