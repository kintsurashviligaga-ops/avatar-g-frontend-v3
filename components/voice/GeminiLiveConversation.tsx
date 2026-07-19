'use client';

/**
 * GeminiLiveConversation — full-screen browser-direct Gemini Multimodal Live modal (Track 1 + Track 3.2).
 *
 * Flow: POST /api/voice/live → ephemeral token → GeminiLiveSession opens a WS straight to Gemini →
 * mic Float32 is resampled to 16 kHz PCM and streamed up; optional camera frames stream up at low fps;
 * 24 kHz PCM comes back and plays gaplessly; a barge-in flushes the playback queue instantly.
 *
 * ADDITIVE + FEATURE-FLAGGED: renders only when NEXT_PUBLIC_GEMINI_LIVE_ENABLED === '1'. It never
 * touches the existing VAD/realtime voice components. The Live wire protocol needs live validation with
 * a paid key + real mic/camera before production use.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, Paperclip, PhoneOff } from 'lucide-react';

import { isTruthyFlag } from '@/lib/env/flag';
import { GeminiLiveSession } from '@/lib/voice/geminiLive';
import { encodeMicChunk, decodePlaybackChunk } from '@/lib/voice/pcm';

export const geminiLiveEnabled = (): boolean => isTruthyFlag(process.env.NEXT_PUBLIC_GEMINI_LIVE_ENABLED);

type Status = 'connecting' | 'live' | 'speaking' | 'error' | 'closed';

interface Props {
  userId: string;
  locale?: 'ka' | 'en' | 'ru';
  systemInstruction?: string;
  onClose: () => void;
}

const PLAYBACK_RATE = 24000; // Gemini Live output PCM sample rate
const FRAME_FPS = 1.5;       // camera frames/sec streamed up (bandwidth-friendly)

export default function GeminiLiveConversation({ userId, locale = 'ka', systemInstruction, onClose }: Props) {
  const [status, setStatus] = useState<Status>('connecting');
  const [err, setErr] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOn, setCamOn] = useState(false);

  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micMutedRef = useRef(false);
  const playCursorRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const vizRafRef = useRef<number | null>(null);
  const frameTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vizCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const closedRef = useRef(false); // set on teardown — guards async getUserMedia continuations

  const t = {
    title: locale === 'en' ? 'Live Conversation' : locale === 'ru' ? 'Живой разговор' : 'ცოცხალი საუბარი',
    connecting: locale === 'en' ? 'Connecting…' : locale === 'ru' ? 'Подключение…' : 'დაკავშირება…',
    live: locale === 'en' ? 'Listening' : locale === 'ru' ? 'Слушаю' : 'გისმენ',
    speaking: locale === 'en' ? 'Speaking…' : locale === 'ru' ? 'Говорю…' : 'ვსაუბრობ…',
    closed: locale === 'en' ? 'Call ended' : locale === 'ru' ? 'Звонок завершён' : 'ზარი დასრულდა',
  };

  // ── Playback: flush all scheduled audio immediately (barge-in / interruption). ──
  const flushPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) { try { src.stop(); } catch { /* noop */ } }
    activeSourcesRef.current = [];
    playCursorRef.current = 0;
  }, []);

  // ── Playback: schedule one decoded 24 kHz frame gaplessly on the audio clock. ──
  const enqueueAudio = useCallback((b64: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const samples = decodePlaybackChunk(b64);
    if (samples.length === 0) return;
    const buffer = ctx.createBuffer(1, samples.length, PLAYBACK_RATE);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, playCursorRef.current || ctx.currentTime);
    try { src.start(startAt); } catch { return; }
    playCursorRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(src);
    setStatus((s) => (s === 'live' ? 'speaking' : s));
    src.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((x) => x !== src);
      if (activeSourcesRef.current.length === 0) setStatus((s) => (s === 'speaking' ? 'live' : s));
    };
  }, []);

  // ── Frequency-bar visualiser (Web Audio). ──
  const drawViz = useCallback(() => {
    const canvas = vizCanvasRef.current;
    const analyser = analyserRef.current;
    if (canvas && analyser) {
      const cctx = canvas.getContext('2d');
      if (cctx) {
        const n = analyser.frequencyBinCount;
        const data = new Uint8Array(n);
        analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
        const w = canvas.width, h = canvas.height;
        cctx.clearRect(0, 0, w, h);
        const bars = 48;
        const step = Math.floor(n / bars) || 1;
        const bw = w / bars;
        for (let i = 0; i < bars; i++) {
          const v = (data[i * step] ?? 0) / 255;
          const bh = Math.max(2, v * h * 0.9);
          cctx.fillStyle = `rgba(120,170,255,${0.35 + v * 0.5})`;
          cctx.fillRect(i * bw + 1, (h - bh) / 2, bw - 2, bh);
        }
      }
    }
    vizRafRef.current = requestAnimationFrame(drawViz);
  }, []);

  // ── Camera: stream low-fps JPEG frames up while the camera is on. ──
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      // Drop this stream if we've torn down during the permission prompt OR a concurrent double-tap
      // already acquired one (else the earlier stream + its frame interval leak as a hot camera).
      if (closedRef.current || camStreamRef.current) { stream.getTracks().forEach((tk) => tk.stop()); return; }
      camStreamRef.current = stream;
      const video = videoRef.current;
      if (video) { video.srcObject = stream; await video.play().catch(() => {}); }
      const canvas = canvasRef.current;
      frameTimerRef.current = window.setInterval(() => {
        const v = videoRef.current, c = canvas;
        if (!v || !c || v.videoWidth === 0) return;
        c.width = v.videoWidth; c.height = v.videoHeight;
        const cc = c.getContext('2d');
        if (!cc) return;
        cc.drawImage(v, 0, 0, c.width, c.height);
        const dataUrl = c.toDataURL('image/jpeg', 0.6);
        const b64 = dataUrl.split(',')[1] || '';
        if (b64) sessionRef.current?.sendVideoFrame(b64, 'image/jpeg');
      }, Math.round(1000 / FRAME_FPS));
      setCamOn(true);
    } catch { setCamOn(false); }
  }, []);

  const stopCamera = useCallback(() => {
    if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
    camStreamRef.current?.getTracks().forEach((tk) => tk.stop());
    camStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
  }, []);

  const toggleCamera = useCallback(() => { if (camOn) stopCamera(); else void startCamera(); }, [camOn, startCamera, stopCamera]);

  const toggleMute = useCallback(() => {
    setMicMuted((m) => { const next = !m; micMutedRef.current = next; return next; });
  }, []);

  // ── Full teardown (End Call / unmount). ──
  const teardown = useCallback(() => {
    closedRef.current = true;
    if (vizRafRef.current) { cancelAnimationFrame(vizRafRef.current); vizRafRef.current = null; }
    if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
    flushPlayback();
    try { procRef.current?.disconnect(); } catch { /* noop */ }
    procRef.current = null;
    micStreamRef.current?.getTracks().forEach((tk) => tk.stop());
    micStreamRef.current = null;
    camStreamRef.current?.getTracks().forEach((tk) => tk.stop());
    camStreamRef.current = null;
    try { sessionRef.current?.close(); } catch { /* noop */ }
    sessionRef.current = null;
    try { void ctxRef.current?.close(); } catch { /* noop */ }
    ctxRef.current = null;
  }, [flushPlayback]);

  const endCall = useCallback(() => { teardown(); setStatus('closed'); onClose(); }, [teardown, onClose]);

  // ── Connect once on mount (opening the modal is the user gesture). ──
  useEffect(() => {
    let cancelled = false;
    closedRef.current = false; // re-arm after any prior teardown (a userId-change remount keeps us mounted)
    (async () => {
      try {
        const res = await fetch('/api/voice/live', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ userId }),
        });
        const j = (await res.json().catch(() => ({}))) as { token?: string; model?: string; error?: string };
        if (!res.ok || !j.token) { if (!cancelled) { setErr(j.error || `HTTP ${res.status}`); setStatus('error'); } return; }
        if (cancelled) return;

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        ctxRef.current = ctx;
        await ctx.resume().catch(() => {});

        const micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) { micStream.getTracks().forEach((tk) => tk.stop()); return; }
        micStreamRef.current = micStream;

        const source = ctx.createMediaStreamSource(micStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        source.connect(analyser);

        const session = new GeminiLiveSession(
          { token: j.token, model: j.model, systemInstruction, responseModalities: ['AUDIO'] },
          {
            onSetupComplete: () => { if (!cancelled) setStatus('live'); },
            onAudio: (b64) => enqueueAudio(b64),
            onInterrupted: () => flushPlayback(),
            // A server-initiated close/error must RELEASE the mic/camera/AudioContext, not just flip the
            // label — otherwise the microphone stays hot after the socket drops. teardown() is idempotent.
            onError: (m) => { teardown(); if (!cancelled) { setErr(m); setStatus('error'); } },
            onClose: () => { teardown(); if (!cancelled) setStatus('closed'); },
          },
        );
        sessionRef.current = session;
        session.connect();

        // Capture mic → resample → 16 kHz PCM → send. ScriptProcessor is deprecated but universally
        // available and avoids shipping a separate AudioWorklet module for this foundation.
        const proc = ctx.createScriptProcessor(4096, 1, 1);
        procRef.current = proc;
        proc.onaudioprocess = (e: AudioProcessingEvent) => {
          if (micMutedRef.current || !sessionRef.current?.isReady) return;
          const input = e.inputBuffer.getChannelData(0);
          const b64 = encodeMicChunk(Float32Array.from(input), ctx.sampleRate);
          if (b64) sessionRef.current.sendAudioChunk(b64);
        };
        source.connect(proc);
        proc.connect(ctx.destination); // required for onaudioprocess to fire in some browsers

        vizRafRef.current = requestAnimationFrame(drawViz);
      } catch (e) {
        if (!cancelled) { setErr(e instanceof Error ? e.message : 'init failed'); setStatus('error'); }
      }
    })();
    return () => { cancelled = true; teardown(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const label = status === 'connecting' ? t.connecting : status === 'speaking' ? t.speaking : status === 'closed' ? t.closed : t.live;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-app-bg/95 backdrop-blur-md ag-no-drag" role="dialog" aria-label={t.title}>
      <span className="mb-6 text-[12px] font-semibold uppercase tracking-wider text-app-muted">{t.title}</span>

      {/* Camera preview (hidden until on) + frame-capture canvas (never displayed) */}
      <video ref={videoRef} playsInline muted className={`mb-4 max-h-[38dvh] rounded-2xl ${camOn ? 'block' : 'hidden'}`} />
      <canvas ref={canvasRef} className="hidden" />

      {/* Frequency waveform */}
      <canvas ref={vizCanvasRef} width={320} height={120} className="mb-6 w-[min(80vw,320px)]" />

      <span className="mb-1 text-[14px] font-medium text-app-text">{label}</span>
      {err && <span className="mb-2 max-w-xs px-6 text-center text-[12px] text-app-danger">{err}</span>}

      {/* Sticky premium control bar */}
      <div
        className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-4 border-t border-white/10 bg-black/40 px-6 py-4 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        <button type="button" onClick={toggleMute} aria-label="mute"
          className={`flex h-12 w-12 touch-manipulation items-center justify-center rounded-full transition ${micMuted ? 'bg-app-danger/20 text-app-danger' : 'bg-white/[0.08] text-app-text hover:bg-white/[0.14]'}`}>
          {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button type="button" onClick={toggleCamera} aria-label="camera"
          className={`flex h-12 w-12 touch-manipulation items-center justify-center rounded-full transition ${camOn ? 'bg-app-accent/20 text-app-accent' : 'bg-white/[0.08] text-app-text hover:bg-white/[0.14]'}`}>
          {camOn ? <Camera size={20} /> : <CameraOff size={20} />}
        </button>
        <button type="button" aria-label="attach"
          className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-white/[0.08] text-app-text transition hover:bg-white/[0.14]">
          <Paperclip size={20} />
        </button>
        <button type="button" onClick={endCall} aria-label="end call"
          className="flex h-14 w-14 touch-manipulation items-center justify-center rounded-full bg-app-danger text-white shadow-lg transition hover:brightness-110">
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );
}
