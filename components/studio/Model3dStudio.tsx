'use client';

/**
 * components/studio/Model3dStudio.tsx — the 3D surface.
 *
 * SUBMIT-THEN-POLL: text-to-3D takes minutes, well past any lambda budget, so the browser owns the job
 * lifecycle — the same pattern the film studio uses for Veo. The poll backs off (3s → 15s) and gives up
 * after a bounded number of attempts rather than spinning forever on a wedged job.
 *
 * BACKEND: Replicate (TRELLIS image-to-3D), not Meshy — Meshy has no API key on any environment, so it
 * could never run. Text mode goes Imagen 4 → reference image → reconstruction, which is why the reference
 * is shown: the user can see what the mesh is actually being built from.
 */
import dynamic from 'next/dynamic';
import { creditsUpdated } from '@/lib/billing/creditsUpdated';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pollDelayMs,
  MAX_POLL_ATTEMPTS,
  MAX_PROMPT_CHARS,
  type Model3dMode,
  type Model3dQuality,
} from '@/lib/services/model3d/model3dPlan';
import { ResultActions } from './ui/ResultActions';
import { GenerationProgress } from './ui/GenerationProgress';
import { Dropzone } from './ui/controls';
import { useUpload } from './ui/useUpload';
import { describeServiceError } from './ui/serviceError';
import {
  ChipGroup, Label, Field, TextArea, LabelledField, ToggleRow, PrimaryButton, SecondaryButton,
} from './ui/controls';

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
    imageUrl: 'ფოტოს ბმული', picked: 'სურათი არჩეულია', pick: 'აირჩიე სურათი', pickHint: 'ან ჩასვი ბმული ქვემოთ',
    quality: 'ხარისხი',
    draft: 'სწრაფი',
    standard: 'სტანდარტული',
    removeBg: 'ფონის მოცილება',
    submit: '3D მოდელის შექმნა',
    working: 'იქმნება…',
    warn: 'რამდენიმე წუთი სჭირდება. არ დახუროთ ეს გვერდი.',
    download: 'GLB ჩამოტვირთვა',
    failed: 'მოდელი ვერ შეიქმნა',
    notConfigured: '3D გენერაცია ამ დეპლოიმენტზე არ არის ხელმისაწვდომი — API გასაღები არ არის დაყენებული.',
    timeout: 'დიდი დრო დასჭირდა — სცადეთ თავიდან.',
  },
  en: {
    title: '3D Studio',
    subtitle: 'From text or a photo to a 3D model (GLB)',
    modeText: 'From text',
    modeImage: 'From photo',
    prompt: 'Description',
    promptPlaceholder: 'e.g. a ceramic teapot with Georgian ornament',
    imageUrl: 'Photo URL', picked: 'Image selected', pick: 'Choose an image', pickHint: 'or paste a link below',
    quality: 'Quality',
    draft: 'Draft',
    standard: 'Standard',
    removeBg: 'Remove background',
    submit: 'Generate 3D model',
    working: 'Generating…',
    warn: 'This takes a few minutes. Keep this tab open.',
    download: 'Download GLB',
    failed: 'The model could not be generated',
    notConfigured: '3D generation is unavailable on this deployment — the API key is not configured.',
    timeout: 'This took too long — please try again.',
  },
  ru: {
    title: '3D-студия',
    subtitle: 'Из текста или фото — в 3D-модель (GLB)',
    modeText: 'Из текста',
    modeImage: 'Из фото',
    prompt: 'Описание',
    promptPlaceholder: 'напр. керамический чайник с грузинским орнаментом',
    imageUrl: 'Ссылка на фото', picked: 'Изображение выбрано', pick: 'Выберите изображение', pickHint: 'или вставьте ссылку ниже',
    quality: 'Качество',
    draft: 'Черновик',
    standard: 'Стандарт',
    removeBg: 'Удалить фон',
    submit: 'Создать 3D-модель',
    working: 'Создаём…',
    warn: 'Это займёт несколько минут. Не закрывайте вкладку.',
    download: 'Скачать GLB',
    failed: 'Не удалось создать модель',
    notConfigured: '3D-генерация недоступна на этом деплое — не настроен API-ключ.',
    timeout: 'Слишком долго — попробуйте снова.',
  },
} satisfies Record<Lang, Record<string, string>>;

export function Model3dStudio({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [mode, setMode] = useState<Model3dMode>('text');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [quality, setQuality] = useState<Model3dQuality>('draft');
  const [removeBackground, setRemoveBackground] = useState(true);
  const [busy, setBusy] = useState(false);
  const { upload: uploadFile, busy: uploading, error: uploadError } = useUpload(locale);
  // ⚠️ A 1px INDETERMINATE BAR IS NOT PROGRESS. This render is measured in MINUTES, and against that a
  // bar with one static label is indistinguishable from a hang — so the reasonable response, reload or
  // press it again, either loses the render or pays for a second one. The shared card shows the stage,
  // the elapsed clock and a realistic remaining estimate, the same as every other service.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 500);
    return () => window.clearInterval(id);
  }, [busy]);

  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);

  // Survives unmount so a poll loop cannot keep running against a dead component.
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const poll = useCallback(async (predictionId: string, jobId: string) => {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      if (cancelled.current) return;
      await new Promise((r) => setTimeout(r, pollDelayMs(attempt)));
      if (cancelled.current) return;

      const res = await fetch(
        `/api/v2/model3d/status?predictionId=${encodeURIComponent(predictionId)}&jobId=${encodeURIComponent(jobId)}`,
      ).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (!j) continue;

      if (typeof j.progress === 'number') setProgress(j.progress);
      if (j.status === 'succeeded' && j.glbUrl) {
        setGlbUrl(j.glbUrl);
        return;
      }
      if (j.status === 'failed') {
        // Same defect, shorter form: `${t.failed} · ${j.message}` still pastes the provider's English
        // sentence onto Georgian copy. The mapper keeps an unrecognised one off the screen.
        setError(describeServiceError(j.message, locale, t.failed));
        return;
      }
    }
    setError(t.timeout);
  }, [t]);

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
        body: JSON.stringify({ mode, prompt: prompt.trim(), imageUrl: imageUrl.trim(), quality, removeBackground }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        // The one failure worth naming precisely rather than lumping into a generic error.
        setError(j?.error === 'provider_not_configured' ? t.notConfigured : [t.failed, j?.message].filter(Boolean).join(' · '));
        return;
      }
      creditsUpdated(); // the reconstruction is submitted and billed — refresh the header pill
      await poll(j.predictionId, j.jobId);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-app-surface px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-2xl font-semibold text-app-text">{t.title}</h1>
        <p className="mt-1 text-sm text-app-muted">{t.subtitle}</p>

        <div className="mt-8 space-y-4 rounded-2xl border border-app-border/15 bg-app-elevated/40 p-5">
          <ChipGroup
            value={mode}
            onChange={setMode}
            options={[{ id: 'text' as const, label: `✍️ ${t.modeText}` }, { id: 'image' as const, label: `🖼 ${t.modeImage}` }]}
          />

          {mode === 'text' ? (
            <LabelledField label={t.prompt} maxLength={MAX_PROMPT_CHARS} value={prompt}>
              <TextArea rows={3} value={prompt} maxLength={MAX_PROMPT_CHARS} onChange={(e) => setPrompt(e.target.value)} placeholder={t.promptPlaceholder} />
            </LabelledField>
          ) : (
            <div className="min-w-0 space-y-2">
              <Label>{t.imageUrl}</Label>
              {/* ⚠️ A TYPED https URL IS NOT AVAILABLE TO A PHONE. The photo lives in the camera roll,
                  not on a server the user controls — the same gap Dubbing had, while the in-chat panel
                  drove this route with a real picker all along. The URL field stays for a link to
                  something already online; both write the same state. */}
              <Dropzone
                id="m3d-image"
                accept="image/*"
                disabled={busy || uploading}
                filled={Boolean(imageUrl)}
                title={imageUrl ? t.picked : t.pick}
                hint={t.pickHint}
                onFiles={(files) => {
                  const f = files[0];
                  if (!f) return;
                  void (async () => { const path = await uploadFile(f); if (path) setImageUrl(path); })();
                }}
              />
              {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
              <Field type="url" inputMode="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/photo.jpg" />
            </div>
          )}

          <ChipGroup
            label={t.quality}
            value={quality}
            onChange={setQuality}
            options={[{ id: 'draft' as const, label: `⚡ ${t.draft}` }, { id: 'standard' as const, label: `✨ ${t.standard}` }]}
          />
          <ToggleRow on={removeBackground} onChange={setRemoveBackground} label={t.removeBg} />

          <PrimaryButton
            onClick={submit}
            loading={busy}
            full
            disabled={mode === 'text' ? prompt.trim().length < 3 : !imageUrl.trim()}
          >
            {/* The percentage used to render as a bare trailing space: the status endpoint returns no
                `progress` field, so the button read "Generating… " and never advanced. */}
            {busy ? t.working : t.submit}
          </PrimaryButton>
          {/* `progress` is still wired from the poll, so the bar becomes determinate the moment the
              endpoint starts reporting one. Until then it animates rather than sitting frozen at 0%,
              which is what made a multi-minute reconstruction look like a hung page. */}
          {busy && <GenerationProgress kind="model3d" elapsed={elapsed} locale={(locale === 'en' || locale === 'ru' ? locale : 'ka')} {...(progress > 0 ? { pct: progress } : {})} />}
          {busy && <p className="text-center text-xs text-app-muted">{t.warn}</p>}
          {/* ⚠️ A FAILURE WAS A DEAD END. The error rendered alone, with no control beside it, so the user
              had to work out for themselves that the primary button doubles as the retry and that their
              inputs had survived. Everything the run needs is still in component state, so retrying is
              one call — it just was never offered. */}
          {error && (
            <div className="space-y-2">
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
              <SecondaryButton onClick={submit} disabled={busy}>
                {locale === 'en' ? 'Try again' : locale === 'ru' ? 'Попробовать снова' : 'ხელახლა ცდა'}
              </SecondaryButton>
            </div>
          )}
        </div>

        {glbUrl && (
          <div className="mt-6 space-y-3">
            <GlbViewer url={glbUrl} />
            {/* ⚠️ WAS `<a href={url} download>`, WHICH DOES NOT DOWNLOAD. A browser ignores the `download`
            attribute on a CROSS-ORIGIN href, and every one of these is a signed storage link — so the tap
            navigated away from the app to the raw file instead of saving it. ResultActions fetches the
            bytes into a Blob, offers the iOS share sheet (the only route to Photos), and files the asset
            into the Library, which several services never did server-side. */}
            <ResultActions url={glbUrl} kind="model3d" locale={(locale === 'en' || locale === 'ru' ? locale : 'ka')} />
          </div>
        )}
      </div>
    </div>
  );
}
