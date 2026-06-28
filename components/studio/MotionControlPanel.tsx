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

type Ratio = '9:16' | '1:1' | '16:9';
type Mood = 'energetic' | 'calm' | 'romantic' | 'epic' | 'happy';

const RATIOS: { id: Ratio; box: string; ka: string; en: string; ru: string }[] = [
  { id: '9:16', box: 'h-4 w-2.5', ka: 'რილსი', en: 'Reels', ru: 'Reels' },
  { id: '1:1', box: 'h-3.5 w-3.5', ka: 'პოსტი', en: 'Post', ru: 'Пост' },
  { id: '16:9', box: 'h-3 w-5', ka: 'YouTube', en: 'YouTube', ru: 'YouTube' },
];
const MOODS: { id: Mood; emoji: string; ka: string; en: string; ru: string }[] = [
  { id: 'energetic', emoji: '⚡', ka: 'ენერგიული', en: 'Energetic', ru: 'Энергично' },
  { id: 'calm', emoji: '🌊', ka: 'მშვიდი', en: 'Calm', ru: 'Спокойно' },
  { id: 'romantic', emoji: '💕', ka: 'რომანტიკა', en: 'Romantic', ru: 'Романтика' },
  { id: 'epic', emoji: '🏔️', ka: 'ეპიკური', en: 'Epic', ru: 'Эпично' },
  { id: 'happy', emoji: '😊', ka: 'მხიარული', en: 'Happy', ru: 'Весело' },
];
const ORIENT: Record<Ratio, 'vertical' | 'square' | 'landscape'> = { '9:16': 'vertical', '1:1': 'square', '16:9': 'landscape' };

export function MotionControlPanel({ locale = 'ka', onVideoGenerated }: { locale?: string; onVideoGenerated?: (url: string) => void }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = T[lang];
  const [charImage, setCharImage] = useState<string | null>(null);
  const [refVideo, setRefVideo] = useState<string | null>(null);
  const [motionPrompt, setMotionPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Enhancements: output format · optional background music · optional lip-sync voiceover.
  const [aspectRatio, setAspectRatio] = useState<Ratio>('9:16');
  const [enableMusic, setEnableMusic] = useState(false);
  const [musicMood, setMusicMood] = useState<Mood>('energetic');
  const [enableLipsync, setEnableLipsync] = useState(false);
  const [lipsyncText, setLipsyncText] = useState('');
  const [stage, setStage] = useState<string | null>(null); // sub-status during the multi-step run
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  const toDataUrl = (f: File): Promise<string> =>
    new Promise((res, rej) => { const r = new FileReader(); r.onload = (e) => res(e.target!.result as string); r.onerror = rej; r.readAsDataURL(f); });

  // Lip-sync post-step: speak the typed text on the cloned KA voice and key the mouth to
  // it via the EXISTING async /api/video/lipsync (HeyGen→SadTalker). It returns a jobId we
  // poll. Fail-open: any miss returns the original motion clip (never throws).
  async function applyLipsync(videoUrl: string): Promise<string> {
    try {
      const start = await fetch('/api/video/lipsync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ videoUrl, text: lipsyncText.trim(), orientation: ORIENT[aspectRatio] }),
      });
      const sj = (await start.json().catch(() => ({}))) as { jobId?: string | null };
      if (!sj.jobId) return videoUrl;
      for (let i = 0; i < 40; i++) { // ~40 × 6s ≈ 4 min headroom
        await new Promise((r) => setTimeout(r, 6000));
        const pr = await fetch(`/api/video/lipsync?id=${encodeURIComponent(sj.jobId)}`, { credentials: 'include' });
        const pj = (await pr.json().catch(() => ({}))) as { done?: boolean; url?: string | null };
        if (pj.done) return pj.url || videoUrl;
      }
      return videoUrl; // timed out → keep the motion clip
    } catch { return videoUrl; }
  }

  async function generate() {
    if (!charImage || !motionPrompt.trim() || busy) return;
    setBusy(true); setError(null); setResult(null); setStage('motion');
    try {
      // Lip-sync drives the audio (spoken voice), so the music bed is skipped when it's on.
      const wantLipsync = enableLipsync && !!lipsyncText.trim();
      const res = await fetch('/api/motion-control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          characterImageUrl: charImage,
          referenceVideoUrl: refVideo || undefined,
          motionPrompt: motionPrompt.trim(),
          duration: 5,
          aspectRatio,
          enableMusic: enableMusic && !wantLipsync,
          musicMood,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { videoUrl?: string; error?: string };
      if (!res.ok || !data.videoUrl) throw new Error(data.error || `HTTP ${res.status}`);
      let url = data.videoUrl;
      if (wantLipsync) { setStage('lipsync'); url = await applyLipsync(url); }
      setResult(url);
      onVideoGenerated?.(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); setStage(null); }
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

      {/* Aspect ratio — passed to Kling so the clip renders at the chosen format. */}
      <div className="space-y-1.5">
        <span className="text-[11px] uppercase tracking-wider text-app-muted">📐 {lang === 'en' ? 'Format' : lang === 'ru' ? 'Формат' : 'ფორმატი'}</span>
        <div className="grid grid-cols-3 gap-1.5">
          {RATIOS.map((r) => (
            <button key={r.id} type="button" onClick={() => setAspectRatio(r.id)}
              className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-center transition ${aspectRatio === r.id ? 'border-app-accent/50 bg-app-accent/15 text-app-accent' : 'border-app-border/20 bg-app-bg/40 text-app-muted hover:border-app-border/40'}`}>
              <span className="flex h-6 items-center justify-center"><span className={`rounded-sm border border-current ${r.box}`} /></span>
              <span className="text-[11px] font-medium">{r.id}</span>
              <span className="text-[9.5px] opacity-70">{r[lang]}</span>
            </button>
          ))}
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

      {/* Background music — instrumental MusicGen bed, muxed onto the clip server-side. */}
      <div className="space-y-2 border-t border-app-border/10 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🎵</span>
            <div>
              <p className="text-xs font-medium text-app-text">{lang === 'en' ? 'Background music' : lang === 'ru' ? 'Фоновая музыка' : 'ფონური მუსიკა'}</p>
              <p className="text-[10px] text-app-muted">{lang === 'en' ? 'AI-generated, instrumental' : lang === 'ru' ? 'ИИ, инструментал' : 'AI, ინსტრუმენტალი'}</p>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={enableMusic} aria-label="music" onClick={() => setEnableMusic((v) => !v)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enableMusic ? 'bg-app-accent' : 'bg-slate-300 dark:bg-slate-600'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enableMusic ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {enableMusic && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {MOODS.map((m) => (
              <button key={m.id} type="button" onClick={() => setMusicMood(m.id)}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${musicMood === m.id ? 'border-app-accent/50 bg-app-accent/15 text-app-accent' : 'border-app-border/20 bg-app-bg/40 text-app-muted hover:text-app-text'}`}>
                <span>{m.emoji}</span><span>{m[lang]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lip-sync — speak the typed text on the cloned KA voice + key the mouth to it
          (HeyGen→SadTalker via /api/video/lipsync). Owns the audio, so it overrides music. */}
      <div className="space-y-2 border-t border-app-border/10 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">👄</span>
            <div>
              <p className="text-xs font-medium text-app-text">Lip-Sync</p>
              <p className="text-[10px] text-app-muted">{lang === 'en' ? 'AI voice + mouth sync' : lang === 'ru' ? 'ИИ-голос + синхрон губ' : 'AI ხმა + ტუჩების სინქრონი'}</p>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={enableLipsync} aria-label="lipsync" onClick={() => setEnableLipsync((v) => !v)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enableLipsync ? 'bg-app-accent' : 'bg-slate-300 dark:bg-slate-600'}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enableLipsync ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {enableLipsync && (
          <>
            <textarea value={lipsyncText} onChange={(e) => setLipsyncText(e.target.value)} rows={2}
              placeholder={lang === 'en' ? 'Type text — AI will speak it (Georgian)…' : lang === 'ru' ? 'Текст — ИI озвучит…' : 'ჩაწერე ტექსტი (AI გაახმოვანებს ქართულად)…'}
              className="w-full resize-none rounded-xl border border-app-border/20 bg-app-bg/40 px-3 py-2 text-sm text-app-text placeholder:text-app-muted/60 focus:border-app-accent/50 focus:outline-none" />
            {enableMusic && (
              <p className="text-[10px] text-app-muted">ℹ️ {lang === 'en' ? 'Lip-sync replaces the music track.' : lang === 'ru' ? 'Lip-sync заменяет музыку.' : 'ლიპ-სინქი მუსიკას ჩაანაცვლებს.'}</p>
            )}
          </>
        )}
      </div>

      <button type="button" onClick={generate} disabled={!canGen}
        className={`flex w-full items-center justify-center gap-2.5 rounded-2xl py-4 text-sm font-bold transition active:scale-[0.98] ${canGen ? 'bg-app-accent text-app-bg shadow-lg' : 'cursor-not-allowed bg-app-elevated/60 text-app-muted'}`}>
        {busy ? <><Loader2 size={17} className="animate-spin" /><span>{t.working}</span></> : <><Sparkles size={17} /><span>{t.gen}</span></>}
      </button>

      {busy && (
        <div className="space-y-2 rounded-2xl border border-app-border/10 bg-app-bg/40 p-3.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-app-accent" />
            <span className="text-xs text-app-accent">
              {stage === 'lipsync' ? 'Lip-sync · HeyGen/SadTalker' : `Kling ${refVideo ? 'V2V→I2V' : 'I2V'} · Replicate`} · ~2–4 min
            </span>
          </div>
          {/* Step list reflects exactly what this run will do. */}
          <div className="space-y-1 text-[11px] text-app-muted">
            <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${stage === 'motion' ? 'bg-app-accent' : 'bg-app-accent/40'}`} /><span>{lang === 'en' ? 'Video generation (Kling v2.1)' : lang === 'ru' ? 'Генерация видео (Kling v2.1)' : 'ვიდეო (Kling v2.1)'}</span></div>
            {enableLipsync && lipsyncText.trim() ? (
              <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${stage === 'lipsync' ? 'bg-app-accent' : 'bg-app-accent/40'}`} /><span>Lip-sync</span></div>
            ) : enableMusic ? (
              <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-app-accent/40" /><span>{lang === 'en' ? 'Music (MusicGen)' : lang === 'ru' ? 'Музыка (MusicGen)' : 'მუსიკა (MusicGen)'}</span></div>
            ) : null}
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-app-elevated"><div className="h-full w-3/4 animate-pulse rounded-full bg-app-accent" /></div>
          <p className="text-[10.5px] text-app-muted">{aspectRatio} · {refVideo ? 'V2V' : 'I2V'}{enableLipsync && lipsyncText.trim() ? ' + lip-sync' : enableMusic ? ' + music' : ''}</p>
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
