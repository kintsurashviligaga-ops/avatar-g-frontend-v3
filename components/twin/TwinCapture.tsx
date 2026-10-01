'use client';

/**
 * TwinCapture — Digital Twin v0 capture (behind NEXT_PUBLIC_TWIN_ENABLED).
 *
 *   consent → front · left · right (oval guide, 3-2-1, downscaled to 1024 px in the browser) → voice (server-issued
 *   digits, a timer, a level meter, 12 s minimum, 30 s auto-stop) → review → save.
 *
 * Save PUTs every file straight to storage through the signed upload URLs /api/twin/upload-url handed out (no base64,
 * no 4.5 MB body cap), then /api/twin/commit validates and switches. On the desktop it also offers "Continue on phone"
 * (the same QR handoff as the Live Avatar) and, when a twin exists, deleting it. On the phone (`handoffToken`) the
 * link authorizes the capture; the phone has no session.
 *
 * ⚠️ CAMERA AND MIC ARE RELEASED WHENEVER THEY ARE NOT NEEDED: the camera runs on the photo steps only, the mic only
 * while recording, and both stop on close. Each start has a reentrancy guard and a post-await bail — a double tap must
 * never leave an orphaned stream holding a hot camera or mic (the defect class fixed in 6ef8642).
 * ⚠️ Nothing is uploaded before Save, and nothing is the twin before the commit answers ok.
 */
import { Camera, Check, Loader2, Lock, Mic, RotateCcw, ShieldCheck, Smartphone, Square, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useDialogA11y } from '@/hooks/useDialogA11y';
import { TWIN_CONSENT, resolveLegalLang } from '@/lib/legal/content';
import { createBrowserClient } from '@/lib/supabase/browser';
import { TWIN_LIMITS, TWIN_PHOTO_SLOTS, type TwinPhotoSlot, type TwinSlot, type TwinStatusResponse, type TwinUploadUrlResponse } from '@/lib/twin/types';
import {
  COUNTDOWN_FROM,
  canStopRecording,
  centerCrop,
  fitWithin,
  formatClock,
  groupDigits,
  levelFromSamples,
  pickVoiceMime,
  shouldAutoStop,
} from './captureMath';
import { twinCopy, type TwinCopy, type TwinLocale } from './copy';

type Step = 'consent' | TwinPhotoSlot | 'voice' | 'review' | 'done';
type CamState = 'off' | 'starting' | 'ready' | 'denied' | 'unavailable';
type RecState = 'idle' | 'starting' | 'recording' | 'denied' | 'unsupported';
interface Shot {
  blob: Blob;
  url: string;
}
interface VoiceTake {
  blob: Blob;
  seconds: number;
}

interface Props {
  locale?: TwinLocale;
  onClose: () => void;
  /** Desktop: the twin was committed (here, or by the phone after the QR). */
  onDone?: () => void;
  /** The PHONE side of the QR handoff: this signed link authorizes upload-url and commit (the phone has no session). */
  handoffToken?: string;
}

const STEPS: Step[] = ['front', 'left', 'right', 'voice', 'review'];
const PHONE_POLL_MS = 5000; // GET /api/twin draws on RATE_LIMITS.WRITE (20/min) — 12/min leaves headroom
const UPLOAD_TIMEOUT_MS = 120_000;

function isPermissionError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name ?? '';
  return name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
}

/**
 * Centre-crop to the 3:4 frame and downscale to ≤1024 px, as a JPEG — what is uploaded is never the raw sensor frame.
 * The live view is mirrored (it is a selfie); the saved photo is NOT — a twin is the face as other people see it.
 */
async function encodePhoto(src: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  const { sx, sy, sw, sh } = centerCrop(w, h);
  const { width, height } = fitWithin(sw, sh);
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = url;
  });
}

/** What a failed upload-url / commit answer means to the person. */
function errorText(t: TwinCopy, status: number, body: { error?: string }, phone: boolean): string {
  if (status === 401) return phone ? t.err.link : t.err.signIn;
  if (status === 404) return t.err.unavailable;
  if (status === 429) return t.err.rate;
  if (status === 403 || body.error === 'invalid_ticket') return t.err.expired;
  if (body.error === 'consent_required') return t.err.consent;
  return t.err.generic;
}

function OvalGuide() {
  const mask = useId();
  return (
    <svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <mask id={mask}>
          <rect width="300" height="400" fill="white" />
          <ellipse cx="150" cy="190" rx="108" ry="146" fill="black" />
        </mask>
      </defs>
      <rect width="300" height="400" fill="black" fillOpacity={0.5} mask={`url(#${mask})`} />
      <ellipse cx="150" cy="190" rx="108" ry="146" fill="none" strokeWidth="3" strokeDasharray="10 8" className="stroke-app-accent" />
    </svg>
  );
}

const primaryBtn =
  'flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-app-accent px-4 text-[15px] font-semibold text-app-bg transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40';
const secondaryBtn =
  'flex h-12 min-w-[44px] items-center justify-center gap-2 rounded-2xl bg-app-surface px-4 text-[14px] text-app-text transition hover:bg-app-elevated disabled:opacity-40';

export default function TwinCapture({ locale = 'ka', onClose, onDone, handoffToken }: Props) {
  const t = twinCopy(locale);
  const lang = resolveLegalLang(locale);
  const phone = !!handoffToken;

  const [step, setStep] = useState<Step>('consent');
  const [agreed, setAgreed] = useState(false);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const [session, setSession] = useState<TwinUploadUrlResponse | null>(null);
  const [voiceMime, setVoiceMime] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Partial<Record<TwinPhotoSlot, Shot>>>({});
  const [voice, setVoice] = useState<VoiceTake | null>(null);
  const [cam, setCam] = useState<CamState>('off');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [rec, setRec] = useState<RecState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ committedAt: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [qr, setQr] = useState<{ dataUrl: string } | null>(null);

  const dialogRef = useDialogA11y<HTMLDivElement>(true, onClose);
  const closedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const camBusyRef = useRef(false);
  /** Whether a live view wants the camera right now — a stream that arrives after it stopped wanting one is stopped. */
  const camWantedRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micBusyRef = useRef(false);
  const micWantedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const urlsRef = useRef<Set<string>>(new Set());
  const baselineRef = useRef<string | null>(null);
  // The parent passes fresh closures every render; read them through refs so the phone poll is not re-armed each time.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // ── camera ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    camStreamRef.current?.getTracks().forEach((tk) => tk.stop());
    camStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCam((c) => (c === 'denied' || c === 'unavailable' ? c : 'off'));
  }, []);

  const startCamera = useCallback(async () => {
    if (camBusyRef.current || camStreamRef.current) return; // ⚠️ reentrancy: one boot at a time, one stream at most
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCam('unavailable');
      return;
    }
    camBusyRef.current = true;
    setCam('starting');
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      } catch (e) {
        if (isPermissionError(e)) throw e;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); // an over-constrained ask
      }
      // ⚠️ Post-await bail: closed meanwhile, the live view ended (a photo was uploaded, the step changed), or a second
      // stream won → this one must not stay hot.
      if (closedRef.current || !camWantedRef.current || camStreamRef.current) {
        stream.getTracks().forEach((tk) => tk.stop());
        if (!camStreamRef.current) setCam('off');
        return;
      }
      camStreamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      setCam('ready');
    } catch (e) {
      setCam(isPermissionError(e) ? 'denied' : 'unavailable');
    } finally {
      camBusyRef.current = false;
    }
  }, []);

  /** A <video> mounted after the stream started (a new step) gets the running stream — no re-prompt, no re-open. */
  const setVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && camStreamRef.current && el.srcObject !== camStreamRef.current) {
      el.srcObject = camStreamRef.current;
      void el.play().catch(() => undefined);
    }
  }, []);

  const photoStep = step === 'front' || step === 'left' || step === 'right';
  // The camera runs only while a live view is on screen — not behind a preview, not on the voice or review steps.
  const liveView = photoStep && !photos[step as TwinPhotoSlot];
  const clearCountdown = useCallback(() => {
    if (countdownRef.current) clearTimeout(countdownRef.current);
    countdownRef.current = null;
    setCountdown(null);
  }, []);

  useEffect(() => {
    camWantedRef.current = liveView;
    if (liveView) void startCamera();
    else {
      clearCountdown(); // a 3-2-1 under way when a photo was uploaded instead never fires
      stopCamera();
    }
  }, [liveView, startCamera, stopCamera, clearCountdown]);

  const keepShot = useCallback((slot: TwinPhotoSlot, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urlsRef.current.add(url);
    setPhotos((prev) => {
      const old = prev[slot]?.url;
      if (old) {
        URL.revokeObjectURL(old);
        urlsRef.current.delete(old);
      }
      return { ...prev, [slot]: { blob, url } };
    });
  }, []);

  const snap = useCallback(async (slot: TwinPhotoSlot) => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const blob = await encodePhoto(v, v.videoWidth, v.videoHeight);
    if (closedRef.current) return;
    if (blob) keepShot(slot, blob);
    else setError(t.photoBad);
  }, [keepShot, t.photoBad]);

  const beginCountdown = useCallback(() => {
    if (!photoStep || countdownRef.current || cam !== 'ready') return;
    const slot = step as TwinPhotoSlot;
    setError(null);
    let n = COUNTDOWN_FROM;
    setCountdown(n);
    const tick = () => {
      n -= 1;
      if (n > 0) {
        setCountdown(n);
        countdownRef.current = setTimeout(tick, 1000);
      } else {
        countdownRef.current = null;
        setCountdown(null);
        void snap(slot);
      }
    };
    countdownRef.current = setTimeout(tick, 1000);
  }, [cam, photoStep, snap, step]);

  // A step change (or close) cancels a running 3-2-1 — it must never fire into the next slot.
  useEffect(() => clearCountdown, [step, clearCountdown]);

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file || !photoStep) return;
    const slot = step as TwinPhotoSlot;
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const blob = await encodePhoto(img, img.naturalWidth, img.naturalHeight);
      if (!blob) throw new Error('encode');
      if (!closedRef.current) keepShot(slot, blob);
    } catch {
      setError(t.photoBad);
    } finally {
      URL.revokeObjectURL(url);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [keepShot, photoStep, step, t.photoBad]);

  // ── voice ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const teardownMic = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    micStreamRef.current?.getTracks().forEach((tk) => tk.stop());
    micStreamRef.current = null;
    analyserRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }, []);

  const stopRecording = useCallback(() => {
    const r = recRef.current;
    if (r && r.state !== 'inactive') {
      try {
        r.stop();
      } catch {
        /* already stopping */
      }
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (micBusyRef.current || recRef.current) return; // ⚠️ reentrancy: a double tap starts one recorder, not two
    if (!voiceMime || typeof MediaRecorder === 'undefined' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRec('unsupported');
      return;
    }
    micBusyRef.current = true;
    setRec('starting');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (closedRef.current || !micWantedRef.current || micStreamRef.current) {
        stream.getTracks().forEach((tk) => tk.stop());
        setRec('idle');
        return;
      }
      micStreamRef.current = stream;
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          ctx.createMediaStreamSource(stream).connect(analyser);
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
        }
      } catch {
        /* the level meter is a nicety; recording works without it */
      }
      const recorder = new MediaRecorder(stream, { mimeType: voiceMime });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const seconds = Math.round(((Date.now() - startedAtRef.current) / 1000) * 10) / 10;
        recRef.current = null;
        teardownMic();
        if (closedRef.current) return;
        setVoice({ blob: new Blob(chunks, { type: voiceMime }), seconds });
        setRec('idle');
        setElapsed(0);
        setLevel(0);
      };
      recRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start(250);
      setVoice(null);
      setRec('recording');
      tickRef.current = setInterval(() => {
        const ms = Date.now() - startedAtRef.current;
        setElapsed(ms);
        const an = analyserRef.current;
        if (an) {
          const buf = new Uint8Array(an.fftSize);
          an.getByteTimeDomainData(buf);
          setLevel(levelFromSamples(buf));
        }
        if (shouldAutoStop(ms)) stopRecording();
      }, 100);
    } catch (e) {
      teardownMic();
      recRef.current = null;
      setRec(isPermissionError(e) ? 'denied' : 'unsupported');
    } finally {
      micBusyRef.current = false;
    }
  }, [stopRecording, teardownMic, voiceMime]);

  // Leaving the voice step mid-recording stops it (and releases the mic — even one still being granted).
  useEffect(() => {
    micWantedRef.current = step === 'voice';
    if (step !== 'voice') {
      stopRecording();
      teardownMic();
    }
  }, [step, stopRecording, teardownMic]);

  // ── lifecycle: re-arm on mount; release EVERYTHING on close ───────────────────────────────────────────────────────
  useEffect(() => {
    closedRef.current = false;
    const urls = urlsRef.current;
    return () => {
      closedRef.current = true;
      if (countdownRef.current) clearTimeout(countdownRef.current);
      camStreamRef.current?.getTracks().forEach((tk) => tk.stop());
      camStreamRef.current = null;
      const r = recRef.current;
      recRef.current = null;
      if (r && r.state !== 'inactive') {
        try {
          r.stop();
        } catch {
          /* noop */
        }
      }
      if (tickRef.current) clearInterval(tickRef.current);
      micStreamRef.current?.getTracks().forEach((tk) => tk.stop());
      micStreamRef.current = null;
      void audioCtxRef.current?.close().catch(() => undefined);
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  // ── desktop: an existing twin (replace / delete) ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phone) return;
    let alive = true;
    fetch('/api/twin', { credentials: 'include', signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? (r.json() as Promise<TwinStatusResponse>) : null))
      .then((j) => {
        if (!alive || !j) return;
        if (j.status === 'ready') {
          setExisting({ committedAt: j.committedAt });
          baselineRef.current = j.committedAt;
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [phone]);

  const deleteTwin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/twin', { method: 'DELETE', credentials: 'include', signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(String(r.status));
      setExisting(null);
      baselineRef.current = null;
      setNotice(t.deleted);
    } catch {
      setError(t.err.generic);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }, [busy, t.deleted, t.err.generic]);

  // ── desktop → phone (QR) ──────────────────────────────────────────────────────────────────────────────────────────
  const startPhone = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/avatar/handoff/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ locale }),
        signal: AbortSignal.timeout(20_000),
      });
      const j = (await r.json().catch(() => ({}))) as { qrDataUrl?: string };
      if (!r.ok || !j.qrDataUrl) throw new Error(String(r.status));
      setQr({ dataUrl: j.qrDataUrl });
    } catch {
      setError(t.err.generic);
    }
  }, [locale, t.err.generic]);

  useEffect(() => {
    if (!qr) return;
    const id = setInterval(async () => {
      try {
        const r = await fetch('/api/twin', { credentials: 'include' });
        const j = r.ok ? ((await r.json()) as TwinStatusResponse) : null;
        if (j?.status === 'ready' && j.committedAt !== baselineRef.current) {
          clearInterval(id);
          onDoneRef.current?.();
          onCloseRef.current();
        }
      } catch {
        /* keep polling */
      }
    }, PHONE_POLL_MS);
    return () => clearInterval(id);
  }, [qr]);

  // ── start (after consent) and save ────────────────────────────────────────────────────────────────────────────────
  const begin = useCallback(async () => {
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const mime = typeof MediaRecorder !== 'undefined' ? pickVoiceMime((x) => MediaRecorder.isTypeSupported(x)) : null;
    try {
      const r = await fetch('/api/twin/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          slots: { front: 'image/jpeg', left: 'image/jpeg', right: 'image/jpeg', ...(mime ? { voice: mime } : {}) },
          ...(handoffToken ? { handoffToken } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const j = (await r.json().catch(() => ({}))) as TwinUploadUrlResponse & { error?: string };
      if (!r.ok || !j.ticket) {
        setError(errorText(t, r.status, j, phone));
        return;
      }
      setSession(j);
      setVoiceMime(mime);
      setRec(mime ? 'idle' : 'unsupported');
      setStep('front');
    } catch {
      setError(t.err.generic);
    } finally {
      setBusy(false);
    }
  }, [agreed, busy, handoffToken, phone, t]);

  const save = useCallback(async () => {
    if (!session || busy || !consentAt) return;
    const shots = TWIN_PHOTO_SLOTS.map((s) => photos[s]);
    if (shots.some((s) => !s)) return;
    setBusy(true);
    setError(null);
    try {
      const sb = createBrowserClient();
      const put = async (slot: TwinSlot, blob: Blob, contentType: string) => {
        const u = session.uploads[slot];
        if (!u) throw new Error('no upload url');
        // supabase-js takes no AbortSignal for this PUT — race it, or a stalled upload strands "Saving…" forever.
        const res = await Promise.race([
          sb.storage.from(session.bucket).uploadToSignedUrl(u.path, u.token, blob, { contentType, upsert: true }),
          new Promise<{ error: { message: string } }>((resolve) => setTimeout(() => resolve({ error: { message: 'timeout' } }), UPLOAD_TIMEOUT_MS)),
        ]);
        if (res.error) throw new Error(`upload ${slot}`);
      };
      await Promise.all([
        ...TWIN_PHOTO_SLOTS.map((s) => put(s, photos[s]!.blob, 'image/jpeg')),
        ...(voice && voiceMime && session.uploads.voice ? [put('voice', voice.blob, voiceMime)] : []),
      ]);
      const r = await fetch('/api/twin/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ticket: session.ticket,
          consent: { version: TWIN_CONSENT.version, acceptedAt: consentAt },
          voiceSeconds: voice?.seconds ?? null,
          ...(handoffToken ? { handoffToken } : {}),
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; slot?: TwinSlot };
      if (r.ok && j.ok) {
        setStep('done');
        if (!phone) onDoneRef.current?.();
        return;
      }
      // A refused object sends the person back to exactly that shot; anything else explains itself.
      if (j.slot === 'voice') {
        setVoice(null);
        setStep('voice');
        setError(t.err.badVoice);
      } else if (j.slot) {
        setStep(j.slot);
        setPhotos((prev) => ({ ...prev, [j.slot as TwinPhotoSlot]: undefined }));
        setError(t.err.badPhoto(t.slot[j.slot as TwinPhotoSlot]));
      } else if (j.error === 'consent_required' || j.error === 'invalid_ticket' || r.status === 403) {
        setSession(null);
        setAgreed(false);
        setConsentAt(null);
        setStep('consent');
        setError(errorText(t, r.status, j, phone));
      } else {
        setError(errorText(t, r.status, j, phone));
      }
    } catch {
      setError(t.err.generic);
    } finally {
      setBusy(false);
    }
  }, [busy, consentAt, handoffToken, phone, photos, session, t, voice, voiceMime]);

  // ── render ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const stepIndex = STEPS.indexOf(step);
  const slotShot = photoStep ? photos[step as TwinPhotoSlot] : undefined;
  const canStop = canStopRecording(elapsed);
  const minFill = Math.min(1, elapsed / (TWIN_LIMITS.voiceMinSec * 1000));
  const dateFmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === 'ka' ? 'ka-GE' : lang === 'ru' ? 'ru-RU' : 'en-GB');
    } catch {
      return iso.slice(0, 10);
    }
  };

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (qr) {
    body = (
      <div className="flex flex-col items-center gap-4 py-8 text-center" data-testid="twin-qr">
        <div className="rounded-3xl bg-white p-4 shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: QR */}
          <img src={qr.dataUrl} alt="QR" className="h-[min(62vw,240px)] w-[min(62vw,240px)]" />
        </div>
        <span className="flex items-center gap-2 text-[14px] font-medium text-app-text"><Smartphone size={18} aria-hidden="true" /> {t.scanQr}</span>
        <span className="flex items-center gap-2 text-[12.5px] text-app-muted" role="status"><Loader2 className="animate-spin" size={14} aria-hidden="true" /> {t.waitingPhone}</span>
      </div>
    );
    footer = <button type="button" onClick={() => setQr(null)} className={`${secondaryBtn} w-full`}><RotateCcw size={16} aria-hidden="true" /> {t.back}</button>;
  } else if (step === 'consent') {
    body = (
      <section className="w-full max-w-md space-y-4 py-2" data-testid="twin-consent">
        {TWIN_CONSENT.status !== 'approved' && (
          <p data-testid="twin-consent-draft" className="inline-flex rounded-full bg-app-warning/15 px-3 py-1 text-[11.5px] font-semibold text-app-warning">
            {TWIN_CONSENT.draftNotice[lang]}
          </p>
        )}
        <h2 className="text-[18px] font-semibold leading-snug text-app-text">{TWIN_CONSENT.title[lang]}</h2>
        <p className="text-[14px] leading-relaxed text-app-muted">{TWIN_CONSENT.intro[lang]}</p>
        <ul className="space-y-2.5">
          {TWIN_CONSENT.points[lang].map((p) => (
            <li key={p} className="flex gap-2.5 text-[13.5px] leading-relaxed text-app-text">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-app-accent" aria-hidden="true" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-2xl bg-app-surface px-4 py-3 text-[14px] font-medium text-app-text">
          <input
            type="checkbox"
            data-testid="twin-consent-agree"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              setConsentAt(e.target.checked ? new Date().toISOString() : null);
            }}
            className="h-5 w-5 shrink-0 accent-app-accent"
          />
          {TWIN_CONSENT.agree[lang]}
        </label>
        {existing && !phone && (
          <div className="space-y-2 rounded-2xl bg-app-surface px-4 py-3" data-testid="twin-existing">
            <p className="text-[13px] leading-relaxed text-app-muted">{t.existing(dateFmt(existing.committedAt))}</p>
            {confirmDelete ? (
              <div className="space-y-2">
                <p className="text-[13px] text-app-text">{t.deleteConfirm}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void deleteTwin()} disabled={busy} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-app-danger/15 text-[13.5px] font-semibold text-app-danger disabled:opacity-40">
                    <Trash2 size={15} aria-hidden="true" /> {t.deleteYes}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-app-elevated text-[13.5px] text-app-text">{t.cancel}</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="flex h-11 items-center gap-2 text-[13px] font-medium text-app-danger">
                <Trash2 size={15} aria-hidden="true" /> {t.deleteTwin}
              </button>
            )}
          </div>
        )}
        {!phone && (
          <button type="button" onClick={() => void startPhone()} className="flex h-11 items-center gap-2 rounded-full px-1 text-[13px] text-app-muted transition hover:text-app-text">
            <Smartphone size={15} aria-hidden="true" /> {t.onPhone}
          </button>
        )}
      </section>
    );
    footer = (
      <button type="button" onClick={() => void begin()} disabled={!agreed || busy} className={primaryBtn} data-testid="twin-continue">
        {busy ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : null} {t.continue}
      </button>
    );
  } else if (photoStep) {
    const slot = step as TwinPhotoSlot;
    body = (
      <section className="flex w-full max-w-md flex-col items-center gap-4 py-2">
        <div className="relative aspect-[3/4] w-[min(78vw,320px)] overflow-hidden rounded-3xl bg-black ring-1 ring-app-border/10">
          {slotShot ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL
            <img src={slotShot.url} alt={t.slot[slot]} className="h-full w-full object-cover" />
          ) : (
            <>
              <video ref={setVideo} playsInline muted autoPlay className="h-full w-full -scale-x-100 object-cover" />
              <OvalGuide />
              {cam === 'starting' && <div className="absolute inset-0 flex items-center justify-center text-app-muted"><Loader2 className="animate-spin" size={26} aria-hidden="true" /></div>}
              {(cam === 'denied' || cam === 'unavailable') && (
                <p data-testid="twin-camera-error" className="absolute inset-0 flex items-center justify-center bg-app-bg/80 px-6 text-center text-[13px] leading-relaxed text-app-text">
                  {cam === 'denied' ? t.camDenied : t.camUnavailable}
                </p>
              )}
              {countdown !== null && (
                <span aria-live="assertive" className="absolute inset-0 flex items-center justify-center text-[88px] font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">{countdown}</span>
              )}
            </>
          )}
        </div>
        <p className="max-w-xs text-center text-[13.5px] leading-relaxed text-app-text">{t.instruction[slot]}</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="twin-photo-input" onChange={(e) => void onFile(e.target.files?.[0])} />
      </section>
    );
    footer = slotShot ? (
      <div className="flex gap-2">
        <button type="button" onClick={() => setPhotos((p) => ({ ...p, [slot]: undefined }))} className={secondaryBtn}><RotateCcw size={16} aria-hidden="true" /> {t.retake}</button>
        <button type="button" onClick={() => { setError(null); setStep(STEPS[stepIndex + 1]!); }} className={primaryBtn}>{t.usePhoto}</button>
      </div>
    ) : (
      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => fileRef.current?.click()} className={secondaryBtn} aria-label={t.upload}><Upload size={16} aria-hidden="true" /><span className="hidden min-[400px]:inline">{t.upload}</span></button>
        <button type="button" onClick={beginCountdown} disabled={cam !== 'ready' || countdown !== null} aria-label={t.capture} data-testid="twin-capture"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-app-accent text-app-bg shadow-lg transition hover:brightness-110 disabled:opacity-40">
          <Camera size={26} aria-hidden="true" />
        </button>
        {stepIndex > 0 ? (
          <button type="button" onClick={() => setStep(STEPS[stepIndex - 1]!)} className={secondaryBtn}>{t.back}</button>
        ) : <span className="w-[44px]" aria-hidden="true" />}
      </div>
    );
  } else if (step === 'voice') {
    const recording = rec === 'recording' || rec === 'starting';
    body = (
      <section className="flex w-full max-w-md flex-col items-center gap-5 py-4 text-center">
        <p className="text-[12.5px] font-semibold uppercase tracking-wide text-app-muted">{t.voiceTitle}</p>
        <p data-testid="twin-digits" className="font-mono text-[34px] font-bold tabular-nums tracking-[0.12em] text-app-text">{groupDigits(session?.digits ?? '')}</p>
        <p className="max-w-sm text-[13px] leading-relaxed text-app-muted">{t.voiceHint}</p>
        <div className="w-full max-w-xs space-y-2">
          <div className="flex items-center justify-between text-[13px] tabular-nums">
            <span data-testid="twin-timer" className="font-semibold text-app-text">{formatClock(elapsed)}</span>
            <span className="text-app-muted">{formatClock(TWIN_LIMITS.voiceMaxSec * 1000)}</span>
          </div>
          <div role="meter" aria-label="level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} className="h-2 w-full overflow-hidden rounded-full bg-app-surface">
            <div className="h-full rounded-full bg-app-accent transition-[width] duration-100 motion-reduce:transition-none" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-surface" aria-hidden="true">
            <div className={`h-full rounded-full ${canStop ? 'bg-app-success' : 'bg-app-muted/60'}`} style={{ width: `${Math.round(minFill * 100)}%` }} />
          </div>
        </div>
        {rec === 'denied' && <p role="alert" className="text-[13px] leading-relaxed text-app-danger">{t.micDenied}</p>}
        {rec === 'unsupported' && <p className="text-[13px] leading-relaxed text-app-muted">{t.micUnsupported}</p>}
        {voice && !recording && (
          <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-app-success" data-testid="twin-voice-done"><Check size={15} aria-hidden="true" /> {t.voiceDone(Math.round(voice.seconds))}</p>
        )}
      </section>
    );
    footer = recording ? (
      <button type="button" onClick={stopRecording} disabled={!canStop || rec === 'starting'} data-testid="twin-stop" className={primaryBtn}>
        <Square size={16} aria-hidden="true" /> {canStop ? t.stop : t.keepTalking}
      </button>
    ) : (
      <div className="flex flex-col gap-2">
        {voice ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => void startRecording()} className={secondaryBtn}><RotateCcw size={16} aria-hidden="true" /> {t.reRecord}</button>
            <button type="button" onClick={() => { setError(null); setStep('review'); }} className={primaryBtn}>{t.next}</button>
          </div>
        ) : rec === 'denied' || rec === 'unsupported' ? null : (
          <button type="button" onClick={() => void startRecording()} data-testid="twin-record" className={primaryBtn}><Mic size={18} aria-hidden="true" /> {t.record}</button>
        )}
        {!voice && (rec === 'denied' || rec === 'unsupported') && (
          <button type="button" onClick={() => { setError(null); setStep('review'); }} data-testid="twin-skip-voice" className={primaryBtn}>{t.skipVoice}</button>
        )}
        <button type="button" onClick={() => setStep('right')} className="h-10 text-[13px] text-app-muted hover:text-app-text">{t.back}</button>
      </div>
    );
  } else if (step === 'review') {
    body = (
      <section className="w-full max-w-md space-y-4 py-2" data-testid="twin-review">
        <h2 className="text-[17px] font-semibold text-app-text">{t.reviewTitle}</h2>
        <div className="grid grid-cols-3 gap-2">
          {TWIN_PHOTO_SLOTS.map((s) => (
            <button key={s} type="button" onClick={() => setStep(s)} className="space-y-1 text-left">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
              {photos[s] && <img src={photos[s]!.url} alt={t.slot[s]} className="aspect-[3/4] w-full rounded-2xl object-cover ring-1 ring-app-border/10" />}
              <span className="block text-center text-[12px] text-app-muted">{t.slot[s]}</span>
            </button>
          ))}
        </div>
        <p className="flex items-center gap-2 rounded-2xl bg-app-surface px-4 py-3 text-[13.5px] text-app-text">
          <Mic size={16} className="text-app-accent" aria-hidden="true" /> {voice ? t.voiceDone(Math.round(voice.seconds)) : t.noVoice}
        </p>
        <p className="flex items-center gap-2 text-[12.5px] text-app-muted"><Lock size={14} aria-hidden="true" /> {t.privacyNote}</p>
      </section>
    );
    footer = (
      <div className="flex gap-2">
        <button type="button" onClick={() => setStep('voice')} disabled={busy} className={secondaryBtn}>{t.back}</button>
        <button type="button" onClick={() => void save()} disabled={busy} data-testid="twin-save" className={primaryBtn}>
          {busy ? <><Loader2 className="animate-spin" size={18} aria-hidden="true" /> {t.saving}</> : t.save}
        </button>
      </div>
    );
  } else if (step === 'done') {
    body = (
      <div className="flex flex-col items-center gap-4 py-12 text-center" data-testid="twin-done">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-app-success/15 text-app-success"><Check size={40} aria-hidden="true" /></div>
        <p className="text-[17px] font-semibold text-app-text">{t.done}</p>
        {phone && <p className="max-w-xs text-[13.5px] text-app-muted">{t.phoneDone}</p>}
      </div>
    );
    footer = <button type="button" onClick={onClose} className={primaryBtn}>{t.close}</button>;
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.title} tabIndex={-1} className="fixed inset-0 z-[300] flex flex-col bg-app-bg ag-no-drag">
      <header className="flex items-center justify-between gap-3 px-4 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-app-text">{t.title}</p>
          {stepIndex >= 0 && !qr && (
            <p className="text-[12px] tabular-nums text-app-muted" data-testid="twin-step">{`${stepIndex + 1}/${STEPS.length} · ${t.slot[step as TwinPhotoSlot | 'voice' | 'review']}`}</p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label={t.close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-surface text-app-text transition hover:bg-app-elevated">
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 pb-4">
        {body}
        {notice && <p role="status" className="mt-2 max-w-md text-center text-[13px] text-app-success">{notice}</p>}
        {error && <p role="alert" className="mt-2 max-w-md text-center text-[13px] leading-relaxed text-app-danger">{error}</p>}
      </div>
      <div className="border-t border-app-border/10 bg-app-bg px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
        <div className="mx-auto w-full max-w-md">{footer}</div>
      </div>
    </div>
  );
}
