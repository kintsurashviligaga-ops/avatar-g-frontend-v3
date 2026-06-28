'use client';
/**
 * MotionControlPanel — character photo (+ optional reference video) + a motion prompt
 * → Kling animation via /api/motion-control. Reference video requests V2V (currently
 * degrades to motion-prompt I2V — Replicate has no true V2V Kling). Rendered as a tab
 * inside OmniStudio's Lip-sync mode.
 */
import { useRef, useState } from 'react';
import { Upload, Video, Sparkles, Loader2, X, CheckCircle, AlertCircle } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';
const T: Record<Lang, Record<string, string>> = {
  ka: { char: 'პერსონაჟი', motion: 'მოძრაობა (არჩევითი)', upload: 'ატვირთე', optional: 'სურვილისამებრ',
    ph: 'მოძრაობის აღწერა… (ქართულად ან ინგლისურად)', gen: 'მოძრაობის გენერაცია', working: 'გენერირდება…',
    done: 'მზადაა', dl: 'ჩამოტვირთვა', need: 'ატვირთე ფოტო და დაწერე მოძრაობა' },
  en: { char: 'Character', motion: 'Motion (optional)', upload: 'Upload', optional: 'optional',
    ph: 'Describe the motion… (Georgian or English)', gen: 'Generate motion', working: 'Generating…',
    done: 'Ready', dl: 'Download', need: 'Upload a photo and describe the motion' },
  ru: { char: 'Персонаж', motion: 'Движение (опц.)', upload: 'Загрузить', optional: 'опционально',
    ph: 'Опишите движение…', gen: 'Генерация движения', working: 'Генерация…',
    done: 'Готово', dl: 'Скачать', need: 'Загрузите фото и опишите движение' },
};

const QUICK: Record<Lang, { label: string; v: string }[]> = {
  ka: [
    { label: '💃 ცეკვა', v: 'dancing energetically, fluid graceful movements' },
    { label: '🚶 სვლა', v: 'walking confidently forward, cinematic tracking, natural gait' },
    { label: '😊 ემოცია', v: 'expressing joy, natural facial expressions, looking at camera' },
    { label: '🎤 სიმღერა', v: 'singing emotionally, mouth moving, expressive' },
    { label: '🌊 ნელი', v: 'slow graceful ethereal movement, cinematic' },
  ],
  en: [
    { label: '💃 Dance', v: 'dancing energetically, fluid graceful movements' },
    { label: '🚶 Walk', v: 'walking confidently forward, cinematic tracking, natural gait' },
    { label: '😊 Emotion', v: 'expressing joy, natural facial expressions, looking at camera' },
    { label: '🎤 Sing', v: 'singing emotionally, mouth moving, expressive' },
    { label: '🌊 Slow', v: 'slow graceful ethereal movement, cinematic' },
  ],
  ru: [
    { label: '💃 Танец', v: 'dancing energetically, fluid graceful movements' },
    { label: '🚶 Шаг', v: 'walking confidently forward, cinematic tracking, natural gait' },
    { label: '😊 Эмоция', v: 'expressing joy, natural facial expressions, looking at camera' },
    { label: '🎤 Песня', v: 'singing emotionally, mouth moving, expressive' },
    { label: '🌊 Плавно', v: 'slow graceful ethereal movement, cinematic' },
  ],
};

export function MotionControlPanel({ locale = 'ka', onVideoGenerated }: { locale?: string; onVideoGenerated?: (url: string) => void }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = T[lang];
  const [charImage, setCharImage] = useState<string | null>(null);
  const [refVideo, setRefVideo] = useState<string | null>(null);
  const [motionPrompt, setMotionPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  const toDataUrl = (f: File): Promise<string> =>
    new Promise((res, rej) => { const r = new FileReader(); r.onload = (e) => res(e.target!.result as string); r.onerror = rej; r.readAsDataURL(f); });

  async function generate() {
    if (!charImage || !motionPrompt.trim() || busy) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/motion-control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ characterImageUrl: charImage, referenceVideoUrl: refVideo || undefined, motionPrompt: motionPrompt.trim(), duration: 5, aspectRatio: '9:16' }),
      });
      const data = (await res.json().catch(() => ({}))) as { videoUrl?: string; error?: string };
      if (!res.ok || !data.videoUrl) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data.videoUrl);
      onVideoGenerated?.(data.videoUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const canGen = !!(charImage && motionPrompt.trim() && !busy);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        {/* Character photo */}
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-app-muted">📸 {t.char} *</span>
          <button type="button" onClick={() => imgRef.current?.click()}
            className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl border-2 border-dashed transition ${charImage ? 'border-app-accent/40 bg-app-accent/5' : 'border-app-border/30 bg-app-bg/40 hover:border-app-accent/30'}`}>
            {charImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={charImage} alt="" className="h-full w-full object-cover" />
                <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setCharImage(null); }}
                  className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-500"><X size={10} /></span>
              </>
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-2 text-app-muted">
                <Upload size={16} /><span className="text-[11px]">{t.upload}</span>
              </span>
            )}
          </button>
          <input ref={imgRef} type="file" accept="image/*" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCharImage(await toDataUrl(f)); }} />
        </div>
        {/* Reference video */}
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-app-muted">📹 {t.motion}</span>
          <button type="button" onClick={() => vidRef.current?.click()}
            className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl border-2 border-dashed transition ${refVideo ? 'border-app-accent/40 bg-app-accent/5' : 'border-app-border/30 bg-app-bg/40 hover:border-app-accent/30'}`}>
            {refVideo ? (
              <>
                <video src={refVideo} className="h-full w-full object-cover" muted playsInline loop autoPlay />
                <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setRefVideo(null); }}
                  className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-500"><X size={10} /></span>
              </>
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-1.5 text-app-muted">
                <Video size={16} /><span className="text-[11px]">{t.upload}</span><span className="text-[10px] opacity-70">{t.optional}</span>
              </span>
            )}
          </button>
          <input ref={vidRef} type="file" accept="video/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setRefVideo(URL.createObjectURL(f)); }} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK[lang].map((q) => (
          <button key={q.label} type="button" onClick={() => setMotionPrompt(q.v)}
            className={`rounded-lg border px-2.5 py-1 text-xs transition ${motionPrompt === q.v ? 'border-app-accent/50 bg-app-accent/15 text-app-accent' : 'border-app-border/20 bg-app-bg/40 text-app-muted hover:text-app-text'}`}>
            {q.label}
          </button>
        ))}
      </div>

      <textarea value={motionPrompt} onChange={(e) => setMotionPrompt(e.target.value)} rows={2} placeholder={t.ph}
        className="w-full resize-none rounded-xl border border-app-border/20 bg-app-bg/40 px-3 py-2.5 text-sm text-app-text placeholder:text-app-muted/60 focus:border-app-accent/50 focus:outline-none" />

      <button type="button" onClick={generate} disabled={!canGen}
        className={`flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-sm font-bold transition active:scale-[0.98] ${canGen ? 'bg-app-accent text-app-bg shadow-lg' : 'cursor-not-allowed bg-app-elevated/60 text-app-muted'}`}>
        {busy ? <><Loader2 size={17} className="animate-spin" /><span>{t.working}</span></> : <><Sparkles size={17} /><span>{t.gen}</span></>}
      </button>

      {busy && (
        <div className="rounded-2xl border border-app-border/10 bg-app-bg/40 p-3.5">
          <div className="mb-2 flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-app-accent" /><span className="text-xs text-app-accent">Kling {refVideo ? 'V2V→I2V' : 'I2V'} · Replicate · ~2–4 min</span></div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-app-elevated"><div className="h-full w-3/4 animate-pulse rounded-full bg-app-accent" /></div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3"><AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" /><p className="text-xs text-red-400">{error}</p></div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2"><CheckCircle size={13} className="text-green-400" /><span className="text-xs text-green-400">{t.done} ✅</span></div>
          <video src={result} controls playsInline className="w-full rounded-2xl" />
          <a href={result} download="motion-control.mp4" className="flex w-full items-center justify-center gap-2 rounded-xl border border-app-border/20 py-2.5 text-sm text-app-text hover:bg-app-elevated/40">⬇️ {t.dl}</a>
        </div>
      )}
    </div>
  );
}

export default MotionControlPanel;
