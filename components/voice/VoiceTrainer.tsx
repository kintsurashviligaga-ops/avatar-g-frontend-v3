'use client';

/**
 * VoiceTrainer — record/upload ~1 minute of your voice, train a personal RVC model
 * (async, ~10–20 min on Replicate), and report when it's ready. Self-contained:
 * checks GET /api/voice/train on mount, POSTs to start, polls to completion.
 * `onReady(true)` lets the parent reveal a "sing in my trained voice" option.
 *
 * Polished for best results: live mic level meter, a clear ~1-minute target, plain
 * best-practice tips, an animated training state, and a re-train action.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Upload, Loader2, Check, GraduationCap, Trash2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';
const S = {
  ka: {
    title: 'ჩემი ხმის ვარჯიში',
    hint: 'ჩაიწერე ან ატვირთე ~1 წუთი შენი ხმა — შემდეგ სიმღერა ნამდვილად შენი ვოკალით შეიქმნება.',
    tips: '🎯 წყნარ ოთახში, მიკროფონთან ახლოს, ნათლად ილაპარაკე ან იმღერე. ~1 წუთი = საუკეთესო შედეგი.',
    rec: 'ჩაწერა', stop: 'გაჩერება', upload: 'ატვირთვა', remove: 'წაშლა', train: 'ვარჯიშის დაწყება',
    needMore: 'ჯერ ცოტაა — ≥30წმ', goodLen: 'კარგია ✓', idealLen: 'იდეალურია ✓',
    training: 'ხმა ვარჯიშობს…', trainingNote: '~10-20 წუთი. შეგიძლია დახურო — ფონურად დასრულდება, შემდეგ ავტომატურად გამოჩნდება.',
    ready: 'შენი ხმა მზადაა!', readyNote: 'ქვემოთ ჩართე „ჩემი ნავარჯიში ხმით" და შექმენი სიმღერა.', retrain: 'თავიდან ვარჯიში',
    failed: 'ვარჯიში ვერ მოხერხდა — სცადე თავიდან, უფრო გრძელი/სუფთა ჩანაწერით.',
    checking: 'შემოწმება…', tooBig: 'ფაილი დიდია — ჩაწერე ~1 წუთი.', micErr: 'მიკროფონი ვერ ჩაირთო.',
  },
  en: {
    title: 'Train my voice',
    hint: 'Record or upload ~1 minute of your voice — then songs are sung in your real voice.',
    tips: '🎯 Quiet room, close to the mic, speak or sing clearly. ~1 minute = best result.',
    rec: 'Record', stop: 'Stop', upload: 'Upload', remove: 'Remove', train: 'Start training',
    needMore: 'A bit more — ≥30s', goodLen: 'good ✓', idealLen: 'ideal ✓',
    training: 'Training your voice…', trainingNote: '~10–20 min. You can close this — it finishes in the background and appears automatically.',
    ready: 'Your voice is ready!', readyNote: 'Turn on "My trained voice" below and create a song.', retrain: 'Re-train',
    failed: 'Training failed — try again with a longer/cleaner recording.',
    checking: 'Checking…', tooBig: 'File too large — record ~1 minute.', micErr: 'Could not start the mic.',
  },
  ru: {
    title: 'Тренировка моего голоса',
    hint: 'Запишите или загрузите ~1 минуту голоса — затем песни поются вашим настоящим голосом.',
    tips: '🎯 Тихая комната, ближе к микрофону, говорите или пойте чётко. ~1 минута = лучший результат.',
    rec: 'Запись', stop: 'Стоп', upload: 'Загрузить', remove: 'Удалить', train: 'Начать тренировку',
    needMore: 'Ещё немного — ≥30с', goodLen: 'хорошо ✓', idealLen: 'идеально ✓',
    training: 'Идёт тренировка голоса…', trainingNote: '~10–20 мин. Можно закрыть — завершится в фоне и появится автоматически.',
    ready: 'Ваш голос готов!', readyNote: 'Включите «Мой голос» ниже и создайте песню.', retrain: 'Заново',
    failed: 'Не удалось — попробуйте длиннее/чище.',
    checking: 'Проверка…', tooBig: 'Файл слишком большой — ~1 минуту.', micErr: 'Не удалось включить микрофон.',
  },
} satisfies Record<Lang, Record<string, string>>;

type Status = 'checking' | 'idle' | 'have-sample' | 'training' | 'ready' | 'failed';
const MAX_REC = 180;
const MIN_REC = 30;
const IDEAL_REC = 55;

export function VoiceTrainer({ lang = 'ka', onReady }: { lang?: Lang; onReady?: (ready: boolean) => void }) {
  const t = S[lang];
  const [status, setStatus] = useState<Status>('checking');
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [level, setLevel] = useState(0);
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
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (status !== 'training') return;
    pollRef.current = setInterval(() => { void check(); }, 20_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, check]);

  const stopMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (acRef.current) { void acRef.current.close().catch(() => {}); acRef.current = null; }
    setLevel(0);
  }, []);

  const stopRec = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    stopMeter();
    setRecording(false);
  }, [stopMeter]);

  const startRec = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // Live level meter — reassures the user the mic is actually capturing voice.
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ac = new AC(); acRef.current = ac;
        const an = ac.createAnalyser(); an.fftSize = 256;
        ac.createMediaStreamSource(stream).connect(an);
        const data = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          an.getByteFrequencyData(data);
          let sum = 0; for (let i = 0; i < data.length; i++) { const v = data[i] ?? 0; sum += v * v; }
          setLevel(Math.min(1, Math.sqrt(sum / data.length) / 80));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch { /* meter optional */ }

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
    } catch { setError(t.micErr); setRecording(false); stopMeter(); }
  }, [stopRec, stopMeter, t.micErr]);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setError('');
    setBlob(f);
    setPreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(f); });
    setRecSec(60); // an uploaded clip is assumed long enough
    setStatus('have-sample');
  }, []);

  const clearSample = useCallback(() => {
    setBlob(null);
    setPreview((p) => { if (p) URL.revokeObjectURL(p); return ''; });
    setRecSec(0);
    setStatus('idle');
  }, []);

  useEffect(() => () => { stopRec(); if (pollRef.current) clearInterval(pollRef.current); }, [stopRec]);

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
  const lenLabel = recSec >= IDEAL_REC ? t.idealLen : recSec >= MIN_REC ? t.goodLen : t.needMore;
  const lenColor = recSec >= MIN_REC ? 'text-app-accent' : 'text-app-muted';

  return (
    <div className="rounded-xl border border-app-accent/30 bg-app-accent/[0.06] p-3.5">
      <div className="mb-1 flex items-center gap-1.5 text-[13px] font-bold text-app-text">
        <GraduationCap size={15} className="text-app-accent" /> {t.title}
      </div>

      {status === 'checking' && <div className="flex items-center gap-2 text-[12px] text-app-muted"><Loader2 size={13} className="animate-spin" /> {t.checking}</div>}

      {status === 'ready' && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-app-accent"><Check size={15} /> {t.ready}</div>
          <p className="text-[11px] leading-relaxed text-app-muted">{t.readyNote}</p>
          <button type="button" onClick={() => { setStatus('idle'); onReady?.(false); }} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-app-muted/70 transition-colors hover:text-app-text">
            <RefreshCw size={11} /> {t.retrain}
          </button>
        </div>
      )}

      {status === 'training' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-app-text"><Loader2 size={14} className="animate-spin text-app-accent" /> {t.training}</div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-border/20">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-app-accent/80" />
          </div>
          <p className="text-[11px] leading-relaxed text-app-muted/80">{t.trainingNote}</p>
        </div>
      )}

      {(status === 'idle' || status === 'failed') && (
        <>
          <p className="mb-1.5 text-[11px] leading-relaxed text-app-muted/80">{t.hint}</p>
          <p className="mb-2 text-[11px] leading-relaxed text-app-accent/80">{t.tips}</p>
          {status === 'failed' && <p className="mb-2 flex items-center gap-1 text-[11px] text-red-300"><AlertCircle size={12} /> {t.failed}</p>}
          {!recording ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={startRec} className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3.5 py-1.5 text-[12px] font-semibold text-white transition-transform hover:scale-105 active:scale-95"><Mic size={13} /> {t.rec}</button>
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-full border border-app-border/20 px-3.5 py-1.5 text-[12px] font-medium text-app-muted transition-colors hover:bg-app-elevated"><Upload size={13} /> {t.upload}</button>
              <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFile} />
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-lg bg-black/20 px-2.5 py-2">
              <button type="button" onClick={stopRec} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-slate-950"><Square size={11} fill="currentColor" /> {t.stop}</button>
              <span className="shrink-0 font-mono text-[13px] tabular-nums text-app-text">{fmt(recSec)}</span>
              <div className="flex flex-1 items-center gap-0.5">
                {Array.from({ length: 14 }).map((_, i) => {
                  const on = level * 14 > i;
                  return <span key={i} className={`flex-1 rounded-sm transition-all ${on ? 'bg-app-accent' : 'bg-app-border/25'}`} style={{ height: on ? `${6 + Math.random() * 12}px` : '5px' }} />;
                })}
              </div>
              <span className={`shrink-0 text-[10px] font-semibold ${lenColor}`}>{lenLabel}</span>
            </div>
          )}
        </>
      )}

      {status === 'have-sample' && (
        <div className="space-y-2">
          <p className="text-[11px] text-app-muted/80">{lenLabel === t.idealLen ? t.idealLen : recSec >= MIN_REC ? t.goodLen : t.needMore}</p>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={preview} controls className="h-9 min-w-0 flex-1" />
            <button type="button" onClick={clearSample} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-app-border/20 text-app-muted hover:bg-red-500/15 hover:text-red-300" aria-label={t.remove}><Trash2 size={14} /></button>
          </div>
          <button type="button" onClick={train} disabled={busy || recSec < MIN_REC} className="flex w-full items-center justify-center gap-2 rounded-lg bg-app-accent px-3 py-2.5 text-[13px] font-bold text-slate-950 transition-all hover:opacity-90 disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {recSec < MIN_REC ? t.needMore : t.train}
          </button>
        </div>
      )}

      {error && status !== 'failed' && <p className="mt-1.5 flex items-center gap-1 text-[11px] text-red-300"><AlertCircle size={12} /> {error}</p>}
    </div>
  );
}

export default VoiceTrainer;
