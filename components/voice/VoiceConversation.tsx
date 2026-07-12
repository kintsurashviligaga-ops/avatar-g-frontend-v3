'use client';

/**
 * VoiceConversation — continuous, hands-free, full-duplex-style voice node (Phase 10).
 *
 * Tap ONCE to start a live session; after that it listens continuously, auto-detects when you
 * stop speaking (VAD), replies out loud, and immediately listens again — hands-free multi-turn
 * like Gemini Live / GPT-4o Voice. Talk OVER the reply to interrupt it (barge-in). Georgian,
 * English and Russian all work (the routes own the language; VAD is language-agnostic).
 *
 * Pipeline (unchanged REST contract — every leg fail-open + timeout-guarded):
 *   mic → VAD endpoint → /api/voice/transcribe → /api/voice/chat → /api/elevenlabs/tts (chunked).
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
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Mic, AlertCircle, RotateCcw } from 'lucide-react';
import { chunkForTts } from '@/lib/audio/ttsChunks';
import { smoothBar, orbBarColor, rgba, type OrbState } from '@/lib/voice/orbViz';
import {
  DEFAULT_VAD_CONFIG,
  bargeConfig,
  createVadState,
  stepVad,
  shouldCommit,
  extForMime,
  type VadState,
} from '@/lib/voice/vad';

type Lang = 'ka' | 'en' | 'ru';
type Status = 'connecting' | 'off' | 'listening' | 'thinking' | 'speaking' | 'resume' | 'error';
interface Turn { role: 'user' | 'assistant'; content: string }

const COPY: Record<Lang, {
  title: string; connecting: string; tapToStart: string; listening: string; thinking: string; speaking: string;
  micDenied: string; retry: string; rateLimited: string; tapResume: string; you: string; assistant: string; hint: string;
}> = {
  ka: { title: 'ხმოვანი საუბარი', connecting: 'ვუკავშირდები…', tapToStart: 'დააჭირე დასაწყებად', listening: 'გისმენ…', thinking: 'ვფიქრობ…', speaking: 'ვპასუხობ…', micDenied: 'მიკროფონზე წვდომა ვერ მოხერხდა', retry: 'სცადე თავიდან', rateLimited: 'ცოტა ხანს დაისვენე და სცადე თავიდან', tapResume: 'დააჭირე გასაგრძელებლად', you: 'შენ', assistant: 'MyAvatar', hint: 'ილაპარაკე თავისუფლად — მე თვითონ მივხვდები როდის დაასრულებ' },
  en: { title: 'Voice chat', connecting: 'Connecting…', tapToStart: 'Tap to start', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…', micDenied: "Couldn't access the microphone", retry: 'Try again', rateLimited: 'Slow down a moment — tap to retry', tapResume: 'Tap to resume', you: 'You', assistant: 'MyAvatar', hint: 'Just talk — I detect when you finish' },
  ru: { title: 'Голосовой чат', connecting: 'Подключаюсь…', tapToStart: 'Нажмите, чтобы начать', listening: 'Слушаю…', thinking: 'Думаю…', speaking: 'Отвечаю…', micDenied: 'Нет доступа к микрофону', retry: 'Ещё раз', rateLimited: 'Слишком часто — нажмите, чтобы повторить', tapResume: 'Нажмите, чтобы продолжить', you: 'Вы', assistant: 'MyAvatar', hint: 'Просто говорите — я пойму, когда вы закончите' },
};

const VAD_INTERVAL_MS = 50;
const BARGE_GRACE_MS = 300;
const VIZ_BARS = 44; // radial equalizer bar count
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

export function VoiceConversation({ locale = 'ka', onClose }: { locale?: string; onClose: () => void }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];
  const [status, setStatus] = useState<Status>('connecting');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

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
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null); // taps the TTS output for the orb viz
  const ttsAbortRef = useRef<AbortController | null>(null);
  const turnAbortRef = useRef<AbortController | null>(null);

  // ── Real-time orb equalizer (canvas driven by whichever analyser is live) ──
  const vizCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const vizRafRef = useRef<number>(0);
  const vizBarsRef = useRef<Float32Array>(new Float32Array(VIZ_BARS));
  const vizFreqRef = useRef<Uint8Array | null>(null);

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

  useEffect(() => () => { mountedRef.current = false; teardown(); }, [teardown]);

  // ── The living orb — a radial Web-Audio equalizer. One rAF loop drives a canvas from whichever
  //    AnalyserNode is live: the MIC while listening, the TTS output while speaking, and a gentle
  //    "breathing" idle while thinking/connecting. Replaces the old static spinner + speaker glyph. ──
  useEffect(() => {
    const draw = () => {
      vizRafRef.current = requestAnimationFrame(draw);
      const canvas = vizCanvasRef.current;
      if (!canvas) return;
      const c = canvas.getContext('2d');
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = 96;
      if (canvas.width !== size * dpr) { canvas.width = size * dpr; canvas.height = size * dpr; }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = size / 2, cy = size / 2;

      const st = statusRef.current;
      const listening = st === 'listening';
      const speaking = st === 'speaking';
      // Map the conversation status → the visual state that colours the orb.
      const orbState: OrbState = listening ? 'listening' : speaking ? 'speaking' : st === 'error' ? 'error' : st === 'off' ? 'idle' : 'processing';
      const analyser = listening ? analyserRef.current : speaking ? playbackAnalyserRef.current : null;
      const bars = vizBarsRef.current;
      const N = bars.length;
      let overall = 0;

      if (analyser) {
        const bins = analyser.frequencyBinCount;
        let buf = vizFreqRef.current;
        if (!buf || buf.length !== bins) { buf = new Uint8Array(bins); vizFreqRef.current = buf; }
        analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
        const usable = Math.max(1, Math.floor(bins * 0.66)); // voice energy lives in the lower-mid bins
        for (let i = 0; i < N; i++) {
          const target = (buf[Math.floor((i / N) * usable)] ?? 0) / 255;
          // fast attack, slow decay → bars pop on sound and settle smoothly (kills the raw-FFT flicker)
          const next = smoothBar(bars[i] ?? 0, target, 0.5, 0.14);
          bars[i] = next;
          overall += next;
        }
        overall /= N;
      } else {
        const now = performance.now();
        for (let i = 0; i < N; i++) {
          const target = 0.09 + 0.075 * (0.5 + 0.5 * Math.sin(now / 620 + i * 0.5)); // gentle idle breathing
          const next = smoothBar(bars[i] ?? 0, target, 0.14, 0.14);
          bars[i] = next;
          overall += next;
        }
        overall /= N;
      }

      // The rich purple→blue→pink gradient FLOWS around the ring over time for a living, premium feel.
      const shift = (performance.now() / 5200) % 1;
      c.clearRect(0, 0, size, size);
      // ambient glow that swells with loudness, tinted by the flowing palette
      const glowColor = orbBarColor(0.2, shift, overall, orbState);
      const glow = c.createRadialGradient(cx, cy, 5, cx, cy, 47);
      glow.addColorStop(0, rgba(glowColor, 0.20 + overall * 0.5));
      glow.addColorStop(1, rgba(glowColor, 0));
      c.fillStyle = glow;
      c.beginPath(); c.arc(cx, cy, 47, 0, Math.PI * 2); c.fill();
      // radial equalizer bars — each bar draws its own colour from the flowing multi-colour gradient
      const baseR = 15;
      c.lineWidth = 2.4; c.lineCap = 'round';
      for (let i = 0; i < N; i++) {
        const bv = bars[i] ?? 0;
        const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
        const len = 3 + bv * 22;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        c.strokeStyle = rgba(orbBarColor(i / N, shift, bv, orbState), 0.34 + bv * 0.58);
        c.beginPath();
        c.moveTo(cx + ca * baseR, cy + sa * baseR);
        c.lineTo(cx + ca * (baseR + len), cy + sa * (baseR + len));
        c.stroke();
      }
      // pulsing core
      c.fillStyle = rgba(orbBarColor(0.5, shift, overall, orbState), 0.92);
      c.beginPath(); c.arc(cx, cy, 6.5 + overall * 6, 0, Math.PI * 2); c.fill();
    };

    vizRafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(vizRafRef.current);
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
      // Route src → AnalyserNode → destination so the orb equalizer can pulse to the assistant's
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
      go('thinking'); setError('');

      // 1) STT — label the upload with the container's real extension (iOS records mp4, not webm).
      const fd = new FormData();
      fd.append('audio', audio, `speech.${extForMime(audio.type)}`);
      fd.append('language', lang === 'en' ? 'en-US' : lang === 'ru' ? 'ru-RU' : 'ka-GE');
      const sr = await fetch('/api/voice/transcribe', { method: 'POST', body: fd, credentials: 'include', signal: turnSignal(30_000, turnSig) }).catch(() => null);
      if (stale()) return;
      if (sr && sr.status === 429) { go('error'); setError(t.rateLimited); return; } // back off, don't hammer the throttled route
      const sj = sr ? ((await sr.json().catch(() => null)) as { text?: string } | null) : null;
      const said = (sj?.text || '').trim();
      if (stale()) return;
      if (!said) { armListenRef.current?.(); return; } // heard nothing → listen again (no chat/tts spend)
      setTranscript(said); setReply('');
      historyRef.current = [...historyRef.current, { role: 'user' as const, content: said }].slice(-12);

      // 2) LLM reply — STREAMED as newline-delimited JSON sentences (PHASE 33): we speak each sentence the
      //    instant it lands instead of waiting for the whole reply, so the first audio starts far sooner.
      const cr = await fetch('/api/voice/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ text: said, locale: lang, history: historyRef.current }),
        signal: turnSignal(25_000, turnSig),
      }).catch(() => null);
      if (stale()) return;
      if (cr && cr.status === 401) { go('error'); setError(t.retry); return; } // signed out → stop, don't loop
      if (cr && cr.status === 429) { go('error'); setError(t.rateLimited); return; } // rate-limited → stop, don't re-pay STT in a loop
      if (!cr || !cr.ok || !cr.body) { armListenRef.current?.(); return; } // fail-open: don't hang, just listen again

      // Drain the NDJSON stream into a queue of TTS-ready chunks, refilled as sentences arrive.
      const reader = cr.body.getReader();
      const dec = new TextDecoder();
      let sbuf = '';
      const pending: string[] = [];
      let full = '';
      let streamEnded = false;
      const pumpLines = () => {
        let nl: number;
        while ((nl = sbuf.indexOf('\n')) >= 0) {
          const raw = sbuf.slice(0, nl).trim(); sbuf = sbuf.slice(nl + 1);
          if (!raw) continue;
          try {
            const s = ((JSON.parse(raw) as { s?: string })?.s || '').trim();
            if (s) { full = full ? `${full} ${s}` : s; for (const ch of chunkForTts(s)) pending.push(ch); }
          } catch { /* skip a malformed line */ }
        }
        if (full) setReply(full); // progressive transcript as the reply streams in
      };
      // Pull the next TTS chunk; reads more of the stream when the local queue is empty. null = reply done.
      const nextChunk = async (): Promise<string | null> => {
        while (pending.length === 0 && !streamEnded) {
          const { done, value } = await reader.read();
          if (done) { streamEnded = true; if (sbuf.trim()) { sbuf += '\n'; pumpLines(); } break; }
          sbuf += dec.decode(value, { stream: true });
          pumpLines();
        }
        return pending.shift() ?? null;
      };
      const cancelStream = () => { try { void reader.cancel(); } catch { /* noop */ } };

      // 3) TTS → speak each streamed chunk, prefetching the next synth while the current plays.
      go('speaking');
      vadStateRef.current = createVadState(vadStateRef.current.floor); // fresh state for barge detection
      const synth = async (chunk: string): Promise<AudioBuffer | null> => {
        try {
          const res = await fetch('/api/elevenlabs/tts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ text: chunk, locale: lang }), signal: turnSignal(20_000, ttsSig),
          });
          if (!res.ok) return null;
          const bytes = await res.arrayBuffer();
          const ctx = audioCtxRef.current;
          if (!ctx || bytes.byteLength < 256) return null;
          return await ctx.decodeAudioData(bytes.slice(0)).catch(() => null);
        } catch { return null; }
      };
      let played = false;
      let cur = await nextChunk();
      if (stale()) { cancelStream(); return; }
      let synthP: Promise<AudioBuffer | null> = cur != null ? synth(cur) : Promise.resolve(null);
      while (cur != null) {
        const buf = await synthP;
        if (stale()) { cancelStream(); return; }
        cur = await nextChunk(); // the server has usually already streamed the next sentence by now
        if (stale()) { cancelStream(); return; }
        synthP = cur != null ? synth(cur) : Promise.resolve(null);
        if (!buf) continue; // a chunk failed → skip it, keep reading the rest
        played = true;
        await playBuffer(buf, myGen);
        if (stale()) { cancelStream(); return; } // barge/close bumped the generation → stop cleanly
      }
      if (stale()) return;
      if (full) historyRef.current = [...historyRef.current, { role: 'assistant' as const, content: full }].slice(-12);
      if (!full) { armListenRef.current?.(); return; } // empty reply → fail-open, listen again
      if (!played) { go('error'); setError(t.retry); return; } // every chunk failed → a real TTS miss
      armListenRef.current?.(); // hands-free: listen for the next turn
    } catch {
      if (!stale()) armListenRef.current?.(); // never strand the loop on an unexpected throw
    }
  }, [go, lang, playBuffer, t.rateLimited, t.retry]);
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
      go('error'); setError(t.micDenied);
    }
  }, [go, t.micDenied]);
  armListenRef.current = armListen;

  // ── Barge-in: the user talked over the reply → abort playback + capture the new utterance ──
  const bargeIn = useCallback(() => {
    if (statusRef.current !== 'speaking') return;
    turnGenRef.current += 1; // orphan the in-flight TTS loop
    try { ttsAbortRef.current?.abort(); } catch { /* noop */ }
    // Also abort the chat fetch — otherwise, if the orphaned loop is parked in reader.read() during a slow
    // inter-token gap, the stale NDJSON stream stays open until the server closes; aborting rejects the read
    // at once so the reader is torn down immediately (mirrors the visibilitychange teardown).
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
    setError('');
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
    if (!mountedRef.current) return;

    // 2) Auto-start only commits when the context is actually running (VAD will work hands-free).
    //    Otherwise show a one-tap affordance rather than grabbing the mic into a dead loop.
    if (!fromGesture && (!ctx || ctx.state !== 'running')) { go('off'); return; }

    // 3) Acquire the mic + build the graph + arm.
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      // The overlay can close (teardown) while the permission prompt is up; if the grant lands after
      // unmount, drop the stream instead of leaving a hot mic + graph behind.
      if (!mountedRef.current) { stream.getTracks().forEach((tr) => { try { tr.stop(); } catch { /* noop */ } }); return; }
      streamRef.current = stream;
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
      go('error'); setError(t.micDenied);
    }
  }, [armListen, go, stopGraph, t.micDenied, vadTick]);
  const bootSessionRef = useRef<(fromGesture: boolean) => Promise<void>>();
  bootSessionRef.current = bootSession;

  // ── VECTOR 2 — auto-start on mount (zero-touch). Best-effort: commits only if the AudioContext
  //    reaches 'running' (desktop/Android); on iOS the mount effect isn't a gesture so it falls
  //    back to a single "tap to start". Runs once. ──
  useEffect(() => { void bootSessionRef.current?.(false); }, []);

  // ── Pause VAD + release the mic when the tab is hidden; require a tap to resume ──
  useEffect(() => {
    const onHidden = () => {
      if (typeof document === 'undefined' || !document.hidden || !runningRef.current) return;
      turnGenRef.current += 1;
      try { turnAbortRef.current?.abort(); } catch { /* noop */ } // cancel in-flight transcribe/chat
      try { ttsAbortRef.current?.abort(); } catch { /* noop */ }
      // Full graph stop INCLUDING the mic tracks — never leave the mic hot in the background.
      // Nulling streamRef makes resumeSession re-boot (re-grant) a fresh live stream under a gesture.
      stopGraph();
      runningRef.current = false;
      go('resume');
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [go, stopGraph]);

  const resumeSession = useCallback(async () => {
    setError('');
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

  const label = status === 'connecting' ? t.connecting
    : status === 'listening' ? t.listening
      : status === 'thinking' ? t.thinking
        : status === 'speaking' ? t.speaking
          : status === 'resume' ? t.tapResume
            : status === 'error' ? (error || t.retry)
              : t.tapToStart;
  const busy = status === 'thinking' || status === 'connecting';
  // The reactive equalizer owns every "live audio" state; static glyphs remain only for tap actions.
  const showViz = status === 'connecting' || status === 'listening' || status === 'thinking' || status === 'speaking';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-app-bg/95 backdrop-blur-md ag-no-drag" role="dialog" aria-label={t.title}>
      <button type="button" onClick={onClose} aria-label="close" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-app-muted transition hover:bg-white/[0.12] hover:text-app-text" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <X size={18} />
      </button>

      <span className="mb-8 text-[12px] font-semibold uppercase tracking-wider text-app-muted">{t.title}</span>

      {/* Conversation echo */}
      <div className="mb-10 min-h-[84px] w-full max-w-md px-6 text-center">
        {transcript && <p className="mb-2 text-[13px] text-app-muted"><span className="font-semibold text-app-text/70">{t.you}:</span> {transcript}</p>}
        {reply && <p className="text-[15px] leading-relaxed text-app-text"><span className="font-semibold text-app-accent">{t.assistant}:</span> {reply}</p>}
        {error && <p className="mt-2 flex items-center justify-center gap-1.5 text-[12.5px] text-rose-400"><AlertCircle size={14} /> {error}</p>}
      </div>

      {/* Living orb — a real-time Web-Audio equalizer for every active-audio state; a tap glyph otherwise. */}
      <button
        type="button"
        onClick={onMicTap}
        disabled={busy}
        aria-label={label}
        className={`relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full transition-all disabled:cursor-default ${
          showViz
            ? (status === 'listening' ? 'bg-rose-500/[0.08] ring-1 ring-rose-500/25' : 'bg-app-accent/[0.08] ring-1 ring-app-accent/25')
            : status === 'resume' ? 'bg-app-elevated text-app-accent ring-1 ring-app-border/15 hover:scale-105'
              : 'bg-app-accent text-app-bg shadow-[0_10px_40px_-8px_rgba(0,210,255,0.55)] hover:scale-105'
        }`}
      >
        {showViz ? (
          <canvas ref={vizCanvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
        ) : status === 'resume' ? <RotateCcw size={28} />
          : <Mic size={30} />}
      </button>
      <span className="mt-5 text-[13.5px] font-medium text-app-muted">{label}</span>
      {status === 'listening' && vadModeRef.current && <span className="mt-2 max-w-xs px-6 text-center text-[11.5px] text-app-muted/70">{t.hint}</span>}
    </div>
  );
}

export default VoiceConversation;
