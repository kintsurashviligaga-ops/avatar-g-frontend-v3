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
  ChipGroup, ToggleRow, PrimaryButton, SecondaryButton, GhostButton, Note, ProgressBar, Dropzone, CardSelect, Disclosure, TextArea as UiTextArea,
} from './ui/controls';
import { useUpload } from './ui/useUpload';
import { checkSourceDuration, readVideoDurationSec } from '@/lib/media/videoDuration';
import { downloadDeckZip } from '@/lib/services/presentation/deckZip';
import { GenerationProgress } from './ui/GenerationProgress';
import { ResultActions } from './ui/ResultActions';
import { useJobQueue } from '@/store/useJobQueue';
import { DeckViewer } from './ui/DeckViewer';
import { MAX_SLIDES, MIN_SLIDES, DEFAULT_SLIDES, type DeckLanguage, type DeckTheme } from '@/lib/services/presentation/deckPlan';
import { pollDelayMs, MAX_POLL_ATTEMPTS, MAX_PROMPT_CHARS, type Model3dMode, type Model3dQuality } from '@/lib/services/model3d/model3dPlan';
import { describeServiceError } from './ui/serviceError';

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
    close: 'დახურვა', run: 'გაშვება', working: 'მიმდინარეობს…', failed: 'ვერ შესრულდა', downloadDeck: '⬇ სლაიდების ჩამოტვირთვა (ZIP)', deckTheme: 'იერსახე', themeDark: 'მუქი', themeLight: 'ღია', advanced: 'დამატებითი პარამეტრები', exclude: 'რა არ გინდა', excludeHint: 'მაგ. ტექსტი, ადამიანი, ფონი…', excludeSet: 'მითითებულია', sourceLang: 'ორიგინალის ენა', autoDetect: 'ავტომატური',
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
    close: 'Close', run: 'Run', working: 'Working…', failed: 'Failed', downloadDeck: '⬇ Download slides (ZIP)', deckTheme: 'Look', themeDark: 'Dark', themeLight: 'Light', advanced: 'Advanced', exclude: 'Leave out', excludeHint: 'e.g. text, people, background clutter…', excludeSet: 'set', sourceLang: 'Original language', autoDetect: 'Auto-detect',
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
    close: 'Закрыть', run: 'Запустить', working: 'Выполняется…', failed: 'Не удалось', downloadDeck: '⬇ Скачать слайды (ZIP)', deckTheme: 'Оформление', themeDark: 'Тёмное', themeLight: 'Светлое', advanced: 'Дополнительно', exclude: 'Исключить', excludeHint: 'напр. текст, люди, фон…', excludeSet: 'задано', sourceLang: 'Язык оригинала', autoDetect: 'Автоопределение',
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

export interface Result {
  videoUrl?: string;
  /** Deck identity — used for the ZIP filename and the cover slide. Both already returned by the route. */
  title?: string;
  coverUrl?: string | null;
  glbUrl?: string;
  referenceUrl?: string;
  slides?: Array<{ index: number; pngUrl: string }>;
  subtitlesUrl?: string | null;
  /**
   * Degradations the pipeline reported.
   *
   * ⚠️ ALL THREE ROUTES COMPUTE THESE AND THE PANEL READ NONE OF THEM. Every partial result was shown
   * as a clean one. The worst case: a montage with "Music only" enabled whose music mux failed hands
   * back a COMPLETELY SILENT video under a green success card — the route knew (`musicRequestedButMissing`)
   * and said so, and the UI dropped it on the floor. A dub with dropped or untranslated lines, and a deck
   * that fell back to a generated outline or lost its images, were presented the same way.
   */
  warnings?: {
    musicRequestedButMissing?: boolean;
    droppedLines?: number;
    untranslatedLines?: number;
    lipSyncSkipped?: boolean;
    usedFallbackOutline?: boolean;
    imagesMissing?: number;
    imagesRequested?: boolean;
  };
}

/**
 * Turn the route's warning flags into sentences. Returns [] for a clean result, so the card stays
 * quiet when there is genuinely nothing to say.
 */
function warningLines(w: Result['warnings'], lang: Lang): string[] {
  if (!w) return [];
  const L = {
    ka: {
      music: 'მუსიკა ვერ დაემატა — ვიდეო ხმის გარეშეა.',
      dropped: (n: number) => `${n} სტრიქონი ვერ გაიხმოვანდა.`,
      untranslated: (n: number) => `${n} სტრიქონი უთარგმნელი დარჩა.`,
      lipsync: 'ტუჩების სინქრონი არ შესრულებულა.',
      outline: 'გეგმა ავტომატურად შეიქმნა — მოდელმა ვერ დააბრუნა.',
      images: (n: number) => `${n} სლაიდი სურათის გარეშეა.`,
    },
    en: {
      music: 'The music could not be added — this video has no sound.',
      dropped: (n: number) => `${n} line${n === 1 ? '' : 's'} could not be voiced.`,
      untranslated: (n: number) => `${n} line${n === 1 ? '' : 's'} were left untranslated.`,
      lipsync: 'Lip-sync was not applied.',
      outline: 'The outline was generated automatically — the model did not return one.',
      images: (n: number) => `${n} slide${n === 1 ? '' : 's'} have no image.`,
    },
    ru: {
      music: 'Музыку не удалось добавить — видео без звука.',
      dropped: (n: number) => `${n} строк не озвучено.`,
      untranslated: (n: number) => `${n} строк осталось без перевода.`,
      lipsync: 'Синхронизация губ не выполнена.',
      outline: 'План создан автоматически — модель его не вернула.',
      images: (n: number) => `${n} слайдов без изображения.`,
    },
  }[lang];
  const out: string[] = [];
  if (w.musicRequestedButMissing) out.push(L.music);
  if (w.droppedLines && w.droppedLines > 0) out.push(L.dropped(w.droppedLines));
  if (w.untranslatedLines && w.untranslatedLines > 0) out.push(L.untranslated(w.untranslatedLines));
  if (w.lipSyncSkipped) out.push(L.lipsync);
  if (w.usedFallbackOutline) out.push(L.outline);
  if (w.imagesRequested && w.imagesMissing && w.imagesMissing > 0) out.push(L.images(w.imagesMissing));
  return out;
}

export function ServiceParamsPanel({
  service,
  locale,
  onClose,
  onOpenFullEditor,
  prefill,
  onDelivered,
}: {
  service: PanelService;
  locale: string;
  onClose: () => void;
  /** Escalate into the full-screen clip editor (trim/crop/grade/audio). */
  onOpenFullEditor?: () => void;
  /**
   * Parameters mined from the chat sentence that opened this panel (lib/chat/studioIntent).
   *
   * Applied as INITIAL VALUES only — the user still reviews and presses the button, so a mis-parse costs
   * a correction rather than a charge. Deliberately NOT auto-submitted: these services all spend credits,
   * and "it started rendering because of something I typed in chat" is not a recoverable surprise.
   */
  prefill?: { targetLanguage?: string; slideCount?: number; durationSec?: number; topic?: string };
  /**
   * Hand a finished result to the conversation.
   *
   * ⚠️ WITHOUT THIS, EVERY RESULT THIS PANEL PRODUCES DIES WHEN THE PANEL CLOSES. Montage, dubbing,
   * decks and 3D all rendered into `result` — local component state, inside a panel with a ✕ on it and
   * nothing else holding a reference. A user could wait out a five-minute dub, see it, tap ✕ to get back
   * to the conversation, and the video was simply gone from the screen: never posted to the stream,
   * never recoverable except by hunting the Library. Four of the platform's live services delivered
   * into a container designed to be dismissed.
   */
  onDelivered?: (service: PanelService, result: Result) => void;
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
  /** Short confirmation from a result action ("Saved", "Link copied"), cleared on the next run. */
  const [note, setNote] = useState<string | null>(null);
  // Held in a ref so the 3D poller — a useCallback that must not re-create mid-poll — can reach the
  // current handler without taking it as a dependency.
  const onDeliveredRef = useRef(onDelivered);
  useEffect(() => { onDeliveredRef.current = onDelivered; }, [onDelivered]);
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
  // Measured from the local file before upload. null = we could not measure; see videoDuration.ts —
  // the server must not receive a GUESSED length, because length is what it bills.
  const [dubDurationSec, setDubDurationSec] = useState<number | null>(null);
  const [dubTooLong, setDubTooLong] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  /**
   * Which slide is open in the full-screen deck viewer; null = closed.
   *
   * Mirrors OmniStudio's `lightbox` state (a value = open, null = closed), but holds an INDEX rather
   * than a url because a deck pages and a single chat image does not.
   */
  const [slideIndex, setSlideIndex] = useState<number | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<DubbingLanguage>(lang === 'ka' ? 'en' : 'ka');
  const [preserveBg, setPreserveBg] = useState(true);
  const [subtitles, setSubtitles] = useState(true);
  // Presentation
  const [topic, setTopic] = useState('');
  const [slideCount, setSlideCount] = useState(DEFAULT_SLIDES);
  /** The route has always accepted this (deckPlan validates `b.theme === 'light' ? 'light' : 'dark'`);
   *  the panel hardcoded 'dark', so a deck for a printed handout or a bright room was unreachable. */
  const [deckTheme, setDeckTheme] = useState<DeckTheme>('dark');
  /** Text-to-3D only. The route forwards this to Imagen inside `if (request.mode === 'text')`, so in
   *  photo mode it would be a control that does nothing — hidden there rather than shown and ignored. */
  const [neg3d, setNeg3d] = useState('');
  /** 'auto' was hardcoded in the request body. The validator accepts a real language and uses it to
   *  skip detection, which matters most for accented or noisy audio where auto-detect guesses wrong. */
  const [sourceLanguage, setSourceLanguage] = useState<DubbingLanguage | 'auto'>('auto');

  // Filtering the SOURCE list by the current target is not enough on its own: pick a source, then
  // change the TARGET to that same language, and the pair becomes source === target — which the
  // validator rejects outright with "nothing to dub". Fall back to auto instead of letting the user
  // assemble a request that cannot succeed.
  useEffect(() => {
    if (sourceLanguage !== 'auto' && sourceLanguage === targetLanguage) setSourceLanguage('auto');
  }, [targetLanguage, sourceLanguage]);

  // Apply what the chat sentence already told us. Keyed on `service` so switching services in the menu
  // re-applies cleanly, and every value is validated against the SAME bounds the controls enforce —
  // a mined number is untrusted input like any other, even though it came from the user's own sentence.
  useEffect(() => {
    if (!prefill) return;
    if (prefill.targetLanguage && (DUBBING_LANGUAGES as readonly string[]).includes(prefill.targetLanguage)) {
      setTargetLanguage(prefill.targetLanguage as DubbingLanguage);
    }
    if (typeof prefill.slideCount === 'number' && Number.isFinite(prefill.slideCount)) {
      setSlideCount(Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.round(prefill.slideCount))));
    }
    if (prefill.topic && prefill.topic.trim()) setTopic(prefill.topic.trim().slice(0, 400));
  }, [prefill, service]);
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
  // SINGLE OWNER PER JOB. Montage/dubbing/presentation/3D all create a `generation_jobs` row that
  // useDurableProgress hydrates straight into the floating JobTray — so while this panel draws its own
  // live card, the tray was drawing a SECOND one for the identical render (labelled "Image", since these
  // rows ride service_type='image'). Claim the id while the card is up; release it on settle AND on
  // unmount, so closing the panel mid-render HANDS the render to the tray instead of losing it.
  const claimInline = useJobQueue((s) => s.claimInline);
  const releaseInline = useJobQueue((s) => s.releaseInline);
  const claimedRef = useRef<string[]>([]);
  const claimJob = (id: string) => { if (!id || claimedRef.current.includes(id)) return; claimedRef.current.push(id); claimInline(id); };
  const releaseClaims = () => { for (const id of claimedRef.current) releaseInline(id); claimedRef.current = []; };
  // Held in a ref so the unmount teardown stays a true unmount-only effect (no re-subscribe churn).
  const releaseRef = useRef(releaseClaims);
  releaseRef.current = releaseClaims;
  useEffect(() => () => { cancelled.current = true; releaseRef.current(); }, []);

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
      if (j.status === 'succeeded' && j.glbUrl) {
        setResult((p) => ({ ...(p ?? {}), glbUrl: j.glbUrl }));
        onDeliveredRef.current?.('model3d', { glbUrl: j.glbUrl });
        return;
      }
      // Same defect, shorter form — see the note on the submit path below.
      if (j.status === 'failed') { setError(describeServiceError(j.message, lang, t.failed)); return; }
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
    setSlideIndex(null);
    setStage(null);
    setNote(null);
    // Name the job so the poller below can follow it while the synchronous request is still open.
    const clientJobId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '';
    const stop = { done: false };
    if (clientJobId && service !== 'model3d') { watchStage(clientJobId, stop); claimJob(clientJobId); }
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
        // durationSec was NEVER SENT. The route then fell back to 60, which killed its own 5-minute cap
        // and billed every dub — however long — as a single minute. Sent only when actually measured.
        body = {
          sourceVideoUrl: sourceVideoUrl.trim(), sourceLanguage, targetLanguage,
          preserveBackgroundAudio: preserveBg, subtitles,
          ...(dubDurationSec ? { durationSec: Math.ceil(dubDurationSec) } : {}),
        };
      } else if (service === 'presentation') {
        endpoint = '/api/v2/presentation/build';
        body = { topic: topic.trim(), slideCount, language: deckLang, theme: deckTheme, withImages };
      } else {
        endpoint = '/api/v2/model3d/create';
        body = {
          mode: mode3d, prompt: prompt3d.trim(), imageUrl: imageUrl3d.trim(), quality: quality3d, removeBackground,
          // Only meaningful on the text path; the validator caps it at 300 chars so we match that here.
          ...(mode3d === 'text' && neg3d.trim() ? { negativePrompt: neg3d.trim().slice(0, 300) } : {}),
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientJobId ? { ...body, clientJobId } : body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        // ⚠️ THIS PASTED THE PIPELINE'S ENGLISH MACHINE STEP AND THE PROVIDER'S ENGLISH SENTENCE INTO
        // GEORGIAN COPY. `[t.failed, j.step, j.message].join(' · ')` produced things like
        // "ვერ მოხერხდა · stitch · Request failed with status 502" — three registers at once, none of
        // them telling the user what to do. The step was never user-facing value either: the progress
        // card names the stage in Georgian while the run is happening. What is left is the actionable
        // part, and an unrecognised message falls back rather than being echoed.
        setError(describeServiceError(j?.message ?? j?.step, lang, t.failed));
        return;
      }
      if (service === 'model3d') {
        // ⚠️ 3D's row id is SERVER-generated: /api/v2/model3d/create ignores clientJobId and returns its
        // own `jobId`, so the claim can only be made here, once the response lands. Without it the tray
        // draws a second card over this panel's for the whole (slowest in the product) reconstruction.
        if (typeof j?.jobId === 'string' && j.jobId) claimJob(j.jobId);
        // Show the reference image immediately; the mesh arrives via the poll below.
        setResult({ referenceUrl: j.referenceUrl });
        await poll3d(j.predictionId, j.jobId);
      } else {
        setResult(j as Result);
        // Post it to the conversation as well as showing it here, so closing the panel cannot destroy it.
        onDeliveredRef.current?.(service, j as Result);
      }
    } catch {
      setError(t.failed);
    } finally {
      stop.done = true;
      setStage(null);
      setBusy(false);
      // The card is gone the instant busy clears, so ownership goes back immediately — a row that is
      // somehow still active (e.g. a 502 the server has not yet marked failed) reappears in the tray.
      releaseClaims();
    }
  }

  const canRun = !busy && (
    service === 'montage' ? shots.filter((s) => s.url.trim()).length >= MIN_SHOTS && montageTotal <= MAX_TOTAL_SEC
      : service === 'dubbing' ? Boolean(sourceVideoUrl.trim())
      : service === 'presentation' ? topic.trim().length >= 3
      : mode3d === 'text' ? prompt3d.trim().length >= 3 : Boolean(imageUrl3d.trim())
  );

  /**
   * Every page of the finished deck, COVER FIRST — one array driving both the thumbnail grid and the
   * full-screen viewer, so a tile's position and the viewer's index can never drift apart.
   *
   * The cover is included deliberately: it is the deck's first page, it ships inside the ZIP as
   * 00-cover.png (lib/services/presentation/deckZip.ts), and it is what the chat message uses as the
   * deck's thumbnail — yet this panel never showed it at all.
   */
  const deckSlides = result?.slides ?? [];
  const deckImages = deckSlides.length
    ? [...(result?.coverUrl ? [result.coverUrl] : []), ...deckSlides.map((s) => s.pngUrl)]
    : [];

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
                setDubTooLong(null);
                // Measure FIRST. Refusing an over-length video before a 50MB upload rather than after it
                // is the difference between an instant answer and a wasted minute of a phone's data.
                const secs = await readVideoDurationSec(f);
                const verdict = checkSourceDuration(secs, lang);
                if (!verdict.ok) {
                  setDubTooLong(verdict.message ?? null);
                  setDubFile(null); setSourceVideoUrl(''); setDubDurationSec(null);
                  return;
                }
                setDubDurationSec(secs);
                const path = await dubUpload.upload(f);
                if (path) setSourceVideoUrl(path);
                else { setDubFile(null); setSourceVideoUrl(''); setDubDurationSec(null); }
              }}
            />
            {dubUpload.busy && <ProgressBar label={t.uploading} />}
            {dubUpload.error && <Note tone="error">{dubUpload.error}</Note>}
            {dubTooLong && <Note tone="error">{dubTooLong}</Note>}
            {sourceVideoUrl && !dubUpload.busy && (
              <Note tone="success">
                {t.fileReady}
                {dubDurationSec ? ` · ${Math.floor(dubDurationSec / 60)}:${String(Math.round(dubDurationSec % 60)).padStart(2, '0')}` : ''}
              </Note>
            )}
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
            {/* The request body hardcoded sourceLanguage:'auto'. The validator has always accepted a real
                language and uses it to SKIP detection — which is what rescues accented or noisy audio
                that auto-detect gets wrong. Behind a drawer because auto is right almost every time.
                The validator rejects source === target ("nothing to dub"), so that pair is excluded
                here rather than sent and bounced. */}
            <Disclosure
              label={t.advanced}
              badge={sourceLanguage !== 'auto' ? 1 : 0}
              summary={sourceLanguage !== 'auto' ? LANGUAGE_LABEL[sourceLanguage] : undefined}
            >
              <ChipGroup
                label={t.sourceLang}
                value={sourceLanguage}
                onChange={setSourceLanguage}
                options={[
                  { id: 'auto' as const, label: t.autoDetect },
                  ...DUBBING_LANGUAGES.filter((l) => l !== targetLanguage).map((l) => ({ id: l, label: LANGUAGE_LABEL[l] })),
                ]}
              />
            </Disclosure>
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
            {/* The route validated this all along — the panel just never asked. A visual pair beats a
                select here: the choice is about how the deck LOOKS, so the control should show it. */}
            <CardSelect
              label={t.deckTheme}
              value={deckTheme}
              onChange={setDeckTheme}
              cols={2}
              options={[
                { id: 'dark' as const, label: t.themeDark, icon: '🌙' },
                { id: 'light' as const, label: t.themeLight, icon: '☀️' },
              ]}
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
            {/* ⚠️ TEXT MODE ONLY — the route passes negativePrompt to Imagen inside
                `if (request.mode === 'text')`, so rendering it in photo mode would be a knob that
                silently does nothing. Text-to-3D is two hops (prompt → Imagen reference → mesh), so
                anything unwanted in that reference becomes geometry; without this the only escape from
                a bad reference was to rewrite the prompt and pay for another generation. */}
            {mode3d === 'text' && (
              <Disclosure label={t.advanced} badge={neg3d.trim() ? 1 : 0} summary={neg3d.trim() ? t.excludeSet : undefined}>
                <div>
                  <Label>{t.exclude}</Label>
                  <UiTextArea
                    value={neg3d}
                    onChange={(e) => setNeg3d(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder={t.excludeHint}
                  />
                </div>
              </Disclosure>
            )}
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
      {note && <div className="mt-2"><Note tone="success">{note}</Note></div>}

      {result && (
        <div className="mt-2.5 space-y-2">
          {/* Stated BEFORE the media, so a partial result is never mistaken for a clean one. */}
          {warningLines(result.warnings, lang).map((line) => (
            <Note key={line} tone="warn">{line}</Note>
          ))}
          {result.videoUrl && (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={result.videoUrl} controls playsInline className="w-full rounded-xl" />
              {/* Real actions, not a bare link. `<a download>` is IGNORED cross-origin — and every one
                  of these is a signed storage URL — so the old link navigated away from the app to the
                  raw file instead of saving it. ResultActions fetches the bytes and downloads those,
                  offers the share sheet (the only route to Photos on iOS), and files the result in the
                  Library, which nothing on this path did. */}
              <Row>
                <ResultActions url={result.videoUrl} kind="film" locale={lang} onNote={setNote} />
                {result.subtitlesUrl && <a href={result.subtitlesUrl} download className={DOWNLOAD_LINK}>⬇ SRT</a>}
              </Row>
            </>
          )}
          {/* ⚠️ THE DECK COULD BE DOWNLOADED BUT NOT READ. The grid below is capped at 52vh inside this
              panel, so on a phone each slide was a ~110px tile — and tapping one did nothing. The deck
              the user had just paid for could only be inspected by exporting the ZIP and opening it in
              another app, which is not a preview of anything.

              Each tile is now the trigger for the same full-screen overlay the chat uses for its images
              (OmniStudio's `lightbox`), plus the paging a deck needs and a single picture does not. The
              ZIP survives — demoted to the secondary action it always was, and moved BELOW the deck it
              exports, so the first thing offered is the deck itself. */}
          {deckImages.length > 0 && (
            // 2 up on a phone, 3 from 480px. A hardcoded grid-cols-3 gave ~110px thumbnails on a 380px
            // screen, which is not a preview of anything.
            <div className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3">
              {deckImages.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setSlideIndex(i)}
                  aria-label={`${t.slides} ${i + 1}`}
                  className="block w-full cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full rounded-lg border border-app-border/10" />
                </button>
              ))}
            </div>
          )}
          {deckImages.length > 0 && (
            <Row>
              <SecondaryButton
                onClick={async () => {
                  setZipping(true);
                  try { await downloadDeckZip({ title: result.title, coverUrl: result.coverUrl, slides: result.slides ?? [] }); }
                  catch { setNote(t.failed); }
                  finally { setZipping(false); }
                }}
                loading={zipping}
              >
                {t.downloadDeck}
              </SecondaryButton>
            </Row>
          )}
          {slideIndex !== null && deckImages.length > 0 && (
            <DeckViewer
              images={deckImages}
              index={slideIndex}
              onIndex={setSlideIndex}
              onClose={() => setSlideIndex(null)}
              locale={lang}
            />
          )}
          {/* The reference shows while the mesh is still reconstructing, so the wait is not a blank box. */}
          {result.referenceUrl && !result.glbUrl && (
            <div>
              <Label>{t.reference}</Label>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* Was a fixed 128px thumbnail — too small to judge the reference a paid reconstruction is built from. */}
              <img src={result.referenceUrl} alt="" className="w-full max-w-[220px] rounded-lg border border-app-border/10" />
            </div>
          )}
          {result.glbUrl && (
            <>
              {/* Actions ABOVE the canvas: OrbitControls owns every touch inside the viewer, so anything
                  placed below it can be hard to reach on a phone. Belt and braces with the height fix. */}
              <ResultActions url={result.glbUrl} kind="model3d" locale={lang} onNote={setNote} />
              <GlbViewer url={result.glbUrl} />
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
