'use client';

/**
 * VoiceConversation — continuous, hands-free, full-duplex-style voice node (Phase 10). Tier 3 of ChatChrome's voice
 * cascade: the ElevenLabs fallback a user gets when Gemini Live is unavailable for them (a provider outage, no live
 * user id, NEXT_PUBLIC_GEMINI_LIVE_ENABLED off).
 *
 * Tap ONCE to start a live session; after that it listens continuously, auto-detects when you
 * stop speaking (VAD), replies out loud, and immediately listens again — hands-free multi-turn
 * like Gemini Live / GPT-4o Voice. Talk OVER the reply to interrupt it (barge-in). Georgian,
 * English and Russian all work (the routes own the language; VAD is language-agnostic).
 *
 * Pipeline (unchanged REST contract — every leg fail-open + timeout-guarded):
 *   mic → VAD endpoint → /api/voice/transcribe → /api/voice/chat → /api/tts/gemini (chunked).
 *
 * The hard-won robustness (why the old shell felt "dead"):
 *  - ONE AudioContext is created AND resumed INSIDE the first tap gesture and reused for the whole
 *    session. A suspended context (no gesture) makes the analyser read zeros forever — the classic
 *    dead shell — and iOS caps contexts + gesture-couples resume, so per-turn contexts can't resume.
 *  - TTS plays THROUGH that running context (decodeAudioData → BufferSource), so playback is never
 *    blocked by the HTMLAudioElement autoplay policy on turns 2..N (no fresh gesture there).
 *  - The assistant's own voice can't self-trigger the mic: a hard STATE GATE runs normal endpoint
 *    VAD only while listening; during playback only a stricter barge detector runs (+ a per-chunk
 *    grace window). echoCancellation is a secondary defence.
 *  - VAD is clocked by a 50ms setInterval + performance.now() deltas (rAF throttles to 0 in a
 *    background tab); a monotonic turn-generation counter orphans stale async on barge/close.
 *  - If the Web-Audio machinery can't be set up, it FALLS BACK to plain tap-to-talk so voice still
 *    works. Tapping the orb while listening always force-ends the turn (manual endpoint).
 *
 * THE SCREEN IS THE LIVE CALL'S (the owner, 2026-10-03: "the rocket logo on the Live chat, as here, for users too").
 * ⚠️ This used to be its own screen: a canvas metaball orb that went crimson → violet while speaking (the banned "AI
 * purple" and glow soup, docs/DESIGN.md §6), no rocket, an unlocalized ✕. It now draws the Gemini Live call's pieces
 * (components/voice/live/LiveCallChrome.tsx): the rocket orb with its one audio-reactive halo (LiveOrb, fed by this
 * session's analysers through `getLevels`), the large faint rocket behind it, „ცოცხალი ზარი“ top-left with the
 * captions toggle, the status line with the compact waveform, the rolling captions, and the round 56 px glass row —
 * Mute · End. The status words are the Live screen's (LIVE_OVERLAY_STRINGS), so „უკავშირდება…“ reads the same on both.
 * Mute disables the mic track: the recorder and the VAD hear silence, so a muted user neither ends a turn nor barges in.
 * Like the Live screen it is portalled onto <body>, pinned dark, at z-[130], and is a dialog: focus moves in, Tab is
 * trapped, Escape ends the call.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Mic, MicOff, PhoneOff, RotateCcw, Subtitles } from 'lucide-react';

import { useDialogA11y } from '@/hooks/useDialogA11y';
import {
  DEFAULT_VAD_CONFIG,
  bargeConfig,
  createVadState,
  stepVad,
  shouldCommit,
  extForMime,
  type VadState,
} from '@/lib/voice/vad';
import { useMicRelease } from '@/lib/voice/micBus';
import { isSpeechLang, loadLearnedSpeechLang, resolveSpeechLang, saveLearnedSpeechLang, transcriptSpeechLang } from '@/lib/voice/speechLang';

import LiveCaptions from './live/LiveCaptions';
import {
  LiveBottomScrim,
  LiveCallFrame,
  LiveControl,
  LiveControlRow,
  LiveErrorPanel,
  LiveStatusLine,
  LiveTopBar,
  LiveTopToggle,
  livePrimaryButtonClass,
  liveQuietText,
} from './live/LiveCallChrome';
import { LIVE_OVERLAY_STRINGS } from './live/LiveModeOverlay';
import LiveOrb, { type LiveOrbState } from './live/LiveOrb';
import type { LiveCaption, LiveLevels } from './live/useGeminiLiveSession';

type Lang = 'ka' | 'en' | 'ru';
type Status = 'connecting' | 'off' | 'listening' | 'thinking' | 'speaking' | 'resume' | 'error';
/** Why the session stopped: the microphone, the routes' rate limit, or a leg that answered nothing (signed out, TTS). */
type VoiceError = 'mic' | 'rate_limited' | 'failed';
interface Turn { role: 'user' | 'assistant'; content: string }

/** This screen's own words; everything the Live call also says (status, Mute, End, „ცოცხალი ზარი“) is LIVE_OVERLAY_STRINGS. */
export const VOICE_CONVERSATION_STRINGS: Record<Lang, {
  title: string; tapToStart: string; tapResume: string; paused: string; endTurn: string; hint: string;
  micDenied: string; rateLimited: string; noReply: string; stopped: string; retry: string;
}> = {
  ka: {
    title: 'ხმოვანი საუბარი', tapToStart: 'დააჭირე დასაწყებად', tapResume: 'დააჭირე გასაგრძელებლად', paused: 'შეჩერებულია',
    endTurn: 'დააჭირე, როცა დაასრულებ', hint: 'ილაპარაკე თავისუფლად — მე თვითონ მივხვდები როდის დაასრულებ',
    micDenied: 'მიკროფონზე წვდომა ვერ მოხერხდა', rateLimited: 'ცოტა ხანს დაისვენე და სცადე თავიდან',
    noReply: 'პასუხი ვერ მივიღე.', stopped: 'საუბარი შეჩერდა', retry: 'სცადე თავიდან',
  },
  en: {
    title: 'Voice chat', tapToStart: 'Tap to start', tapResume: 'Tap to resume', paused: 'Paused',
    endTurn: "Tap when you're done", hint: 'Just talk — I detect when you finish',
    micDenied: "Couldn't access the microphone", rateLimited: 'Slow down a moment — tap to retry',
    noReply: "I couldn't get an answer.", stopped: 'The conversation stopped', retry: 'Try again',
  },
  ru: {
    title: 'Голосовой чат', tapToStart: 'Нажмите, чтобы начать', tapResume: 'Нажмите, чтобы продолжить', paused: 'На паузе',
    endTurn: 'Нажмите, когда закончите', hint: 'Просто говорите — я пойму, когда вы закончите',
    micDenied: 'Нет доступа к микрофону', rateLimited: 'Слишком часто — нажмите, чтобы повторить',
    noReply: 'Не удалось получить ответ.', stopped: 'Разговор остановлен', retry: 'Ещё раз',
  },
};

/** The orb has fewer states than the session: not started and paused both look idle. */
export function voiceOrbState(status: Status): LiveOrbState {
  switch (status) {
    case 'connecting':
    case 'listening':
    case 'thinking':
    case 'speaking':
    case 'error':
      return status;
    default:
      return 'idle';
  }
}

const VAD_INTERVAL_MS = 50;
// Master Contract V5 — per-chunk grace window after playback starts, during which barge is suppressed
// so the assistant's own audio-onset transient can't self-interrupt. Widened 300→400ms alongside the
// higher barge amplitude bar for a calmer, less trigger-happy hands-free loop.
const BARGE_GRACE_MS = 400;
const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
};

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
    : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
}

// Timeout signal that ALSO aborts when the given controller aborts (barge/close), when the
// runtime supports AbortSignal.any; otherwise just the timeout (the turn-generation guard still
// discards stale results). Keeps in-flight fetches cancellable without leaking.
function turnSignal(ms: number, extra: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return typeof anyFn === 'function' ? anyFn([timeout, extra]) : timeout;
}

/**
 * The voice level an analyser hears (0..1) — what the orb and the waveform follow: the mean of the lower two-thirds of
 * its bins (where voice energy lives), with gain. Never throws: a closed context's analyser reads as silence.
 */
function analyserLevel(analyser: AnalyserNode | null, bufRef: { current: Uint8Array | null }): number {
  if (!analyser) return 0;
  try {
    const bins = analyser.frequencyBinCount;
    let buf = bufRef.current;
    if (!buf || buf.length !== bins) { buf = new Uint8Array(bins); bufRef.current = buf; }
    analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
    const usable = Math.max(1, Math.floor(bins * 0.66));
    let sum = 0; for (let i = 0; i < usable; i++) sum += buf[i] ?? 0;
    return Math.min(1, (sum / usable / 255) * 1.9);
  } catch {
    return 0;
  }
}

/** Mute = the mic track off: the recorder and the VAD hear silence, and the stream stays granted for unmute. */
function setMicEnabled(stream: MediaStream | null, enabled: boolean): void {
  try { stream?.getAudioTracks?.().forEach((tr) => { try { tr.enabled = enabled; } catch { /* noop */ } }); } catch { /* noop */ }
}

const NO_LEVELS: LiveLevels = { input: 0, output: 0 };

/** A context a teardown closed — read through a call, because it can close during any await of a boot. */
function isClosed(ctx: AudioContext | null): boolean {
  return ctx?.state === 'closed';
}

export function VoiceConversation({ locale = 'ka', onClose }: { locale?: string; onClose: () => void }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = VOICE_CONVERSATION_STRINGS[lang];
  const live = LIVE_OVERLAY_STRINGS[lang];
  const [status, setStatus] = useState<Status>('connecting');
  // The last exchange, numbered so each new turn mounts new caption lines (the log announces additions).
  const [turn, setTurn] = useState<{ n: number; said: string; reply: string }>({ n: 0, said: '', reply: '' });
  const [error, setError] = useState<VoiceError | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [captionsOn, setCaptionsOn] = useState(true);

  // ── Mic + Web-Audio graph (persistent across turns) ──
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vadBufRef = useRef<Uint8Array | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('');

  // ── VAD loop ──
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vadStateRef = useRef<VadState>(createVadState());
  const vadModeRef = useRef(false); // true once the analyser is live; false → manual tap-to-talk
  const graceUntilRef = useRef(0);

  // ── Playback (through the AudioContext) ──
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null); // taps the TTS output for the orb
  const ttsAbortRef = useRef<AbortController | null>(null);
  const turnAbortRef = useRef<AbortController | null>(null);

  // ── The orb's levels (read by LiveOrb + LiveWaveform once per animation frame each) ──
  const levelBufRef = useRef<Uint8Array | null>(null);
  const levelCacheRef = useRef<{ at: number; value: LiveLevels }>({ at: -1, value: NO_LEVELS });

  // ── Session bookkeeping ──
  const statusRef = useRef<Status>('connecting');
  const historyRef = useRef<Turn[]>([]);
  const turnGenRef = useRef(0);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const go = useCallback((s: Status) => { statusRef.current = s; setStatus(s); }, []);

  // ── Stop the capture/analysis/playback graph but KEEP the AudioContext (reused across turns
  //    and re-boots — iOS caps contexts + gesture-couples resume). Idempotent. ──
  const stopGraph = useCallback(() => {
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
    try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch { /* noop */ }
    recorderRef.current = null;
    try { currentSourceRef.current?.stop(); } catch { /* noop */ }
    currentSourceRef.current = null;
    try { sourceRef.current?.disconnect(); } catch { /* noop */ }
    sourceRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* noop */ } });
    streamRef.current = null;
  }, []);

  // ── Full teardown — idempotent; reachable from unmount AND onClose ──
  const teardown = useCallback(() => {
    runningRef.current = false;
    turnGenRef.current += 1;
    try { turnAbortRef.current?.abort(); } catch { /* noop */ }
    try { ttsAbortRef.current?.abort(); } catch { /* noop */ }
    stopGraph();
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    playbackAnalyserRef.current = null; // bound to the ctx we're closing; a fresh session recreates it
    if (ctx && ctx.state !== 'closed') { void ctx.close().catch(() => undefined); }
  }, [stopGraph]);

  // ⚠️ Re-arm the flag on every mount: React's development double-mount (Strict Mode — the app router's default) ran
  // this cleanup once and left `mountedRef` false, so the remount's boot bailed and the screen sat on connecting.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; teardown(); };
  }, [teardown]);

  // VECTOR 1 — pre-warm the AudioContext on mount (this component only mounts when the voice overlay opens,
  // so it's a safe head-start): the context is CREATED suspended here — no user gesture needed to create,
  // only to resume, which the first tap already does — so the first turn's playback/analysis doesn't pay the
  // context-creation cost. The lazy turn path reuses this instance (it checks audioCtxRef first); teardown
  // still closes it. Deliberately NOT pre-calling getUserMedia (that would fire a surprise permission prompt).
  useEffect(() => {
    if (audioCtxRef.current) return;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    try { audioCtxRef.current = new Ctor(); } catch { /* falls back to lazy creation on the first turn */ }
  }, []);

  // ── The orb's levels: the MIC while listening (zero while muted), the TTS output while speaking, nothing otherwise.
  //    LiveOrb and LiveWaveform each read once per frame, so one analyser read serves both (8 ms cache). ──
  const getLevels = useCallback((): LiveLevels => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const cache = levelCacheRef.current;
    if (cache.at >= 0 && now - cache.at >= 0 && now - cache.at < 8) return cache.value;
    const st = statusRef.current;
    const value: LiveLevels = {
      input: st === 'listening' && !mutedRef.current ? analyserLevel(analyserRef.current, levelBufRef) : 0,
      output: st === 'speaking' ? analyserLevel(playbackAnalyserRef.current, levelBufRef) : 0,
    };
    levelCacheRef.current = { at: now, value };
    return value;
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    setMicEnabled(streamRef.current, !next);
  }, []);

  // ── One VAD sample: read RMS → advance the reducer → act on the event ──
  const vadTick = useCallback(() => {
    if (!runningRef.current) return;
    const analyser = analyserRef.current;
    const buf = vadBufRef.current;
    if (!analyser || !buf) return;
    analyser.getByteTimeDomainData(buf as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (const b of buf) { const v = (b - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / buf.length);

    const st = statusRef.current;
    const speaking = st === 'speaking';
    // Only run VAD while listening (endpoint) or speaking (barge). Other states ignore it.
    if (st !== 'listening' && !speaking) return;

    const cfg = speaking ? bargeConfig(DEFAULT_VAD_CONFIG) : DEFAULT_VAD_CONFIG;
    const { state, event } = stepVad(vadStateRef.current, rms, performance.now(), {
      assistantSpeaking: speaking,
      graceUntilMs: graceUntilRef.current,
      cfg,
    });
    vadStateRef.current = state;

    if (speaking) {
      if (event === 'barge-onset') bargeInRef.current?.();
      return;
    }
    if (event === 'endpoint' || event === 'max-utterance') {
      // stop the recorder → onstop commits (or discards) the utterance
      try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch { /* noop */ }
    }
  }, []);

  // ── Play one decoded chunk through the context; resolves when it ends / stalls ──
  const playBuffer = useCallback((audio: AudioBuffer, myGen: number): Promise<void> => {
    return new Promise<void>((resolve) => {
      const ctx = audioCtxRef.current;
      if (!ctx || !runningRef.current || myGen !== turnGenRef.current) { resolve(); return; }
      let done = false;
      const finish = () => {
        if (done) return; done = true; clearTimeout(guard);
        // Silence + release the node before advancing — a stall-guard-resolved source must not keep
        // a wedged node wired to ctx.destination (leak) or overlap the next chunk / listening window.
        try { src.onended = null; } catch { /* noop */ }
        try { src.stop(); } catch { /* noop */ }
        try { src.disconnect(); } catch { /* noop */ }
        if (currentSourceRef.current === src) currentSourceRef.current = null;
        resolve();
      };
      // A wedged decoder / suspended context can fire neither onended nor error; 45s > any real
      // ~600-char chunk, so this only trips on a genuine stall, then advances.
      const guard = setTimeout(finish, 45_000);
      const src = ctx.createBufferSource();
      src.buffer = audio;
      // Route src → AnalyserNode → destination so the orb can pulse to the assistant's
      // OWN voice in real time. Created once, reused across chunks/turns (tied to the ctx lifecycle).
      let pa = playbackAnalyserRef.current;
      if (!pa) {
        pa = ctx.createAnalyser();
        pa.fftSize = 256;
        pa.smoothingTimeConstant = 0.75;
        pa.connect(ctx.destination);
        playbackAnalyserRef.current = pa;
      }
      src.connect(pa);
      src.onended = finish;
      currentSourceRef.current = src;
      graceUntilRef.current = performance.now() + BARGE_GRACE_MS;
      try { src.start(0); } catch { finish(); }
    });
  }, []);

  // ── The turn: transcribe → chat → speak (chunked) → auto re-arm ──
  const runTurnRef = useRef<(blob: Blob) => Promise<void>>();
  const armListenRef = useRef<() => void>();
  const bargeInRef = useRef<() => void>();

  const runTurn = useCallback(async (audio: Blob) => {
    const myGen = turnGenRef.current;
    const stale = () => !runningRef.current || myGen !== turnGenRef.current;
    turnAbortRef.current = new AbortController();
    ttsAbortRef.current = new AbortController();
    const turnSig = turnAbortRef.current.signal;
    const ttsSig = ttsAbortRef.current.signal;
    try {
      go('thinking'); setError(null);

      // 1) STT — label the upload with the container's real extension (iOS records mp4, not webm).
      const fd = new FormData();
      fd.append('audio', audio, `speech.${extForMime(audio.type)}`);
      // The language the user SPEAKS (lib/voice/speechLang): this call's last transcript, else the one heard before,
      // else Georgian for a Georgian UI, else 'auto' (Gemini identifies it). A hint only — never a translation target.
      const lastSaid = [...historyRef.current].reverse().find((h) => h.role === 'user')?.content ?? '';
      fd.append('language', resolveSpeechLang({ locale: lang, typed: transcriptSpeechLang(lastSaid), learned: loadLearnedSpeechLang() }));
      const sr = await fetch('/api/voice/transcribe', { method: 'POST', body: fd, credentials: 'include', signal: turnSignal(30_000, turnSig) }).catch(() => null);
      if (stale()) return;
      if (sr && sr.status === 429) { go('error'); setError('rate_limited'); return; } // back off, don't hammer the throttled route
      const sj = sr ? ((await sr.json().catch(() => null)) as { text?: string; language?: unknown } | null) : null;
      const said = (sj?.text || '').trim();
      if (said && isSpeechLang(sj?.language)) saveLearnedSpeechLang(sj.language);
      if (stale()) return;
      if (!said) { armListenRef.current?.(); return; } // heard nothing → listen again (no chat/tts spend)
      setTurn((p) => ({ n: p.n + 1, said, reply: '' }));
      historyRef.current = [...historyRef.current, { role: 'user' as const, content: said }].slice(-12);

      // 2) LLM reply — a bulletproof SYNCHRONOUS full response (PHASE 35: the Phase-33 sentence-streaming
      //    layer was rolled back). Await the WHOLE reply, then speak it as one unbroken TTS buffer.
      const cr = await fetch('/api/voice/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ text: said, locale: lang, history: historyRef.current }),
        signal: turnSignal(25_000, turnSig),
      }).catch(() => null);
      if (stale()) return;
      if (cr && cr.status === 401) { go('error'); setError('failed'); return; } // signed out → stop, don't loop
      if (cr && cr.status === 429) { go('error'); setError('rate_limited'); return; } // rate-limited → stop, don't re-pay STT in a loop
      const cj = cr ? ((await cr.json().catch(() => null)) as { reply?: string; locale?: string } | null) : null;
      const answer = (cj?.reply || '').trim();
      // The server answers in the language actually SPOKEN (detected from the transcript), which may differ from the
      // UI locale — use THAT locale for TTS so the voice + engine match the reply (Russian speech → Russian voice).
      const spokenLocale: Lang = cj?.locale === 'en' || cj?.locale === 'ru' || cj?.locale === 'ka' ? cj.locale : lang;
      if (stale()) return;
      if (!answer) { armListenRef.current?.(); return; } // fail-open: don't hang, just listen again
      setTurn((p) => ({ ...p, reply: answer }));

      // 3) TTS — feed the WHOLE reply to ElevenLabs in ONE call and play a single unbroken buffer. No
      //    sentence/chunk slicing → no cut words, no dropped tails. Voice replies are short (trimForSpeech
      //    caps at 700 chars), well within ElevenLabs' single-request limit.
      go('speaking');
      vadStateRef.current = createVadState(vadStateRef.current.floor); // fresh state for barge detection
      let buf: AudioBuffer | null = null;
      try {
        const res = await fetch('/api/tts/gemini', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ text: answer, locale: spokenLocale }), signal: turnSignal(30_000, ttsSig),
        });
        if (res.ok) {
          const bytes = await res.arrayBuffer();
          const ctx = audioCtxRef.current;
          if (ctx && bytes.byteLength >= 256) buf = await ctx.decodeAudioData(bytes.slice(0)).catch(() => null);
        }
      } catch { buf = null; }
      if (stale()) return;
      if (!buf) { go('error'); setError('failed'); return; } // TTS miss → surface, don't loop silently
      await playBuffer(buf, myGen);
      if (stale()) return; // barge/close bumped the generation → stop cleanly
      // Record the reply in history ONLY after the user actually heard it — a barged/failed turn must not
      // leave an unspoken message that the next LLM turn would reference ("as I said…").
      historyRef.current = [...historyRef.current, { role: 'assistant' as const, content: answer }].slice(-12);
      armListenRef.current?.(); // hands-free: listen for the next turn
    } catch {
      if (!stale()) armListenRef.current?.(); // never strand the loop on an unexpected throw
    }
  }, [go, lang, playBuffer]);
  runTurnRef.current = runTurn;

  // ── Arm a fresh listening turn: new recorder on the persistent stream + reset the VAD ──
  const armListen = useCallback(() => {
    if (!runningRef.current) return;
    const stream = streamRef.current;
    if (!stream) return;
    vadStateRef.current = createVadState(vadStateRef.current.floor);
    chunksRef.current = [];
    try {
      const mime = mimeRef.current;
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        if (!runningRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mimeRef.current || 'audio/webm' });
        // VAD mode gates on real voiced time (drops coughs/clicks, protects the paid legs); the
        // tap-to-talk fallback has no voiced measurement, so it gates on blob size only.
        const commit = vadModeRef.current
          ? shouldCommit(vadStateRef.current.voicedMs, blob.size, DEFAULT_VAD_CONFIG)
          : blob.size > 512;
        if (!commit) { armListenRef.current?.(); return; }
        void runTurnRef.current?.(blob);
      };
      recorderRef.current = rec;
      rec.start(250); // 250ms timeslice = preroll so the first phoneme is never clipped
      go('listening');
    } catch {
      go('error'); setError('mic');
    }
  }, [go]);
  armListenRef.current = armListen;

  // ── Barge-in: the user talked over the reply → abort playback + capture the new utterance ──
  const bargeIn = useCallback(() => {
    if (statusRef.current !== 'speaking') return;
    turnGenRef.current += 1; // orphan the in-flight TTS loop
    try { ttsAbortRef.current?.abort(); } catch { /* noop */ }
    // Also abort the transcribe/chat fetch, so a barge that lands while a turn is still fetching its reply
    // tears the request down at once (mirrors the visibilitychange teardown) rather than letting it complete.
    try { turnAbortRef.current?.abort(); } catch { /* noop */ }
    try { currentSourceRef.current?.stop(); } catch { /* noop */ }
    currentSourceRef.current = null;
    armListenRef.current?.();
  }, []);
  bargeInRef.current = bargeIn;

  // ── Boot the session. `fromGesture` = the call originated from a real tap (onMicTap/resume) vs.
  //    the auto-start-on-mount attempt. AudioContext.resume() + getUserMedia are gesture-gated on
  //    iOS; the overlay is dynamically imported so the opening tap doesn't carry to the mount
  //    effect. So auto-start proceeds ONLY when the context actually reaches 'running' (desktop /
  //    Android → zero-touch); if it stays 'suspended' (iOS), we fall back to a single "tap to start"
  //    (that tap IS a gesture → resumes cleanly). Never a dead, silently-suspended listening orb. ──
  const bootSession = useCallback(async (fromGesture: boolean) => {
    setError(null);
    stopGraph(); // idempotent: a re-boot from a mid-session error must not leak the old mic/graph
    turnGenRef.current += 1; // orphan any in-flight turn from the previous session

    // 1) Ensure a RUNNING AudioContext first (the gesture-gated step). One context, reused all session.
    let ctx: AudioContext | null = audioCtxRef.current;
    try {
      const Ctor = getAudioContextCtor();
      if (Ctor) {
        ctx = ctx ?? new Ctor();
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* noop */ } }
      } else {
        ctx = null;
      }
    } catch { ctx = null; }
    // Unmounted meanwhile — or a teardown closed the context this boot was building on (the development double-mount):
    // the remount's own boot owns the session.
    if (!mountedRef.current || isClosed(ctx)) return;

    // 2) Auto-start only commits when the context is actually running (VAD will work hands-free).
    //    Otherwise show a one-tap affordance rather than grabbing the mic into a dead loop.
    if (!fromGesture && (!ctx || ctx.state !== 'running')) { go('off'); return; }

    // 3) Acquire the mic + build the graph + arm.
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      // The overlay can close (teardown) while the permission prompt is up; if the grant lands after
      // unmount, drop the stream instead of leaving a hot mic + graph behind.
      if (!mountedRef.current || isClosed(ctx)) { stream.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* noop */ } }); return; }
      // Reentrancy (double-tap on the orb): a concurrent boot already acquired the mic + built the
      // graph. Drop this duplicate stream instead of overwriting streamRef — otherwise the earlier
      // stream + its MediaRecorder become an orphaned hot mic that teardown never sees.
      if (streamRef.current) { stream.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* noop */ } }); return; }
      streamRef.current = stream;
      setMicEnabled(stream, !mutedRef.current); // a re-grant keeps the user's mute
      mimeRef.current = pickMime();
      runningRef.current = true;

      // Web-Audio graph for VAD. If it can't be built we still run — as plain tap-to-talk.
      try {
        if (ctx) {
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0;
          source.connect(analyser); // NOT connected to destination → no feedback howl
          sourceRef.current = source;
          analyserRef.current = analyser;
          vadBufRef.current = new Uint8Array(analyser.fftSize);
          vadModeRef.current = true;
          if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
          vadIntervalRef.current = setInterval(vadTick, VAD_INTERVAL_MS);
        } else {
          vadModeRef.current = false;
        }
      } catch {
        vadModeRef.current = false; // degrade to tap-to-talk
      }

      armListen();
    } catch {
      streamRef.current?.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* noop */ } });
      streamRef.current = null;
      runningRef.current = false;
      go('error'); setError('mic');
    }
  }, [armListen, go, stopGraph, vadTick]);
  const bootSessionRef = useRef<(fromGesture: boolean) => Promise<void>>();
  bootSessionRef.current = bootSession;

  // ── VECTOR 2 — auto-start on mount (zero-touch). Best-effort: commits only if the AudioContext
  //    reaches 'running' (desktop/Android); on iOS the mount effect isn't a gesture so it falls
  //    back to a single "tap to start". Runs once. ──
  useEffect(() => { void bootSessionRef.current?.(false); }, []);

  // ── Pause the session and release the mic; a tap resumes (re-grants a fresh stream under that gesture) ──
  const pauseAndRelease = useCallback(() => {
    turnGenRef.current += 1;
    try { turnAbortRef.current?.abort(); } catch { /* noop */ } // cancel in-flight transcribe/chat
    try { ttsAbortRef.current?.abort(); } catch { /* noop */ }
    // Full graph stop INCLUDING the mic tracks — never leave the mic hot in the background.
    // Nulling streamRef makes resumeSession re-boot (re-grant) a fresh live stream under a gesture.
    stopGraph();
    runningRef.current = false;
    go('resume');
  }, [go, stopGraph]);

  // ── Pause VAD + release the mic when the tab is hidden; require a tap to resume ──
  useEffect(() => {
    const onHidden = () => {
      if (typeof document === 'undefined' || !document.hidden || !runningRef.current) return;
      pauseAndRelease();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [pauseAndRelease]);

  // ── Another feature needs the microphone now (lib/voice/micBus — Live voice opening). ⚠️ During an auth flicker
  //    ChatChrome can swap Live for this component and back; this one auto-boots on mount, and its hot capture made
  //    the returning Live call's getUserMedia fail with NotReadableError on Android. Release synchronously. ──
  useMicRelease(() => {
    if (!runningRef.current && !streamRef.current) return;
    pauseAndRelease();
  }, 'voice-conversation');

  const resumeSession = useCallback(async () => {
    setError(null);
    runningRef.current = true;
    const ctx = audioCtxRef.current;
    try { if (ctx && ctx.state === 'suspended') await ctx.resume(); } catch { /* noop */ }
    // Re-grant the mic if the track was released; otherwise re-arm on the live stream.
    if (!streamRef.current || streamRef.current.getTracks().every((tr) => tr.readyState === 'ended')) {
      void bootSession(true); // resume tap IS a gesture
      return;
    }
    if (vadModeRef.current && !vadIntervalRef.current) vadIntervalRef.current = setInterval(vadTick, VAD_INTERVAL_MS);
    armListen();
  }, [armListen, bootSession, vadTick]);

  // ── Orb tap: start / retry / resume / manual endpoint ──
  const onMicTap = useCallback(() => {
    const st = statusRef.current;
    if (st === 'off' || st === 'error') { void bootSession(true); return; } // real tap → gesture
    if (st === 'resume') { void resumeSession(); return; }
    if (st === 'listening') {
      // manual endpoint (works with or without VAD) — stop the recorder → commit/discard
      try { if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); } catch { /* noop */ }
    }
    // thinking / speaking → ignore (barge-in is handled by the VAD, not a tap)
  }, [bootSession, resumeSession]);

  // The dialog contract of the Live screen: focus moves in, Tab is trapped, Escape ends the call.
  const dialogRef = useDialogA11y<HTMLDivElement>(true, onClose);

  // The last exchange as the Live call's captions: what the user said, quieter; the answer, large.
  const captions = useMemo<LiveCaption[]>(() => {
    const out: LiveCaption[] = [];
    if (turn.said) out.push({ id: `u${turn.n}`, role: 'user', text: turn.said, final: true });
    if (turn.reply) out.push({ id: `a${turn.n}`, role: 'assistant', text: turn.reply, final: true });
    return out;
  }, [turn]);

  const orbState = voiceOrbState(status);
  const statusLabel = status === 'off' ? live.status.idle
    : status === 'resume' ? t.paused
      : status === 'error' ? t.stopped // never "connection dropped": a mic failure is not a network one
        : live.status[status];
  const quiet = liveQuietText(lang);
  const isError = status === 'error';
  // The orb is the mic control while listening (a tap ends the turn — with or without the VAD); before a start and
  // after a pause it answers a tap too, but the labelled button under the status line is the control for those.
  const orbIsControl = status === 'listening';
  const orbTappable = orbIsControl || status === 'off' || status === 'resume';
  const errorKind: VoiceError = error ?? 'failed';

  const screen = (
    <LiveCallFrame ref={dialogRef} ariaLabel={t.title} data-voice-status={status}>
      {!isError && <LiveBottomScrim />}

      <LiveTopBar label={live.live} live={!isError}>
        {!isError && (
          <LiveTopToggle label={live.captions} pressed={captionsOn} onClick={() => setCaptionsOn((v) => !v)} icon={<Subtitles size={20} aria-hidden />} />
        )}
      </LiveTopBar>

      {isError ? (
        <LiveErrorPanel
          icon={errorKind === 'mic' ? <MicOff size={26} /> : <AlertCircle size={26} />}
          headline={errorKind === 'mic' ? live.micHeadline : t.stopped}
          reason={errorKind === 'mic' ? t.micDenied : errorKind === 'rate_limited' ? t.rateLimited : t.noReply}
          locale={lang}
        >
          <button type="button" onClick={onMicTap} className={livePrimaryButtonClass(lang)}>
            <RotateCcw size={16} aria-hidden />
            {t.retry}
          </button>
        </LiveErrorPanel>
      ) : (
        <>
          <button
            type="button"
            onClick={onMicTap}
            disabled={!orbTappable}
            aria-label={orbIsControl ? t.endTurn : undefined}
            aria-hidden={orbIsControl ? undefined : true}
            tabIndex={orbIsControl ? undefined : -1}
            data-testid="voice-orb"
            className="relative z-10 mb-6 touch-manipulation rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:cursor-default"
          >
            <LiveOrb state={orbState} getLevels={getLevels} size={208} label={statusLabel} backdrop />
          </button>

          <LiveStatusLine state={orbState} muted={muted} getLevels={getLevels} label={statusLabel} locale={lang} />

          {(status === 'off' || status === 'resume') && (
            <button type="button" onClick={onMicTap} data-testid="voice-start" className={`relative z-10 mt-4 ${livePrimaryButtonClass(lang)}`}>
              {status === 'off' ? <Mic size={18} aria-hidden /> : <RotateCcw size={18} aria-hidden />}
              {status === 'off' ? t.tapToStart : t.tapResume}
            </button>
          )}

          {/* Until the first turn: how hands-free works (the VAD hears the end of a sentence). */}
          {status === 'listening' && vadModeRef.current && !turn.said && (
            <p className={`relative z-10 mt-3 max-w-xs px-6 text-center ${quiet} leading-[1.6] text-app-muted`}>{t.hint}</p>
          )}

          {captionsOn && (
            <LiveCaptions captions={captions} locale={lang} className="relative z-10 mt-6 min-h-[5.5rem]" />
          )}
        </>
      )}

      {/* The Live call's row: Mute · End (this engine has no camera and one voice). Only End on the error screen. */}
      <LiveControlRow>
        {!isError && (
          <LiveControl
            label={live.muteShort}
            ariaLabel={live.mute}
            icon={muted ? <MicOff size={22} aria-hidden /> : <Mic size={22} aria-hidden />}
            onClick={toggleMute}
            pressed={muted}
            locale={lang}
            testId="voice-mute"
          />
        )}
        <LiveControl
          label={live.endShort}
          ariaLabel={live.end}
          icon={<PhoneOff size={22} aria-hidden />}
          onClick={onClose}
          tone="danger"
          locale={lang}
          testId="voice-end"
        />
      </LiveControlRow>
    </LiveCallFrame>
  );

  // ChatChrome loads this screen with ssr:false, so document exists; the guard keeps a server render harmless.
  return typeof document === 'undefined' ? screen : createPortal(screen, document.body);
}

export default VoiceConversation;
