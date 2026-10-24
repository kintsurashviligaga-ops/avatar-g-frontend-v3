'use client';

/**
 * LiveAvatarEnroll — "Your Live Avatar": a photo of you (camera or upload) and an OPTIONAL ~15 s voice sample.
 *
 * The owner's P0 correction task (2026-10-24, phase 2):
 *   • the live CAMERA PREVIEW and the CAPTURED PHOTO are two different things on screen: the preview says "camera", the
 *     photo says "your photo", and Save works only on a captured or uploaded photo (the button tells you why it waits);
 *   • the photo is 9:16 at the camera's own resolution (no upscaling) — what Google's custom Live Avatar needs
 *     (≥720×1280) when the camera can give it; an upload is turned upright and scaled down, never cropped here;
 *   • Save shows real progress (upload %, then processing) and clear errors, then the SAVED avatar with its state:
 *       Saved avatar photo · Custom Live Avatar ready · Custom Live Avatar access unavailable;
 *   • opening it again shows the saved avatar (it survives refresh and re-login), with Replace and Delete.
 * Storage is private on the server (lib/avatar/liveAvatar.ts): signed URLs only. Nothing is trained or rendered.
 *
 * The camera stream is acquired once and reused across flips/captures, and fully released on close. The front camera
 * preview is mirrored; the captured photo is not.
 */
import { Camera, Check, Loader2, Mic, RotateCcw, Smartphone, SwitchCamera, Trash2, Upload, X } from 'lucide-react';
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

type AvatarState = 'saved_photo' | 'custom_ready' | 'custom_unavailable';
interface SavedAvatar {
  id: string;
  photoUrl: string;
  state: AvatarState;
  updatedAt: string;
  prep: { ok: boolean; reasons: string[] };
}

/** The photo's longer edge after capture/upload: enough for Google's 1080×1920, small enough for one request. */
const MAX_EDGE = 1920;
const MAX_UPLOAD_FILE = 25 * 1024 * 1024;
const SAVE_TIMEOUT_MS = 60_000;

const T: Record<Locale, Record<string, string>> = {
  ka: {
    title: 'შენი ცოცხალი ავატარი', capture: 'გადაღება', retake: 'თავიდან', upload: 'ფოტოს ატვირთვა', flip: 'კამერის შებრუნება',
    voice: 'ხმის ნიმუში (არასავალდებულო)', recVoice: 'ჩაწერე ~15წმ', recording: 'იწერება…', stop: 'გაჩერება', voiceReady: 'ხმა ჩაწერილია ✓',
    save: 'შენახვა და გააქტიურება', needPhoto: 'ჯერ გადაიღე ან ატვირთე ფოტო', uploading: 'იტვირთება', processing: 'მუშავდება…',
    cameraLabel: 'კამერა', photoLabel: 'შენი ფოტო', frameHint: 'სახე და მხრები ჩარჩოში, კარგ შუქზე',
    camErr: 'კამერა ვერ ჩაირთო — ატვირთე ფოტო.', hint: 'ეს გამოჩნდება ხმოვან რეჟიმში და ილაპარაკებს შენს ნაცვლად.',
    onPhone: 'გააგრძელე ტელეფონით', scanQr: 'დაასკანერე ტელეფონის კამერით', waitingPhone: 'ველოდები ტელეფონს…',
    phoneDoneMsg: 'მზადაა! დაბრუნდი კომპიუტერთან.', back: 'უკან', done: 'მზადაა', saved: 'ავატარი შენახულია',
    replace: 'შეცვლა', delete: 'წაშლა', confirmDelete: 'წავშალო ავატარი? ფოტო სამუდამოდ წაიშლება.', deleted: 'ავატარი წაიშალა',
    stateSaved: 'შენახული ფოტო', stateReady: 'პერსონალური Live ავატარი მზადაა', stateUnavailable: 'პერსონალური Live ავატარი ჯერ მიუწვდომელია',
    whySmall: 'Google-ის პერსონალური ავატარისთვის საჭიროა 9:16 და მინიმუმ 720×1280. ეს ფოტო უფრო პატარაა — გადაიღე ტელეფონით.',
    whyUnavailable: 'ფოტო Google-ის ფორმატს აკმაყოფილებს, მაგრამ პერსონალური ავატარის წვდომა Google-ის მხრიდან ჯერ ჩართული არ არის.',
    voiceSaved: 'ხმის ნიმუში შენახულია', voiceFailed: 'ხმის ნიმუში ვერ შეინახა — ფოტო შენახულია.',
    e_no_image: 'ფოტო ვერ მოიძებნა — გადაიღე ან ატვირთე თავიდან.', e_too_small: 'ფოტო ძალიან პატარაა.', e_too_large: 'ფოტო ძალიან დიდია.',
    e_unsupported_type: 'ეს ფორმატი არ მიიღება — გამოიყენე JPEG, PNG ან WebP.', e_content_mismatch: 'ფაილი სურათს არ ჰგავს.',
    e_undecodable: 'ფოტო ვერ წავიკითხე — სცადე სხვა.', e_storage_unavailable: 'შენახვა დროებით ვერ ხერხდება — სცადე ცოტა ხანში.',
    e_unauthorized: 'სესია ამოიწურა — შედი თავიდან.', e_rate: 'ძალიან ბევრი მცდელობა — მოიცადე წუთით.', e_timeout: 'დრო ამოიწურა — შეამოწმე ინტერნეტი და სცადე თავიდან.',
    e_network: 'კავშირი ვერ დამყარდა — სცადე თავიდან.', e_generic: 'ვერ შეინახა — სცადე თავიდან.', e_link: 'ბმული ვადაგასულია ან უკვე გამოყენებული — დაასკანერე ახალი QR.',
  },
  en: {
    title: 'Your Live Avatar', capture: 'Capture', retake: 'Retake', upload: 'Upload a photo', flip: 'Flip camera',
    voice: 'Voice sample (optional)', recVoice: 'Record ~15s', recording: 'Recording…', stop: 'Stop', voiceReady: 'Voice recorded ✓',
    save: 'Save & activate', needPhoto: 'Take or upload a photo first', uploading: 'Uploading', processing: 'Processing…',
    cameraLabel: 'Camera', photoLabel: 'Your photo', frameHint: 'Face and shoulders in the frame, in good light',
    camErr: 'Camera unavailable — upload a photo instead.', hint: 'This appears in voice mode and speaks for you.',
    onPhone: 'Continue on phone', scanQr: 'Scan with your phone camera', waitingPhone: 'Waiting for your phone…',
    phoneDoneMsg: 'Done! Return to your computer.', back: 'Back', done: 'Done', saved: 'Avatar saved',
    replace: 'Replace', delete: 'Delete', confirmDelete: 'Delete your avatar? The photo is removed for good.', deleted: 'Avatar deleted',
    stateSaved: 'Saved avatar photo', stateReady: 'Custom Live Avatar ready', stateUnavailable: 'Custom Live Avatar access unavailable',
    whySmall: 'Google’s custom avatar needs 9:16 at 720×1280 or more. This photo is smaller — take it with a phone camera.',
    whyUnavailable: 'The photo meets Google’s format, but custom avatar access is not enabled on Google’s side yet.',
    voiceSaved: 'Voice sample saved', voiceFailed: 'The voice sample was not saved — the photo is.',
    e_no_image: 'No photo found — take or upload it again.', e_too_small: 'The photo is too small.', e_too_large: 'The photo is too large.',
    e_unsupported_type: 'This format is not accepted — use JPEG, PNG or WebP.', e_content_mismatch: 'The file does not look like an image.',
    e_undecodable: 'Could not read the photo — try another.', e_storage_unavailable: 'Saving is unavailable right now — try again shortly.',
    e_unauthorized: 'Your session ended — sign in again.', e_rate: 'Too many attempts — wait a minute.', e_timeout: 'Timed out — check your connection and try again.',
    e_network: 'No connection — try again.', e_generic: 'Could not save — try again.', e_link: 'This link has expired or was used — scan a new QR code.',
  },
  ru: {
    title: 'Ваш живой аватар', capture: 'Снять', retake: 'Заново', upload: 'Загрузить фото', flip: 'Сменить камеру',
    voice: 'Образец голоса (необязательно)', recVoice: 'Запишите ~15с', recording: 'Запись…', stop: 'Стоп', voiceReady: 'Голос записан ✓',
    save: 'Сохранить и включить', needPhoto: 'Сначала снимите или загрузите фото', uploading: 'Загрузка', processing: 'Обработка…',
    cameraLabel: 'Камера', photoLabel: 'Ваше фото', frameHint: 'Лицо и плечи в кадре, при хорошем свете',
    camErr: 'Камера недоступна — загрузите фото.', hint: 'Появится в голосовом режиме и будет говорить за вас.',
    onPhone: 'Продолжить на телефоне', scanQr: 'Отсканируйте камерой телефона', waitingPhone: 'Ожидание телефона…',
    phoneDoneMsg: 'Готово! Вернитесь к компьютеру.', back: 'Назад', done: 'Готово', saved: 'Аватар сохранён',
    replace: 'Заменить', delete: 'Удалить', confirmDelete: 'Удалить аватар? Фото будет удалено навсегда.', deleted: 'Аватар удалён',
    stateSaved: 'Сохранённое фото', stateReady: 'Персональный Live-аватар готов', stateUnavailable: 'Персональный Live-аватар пока недоступен',
    whySmall: 'Для персонального аватара Google нужно 9:16 и не меньше 720×1280. Это фото меньше — снимите камерой телефона.',
    whyUnavailable: 'Фото подходит под формат Google, но доступ к персональным аватарам у Google ещё не включён.',
    voiceSaved: 'Образец голоса сохранён', voiceFailed: 'Образец голоса не сохранён — фото сохранено.',
    e_no_image: 'Фото не найдено — снимите или загрузите снова.', e_too_small: 'Фото слишком маленькое.', e_too_large: 'Фото слишком большое.',
    e_unsupported_type: 'Этот формат не принимается — JPEG, PNG или WebP.', e_content_mismatch: 'Файл не похож на изображение.',
    e_undecodable: 'Не удалось прочитать фото — попробуйте другое.', e_storage_unavailable: 'Сохранение сейчас недоступно — попробуйте позже.',
    e_unauthorized: 'Сессия завершилась — войдите снова.', e_rate: 'Слишком много попыток — подождите минуту.', e_timeout: 'Время вышло — проверьте связь и повторите.',
    e_network: 'Нет соединения — попробуйте снова.', e_generic: 'Не удалось сохранить — попробуйте снова.', e_link: 'Ссылка устарела или уже использована — отсканируйте новый QR.',
  },
};

/** A server error code (or HTTP status) → the sentence the person reads. */
export function enrollErrorText(t: Record<string, string>, code: string | undefined, status: number): string {
  if (status === 401) return code === 'invalid_or_expired_link' ? t.e_link! : t.e_unauthorized!;
  if (status === 429) return t.e_rate!;
  const key = code ? `e_${code}` : '';
  return (key && t[key]) || (status === 503 ? t.e_storage_unavailable! : t.e_generic!);
}

/** Draw `src` (sx,sy,sw,sh) into a canvas scaled so the longer edge is at most MAX_EDGE — never enlarged. */
function toJpeg(canvas: HTMLCanvasElement, src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, mirror: boolean): string {
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const cx = canvas.getContext('2d');
  if (!cx) return '';
  cx.setTransform(1, 0, 0, 1, 0, 0);
  if (mirror) { cx.translate(canvas.width, 0); cx.scale(-1, 1); }
  cx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

/** POST JSON with upload progress (fetch has none) and a hard timeout. */
function postWithProgress(url: string, body: string, onProgress: (pct: number) => void): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.timeout = SAVE_TIMEOUT_MS;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let json: Record<string, unknown> = {};
      try { json = JSON.parse(xhr.responseText || '{}') as Record<string, unknown>; } catch { /* not JSON */ }
      resolve({ status: xhr.status, json });
    };
    xhr.ontimeout = () => reject(new Error('timeout'));
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(body);
  });
}

export default function LiveAvatarEnroll({ locale = 'ka', onClose, onEnrolled, handoffToken }: Props) {
  const t = T[locale] ?? T.ka;
  const [selfie, setSelfie] = useState<{ dataUrl: string; source: 'camera' | 'upload'; width: number; height: number } | null>(null);
  const [saved, setSaved] = useState<SavedAvatar | null>(null); // the avatar on the server
  const [view, setView] = useState<'loading' | 'saved' | 'capture'>(handoffToken ? 'capture' : 'loading');
  const [qr, setQr] = useState<{ dataUrl: string; url: string } | null>(null); // desktop → phone QR
  const [waiting, setWaiting] = useState(false); // desktop: polling for the phone to finish
  const [phoneDone, setPhoneDone] = useState(false); // phone side: enrolled successfully
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [camReady, setCamReady] = useState(false);
  const [camErr, setCamErr] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceSample, setVoiceSample] = useState<string | null>(null);
  const [voiceResult, setVoiceResult] = useState<'saved' | 'failed' | null>(null);
  const [progress, setProgress] = useState<{ phase: 'uploading' | 'processing'; pct: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const saving = progress !== null;

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
    setCamReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current) return;
    setCamErr(false);
    let stream: MediaStream | null = null;
    try {
      // Portrait at the camera's best: a phone gives 1080×1920; a laptop webcam gives what it has (never upscaled).
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingRef.current, width: { ideal: 1080 }, height: { ideal: 1920 }, aspectRatio: { ideal: 9 / 16 } },
      });
    } catch {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: true }); } catch { setCamErr(true); return; }
    }
    streamRef.current = stream;
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    await v.play().catch(() => {});
    // Capture is offered only once a frame has a size: a click before that would grab nothing.
    if (!v.videoWidth) {
      await new Promise<void>((resolve) => {
        const done = () => { v.removeEventListener('loadedmetadata', done); v.removeEventListener('resize', done); resolve(); };
        v.addEventListener('loadedmetadata', done);
        v.addEventListener('resize', done);
        setTimeout(done, 5000);
      });
    }
    if (streamRef.current === stream) { if (v.videoWidth) setCamReady(true); else setCamErr(true); }
  }, []);

  // The saved avatar first (refresh / re-login keep it); the camera only when there is none or on Replace.
  useEffect(() => {
    if (handoffToken) return;
    let alive = true;
    void (async () => {
      try {
        const r = await fetch('/api/avatar/core', { credentials: 'include' });
        const j = (await r.json().catch(() => ({}))) as { data?: { live_avatar?: SavedAvatar | null } };
        const live = j?.data?.live_avatar;
        if (!alive) return;
        if (r.ok && live) { setSaved(live); setView('saved'); } else setView('capture');
      } catch {
        if (alive) setView('capture');
      }
    })();
    return () => { alive = false; };
  }, [handoffToken]);

  useEffect(() => {
    if (view === 'capture' && !selfie && !qr) void startCamera();
  }, [view, selfie, qr, startCamera]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((tk) => tk.stop());
    audioStreamRef.current?.getTracks().forEach((tk) => tk.stop());
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
    // The largest centred 9:16 of the frame, at the camera's own resolution.
    const vw = v.videoWidth, vh = v.videoHeight;
    const sw = vw * 16 > vh * 9 ? Math.floor((vh * 9) / 16) : vw;
    const sh = vw * 16 > vh * 9 ? vh : Math.floor((vw * 16) / 9);
    const dataUrl = toJpeg(c, v, Math.floor((vw - sw) / 2), Math.floor((vh - sh) / 2), sw, sh, facingRef.current === 'user');
    if (!dataUrl) return;
    setSelfie({ dataUrl, source: 'camera', width: c.width, height: c.height });
    setErr(null);
    stopCamera();
  }, [stopCamera]);

  const retake = useCallback(() => { setSelfie(null); setErr(null); }, []);

  const onFile = useCallback(async (f: File) => {
    setErr(null);
    if (!f.type.startsWith('image/')) { setErr(t.e_unsupported_type!); return; }
    if (f.size > MAX_UPLOAD_FILE) { setErr(t.e_too_large!); return; }
    const c = canvasRef.current;
    if (!c) return;
    try {
      // Upright (EXIF orientation applied), then scaled down; a HEIC opens where the browser can decode it.
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      const dataUrl = toJpeg(c, bmp, 0, 0, bmp.width, bmp.height, false);
      bmp.close();
      if (!dataUrl) throw new Error('canvas');
      setSelfie({ dataUrl, source: 'upload', width: c.width, height: c.height });
      stopCamera();
    } catch {
      setErr(/heic|heif/i.test(f.type) ? t.e_unsupported_type! : t.e_undecodable!);
    }
  }, [stopCamera, t]);

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
    setErr(null); setNotice(null);
    setProgress({ phase: 'uploading', pct: 0 });
    const onPct = (pct: number) => setProgress(pct >= 100 ? { phase: 'processing', pct: 100 } : { phase: 'uploading', pct });
    try {
      if (handoffToken) {
        const { status, json } = await postWithProgress('/api/avatar/handoff/complete',
          JSON.stringify({ token: handoffToken, dataUrl: selfie.dataUrl, ...(voiceSample ? { voiceDataUrl: voiceSample } : {}) }), onPct);
        if (status !== 200 || !json.ok) { setErr(enrollErrorText(t, json.error as string | undefined, status)); return; }
        setPhoneDone(true);
        return;
      }
      const { status, json } = await postWithProgress('/api/avatar/enroll',
        JSON.stringify({ dataUrl: selfie.dataUrl, source: selfie.source, ...(voiceSample ? { voiceDataUrl: voiceSample } : {}) }), onPct);
      const avatar = json.avatar as SavedAvatar | undefined;
      if (status !== 200 || !avatar || typeof json.url !== 'string') { setErr(enrollErrorText(t, json.error as string | undefined, status)); return; }
      setSaved(avatar);
      setVoiceResult(json.voice === 'saved' ? 'saved' : json.voice === 'failed' ? 'failed' : null);
      setSelfie(null); setVoiceSample(null);
      setView('saved');
      onEnrolled?.(json.url);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[LiveAvatarEnroll] save failed:', e instanceof Error ? e.message : e);
      setErr(e instanceof Error && e.message === 'timeout' ? t.e_timeout! : t.e_network!);
    } finally {
      setProgress(null);
    }
  }, [selfie, saving, voiceSample, handoffToken, onEnrolled, t]);

  const remove = useCallback(async () => {
    if (deleting || !window.confirm(t.confirmDelete)) return;
    setDeleting(true); setErr(null);
    try {
      const r = await fetch('/api/avatar/core', { method: 'DELETE', credentials: 'include' });
      if (!r.ok) { setErr(enrollErrorText(t, undefined, r.status)); return; }
      setSaved(null); setVoiceResult(null); setNotice(t.deleted!); setView('capture');
    } catch {
      setErr(t.e_network!);
    } finally {
      setDeleting(false);
    }
  }, [deleting, t]);

  // ── Desktop → phone handoff ──────────────────────────────────────────────────
  const baselineRef = useRef<string | null>(null); // the avatar's updated_at when the QR opens
  const startPhoneHandoff = useCallback(async () => {
    setErr(null);
    try {
      const cur = await fetch('/api/avatar/core', { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
      baselineRef.current = cur?.data?.updated_at ?? null;
      const r = await fetch('/api/avatar/handoff/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ locale }),
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string; qrDataUrl?: string; error?: string };
      if (!r.ok || !j.qrDataUrl || !j.url) { setErr(enrollErrorText(t, j.error, r.status)); return; }
      stopCamera();
      setQr({ dataUrl: j.qrDataUrl, url: j.url }); setWaiting(true);
    } catch {
      setErr(t.e_network!);
    }
  }, [locale, stopCamera, t]);

  // While the QR is showing, poll the user's OWN avatar; the phone finishing changes updated_at.
  useEffect(() => {
    if (!qr || !waiting) return;
    let alive = true;
    const id = setInterval(async () => {
      try {
        const j = await fetch('/api/avatar/core', { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
        const live = j?.data?.live_avatar as SavedAvatar | null | undefined;
        const updated = j?.data?.updated_at ?? null;
        if (alive && live && updated !== baselineRef.current) {
          clearInterval(id); setWaiting(false); setQr(null);
          setSaved(live); setView('saved');
          onEnrolled?.(live.photoUrl);
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => { alive = false; clearInterval(id); };
  }, [qr, waiting, onEnrolled]);

  const stateText = saved ? (saved.state === 'custom_ready' ? t.stateReady : saved.state === 'custom_unavailable' ? t.stateUnavailable : t.stateSaved) : '';
  const stateWhy = saved ? (saved.state === 'saved_photo' ? (saved.prep.reasons.includes('too_small') ? t.whySmall : '') : saved.state === 'custom_unavailable' ? t.whyUnavailable : '') : '';
  const capturing = view === 'capture' && !phoneDone && !qr;

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-app-bg/97 backdrop-blur-md ag-no-drag" role="dialog" aria-label={t.title} data-testid="live-avatar-enroll" data-view={phoneDone ? 'phone-done' : qr ? 'qr' : view}>
      <div className="flex items-center justify-between px-5 pt-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
        <span className="text-[15px] font-semibold text-app-text">{t.title}</span>
        <button type="button" onClick={onClose} aria-label="close" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08] text-app-text hover:bg-white/[0.14]"><X size={18} /></button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-4">
        {view === 'loading' && <Loader2 className="animate-spin text-app-muted" size={26} />}

        {phoneDone && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"><Check size={40} /></div>
            <span className="text-[16px] font-semibold text-app-text">{t.saved}</span>
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
            <button type="button" onClick={() => { setQr(null); setWaiting(false); }} className="mt-1 flex h-11 items-center gap-2 rounded-full bg-white/[0.08] px-4 text-[13px] text-app-text hover:bg-white/[0.14]"><RotateCcw size={15} /> {t.back}</button>
          </div>
        )}

        {view === 'saved' && saved && !qr && (
          <div className="flex flex-col items-center gap-4 text-center" data-testid="live-avatar-saved" data-state={saved.state}>
            <div className="relative aspect-[9/16] w-[min(52vw,220px)] overflow-hidden rounded-3xl border border-white/12 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={saved.photoUrl} alt={t.photoLabel} className="h-full w-full object-cover" />
            </div>
            <span className="flex items-center gap-1.5 text-[15px] font-semibold text-app-text"><Check size={17} className="text-emerald-400" /> {t.saved}</span>
            <span data-testid="live-avatar-state" className={`rounded-full px-3 py-1 text-[12.5px] ${saved.state === 'custom_ready' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.08] text-app-muted'}`}>{stateText}</span>
            {stateWhy && <span className="max-w-sm text-[12.5px] leading-relaxed text-app-muted">{stateWhy}</span>}
            {voiceResult && <span className={`text-[12.5px] ${voiceResult === 'saved' ? 'text-emerald-400' : 'text-amber-300'}`}>{voiceResult === 'saved' ? t.voiceSaved : t.voiceFailed}</span>}
            <div className="mt-1 flex items-center gap-3">
              <button type="button" onClick={() => { setView('capture'); setNotice(null); }} className="flex h-11 items-center gap-2 rounded-full bg-white/[0.08] px-4 text-[13px] text-app-text hover:bg-white/[0.14]"><RotateCcw size={15} /> {t.replace}</button>
              <button type="button" onClick={() => void remove()} disabled={deleting} className="flex h-11 items-center gap-2 rounded-full bg-white/[0.08] px-4 text-[13px] text-app-text hover:bg-rose-500/20 disabled:opacity-40">{deleting ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />} {t.delete}</button>
            </div>
          </div>
        )}

        {capturing && (<>
          {/* Two different things, said so: the live camera, or the photo that will be saved. */}
          <div className="relative aspect-[9/16] w-[min(52vw,240px)] max-h-[52vh] overflow-hidden rounded-3xl border border-white/12 bg-black/40" data-testid={selfie ? 'live-avatar-photo' : 'live-avatar-camera'}>
            {selfie ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selfie.dataUrl} alt={t.photoLabel} className="h-full w-full object-cover" />
            ) : (
              <>
                <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`} />
                {camReady && <div aria-hidden className="pointer-events-none absolute left-1/2 top-[14%] h-[46%] w-[62%] -translate-x-1/2 rounded-[50%] border-2 border-dashed border-white/50" />}
                {!camReady && !camErr && <div className="absolute inset-0 flex items-center justify-center text-app-muted"><Loader2 className="animate-spin" size={26} /></div>}
                {camErr && <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[12.5px] text-app-muted">{t.camErr}</div>}
              </>
            )}
            <span className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-medium ${selfie ? 'bg-emerald-500/85 text-white' : 'bg-black/60 text-white/85'}`}>
              {selfie ? t.photoLabel : t.cameraLabel}
            </span>
          </div>

          <span className="text-center text-[12.5px] text-app-muted">{selfie ? t.hint : t.frameHint}</span>

          {!selfie ? (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex h-11 items-center gap-2 rounded-full bg-white/[0.08] px-4 text-[13px] text-app-text hover:bg-white/[0.14]"><Upload size={16} /> {t.upload}</button>
              <button type="button" onClick={capture} disabled={!camReady} aria-label={t.capture} className="flex h-16 w-16 items-center justify-center rounded-full bg-app-accent text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"><Camera size={26} /></button>
              <button type="button" onClick={() => void flipCamera()} disabled={!camReady} aria-label={t.flip} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08] text-app-text hover:bg-white/[0.14] disabled:opacity-40"><SwitchCamera size={18} /></button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f); }} />
            </div>
          ) : (
            <button type="button" onClick={retake} disabled={saving} className="flex h-11 items-center gap-2 rounded-full bg-white/[0.08] px-4 text-[13px] text-app-text hover:bg-white/[0.14] disabled:opacity-40"><RotateCcw size={16} /> {t.retake}</button>
          )}

          <div className="flex flex-col items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-app-muted">{t.voice}</span>
            {voiceSample ? (
              <span className="flex items-center gap-1.5 text-[13px] text-emerald-400"><Check size={15} /> {t.voiceReady}</span>
            ) : (
              <button type="button" onClick={() => void toggleRecord()} className={`flex h-11 items-center gap-2 rounded-full px-4 text-[13px] transition ${recording ? 'bg-app-danger/20 text-app-danger' : 'bg-white/[0.08] text-app-text hover:bg-white/[0.14]'}`}>
                <Mic size={16} /> {recording ? t.stop + ' · ' + t.recording : t.recVoice}
              </button>
            )}
          </div>

          {!handoffToken && !selfie && (
            <button type="button" onClick={() => void startPhoneHandoff()} className="flex h-11 items-center gap-2 rounded-full bg-white/[0.06] px-4 text-[12.5px] text-app-muted transition hover:bg-white/[0.12] hover:text-app-text"><Smartphone size={15} /> {t.onPhone}</button>
          )}
        </>)}

        <canvas ref={canvasRef} className="hidden" />
        {notice && <span role="status" className="text-[12.5px] text-app-muted">{notice}</span>}
        {err && <span role="alert" data-testid="live-avatar-error" className="max-w-sm text-center text-[12.5px] text-app-danger">{err}</span>}
      </div>

      {/* Save bar — only while capturing. It waits for a captured or uploaded photo, and says so. */}
      {capturing && (
        <div className="border-t border-white/10 bg-black/40 px-6 py-4 backdrop-blur-xl" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          <button type="button" onClick={() => void save()} disabled={!selfie || saving} data-testid="live-avatar-save"
            className="relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-app-accent text-[15px] font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40">
            {progress && <span aria-hidden className="absolute inset-y-0 left-0 bg-white/20 transition-[width]" style={{ width: `${progress.pct}%` }} />}
            <span className="relative flex items-center gap-2">
              {progress
                ? <><Loader2 className="animate-spin" size={18} /> {progress.phase === 'uploading' ? `${t.uploading} ${progress.pct}%` : t.processing}</>
                : t.save}
            </span>
          </button>
          {!selfie && <p className="mt-2 text-center text-[12px] text-app-muted" data-testid="live-avatar-save-hint">{t.needPhoto}</p>}
        </div>
      )}
      {view === 'saved' && saved && !qr && (
        <div className="border-t border-white/10 bg-black/40 px-6 py-4 backdrop-blur-xl" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          <button type="button" onClick={onClose} className="flex h-12 w-full items-center justify-center rounded-2xl bg-app-accent text-[15px] font-semibold text-white shadow-lg transition hover:brightness-110">{t.done}</button>
        </div>
      )}
    </div>
  );
}
