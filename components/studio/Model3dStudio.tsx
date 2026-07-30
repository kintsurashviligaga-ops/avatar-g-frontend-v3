'use client';

/**
 * components/studio/Model3dStudio.tsx — the 3D surface.
 *
 * SUBMIT-THEN-POLL: text-to-3D takes minutes, well past any lambda budget, so the browser owns the job
 * lifecycle — the same pattern the film studio uses for Veo. The poll backs off (3s → 15s) and gives up
 * after a bounded number of attempts rather than spinning forever on a wedged job.
 *
 * ⚠️ This deployment has NO MESHY_API_KEY. The API answers 503 `provider_not_configured` and the UI says
 * so plainly instead of failing with a generic error. The catalogue tile stays "coming soon" until a key
 * exists and returns a real GLB.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pollDelayMs,
  MAX_POLL_ATTEMPTS,
  MAX_POLYCOUNT,
  MIN_POLYCOUNT,
  DEFAULT_POLYCOUNT,
  type MeshyMode,
  type MeshyQuality,
} from '@/lib/services/model3d/meshyPlan';

// three touches `window` on import — it cannot be server-rendered.
const GlbViewer = dynamic(() => import('./GlbViewer'), { ssr: false });

type Lang = 'ka' | 'en' | 'ru';

const COPY = {
  ka: {
    title: '3D სტუდია',
    subtitle: 'ტექსტიდან ან ფოტოდან — 3D მოდელამდე (GLB)',
    modeText: 'ტექსტიდან',
    modeImage: 'ფოტოდან',
    prompt: 'აღწერა',
    promptPlaceholder: 'მაგ. კერამიკული ჩაიდანი, ქართული ორნამენტით',
    imageUrl: 'ფოტოს ბმული',
    quality: 'ხარისხი',
    draft: 'სწრაფი',
    standard: 'სტანდარტული',
    polycount: 'პოლიგონები',
    submit: '3D მოდელის შექმნა',
    working: 'იქმნება…',
    warn: 'რამდენიმე წუთი სჭირდება. არ დახუროთ ეს გვერდი.',
    download: 'GLB ჩამოტვირთვა',
    failed: 'მოდელი ვერ შეიქმნა',
    notConfigured: '3D გენერაცია ჯერ არ არის ხელმისაწვდომი — Meshy-ის API გასაღები არ არის დაყენებული.',
    timeout: 'დიდი დრო დასჭირდა — სცადეთ თავიდან.',
  },
  en: {
    title: '3D Studio',
    subtitle: 'From text or a photo to a 3D model (GLB)',
    modeText: 'From text',
    modeImage: 'From photo',
    prompt: 'Description',
    promptPlaceholder: 'e.g. a ceramic teapot with Georgian ornament',
    imageUrl: 'Photo URL',
    quality: 'Quality',
    draft: 'Draft',
    standard: 'Standard',
    polycount: 'Polygons',
    submit: 'Generate 3D model',
    working: 'Generating…',
    warn: 'This takes a few minutes. Keep this tab open.',
    download: 'Download GLB',
    failed: 'The model could not be generated',
    notConfigured: '3D generation is not available yet — the Meshy API key is not configured.',
    timeout: 'This took too long — please try again.',
  },
  ru: {
    title: '3D-студия',
    subtitle: 'Из текста или фото — в 3D-модель (GLB)',
    modeText: 'Из текста',
    modeImage: 'Из фото',
    prompt: 'Описание',
    promptPlaceholder: 'напр. керамический чайник с грузинским орнаментом',
    imageUrl: 'Ссылка на фото',
    quality: 'Качество',
    draft: 'Черновик',
    standard: 'Стандарт',
    polycount: 'Полигоны',
    submit: 'Создать 3D-модель',
    working: 'Создаём…',
    warn: 'Это займёт несколько минут. Не закрывайте вкладку.',
    download: 'Скачать GLB',
    failed: 'Не удалось создать модель',
    notConfigured: '3D-генерация пока недоступна — не настроен API-ключ Meshy.',
    timeout: 'Слишком долго — попробуйте снова.',
  },
} satisfies Record<Lang, Record<string, string>>;

export function Model3dStudio({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [mode, setMode] = useState<MeshyMode>('text');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [quality, setQuality] = useState<MeshyQuality>('draft');
  const [targetPolycount, setPolycount] = useState(DEFAULT_POLYCOUNT);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);

  // Survives unmount so a poll loop cannot keep running against a dead component.
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const poll = useCallback(async (taskId: string, jobId: string) => {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      if (cancelled.current) return;
      await new Promise((r) => setTimeout(r, pollDelayMs(attempt)));
      if (cancelled.current) return;

      const res = await fetch(
        `/api/v2/model3d/status?taskId=${encodeURIComponent(taskId)}&mode=${mode}&jobId=${encodeURIComponent(jobId)}`,
      ).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (!j) continue;

      if (typeof j.progress === 'number') setProgress(j.progress);
      if (j.status === 'succeeded' && j.glbUrl) {
        setGlbUrl(j.glbUrl);
        return;
      }
      if (j.status === 'failed') {
        setError(j.message ? `${t.failed} · ${j.message}` : t.failed);
        return;
      }
    }
    setError(t.timeout);
  }, [mode, t]);

  async function submit() {
    if (busy) return;
    if (mode === 'text' ? prompt.trim().length < 3 : !imageUrl.trim()) return;
    setBusy(true);
    setError(null);
    setGlbUrl(null);
    setProgress(0);
    try {
      const res = await fetch('/api/v2/model3d/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, prompt: prompt.trim(), imageUrl: imageUrl.trim(), quality, targetPolycount }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        // The one failure worth naming precisely rather than lumping into a generic error.
        setError(j?.error === 'provider_not_configured' ? t.notConfigured : [t.failed, j?.message].filter(Boolean).join(' · '));
        return;
      }
      await poll(j.taskId, j.jobId);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-xl bg-app-elevated border border-app-border/15 px-3 py-2.5 text-sm !text-app-text outline-none focus:border-app-accent/50 transition-colors';

  return (
    <div className="min-h-screen bg-app-surface px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-2xl font-semibold text-app-text">{t.title}</h1>
        <p className="mt-1 text-sm text-app-muted">{t.subtitle}</p>

        <div className="mt-8 space-y-4 rounded-2xl border border-app-border/15 bg-app-elevated/40 p-5">
          <div className="flex gap-2">
            {(['text', 'image'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${mode === m ? 'bg-app-accent text-app-bg' : 'border border-app-border/15 text-app-muted'}`}
              >
                {m === 'text' ? t.modeText : t.modeImage}
              </button>
            ))}
          </div>

          {mode === 'text' ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.prompt}</span>
              <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t.promptPlaceholder} className={field} />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.imageUrl}</span>
              <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/photo.jpg" className={field} />
            </label>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.quality}</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value as MeshyQuality)} className={field}>
                <option value="draft">{t.draft}</option>
                <option value="standard">{t.standard}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-app-muted">{t.polycount}</span>
              <input
                type="number" min={MIN_POLYCOUNT} max={MAX_POLYCOUNT} step={1000} value={targetPolycount}
                onChange={(e) => setPolycount(Math.max(MIN_POLYCOUNT, Math.min(MAX_POLYCOUNT, Number(e.target.value) || DEFAULT_POLYCOUNT)))}
                className={field}
              />
            </label>
          </div>

          <button
            type="button" onClick={submit}
            disabled={busy || (mode === 'text' ? prompt.trim().length < 3 : !imageUrl.trim())}
            className="w-full rounded-xl bg-app-accent px-4 py-3 text-sm font-semibold text-app-bg transition-opacity disabled:opacity-40"
          >
            {busy ? `${t.working} ${progress > 0 ? `${Math.round(progress)}%` : ''}` : t.submit}
          </button>
          {busy && <p className="text-center text-xs text-app-muted">{t.warn}</p>}
          {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
        </div>

        {glbUrl && (
          <div className="mt-6 space-y-3">
            <GlbViewer url={glbUrl} />
            <a href={glbUrl} download className="inline-block text-xs text-app-accent hover:underline">{t.download}</a>
          </div>
        )}
      </div>
    </div>
  );
}
