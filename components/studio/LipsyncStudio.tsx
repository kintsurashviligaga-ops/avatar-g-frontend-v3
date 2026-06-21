'use client';

/**
 * LipsyncStudio (Service Hub — Card C). Dedicated precise facial / lip sync.
 *
 * Two clean dropzones — a base avatar VIDEO and a target AUDIO track (MP3/WAV) —
 * and one execute button. On run it uploads both to a private bucket (→ signed
 * https URLs) and hits POST /api/video/lipsync, which runs Wav2Lip
 * (devxpy/cog-wav2lip) on Replicate. Fail-open: any miss surfaces a clean notice
 * and leaves the inputs intact. Strict studio skin — black · white · #00D2FF.
 */

import { useCallback, useRef, useState } from 'react';
import { UploadCloud, Film, Music2, Wand2, Loader2, Download, X, AlertTriangle } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, {
  title: string; subtitle: string;
  videoLabel: string; videoHint: string; audioLabel: string; audioHint: string;
  execute: string; running: string; result: string; download: string;
  needBoth: string; failed: string; replace: string; authNeeded: string;
}> = {
  ka: {
    title: 'AI Lipsync სტუდია', subtitle: 'ზუსტი ტუჩების სინქრონი — საუბარი ან მუსიკა',
    videoLabel: 'ავატარის ვიდეო', videoHint: 'MP4 / MOV / WEBM — ჩააგდე ან აირჩიე',
    audioLabel: 'აუდიო ტრეკი', audioHint: 'MP3 / WAV — ჩააგდე ან აირჩიე',
    execute: 'ლიფსინკის გაშვება', running: 'სინქრონდება ტუჩები…', result: 'შედეგი',
    download: 'ჩამოტვირთვა', needBoth: 'ატვირთე ვიდეოც და აუდიოც.', failed: 'სინქრონი ვერ მოხერხდა. სცადე სხვა ფაილებით.', replace: 'შეცვლა', authNeeded: 'ლიფსინქისთვის ჯერ გაიარე ავტორიზაცია (ფაილების ასატვირთად).',
  },
  en: {
    title: 'AI Lipsync Studio', subtitle: 'Precise lip synchronization — speech or music',
    videoLabel: 'Avatar video', videoHint: 'MP4 / MOV / WEBM — drop or choose',
    audioLabel: 'Audio track', audioHint: 'MP3 / WAV — drop or choose',
    execute: 'Run lip-sync', running: 'Syncing the lips…', result: 'Result',
    download: 'Download', needBoth: 'Add both a video and an audio track.', failed: 'Lip-sync failed. Try different files.', replace: 'Replace', authNeeded: 'Sign in first to use lip-sync (to upload your files).',
  },
  ru: {
    title: 'AI Lipsync студия', subtitle: 'Точная синхронизация губ — речь или музыка',
    videoLabel: 'Видео аватара', videoHint: 'MP4 / MOV / WEBM — перетащите или выберите',
    audioLabel: 'Аудиодорожка', audioHint: 'MP3 / WAV — перетащите или выберите',
    execute: 'Запустить синхро', running: 'Синхронизирую губы…', result: 'Результат',
    download: 'Скачать', needBoth: 'Добавьте и видео, и аудио.', failed: 'Не удалось. Попробуйте другие файлы.', replace: 'Заменить', authNeeded: 'Войдите, чтобы использовать синхронизацию (для загрузки файлов).',
  },
};

interface Picked { dataUrl: string; name: string; type: string }

function readFile(file: File): Promise<Picked> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ dataUrl: String(r.result), name: file.name, type: file.type });
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

function Dropzone({
  accept, label, hint, picked, onPick, onClear, icon, replaceLabel,
}: {
  accept: string; label: string; hint: string; picked: Picked | null;
  onPick: (f: File) => void; onClear: () => void; icon: React.ReactNode; replaceLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onPick(f); }}
      className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
        over ? 'border-[#00D2FF] bg-[#00D2FF]/10' : picked ? 'border-[#00D2FF]/40 bg-[#00D2FF]/[0.04]' : 'border-white/15 bg-black hover:border-[#00D2FF]/40'
      }`}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${picked ? 'bg-[#00D2FF]/15 text-[#00D2FF]' : 'bg-white/5 text-neutral-400'}`}>{icon}</span>
      <p className="text-sm font-semibold text-white">{label}</p>
      {picked ? (
        <div className="flex items-center gap-2 text-[12px] text-[#00D2FF]">
          <span className="max-w-[180px] truncate">{picked.name}</span>
          <button type="button" onClick={onClear} aria-label="clear" className="text-neutral-500 hover:text-white"><X size={14} /></button>
        </div>
      ) : (
        <p className="text-[12px] text-neutral-500">{hint}</p>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-1 inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 py-2.5 text-[13px] font-medium text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-[#00D2FF]"
      >
        {picked ? replaceLabel : <span className="inline-flex items-center gap-1"><UploadCloud size={13} /> {hint.split('—')[0]?.trim()}</span>}
      </button>
    </div>
  );
}

export default function LipsyncStudio({ locale = 'ka' }: { locale?: Lang }) {
  const t = COPY[locale] ?? COPY.ka;
  const [video, setVideo] = useState<Picked | null>(null);
  const [audio, setAudio] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const upload = useCallback(async (p: Picked): Promise<{ url: string } | { error: 'auth' | 'fail' }> => {
    try {
      const res = await fetch('/api/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: p.dataUrl, contentType: p.type }), credentials: 'include',
      });
      // /api/upload is auth-gated: a logged-out user gets 401, which previously
      // surfaced only as a generic "lip-sync failed". Distinguish it so we can
      // tell the user the REAL reason (sign in) instead of "try other files".
      if (res.status === 401) return { error: 'auth' };
      const j = (await res.json().catch(() => ({}))) as { url?: string };
      return j.url && j.url.startsWith('https://') ? { url: j.url } : { error: 'fail' };
    } catch { return { error: 'fail' }; }
  }, []);

  const run = useCallback(async () => {
    if (!video || !audio) { setError(t.needBoth); return; }
    setError(null); setResultUrl(null); setBusy(true);
    try {
      const [v, a] = await Promise.all([upload(video), upload(audio)]);
      if ('error' in v || 'error' in a) {
        const authBlocked = ('error' in v && v.error === 'auth') || ('error' in a && a.error === 'auth');
        setError(authBlocked ? t.authNeeded : t.failed);
        return;
      }
      // Start the async lip-sync job. The route returns { jobId } — NOT a url;
      // the rendered result is delivered only by polling GET ?id=. (The old code
      // read j.url here, which is always undefined → every run showed "failed".)
      const startRes = await fetch('/api/video/lipsync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: v.url, audioUrl: a.url }), credentials: 'include',
      });
      const startJson = (await startRes.json().catch(() => ({}))) as { jobId?: string | null; error?: string | null };
      if (!startJson.jobId) { setError(startJson.error || t.failed); return; }

      // Poll job status every 5s, up to 60 retries (~5 min). Mirrors the OmniStudio
      // poll pattern: GET ?id=<jobId> → { done, url, error }. Complete on done+url;
      // fail only on an explicit failed/error status, or after the 60-retry budget.
      let settled = false;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await fetch(`/api/video/lipsync?id=${encodeURIComponent(startJson.jobId)}`, { credentials: 'include' });
        const pj = (await pollRes.json().catch(() => ({}))) as { done?: boolean; url?: string | null; error?: string | null };
        if (pj.done) {
          settled = true;
          if (pj.url && pj.url.startsWith('https://')) setResultUrl(pj.url);
          else setError(pj.error || t.failed);
          break;
        }
      }
      if (!settled) setError(t.failed); // exhausted 60 retries without completion
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }, [video, audio, upload, t]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      <header className="mb-5">
        <h1 className="text-lg font-bold tracking-tight text-white">{t.title}</h1>
        <p className="mt-0.5 text-[13px] text-neutral-500">{t.subtitle}</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Dropzone
          accept="video/*" label={t.videoLabel} hint={t.videoHint} picked={video} replaceLabel={t.replace}
          icon={<Film size={18} />}
          onPick={(f) => { void readFile(f).then(setVideo).catch(() => setError(t.failed)); }}
          onClear={() => setVideo(null)}
        />
        <Dropzone
          accept="audio/*" label={t.audioLabel} hint={t.audioHint} picked={audio} replaceLabel={t.replace}
          icon={<Music2 size={18} />}
          onPick={(f) => { void readFile(f).then(setAudio).catch(() => setError(t.failed)); }}
          onClear={() => setAudio(null)}
        />
      </div>

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || !video || !audio}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#00D2FF] to-[#0085FF] text-sm font-bold text-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {busy ? t.running : t.execute}
      </button>

      {error && (
        <p className="mt-3 inline-flex items-center gap-2 text-[13px] text-red-400">
          <AlertTriangle size={14} /> {error}
        </p>
      )}

      {resultUrl && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{t.result}</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={resultUrl} controls playsInline className="w-full rounded-xl border border-white/10 bg-black" />
          <a
            href={resultUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#00D2FF]/30 bg-[#00D2FF]/10 px-3 py-1.5 text-xs font-semibold text-[#00D2FF] transition-colors hover:bg-[#00D2FF]/20"
          >
            <Download size={13} /> {t.download}
          </a>
        </div>
      )}
    </div>
  );
}
