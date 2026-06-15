'use client';

/**
 * VoiceTrainer — record/upload ~1 minute of your voice, train a personal RVC model
 * (async, ~10–20 min on Replicate), and report when it's ready. Self-contained:
 * checks GET /api/voice/train on mount, POSTs to start, polls to completion.
 * `onReady(true)` lets the parent reveal a "sing in my trained voice" option.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Upload, Loader2, Check, GraduationCap, Trash2, AlertCircle } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';
const S = {
  ka: {
    title: 'ჩემი ხმის ვარჯიში', hint: 'ჩაიწერე ან ატვირთე ~1 წუთი სუფთა ხმა (ლაპარაკი ან სიმღერა). ვავარჯიშებ შენს პერსონალურ ხმის მოდელს — შემდეგ სიმღერა ნამდვილად შენი ხმით.',
    rec: 'ჩაწერა', stop: 'გაჩერება', upload: 'ატვირთვა', remove: 'წაშლა', train: 'ხმის ვარჯიში დაწყება',
    needMore: 'ჩაიწერე ≥30წმ', training: 'ვარჯიში მიმდინარეობს… (~10-20 წთ). შეგიძლია დახურო — დასრულდება ფონურად.',
    ready: '✓ შენი ხმა მზადაა! ახლა მუსიკაში აირჩიე „ჩემი ხმით".', failed: 'ვარჯიში ვერ მოხერხდა. სცადე თავიდან, უფრო გრძელი/სუფთა ხმით.',
    checking: 'შემოწმება…', tooBig: 'ფაილი დიდია — ჩაწერე უფრო მოკლე.', micErr: 'მიკროფონი ვერ ჩაირთო.',
  },
  en: {
    title: 'Train my voice', hint: 'Record or upload ~1 minute of clean voice (talking or singing). I train your personal voice model — then songs are sung in your real voice.',
    rec: 'Record', stop: 'Stop', upload: 'Upload', remove: 'Remove', train: 'Start voice training',
    needMore: 'Record ≥30s', training: 'Training… (~10-20 min). You can close this — it finishes in the background.',
    ready: '✓ Your voice is ready! Now pick "My voice" in Music.', failed: 'Training failed. Try again with a longer/cleaner clip.',
    checking: 'Checking…', tooBig: 'File too large — record shorter.', micErr: 'Could not start the mic.',
  },
  ru: {
    title: 'Тренировка моего голоса', hint: 'Запишите или загрузите ~1 минуту чистого голоса. Я обучу вашу персональную модель — затем песни поются вашим голосом.',
    rec: 'Запись', stop: 'Стоп', upload: 'Загрузить', remove: 'Удалить', train: 'Начать тренировку',
    needMore: 'Запишите ≥30с', training: 'Тренировка… (~10-20 мин). Можно закрыть — завершится в фоне.',
    ready: '✓ Ваш голос готов! Выберите «Мой голос» в Музыке.', failed: 'Не удалось. Попробуйте длиннее/чище.',
    checking: 'Проверка…', tooBig: 'Файл слишком большой — короче.', micErr: 'Не удалось включить микрофон.',
  },
} satisfies Record<Lang, Record<string, string>>;

type Status = 'checking' | 'idle' | 'have-sample' | 'training' | 'ready' | 'failed';
const MAX_REC = 180;
const MIN_REC = 30;

export function VoiceTrainer({ lang = 'ka', onReady }: { lang?: Lang; onReady?: (ready: boolean) => void }) {
  const t = S[lang];
  const [status, setStatus] = useState<Status>('checking');
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const check = useCallback(async () => {
    try {
      const r = await fetch('/api/voice/train', { credentials: 'include' });
      const j = (await r.json().catch(() => ({}))) as { status?: string };
      if (j.status === 'completed') { setStatus('ready'); onReady?.(true); }
      else if (j.status === 'processing') setStatus('training');
      else if (j.status === 'failed') setStatus('failed');
      else setStatus('idle');
    } catch { setStatus('idle'); }
  }, [onReady]);

  useEffect(() => { void check(); }, [check]);

  // Poll while training.
  useEffect(() => {
    if (status !== 'training') return;
    pollRef.current = setInterval(() => { void check(); }, 20_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, check]);

  const stopRec = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  const startRec = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
      let mime = '';
      for (const c of cands) { try { if (MediaRecorder.isTypeSupported(c)) { mime = c; break; } } catch { /* noop */ } }
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const type = rec.mimeType || mime || 'audio/webm';
        const b = new Blob(chunksRef.current, { type });
        setBlob(b);
        setPreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(b); });
        setStatus('have-sample');
      };
      recRef.current = rec;
      rec.start();
      setRecSec(0);
      setRecording(true);
      timerRef.current = setInterval(() => setRecSec((s) => { const n = s + 1; if (n >= MAX_REC) stopRec(); return n; }), 1000);
    } catch { setError(t.micErr); setRecording(false); }
  }, [stopRec, t.micErr]);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setError('');
    setBlob(f);
    setPreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(f); });
    setRecSec(60); // assume an uploaded clip is long enough
    setStatus('have-sample');
  }, []);

  const clearSample = useCallback(() => {
    setBlob(null);
    setPreview((p) => { if (p) URL.revokeObjectURL(p); return ''; });
    setRecSec(0);
    setStatus('idle');
  }, []);

  useEffect(() => () => {
    stopRec();
    if (pollRef.current) clearInterval(pollRef.current);
  }, [stopRec]);

  const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });

  const train = useCallback(async () => {
    if (!blob || busy) return;
    setBusy(true); setError('');
    try {
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.length > 8_000_000) { setError(t.tooBig); setBusy(false); return; }
      const r = await fetch('/api/voice/train', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ voiceReference: dataUrl }) });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (j.success) { setStatus('training'); setBlob(null); setPreview((p) => { if (p) URL.revokeObjectURL(p); return ''; }); }
      else setError(j.error || t.failed);
    } catch { setError(t.failed); } finally { setBusy(false); }
  }, [blob, busy, t.tooBig, t.failed]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="rounded-xl border border-app-accent/25 bg-app-accent/[0.05] p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-app-text">
        <GraduationCap size={14} className="text-app-accent" /> {t.title}
      </div>

      {status === 'checking' && <div className="flex items-center gap-2 text-[12px] text-app-muted"><Loader2 size={13} className="animate-spin" /> {t.checking}</div>}

      {status === 'ready' && <div className="flex items-center gap-1.5 text-[12px] font-medium text-app-accent"><Check size={14} /> {t.ready}</div>}

      {status === 'training' && <div className="flex items-center gap-2 text-[12px] leading-relaxed text-app-muted"><Loader2 size={13} className="animate-spin text-app-accent" /> {t.training}</div>}

      {(status === 'idle' || status === 'failed') && (
        <>
          <p className="mb-2 text-[11px] leading-relaxed text-app-muted/70">{t.hint}</p>
          {status === 'failed' && <p className="mb-2 flex items-center gap-1 text-[11px] text-red-300"><AlertCircle size={12} /> {t.failed}</p>}
          <div className="flex items-center gap-2">
            {!recording ? (
              <button type="button" onClick={startRec} className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1.5 text-[12px] font-semibold text-white transition-transform hover:scale-105 active:scale-95"><Mic size={13} /> {t.rec}</button>
            ) : (
              <button type="button" onClick={stopRec} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-950"><Square size={11} fill="currentColor" /> {t.stop} {fmt(recSec)}</button>
            )}
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-full border border-app-border/20 px-3 py-1.5 text-[12px] font-medium text-app-muted transition-colors hover:bg-app-elevated"><Upload size={13} /> {t.upload}</button>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFile} />
          </div>
          {recording && <div className="mt-1.5 text-[11px] font-medium text-app-muted">{fmt(recSec)} {recSec < MIN_REC && `· ${t.needMore}`}</div>}
        </>
      )}

      {status === 'have-sample' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <audio src={preview} controls className="h-9 min-w-0 flex-1" />
            <button type="button" onClick={clearSample} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-app-border/20 text-app-muted hover:bg-red-500/15 hover:text-red-300" aria-label={t.remove}><Trash2 size={14} /></button>
          </div>
          <button type="button" onClick={train} disabled={busy || recSec < MIN_REC} className="flex w-full items-center justify-center gap-2 rounded-lg bg-app-accent px-3 py-2 text-[12px] font-bold text-slate-950 transition-all hover:opacity-90 disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <GraduationCap size={14} />} {recSec < MIN_REC ? t.needMore : t.train}
          </button>
        </div>
      )}

      {error && status !== 'failed' && <p className="mt-1.5 flex items-center gap-1 text-[11px] text-red-300"><AlertCircle size={12} /> {error}</p>}
    </div>
  );
}

export default VoiceTrainer;
