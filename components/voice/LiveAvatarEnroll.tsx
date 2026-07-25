'use client';

/**
 * LiveAvatarEnroll — the "Avatar & Voice Profile" enrollment for Live Avatar Voice Mode.
 *
 * Captures a SELFIE (live camera with front/back flip, or a photo upload) and an OPTIONAL ~15s voice
 * sample, then:
 *   • POST /api/avatar/enroll  → stores the selfie as the user's core avatar poster (shown, audio-reactive,
 *     during the Gemini Live session and usable as the LiveAvatar photo when that tier is keyed).
 *   • POST /api/voice/train    → kicks off the personal voice clone (RVC) in the background (used for
 *     read-aloud + the LiveAvatar voice tier; Gemini Live itself uses a built-in Google voice).
 *
 * The camera stream is acquired ONCE and reused across flips/captures (permission isn't re-prompted), and
 * fully released on close. Front camera is mirrored for a natural selfie. Fail-open throughout.
 */
import { Camera, Check, Loader2, Mic, RotateCcw, Smartphone, SwitchCamera, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type Locale = 'ka' | 'en' | 'ru';

interface Props {
  locale?: Locale;
  onClose: () => void;
  onEnrolled?: (posterUrl: string) => void;
  /**
   * When set, this instance is the PHONE side of a desktop→phone handoff: it captures the selfie/voice and
   * posts to /api/avatar/handoff/complete with this token (no session needed) instead of /api/avatar/enroll.
   * When unset (desktop), a "Continue on phone" affordance is shown that mints a token + QR.
   */
  handoffToken?: string;
}

const T: Record<Locale, Record<string, string>> = {
  ka: {
    title: 'შენი ცოცხალი ავატარი', selfie: 'გადაიღე სელფი', capture: 'გადაღება', retake: 'თავიდან',
    upload: 'ატვირთვა', flip: 'კამერის შებრუნება', voice: 'ხმის ნიმუში (არასავალდებულო)',
    recVoice: 'ჩაწერე ~15წმ', recording: 'იწერება…', stop: 'გაჩერება', voiceReady: 'ხმა ჩაწერილია ✓',
    save: 'შენახვა და გააქტიურება', saving: 'ინახება…', done: 'ავატარი მზადაა!',
    camErr: 'კამერა ვერ ჩაირთო — ატვირთე ფოტო.', saveErr: 'ვერ შეინახა — სცადე თავიდან.',
    hint: 'ეს გამოჩნდება ხმოვან რეჟიმში და ილაპარაკებს შენს ნაცვლად.',
    onPhone: 'გააგრძელე ტელეფონით', scanQr: 'დაასკანერე ტელეფონის კამერით', waitingPhone: 'ველოდები ტელეფონს…',
    phoneDoneMsg: 'მზადაა! დაბრუნდი კომპიუტერთან.', back: 'უკან',
  },
  en: {
    title: 'Your Live Avatar', selfie: 'Take a selfie', capture: 'Capture', retake: 'Retake',
    upload: 'Upload', flip: 'Flip camera', voice: 'Voice sample (optional)',
    recVoice: 'Record ~15s', recording: 'Recording…', stop: 'Stop', voiceReady: 'Voice recorded ✓',
    save: 'Save & activate', saving: 'Saving…', done: 'Avatar ready!',
    camErr: 'Camera unavailable — upload a photo instead.', saveErr: 'Could not save — try again.',
    hint: 'This appears in voice mode and speaks for you.',
    onPhone: 'Continue on phone', scanQr: 'Scan with your phone camera', waitingPhone: 'Waiting for your phone…',
    phoneDoneMsg: 'Done! Return to your computer.', back: 'Back',
  },
  ru: {
    title: 'Ваш живой аватар', selfie: 'Сделайте селфи', capture: 'Снять', retake: 'Заново',
    upload: 'Загрузить', flip: 'Сменить камеру', voice: 'Образец голоса (необязательно)',
    recVoice: 'Запишите ~15с', recording: 'Запись…', stop: 'Стоп', voiceReady: 'Голос записан ✓',
    save: 'Сохранить и включить', saving: 'Сохранение…', done: 'Аватар готов!',
    camErr: 'Камера недоступна — загрузите фото.', saveErr: 'Не удалось сохранить — попробуйте снова.',
    hint: 'Появится в голосовом режиме и будет говорить за вас.',
    onPhone: 'Продолжить на телефоне', scanQr: 'Отсканируйте камерой телефона', waitingPhone: 'Ожидание телефона…',
    phoneDoneMsg: 'Готово! Вернитесь к компьютеру.', back: 'Назад',
  },
};

export default function LiveAvatarEnroll({ locale = 'ka', onClose, onEnrolled, handoffToken }: Props) {
  const t = T[locale] ?? T.ka;
  const [selfie, setSelfie] = useState<string | null>(null); // captured data-url
  const [qr, setQr] = useState<{ dataUrl: string; url: string } | null>(null); // desktop → phone QR
  const [waiting, setWaiting] = useState(false); // desktop: polling for the phone to finish
  const [phoneDone, setPhoneDone] = useState(false); // phone side: enrolled successfully
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [camReady, setCamReady] = useState(false);
  const [camErr, setCamErr] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceSample, setVoiceSample] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<'user' | 'environment'>('user');
  const recRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tk) => tk.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    // Reuse an already-open stream if the facing hasn't changed (no re-prompt).
    if (streamRef.current) return;
    setCamErr(false);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facingRef.current, width: 720, height: 720 } });
    } catch {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); } catch { setCamErr(true); return; }
    }
    streamRef.current = stream;
    const v = videoRef.current;
    if (v) { v.srcObject = stream; await v.play().catch(() => {}); setCamReady(true); }
  }, []);

  // Open the camera on mount (unless a photo was uploaded); release everything on unmount.
  useEffect(() => {
    if (!selfie) void startCamera();
    return () => {
      stopCamera();
      audioStreamRef.current?.getTracks().forEach((tk) => tk.stop());
      audioStreamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flipCamera = useCallback(async () => {
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    facingRef.current = next; setFacing(next);
    stopCamera();
    await startCamera();
  }, [startCamera, stopCamera]);

  const capture = useCallback(() => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    // Square center-crop to a clean portrait.
    const size = Math.min(v.videoWidth, v.videoHeight);
    c.width = size; c.height = size;
    const cx = c.getContext('2d');
    if (!cx) return;
    if (facingRef.current === 'user') { cx.translate(size, 0); cx.scale(-1, 1); } // un-mirror the selfie
    cx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, size, size);
    setSelfie(c.toDataURL('image/jpeg', 0.9));
    stopCamera(); setCamReady(false);
  }, [stopCamera]);

  const retake = useCallback(() => { setSelfie(null); void startCamera(); }, [startCamera]);

  const onFile = useCallback((f: File) => {
    const reader = new FileReader();
    reader.onload = () => { setSelfie(String(reader.result || '')); stopCamera(); setCamReady(false); };
    reader.readAsDataURL(f);
  }, [stopCamera]);

  const toggleRecord = useCallback(async () => {
    if (recording) { try { recRef.current?.stop(); } catch { /* noop */ } return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mpeg'];
      let mime = ''; for (const c of cands) { try { if (MediaRecorder.isTypeSupported(c)) { mime = c; break; } } catch { /* noop */ } }
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((tk) => tk.stop()); audioStreamRef.current = null; setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => setVoiceSample(String(reader.result || ''));
        reader.readAsDataURL(blob);
      };
      recRef.current = rec; rec.start();
      setRecording(true);
    } catch { /* mic denied — voice is optional */ }
  }, [recording]);

  const save = useCallback(async () => {
    if (!selfie || saving) return;
    setSaving(true); setErr(null);
    try {
      if (handoffToken) {
        // PHONE side of a handoff — one token-authorized call carries the selfie + optional voice.
        const r = await fetch('/api/avatar/handoff/complete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: handoffToken, dataUrl: selfie, ...(voiceSample ? { voiceDataUrl: voiceSample } : {}) }),
          signal: AbortSignal.timeout(45_000), // never leave the button stuck on "saving…"
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!r.ok || !j.ok) throw new Error(j.error || 'failed');
        setPhoneDone(true); setSaving(false);
        return;
      }
      const r = await fetch('/api/avatar/enroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ dataUrl: selfie }),
        signal: AbortSignal.timeout(45_000), // never leave the button stuck on "saving…"
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error || `save failed (HTTP ${r.status})`);
      // Fire-and-forget the voice clone (10-20 min, finishes in background) if a sample was recorded.
      if (voiceSample) {
        void fetch('/api/voice/train', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ voiceReference: voiceSample }),
        }).catch(() => {});
      }
      onEnrolled?.(j.url);
      onClose(); // success → close the sheet; NEVER leave "saving…" hanging
    } catch (e) {
      // Surface the ACTUAL error (server detail or a timeout) to the user + console — not just a generic string.
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.error('[LiveAvatarEnroll] save failed:', msg);
      const timedOut = e instanceof DOMException && e.name === 'TimeoutError';
      setErr(timedOut ? (t.saveErr ?? 'Timed out — try again.') : (msg && msg !== 'Failed to fetch' ? msg : (t.saveErr ?? 'Could not save — try again.')));
      setSaving(false);
    }
  }, [selfie, saving, voiceSample, handoffToken, onEnrolled, onClose, t.saveErr]);

  // ── Desktop → phone handoff ──────────────────────────────────────────────────
  const baselineRef = useRef<string | null>(null); // avatar_updated_at captured when the QR opens
  const startPhoneHandoff = useCallback(async () => {
    setErr(null);
    try {
      // Snapshot the current avatar state so polling can detect the NEW enrollment (updated_at changes).
      const cur = await fetch('/api/avatar/core', { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
      baselineRef.current = cur?.data?.updated_at ?? null;
      const r = await fetch('/api/avatar/handoff/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ locale }),
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string; qrDataUrl?: string; error?: string };
      if (!r.ok || !j.qrDataUrl || !j.url) throw new Error(j.error || 'failed');
      stopCamera(); setCamReady(false);
      setQr({ dataUrl: j.qrDataUrl, url: j.url }); setWaiting(true);
    } catch {
      setErr(t.saveErr ?? 'Could not start — try again.');
    }
  }, [locale, stopCamera, t.saveErr]);

  // While the QR is showing, poll the user's OWN core avatar; the phone finishing changes updated_at.
  useEffect(() => {
    if (!qr || !waiting) return;
    let alive = true;
    const id = setInterval(async () => {
      try {
        const j = await fetch('/api/avatar/core', { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
        const poster = j?.data?.poster_url;
        const updated = j?.data?.updated_at ?? null;
        if (alive && poster && j.data?.status === 'ready' && updated !== baselineRef.current) {
          clearInterval(id); setWaiting(false);
          onEnrolled?.(poster); onClose();
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [qr, waiting, onEnrolled, onClose]);

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-app-bg/97 backdrop-blur-md ag-no-drag" role="dialog" aria-label={t.title}>
      <div className="flex items-center justify-between px-5 pt-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
        <span className="text-[15px] font-semibold text-app-text">{t.title}</span>
        <button type="button" onClick={onClose} aria-label="close" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-app-text hover:bg-white/[0.14]"><X size={18} /></button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        {phoneDone && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"><Check size={40} /></div>
            <span className="text-[16px] font-semibold text-app-text">{t.done}</span>
            <span className="max-w-xs text-[13px] text-app-muted">{t.phoneDoneMsg}</span>
          </div>
        )}
        {qr && !phoneDone && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-3xl bg-white p-4 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.dataUrl} alt="QR" className="h-[min(62vw,240px)] w-[min(62vw,240px)]" />
            </div>
            <span className="flex items-center gap-2 text-[14px] font-medium text-app-text"><Smartphone size={18} /> {t.scanQr}</span>
            <span className="flex items-center gap-2 text-[12.5px] text-app-muted"><Loader2 className="animate-spin" size={14} /> {t.waitingPhone}</span>
            <button type="button" onClick={() => { setQr(null); setWaiting(false); void startCamera(); }} className="mt-1 flex h-10 items-center gap-2 rounded-full bg-white/[0.08] px-4 text-[13px] text-app-text hover:bg-white/[0.14]"><RotateCcw size={15} /> {t.back}</button>
          </div>
        )}
        {!phoneDone && !qr && (<>
        {/* Selfie stage — live camera or captured preview */}
        <div className="relative aspect-square w-[min(72vw,320px)] overflow-hidden rounded-3xl border border-white/12 bg-black/40">
          {selfie ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selfie} alt="" className="h-full w-full object-cover" />
          ) : (
            <>
              <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`} />
              {!camReady && !camErr && <div className="absolute inset-0 flex items-center justify-center text-app-muted"><Loader2 className="animate-spin" size={26} /></div>}
              {camErr && <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[12.5px] text-app-muted">{t.camErr}</div>}
            </>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        {!selfie && <span className="text-[12.5px] text-app-muted">{t.hint}</span>}

        {/* Capture controls */}
        {!selfie ? (
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-11 items-center gap-2 rounded-full bg-white/[0.08] px-4 text-[13px] text-app-text hover:bg-white/[0.14]"><Upload size={16} /> {t.upload}</button>
            <button type="button" onClick={capture} disabled={!camReady} aria-label={t.capture} className="flex h-16 w-16 items-center justify-center rounded-full bg-app-accent text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"><Camera size={26} /></button>
            <button type="button" onClick={() => void flipCamera()} disabled={!camReady} aria-label={t.flip} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08] text-app-text hover:bg-white/[0.14] disabled:opacity-40"><SwitchCamera size={18} /></button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </div>
        ) : (
          <button type="button" onClick={retake} className="flex h-11 items-center gap-2 rounded-full bg-white/[0.08] px-4 text-[13px] text-app-text hover:bg-white/[0.14]"><RotateCcw size={16} /> {t.retake}</button>
        )}

        {/* Optional voice sample */}
        <div className="mt-1 flex flex-col items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-app-muted">{t.voice}</span>
          {voiceSample ? (
            <span className="flex items-center gap-1.5 text-[13px] text-emerald-400"><Check size={15} /> {t.voiceReady}</span>
          ) : (
            <button type="button" onClick={() => void toggleRecord()} className={`flex h-10 items-center gap-2 rounded-full px-4 text-[13px] transition ${recording ? 'bg-app-danger/20 text-app-danger' : 'bg-white/[0.08] text-app-text hover:bg-white/[0.14]'}`}>
              <Mic size={16} /> {recording ? t.stop + ' · ' + t.recording : t.recVoice}
            </button>
          )}
        </div>

        {/* Continue on phone — desktop only (the phone side already IS on a phone). */}
        {!handoffToken && !selfie && (
          <button type="button" onClick={() => void startPhoneHandoff()} className="flex h-10 items-center gap-2 rounded-full bg-white/[0.06] px-4 text-[12.5px] text-app-muted transition hover:bg-white/[0.12] hover:text-app-text"><Smartphone size={15} /> {t.onPhone}</button>
        )}

        {err && <span className="text-[12.5px] text-app-danger">{err}</span>}
        </>)}
      </div>

      {/* Save bar — only in the capture flow (not on the QR-wait or done screens). */}
      {!phoneDone && !qr && (
        <div className="border-t border-white/10 bg-black/40 px-6 py-4 backdrop-blur-xl" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          <button type="button" onClick={() => void save()} disabled={!selfie || saving}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-app-accent text-[15px] font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40">
            {saving ? <><Loader2 className="animate-spin" size={18} /> {t.saving}</> : <>{t.save}</>}
          </button>
        </div>
      )}
    </div>
  );
}
