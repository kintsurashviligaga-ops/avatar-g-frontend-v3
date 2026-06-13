'use client';

/**
 * OmniStudio (Service Hub — Card B). MyAvatar Smart Assistant (multimodal).
 *
 * A continuous conversational grid wired to POST /api/chat/gemini (the funded
 * Gemini key; streams `data: {"text"}` deltas). Three input modes, per the
 * blueprint: a live MIC node (records a clip → /api/voice/transcribe → drops the
 * text into the prompt), an asset attachment broker (images sent natively as
 * Gemini image parts), and the director's text box. Strict skin — black · white ·
 * #00D2FF. Fail-soft throughout.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, Mic, Square, Plus, X, Loader2, Sparkles, Film, Music2, FileText, Image as ImageIcon, Download, MessageSquare, Wand2, Volume2, Copy, Check, ChevronDown, RotateCcw, History, Trash2, MessageSquarePlus, Pencil } from 'lucide-react';
import { driveFilmStudio } from '@/lib/chat/filmStudioClient';
import { Markdown } from './Markdown';

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, {
  title: string; subtitle: string; placeholder: string; empty: string; thinking: string; recording: string; micHint: string;
  modeChat: string; modeImage: string; imgPlaceholder: string; generatingImage: string; imageFailed: string; imgDownload: string; editImage: string;
  magicHint: string;
  modeMusic: string; musicPlaceholder: string; generatingMusic: string; musicFailed: string;
  modeVideo: string; videoPlaceholder: string; generatingVideo: string; videoFailed: string;
  modeLipsync: string; lipsyncPlaceholder: string; generatingLipsync: string; lipsyncFailed: string; lipsyncNeedFiles: string; lipsyncAuth: string; lipAudioLabel: string;
  stop: string; stopped: string; scrollDown: string; regenerate: string; elapsedHint: string; greeting: string; attachHint: string;
  instrumental: string; withVocals: string; lyricsPlaceholder: string;
  narration: string; narrationCue: string; transCrossfade: string; transCut: string;
  sbTitle: string; sbReview: string; sbGenerate: string; sbRegen: string; sbCancel: string; sbCreating: string; sbFailed: string; sbScene: string;
  charPhoto: string; charPhotoOn: string;
  historyTitle: string; historyEmpty: string; historyNew: string; deleteLabel: string;
}> = {
  ka: {
    title: 'ჭკვიანი ასისტენტი', subtitle: 'ინტელექტუალური მულტიმოდალური ასისტენტი',
    placeholder: 'დაწერე, ჩაწერე ხმა, ან მიამაგრე სურათი…', empty: 'ჰკითხე ნებისმიერი რამ, შექმენი სურათი ან მუსიკა — ტექსტით, ხმით ან ფაილით.',
    thinking: 'ფიქრობს…', recording: 'იწერება…', micHint: 'ხმის ჩაწერა',
    modeChat: 'ჩატი', modeImage: 'სურათი', imgPlaceholder: 'აღწერე სურათი, რომ დაგიხატო…',
    generatingImage: 'სურათი იქმნება…', imageFailed: 'სურათის გენერაცია ვერ მოხერხდა. სცადე თავიდან.', imgDownload: 'ჩამოტვირთვა', editImage: 'რედაქტირება',
    magicHint: 'AI-ით პრომპტის გაუმჯობესება',
    modeMusic: 'მუსიკა', musicPlaceholder: 'აღწერე მუსიკა (მაგ. ეპიკური კინო-სცენა)…',
    generatingMusic: 'მუსიკა იქმნება… (1–3 წუთი)', musicFailed: 'მუსიკის გენერაცია ვერ მოხერხდა. სცადე თავიდან.',
    modeVideo: 'ვიდეო', videoPlaceholder: 'აღწერე 30-წამიანი ვიდეო (ფოტო — პერსონაჟისთვის)…',
    generatingVideo: 'ვიდეო იქმნება… 6 სცენა + მონტაჟი (~5–7 წუთი, დაელოდე)', videoFailed: 'ვიდეოს გენერაცია ვერ მოხერხდა.',
    modeLipsync: 'ლიფსინქი', lipsyncPlaceholder: 'მიამაგრე ვიდეო + აუდიო და დააჭირე გაგზავნას…',
    generatingLipsync: 'ტუჩები სინქრონდება…', lipsyncFailed: 'ლიფსინქი ვერ მოხერხდა.', lipsyncNeedFiles: 'მიამაგრე ვიდეოც და აუდიოც.', lipsyncAuth: 'ლიფსინქისთვის ჯერ გაიარე ავტორიზაცია.', lipAudioLabel: 'აუდიო',
    stop: 'შეჩერება', stopped: 'შეჩერდა', scrollDown: 'ბოლოში გადასვლა', regenerate: 'თავიდან გენერაცია', elapsedHint: 'გავიდა', greeting: 'რით დაგეხმარო?', attachHint: 'დამატება',
    instrumental: 'ინსტრუმენტალი', withVocals: 'ვოკალით', lyricsPlaceholder: 'ლირიკა (არჩევითი) — შენი ტექსტი; ცარიელი = ავტომატური',
    narration: 'ნარაცია', narrationCue: ' (პროფესიონალი კომენტატორის ხმოვანი ნარაციით)', transCrossfade: 'გადადნობა', transCut: 'კვეთა',
    sbTitle: 'სტორიბორდი', sbReview: 'გადახედე 6 სცენას — შეცვალე ტექსტი ან თავიდან დააგენერირე კადრი, შემდეგ გაუშვი ვიდეო', sbGenerate: 'ვიდეოს გენერაცია', sbRegen: 'თავიდან', sbCancel: 'გაუქმება', sbCreating: 'სცენარი და 6 კადრი იქმნება…', sbFailed: 'სტორიბორდი ვერ შეიქმნა. სცადე თავიდან.', sbScene: 'სცენა',
    charPhoto: 'პერსონაჟის ფოტო', charPhotoOn: 'პერსონაჟი ✓',
    historyTitle: 'ისტორია', historyEmpty: 'ჯერ საუბრები არ არის', historyNew: 'ახალი ჩატი', deleteLabel: 'წაშლა',
  },
  en: {
    title: 'Smart Assistant', subtitle: 'Intelligent multimodal assistant',
    placeholder: 'Type, record your voice, or attach an image…', empty: 'Ask anything, or generate an image or music — by text, voice or file.',
    thinking: 'Thinking…', recording: 'Recording…', micHint: 'Record voice',
    modeChat: 'Chat', modeImage: 'Image', imgPlaceholder: 'Describe an image to generate…',
    generatingImage: 'Generating image…', imageFailed: 'Image generation failed. Try again.', imgDownload: 'Download', editImage: 'Edit',
    magicHint: 'Enhance prompt with AI',
    modeMusic: 'Music', musicPlaceholder: 'Describe the music (e.g. epic cinematic scene)…',
    generatingMusic: 'Composing music… (1–3 min)', musicFailed: 'Music generation failed. Try again.',
    modeVideo: 'Video', videoPlaceholder: 'Describe a 30-second video (attach a photo for the character)…',
    generatingVideo: 'Producing video… 6 scenes + montage (~5–7 min, please wait)', videoFailed: 'Video generation failed.',
    modeLipsync: 'Lip-sync', lipsyncPlaceholder: 'Attach a video + audio, then press send…',
    generatingLipsync: 'Syncing the lips…', lipsyncFailed: 'Lip-sync failed.', lipsyncNeedFiles: 'Attach both a video and audio.', lipsyncAuth: 'Sign in first to use lip-sync.', lipAudioLabel: 'Audio',
    stop: 'Stop', stopped: 'Stopped', scrollDown: 'Scroll to bottom', regenerate: 'Regenerate', elapsedHint: 'elapsed', greeting: 'How can I help?', attachHint: 'Add',
    instrumental: 'Instrumental', withVocals: 'Vocals', lyricsPlaceholder: 'Lyrics (optional) — your words; empty = auto-written',
    narration: 'Narration', narrationCue: ' (with professional spoken voice-over narration)', transCrossfade: 'Crossfade', transCut: 'Cut',
    sbTitle: 'Storyboard', sbReview: 'Review the 6 scenes — edit a description or re-roll a frame, then generate', sbGenerate: 'Generate Video', sbRegen: 'Regenerate', sbCancel: 'Cancel', sbCreating: 'Creating storyboard & 6 frames…', sbFailed: 'Storyboard failed. Try again.', sbScene: 'Scene',
    charPhoto: 'Character photo', charPhotoOn: 'Character ✓',
    historyTitle: 'History', historyEmpty: 'No chats yet', historyNew: 'New chat', deleteLabel: 'Delete',
  },
  ru: {
    title: 'Умный ассистент', subtitle: 'Интеллектуальный мультимодальный ассистент',
    placeholder: 'Напишите, запишите голос или прикрепите изображение…', empty: 'Спросите что угодно или создайте изображение или музыку — текстом, голосом или файлом.',
    thinking: 'Думает…', recording: 'Запись…', micHint: 'Записать голос',
    modeChat: 'Чат', modeImage: 'Изображение', imgPlaceholder: 'Опишите изображение для генерации…',
    generatingImage: 'Генерирую изображение…', imageFailed: 'Не удалось сгенерировать изображение. Попробуйте снова.', imgDownload: 'Скачать', editImage: 'Изменить',
    magicHint: 'Улучшить промпт с AI',
    modeMusic: 'Музыка', musicPlaceholder: 'Опишите музыку (напр. эпичная кино-сцена)…',
    generatingMusic: 'Создаю музыку… (1–3 мин)', musicFailed: 'Не удалось создать музыку. Попробуйте снова.',
    modeVideo: 'Видео', videoPlaceholder: 'Опишите 30-секундное видео (фото — для персонажа)…',
    generatingVideo: 'Создаю видео… 6 сцен + монтаж (~5–7 мин, подождите)', videoFailed: 'Не удалось создать видео.',
    modeLipsync: 'Синхрон', lipsyncPlaceholder: 'Прикрепите видео + аудио и нажмите отправить…',
    generatingLipsync: 'Синхронизирую губы…', lipsyncFailed: 'Не удалось синхронизировать.', lipsyncNeedFiles: 'Прикрепите и видео, и аудио.', lipsyncAuth: 'Войдите, чтобы использовать синхронизацию.', lipAudioLabel: 'Аудио',
    stop: 'Стоп', stopped: 'Остановлено', scrollDown: 'Вниз', regenerate: 'Заново', elapsedHint: 'прошло', greeting: 'Чем помочь?', attachHint: 'Добавить',
    instrumental: 'Инструментал', withVocals: 'Вокал', lyricsPlaceholder: 'Текст (необязательно) — ваши слова; пусто = авто',
    narration: 'Озвучка', narrationCue: ' (с профессиональной голосовой озвучкой)', transCrossfade: 'Плавно', transCut: 'Резко',
    sbTitle: 'Раскадровка', sbReview: 'Просмотрите 6 сцен — измените описание или кадр, затем сгенерируйте', sbGenerate: 'Сгенерировать видео', sbRegen: 'Заново', sbCancel: 'Отмена', sbCreating: 'Создаю раскадровку и 6 кадров…', sbFailed: 'Не удалось создать раскадровку. Попробуйте снова.', sbScene: 'Сцена',
    charPhoto: 'Фото персонажа', charPhotoOn: 'Персонаж ✓',
    historyTitle: 'История', historyEmpty: 'Пока нет чатов', historyNew: 'Новый чат', deleteLabel: 'Удалить',
  },
};

// Staged process labels for the live progress card. The engines don't emit a real
// percentage, so we narrate the work as human-legible stages while an eased,
// time-based bar advances — the "loading process" a modern chatbot shows. (Video
// already streams its own live status from the pipeline, which overrides these.)
const STAGES: Record<Lang, Record<'image' | 'music' | 'video' | 'lipsync', string[]>> = {
  ka: {
    image: ['აღწერას ვიაზრებ…', 'კადრს ვხატავ…', 'დეტალებს ვამატებ…', 'ვასრულებ…'],
    music: ['იდეას ვამუშავებ…', 'მელოდიას ვაკომპონებ…', 'ხმებს ვურევ…', 'ვასრულებ…'],
    video: ['სცენარს ვშლი…', 'კადრებს ვქმნი…', 'ხმას ვამატებ…', 'ვაერთიანებ…'],
    lipsync: ['ფაილებს ვამუშავებ…', 'ტუჩებს ვასინქრონებ…', 'ვასრულებ…'],
  },
  en: {
    image: ['Reading your prompt…', 'Painting the frame…', 'Adding details…', 'Finishing up…'],
    music: ['Shaping the idea…', 'Composing the melody…', 'Mixing the voices…', 'Finishing up…'],
    video: ['Breaking down the script…', 'Generating the shots…', 'Adding sound…', 'Stitching together…'],
    lipsync: ['Processing the files…', 'Syncing the lips…', 'Finishing up…'],
  },
  ru: {
    image: ['Читаю запрос…', 'Рисую кадр…', 'Добавляю детали…', 'Завершаю…'],
    music: ['Формирую идею…', 'Сочиняю мелодию…', 'Свожу голоса…', 'Завершаю…'],
    video: ['Разбираю сценарий…', 'Создаю кадры…', 'Добавляю звук…', 'Собираю воедино…'],
    lipsync: ['Обрабатываю файлы…', 'Синхронизирую губы…', 'Завершаю…'],
  },
};

// Rough wall-clock targets (seconds) that drive the eased progress bar toward ~95%
// without ever claiming completion before the asset actually returns.
const PROGRESS_TARGET: Record<'image' | 'music' | 'video' | 'lipsync', number> = {
  // Pace each bar to the REAL wall-clock so it never hits 95% then sits frozen
  // (which read as "broken / not generating"). The 30s film is the big one: six
  // LTX clips (~4–5 min) + the FFmpeg montage (~3 min) ≈ 7–8 min end-to-end —
  // measured live — so the bar must crawl across ~7 min, not finish at ~2 min.
  image: 65, music: 150, video: 440, lipsync: 70,
};

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * GenerationProgress — the live "loading process" card shown in the pending
 * assistant bubble for image / music / video / lip-sync. An eased, time-based bar
 * (never a fake 100%) + narrated stage labels + an elapsed clock. For video the
 * pipeline's own streamed status (`status`) takes over the headline line.
 */
function GenerationProgress({ kind, elapsed, status, locale, targetSec }: {
  kind: 'image' | 'music' | 'video' | 'lipsync';
  elapsed: number;
  status?: string;
  locale: Lang;
  /** Override the eased-bar target (s) — e.g. per image resolution tier. */
  targetSec?: number;
}) {
  const stages = STAGES[locale][kind];
  const target = targetSec ?? PROGRESS_TARGET[kind];
  // Eased growth — fast at first, asymptotic toward 95% so it never "finishes"
  // ahead of the real asset. Completes only when the bubble swaps to media.
  const pct = Math.min(95, Math.round((1 - Math.exp(-elapsed / (target / 2.4))) * 100));
  const stageIdx = Math.min(stages.length - 1, Math.floor((pct / 100) * stages.length));
  const headline = status && status.trim() ? status.trim() : stages[stageIdx];
  return (
    <div className="w-[min(82vw,420px)] space-y-2.5 rounded-2xl border border-app-border/10 bg-app-elevated/40 p-3">
      {/* Headline — live pipeline status (video) or the current narrated stage —
          with a live percentage + elapsed clock so progress is always legible. */}
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-app-accent">
          <Loader2 size={14} className="shrink-0 animate-spin" />
          <span className="truncate">{headline}</span>
        </span>
        <span className="shrink-0 tabular-nums text-app-muted">{pct}% · {fmtClock(elapsed)}</span>
      </div>
      {/* Eased progress bar — never a fake 100% before the asset returns. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-border/10">
        <div className="h-full rounded-full bg-app-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.max(6, pct)}%` }} />
      </div>
      {/* Stage checklist — what each agent is doing: done ✓ · active ⟳ · pending ○.
          Makes the pipeline legible so the user sees exactly where it is. */}
      <ul className="space-y-1">
        {stages.map((s, i) => {
          const state = i < stageIdx ? 'done' : i === stageIdx ? 'active' : 'pending';
          return (
            <li key={i} className={`flex items-center gap-2 text-[12px] ${state === 'pending' ? 'text-app-muted/50' : state === 'active' ? 'text-app-text' : 'text-app-muted'}`}>
              {state === 'done' ? (
                <Check size={13} className="shrink-0 text-app-accent" />
              ) : state === 'active' ? (
                <Loader2 size={13} className="shrink-0 animate-spin text-app-accent" />
              ) : (
                <span className="h-[13px] w-[13px] shrink-0 rounded-full border border-app-border/30" />
              )}
              <span className="truncate">{s}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Animated three-dot "typing" indicator for the chat-mode pending bubble.
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="…">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-app-muted animate-bounce" style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1s' }} />
      ))}
    </span>
  );
}

// The five generative modes — declared once, rendered as a clean borderless chip
// row (no bordered container, no dividers — minimalist, Grok-style).
const MODES = [
  { id: 'chat', Icon: MessageSquare, key: 'modeChat' },
  { id: 'image', Icon: ImageIcon, key: 'modeImage' },
  { id: 'music', Icon: Music2, key: 'modeMusic' },
  { id: 'video', Icon: Film, key: 'modeVideo' },
] as const;

// ── Per-service options (real backend capabilities) ──────────────────────────
const IMG_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:2', '2:3'] as const;
type ImgAspect = (typeof IMG_ASPECTS)[number];
const IMG_QUALITIES = [['standard', '1K'], ['high', '2K'], ['ultra', '4K']] as const;
type ImgQuality = (typeof IMG_QUALITIES)[number][0];
const IMG_STYLES = ['Auto', 'Photorealistic', 'Cinematic', 'Digital Art', 'Anime', '3D Render', 'Oil Painting', 'Watercolor', 'Cyberpunk', 'Fantasy', 'Minimalist', 'Line Art', 'Pixel Art'] as const;
const MUSIC_GENRES = ['cinematic', 'pop', 'electronic', 'lo-fi', 'rock', 'hip-hop', 'classical', 'ambient', 'jazz', 'folk', 'orchestral', 'trap', 'r&b', 'funk', 'reggae'] as const;
const VIDEO_STYLES = ['Cinematic', 'Documentary', 'Anime', 'Vintage', 'Neon', 'Nature', 'Cyberpunk', 'Noir', 'Fantasy', 'Aerial'] as const;

// A small, theme-tokenised option chip used by the per-service options bar.
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${active ? 'bg-app-accent/15 text-app-accent' : 'bg-app-elevated text-app-muted hover:text-app-text'}`}
    >
      {children}
    </button>
  );
}

// First-run examples — tappable cards that make the assistant self-explanatory.
// Tapping pre-fills the composer (and switches to Image mode for a draw example)
// WITHOUT auto-sending, so the user reviews + presses send (never an accidental
// spend). `icon` maps to a lucide glyph in the render.
type StarterIcon = 'chat' | 'image' | 'spark' | 'music' | 'film';
const STARTERS: Record<Lang, { label: string; prompt: string; mode: 'chat' | 'image' | 'music' | 'video'; icon: StarterIcon }[]> = {
  ka: [
    { label: 'დახატე ნეონის ქალაქი წვიმაში', prompt: 'ნეონის ქალაქი წვიმაში ღამით, კინემატოგრაფიული, ანარეკლები ასფალტზე', mode: 'image', icon: 'image' },
    { label: 'შექმენი 30-წამიანი კინო', prompt: 'ზღვისპირა ქალაქი მზის ჩასვლისას, მარტოხელა მოგზაური დადის ნაპირზე — კინემატოგრაფიული, თბილი ფერები', mode: 'video', icon: 'film' },
    { label: 'შექმენი ეპიკური კინო-მუსიკა', prompt: 'ეპიკური ორკესტრული კინო-მუსიკა, დრამატული, გმირული განწყობა', mode: 'music', icon: 'music' },
    { label: 'მომეცი იდეები ვიდეოსთვის', prompt: 'მომეცი 3 კრეატიული იდეა 30-წამიანი კინო-კლიპისთვის ქართულ ბუნებაზე', mode: 'chat', icon: 'spark' },
  ],
  en: [
    { label: 'Draw a neon city in the rain', prompt: 'A neon city in the rain at night, cinematic, reflections on the wet asphalt', mode: 'image', icon: 'image' },
    { label: 'Make a 30-second film', prompt: 'A seaside town at sunset, a lone traveller walking along the shore — cinematic, warm tones', mode: 'video', icon: 'film' },
    { label: 'Compose epic cinematic music', prompt: 'Epic orchestral cinematic score, dramatic, heroic mood', mode: 'music', icon: 'music' },
    { label: 'Give me ideas for a video', prompt: 'Give me 3 creative ideas for a 30-second cinematic clip about Georgian nature', mode: 'chat', icon: 'spark' },
  ],
  ru: [
    { label: 'Нарисуй неоновый город под дождём', prompt: 'Неоновый город под дождём ночью, кинематографично, отражения на мокром асфальте', mode: 'image', icon: 'image' },
    { label: 'Сделай 30-секундный фильм', prompt: 'Приморский город на закате, одинокий путник идёт по берегу — кинематографично, тёплые тона', mode: 'video', icon: 'film' },
    { label: 'Создай эпичную кино-музыку', prompt: 'Эпичная оркестровая кино-музыка, драматичная, героическое настроение', mode: 'music', icon: 'music' },
    { label: 'Идеи для видео', prompt: 'Дай 3 креативные идеи для 30-секундного кинороликa о природе Грузии', mode: 'chat', icon: 'spark' },
  ],
};

interface Media { dataUrl: string; mimeType: string }
// A one-click re-roll spec: enough to re-run the EXACT image/music generation that
// produced a result (same prompt + settings → a fresh variation). Persisted with the
// message so the Regenerate button survives reloads.
type ImageRegenSpec = { kind: 'image'; prompt: string; quality: ImgQuality; aspect: ImgAspect; style: string; referenceImage?: string };
type MusicRegenSpec = { kind: 'music'; prompt: string; genre: string; instrumental: boolean; lyrics?: string };
type RegenSpec = ImageRegenSpec | MusicRegenSpec;
// A grid of N image variations generated together (the ×2 / ×4 batch). Each tile
// fills in independently as its own parallel generation lands.
interface BatchTile { status: 'pending' | 'done' | 'failed'; url?: string }
interface ImageBatch { spec: ImageRegenSpec; tiles: BatchTile[] }
interface Msg { role: 'user' | 'assistant'; text: string; medias?: Media[]; imageUrl?: string; audioUrl?: string; videoUrl?: string; storyboard?: { ordinal: number; beat?: string; frameUrl: string | null }[]; regen?: RegenSpec; batch?: ImageBatch }

// Up to this many files/images (or one video) can ride along with a single message.
const MAX_ATTACHMENTS = 5;

const isImage = (m: string) => m.startsWith('image/');
const isAudio = (m: string) => m.startsWith('audio/');
const isVideo = (m: string) => m.startsWith('video/');

// ── Multi-conversation chat history (localStorage) ───────────────────────────
// A real chat history like ChatGPT/Grok: every conversation is saved (id + title
// + lean messages + updatedAt), survives reloads, can be resumed/renamed/deleted,
// and "New Chat" starts a fresh one while the previous stays in the list. We store
// a LEAN copy — text + remote result URLs — and DROP base64 `medias` uploads (they
// would blow the ~5 MB quota). `OMNI_CURRENT_ID_KEY` tracks the active chat so a
// reload or "New Chat" (see ServiceHub) resumes/forks correctly.
export const OMNI_CONVERSATIONS_KEY = 'myavatar-omni-conversations';
export const OMNI_CURRENT_ID_KEY = 'myavatar-omni-current';
const HISTORY_MAX = 80;  // max turns kept per conversation
const CONV_MAX = 40;     // max conversations kept overall

interface Conversation { id: string; title: string; messages: Msg[]; updatedAt: number }

function newConversationId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OMNI_CONVERSATIONS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is Conversation => !!c && typeof (c as Conversation).id === 'string' && Array.isArray((c as Conversation).messages))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  } catch { return []; }
}
function saveConversations(list: Conversation[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(OMNI_CONVERSATIONS_KEY, JSON.stringify(list.slice(0, CONV_MAX))); } catch { /* quota */ }
}
function currentConversationId(): string {
  if (typeof window === 'undefined') return newConversationId();
  try {
    const id = window.localStorage.getItem(OMNI_CURRENT_ID_KEY);
    if (id) return id;
    const fresh = newConversationId();
    window.localStorage.setItem(OMNI_CURRENT_ID_KEY, fresh);
    return fresh;
  } catch { return newConversationId(); }
}
function setCurrentConversationId(id: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(OMNI_CURRENT_ID_KEY, id); } catch { /* */ }
}
// Drop a (potentially multi-MB data:) reference image before persisting a spec to
// localStorage — keeps the chat-history quota safe; the img2img source is re-supplied
// live, so a reload simply regenerates text-to-image.
function dropRef(spec: RegenSpec): RegenSpec {
  if (spec.kind === 'image' && spec.referenceImage) {
    const { referenceImage: _omit, ...rest } = spec;
    void _omit;
    return rest;
  }
  return spec;
}
function leanMessages(messages: Msg[]): Msg[] {
  return messages
    .filter((m, i) => !(i === messages.length - 1 && m.role === 'assistant' && !m.text && !m.imageUrl && !m.audioUrl && !m.videoUrl))
    .slice(-HISTORY_MAX)
    .map((m) => ({
      role: m.role,
      text: m.text,
      ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}),
      ...(m.audioUrl ? { audioUrl: m.audioUrl } : {}),
      ...(m.videoUrl ? { videoUrl: m.videoUrl } : {}),
      ...(m.regen ? { regen: dropRef(m.regen) } : {}),
      ...(m.batch ? { batch: { tiles: m.batch.tiles, spec: dropRef(m.batch.spec) as ImageRegenSpec } } : {}),
    }));
}
function conversationTitle(messages: Msg[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && m.text.trim());
  const t = (firstUser?.text ?? '').trim().replace(/\s+/g, ' ');
  return t ? (t.length > 52 ? `${t.slice(0, 52)}…` : t) : 'New chat';
}
function loadConversationMessages(id: string): Msg[] {
  return loadConversations().find((c) => c.id === id)?.messages ?? [];
}
/** Save/update the active conversation; an emptied conversation is removed. */
function upsertConversation(id: string, messages: Msg[]): void {
  const lean = leanMessages(messages);
  const list = loadConversations();
  const idx = list.findIndex((c) => c.id === id);
  if (lean.length === 0) {
    if (idx >= 0) { list.splice(idx, 1); saveConversations(list); }
    return;
  }
  const conv: Conversation = { id, title: conversationTitle(lean), messages: lean, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = conv; else list.unshift(conv);
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  saveConversations(list);
}
function deleteConversation(id: string): void {
  saveConversations(loadConversations().filter((c) => c.id !== id));
}

// ── Storyboard preview (Video mode) ───────────────────────────────────────────
interface StoryboardScene { ordinal: number; beat: string; prompt: string; frameUrl: string | null; edited?: boolean }
interface StoryboardState {
  filmPrompt: string;
  refs: string[];
  orientation: 'landscape' | 'vertical';
  seed: number;
  scenes: StoryboardScene[];
  /** LLM story scenes (one per scene) — threaded to the render so clips match. */
  sceneScripts?: string[] | null;
}

// Full-screen review surface: the six planned scenes + a frame each. The user
// approves (→ render the film anchored to these frames), regenerates, or cancels.
function StoryboardOverlay({ sb, t, busy, regenningOrdinal, onGenerate, onRegenerate, onRegenScene, onEditScene, onView, onCancel }: {
  sb: StoryboardState;
  t: (typeof COPY)[Lang];
  busy: boolean;
  /** The scene ordinal currently re-rolling its frame (null = none). */
  regenningOrdinal: number | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  onRegenScene: (ordinal: number) => void;
  onEditScene: (ordinal: number, text: string) => void;
  onView: (url: string) => void;
  onCancel: () => void;
}) {
  const portrait = sb.orientation === 'vertical';
  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-app-bg/95 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="mx-auto flex h-full w-full max-w-3xl flex-col">
        <div className="flex items-start justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-app-text">📋 {t.sbTitle}</h2>
            <p className="truncate text-[12px] text-app-muted">{t.sbReview}</p>
          </div>
          <button type="button" onClick={onCancel} aria-label={t.sbCancel} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sb.scenes.map((s) => (
              <div key={s.ordinal} className="overflow-hidden rounded-xl border border-app-border/10 bg-app-elevated">
                <div className={`relative ${portrait ? 'aspect-[9/16]' : 'aspect-video'} bg-app-border/10`}>
                  {s.frameUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.frameUrl} alt={`${t.sbScene} ${s.ordinal}`} onClick={() => s.frameUrl && onView(s.frameUrl)} className="h-full w-full cursor-zoom-in object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-app-muted/60"><ImageIcon size={22} /></div>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{t.sbScene} {s.ordinal}</span>
                  <button type="button" onClick={() => onRegenScene(s.ordinal)} disabled={regenningOrdinal !== null || busy} aria-label={t.sbRegen} title={t.sbRegen} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/80 disabled:opacity-40">
                    <RotateCcw size={13} />
                  </button>
                  {regenningOrdinal === s.ordinal && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45"><Loader2 size={20} className="animate-spin text-white" /></div>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-[11.5px] font-semibold text-app-text">{s.beat}</p>
                  {/* Editable shot description — type your own; the per-scene re-roll
                      uses your words, and they thread into the final render. */}
                  <textarea
                    value={s.prompt}
                    onChange={(e) => onEditScene(s.ordinal, e.target.value)}
                    rows={2}
                    aria-label={`${t.sbScene} ${s.ordinal}`}
                    className="mt-1 w-full resize-none rounded-md bg-app-bg/40 px-1.5 py-1 text-[11px] leading-snug text-app-muted outline-none transition-colors focus:bg-app-bg/70 focus:text-app-text focus:ring-1 focus:ring-app-accent/40"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-app-border/10 px-4 py-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <button type="button" onClick={onRegenerate} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-4 py-2.5 text-[13px] font-medium text-app-text transition-colors hover:bg-app-border/10 disabled:opacity-50">
            <RotateCcw size={15} /> {t.sbRegen}
          </button>
          <button type="button" onClick={onGenerate} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-app-accent px-4 py-2.5 text-[13.5px] font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-50">
            <Film size={16} /> {t.sbGenerate}
          </button>
        </div>
      </div>
    </div>
  );
}

// Renders children into document.body so fixed overlays (lightbox · storyboard ·
// history) escape the chat shell's stacking context and paint ABOVE root-level
// chrome like the cookie banner. SSR-safe via a mounted flag (no hydration flash).
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export default function OmniStudio({ locale = 'ka' }: { locale?: Lang }) {
  const t = COPY[locale] ?? COPY.ka;
  // The active conversation id + its messages (resumed from the saved history).
  const [conversationId, setConversationId] = useState<string>(currentConversationId);
  const [messages, setMessages] = useState<Msg[]>(() => loadConversationMessages(conversationId));
  // Chat-history panel (list of past conversations) open state.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<Conversation[]>([]);
  const [input, setInput] = useState('');
  // Up to MAX_ATTACHMENTS files (images / video / audio / pdf) ride with a message.
  const [attachments, setAttachments] = useState<Media[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  // Composer mode: 'chat' → multimodal answer; 'image' → NanoBanana image;
  // 'music' → Udio track; 'video' → the 30-second film pipeline. Every generative
  // service lives in this ONE chatbox — the prompt becomes a brand-new asset
  // (image / track / film) rendered inline in the feed.
  const [mode, setMode] = useState<'chat' | 'image' | 'music' | 'video'>('chat');
  // Full-screen image lightbox — holds the URL of the tapped picture (generated or
  // attached). null = closed. Tap a chat image to open; backdrop / X / Esc closes.
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Magic Wand — true while the prompt is being AI-enhanced in place.
  const [enhancing, setEnhancing] = useState(false);
  // Per-message actions: which assistant reply was just copied / is being read aloud.
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  // Inline edit-&-resend of a user turn: which message is being edited + its draft.
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Stop / cancel plumbing. `abortRef` aborts the in-flight fetch; `genIdRef` is a
  // monotonic generation token — every finalizer checks it so a STOPPED or
  // superseded request can never clobber a newer message (or re-clear `busy`).
  const abortRef = useRef<AbortController | null>(null);
  const genIdRef = useRef(0);
  // Abort handle for the (non-streaming) storyboard request, so Cancel can stop it.
  const storyboardAbortRef = useRef<AbortController | null>(null);
  // Live elapsed seconds during a generation — drives the progress clock + bar.
  const [elapsed, setElapsed] = useState(0);
  const genStartRef = useRef(0);
  // Scroll-to-bottom affordance — shown only when the user scrolled up.
  const [showJump, setShowJump] = useState(false);
  // Inline mode selector popover (the Gemini "Flash ⌄" analog).
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  // Per-service generation options.
  const [imgAspect, setImgAspect] = useState<ImgAspect>('1:1');
  // Default to the FAST, reliable 1K tier — live testing showed 2K/4K often
  // out-run the provider poll window and time out. Users can opt into 2K/4K.
  const [imgQuality, setImgQuality] = useState<ImgQuality>('standard');
  const [imgStyle, setImgStyle] = useState<string>('Auto');
  // ×1 / ×2 / ×4 — how many image variations to generate at once (the batch grid).
  const [imgCount, setImgCount] = useState<1 | 2 | 4>(1);
  const [musicInstrumental, setMusicInstrumental] = useState(true);
  const [musicGenre, setMusicGenre] = useState<string>('cinematic');
  // Custom lyrics for vocal tracks — empty means Udio writes the lyrics from the prompt.
  const [musicLyrics, setMusicLyrics] = useState('');
  const [videoOrientation, setVideoOrientation] = useState<'landscape' | 'vertical'>('landscape');
  const [videoStyle, setVideoStyle] = useState<string>('Cinematic');
  // PHASE 48 §2 — opt-in spoken commentator/narration. When on, a localized cue
  // is appended to the brief so the film pipeline's wantsCommentary() detector
  // fires and a voice-over track is generated + mixed under the score.
  const [videoNarration, setVideoNarration] = useState(false);
  // Scene-to-scene transition in the final stitch: soft crossfade or hard cut.
  const [videoTransition, setVideoTransition] = useState<'crossfade' | 'cut'>('crossfade');
  // Storyboard preview gate (Video mode): the planned scenes + frames the user
  // reviews BEFORE committing to the full render. null = no storyboard pending.
  const [storyboard, setStoryboard] = useState<StoryboardState | null>(null);
  const [storyboardBusy, setStoryboardBusy] = useState(false);
  // Which storyboard scene is currently re-rolling its single frame (null = none).
  const [regenningOrdinal, setRegenningOrdinal] = useState<number | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Auto-stick to the newest message — but only when the user is already near the
  // bottom, so reading scrollback isn't yanked away mid-generation.
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist < 160) scrollToBottom();
  }, [messages, busy, scrollToBottom]);

  // Persist the active conversation once a generation settles (never per token).
  // Resumed on next mount; listed/resumable in the history panel.
  useEffect(() => {
    if (!busy) upsertConversation(conversationId, messages);
  }, [messages, busy, conversationId]);

  // Switch to / start / delete conversations (the chat-history panel actions).
  const openHistory = useCallback(() => {
    upsertConversation(conversationId, messages); // flush current first
    setHistoryList(loadConversations());
    setHistoryOpen(true);
  }, [conversationId, messages]);
  const resumeConversation = useCallback((id: string) => {
    upsertConversation(conversationId, messages); // save current before leaving
    setConversationId(id);
    setCurrentConversationId(id);
    setMessages(loadConversationMessages(id));
    setHistoryOpen(false);
  }, [conversationId, messages]);
  const startNewConversation = useCallback(() => {
    upsertConversation(conversationId, messages); // save current
    const id = newConversationId();
    setConversationId(id);
    setCurrentConversationId(id);
    setMessages([]);
    setHistoryOpen(false);
  }, [conversationId, messages]);
  const removeConversation = useCallback((id: string) => {
    deleteConversation(id);
    setHistoryList(loadConversations());
    if (id === conversationId) startNewConversation();
  }, [conversationId, startNewConversation]);

  // Tick the elapsed clock while a generation is in flight.
  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    genStartRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - genStartRef.current) / 1000))), 500);
    return () => clearInterval(id);
  }, [busy]);

  // Auto-grow the composer textarea with its content (capped), like a modern chat.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Close the full-screen lightbox on Escape (desktop affordance; the backdrop tap
  // and the X button cover touch).
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const lang = locale === 'en' ? 'en-US' : locale === 'ru' ? 'ru-RU' : 'ka-GE';

  // Drive the film render (orchestrate → poll → assemble) into a fresh assistant
  // bubble. Shared by the storyboard "Generate Video" action and the direct
  // fallback. `sceneFrames` (the approved storyboard frames) anchor each scene.
  const renderFilm = useCallback(async (filmPrompt: string, refs: string[], orientation: 'landscape' | 'vertical', sceneFrames: string[] | undefined, sceneScripts?: string[] | undefined, storyboardScenes?: { ordinal: number; beat?: string; frameUrl: string | null }[]) => {
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;
    // Keep the approved storyboard frames VISIBLE in the bubble while the film
    // renders (~7 min), so the preview shows every scene + the live progress —
    // the storyboard no longer just disappears on "Generate Video".
    setMessages((prev) => [...prev, { role: 'assistant', text: t.generatingVideo, ...(storyboardScenes?.length ? { storyboard: storyboardScenes } : {}) }]);
    setBusy(true);
    try {
      const res = await driveFilmStudio({
        prompt: filmPrompt,
        referenceImages: refs,
        orientation,
        transition: videoTransition,
        ...(sceneFrames?.length ? { sceneFrames } : {}),
        ...(sceneScripts?.length ? { sceneScripts } : {}),
        locale,
        signal: ac.signal,
        onProgress: (p) => {
          const status = p.message?.trim() || t.generatingVideo;
          setMessages((prev) => {
            if (!mine()) return prev;
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant' && !last.videoUrl) next[next.length - 1] = { ...last, text: status };
            return next;
          });
        },
      });
      setMessages((prev) => {
        if (!mine()) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = res.ok && res.masterUrl
            ? { role: 'assistant', text: '', videoUrl: res.masterUrl }
            : { role: 'assistant', text: `⚠️ ${res.error || t.videoFailed}` };
        }
        return next;
      });
    } catch {
      if (!mine()) return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.videoFailed}` };
        return next;
      });
    } finally {
      if (mine()) setBusy(false);
    }
  }, [locale, videoTransition, t.generatingVideo, t.videoFailed]);

  // Plan the storyboard (6 scenes + a frame each) and open the review overlay.
  // Fail-open: a storyboard miss falls back to a direct render so the user is
  // never blocked. A user Cancel (abort) stops quietly without rendering.
  const createStoryboard = useCallback(async (filmPrompt: string, refs: string[], orientation: 'landscape' | 'vertical') => {
    const ac = new AbortController();
    storyboardAbortRef.current = ac;
    setStoryboardBusy(true);
    try {
      const res = await fetch('/api/film/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: ac.signal,
        body: JSON.stringify({ prompt: filmPrompt, orientation, referenceImages: refs, style: videoStyle, locale }),
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; seed?: number; scenes?: StoryboardScene[]; sceneScripts?: string[] | null };
      if (j.success && Array.isArray(j.scenes) && j.scenes.length > 0) {
        setStoryboard({ filmPrompt, refs, orientation, seed: j.seed ?? 0, scenes: j.scenes, sceneScripts: Array.isArray(j.sceneScripts) ? j.sceneScripts : null });
      } else {
        await renderFilm(filmPrompt, refs, orientation, undefined);
      }
    } catch {
      if (ac.signal.aborted) return; // user cancelled — do nothing
      await renderFilm(filmPrompt, refs, orientation, undefined);
    } finally {
      setStoryboardBusy(false);
    }
  }, [videoStyle, locale, renderFilm]);

  // Re-roll a SINGLE storyboard frame (the others are untouched) and swap it in.
  const regenScene = useCallback(async (ordinal: number) => {
    if (!storyboard || regenningOrdinal !== null) return;
    setRegenningOrdinal(ordinal);
    const scene = storyboard.scenes.find((s) => s.ordinal === ordinal);
    try {
      const res = await fetch('/api/film/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt: storyboard.filmPrompt, orientation: storyboard.orientation, referenceImages: storyboard.refs, style: videoStyle, locale, sceneOrdinal: ordinal, ...(scene?.edited && scene.prompt.trim() ? { scenePrompt: scene.prompt.trim() } : {}) }),
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; frameUrl?: string | null };
      if (j.success && typeof j.frameUrl === 'string') {
        const url = j.frameUrl;
        setStoryboard((prev) => prev
          ? { ...prev, scenes: prev.scenes.map((s) => (s.ordinal === ordinal ? { ...s, frameUrl: url } : s)) }
          : prev);
      }
    } catch {
      /* keep the existing frame on failure */
    } finally {
      setRegenningOrdinal(null);
    }
  }, [storyboard, regenningOrdinal, videoStyle, locale]);

  // Edit a storyboard scene's shot description in place (Storyboard scene editing).
  // The edit is used when re-rolling that scene's frame AND threaded into the final
  // render so the clip matches what the user wrote.
  const editScene = useCallback((ordinal: number, text: string) => {
    setStoryboard((prev) => prev
      ? { ...prev, scenes: prev.scenes.map((s) => (s.ordinal === ordinal ? { ...s, prompt: text, edited: true } : s)) }
      : prev);
  }, []);

  // One-click RE-ROLL of an image/music result: re-run the SAME prompt + settings
  // (a fresh variation) WITHOUT a new user bubble — the new asset lands as a fresh
  // assistant bubble beneath the original. Mirrors send()'s gen-token / abort
  // discipline so Stop and superseded requests can never clobber a newer one.
  const regenerate = useCallback(async (spec: RegenSpec) => {
    if (busy) return;
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;
    setMessages((prev) => [...prev, { role: 'assistant', text: '' }]);
    setBusy(true);
    const failMsg = spec.kind === 'image' ? t.imageFailed : t.musicFailed;
    try {
      const res = await fetch(spec.kind === 'image' ? '/api/nanobanana/image' : '/api/ai/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          spec.kind === 'image'
            ? { prompt: spec.prompt, quality: spec.quality, aspectRatio: spec.aspect, style: spec.style === 'Auto' ? undefined : spec.style, ...(spec.referenceImage ? { referenceImage: spec.referenceImage } : {}) }
            : { prompt: spec.prompt, style: spec.genre, instrumental: spec.instrumental, ...(spec.lyrics ? { lyrics: spec.lyrics } : {}) },
        ),
        credentials: 'include',
        signal: ac.signal,
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
      setMessages((prev) => {
        if (!mine()) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') {
          next[next.length - 1] = j.success && j.url
            ? (spec.kind === 'image'
                ? { role: 'assistant', text: '', imageUrl: j.url, regen: spec }
                : { role: 'assistant', text: '', audioUrl: j.url, regen: spec })
            : { role: 'assistant', text: `⚠️ ${j.error || failMsg}` };
        }
        return next;
      });
    } catch {
      if (!mine()) return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${failMsg}` };
        return next;
      });
    } finally {
      if (mine()) setBusy(false);
    }
  }, [busy, t.imageFailed, t.musicFailed]);

  // Edit a generated/attached image with img2img: load it as the source + switch to
  // Image mode; the next prompt transforms it. https URLs feed NanoBanana directly,
  // data: uploads are hosted by the route first.
  const startImageEdit = useCallback((url: string) => {
    setMode('image');
    setAttachments([{ dataUrl: url, mimeType: 'image/png' }]);
    setLightbox(null);
    setTimeout(() => { try { taRef.current?.focus(); } catch { /* noop */ } }, 60);
  }, []);

  // ×2 / ×4 image batch: generate N variations of the SAME prompt in parallel into
  // ONE result grid, each tile filling in as its generation lands. Reused by send
  // (new batch) and the grid's "regenerate all". Mirrors send()'s gen-token / abort
  // discipline so Stop and superseded requests can never clobber a newer grid.
  const runImageBatch = useCallback(async (spec: ImageRegenSpec, count: number) => {
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;
    setMessages((prev) => [...prev, { role: 'assistant', text: '', batch: { spec, tiles: Array.from({ length: count }, () => ({ status: 'pending' as const })) } }]);
    setBusy(true);
    const updateTile = (k: number, tile: BatchTile) => {
      setMessages((prev) => {
        if (!mine()) return prev;
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          const mm = next[i];
          if (mm && mm.role === 'assistant' && mm.batch) {
            const tiles = mm.batch.tiles.slice();
            tiles[k] = tile;
            next[i] = { ...mm, batch: { ...mm.batch, tiles } };
            break;
          }
        }
        return next;
      });
    };
    await Promise.all(
      Array.from({ length: count }, async (_unused, k) => {
        try {
          const res = await fetch('/api/nanobanana/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: spec.prompt, quality: spec.quality, aspectRatio: spec.aspect, style: spec.style === 'Auto' ? undefined : spec.style, ...(spec.referenceImage ? { referenceImage: spec.referenceImage } : {}) }),
            credentials: 'include',
            signal: ac.signal,
          });
          const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string };
          updateTile(k, j.success && j.url ? { status: 'done', url: j.url } : { status: 'failed' });
        } catch {
          updateTile(k, { status: 'failed' });
        }
      }),
    );
    if (mine()) setBusy(false);
  }, []);

  // Stream one chat turn from /api/chat/gemini into a fresh assistant bubble. Shared
  // by send (a new turn) and regenerateChat (re-roll the last answer). Owns its own
  // gen token so Stop / a superseded request never clobbers a newer stream.
  const streamChat = useCallback(async (history: Msg[]) => {
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;
    setMessages([...history, { role: 'assistant', text: '' }]);
    setBusy(true);
    // Build the Gemini payload: text-only → string content; with media → native
    // multimodal parts (image / file) the route forwards as inline_data.
    const payload = history.map((m) => {
      if (m.medias && m.medias.length) {
        const mediaParts = m.medias.map((md) => isImage(md.mimeType)
          ? { type: 'image', image: md.dataUrl }
          : { type: 'file', data: md.dataUrl, mimeType: md.mimeType });
        return { role: m.role, content: [
          ...(m.text ? [{ type: 'text', text: m.text }] : []),
          ...mediaParts,
        ] };
      }
      return { role: m.role, content: m.text };
    });
    try {
      const res = await fetch('/api/chat/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload }), credentials: 'include', signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error('stream failed');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        if (!mine()) { try { await reader.cancel(); } catch { /* noop */ } break; }
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const mm = line.match(/^data:\s*(.+)$/s);
          if (!mm) continue;
          try {
            const j = JSON.parse(mm[1]!) as { text?: string };
            if (j.text) {
              setMessages((prev) => {
                if (!mine()) return prev;
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') next[next.length - 1] = { ...last, text: last.text + j.text };
                return next;
              });
            }
          } catch { /* ignore non-JSON keepalive lines */ }
        }
      }
    } catch {
      if (!mine()) return; // stopped / superseded — keep the partial stream as-is
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant' && !last.text) next[next.length - 1] = { ...last, text: '⚠️' };
        return next;
      });
    } finally {
      if (mine()) setBusy(false);
    }
  }, []);

  // Regenerate the LAST assistant reply: re-stream from the conversation up to (and
  // including) the user turn that prompted it — the standard chat "try again" /
  // retry-on-error. Drops the old answer and streams a fresh one in its place.
  const regenerateChat = useCallback(() => {
    if (busy) return;
    let lastA = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'assistant') { lastA = i; break; }
    }
    if (lastA < 0) return;
    void streamChat(messages.slice(0, lastA));
  }, [busy, messages, streamChat]);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;

    // New generation token + abort controller. Every async finalizer below checks
    // `mine()` before mutating state, so Stop (which bumps the token + aborts) or a
    // superseded request can never overwrite a newer bubble or re-toggle `busy`.
    const myGen = ++genIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    const mine = () => genIdRef.current === myGen;

    // ── IMAGE GENERATION (NanoBanana) ──────────────────────────────────────────
    // In image mode the typed prompt becomes a brand-new image: POST it to
    // /api/nanobanana/image and render the returned URL as an assistant image
    // bubble. Text prompt is required; fail-soft to a clean retry notice.
    // NOTE: image generation is text-to-image — it cannot consume an uploaded
    // file. So if the user attached photos/files, we DON'T run image gen here;
    // we fall through to the multimodal CHAT branch, which sends the text + the
    // attachments together (and clears them). This fixes "the file stays in the
    // box and only the text is sent" when an attachment is present in Image mode.
    // Image mode: an attached IMAGE becomes the img2img / EDIT source (the route hosts
    // it + feeds NanoBanana); a file/audio attachment instead falls through to the
    // multimodal chat branch (it can't be an image input).
    const imgRef = mode === 'image' ? attachments.find((a) => isImage(a.mimeType))?.dataUrl : undefined;
    const nonImageAttach = attachments.some((a) => !isImage(a.mimeType));
    if (mode === 'image' && text && !nonImageAttach) {
      const imgSpec: ImageRegenSpec = { kind: 'image', prompt: text, quality: imgQuality, aspect: imgAspect, style: imgStyle, ...(imgRef ? { referenceImage: imgRef } : {}) };
      // ×2 / ×4 → generate N variations in parallel into one result grid.
      if (imgCount > 1) {
        setMessages((prev) => [...prev, { role: 'user', text, ...(attachments.length ? { medias: attachments } : {}) }]);
        setInput(''); setAttachments([]);
        await runImageBatch(imgSpec, imgCount);
        return;
      }
      setMessages((prev) => [...prev, { role: 'user', text, ...(attachments.length ? { medias: attachments } : {}) }, { role: 'assistant', text: '' }]);
      setInput(''); setAttachments([]); setBusy(true);
      try {
        const res = await fetch('/api/nanobanana/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, quality: imgQuality, aspectRatio: imgAspect, style: imgStyle === 'Auto' ? undefined : imgStyle, ...(imgRef ? { referenceImage: imgRef } : {}) }),
          credentials: 'include',
          signal: ac.signal,
        });
        const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
        setMessages((prev) => {
          if (!mine()) return prev;
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] =
              j.success && j.url
                ? { role: 'assistant', text: '', imageUrl: j.url, regen: imgSpec }
                : { role: 'assistant', text: `⚠️ ${j.error || t.imageFailed}` };
          }
          return next;
        });
      } catch {
        if (!mine()) return;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.imageFailed}` };
          return next;
        });
      } finally {
        if (mine()) setBusy(false);
      }
      return;
    }

    // ── MUSIC GENERATION (Udio) ────────────────────────────────────────────────
    // In music mode the prompt describes a vibe; POST it to /api/ai/music (Udio →
    // re-hosted to Supabase) and render the track as an inline audio player.
    // Same rule as Image: music is text-to-music. With attachments present, fall
    // through to multimodal chat so the files are actually sent (and cleared).
    if (mode === 'music' && text && attachments.length === 0) {
      setMessages((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: '' }]);
      setInput(''); setBusy(true);
      try {
        const res = await fetch('/api/ai/music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, style: musicGenre, instrumental: musicInstrumental, ...(!musicInstrumental && musicLyrics.trim() ? { lyrics: musicLyrics.trim() } : {}) }),
          credentials: 'include',
          signal: ac.signal,
        });
        const j = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
        setMessages((prev) => {
          if (!mine()) return prev;
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] =
              j.success && j.url
                ? { role: 'assistant', text: '', audioUrl: j.url, regen: { kind: 'music', prompt: text, genre: musicGenre, instrumental: musicInstrumental, ...(!musicInstrumental && musicLyrics.trim() ? { lyrics: musicLyrics.trim() } : {}) } }
                : { role: 'assistant', text: `⚠️ ${j.error || t.musicFailed}` };
          }
          return next;
        });
      } catch {
        if (!mine()) return;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') next[next.length - 1] = { role: 'assistant', text: `⚠️ ${t.musicFailed}` };
          return next;
        });
      } finally {
        if (mine()) setBusy(false);
      }
      return;
    }

    // ── VIDEO GENERATION (30-second film pipeline) ─────────────────────────────
    // In video mode the prompt is a scene; an attached photo locks the character.
    // Reuses the proven driveFilmStudio client (orchestrate → poll → assemble),
    // streams its live status into the assistant bubble, then renders the master
    // inline — so the full film service lives in this one chatbox.
    if (mode === 'video' && text) {
      const refs = attachments.filter((a) => isImage(a.mimeType)).map((a) => a.dataUrl);
      const filmPrompt = `${videoStyle ? `${text}. Visual style: ${videoStyle.toLowerCase()}, cinematic.` : text}${videoNarration ? t.narrationCue : ''}`;
      setMessages((prev) => [...prev, { role: 'user', text, ...(attachments.length ? { medias: attachments } : {}) }]);
      setInput(''); setAttachments([]);
      // Storyboard-FIRST: plan the 6 scenes + a frame each for the user to review;
      // the approved frames then anchor the full render (createStoryboard → renderFilm).
      await createStoryboard(filmPrompt, refs, videoOrientation);
      return;
    }

    // ── CHAT (multimodal Gemini) ───────────────────────────────────────────────
    const userMsg: Msg = { role: 'user', text, ...(attachments.length ? { medias: attachments } : {}) };
    setInput(''); setAttachments([]);
    await streamChat([...messages, userMsg]);
  }, [input, attachments, busy, messages, mode, locale, imgAspect, imgQuality, imgStyle, imgCount, runImageBatch, musicGenre, musicInstrumental, musicLyrics, videoOrientation, videoStyle, videoNarration, createStoryboard, streamChat, t.narrationCue, t.imageFailed, t.musicFailed]);

  // STOP — cancel the in-flight generation. Bumps the generation token (so every
  // pending finalizer no-ops), aborts the fetch, frees the composer, and converts
  // an empty pending bubble into a "stopped" note (a streamed partial is kept).
  const stop = useCallback(() => {
    genIdRef.current += 1;
    try { abortRef.current?.abort(); } catch { /* noop */ }
    abortRef.current = null;
    setBusy(false);
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === 'assistant' && !last.text && !last.imageUrl && !last.audioUrl && !last.videoUrl) {
        next[next.length - 1] = { role: 'assistant', text: `⏹ ${t.stopped}` };
      }
      return next;
    });
  }, [t.stopped]);

  // Abort any in-flight request if the studio unmounts (e.g. New Chat remount).
  useEffect(() => () => { try { abortRef.current?.abort(); } catch { /* noop */ } }, []);

  // Magic Wand — rewrite the current textarea prompt into an AI-optimized version
  // IN PLACE (Section 7 / 8A). Fail-soft: the endpoint returns the original prompt
  // on any miss, so the composer is never blanked.
  const magicEnhance = useCallback(async () => {
    const text = input.trim();
    if (!text || enhancing || busy) return;
    setEnhancing(true);
    try {
      const res = await fetch('/api/ai/magic-wand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
        credentials: 'include',
      });
      const j = (await res.json().catch(() => ({}))) as { enhanced?: string };
      if (j.enhanced && j.enhanced.trim()) setInput(j.enhanced.trim());
    } catch {
      /* fail-soft — keep the original prompt */
    } finally {
      setEnhancing(false);
    }
  }, [input, enhancing, busy]);

  // Copy an assistant reply to the clipboard (2s ✓ feedback).
  const copyMsg = useCallback(async (text: string, i: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(i);
      setTimeout(() => setCopiedIdx((c) => (c === i ? null : c)), 2000);
    } catch {
      /* clipboard blocked — no-op */
    }
  }, []);

  // Edit & resend a user turn: replace it with the edited text and re-run the chat
  // from that point (everything after it is dropped) — the standard "edit message".
  const startEdit = useCallback((i: number) => {
    if (busy) return;
    setEditingIdx(i);
    setEditText(messages[i]?.text ?? '');
  }, [busy, messages]);
  const cancelEdit = useCallback(() => { setEditingIdx(null); setEditText(''); }, []);
  const saveEdit = useCallback(() => {
    if (editingIdx === null) return;
    const idx = editingIdx;
    const orig = messages[idx];
    const trimmed = editText.trim();
    if (!orig || orig.role !== 'user' || !trimmed) { setEditingIdx(null); return; }
    setEditingIdx(null);
    setEditText('');
    void streamChat([...messages.slice(0, idx), { role: 'user', text: trimmed, ...(orig.medias ? { medias: orig.medias } : {}) }]);
  }, [editingIdx, editText, messages, streamChat]);

  // Read an assistant reply aloud via the premium TTS route (ElevenLabs Georgian
  // voice, Google-TTS fallback). Toggles: tapping the speaking message stops it.
  // Only one plays at a time. Fail-soft: any miss just clears the speaking state.
  const speakMsg = useCallback(async (text: string, i: number) => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (speakingIdx === i) { setSpeakingIdx(null); return; }
    setSpeakingIdx(i);
    try {
      const res = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 5000), locale }),
      });
      if (!res.ok) { setSpeakingIdx((s) => (s === i ? null : s)); return; }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      ttsAudioRef.current = audio;
      const clear = () => { setSpeakingIdx((s) => (s === i ? null : s)); URL.revokeObjectURL(url); if (ttsAudioRef.current === audio) ttsAudioRef.current = null; };
      audio.onended = clear;
      audio.onerror = clear;
      await audio.play();
    } catch {
      setSpeakingIdx((s) => (s === i ? null : s));
      ttsAudioRef.current = null;
    }
  }, [speakingIdx, locale]);

  // Stop any in-flight read-aloud when the studio unmounts.
  useEffect(() => () => { try { ttsAudioRef.current?.pause(); } catch { /* noop */ } }, []);

  const toggleMic = useCallback(async () => {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        setRecording(false);
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const fd = new FormData();
        fd.append('audio', blob, 'clip.webm');
        fd.append('language', lang);
        try {
          const r = await fetch('/api/voice/transcribe', { method: 'POST', body: fd });
          const j = (await r.json().catch(() => ({}))) as { text?: string };
          if (j.text) setInput((v) => (v ? `${v} ${j.text}` : j.text!));
        } catch { /* fail-soft */ }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }, [recording, lang]);

  // Composer derived state: the active mode's icon/label for the inline selector,
  // and whether there's anything to send (drives the mic↔send swap).
  const activeMode = MODES.find((mm) => mm.id === mode) ?? MODES[0];
  const ActiveModeIcon = activeMode.Icon;
  const activeModeKey = activeMode.key;
  // Chat can send on text OR attachments alone; the generative modes need a text
  // prompt (this also prevents an image/music/video send with only files from
  // silently falling through to the chat branch).
  // Sendable when there's text OR any attachment — in EVERY mode. An attachment
  // in Image/Music mode routes to multimodal chat (see send), so it must be able
  // to trigger a send; this is also what clears the lingering attachment.
  const canSend = !!input.trim() || attachments.length > 0;

  return (
    <div
      className="relative mx-auto flex h-full w-full max-w-3xl flex-col px-4 pt-2 text-app-text"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {/* Chat-history button — opens the list of past conversations (resume/delete). */}
      <button
        type="button"
        onClick={openHistory}
        aria-label={t.historyTitle}
        title={t.historyTitle}
        className="absolute left-3 top-1.5 z-20 flex h-7 items-center gap-1.5 rounded-full bg-app-elevated/80 px-2.5 text-[11.5px] font-medium text-app-muted backdrop-blur transition-colors hover:text-app-text"
      >
        <History size={13} /> <span className="hidden sm:inline">{t.historyTitle}</span>
      </button>
      <div
        ref={feedRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 160);
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3 pt-1"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-2 text-center">
            <div className="space-y-1.5">
              <h2 className="text-[22px] font-semibold tracking-tight text-app-text">{t.greeting}</h2>
              <p className="mx-auto max-w-sm text-[13.5px] text-app-muted">{t.empty}</p>
            </div>
            {/* Tappable first-run examples — borderless, minimal. Pre-fill the
                composer (never auto-send); the user reviews then presses send. */}
            <div className="flex w-full max-w-md flex-col gap-1.5">
              {(STARTERS[locale] ?? STARTERS.ka).map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setMode(s.mode); setInput(s.prompt); }}
                  className="group flex items-center gap-3 rounded-2xl bg-app-elevated/60 px-4 py-3 text-left text-[13.5px] text-app-text transition-colors hover:bg-app-elevated active:scale-[0.99] motion-reduce:active:scale-100"
                >
                  <span className="shrink-0 text-app-muted transition-colors group-hover:text-app-accent">
                    {s.icon === 'image' ? <ImageIcon size={16} /> : s.icon === 'film' ? <Film size={16} /> : s.icon === 'music' ? <Music2 size={16} /> : s.icon === 'spark' ? <Sparkles size={16} /> : <MessageSquare size={16} />}
                  </span>
                  <span className="flex-1">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`text-[14.5px] leading-relaxed ${
              m.role === 'user'
                ? 'max-w-[85%] rounded-2xl bg-app-elevated px-4 py-2.5 text-app-text'
                : 'w-full max-w-full text-app-text'
            }`}>
              {m.medias && m.medias.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {m.medias.map((md, mi) => (
                    isImage(md.mimeType) ? (
                      <button key={mi} type="button" onClick={() => setLightbox(md.dataUrl)} className="block cursor-zoom-in" aria-label="open fullscreen">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={md.dataUrl} alt="attachment" className="max-h-44 rounded-lg" />
                      </button>
                    ) : isVideo(md.mimeType) ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video key={mi} src={md.dataUrl} controls className="max-h-44 rounded-lg" />
                    ) : isAudio(md.mimeType) ? (
                      <audio key={mi} src={md.dataUrl} controls className="w-full" />
                    ) : (
                      <span key={mi} className="inline-flex items-center gap-1.5 rounded-lg bg-app-elevated px-2 py-1 text-[11px] text-app-muted"><FileText size={12} /> document</span>
                    )
                  ))}
                </div>
              )}
              {m.imageUrl && (
                <div className="space-y-1.5">
                  <button type="button" onClick={() => setLightbox(m.imageUrl!)} className="block w-full cursor-zoom-in" aria-label="open fullscreen">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.imageUrl} alt="generated" className="max-h-96 w-full rounded-xl object-contain ring-1 ring-app-border/10 transition-opacity hover:opacity-90" />
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={m.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
                    >
                      <Download size={13} /> {t.imgDownload}
                    </a>
                    {m.regen && (
                      <button type="button" onClick={() => void regenerate(m.regen!)} disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40">
                        <RotateCcw size={13} /> {t.regenerate}
                      </button>
                    )}
                    {/* Edit → load this image as the img2img source. */}
                    <button type="button" onClick={() => startImageEdit(m.imageUrl!)} disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40">
                      <Pencil size={13} /> {t.editImage}
                    </button>
                  </div>
                </div>
              )}
              {m.batch && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {m.batch.tiles.map((tile, k) => (
                      <div key={k} className="relative overflow-hidden rounded-xl bg-app-elevated/40 ring-1 ring-app-border/10" style={{ aspectRatio: m.batch!.spec.aspect.replace(':', '/') }}>
                        {tile.status === 'done' && tile.url ? (
                          <button type="button" onClick={() => setLightbox(tile.url!)} className="block h-full w-full cursor-zoom-in" aria-label="open fullscreen">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={tile.url} alt="variation" className="h-full w-full object-cover transition-opacity hover:opacity-90" />
                          </button>
                        ) : tile.status === 'failed' ? (
                          <div className="flex h-full w-full items-center justify-center text-app-danger/70"><X size={18} /></div>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-app-muted/50"><Loader2 size={18} className="animate-spin" /></div>
                        )}
                      </div>
                    ))}
                  </div>
                  {!m.batch.tiles.some((tl) => tl.status === 'pending') && (
                    <button type="button" onClick={() => void runImageBatch(m.batch!.spec, m.batch!.tiles.length)} disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40">
                      <RotateCcw size={13} /> {t.regenerate}
                    </button>
                  )}
                </div>
              )}
              {m.audioUrl && (
                <div className="space-y-2 rounded-2xl bg-app-elevated/50 p-3">
                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-app-muted"><Music2 size={14} className="text-app-accent" /> {t.modeMusic}</div>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio src={m.audioUrl} controls className="w-full" />
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={m.audioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
                    >
                      <Download size={13} /> {t.imgDownload}
                    </a>
                    {m.regen && (
                      <button type="button" onClick={() => void regenerate(m.regen!)} disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3.5 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-40">
                        <RotateCcw size={13} /> {t.regenerate}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {m.videoUrl && (
                <div className="space-y-1.5">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video src={m.videoUrl} controls playsInline className="max-h-96 w-full rounded-xl bg-black/90 ring-1 ring-app-border/10" />
                  <a
                    href={m.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
                  >
                    <Download size={13} /> {t.imgDownload}
                  </a>
                </div>
              )}
              {(() => {
                const pending = busy && m.role === 'assistant' && i === messages.length - 1 && !m.imageUrl && !m.audioUrl && !m.videoUrl && !m.batch;
                // Generative modes get the live staged progress card (bar + clock +
                // narrated steps) — the real "loading process". Chat gets typing dots.
                if (pending && (mode !== 'chat' || (m.storyboard?.length ?? 0) > 0)) {
                  // Pace the image bar to the chosen resolution (1K ≈ 40s · 2K ≈
                  // 170s · 4K ≈ 220s) so it doesn't sit at 95% looking stuck.
                  const imgTarget = imgQuality === 'standard' ? 42 : imgQuality === 'high' ? 170 : 215;
                  const kind: 'image' | 'music' | 'video' | 'lipsync' = (m.storyboard?.length ?? 0) > 0 ? 'video' : (mode as 'image' | 'music' | 'video');
                  return (
                    <div className="space-y-3">
                      {/* Keep the storyboard frames in view during the ~7-min render. */}
                      {m.storyboard && m.storyboard.length > 0 && (
                        <div className="grid grid-cols-3 gap-1.5 w-[min(82vw,420px)]">
                          {m.storyboard.map((s) => (
                            <div key={s.ordinal} className={`relative overflow-hidden rounded-lg ${videoOrientation === 'vertical' ? 'aspect-[9/16]' : 'aspect-video'} bg-app-border/10 ring-1 ring-app-border/10`}>
                              {s.frameUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={s.frameUrl} alt={`${t.sbScene} ${s.ordinal}`} onClick={() => s.frameUrl && setLightbox(s.frameUrl)} className="h-full w-full cursor-zoom-in object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-app-muted/50"><ImageIcon size={15} /></div>
                              )}
                              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] font-medium text-white">{s.ordinal}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <GenerationProgress kind={kind} elapsed={elapsed} status={m.text} locale={locale} targetSec={kind === 'image' ? imgTarget : undefined} />
                    </div>
                  );
                }
                if (pending && mode === 'chat' && !m.text) return <TypingDots />;
                if (!m.text) return null;
                // Inline edit mode for a user turn → textarea + Send/Cancel.
                if (m.role === 'user' && editingIdx === i) {
                  return (
                    <div className="space-y-1.5">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } else if (e.key === 'Escape') cancelEdit(); }}
                        className="w-[min(70vw,420px)] max-w-full resize-none rounded-xl bg-app-surface px-3 py-2 text-[14.5px] text-app-text outline-none ring-1 ring-app-accent/40"
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={cancelEdit} className="rounded-full px-3 py-1.5 text-[12px] font-medium text-app-muted transition-colors hover:text-app-text">{locale === 'en' ? 'Cancel' : locale === 'ru' ? 'Отмена' : 'გაუქმება'}</button>
                        <button type="button" onClick={saveEdit} disabled={!editText.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-40">{locale === 'en' ? 'Send' : locale === 'ru' ? 'Отправить' : 'გაგზავნა'}</button>
                      </div>
                    </div>
                  );
                }
                // Assistant replies render as rich markdown (bold · lists · code ·
                // links · tables); the user's own text stays verbatim.
                return m.role === 'assistant'
                  ? <Markdown>{m.text}</Markdown>
                  : <span className="whitespace-pre-wrap">{m.text}</span>;
              })()}
              {/* Edit a user turn → re-run the chat from here (drops later turns). */}
              {m.role === 'user' && m.text && editingIdx !== i && !busy && (
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => startEdit(i)}
                    aria-label={locale === 'en' ? 'Edit' : locale === 'ru' ? 'Изменить' : 'რედაქტირება'}
                    title={locale === 'en' ? 'Edit' : locale === 'ru' ? 'Изменить' : 'რედაქტირება'}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-app-muted/70 transition-colors hover:bg-app-border/15 hover:text-app-accent"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              )}
              {/* Per-response actions on a TEXT reply — Read-aloud + Copy. No
                  Like/Dislike, per the one-window spec. */}
              {m.role === 'assistant' && m.text && !m.text.startsWith('⚠️') && !m.text.startsWith('⏹') && (
                <div className="mt-1 flex items-center gap-0.5 text-app-muted">
                  <button
                    type="button"
                    onClick={() => void speakMsg(m.text, i)}
                    aria-label={locale === 'en' ? 'Read aloud' : locale === 'ru' ? 'Озвучить' : 'ხმამაღლა წაკითხვა'}
                    title={locale === 'en' ? 'Read aloud' : locale === 'ru' ? 'Озвучить' : 'ხმამაღლა წაკითხვა'}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-app-elevated hover:text-app-accent ${speakingIdx === i ? 'text-app-accent' : ''}`}
                  >
                    {speakingIdx === i ? <Square size={13} /> : <Volume2 size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyMsg(m.text, i)}
                    aria-label={locale === 'en' ? 'Copy' : locale === 'ru' ? 'Копировать' : 'კოპირება'}
                    title={locale === 'en' ? 'Copy' : locale === 'ru' ? 'Копировать' : 'კოპირება'}
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-app-elevated hover:text-app-accent ${copiedIdx === i ? 'text-app-accent' : ''}`}
                  >
                    {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  {i === messages.length - 1 && !busy && (
                    <button
                      type="button"
                      onClick={() => regenerateChat()}
                      aria-label={t.regenerate}
                      title={t.regenerate}
                      className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-app-elevated hover:text-app-accent"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              )}
              {/* Retry — the last reply errored; re-run the same turn cleanly. */}
              {m.role === 'assistant' && i === messages.length - 1 && !busy && m.text.startsWith('⚠️') && (
                <button
                  type="button"
                  onClick={() => regenerateChat()}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-app-elevated px-3 py-1.5 text-[12px] font-semibold text-app-text ring-1 ring-app-border/15 transition-opacity hover:opacity-90 active:scale-[0.98]"
                >
                  <RotateCcw size={13} /> {t.regenerate}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Scroll-to-bottom — appears only when the user has scrolled up. */}
      {showJump && messages.length > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          aria-label={t.scrollDown}
          title={t.scrollDown}
          className="absolute left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-app-border/15 bg-app-surface text-app-text shadow-lg backdrop-blur transition-colors hover:text-app-accent"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 104px)' }}
        >
          <ChevronDown size={18} />
        </button>
      )}

      {/* Composer — refined, Gemini-style: one rounded pill, [+] attach, an inline
          mode selector (the "Flash ⌄" analog) and mic-when-empty / send-when-typing. */}
      <div className="shrink-0 pt-1">
        {/* Per-service options — real backend capabilities, shown for the active
            generative mode. Borderless scrollable chip rows (clean, Gemini-like). */}
        {mode !== 'chat' && (
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {mode === 'image' && (
              <>
                {IMG_ASPECTS.map((a) => <Chip key={a} active={imgAspect === a} onClick={() => setImgAspect(a)}>{a}</Chip>)}
                <span className="mx-0.5 h-4 w-px shrink-0 bg-app-border/15" />
                {IMG_QUALITIES.map(([q, lbl]) => <Chip key={q} active={imgQuality === q} onClick={() => setImgQuality(q)}>{lbl}</Chip>)}
                <span className="mx-0.5 h-4 w-px shrink-0 bg-app-border/15" />
                {([1, 2, 4] as const).map((n) => <Chip key={n} active={imgCount === n} onClick={() => setImgCount(n)}>{n === 1 ? '1' : `×${n}`}</Chip>)}
                <span className="mx-0.5 h-4 w-px shrink-0 bg-app-border/15" />
                {IMG_STYLES.map((s) => <Chip key={s} active={imgStyle === s} onClick={() => setImgStyle(s)}>{s}</Chip>)}
              </>
            )}
            {mode === 'music' && (
              <>
                <Chip active={musicInstrumental} onClick={() => setMusicInstrumental(true)}>{t.instrumental}</Chip>
                <Chip active={!musicInstrumental} onClick={() => setMusicInstrumental(false)}>{t.withVocals}</Chip>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-app-border/15" />
                {MUSIC_GENRES.map((g) => <Chip key={g} active={musicGenre === g} onClick={() => setMusicGenre(g)}>{g}</Chip>)}
              </>
            )}
            {mode === 'video' && (
              <>
                <Chip active={attachments.some((a) => isImage(a.mimeType))} onClick={() => fileRef.current?.click()}>
                  🧑 {attachments.some((a) => isImage(a.mimeType)) ? t.charPhotoOn : t.charPhoto}
                </Chip>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-app-border/15" />
                <Chip active={videoOrientation === 'landscape'} onClick={() => setVideoOrientation('landscape')}>16:9</Chip>
                <Chip active={videoOrientation === 'vertical'} onClick={() => setVideoOrientation('vertical')}>9:16</Chip>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-app-border/15" />
                <Chip active={videoNarration} onClick={() => setVideoNarration((v) => !v)}>🎙 {t.narration}</Chip>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-app-border/15" />
                <Chip active={videoTransition === 'crossfade'} onClick={() => setVideoTransition('crossfade')}>⤫ {t.transCrossfade}</Chip>
                <Chip active={videoTransition === 'cut'} onClick={() => setVideoTransition('cut')}>▮ {t.transCut}</Chip>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-app-border/15" />
                {VIDEO_STYLES.map((s) => <Chip key={s} active={videoStyle === s} onClick={() => setVideoStyle(s)}>{s}</Chip>)}
              </>
            )}
          </div>
        )}

        {/* Custom lyrics (vocals only) — the exact sung words; empty = Udio writes
            the lyrics automatically from your prompt. */}
        {mode === 'music' && !musicInstrumental && (
          <textarea
            value={musicLyrics}
            onChange={(e) => setMusicLyrics(e.target.value)}
            rows={2}
            placeholder={t.lyricsPlaceholder}
            className="mb-2 w-full resize-none rounded-xl bg-app-elevated/60 px-3 py-2 text-[13px] text-app-text outline-none transition-colors placeholder:text-app-muted/60 focus:bg-app-elevated"
          />
        )}

        {/* Attachment previews — up to MAX_ATTACHMENTS files / images / a video,
            each removable. They ride with the next message (text + files together). */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a, ai) => (
              <div key={ai} className="relative">
                {isImage(a.mimeType) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.dataUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-app-surface text-app-accent">
                    {isVideo(a.mimeType) ? <Film size={18} /> : isAudio(a.mimeType) ? <Music2 size={18} /> : <FileText size={18} />}
                  </span>
                )}
                <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, k) => k !== ai))} aria-label="remove"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/15 hover:text-app-text"><X size={11} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Input surface — one clean rounded pill. The picker accepts MULTIPLE files
            (images / video / audio / pdf), capped at MAX_ATTACHMENTS. */}
        <input ref={fileRef} type="file" multiple accept="image/*,audio/*,video/*,application/pdf" className="hidden" onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) {
            files.forEach((f) => {
              const r = new FileReader();
              r.onload = () => setAttachments((prev) => prev.length >= MAX_ATTACHMENTS ? prev : [...prev, { dataUrl: String(r.result), mimeType: f.type || 'application/octet-stream' }]);
              r.readAsDataURL(f);
            });
          }
          e.target.value = '';
        }} />
        <div className="rounded-[24px] bg-app-elevated px-3 py-2">
          {/* Full-width prompt on its own line — a long prompt is never squeezed into a
              narrow column by the controls (the old single-row pill did exactly that). */}
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            rows={1}
            disabled={enhancing}
            placeholder={recording ? t.recording : mode === 'image' ? t.imgPlaceholder : mode === 'music' ? t.musicPlaceholder : mode === 'video' ? t.videoPlaceholder : t.placeholder}
            className="max-h-40 min-h-[28px] w-full resize-none border-0 bg-transparent px-1 py-1.5 text-[16px] text-app-text placeholder:text-app-muted/70 outline-none focus:ring-0 disabled:opacity-60"
          />

          {/* Controls row — attach · mode selector · (spacer) · mic/stop/send. */}
          <div className="mt-1 flex items-center gap-1">
            {/* [+] add / attach */}
            <button type="button" onClick={() => fileRef.current?.click()} aria-label={t.attachHint} title={t.attachHint}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-text">
              <Plus size={20} />
            </button>

            {/* Inline mode selector — the "Flash ⌄" analog. Tap to pick what to create. */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setModeMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={modeMenuOpen}
                className="flex h-9 items-center gap-1 rounded-full bg-app-surface/60 px-2.5 text-[12.5px] font-medium text-app-muted transition-colors hover:bg-app-surface hover:text-app-text"
              >
                <ActiveModeIcon size={15} />
                <span>{t[activeModeKey]}</span>
                <ChevronDown size={13} className={`transition-transform ${modeMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {modeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setModeMenuOpen(false)} />
                  <div role="menu" className="absolute bottom-full left-0 z-20 mb-2 w-48 overflow-hidden rounded-2xl border border-app-border/10 bg-app-surface p-1 shadow-2xl">
                    {MODES.map(({ id, Icon, key: lk }) => (
                      <button
                        key={id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={mode === id}
                        onClick={() => { setMode(id); setModeMenuOpen(false); }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors ${mode === id ? 'bg-app-accent/10 text-app-accent' : 'text-app-text hover:bg-app-elevated'}`}
                      >
                        <Icon size={15} /> <span className="flex-1 text-left">{t[lk]}</span> {mode === id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex-1" />

            {/* Right action: Stop while busy · Wand+Send when there's something to send ·
                Mic otherwise (record voice). Mirrors Gemini's mic↔send swap. */}
            {busy ? (
              <button type="button" onClick={stop} aria-label={t.stop} title={t.stop}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-surface text-app-text transition-colors hover:text-app-accent">
                <Square size={15} className="fill-current" />
              </button>
            ) : canSend ? (
              <>
                {input.trim() && (
                  <button type="button" onClick={() => void magicEnhance()} disabled={enhancing} aria-label={t.magicHint} title={t.magicHint}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-accent disabled:opacity-40">
                    {enhancing ? <Loader2 size={18} className="animate-spin text-app-accent" /> : <Wand2 size={18} />}
                  </button>
                )}
                <button type="button" onClick={() => void send()} aria-label="send"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-accent text-app-bg transition-opacity hover:opacity-90">
                  <Send size={17} />
                </button>
              </>
            ) : (
              <button type="button" onClick={() => void toggleMic()} aria-label={t.micHint} title={t.micHint}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                  recording ? 'animate-pulse bg-app-danger/15 text-app-danger' : 'text-app-muted hover:bg-app-surface hover:text-app-text'
                }`}>
                {recording ? <Square size={16} /> : <Mic size={19} />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* All full-screen overlays portal to document.body so they render above
          root-level chrome (the cookie banner) instead of being trapped in the chat
          shell's lower stacking context. */}
      <Portal>
      {/* Full-screen image lightbox — tap any chat image to open it edge-to-edge.
          Backdrop tap / the X button / Esc all close it; the picture itself swallows
          the click so it stays open while you inspect it. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="close"
            className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="fullscreen"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[96vw] rounded-lg object-contain"
          />
          <div
            className="absolute inset-x-0 mx-auto flex w-fit items-center gap-2"
            style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <a
              href={lightbox}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="inline-flex w-fit items-center gap-1.5 rounded-full bg-app-accent px-4 py-2 text-[13px] font-semibold text-app-bg backdrop-blur"
            >
              <Download size={14} /> {t.imgDownload}
            </a>
            <button
              type="button"
              onClick={() => startImageEdit(lightbox)}
              className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/25"
            >
              <Pencil size={14} /> {t.editImage}
            </button>
          </div>
        </div>
      )}

      {/* Storyboard — generating the plan + 6 frames (cancellable). */}
      {storyboardBusy && (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-app-bg/95 px-6 text-center backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <Loader2 size={28} className="animate-spin text-app-accent" />
          <p className="text-[14px] font-medium text-app-text">{t.sbCreating}</p>
          <button type="button" onClick={() => { try { storyboardAbortRef.current?.abort(); } catch { /* noop */ } setStoryboardBusy(false); }} className="rounded-full bg-app-elevated px-4 py-2 text-[13px] font-medium text-app-muted transition-colors hover:text-app-text">
            {t.sbCancel}
          </button>
        </div>
      )}

      {/* Storyboard — review the scenes/frames, then approve → render. */}
      {storyboard && !storyboardBusy && (
        <StoryboardOverlay
          sb={storyboard}
          t={t}
          busy={busy}
          regenningOrdinal={regenningOrdinal}
          onRegenScene={(ordinal) => void regenScene(ordinal)}
          onEditScene={editScene}
          onView={(url) => setLightbox(url)}
          onGenerate={() => {
            const frameUrls = storyboard.scenes.map((s) => s.frameUrl);
            const sceneFrames = frameUrls.every((f): f is string => typeof f === 'string') ? frameUrls : undefined;
            const sb = storyboard;
            setStoryboard(null);
            // Thread the (possibly EDITED) per-scene descriptions into the render: an
            // edited scene uses the user's own words; the rest keep the rich LLM script.
            const anyEdited = sb.scenes.some((s) => s.edited);
            const scripts = (sb.sceneScripts || anyEdited)
              ? sb.scenes.map((s, i) => (s.edited && s.prompt.trim() ? s.prompt.trim() : (sb.sceneScripts?.[i] ?? s.prompt)))
              : undefined;
            // With approved per-scene frames the identity is already baked in, so the
            // original (possibly multi-MB data-URL) refs are redundant — dropping them
            // avoids a 413 body-overflow on the render dispatch when a photo was attached.
            // The (possibly edited) story scenes ride along so the clips render the SAME story.
            void renderFilm(sb.filmPrompt, sceneFrames ? [] : sb.refs, sb.orientation, sceneFrames, scripts, sb.scenes.map((s) => ({ ordinal: s.ordinal, beat: s.beat, frameUrl: s.frameUrl })));
          }}
          onRegenerate={() => {
            const sb = storyboard;
            setStoryboard(null);
            void createStoryboard(sb.filmPrompt, sb.refs, sb.orientation);
          }}
          onCancel={() => setStoryboard(null)}
        />
      )}

      {/* Chat history — the list of past conversations: resume, start new, delete. */}
      {historyOpen && (
        <div className="fixed inset-0 z-[95] flex justify-start bg-black/40 backdrop-blur-sm" onClick={() => setHistoryOpen(false)} style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-80 max-w-[86vw] flex-col bg-app-surface shadow-[0_0_60px_rgba(0,0,0,0.35)] animate-[slideIn_0.2s_ease-out]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-app-text"><History size={16} /> {t.historyTitle}</span>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="close" className="flex h-8 w-8 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-2 pb-2">
              <button type="button" onClick={startNewConversation} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-app-accent transition-colors hover:bg-app-elevated">
                <MessageSquarePlus className="h-[18px] w-[18px]" /> {t.historyNew}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
              {historyList.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-app-muted">{t.historyEmpty}</p>
              ) : (
                historyList.map((c) => (
                  <div key={c.id} className={`group flex items-center gap-1 rounded-xl pr-1 transition-colors hover:bg-app-elevated ${c.id === conversationId ? 'bg-app-elevated' : ''}`}>
                    <button type="button" onClick={() => resumeConversation(c.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left">
                      <MessageSquare className="h-4 w-4 shrink-0 text-app-muted" />
                      <span className="truncate text-[13px] text-app-text">{c.title}</span>
                    </button>
                    <button type="button" onClick={() => removeConversation(c.id)} aria-label={t.deleteLabel} title={t.deleteLabel} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-app-muted opacity-0 transition-opacity hover:text-app-accent group-hover:opacity-100">
                      <Trash2 className="h-[15px] w-[15px]" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
      </Portal>
    </div>
  );
}
