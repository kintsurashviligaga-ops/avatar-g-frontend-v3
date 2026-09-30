'use client';

/**
 * components/voice/live/useGeminiLiveSession.ts — the browser half of a Gemini Live voice call, as one hook.
 *
 * Flow: POST /api/voice/live (ephemeral token, and optionally a server-built setup) → GeminiLiveSession opens the
 * WebSocket straight to Google → the mic streams 16 kHz PCM up through an AudioWorklet → 24 kHz PCM comes back and
 * plays gaplessly through a gain node → input/output transcripts become captions and, at each turn boundary, a
 * { role, text } turn handed to `onTurn` so the host can write the call into the chat thread.
 *
 * Wire protocol: lib/voice/geminiLive.ts (buildLiveSetup / parseLiveServerMessage / GeminiLiveSession). This file
 * owns the MEDIA and the CALL LIFECYCLE; it never builds a wire frame by hand.
 *
 * ⚠️ LESSONS THIS HOOK CARRIES (each one was a real failure mode of the old component):
 *  • Audio spoken while the token was minting or the handshake was running was DROPPED — the first words of every
 *    call vanished. Mic audio is now held (bounded) until setupComplete and flushed in order right after.
 *  • A handshake that never answered left the screen on "connecting…" forever. setupComplete now has a deadline
 *    (8 s) and one retry; the retry falls back to the LEGACY wire (no transcription / resumption / compression /
 *    tools) because those parity fields are not yet verified on the v1alpha constrained endpoint. Voice first,
 *    captions second.
 *  • Google resets the connection (~10 min, goAway first) and ends audio sessions without compression at 15 min.
 *    The session now asks for resumption handles + sliding-window compression, and a goAway / dropped socket
 *    resumes with the latest handle instead of ending the call.
 *  • Barge-in waited for the SERVER's VAD + a network round-trip. Local energy barge-in (lib/voice/vad.ts, the same
 *    reducer VoiceConversation uses) now stops playback on the spot, and the rest of the interrupted answer is
 *    dropped until the server closes that turn — otherwise the queued tail of the answer talks over the user.
 *  • getUserMedia + AudioContext are async: an End tap during the permission prompt must still release the mic.
 *    Every await re-checks a generation counter and releases what it acquired (media-capture reentrancy), and a
 *    second start() while a call is live is a no-op.
 *  • AudioContexts are created synchronously in start() — inside the gesture that opened the call. A context
 *    created after the mint's await can come up 'suspended' (autoplay policy), and a suspended graph captures
 *    nothing: the call would connect and hear silence.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import { DEFAULT_AGENT_PROFILE_ID, LIVE_SPOKEN_RULE, resolveAgentProfile, toGeminiLiveSetup } from '@/lib/agents/profile';
import { buildPlatformPrompt } from '@/lib/chat/platformPrompt';
import {
  GeminiLiveSession,
  buildLiveSetup,
  type LiveFunctionResponse,
  type LiveServerEvent,
  type LiveTool,
} from '@/lib/voice/geminiLive';
import { bytesToBase64, decodePlaybackChunk, floatTo16BitPCM } from '@/lib/voice/pcm';
import { DEFAULT_VAD_CONFIG, bargeConfig, createVadState, stepVad, type VadState } from '@/lib/voice/vad';
import { liveVoicePersona } from '@/lib/voice/voicePrompt';

// ─── Constants ────────────────────────────────────────────────────────────────

/** setupComplete deadline per handshake. A hung handshake then retries once instead of spinning forever. */
export const LIVE_SETUP_TIMEOUT_MS = 8000;
/** Window event the default transcript sink dispatches (detail: LiveTurn) when the host passes no onTurn. */
export const LIVE_TRANSCRIPT_EVENT = 'myavatar:live-transcript';

const CAPTURE_RATE = 16000;
/** One worklet frame = 40 ms: small enough for a snappy barge-in, large enough not to flood the socket. */
const CHUNK_MS = 40;
/** Mic audio held while connecting / resuming. Older audio is discarded first. */
const PRE_SETUP_MAX_SAMPLES = CAPTURE_RATE * 6;
/** Held audio is flushed in frames of at most 0.5 s. */
const FLUSH_FRAME_SAMPLES = CAPTURE_RATE / 2;
const DEFAULT_PLAYBACK_RATE = 24000;
/** Jitter buffer before the FIRST chunk of an answer, so a slightly late second chunk does not click. */
const PLAYBACK_LEAD_S = 0.05;
/** No barge-in for this long after playback starts (masks the source's attack transient / echo onset). */
const BARGE_GRACE_MS = 300;
/** 'thinking' falls back to 'listening' if no answer starts (the server heard noise, not a turn). */
const THINKING_TIMEOUT_MS = 10_000;
/** Reuse the minted token for a resume only while it has at least this long left. */
const TOKEN_REUSE_MARGIN_MS = 60_000;
/** A call longer than this many resumes is almost certainly a loop, not a conversation. */
const MAX_RESUMES = 40;
const MAX_FINAL_CAPTIONS = 40;
const WORKLET_URL = '/worklets/pcm-capture-processor.js';
const WORKLET_NAME = 'pcm-capture-processor';
const BARGE_CFG = bargeConfig(DEFAULT_VAD_CONFIG);

const LANGUAGE_CODES: Record<'ka' | 'en' | 'ru', string> = { ka: 'ka-GE', en: 'en-US', ru: 'ru-RU' };

// ─── Types ────────────────────────────────────────────────────────────────────

export type LiveStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'reconnecting' | 'error' | 'closed';

export type LiveErrorCode =
  | 'mic_denied'
  | 'mic_unavailable'
  | 'auth'
  | 'rate_limited'
  | 'unavailable'
  | 'mint_failed'
  | 'setup_failed'
  | 'connection_lost'
  | 'unsupported';

export interface LiveCaption {
  /** Stable across pending → final, so a caption never remounts when its turn closes. */
  id: string;
  role: 'user' | 'assistant';
  text: string;
  final: boolean;
  interrupted?: boolean;
}

export interface LiveTurn {
  role: 'user' | 'assistant';
  text: string;
  /** The answer was cut off by the user (barge-in) or by the call ending — `text` is what was actually said. */
  interrupted?: boolean;
}

export interface LiveUsage { totalTokens?: number }
export interface LiveLevels { input: number; output: number }

/** Injection points (tests; exotic hosts). Anything left out uses the browser API. */
export interface LiveSessionDeps {
  fetch: typeof fetch;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createAudioContext: (opts?: AudioContextOptions) => AudioContext;
  createWorkletNode: (ctx: BaseAudioContext, name: string, opts: AudioWorkletNodeOptions) => AudioWorkletNode;
  /** Monotonic ms clock for the VAD (performance.now()). */
  now: () => number;
}

export interface UseGeminiLiveSessionOptions {
  locale?: 'ka' | 'en' | 'ru';
  /** Prebuilt voice (Aoede / Charon verified in Georgian). Read at connect time. */
  voiceName?: string;
  /** Used when the mint returns no server-built setup. Defaults to the locale's live persona. */
  systemInstruction?: string;
  /** Omitted → the model's default (today's behaviour). */
  temperature?: number;
  tools?: LiveTool[];
  /**
   * Transcription + resumption + compression + tools (default true). Set false to run the verified legacy wire only.
   * Even when true, a failed first handshake retries on the legacy wire (see the header).
   */
  parity?: boolean;
  /** Forwarded to the mint so the server can resolve the profile itself. */
  personaId?: string | null;
  customPersona?: unknown;
  endpoint?: string;
  setupTimeoutMs?: number;
  /** Transcript sink: called once per closed turn, user first. */
  onTurn?: (turn: LiveTurn) => void;
  onUsage?: (usage: LiveUsage) => void;
  /** The mint answered 503 (Live disabled server-side / key missing): the host falls back to another voice tier. */
  onUnavailable?: () => void;
  /** Answer function calls. Unanswered calls get `{error:'not_supported'}` so the model never waits forever. */
  onToolCall?: (calls: Array<{ id: string; name: string; args: unknown }>) => Promise<LiveFunctionResponse[] | void> | LiveFunctionResponse[] | void;
  deps?: Partial<LiveSessionDeps>;
}

export interface UseGeminiLiveSessionResult {
  status: LiveStatus;
  error: LiveErrorCode | null;
  captions: LiveCaption[];
  muted: boolean;
  /** Running on the legacy wire after a failed parity handshake: no captions, no resumption. */
  degraded: boolean;
  start: () => Promise<void>;
  /** End the call: pending transcript is flushed to onTurn, everything is released, status → 'closed'. */
  stop: () => void;
  /** From 'error' / 'closed': release and start a fresh call. */
  retry: () => void;
  /** Local barge-in: stop playback now and drop the rest of the answer. */
  interrupt: () => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  sendVideoFrame: (frameBase64: string, mimeType?: string) => void;
  sendText: (text: string) => void;
  /** 0..1 levels for visuals; cheap enough to call every animation frame. */
  getLevels: () => LiveLevels;
}

// ─── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * A STATEFUL mono int16 downsampler: windowed-sinc low-pass (63-tap Hamming, cutoff 0.4375 × outRate) followed by
 * fractional linear interpolation, with filter history and phase carried across chunks.
 *
 * ⚠️ Only the fallback path uses this. lib/voice/pcm.ts `resample` interpolates each chunk on its own with no
 * anti-alias filter: everything between 8 kHz and the mic's Nyquist folds back into the speech band, and every
 * chunk boundary restarts the phase. The primary path avoids JS resampling entirely (a 16 kHz AudioContext, where
 * the browser's resampler does it); this is for engines that refuse that context (Firefox cannot connect a mic to
 * a context at a different rate).
 */
export function createPcmDownsampler(inRate: number, outRate = CAPTURE_RATE): (input: Int16Array) => Int16Array {
  if (!(inRate > 0) || !(outRate > 0) || inRate <= outRate) return (input) => input;
  const TAPS = 63;
  const M = (TAPS - 1) / 2;
  const fc = (0.4375 * outRate) / inRate; // cycles per input sample
  const taps = new Float32Array(TAPS);
  let sum = 0;
  for (let n = 0; n < TAPS; n++) {
    const x = n - M;
    const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (TAPS - 1));
    taps[n] = sinc * w;
    sum += sinc * w;
  }
  for (let n = 0; n < TAPS; n++) taps[n] = (taps[n] ?? 0) / sum;

  const ratio = inRate / outRate;
  let hist = new Float32Array(TAPS - 1);
  let prevFiltered = 0;
  let pos = 0; // next output position, in filtered-sample index space of the current chunk (≥ -1)

  return (input: Int16Array): Int16Array => {
    const n = input.length;
    if (n === 0) return new Int16Array(0);
    const ext = new Float32Array(hist.length + n);
    ext.set(hist);
    for (let i = 0; i < n; i++) ext[hist.length + i] = (input[i] ?? 0) / 0x8000;
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let k = 0; k < TAPS; k++) acc += (taps[k] ?? 0) * (ext[i + k] ?? 0);
      y[i] = acc;
    }
    const out: number[] = [];
    while (pos < n - 1) {
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      const a = i0 < 0 ? prevFiltered : (y[i0] ?? 0);
      const b = y[i0 + 1] ?? 0;
      out.push(a + (b - a) * frac);
      pos += ratio;
    }
    pos -= n;
    prevFiltered = y[n - 1] ?? 0;
    hist = ext.slice(n);
    return floatTo16BitPCM(Float32Array.from(out));
  };
}

/** 'audio/pcm;rate=24000' → 24000; anything missing or implausible → 24 kHz (the documented Live output rate). */
export function playbackRateFromMime(mimeType: string | undefined): number {
  const m = /rate=(\d{4,6})/i.exec(mimeType || '');
  const rate = m ? Number(m[1]) : NaN;
  return Number.isFinite(rate) && rate >= 8000 && rate <= 48000 ? rate : DEFAULT_PLAYBACK_RATE;
}

/** Collapse whitespace; transcript fragments arrive with their own spacing and sometimes doubled. */
export function normalizeCaption(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Spoken-call rule appended to every Live instruction. The platform prompt is written for chat and pins the reply
 * language to the UI locale — but a call must follow the language actually being SPOKEN (the reported "spoke
 * Russian, answered in Georgian" leak that lib/voice/voicePrompt.ts detectSpokenLocale fixed for the REST voice).
 */
export const LIVE_LANGUAGE_RULE =
  'LIVE CALL LANGUAGE: answer in the language the user is speaking right now (Georgian, English or Russian), '
  + 'even when it differs from the LANGUAGE line above.';

/**
 * The client-built Live instruction, used when the mint returns no server-locked setup: the profile's live persona,
 * the Google-only platform prompt (engines, prices in credits/GEL, today's date in Tbilisi), the persona block, and
 * the spoken-call rules. `personaOverride` replaces the live persona (GeminiLiveConversation's legacy
 * `systemInstruction` prop). Temperature is only sent for an ACTIVE persona — the default call keeps the model's
 * default, exactly as today.
 */
export function buildLiveInstruction(opts: {
  locale: 'ka' | 'en' | 'ru';
  personaId?: string | null;
  customPersona?: unknown;
  personaOverride?: string;
  now?: Date;
}): { systemInstruction: string; voiceName: string; temperature?: number; googleSearch: boolean; personaActive: boolean } {
  const locale = opts.locale === 'en' || opts.locale === 'ru' ? opts.locale : 'ka';
  const profile = resolveAgentProfile({ personaId: opts.personaId ?? null, customPersona: opts.customPersona });
  const platformSystem = buildPlatformPrompt({ locale, ...(opts.now ? { now: opts.now } : {}) });
  const live = toGeminiLiveSetup(profile, { locale, platformSystem });
  const override = typeof opts.personaOverride === 'string' ? opts.personaOverride.trim() : '';
  let text = override ? `${override}\n\n${platformSystem}` : live.systemInstruction;
  if (!text.includes(LIVE_SPOKEN_RULE)) text = `${text}\n\n${LIVE_SPOKEN_RULE}`;
  text = `${text}\n${LIVE_LANGUAGE_RULE}`;
  const personaActive = profile.id !== DEFAULT_AGENT_PROFILE_ID;
  return {
    systemInstruction: text,
    voiceName: live.voiceName,
    ...(personaActive ? { temperature: live.temperature } : {}),
    googleSearch: profile.googleSearch,
    personaActive,
  };
}

/** Default transcript sink: a window event any host (OmniStudio) can subscribe to without new props. */
export function dispatchLiveTranscript(turn: LiveTurn): void {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  try { window.dispatchEvent(new CustomEvent<LiveTurn>(LIVE_TRANSCRIPT_EVENT, { detail: turn })); } catch { /* noop */ }
}

// ─── Internals ────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Fields the legacy (verified) wire never sent; stripped from a server setup for the degraded retry. */
const PARITY_FIELDS = ['inputAudioTranscription', 'outputAudioTranscription', 'sessionResumption', 'contextWindowCompression', 'tools'] as const;

/** A server-built setup, as `{setup:{…}}` or bare `{model, …}`. Anything without a model is ignored. */
function extractServerSetup(raw: unknown): Obj | null {
  if (!isObj(raw)) return null;
  const inner = isObj(raw.setup) ? raw.setup : raw;
  return typeof inner.model === 'string' && inner.model ? { ...inner } : null;
}

function stopTracks(stream: MediaStream | null | undefined): void {
  try { stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } }); } catch { /* noop */ }
}

function micErrorCode(e: unknown): LiveErrorCode {
  const name = isObj(e) && typeof e.name === 'string' ? e.name : '';
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError' ? 'mic_denied' : 'mic_unavailable';
}

function toBase64(pcm: Int16Array): string {
  return bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

function rmsOf(f: Float32Array): number {
  let s = 0;
  for (let i = 0; i < f.length; i++) { const v = f[i] ?? 0; s += v * v; }
  return f.length ? Math.sqrt(s / f.length) : 0;
}

function defaultDeps(): LiveSessionDeps {
  return {
    fetch: (input, init) => fetch(input, init),
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
    createAudioContext: (opts) => {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      return opts ? new AC(opts) : new AC();
    },
    createWorkletNode: (ctx, name, opts) => new AudioWorkletNode(ctx, name, opts),
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  };
}

/** One step of a connect plan: which token, which resumption handle, and whether to fall back to the legacy wire. */
interface PlanStep { freshToken: boolean; handle: string | null | undefined; degrade?: boolean }
type MintResult = { ok: true } | { ok: false; code: LiveErrorCode };

// ─── The hook ─────────────────────────────────────────────────────────────────

export function useGeminiLiveSession(options: UseGeminiLiveSessionOptions = {}): UseGeminiLiveSessionResult {
  const optsRef = useRef(options);
  optsRef.current = options;
  const deps = useCallback((): LiveSessionDeps => ({ ...defaultDeps(), ...(optsRef.current.deps ?? {}) }), []);

  const [status, setStatus] = useState<LiveStatus>('idle');
  const [error, setError] = useState<LiveErrorCode | null>(null);
  const [captions, setCaptions] = useState<LiveCaption[]>([]);
  const [muted, setMutedState] = useState(false);
  const [degraded, setDegraded] = useState(false);

  // Lifecycle
  const genRef = useRef(0); // bumped by every teardown: an async continuation from an older call bails out
  const activeRef = useRef(false); // a call is running (reentrancy guard)
  const statusRef = useRef<LiveStatus>('idle');
  // Audio graph
  const playCtxRef = useRef<AudioContext | null>(null);
  const capCtxRef = useRef<AudioContext | null>(null); // the 16 kHz capture context (null → capture shares playCtx)
  const gainRef = useRef<GainNode | null>(null);
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const outBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const downsampleRef = useRef<((input: Int16Array) => Int16Array) | null>(null);
  // Playback
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const playCursorRef = useRef(0);
  const dropModelAudioRef = useRef(false); // after a local barge-in, until the server closes that turn
  const modelTurnOpenRef = useRef(false); // the model is mid-answer (audio/transcript seen, no turnComplete yet)
  // Session
  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const readyRef = useRef(false);
  const tokenRef = useRef<{ token: string; expiresAtMs: number | null } | null>(null);
  const modelRef = useRef<string | null>(null);
  const serverSetupRef = useRef<Obj | null>(null);
  const handleRef = useRef<string | null>(null);
  const degradedRef = useRef(false);
  const planRef = useRef<PlanStep[]>([]);
  const stepRef = useRef(0);
  const phaseRef = useRef<'initial' | 'resume'>('initial');
  const reconnectingRef = useRef(false);
  const resumesRef = useRef(0);
  const goAwayPendingRef = useRef(false);
  const pendingMicRef = useRef<Int16Array[]>([]);
  const pendingSamplesRef = useRef(0);
  // VAD / levels
  const vadRef = useRef<VadState>(createVadState());
  const graceUntilRef = useRef(0);
  const inputLevelRef = useRef(0);
  const mutedRef = useRef(false);
  // Transcript
  const pendingUserRef = useRef('');
  const pendingModelRef = useRef('');
  const finalCaptionsRef = useRef<LiveCaption[]>([]);
  const turnSeqRef = useRef(0);
  // Timers
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goAwayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handshakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStatusSafe = useCallback((s: LiveStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const clearThinkingTimer = useCallback(() => {
    if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
  }, []);
  const clearHandshakeTimer = useCallback(() => {
    if (handshakeTimerRef.current) { clearTimeout(handshakeTimerRef.current); handshakeTimerRef.current = null; }
  }, []);
  const clearGoAwayTimer = useCallback(() => {
    if (goAwayTimerRef.current) { clearTimeout(goAwayTimerRef.current); goAwayTimerRef.current = null; }
    goAwayPendingRef.current = false;
  }, []);

  // ── Captions + transcript sink ──
  const publishCaptions = useCallback(() => {
    const list = finalCaptionsRef.current.slice(-MAX_FINAL_CAPTIONS);
    const seq = turnSeqRef.current;
    const u = normalizeCaption(pendingUserRef.current);
    const m = normalizeCaption(pendingModelRef.current);
    if (u) list.push({ id: `u${seq}`, role: 'user', text: u, final: false });
    if (m) list.push({ id: `a${seq}`, role: 'assistant', text: m, final: false });
    setCaptions(list);
  }, []);

  const emitTurn = useCallback((turn: LiveTurn) => {
    const sink = optsRef.current.onTurn;
    try { if (sink) sink(turn); else dispatchLiveTranscript(turn); } catch { /* a host bug must never kill the call */ }
  }, []);

  /** Close the current exchange: the user's words first, then what the model actually said. */
  const flushTurn = useCallback((interrupted: boolean) => {
    const u = normalizeCaption(pendingUserRef.current);
    const m = normalizeCaption(pendingModelRef.current);
    pendingUserRef.current = '';
    pendingModelRef.current = '';
    if (!u && !m) return;
    const seq = turnSeqRef.current;
    turnSeqRef.current = seq + 1;
    const finals = finalCaptionsRef.current;
    if (u) {
      finals.push({ id: `u${seq}`, role: 'user', text: u, final: true });
      emitTurn({ role: 'user', text: u });
    }
    if (m) {
      finals.push({ id: `a${seq}`, role: 'assistant', text: m, final: true, ...(interrupted ? { interrupted: true } : {}) });
      emitTurn({ role: 'assistant', text: m, ...(interrupted ? { interrupted: true } : {}) });
    }
    if (finals.length > MAX_FINAL_CAPTIONS) finals.splice(0, finals.length - MAX_FINAL_CAPTIONS);
    publishCaptions();
  }, [emitTurn, publishCaptions]);

  // ── Playback ──
  const isPlaying = useCallback(() => activeSourcesRef.current.size > 0, []);

  const flushPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      src.onended = null;
      try { src.stop(); } catch { /* already stopped */ }
      try { src.disconnect(); } catch { /* noop */ }
    }
    activeSourcesRef.current.clear();
    playCursorRef.current = 0;
  }, []);

  const onPlaybackDrained = useCallback(() => {
    if (!activeRef.current) return;
    vadRef.current = createVadState(vadRef.current.floor);
    if (statusRef.current === 'speaking') setStatusSafe(readyRef.current ? 'listening' : 'reconnecting');
  }, [setStatusSafe]);

  const enqueueAudio = useCallback((b64: string, mimeType: string) => {
    const ctx = playCtxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;
    const samples = decodePlaybackChunk(b64);
    if (samples.length === 0) return;
    const buffer = ctx.createBuffer(1, samples.length, playbackRateFromMime(mimeType));
    buffer.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    const wasIdle = activeSourcesRef.current.size === 0;
    const now = ctx.currentTime;
    const startAt = wasIdle || playCursorRef.current < now ? now + PLAYBACK_LEAD_S : playCursorRef.current;
    try { src.start(startAt); } catch { return; }
    playCursorRef.current = startAt + buffer.duration;
    activeSourcesRef.current.add(src);
    src.onended = () => {
      activeSourcesRef.current.delete(src);
      if (activeSourcesRef.current.size === 0) onPlaybackDrained();
    };
    if (wasIdle) {
      graceUntilRef.current = deps().now() + BARGE_GRACE_MS;
      vadRef.current = createVadState(vadRef.current.floor); // fresh state for barge detection
      clearThinkingTimer();
      setStatusSafe('speaking');
    }
  }, [clearThinkingTimer, deps, onPlaybackDrained, setStatusSafe]);

  /** Local barge-in: silence the answer NOW; the server's own `interrupted` (or turnComplete) re-opens audio. */
  const interrupt = useCallback(() => {
    const hadAudio = isPlaying() || modelTurnOpenRef.current;
    flushPlayback();
    if (hadAudio) {
      // Drop the rest of the answer ONLY while the server is still generating it. Audio arrives faster than real
      // time, so after turnComplete the local buffer can still be playing; the server then has nothing to interrupt
      // and sends no `interrupted`, and a drop flag set here would swallow the user's NEXT reply whole.
      dropModelAudioRef.current = modelTurnOpenRef.current;
      flushTurn(true);
    }
    clearThinkingTimer();
    if (activeRef.current && readyRef.current) setStatusSafe('listening');
  }, [clearThinkingTimer, flushPlayback, flushTurn, isPlaying, setStatusSafe]);

  // ── Teardown ──
  const teardown = useCallback(() => {
    genRef.current += 1;
    activeRef.current = false;
    reconnectingRef.current = false;
    clearThinkingTimer();
    clearGoAwayTimer();
    clearHandshakeTimer();
    const session = sessionRef.current;
    sessionRef.current = null;
    readyRef.current = false;
    try { session?.close(); } catch { /* noop */ }
    const node = captureNodeRef.current;
    captureNodeRef.current = null;
    if (node) {
      if ('port' in node) {
        node.port.onmessage = null;
        try { node.port.close(); } catch { /* noop */ }
      } else {
        node.onaudioprocess = null;
      }
      try { node.disconnect(); } catch { /* noop */ }
    }
    try { sourceRef.current?.disconnect(); } catch { /* noop */ }
    sourceRef.current = null;
    stopTracks(micRef.current);
    micRef.current = null;
    flushPlayback();
    try { gainRef.current?.disconnect(); } catch { /* noop */ }
    try { outAnalyserRef.current?.disconnect(); } catch { /* noop */ }
    gainRef.current = null;
    outAnalyserRef.current = null;
    const cap = capCtxRef.current;
    const play = playCtxRef.current;
    capCtxRef.current = null;
    playCtxRef.current = null;
    if (cap && cap !== play) { try { void cap.close().catch(() => {}); } catch { /* noop */ } }
    if (play) { try { void play.close().catch(() => {}); } catch { /* noop */ } }
    downsampleRef.current = null;
    pendingMicRef.current = [];
    pendingSamplesRef.current = 0;
    inputLevelRef.current = 0;
    dropModelAudioRef.current = false;
    modelTurnOpenRef.current = false;
  }, [clearGoAwayTimer, clearHandshakeTimer, clearThinkingTimer, flushPlayback]);

  const fail = useCallback((code: LiveErrorCode) => {
    flushTurn(true); // keep what was said so far in the thread
    teardown();
    setError(code);
    setStatusSafe('error');
  }, [flushTurn, setStatusSafe, teardown]);

  // ── Token mint ──
  // `handle` = the resumption handle this connection will open with (undefined on a fresh call). The token LOCKS the
  // server-built setup, so everything the session must run with — transcription, compression, the handle — has to be
  // in the mint request; a field the browser adds afterwards is not guaranteed to survive the lock.
  const mint = useCallback(async (handle?: string | null): Promise<MintResult> => {
    const o = optsRef.current;
    const parity = o.parity !== false && !degradedRef.current;
    let res: Response;
    try {
      res = await deps().fetch(o.endpoint || '/api/voice/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          locale: o.locale || 'ka',
          voice: o.voiceName,
          personaId: o.personaId ?? null,
          customPersona: o.customPersona ?? null,
          transcribe: parity,
          ...(parity ? { compression: true } : {}),
          ...(parity && handle !== undefined ? { resumptionHandle: handle } : {}),
        }),
      });
    } catch {
      return { ok: false, code: 'mint_failed' };
    }
    const j = (await res.json().catch(() => ({}))) as { token?: unknown; model?: unknown; expiresAt?: unknown; setupMessage?: unknown; setup?: unknown };
    const token = typeof j.token === 'string' ? j.token.trim() : '';
    if (!res.ok || !token) {
      if (res.status === 401) return { ok: false, code: 'auth' };
      if (res.status === 429) return { ok: false, code: 'rate_limited' };
      if (res.status === 503) return { ok: false, code: 'unavailable' };
      return { ok: false, code: 'mint_failed' };
    }
    const exp = typeof j.expiresAt === 'string' ? Date.parse(j.expiresAt) : NaN;
    tokenRef.current = { token, expiresAtMs: Number.isFinite(exp) ? exp : null };
    modelRef.current = typeof j.model === 'string' ? j.model : null;
    // /api/voice/live answers `setupMessage` (the frame it locked into the token); `setup` is accepted for older routes.
    serverSetupRef.current = extractServerSetup(j.setupMessage ?? j.setup);
    return { ok: true };
  }, [deps]);

  const tokenUsable = useCallback(() => {
    const t = tokenRef.current;
    return !!t && (t.expiresAtMs === null || Date.now() < t.expiresAtMs - TOKEN_REUSE_MARGIN_MS);
  }, []);

  // ── Setup frame ──
  const buildSetupMessage = useCallback((handle: string | null | undefined): object => {
    const o = optsRef.current;
    const parity = o.parity !== false && !degradedRef.current;
    const server = serverSetupRef.current;
    if (server) {
      const s: Obj = { ...server };
      if (!parity) for (const f of PARITY_FIELDS) delete s[f];
      else if (handle !== undefined) s.sessionResumption = handle ? { handle } : {};
      return { setup: s };
    }
    const locale = o.locale === 'en' || o.locale === 'ru' ? o.locale : 'ka';
    return buildLiveSetup({
      model: modelRef.current ?? '',
      systemInstruction: o.systemInstruction?.trim() ? o.systemInstruction : liveVoicePersona(locale),
      voiceName: o.voiceName || 'Aoede',
      ...(typeof o.temperature === 'number' ? { temperature: o.temperature } : {}),
      ...(parity
        ? {
          languageCode: LANGUAGE_CODES[locale],
          resumptionHandle: handle ?? null,
          transcribe: true,
          compression: true,
          ...(o.tools?.length ? { tools: o.tools } : {}),
        }
        : {}),
    });
  }, []);

  // Forward declarations so session callbacks and the plan runner can reference each other.
  const runStepRef = useRef<() => Promise<void>>(async () => {});
  const reconnectRef = useRef<(reason: 'goAway' | 'drop') => void>(() => {});

  const flushPendingMic = useCallback((session: GeminiLiveSession) => {
    const chunks = pendingMicRef.current;
    pendingMicRef.current = [];
    pendingSamplesRef.current = 0;
    let frame: Int16Array[] = [];
    let frameLen = 0;
    const send = () => {
      if (!frameLen) return;
      const merged = new Int16Array(frameLen);
      let off = 0;
      for (const c of frame) { merged.set(c, off); off += c.length; }
      session.sendAudioChunk(toBase64(merged));
      frame = [];
      frameLen = 0;
    };
    for (const c of chunks) {
      if (frameLen + c.length > FLUSH_FRAME_SAMPLES) send();
      frame.push(c);
      frameLen += c.length;
    }
    send();
  }, []);

  const onReady = useCallback((session: GeminiLiveSession) => {
    clearHandshakeTimer();
    readyRef.current = true;
    reconnectingRef.current = false;
    phaseRef.current = 'resume';
    clearGoAwayTimer();
    flushPendingMic(session);
    setError(null);
    setStatusSafe(isPlaying() ? 'speaking' : 'listening');
  }, [clearGoAwayTimer, clearHandshakeTimer, flushPendingMic, isPlaying, setStatusSafe]);

  const answerToolCall = useCallback(async (calls: Array<{ id: string; name: string; args: unknown }>, session: GeminiLiveSession) => {
    let responses: LiveFunctionResponse[] = [];
    const handler = optsRef.current.onToolCall;
    if (handler) {
      try { responses = (await handler(calls)) || []; } catch { responses = []; }
    }
    const answered = new Set(responses.map((r) => r.id));
    for (const c of calls) {
      if (!answered.has(c.id)) responses.push({ id: c.id, name: c.name, response: { error: 'not_supported' } });
    }
    if (sessionRef.current === session) session.sendToolResponse(responses);
  }, []);

  const afterTurnBoundary = useCallback(() => {
    if (goAwayPendingRef.current) reconnectRef.current('goAway');
  }, []);

  const onServerEvent = useCallback((ev: LiveServerEvent, session: GeminiLiveSession) => {
    switch (ev.kind) {
      case 'audio':
        if (dropModelAudioRef.current) return;
        modelTurnOpenRef.current = true;
        enqueueAudio(ev.data, ev.mimeType);
        return;
      case 'inputTranscript':
        if (ev.text) { pendingUserRef.current += ev.text; publishCaptions(); }
        return;
      case 'outputTranscript':
        if (dropModelAudioRef.current) return; // the words of audio we dropped were never heard
        modelTurnOpenRef.current = true;
        if (ev.text) { pendingModelRef.current += ev.text; publishCaptions(); }
        return;
      case 'interrupted':
        flushPlayback();
        // A local barge-in already closed this exchange; closing it again would split the user's next utterance.
        if (!dropModelAudioRef.current) flushTurn(true);
        dropModelAudioRef.current = false;
        modelTurnOpenRef.current = false;
        clearThinkingTimer();
        if (readyRef.current) setStatusSafe('listening');
        afterTurnBoundary();
        return;
      case 'turnComplete':
        flushTurn(false);
        dropModelAudioRef.current = false;
        modelTurnOpenRef.current = false;
        clearThinkingTimer();
        if (!isPlaying() && readyRef.current && statusRef.current !== 'listening') setStatusSafe('listening');
        afterTurnBoundary();
        return;
      case 'goAway': {
        // The old connection keeps working for timeLeft: let an in-flight answer finish there, then resume.
        if (!modelTurnOpenRef.current) { reconnectRef.current('goAway'); return; }
        goAwayPendingRef.current = true;
        const wait = Math.max(0, Math.min((ev.timeLeftMs ?? 0) - 1000, 20_000));
        if (goAwayTimerRef.current) clearTimeout(goAwayTimerRef.current);
        goAwayTimerRef.current = setTimeout(() => { goAwayTimerRef.current = null; reconnectRef.current('goAway'); }, wait);
        return;
      }
      case 'resumption':
        if (ev.resumable && ev.handle) handleRef.current = ev.handle;
        return;
      case 'usage':
        try { optsRef.current.onUsage?.(ev.totalTokens === undefined ? {} : { totalTokens: ev.totalTokens }); } catch { /* noop */ }
        return;
      case 'toolCall':
        void answerToolCall(ev.calls, session);
        return;
      default:
        return; // setupComplete arrives via onSetupComplete; 'error' frames are followed by a close
    }
  }, [afterTurnBoundary, answerToolCall, clearThinkingTimer, enqueueAudio, flushPlayback, flushTurn, isPlaying, publishCaptions, setStatusSafe]);

  const onSessionClosed = useCallback(() => {
    clearHandshakeTimer();
    const wasReady = readyRef.current;
    sessionRef.current = null;
    readyRef.current = false;
    if (!activeRef.current) return;
    if (wasReady) {
      // An established call dropped (the ~10-min connection reset without a goAway, a network blip, a server end).
      reconnectRef.current('drop');
      return;
    }
    // The handshake never completed → next step of the plan (retry / degrade / fresh token / fresh session).
    stepRef.current += 1;
    void runStepRef.current();
  }, [clearHandshakeTimer]);

  const openSession = useCallback((handle: string | null | undefined) => {
    const tok = tokenRef.current;
    if (!tok) return;
    const gen = genRef.current;
    let opened = false;
    const current = () => sessionRef.current === session && gen === genRef.current;
    // The deadline runs from CONSTRUCTION, not from socket open (GeminiLiveSession's own setupTimeoutMs only arms
    // on open, so a socket stuck in CONNECTING would never time out). Expiry = a close before setupComplete.
    clearHandshakeTimer();
    const timeoutMs = optsRef.current.setupTimeoutMs ?? LIVE_SETUP_TIMEOUT_MS;
    handshakeTimerRef.current = setTimeout(() => {
      handshakeTimerRef.current = null;
      if (!current() || readyRef.current) return;
      sessionRef.current = null; // detach first: the close below must not be handled twice
      try { session.close(); } catch { /* noop */ }
      onSessionClosed();
    }, timeoutMs);
    const session: GeminiLiveSession = new GeminiLiveSession(
      { token: tok.token, setupMessage: buildSetupMessage(handle) },
      {
        onOpen: () => { opened = true; },
        onSetupComplete: () => { if (current()) onReady(session); },
        onEvent: (ev) => { if (current()) onServerEvent(ev, session); },
        onError: () => {
          // A socket that could not even be constructed reports onError with no close event to follow.
          if (!opened && current()) queueMicrotask(() => { if (current() && !opened) onSessionClosed(); });
        },
        onClose: () => { if (current()) onSessionClosed(); },
      },
    );
    sessionRef.current = session;
    readyRef.current = false;
    session.connect();
  }, [buildSetupMessage, clearHandshakeTimer, onReady, onServerEvent, onSessionClosed]);

  runStepRef.current = async () => {
    const gen = genRef.current;
    if (!activeRef.current) return;
    const step = planRef.current[stepRef.current];
    if (!step) { fail(phaseRef.current === 'initial' ? 'setup_failed' : 'connection_lost'); return; }
    if (step.degrade && !degradedRef.current) { degradedRef.current = true; setDegraded(true); }
    if (step.freshToken || !tokenUsable()) {
      const minted = await mint(step.handle);
      if (gen !== genRef.current) return;
      if (!minted.ok) { fail(minted.code); return; }
    }
    openSession(step.handle);
  };

  reconnectRef.current = (reason) => {
    if (!activeRef.current || reconnectingRef.current) return;
    const handle = handleRef.current;
    const canResume = !!handle && !degradedRef.current && optsRef.current.parity !== false && resumesRef.current < MAX_RESUMES;
    if (!canResume) {
      // Nothing to resume with: a goAway just lets the old connection run out; a dropped socket ends the call.
      if (reason === 'drop') fail('connection_lost');
      else clearGoAwayTimer();
      return;
    }
    resumesRef.current += 1;
    reconnectingRef.current = true;
    clearGoAwayTimer();
    const old = sessionRef.current;
    sessionRef.current = null; // first, so the old socket's close is ignored
    readyRef.current = false;
    try { old?.close(); } catch { /* noop */ }
    if (!isPlaying()) setStatusSafe('reconnecting');
    // Same token first (resuming does not spend the token's single use — UNCERTAIN after its 2-min new-session
    // window), then a fresh mint with the handle, then a fresh session (context lost, call kept).
    planRef.current = [
      { freshToken: false, handle },
      { freshToken: true, handle },
      { freshToken: true, handle: null },
    ];
    stepRef.current = 0;
    phaseRef.current = 'resume';
    void runStepRef.current();
  };

  // ── Mic ingest (worklet / ScriptProcessor → VAD → socket or pre-setup buffer) ──
  const ingest = useCallback((pcm: Int16Array, rms: number) => {
    if (!activeRef.current) return;
    if (mutedRef.current) { inputLevelRef.current = 0; return; }
    const level = Math.min(1, Math.max(0, rms) * 4);
    inputLevelRef.current = inputLevelRef.current * 0.4 + level * 0.6;

    const now = deps().now();
    const assistantSpeaking = isPlaying() && !dropModelAudioRef.current;
    const { state, event } = stepVad(vadRef.current, rms, now, {
      assistantSpeaking,
      graceUntilMs: graceUntilRef.current,
      cfg: assistantSpeaking ? BARGE_CFG : DEFAULT_VAD_CONFIG,
    });
    vadRef.current = state;
    if (event === 'barge-onset') {
      interrupt();
    } else if (event === 'onset') {
      clearThinkingTimer();
      if (statusRef.current === 'thinking') setStatusSafe('listening');
    } else if (event === 'endpoint' || event === 'max-utterance') {
      vadRef.current = createVadState(state.floor);
      if (event === 'endpoint' && readyRef.current && statusRef.current === 'listening') {
        setStatusSafe('thinking');
        clearThinkingTimer();
        thinkingTimerRef.current = setTimeout(() => {
          thinkingTimerRef.current = null;
          if (statusRef.current === 'thinking') setStatusSafe('listening');
        }, THINKING_TIMEOUT_MS);
      }
    }

    const down = downsampleRef.current ? downsampleRef.current(pcm) : pcm;
    if (down.length === 0) return;
    const session = sessionRef.current;
    if (readyRef.current && session) {
      session.sendAudioChunk(toBase64(down));
      return;
    }
    // Not connected yet (minting, handshaking, resuming): HOLD it — these are the user's first words.
    pendingMicRef.current.push(down);
    pendingSamplesRef.current += down.length;
    while (pendingSamplesRef.current > PRE_SETUP_MAX_SAMPLES && pendingMicRef.current.length > 1) {
      const dropped = pendingMicRef.current.shift();
      pendingSamplesRef.current -= dropped ? dropped.length : 0;
    }
  }, [clearThinkingTimer, deps, interrupt, isPlaying, setStatusSafe]);

  const openCapture = useCallback(async (mic: MediaStream, gen: number): Promise<void> => {
    const d = deps();
    let ctx = capCtxRef.current;
    let source: MediaStreamAudioSourceNode | null = null;
    if (ctx) {
      try {
        source = ctx.createMediaStreamSource(mic);
      } catch {
        // ⚠️ Firefox refuses to connect a mic to a context at a different sample rate — capture on the (native-rate)
        // playback context instead and downsample in JS.
        try { void ctx.close().catch(() => {}); } catch { /* noop */ }
        capCtxRef.current = null;
        ctx = null;
      }
    }
    if (!ctx || !source) {
      ctx = playCtxRef.current;
      if (!ctx) throw new Error('no audio context');
      source = ctx.createMediaStreamSource(mic);
    }
    sourceRef.current = source;
    const rate = ctx.sampleRate;
    downsampleRef.current = rate === CAPTURE_RATE ? null : createPcmDownsampler(rate, CAPTURE_RATE);

    const worklet = (ctx as BaseAudioContext).audioWorklet;
    if (worklet && typeof worklet.addModule === 'function') {
      await worklet.addModule(WORKLET_URL);
      if (gen !== genRef.current) return;
      const node = d.createWorkletNode(ctx, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        processorOptions: { frameSize: Math.max(128, Math.round((rate * CHUNK_MS) / 1000)) },
      });
      node.port.onmessage = (e: MessageEvent) => {
        const data: unknown = e.data;
        if (!isObj(data) || data.type !== 'pcm16') return;
        const buf = data.buffer as ArrayBuffer | undefined;
        if (!buf || typeof buf.byteLength !== 'number') return;
        ingest(new Int16Array(buf, 0, Math.floor(buf.byteLength / 2)), typeof data.rms === 'number' ? data.rms : 0);
      };
      source.connect(node);
      captureNodeRef.current = node;
      return;
    }
    // ⚠️ Engines without AudioWorklet (old iOS): ScriptProcessor is deprecated and runs on the main thread, but it
    // is the only capture path there — dropping it would end Live voice for those users.
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    proc.onaudioprocess = (e: AudioProcessingEvent) => {
      const f = e.inputBuffer.getChannelData(0);
      ingest(floatTo16BitPCM(f), rmsOf(f));
    };
    source.connect(proc);
    proc.connect(ctx.destination); // some engines only fire onaudioprocess on a connected node; its output is silent
    captureNodeRef.current = proc;
  }, [deps, ingest]);

  // ── Public API ──
  const start = useCallback(async (): Promise<void> => {
    if (activeRef.current) return; // a call is already running or starting (double tap, double effect)
    activeRef.current = true;
    const gen = ++genRef.current;
    const d = deps();

    degradedRef.current = false;
    setDegraded(false);
    tokenRef.current = null;
    modelRef.current = null;
    serverSetupRef.current = null;
    handleRef.current = null;
    resumesRef.current = 0;
    phaseRef.current = 'initial';
    pendingUserRef.current = '';
    pendingModelRef.current = '';
    finalCaptionsRef.current = [];
    turnSeqRef.current = 0;
    setCaptions([]);
    vadRef.current = createVadState();
    graceUntilRef.current = 0;
    setError(null);
    setStatusSafe('connecting');

    // 1) Audio contexts NOW, inside the opening gesture (see the header).
    let playCtx: AudioContext;
    try {
      playCtx = d.createAudioContext();
    } catch {
      fail('unsupported');
      return;
    }
    playCtxRef.current = playCtx;
    const gain = playCtx.createGain();
    const analyser = playCtx.createAnalyser();
    analyser.fftSize = 256;
    gain.connect(analyser);
    analyser.connect(playCtx.destination);
    gainRef.current = gain;
    outAnalyserRef.current = analyser;
    outBufRef.current = new Uint8Array(analyser.fftSize);
    try { capCtxRef.current = d.createAudioContext({ sampleRate: CAPTURE_RATE }); } catch { capCtxRef.current = null; }
    try { void playCtx.resume().catch(() => {}); } catch { /* noop */ }
    try { void capCtxRef.current?.resume().catch(() => {}); } catch { /* noop */ }

    // 2) Mic permission and token mint in PARALLEL: startup costs max(mic, mint), not the sum.
    let micP: Promise<MediaStream>;
    try {
      micP = d.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (e) {
      micP = Promise.reject(e);
    }
    micP.catch(() => {}); // pre-attach: an early mint failure must not surface an unhandled rejection
    const releaseMicLater = () => { void micP.then(stopTracks).catch(() => {}); };

    // Parity asks for resumption from the first frame (sessionResumption: {}), so the locked setup must carry it too.
    const minted = await mint(optsRef.current.parity !== false ? null : undefined);
    if (gen !== genRef.current) { releaseMicLater(); return; }
    if (!minted.ok) {
      releaseMicLater();
      const onUnavailable = optsRef.current.onUnavailable;
      if (minted.code === 'unavailable' && onUnavailable) {
        teardown();
        setStatusSafe('idle');
        onUnavailable();
        return;
      }
      fail(minted.code);
      return;
    }

    // 3) Open the socket right away (the mint's new-session window is ~2 min; a permission prompt can outlast it).
    const parity = optsRef.current.parity !== false;
    planRef.current = [
      { freshToken: false, handle: parity ? null : undefined },
      // One retry: fresh token, legacy wire (the parity fields are the unverified part of the handshake).
      { freshToken: true, handle: undefined, degrade: true },
    ];
    stepRef.current = 0;
    openSession(planRef.current[0]!.handle);

    // 4) Mic → capture graph.
    let mic: MediaStream;
    try {
      mic = await micP;
    } catch (e) {
      if (gen === genRef.current) fail(micErrorCode(e));
      return;
    }
    if (gen !== genRef.current) { stopTracks(mic); return; }
    micRef.current = mic;
    if (mutedRef.current) mic.getAudioTracks().forEach((t) => { t.enabled = false; });
    try {
      await openCapture(mic, gen);
    } catch {
      if (gen === genRef.current) fail('unsupported');
    }
  }, [deps, fail, mint, openCapture, openSession, setStatusSafe, teardown]);

  const stop = useCallback(() => {
    flushTurn(true);
    teardown();
    setStatusSafe('closed');
  }, [flushTurn, setStatusSafe, teardown]);

  const retry = useCallback(() => {
    teardown();
    void start();
  }, [start, teardown]);

  const setMuted = useCallback((next: boolean) => {
    mutedRef.current = next;
    setMutedState(next);
    micRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    if (next) {
      inputLevelRef.current = 0;
      // Lets the server finalise the user's turn instead of waiting for silence. Not sent on the degraded
      // (legacy) wire, which never sent realtimeInput.audioStreamEnd.
      if (readyRef.current && !degradedRef.current) sessionRef.current?.endAudioStream();
    }
  }, []);

  const toggleMute = useCallback(() => setMuted(!mutedRef.current), [setMuted]);

  const sendVideoFrame = useCallback((frameBase64: string, mimeType = 'image/jpeg') => {
    if (readyRef.current) sessionRef.current?.sendVideoFrame(frameBase64, mimeType);
  }, []);

  const sendText = useCallback((text: string) => {
    const t = typeof text === 'string' ? text.trim() : '';
    if (!t || !readyRef.current || !sessionRef.current) return;
    sessionRef.current.sendText(t);
    pendingUserRef.current = pendingUserRef.current ? `${pendingUserRef.current} ${t}` : t;
    publishCaptions();
  }, [publishCaptions]);

  const getLevels = useCallback((): LiveLevels => {
    const input = mutedRef.current ? 0 : Math.min(1, Math.max(0, inputLevelRef.current));
    let output = 0;
    const an = outAnalyserRef.current;
    const buf = outBufRef.current;
    if (an && buf && activeSourcesRef.current.size > 0) {
      try {
        an.getByteTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) { const v = ((buf[i] ?? 128) - 128) / 128; s += v * v; }
        output = Math.min(1, Math.sqrt(s / (buf.length || 1)) * 3.4);
      } catch { output = 0; }
    }
    return { input, output };
  }, []);

  // Unmount: nothing may outlive the component (hot mic, open socket, running contexts).
  useEffect(() => () => {
    if (activeRef.current) flushTurn(true);
    teardown();
  }, [flushTurn, teardown]);

  return { status, error, captions, muted, degraded, start, stop, retry, interrupt, setMuted, toggleMute, sendVideoFrame, sendText, getLevels };
}

// ─── Camera ───────────────────────────────────────────────────────────────────

export interface UseLiveCameraOptions {
  /** Receives each JPEG frame (base64, no data: prefix). Typically the session's sendVideoFrame. */
  onFrame: (frameBase64: string, mimeType: string) => void;
  /** Frames per second. The Live API reads at most 1 fps, so more only costs bandwidth. */
  fps?: number;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

export interface UseLiveCameraResult {
  on: boolean;
  facing: 'user' | 'environment';
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
  flip: () => Promise<void>;
}

/**
 * Camera frames into the call. Back camera by default (show Gemini what you see), flip to the front.
 * ⚠️ The user's LAST intent wins: turning the camera off during a getUserMedia await (a flip, a slow prompt) must
 * drop the stream that resolves afterwards, or it leaks as a hot camera with a frame timer nobody stops.
 */
export function useLiveCamera(options: UseLiveCameraOptions): UseLiveCameraResult {
  const [on, setOn] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const facingRef = useRef<'user' | 'environment'>('environment');
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wantedRef = useRef(false);
  const mountedRef = useRef(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const optsRef = useRef(options);
  optsRef.current = options;

  const release = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopTracks(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const captureFrame = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight || typeof document === 'undefined') return;
    const c = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'));
    const scale = Math.min(1, 640 / v.videoWidth);
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const g = c.getContext('2d');
    if (!g) return;
    g.drawImage(v, 0, 0, c.width, c.height);
    const b64 = c.toDataURL('image/jpeg', 0.6).split(',')[1] || '';
    if (b64) { try { optsRef.current.onFrame(b64, 'image/jpeg'); } catch { /* noop */ } }
  }, []);

  const start = useCallback(async () => {
    wantedRef.current = true;
    const gum = optsRef.current.getUserMedia ?? ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c));
    let stream: MediaStream;
    try {
      stream = await gum({ video: { facingMode: facingRef.current, width: 640, height: 480 } });
    } catch {
      // Many laptops reject an exact facingMode — retry unconstrained so the camera still opens.
      try { stream = await gum({ video: { width: 640, height: 480 } }); } catch { wantedRef.current = false; if (mountedRef.current) setOn(false); return; }
    }
    if (!mountedRef.current || streamRef.current || !wantedRef.current) { stopTracks(stream); return; }
    streamRef.current = stream;
    const v = videoRef.current;
    if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
    if (streamRef.current !== stream) return; // stopped during play()
    const fps = Math.min(1, Math.max(0.2, optsRef.current.fps ?? 1));
    timerRef.current = setInterval(captureFrame, Math.round(1000 / fps));
    setOn(true);
  }, [captureFrame]);

  const stop = useCallback(() => {
    wantedRef.current = false;
    release();
    setOn(false);
  }, [release]);

  const toggle = useCallback(() => { if (wantedRef.current) stop(); else void start(); }, [start, stop]);

  const flip = useCallback(async () => {
    if (!streamRef.current) return;
    const next = facingRef.current === 'environment' ? 'user' : 'environment';
    facingRef.current = next;
    setFacing(next);
    release();
    await start();
  }, [release, start]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; wantedRef.current = false; release(); };
  }, [release]);

  return { on, facing, videoRef, start, stop, toggle, flip };
}
