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
import { MIN_SHOTS, MAX_TOTAL_SEC, timelineDuration, type MontageAspect } from '@/lib/services/montage/montagePlan';
import { MontageEditor, type EditorClip } from './MontageEditor';
import {
  Panel, PanelHeader, Group, Row, Label, TextArea, LabelledField,
  ChipGroup, ToggleRow, PrimaryButton, GhostButton, Note, ProgressBar, Dropzone,
} from './ui/controls';
import { useUpload } from './ui/useUpload';
import { GenerationProgress } from './ui/GenerationProgress';
import { MAX_SLIDES, MIN_SLIDES, DEFAULT_SLIDES, type DeckLanguage } from '@/lib/services/presentation/deckPlan';
import { pollDelayMs, MAX_POLL_ATTEMPTS, MAX_PROMPT_CHARS, type Model3dMode, type Model3dQuality } from '@/lib/services/model3d/model3dPlan';

/**
 * Server-side caps, surfaced in the UI.
 *
 * Both routes silently truncate past these, and the boxes that fed them accepted more and said nothing —
 * so a long topic or prompt simply stopped mattering partway through with no indication. The counter on
 * LabelledField makes the ceiling visible instead of letting the words disappear.
 */
const MAX_TOPIC_CHARS = 300;

/** One style for every download link in the panel — they were three different inline strings. */
const DOWNLOAD_LINK = 'tap-44 relative inline-flex items-center text-[12px] font-medium text-app-accent hover:underline';

const GlbViewer = dynamic(() => import('./GlbViewer'), { ssr: false });

export type PanelService = 'montage' | 'dubbing' | 'presentation' | 'model3d';
type Lang = 'ka' | 'en' | 'ru';

const COPY = {
  ka: {
    close: 'დახურვა', run: 'გაშვება', working: 'მიმდინარეობს…', failed: 'ვერ შესრულდა',
    keepOpen: 'რამდენიმე წუთი სჭირდება — არ დახუროთ გვერდი.',
    montage: 'მონტაჟი', dubbing: 'დუბლაჟი', presentation: 'პრეზენტაცია', model3d: '3D მოდელი',
    shots: 'კადრები', addShot: '+ კადრი', aspect: 'ფორმატი', music: 'მუსიკა (არჩევითი)',
    trimFrom: 'დან', trimTo: 'მდე', transition: 'გადასვლა', cut: 'მკვეთრი', crossfade: 'გადადნობა',
    fadeBlack: 'შავში', caption: 'წარწერა', mute: 'ხმის გარეშე', musicOnly: 'მხოლოდ მუსიკა',
    fullEditor: 'სრული რედაქტორი →',
    duration: 'ხანგრძლივობა', sourceVideo: 'ვიდეოს ბმული', targetLang: 'სამიზნე ენა', keepBg: 'ფონური ხმა', subs: 'სუბტიტრები',
    topic: 'თემა', slides: 'სლაიდები', deckLang: 'ენა', withImages: 'სურათებით',
    fromText: 'ტექსტიდან', fromImage: 'ფოტოდან', describe: 'აღწერა', photoUrl: 'ფოტოს ბმული',
    quality: 'ხარისხი', draft: 'სწრაფი', standard: 'სტანდარტული', removeBg: 'ფონის მოცილება',
    open: 'გახსნა', download: 'ჩამოტვირთვა', reference: 'რეფერენსი',
    dubSourceHint: 'MP4 / MOV — მაქსიმუმ 5 წუთი, 50MB-მდე',
    pickVideo: 'აირჩიე ან ჩააგდე ვიდეო', pickPhoto: 'აირჩიე ან ჩააგდე ფოტო',
    photoHint: 'JPG / PNG — ერთი საგანი, სუფთა ფონი',
    uploading: 'იტვირთება…', fileReady: 'ფაილი მზადაა ✓',
    keepBgHint: 'ორიგინალი ფონური ხმა შენარჩუნდება მუსიკისა და ეფექტებისთვის.',
    topicPh: 'რაზე უნდა იყოს პრეზენტაცია?',
    deckOptions: 'პარამეტრები', withImagesHint: 'თითო სლაიდს დაემატება გენერირებული სურათი (უფრო ნელია).',
    describePh: 'აღწერე ობიექტი — ერთი საგანი, სუფთა ფონი',
    describeHint: 'ერთი საგანი ყველაზე კარგად მუშაობს — არა სცენა.',
    removeBgHint: 'ფონი მოცილდება რეკონსტრუქციამდე.',
  },
  en: {
    close: 'Close', run: 'Run', working: 'Working…', failed: 'Failed',
    keepOpen: 'This takes a few minutes — keep the page open.',
    montage: 'Montage', dubbing: 'Dubbing', presentation: 'Presentation', model3d: '3D Model',
    shots: 'Shots', addShot: '+ Shot', aspect: 'Aspect', music: 'Music (optional)',
    trimFrom: 'From', trimTo: 'To', transition: 'Transition', cut: 'Cut', crossfade: 'Crossfade',
    fadeBlack: 'Through black', caption: 'Caption', mute: 'Mute', musicOnly: 'Music only',
    fullEditor: 'Full editor →',
    duration: 'Duration', sourceVideo: 'Video URL', targetLang: 'Target language', keepBg: 'Background audio', subs: 'Subtitles',
    topic: 'Topic', slides: 'Slides', deckLang: 'Language', withImages: 'With images',
    fromText: 'From text', fromImage: 'From photo', describe: 'Description', photoUrl: 'Photo URL',
    quality: 'Quality', draft: 'Draft', standard: 'Standard', removeBg: 'Remove background',
    open: 'Open', download: 'Download', reference: 'Reference',
    dubSourceHint: 'MP4 / MOV — up to 5 minutes, 50MB max',
    pickVideo: 'Choose or drop a video', pickPhoto: 'Choose or drop a photo',
    photoHint: 'JPG / PNG — a single object, plain background',
    uploading: 'Uploading…', fileReady: 'File ready ✓',
    keepBgHint: 'Keeps the original background audio for music and effects.',
    topicPh: 'What should the deck be about?',
    deckOptions: 'Options', withImagesHint: 'Adds a generated image to each slide (slower).',
    describePh: 'Describe the object — a single item, plain background',
    describeHint: 'A single object reconstructs best — not a scene.',
    removeBgHint: 'Cuts the background out before reconstruction.',
  },
  ru: {
    close: 'Закрыть', run: 'Запустить', working: 'Выполняется…', failed: 'Не удалось',
    keepOpen: 'Это займёт несколько минут — не закрывайте страницу.',
    montage: 'Монтаж', dubbing: 'Дубляж', presentation: 'Презентация', model3d: '3D-модель',
    shots: 'Кадры', addShot: '+ Кадр', aspect: 'Формат', music: 'Музыка (необязательно)',
    trimFrom: 'От', trimTo: 'До', transition: 'Переход', cut: 'Резкий', crossfade: 'Наплыв',
    fadeBlack: 'Через чёрное', caption: 'Подпись', mute: 'Без звука', musicOnly: 'Только музыка',
    fullEditor: 'Полный редактор →',
    duration: 'Длительность', sourceVideo: 'Ссылка на видео', targetLang: 'Целевой язык', keepBg: 'Фоновый звук', subs: 'Субтитры',
    topic: 'Тема', slides: 'Слайды', deckLang: 'Язык', withImages: 'С изображениями',
    fromText: 'Из текста', fromImage: 'Из фото', describe: 'Описание', photoUrl: 'Ссылка на фото',
    quality: 'Качество', draft: 'Черновик', standard: 'Стандарт', removeBg: 'Удалить фон',
    open: 'Открыть', download: 'Скачать', reference: 'Референс',
    dubSourceHint: 'MP4 / MOV — до 5 минут, максимум 50 МБ',
    pickVideo: 'Выберите или перетащите видео', pickPhoto: 'Выберите или перетащите фото',
    photoHint: 'JPG / PNG — один объект, чистый фон',
    uploading: 'Загрузка…', fileReady: 'Файл готов ✓',
    keepBgHint: 'Сохраняет оригинальный фоновый звук — музыку и эффекты.',
    topicPh: 'О чём должна быть презентация?',
    deckOptions: 'Параметры', withImagesHint: 'Добавляет к каждому слайду сгенерированное изображение (медленнее).',
    describePh: 'Опишите объект — один предмет, чистый фон',
    describeHint: 'Один объект реконструируется лучше всего — не сцена.',
    removeBgHint: 'Удаляет фон перед реконструкцией.',
  },
} satisfies Record<Lang, Record<string, string>>;

/**
 * The pipelines write machine stage names (extract_audio, transcribe, stitch, outline…) to the job row.
 * Showing those raw would be worse than showing nothing, so each is given a human sentence. An unknown
 * stage falls through to the raw name rather than to silence — a new leg should still be visible.
 */
/** Each panel service's progress vocabulary and wall-clock pacing. */
const PROGRESS_KIND = {
  montage: 'montage',
  dubbing: 'dubbing',
  presentation: 'presentation',
  model3d: 'model3d',
} as const;

const STAGE_LABELS: Record<Lang, Record<string, string>> = {
  ka: {
    queued: 'რიგში…',
    resolve: 'ფაილები მოწმდება…', bridge: 'ფოტოები კადრებად…', normalize: 'ფორმატი ერთდება…',
    stitch: 'კადრები იკერება…', music: 'მუსიკა ედება…',
    extract_audio: 'ხმა გამოიყოფა…', transcribe: 'ტექსტი იშიფრება…', translate: 'ითარგმნება…',
    synthesize: 'ხმა იწერება…', sync: 'დრო ეწყობა…', mix: 'მიქსი…',
    outline: 'გეგმა იწერება…', visuals: 'სურათები იქმნება…', render: 'სლაიდები იხატება…',
  },
  en: {
    queued: 'Queued…',
    resolve: 'Checking files…', bridge: 'Turning photos into shots…', normalize: 'Matching formats…',
    stitch: 'Stitching the clips…', music: 'Laying the music…',
    extract_audio: 'Extracting audio…', transcribe: 'Transcribing…', translate: 'Translating…',
    synthesize: 'Recording the voices…', sync: 'Fitting the timing…', mix: 'Mixing…',
    outline: 'Writing the outline…', visuals: 'Generating visuals…', render: 'Drawing the slides…',
  },
  ru: {
    queued: 'В очереди…',
    resolve: 'Проверяем файлы…', bridge: 'Фото в кадры…', normalize: 'Приводим форматы…',
    stitch: 'Склеиваем кадры…', music: 'Добавляем музыку…',
    extract_audio: 'Извлекаем звук…', transcribe: 'Расшифровываем…', translate: 'Переводим…',
    synthesize: 'Записываем голоса…', sync: 'Подгоняем тайминг…', mix: 'Сводим…',
    outline: 'Пишем план…', visuals: 'Создаём изображения…', render: 'Рисуем слайды…',
  },
};

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
  onOpenFullEditor,
}: {
  service: PanelService;
  locale: string;
  onClose: () => void;
  /** Escalate into the full-screen clip editor (trim/crop/grade/audio). */
  onOpenFullEditor?: () => void;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // LIVE STAGE. Montage, dubbing and presentation each publish their per-leg stage to the job row while
  // they work, but the request is synchronous — so the browser only learned the job id once everything
  // was already finished, and every one of those stages went to a row nobody was watching. The client
  // now NAMES the job up front and polls it, turning "Working…" into the leg actually running.
  const [stage, setStage] = useState<{ label: string; pct: number } | null>(null);
  /**
   * Seconds since Run was pressed. The progress card needs a real clock to pace its estimate against —
   * these panels never tracked one, so they could not show elapsed time or a remaining figure at all.
   */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  // Montage — clips carry a stable uid and the source's true duration; MontageEditor owns the UI.
  // Starts EMPTY: two blank rows were placeholders for a form, but this surface asks for files.
  const [shots, setShots] = useState<EditorClip[]>([]);
  const [aspect, setAspect] = useState<MontageAspect>('16:9');
  const [musicUrl, setMusicUrl] = useState('');
  const [musicOnly, setMusicOnly] = useState(false);
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
  // Local-file uploads for the two services that used to demand a public URL.
  const [dubFile, setDubFile] = useState<string | null>(null);
  const [img3dFile, setImg3dFile] = useState<string | null>(null);
  const dubUpload = useUpload(lang);
  const img3dUpload = useUpload(lang);
  const [quality3d, setQuality3d] = useState<Model3dQuality>('draft');
  const [removeBackground, setRemoveBackground] = useState(true);

  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  /** Poll our own job row until the request settles. Fail-quiet: progress is a nicety, never a blocker. */
  const watchStage = useCallback((jobId: string, stop: { done: boolean }) => {
    void (async () => {
      while (!stop.done && !cancelled.current) {
        await new Promise((r) => setTimeout(r, 2500));
        if (stop.done || cancelled.current) return;
        const res = await fetch('/api/orchestrator/jobs?status=active&limit=20').catch(() => null);
        const j = (await res?.json().catch(() => null)) as { jobs?: Array<Record<string, unknown>> } | null;
        const row = j?.jobs?.find((x) => x.id === jobId);
        if (!row) continue;
        const label = String(row.current_stage ?? '');
        const pct = Number(row.pct ?? 0);
        if (label) setStage({ label, pct: Number.isFinite(pct) ? pct : 0 });
      }
    })();
  }, []);

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

  // Same pure function the server bills and encodes against, so this number is not an approximation.
  const montageTotal = timelineDuration(shots);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setStage(null);
    // Name the job so the poller below can follow it while the synchronous request is still open.
    const clientJobId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '';
    const stop = { done: false };
    if (clientJobId && service !== 'model3d') watchStage(clientJobId, stop);
    try {
      let endpoint = '';
      let body: Record<string, unknown> = {};

      if (service === 'montage') {
        endpoint = '/api/v2/montage/render';
        // uid/sourceSec/previewUrl are client-only; the validator would ignore them but sending a local
        // blob: url in `previewUrl` has no business leaving the browser.
        body = {
          shots: shots.filter((s) => s.url.trim()).map(({ uid: _u, sourceSec: _s, previewUrl: _p, ...shot }) => shot),
          aspect,
          ...(musicUrl.trim() ? { musicUrl: musicUrl.trim() } : {}),
          musicOnly,
        };
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientJobId ? { ...body, clientJobId } : body),
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
      stop.done = true;
      setStage(null);
      setBusy(false);
    }
  }

  const canRun = !busy && (
    service === 'montage' ? shots.filter((s) => s.url.trim()).length >= MIN_SHOTS && montageTotal <= MAX_TOTAL_SEC
      : service === 'dubbing' ? Boolean(sourceVideoUrl.trim())
      : service === 'presentation' ? topic.trim().length >= 3
      : mode3d === 'text' ? prompt3d.trim().length >= 3 : Boolean(imageUrl3d.trim())
  );

  return (
    // HEIGHT IS CAPPED and the panel scrolls inside itself. A twelve-shot timeline is taller than the
    // viewport, and letting it grow pushed the message input off screen — the one control that must
    // never leave, since this panel sits INSIDE the chat rather than on a page of its own.
    <Panel className="mb-2" maxHeight="52vh">
      <PanelHeader
        title={t[service]}
        action={<GhostButton onClick={onClose} className="px-2">{t.close} ✕</GhostButton>}
      />

      {service === 'montage' && (
        <MontageEditor
          locale={locale}
          clips={shots}
          setClips={setShots}
          aspect={aspect}
          setAspect={setAspect}
          musicUrl={musicUrl}
          setMusicUrl={setMusicUrl}
          musicOnly={musicOnly}
          setMusicOnly={setMusicOnly}
          onOpenFullEditor={onOpenFullEditor}
        />
      )}

      {service === 'dubbing' && (
        <div className="space-y-2.5">
          {/* SOURCE first, then TARGET, then options — the order the task is actually thought about. */}
          <Group title={`🎬 ${t.sourceVideo}`}>
            {/* A FILE PICKER, not a URL box. Asking for "https://…/video.mp4" required the user to host
                their own video somewhere public first — a step most people cannot take at all, which
                made the whole service unreachable no matter how well the pipeline worked. */}
            <Dropzone
              id="dub-source"
              accept="video/*"
              icon={<span aria-hidden>🎬</span>}
              title={dubFile ? dubFile : t.pickVideo}
              hint={t.dubSourceHint}
              filled={Boolean(sourceVideoUrl)}
              disabled={dubUpload.busy}
              onFiles={async (files) => {
                const f = files[0];
                if (!f) return;
                setDubFile(f.name);
                const path = await dubUpload.upload(f);
                if (path) setSourceVideoUrl(path);
                else { setDubFile(null); setSourceVideoUrl(''); }
              }}
            />
            {dubUpload.busy && <ProgressBar label={t.uploading} />}
            {dubUpload.error && <Note tone="error">{dubUpload.error}</Note>}
            {sourceVideoUrl && !dubUpload.busy && <Note tone="success">{t.fileReady}</Note>}
          </Group>
          <Group title={`🗣 ${t.targetLang}`}>
            <ChipGroup
              value={targetLanguage}
              onChange={setTargetLanguage}
              options={DUBBING_LANGUAGES.map((l) => ({ id: l, label: LANGUAGE_LABEL[l] }))}
            />
            {/* Switches, not bare checkboxes: a native checkbox is ~13px — unhittable on a phone and
                visually unrelated to every other control in the app. */}
            <ToggleRow on={preserveBg} onChange={setPreserveBg} label={t.keepBg} hint={t.keepBgHint} />
            <ToggleRow on={subtitles} onChange={setSubtitles} label={t.subs} />
          </Group>
        </div>
      )}

      {service === 'presentation' && (
        <div className="space-y-2.5">
          <Group title={`📝 ${t.topic}`}>
            <LabelledField label={t.topic} maxLength={MAX_TOPIC_CHARS} value={topic}>
              <TextArea rows={3} value={topic} maxLength={MAX_TOPIC_CHARS} onChange={(e) => setTopic(e.target.value)} placeholder={t.topicPh} />
            </LabelledField>
          </Group>
          <Group title={`⚙️ ${t.deckOptions}`}>
            {/* The slide count was a bare number input — a spinner is a poor control on a phone and
                gave no sense of the allowed range. The range is the control now. */}
            <div className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium text-app-muted">{t.slides}</span>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-app-accent">{slideCount}</span>
              </div>
              <input
                type="range" min={MIN_SLIDES} max={MAX_SLIDES} step={1} value={slideCount}
                onChange={(e) => setSlideCount(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-app-elevated accent-app-accent"
                aria-label={t.slides}
              />
            </div>
            <ChipGroup
              label={t.deckLang}
              value={deckLang}
              onChange={setDeckLang}
              options={[{ id: 'ka' as const, label: 'ქართული' }, { id: 'en' as const, label: 'English' }, { id: 'ru' as const, label: 'Русский' }]}
            />
            <ToggleRow on={withImages} onChange={setWithImages} label={t.withImages} hint={t.withImagesHint} />
          </Group>
        </div>
      )}

      {service === 'model3d' && (
        <div className="space-y-2.5">
          <Group title={`🧊 ${t.model3d}`}>
            <ChipGroup
              value={mode3d}
              onChange={setMode3d}
              options={[{ id: 'text' as const, label: `✍️ ${t.fromText}` }, { id: 'image' as const, label: `🖼 ${t.fromImage}` }]}
            />
            {mode3d === 'text' ? (
              <LabelledField label={t.describe} maxLength={MAX_PROMPT_CHARS} value={prompt3d} hint={t.describeHint}>
                <TextArea rows={3} value={prompt3d} maxLength={MAX_PROMPT_CHARS} onChange={(e) => setPrompt3d(e.target.value)} placeholder={t.describePh} />
              </LabelledField>
            ) : (
              <div className="min-w-0">
                {/* Same reasoning as the dubbing source: a photo lives on the user's device, not at a
                    public URL, so image-to-3D was unusable for anyone who could not self-host. */}
                <Dropzone
                  id="model3d-image"
                  accept="image/*"
                  icon={<span aria-hidden>🖼</span>}
                  title={img3dFile ? img3dFile : t.pickPhoto}
                  hint={t.photoHint}
                  filled={Boolean(imageUrl3d)}
                  disabled={img3dUpload.busy}
                  onFiles={async (files) => {
                    const f = files[0];
                    if (!f) return;
                    setImg3dFile(f.name);
                    const path = await img3dUpload.upload(f);
                    if (path) setImageUrl3d(path);
                    else { setImg3dFile(null); setImageUrl3d(''); }
                  }}
                />
                {img3dUpload.busy && <ProgressBar label={t.uploading} />}
                {img3dUpload.error && <Note tone="error">{img3dUpload.error}</Note>}
                {imageUrl3d && !img3dUpload.busy && <Note tone="success">{t.fileReady}</Note>}
              </div>
            )}
          </Group>
          <Group title={`⚙️ ${t.quality}`}>
            <ChipGroup
              value={quality3d}
              onChange={setQuality3d}
              options={[{ id: 'draft' as const, label: `⚡ ${t.draft}` }, { id: 'standard' as const, label: `✨ ${t.standard}` }]}
            />
            <ToggleRow on={removeBackground} onChange={setRemoveBackground} label={t.removeBg} hint={t.removeBgHint} />
          </Group>
        </div>
      )}

      <PrimaryButton onClick={run} disabled={!canRun} loading={busy} full className="mt-3">
        {busy ? t.working : t.run}
      </PrimaryButton>

      {busy && (
        <div className="mt-2.5 space-y-1.5">
          {/* THE SAME CARD the chat shows for image/music/video. These panels used to get a 2px
              indeterminate bar with one label and no number — for renders that take two to seven
              minutes. A wait with no feedback is indistinguishable from a hang, which is exactly why
              montage and dubbing "felt broken". `compact` drops the stage checklist because this
              surface is inside the chat box, but the live percentage, the running stage and the
              estimated remaining time are the whole point and stay.
              A server-reported pct/stage overrides the time estimate whenever the pipeline sends one. */}
          <GenerationProgress
            kind={PROGRESS_KIND[service]}
            locale={lang}
            elapsed={elapsed}
            compact
            {...(stage?.pct ? { pct: stage.pct } : {})}
            {...(stage ? { status: STAGE_LABELS[lang][stage.label] ?? stage.label } : {})}
          />
          <p className="text-center text-[11px] text-app-muted">{t.keepOpen}</p>
        </div>
      )}

      {error && <div className="mt-2"><Note tone="error">{error}</Note></div>}

      {result && (
        <div className="mt-2.5 space-y-2">
          {result.videoUrl && (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={result.videoUrl} controls playsInline className="w-full rounded-xl" />
              <Row>
                <a href={result.videoUrl} download className={DOWNLOAD_LINK}>⬇ {t.download}</a>
                {result.subtitlesUrl && <a href={result.subtitlesUrl} download className={DOWNLOAD_LINK}>⬇ SRT</a>}
              </Row>
            </>
          )}
          {result.slides && result.slides.length > 0 && (
            // 2 up on a phone, 3 from 480px. A hardcoded grid-cols-3 gave ~110px thumbnails on a 380px
            // screen, which is not a preview of anything.
            <div className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3">
              {result.slides.map((s) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s.index} src={s.pngUrl} alt="" className="w-full rounded-lg border border-app-border/10" />
              ))}
            </div>
          )}
          {/* The reference shows while the mesh is still reconstructing, so the wait is not a blank box. */}
          {result.referenceUrl && !result.glbUrl && (
            <div>
              <Label>{t.reference}</Label>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.referenceUrl} alt="" className="w-32 rounded-lg border border-app-border/10" />
            </div>
          )}
          {result.glbUrl && (
            <>
              <GlbViewer url={result.glbUrl} />
              <a href={result.glbUrl} download className={DOWNLOAD_LINK}>⬇ GLB</a>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
