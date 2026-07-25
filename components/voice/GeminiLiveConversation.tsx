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
import { Camera, CameraOff, Mic, MicOff, PhoneOff, SwitchCamera } from 'lucide-react';

import { isEnabledByDefault } from '@/lib/env/flag';
import { GeminiLiveSession, GEMINI_LIVE_VOICES } from '@/lib/voice/geminiLive';
import { encodeMicChunk, decodePlaybackChunk } from '@/lib/voice/pcm';
import { liveVoicePersona, normalizeVoiceLocale } from '@/lib/voice/voicePrompt';
import { platformKnowledge } from '@/lib/chat/platformContext';

// Native Gemini Live is the DEFAULT voice now (live-validated). Two independent kill-switches revert to
// the ElevenLabs VoiceConversation: the CLIENT build-time flag NEXT_PUBLIC_GEMINI_LIVE_ENABLED (skips
// mounting this component entirely) and the SERVER flag GEMINI_LIVE_ENABLED (503s the token mint → the
// onUnavailable prop lets the parent fall back at RUNTIME, no client redeploy needed). Either set falsy
// ('0'|'false'|'no'|'off') routes voice back to ElevenLabs.
export const geminiLiveEnabled = (): boolean => isEnabledByDefault(process.env.NEXT_PUBLIC_GEMINI_LIVE_ENABLED);

type Status = 'connecting' | 'live' | 'speaking' | 'error' | 'closed';

interface Props {
  userId: string;
  locale?: 'ka' | 'en' | 'ru';
  /** Override the spoken persona; defaults to the locale's voicePersona (Georgian-first brevity). */
  systemInstruction?: string;
  /** Which built-in Google voice to speak with. Defaults to female (Aoede); male is Charon. */
  gender?: 'female' | 'male';
  onClose: () => void;
  /**
   * Called when the Live token mint reports the server has disabled Gemini Live (503) — lets the parent
   * fall back to the ElevenLabs voice stack at RUNTIME. This is what makes the server GEMINI_LIVE_ENABLED
   * kill-switch actually revert to ElevenLabs (the client NEXT_PUBLIC_ flag is build-time only).
   */
  onUnavailable?: () => void;
}

const PLAYBACK_RATE = 24000; // Gemini Live output PCM sample rate
const FRAME_FPS = 1.5;       // camera frames/sec streamed up (bandwidth-friendly)

export default function GeminiLiveConversation({ userId, locale = 'ka', systemInstruction, gender = 'female', onClose, onUnavailable }: Props) {
  const [status, setStatus] = useState<Status>('connecting');
  const [err, setErr] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOn, setCamOn] = useState(false);
  // The user's enrolled LIVE-AVATAR poster (avatar/enroll → profiles.core_avatar_id). When present it fills
  // the session backdrop instead of the bare waveform and animates with the conversation (idle "breathing",
  // an active "speaking" pulse while status==='speaking'), so the Live screen is the USER's avatar — not an
  // empty space. The live camera still overrides it when the user turns the camera on.
  const [avatarPoster, setAvatarPoster] = useState<string | null>(null);
  // Camera direction — defaults to the BACK (environment) camera per mobile convention (show Gemini what
  // you see); the flip button switches to the front (user/selfie) camera. facingRef mirrors it for the
  // async getUserMedia constraint. Desktops without a rear camera just get the default device.
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const facingRef = useRef<'user' | 'environment'>('environment');
  // Which built-in Google voice speaks. Toggling it re-runs the connect effect → a clean reconnect with
  // the new voice (a fresh session; deliberate voice switches happen at the start, not mid-sentence).
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>(gender);

  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Analyser on the PLAYBACK path — gives the real-time amplitude of the AVATAR's spoken audio, which drives
  // the portrait's audio-reactive movement (so the face visibly talks/moves to the voice, not a fixed pulse).
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);
  const avatarWrapRef = useRef<HTMLDivElement | null>(null); // the portrait element the rAF loop transforms
  const avatarAmpRef = useRef(0); // smoothed 0..1 amplitude, eased frame-to-frame to avoid jitter
  const micMutedRef = useRef(false);
  const playCursorRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const vizRafRef = useRef<number | null>(null);
  const frameTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vizCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const closedRef = useRef(false); // set on teardown — guards async getUserMedia continuations
  const camWantedRef = useRef(false); // user's LAST camera intent — a stop during a flip/open await must win

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
    // Route through the playback analyser (→ destination) so the avatar can react to the spoken amplitude;
    // fall back to a direct connect if the analyser isn't up yet (audio must always play).
    src.connect(playbackAnalyserRef.current ?? ctx.destination);
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

  // 0..1 loudness via TIME-DOMAIN RMS — far more responsive to speech than a frequency-bin average (which is
  // diluted by the many empty high-frequency bins), so the avatar reacts crisply to each syllable.
  const timeDomainRms = useCallback((analyser: AnalyserNode | null): number => {
    if (!analyser) return 0;
    const n = analyser.fftSize;
    const data = new Uint8Array(n);
    analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < n; i++) { const v = ((data[i] ?? 128) - 128) / 128; sum += v * v; }
    return Math.sqrt(sum / n);
  }, []);

  // ── Frequency-bar visualiser + AUDIO-REACTIVE avatar drive (single rAF loop, runs the whole session). ──
  const drawViz = useCallback((ts?: number) => {
    // 1) Frequency bars (mic) — the fallback visual when no avatar/camera is shown.
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

    // 2) Audio-reactive avatar — the portrait must VISIBLY move & "talk" whenever the AI speaks. Movement is
    //    the whole point of a live avatar, so (unlike decorative effects) it runs even under
    //    prefers-reduced-motion — only the sonar rings honour that. `activeSourcesRef` is the ground truth
    //    that audio is PLAYING (the avatar is talking); a rhythmic mouth-flap FLOOR guarantees clearly visible
    //    talking even if the analyser momentarily reads low, with the real RMS amplitude riding on top.
    const wrap = avatarWrapRef.current;
    if (wrap) {
      const t = ts ?? 0;
      const speaking = activeSourcesRef.current.length > 0; // audio queued/playing → the avatar is talking NOW
      const rms = timeDomainRms(playbackAnalyserRef.current);       // the avatar's own voice (primary)
      const micRms = timeDomainRms(analyserRef.current);            // the user's voice (secondary stir)
      const amp = Math.min(1, Math.max(rms * 3.4, micRms * 1.2));
      // While talking, a ~2 Hz mouth open/close is GUARANTEED (0.3..0.9) even if the analyser reads low, with
      // the real amplitude riding on top so louder syllables open wider. Silent → settle toward 0 (idle only).
      const flap = 0.5 + 0.5 * Math.sin(t / 95);                    // 0..1 at ~2 Hz
      const talk = speaking ? 0.3 + 0.6 * flap : 0;                 // guaranteed strong talking oscillation
      const level = Math.max(amp, talk);
      const eased = avatarAmpRef.current + (level - avatarAmpRef.current) * 0.35;
      avatarAmpRef.current = eased;
      const breathe = Math.sin(t / 1400) * 0.012;                   // gentle idle life so it never looks frozen
      const sx = 1 + breathe + eased * 0.07;
      const sy = 1 + breathe + eased * 0.15;                        // taller scale → clear jaw-drop / mouth-open (transform-origin 50% 34%)
      const nod = speaking ? Math.sin(t / 260) * 3 : 0;             // subtle head-nod while talking
      const bob = -eased * 7 + nod;
      wrap.style.transform = `translateZ(0) translateY(${bob.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    }
    vizRafRef.current = requestAnimationFrame(drawViz);
  }, [timeDomainRms]);

  // ── Camera: stream low-fps JPEG frames up while the camera is on. ──
  const startCamera = useCallback(async () => {
    camWantedRef.current = true; // record intent NOW so a stop during the getUserMedia await can override it
    // Ask for the chosen direction; if the device rejects an exact facingMode (many laptops), retry with
    // no constraint so the camera still opens instead of silently failing.
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingRef.current, width: 640, height: 480 } });
    } catch {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } }); } catch { setCamOn(false); return; }
    }
    // Drop this stream if we've torn down during the permission prompt, a concurrent double-tap already
    // acquired one, OR the user turned the camera OFF while this getUserMedia was in flight (e.g. tapped
    // camera-off mid-flip) — otherwise the just-opened stream + its frame interval leak as a hot camera.
    if (closedRef.current || camStreamRef.current || !camWantedRef.current) { stream.getTracks().forEach((tk) => tk.stop()); return; }
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
  }, []);

  const stopCamera = useCallback(() => {
    camWantedRef.current = false; // explicit user off — beats any startCamera continuation still awaiting
    if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
    camStreamRef.current?.getTracks().forEach((tk) => tk.stop());
    camStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
  }, []);

  const toggleCamera = useCallback(() => { if (camOn) stopCamera(); else void startCamera(); }, [camOn, startCamera, stopCamera]);

  // Flip between the back (environment) and front (user) camera — stop the current stream, switch the
  // facing, and re-open. Only meaningful while the camera is on.
  const flipCamera = useCallback(async () => {
    if (!camOn) return;
    const next = facingRef.current === 'environment' ? 'user' : 'environment';
    facingRef.current = next; setFacing(next);
    if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
    camStreamRef.current?.getTracks().forEach((tk) => tk.stop());
    camStreamRef.current = null;
    await startCamera();
  }, [camOn, startCamera]);

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
    // Release the camera AND reset its UI/DOM state (mirror stopCamera) — otherwise a reconnect
    // (e.g. a voice-gender swap re-runs the connect effect) leaves camOn=true showing a FROZEN last
    // frame while frameTimerRef is gone and no frames reach Gemini. An honest "camera off" lets the
    // user re-enable it. setState-on-unmount is a harmless no-op.
    camWantedRef.current = false;
    camStreamRef.current?.getTracks().forEach((tk) => tk.stop());
    camStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
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
        // LATENCY: open the AudioContext + acquire the mic IMMEDIATELY, in PARALLEL with the token mint —
        // opening the modal is the user gesture that authorizes both. Startup then costs max(token, mic)
        // instead of token + mic, so the mic is hot the instant the token lands and first speech isn't lost.
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        ctxRef.current = ctx;
        // Playback analyser: created up front and wired straight to the speakers, so enqueueAudio can route the
        // avatar's spoken audio THROUGH it and the rAF loop can read its amplitude to move the portrait.
        const playbackAnalyser = ctx.createAnalyser();
        playbackAnalyser.fftSize = 256;
        playbackAnalyser.smoothingTimeConstant = 0.8;
        playbackAnalyser.connect(ctx.destination);
        playbackAnalyserRef.current = playbackAnalyser;
        // Start the avatar/viz rAF loop NOW (not after the token round-trip) so the portrait keeps breathing
        // during connecting and, on a voice-swap remount, resumes almost instantly instead of freezing for the
        // ~1-3s mint. The loop no-ops safely while the mic analyser / avatar element don't exist yet.
        if (vizRafRef.current) cancelAnimationFrame(vizRafRef.current);
        vizRafRef.current = requestAnimationFrame(drawViz);
        const ctxReady = ctx.resume().catch(() => {});
        const micReady = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        micReady.catch(() => {}); // pre-attach so an early token failure can't surface an unhandled rejection
        const releaseMic = () => { void micReady.then((s) => s.getTracks().forEach((tk) => tk.stop())).catch(() => {}); };

        const res = await fetch('/api/voice/live', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ userId }),
        });
        const j = (await res.json().catch(() => ({}))) as { token?: string; model?: string; error?: string };
        if (!res.ok || !j.token) {
          releaseMic();
          // Live is unavailable server-side (503: kill-switch off, key missing, or the mint failed).
          // Hand back to the ElevenLabs voice stack at RUNTIME instead of dead-ending on an error screen —
          // this is what makes the server GEMINI_LIVE_ENABLED kill-switch honestly revert to ElevenLabs.
          if (res.status === 503 && onUnavailable) { if (!cancelled) onUnavailable(); return; }
          if (!cancelled) { setErr(j.error || `HTTP ${res.status}`); setStatus('error'); }
          return;
        }
        if (cancelled) { releaseMic(); return; }

        await ctxReady;
        const micStream = await micReady;
        if (cancelled) { micStream.getTracks().forEach((tk) => tk.stop()); return; }
        micStreamRef.current = micStream;

        const source = ctx.createMediaStreamSource(micStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        source.connect(analyser);

        // Seed the session with the spoken persona + the REAL current date (evaluated now, at session
        // start, so it is always today) and select the built-in native-audio voice for this gender.
        const loc = normalizeVoiceLocale(locale);
        const persona = systemInstruction ?? liveVoicePersona(loc);
        const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        // Give the voice model the platform knowledge (Issue: voice mode was context-blind about myavatar.ge)
        // so it can answer what the platform is + how generation works + name the right engine.
        const datedInstruction = `${persona}\n\n${platformKnowledge(loc)}\nToday's date is ${today}.`;

        const session = new GeminiLiveSession(
          { token: j.token, model: j.model, systemInstruction: datedInstruction, voiceName: GEMINI_LIVE_VOICES[voiceGender], responseModalities: ['AUDIO'] },
          {
            onSetupComplete: () => { if (!cancelled) setStatus('live'); },
            onAudio: (b64) => enqueueAudio(b64),
            onInterrupted: () => flushPlayback(),
            // A server-initiated close/error on the CURRENT session must RELEASE the mic/camera/AudioContext,
            // not just flip the label — otherwise the microphone stays hot after the socket drops.
            // But GATE teardown() on `cancelled`: after a voice-gender swap the OLD socket's close event
            // fires a MACROTASK later, by which point the new effect run has already re-pointed sessionRef/
            // ctxRef at the NEW session. Running teardown() from that stale closure would close the NEW
            // AudioContext (→ InvalidStateError on createMediaStreamSource → dead "error" screen) or kill the
            // fresh mic mid-call. `cancelled` is false only for the live effect run, so a genuine close of the
            // ACTIVE session still releases everything; a superseded session's delayed close is ignored
            // (its resources were already freed by that run's cleanup teardown()).
            onError: (m) => { if (cancelled) return; teardown(); setErr(m); setStatus('error'); },
            onClose: () => { if (cancelled) return; teardown(); setStatus('closed'); },
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
        // (the viz/avatar rAF loop was already started right after the AudioContext opened, above)
      } catch (e) {
        if (!cancelled) { setErr(e instanceof Error ? e.message : 'init failed'); setStatus('error'); }
      }
    })();
    return () => { cancelled = true; teardown(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, voiceGender]);

  // Load the enrolled avatar poster so the Live screen shows the USER (not a blank orb). Best-effort:
  // any miss (no enrolled avatar, guest, network) falls back to the waveform. Independent of the socket
  // lifecycle, so a voice-swap reconnect never re-fetches or flickers the avatar.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/avatar/core', { credentials: 'include' });
        if (!r.ok) return;
        const j = (await r.json().catch(() => ({}))) as { data?: { poster_url?: string | null; status?: string } };
        if (alive && j?.data?.poster_url && j.data.status === 'ready') setAvatarPoster(j.data.poster_url);
      } catch { /* fail-open — waveform fallback */ }
    })();
    return () => { alive = false; };
  }, [userId]);

  const label = status === 'connecting' ? t.connecting : status === 'speaking' ? t.speaking : status === 'closed' ? t.closed : t.live;
  const speaking = status === 'speaking';
  const showAvatar = !!avatarPoster && !camOn;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-app-bg/95 backdrop-blur-md ag-no-drag" role="dialog" aria-label={t.title}>
      {/* FULL-SCREEN camera (like the Gemini app): when on, the video fills the whole screen behind the
          floating controls, with a scrim so the label stays readable. Off → hidden, and the waveform
          takes center stage instead. The frame-capture canvas is never displayed. */}
      <video ref={videoRef} playsInline muted
        className={camOn ? 'absolute inset-0 z-0 h-full w-full object-cover' : 'hidden'} />
      {camOn && <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />}
      <canvas ref={canvasRef} className="hidden" />

      {/* Audio-reactive avatar: the portrait's scale/bob/jaw-cue are driven every frame by the REAL voice
          amplitude in the rAF loop (drawViz) — genuine reactivity, not a fixed keyframe. Only the expanding
          sonar "speak" rings stay pure CSS (GPU transform + opacity). Reduced-motion → still portrait (the
          rAF loop leaves the transform at identity) and no rings. */}
      <style>{`
        @keyframes ag-ping { 0% { transform: scale(0.96) translateZ(0); opacity: 0.5; } 80% { opacity: 0; } 100% { transform: scale(1.42) translateZ(0); opacity: 0; } }
        .ag-ping { animation: ag-ping 1.6s cubic-bezier(0.2,0.6,0.35,1) infinite; will-change: transform, opacity; }
        .ag-ping-2 { animation-delay: 0.8s; }
        @media (prefers-reduced-motion: reduce) { .ag-ping { animation: none !important; } }
      `}</style>

      {/* FULL-SCREEN enrolled avatar (when the camera is off) — the user's own face fills the session,
          softly blurred as an ambient backdrop with the portrait centered and audio-reactive. */}
      {showAvatar && (
        <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarPoster!} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/25 to-black/85" />
          {/* The portrait is transformed every frame by the rAF loop (drawViz) from the REAL voice amplitude —
              so its scale/bob/jaw-cue track the spoken audio. No CSS keyframes here (a CSS `animation` would
              override the inline transform); the loop supplies both the idle breathing and the talking motion. */}
          <div ref={avatarWrapRef} className="relative" style={{ transformOrigin: '50% 34%', willChange: 'transform' }}>
            {/* soft static halo (warmth) — brighter while speaking; opacity transition is cheap (no layout). */}
            <div className={`absolute -inset-4 rounded-full bg-app-accent/25 blur-2xl transition-opacity duration-500 ${speaking ? 'opacity-100' : 'opacity-40'}`} />
            {/* sonar speaking rings — expand + fade behind the portrait, staggered. GPU transform+opacity only. */}
            {speaking && (
              <>
                {/* opacity-0 base so that under prefers-reduced-motion (animation disabled) the rings are
                    invisible instead of hard, solid circles; the ag-ping keyframe drives opacity when it runs. */}
                <div className="ag-ping pointer-events-none absolute inset-0 rounded-full border-2 border-app-accent/50 opacity-0" />
                <div className="ag-ping ag-ping-2 pointer-events-none absolute inset-0 rounded-full border-2 border-app-accent/40 opacity-0" />
              </>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarPoster!} alt="" className="relative z-10 h-[min(62vw,264px)] w-[min(62vw,264px)] rounded-full object-cover shadow-2xl ring-2 ring-white/25" />
          </div>
        </div>
      )}

      <span className="relative z-10 mb-6 text-[12px] font-semibold uppercase tracking-wider text-app-muted">{t.title}</span>

      {/* Frequency waveform — hidden while the full-screen camera OR the enrolled avatar is showing. */}
      <canvas ref={vizCanvasRef} width={320} height={120} className={`relative z-10 mb-6 w-[min(80vw,320px)] ${camOn || showAvatar ? 'hidden' : ''}`} />

      <span className="relative z-10 mb-1 text-[14px] font-medium text-app-text">{label}</span>
      {err && <span className="relative z-10 mb-2 max-w-xs px-6 text-center text-[12px] text-app-danger">{err}</span>}

      {/* Sticky premium control bar */}
      <div
        className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-3 border-t border-white/10 bg-black/40 px-5 py-4 backdrop-blur-xl"
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
        {/* Flip front/back camera — only while the camera is on. */}
        {camOn && (
          <button type="button" onClick={() => void flipCamera()}
            aria-label={locale === 'en' ? 'Flip camera' : locale === 'ru' ? 'Перевернуть камеру' : 'კამერის შებრუნება'}
            title={facing === 'user' ? (locale === 'en' ? 'Front camera' : locale === 'ru' ? 'Фронтальная' : 'წინა კამერა') : (locale === 'en' ? 'Back camera' : locale === 'ru' ? 'Основная' : 'უკანა კამერა')}
            className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-white/[0.08] text-app-text transition hover:bg-white/[0.14]">
            <SwitchCamera size={20} />
          </button>
        )}
        {/* Voice selector — a clear segmented ♀ | ♂ toggle (Google Aoede vs Charon). Tapping the OTHER gender
            switches + reconnects with that voice; tapping the current one is a no-op (setState bails → no
            needless reconnect). Both options are always visible so it's obvious which voice is active. */}
        <div role="group" aria-label={locale === 'en' ? 'Voice' : locale === 'ru' ? 'Голос' : 'ხმა'}
          className="flex h-12 items-center gap-0.5 rounded-full bg-white/[0.08] p-1">
          <button type="button" aria-pressed={voiceGender === 'female'} onClick={() => setVoiceGender('female')}
            aria-label={locale === 'en' ? 'Female voice' : locale === 'ru' ? 'Женский голос' : 'ქალის ხმა'}
            className={`flex h-9 w-9 touch-manipulation items-center justify-center rounded-full text-[19px] font-bold transition ${voiceGender === 'female' ? 'bg-pink-400/25 text-pink-200 shadow-[0_0_0_1px_rgba(244,114,182,0.45)]' : 'text-app-muted hover:text-app-text'}`}>
            ♀
          </button>
          <button type="button" aria-pressed={voiceGender === 'male'} onClick={() => setVoiceGender('male')}
            aria-label={locale === 'en' ? 'Male voice' : locale === 'ru' ? 'Мужской голос' : 'კაცის ხმა'}
            className={`flex h-9 w-9 touch-manipulation items-center justify-center rounded-full text-[19px] font-bold transition ${voiceGender === 'male' ? 'bg-sky-400/25 text-sky-200 shadow-[0_0_0_1px_rgba(56,189,248,0.45)]' : 'text-app-muted hover:text-app-text'}`}>
            ♂
          </button>
        </div>
        <button type="button" onClick={endCall} aria-label="end call"
          className="flex h-14 w-14 touch-manipulation items-center justify-center rounded-full bg-app-danger text-white shadow-lg transition hover:brightness-110">
          <PhoneOff size={22} />
        </button>
      </div>
    </div>
  );
}
