'use client';

/**
 * components/studio/ServiceParamsPanel.tsx — per-service parameter controls, INSIDE the chat box.
 *
 * The four services that own a full route (Montage, Dubbing, Presentation, 3D) are also driveable without
 * leaving the conversation: pick one in the composer's service menu and its own controls open right above
 * the input. The standalone /montage, /dubbing, /slides and /3d pages still exist and share these exact
 * API contracts — this is a second front-end onto the same routes, not a reimplementation of the work.
 *
 * Each service shows ONLY the parameters that matter to it. A montage needs shots and an aspect; a deck
 * needs a topic and a slide count; they have nothing in common, so a shared "options" blob would be a
 * worse fit than four small purpose-built forms.
 *
 * Every submit is a plain fetch to the v2 route, which does its own auth, validation, SSRF checks and
 * budget guarding — this component is deliberately dumb about all of that.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DUBBING_LANGUAGES, type DubbingLanguage } from '@/lib/services/dubbing/dubbingPlan';
import { MAX_SHOTS, MIN_SHOTS, MAX_TOTAL_SEC, timelineDuration, type MontageAspect, type MontageShot } from '@/lib/services/montage/montagePlan';
import { MAX_SLIDES, MIN_SLIDES, DEFAULT_SLIDES, type DeckLanguage } from '@/lib/services/presentation/deckPlan';
import { pollDelayMs, MAX_POLL_ATTEMPTS, type Model3dMode, type Model3dQuality } from '@/lib/services/model3d/model3dPlan';

const GlbViewer = dynamic(() => import('./GlbViewer'), { ssr: false });

export type PanelService = 'montage' | 'dubbing' | 'presentation' | 'model3d';
type Lang = 'ka' | 'en' | 'ru';

const COPY = {
  ka: {
    close: 'დახურვა', run: 'გაშვება', working: 'მიმდინარეობს…', failed: 'ვერ შესრულდა',
    keepOpen: 'რამდენიმე წუთი სჭირდება — არ დახუროთ გვერდი.',
    montage: 'მონტაჟი', dubbing: 'დუბლაჟი', presentation: 'პრეზენტაცია', model3d: '3D მოდელი',
    shots: 'კადრები (ბმულები)', addShot: '+ კადრი', aspect: 'ფორმატი', music: 'მუსიკა (არჩევითი)',
    duration: 'ხანგრძლივობა', sourceVideo: 'ვიდეოს ბმული', targetLang: 'სამიზნე ენა', keepBg: 'ფონური ხმა', subs: 'სუბტიტრები',
    topic: 'თემა', slides: 'სლაიდები', deckLang: 'ენა', withImages: 'სურათებით',
    fromText: 'ტექსტიდან', fromImage: 'ფოტოდან', describe: 'აღწერა', photoUrl: 'ფოტოს ბმული',
    quality: 'ხარისხი', draft: 'სწრაფი', standard: 'სტანდარტული', removeBg: 'ფონის მოცილება',
    open: 'გახსნა', download: 'ჩამოტვირთვა', reference: 'რეფერენსი',
  },
  en: {
    close: 'Close', run: 'Run', working: 'Working…', failed: 'Failed',
    keepOpen: 'This takes a few minutes — keep the page open.',
    montage: 'Montage', dubbing: 'Dubbing', presentation: 'Presentation', model3d: '3D Model',
    shots: 'Shots (URLs)', addShot: '+ Shot', aspect: 'Aspect', music: 'Music (optional)',
    duration: 'Duration', sourceVideo: 'Video URL', targetLang: 'Target language', keepBg: 'Background audio', subs: 'Subtitles',
    topic: 'Topic', slides: 'Slides', deckLang: 'Language', withImages: 'With images',
    fromText: 'From text', fromImage: 'From photo', describe: 'Description', photoUrl: 'Photo URL',
    quality: 'Quality', draft: 'Draft', standard: 'Standard', removeBg: 'Remove background',
    open: 'Open', download: 'Download', reference: 'Reference',
  },
  ru: {
    close: 'Закрыть', run: 'Запустить', working: 'Выполняется…', failed: 'Не удалось',
    keepOpen: 'Это займёт несколько минут — не закрывайте страницу.',
    montage: 'Монтаж', dubbing: 'Дубляж', presentation: 'Презентация', model3d: '3D-модель',
    shots: 'Кадры (ссылки)', addShot: '+ Кадр', aspect: 'Формат', music: 'Музыка (необязательно)',
    duration: 'Длительность', sourceVideo: 'Ссылка на видео', targetLang: 'Целевой язык', keepBg: 'Фоновый звук', subs: 'Субтитры',
    topic: 'Тема', slides: 'Слайды', deckLang: 'Язык', withImages: 'С изображениями',
    fromText: 'Из текста', fromImage: 'Из фото', describe: 'Описание', photoUrl: 'Ссылка на фото',
    quality: 'Качество', draft: 'Черновик', standard: 'Стандарт', removeBg: 'Удалить фон',
    open: 'Открыть', download: 'Скачать', reference: 'Референс',
  },
} satisfies Record<Lang, Record<string, string>>;

const LANGUAGE_LABEL: Record<DubbingLanguage, string> = {
  ka: 'ქართული', en: 'English', ru: 'Русский', de: 'Deutsch', fr: 'Français', es: 'Español',
  it: 'Italiano', tr: 'Türkçe', ar: 'العربية', zh: '中文', ja: '日本語', ko: '한국어',
};

interface Result {
  videoUrl?: string;
  glbUrl?: string;
  referenceUrl?: string;
  slides?: Array<{ index: number; pngUrl: string }>;
  subtitlesUrl?: string | null;
}

export function ServiceParamsPanel({
  service,
  locale,
  onClose,
}: {
  service: PanelService;
  locale: string;
  onClose: () => void;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Montage
  const [shotUrls, setShotUrls] = useState<string[]>(['', '']);
  const [aspect, setAspect] = useState<MontageAspect>('16:9');
  const [musicUrl, setMusicUrl] = useState('');
  // Dubbing
  const [sourceVideoUrl, setSourceVideoUrl] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<DubbingLanguage>(lang === 'ka' ? 'en' : 'ka');
  const [preserveBg, setPreserveBg] = useState(true);
  const [subtitles, setSubtitles] = useState(true);
  // Presentation
  const [topic, setTopic] = useState('');
  const [slideCount, setSlideCount] = useState(DEFAULT_SLIDES);
  const [deckLang, setDeckLang] = useState<DeckLanguage>(lang);
  const [withImages, setWithImages] = useState(false);
  // 3D
  const [mode3d, setMode3d] = useState<Model3dMode>('text');
  const [prompt3d, setPrompt3d] = useState('');
  const [imageUrl3d, setImageUrl3d] = useState('');
  const [quality3d, setQuality3d] = useState<Model3dQuality>('draft');
  const [removeBackground, setRemoveBackground] = useState(true);

  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  // 3D is the only one that submits then polls — reconstruction runs far past any request budget.
  const poll3d = useCallback(async (predictionId: string, jobId: string) => {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      if (cancelled.current) return;
      await new Promise((r) => setTimeout(r, pollDelayMs(attempt)));
      if (cancelled.current) return;
      const res = await fetch(
        `/api/v2/model3d/status?predictionId=${encodeURIComponent(predictionId)}&jobId=${encodeURIComponent(jobId)}`,
      ).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (!j) continue;
      if (j.status === 'succeeded' && j.glbUrl) { setResult((p) => ({ ...(p ?? {}), glbUrl: j.glbUrl })); return; }
      if (j.status === 'failed') { setError(j.message ? `${t.failed} · ${j.message}` : t.failed); return; }
    }
    setError(t.failed);
  }, [t]);

  const shots: MontageShot[] = shotUrls.map((url) => ({
    url, kind: 'video', startSec: 0, endSec: 5, muted: false, transition: 'cut',
  }));
  const montageTotal = timelineDuration(shots);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let endpoint = '';
      let body: Record<string, unknown> = {};

      if (service === 'montage') {
        endpoint = '/api/v2/montage/render';
        body = { shots: shots.filter((s) => s.url.trim()), aspect, ...(musicUrl.trim() ? { musicUrl: musicUrl.trim() } : {}) };
      } else if (service === 'dubbing') {
        endpoint = '/api/v2/dubbing/start';
        body = { sourceVideoUrl: sourceVideoUrl.trim(), sourceLanguage: 'auto', targetLanguage, preserveBackgroundAudio: preserveBg, subtitles };
      } else if (service === 'presentation') {
        endpoint = '/api/v2/presentation/build';
        body = { topic: topic.trim(), slideCount, language: deckLang, theme: 'dark', withImages };
      } else {
        endpoint = '/api/v2/model3d/create';
        body = { mode: mode3d, prompt: prompt3d.trim(), imageUrl: imageUrl3d.trim(), quality: quality3d, removeBackground };
      }

      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError([t.failed, j?.step, j?.message].filter(Boolean).join(' · '));
        return;
      }
      if (service === 'model3d') {
        // Show the reference image immediately; the mesh arrives via the poll below.
        setResult({ referenceUrl: j.referenceUrl });
        await poll3d(j.predictionId, j.jobId);
      } else {
        setResult(j as Result);
      }
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  const canRun = !busy && (
    service === 'montage' ? shotUrls.filter((u) => u.trim()).length >= MIN_SHOTS && montageTotal <= MAX_TOTAL_SEC
      : service === 'dubbing' ? Boolean(sourceVideoUrl.trim())
      : service === 'presentation' ? topic.trim().length >= 3
      : mode3d === 'text' ? prompt3d.trim().length >= 3 : Boolean(imageUrl3d.trim())
  );

  const field = 'w-full rounded-lg bg-app-elevated border border-app-border/15 px-2.5 py-1.5 text-[13px] !text-app-text outline-none focus:border-app-accent/50 transition-colors';
  const lbl = 'mb-1 block text-[11px] font-medium text-app-muted';

  return (
    <div className="mb-2 rounded-2xl border border-app-border/15 bg-app-surface/70 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-app-text">{t[service]}</span>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-[11px] text-app-muted hover:text-app-text">
          {t.close} ✕
        </button>
      </div>

      {service === 'montage' && (
        <div className="space-y-2">
          <span className={lbl}>{t.shots}</span>
          {shotUrls.map((url, i) => (
            <input
              key={i} type="url" value={url} placeholder="https://…/clip.mp4" className={field}
              onChange={(e) => setShotUrls((s) => s.map((v, j) => (j === i ? e.target.value : v)))}
            />
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button" disabled={shotUrls.length >= MAX_SHOTS}
              onClick={() => setShotUrls((s) => [...s, ''])}
              className="rounded-lg border border-app-border/15 px-2 py-1 text-[11px] text-app-muted disabled:opacity-30"
            >
              {t.addShot}
            </button>
            <select value={aspect} onChange={(e) => setAspect(e.target.value as MontageAspect)} className="w-auto rounded-lg bg-app-elevated border border-app-border/15 px-2 py-1 text-[12px] !text-app-text">
              {(['16:9', '9:16', '1:1'] as const).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className="text-[11px] text-app-muted">{t.duration}: {montageTotal.toFixed(1)}s</span>
          </div>
          <input type="url" value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)} placeholder={t.music} className={field} />
        </div>
      )}

      {service === 'dubbing' && (
        <div className="space-y-2">
          <label className="block">
            <span className={lbl}>{t.sourceVideo}</span>
            <input type="url" value={sourceVideoUrl} onChange={(e) => setSourceVideoUrl(e.target.value)} placeholder="https://…/video.mp4" className={field} />
          </label>
          <label className="block">
            <span className={lbl}>{t.targetLang}</span>
            <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value as DubbingLanguage)} className={field}>
              {DUBBING_LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_LABEL[l]}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-4 text-[12px] text-app-text">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={preserveBg} onChange={(e) => setPreserveBg(e.target.checked)} />{t.keepBg}</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={subtitles} onChange={(e) => setSubtitles(e.target.checked)} />{t.subs}</label>
          </div>
        </div>
      )}

      {service === 'presentation' && (
        <div className="space-y-2">
          <label className="block">
            <span className={lbl}>{t.topic}</span>
            <textarea rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} className={field} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number" min={MIN_SLIDES} max={MAX_SLIDES} value={slideCount}
              onChange={(e) => setSlideCount(Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Number(e.target.value) || DEFAULT_SLIDES)))}
              className="w-20 rounded-lg bg-app-elevated border border-app-border/15 px-2 py-1 text-[12px] !text-app-text" title={t.slides}
            />
            <select value={deckLang} onChange={(e) => setDeckLang(e.target.value as DeckLanguage)} className="w-auto rounded-lg bg-app-elevated border border-app-border/15 px-2 py-1 text-[12px] !text-app-text">
              <option value="ka">ქართული</option><option value="en">English</option><option value="ru">Русский</option>
            </select>
            <label className="flex items-center gap-1.5 text-[12px] text-app-text">
              <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} />{t.withImages}
            </label>
          </div>
        </div>
      )}

      {service === 'model3d' && (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            {(['text', 'image'] as const).map((m) => (
              <button
                key={m} type="button" onClick={() => setMode3d(m)}
                className={`rounded-lg px-2 py-1 text-[11px] ${mode3d === m ? 'bg-app-accent text-app-bg' : 'border border-app-border/15 text-app-muted'}`}
              >
                {m === 'text' ? t.fromText : t.fromImage}
              </button>
            ))}
          </div>
          {mode3d === 'text' ? (
            <label className="block">
              <span className={lbl}>{t.describe}</span>
              <textarea rows={2} value={prompt3d} onChange={(e) => setPrompt3d(e.target.value)} className={field} />
            </label>
          ) : (
            <label className="block">
              <span className={lbl}>{t.photoUrl}</span>
              <input type="url" value={imageUrl3d} onChange={(e) => setImageUrl3d(e.target.value)} placeholder="https://…/photo.jpg" className={field} />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <select value={quality3d} onChange={(e) => setQuality3d(e.target.value as Model3dQuality)} className="w-auto rounded-lg bg-app-elevated border border-app-border/15 px-2 py-1 text-[12px] !text-app-text">
              <option value="draft">{t.draft}</option><option value="standard">{t.standard}</option>
            </select>
            <label className="flex items-center gap-1.5 text-[12px] text-app-text">
              <input type="checkbox" checked={removeBackground} onChange={(e) => setRemoveBackground(e.target.checked)} />{t.removeBg}
            </label>
          </div>
        </div>
      )}

      <button
        type="button" onClick={run} disabled={!canRun}
        className="mt-2.5 w-full rounded-xl bg-app-accent px-3 py-2 text-[12.5px] font-semibold text-app-bg transition-opacity disabled:opacity-40"
      >
        {busy ? t.working : t.run}
      </button>
      {busy && <p className="mt-1.5 text-center text-[11px] text-app-muted">{t.keepOpen}</p>}
      {error && <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[12px] text-red-400">{error}</p>}

      {result && (
        <div className="mt-2.5 space-y-2">
          {result.videoUrl && (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={result.videoUrl} controls className="w-full rounded-xl" />
              <a href={result.videoUrl} download className="text-[11px] text-app-accent hover:underline">{t.download}</a>
            </>
          )}
          {result.subtitlesUrl && (
            <a href={result.subtitlesUrl} download className="ml-3 text-[11px] text-app-accent hover:underline">SRT</a>
          )}
          {result.slides && result.slides.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {result.slides.map((s) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s.index} src={s.pngUrl} alt="" className="w-full rounded-lg border border-app-border/10" />
              ))}
            </div>
          )}
          {/* The reference shows while the mesh is still reconstructing, so the wait is not a blank box. */}
          {result.referenceUrl && !result.glbUrl && (
            <div>
              <span className={lbl}>{t.reference}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.referenceUrl} alt="" className="w-32 rounded-lg border border-app-border/10" />
            </div>
          )}
          {result.glbUrl && (
            <>
              <GlbViewer url={result.glbUrl} />
              <a href={result.glbUrl} download className="text-[11px] text-app-accent hover:underline">GLB</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
