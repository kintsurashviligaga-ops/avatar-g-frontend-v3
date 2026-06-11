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
import { Send, Mic, Square, Plus, X, Loader2, Sparkles, Film, Music2, FileText, Image as ImageIcon, Download, MessageSquare, Wand2, Volume2, Copy, Check, ChevronDown } from 'lucide-react';
import { driveFilmStudio } from '@/lib/chat/filmStudioClient';
import { Markdown } from './Markdown';

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, {
  title: string; subtitle: string; placeholder: string; empty: string; thinking: string; recording: string; micHint: string;
  modeChat: string; modeImage: string; imgPlaceholder: string; generatingImage: string; imageFailed: string; imgDownload: string;
  magicHint: string;
  modeMusic: string; musicPlaceholder: string; generatingMusic: string; musicFailed: string;
  modeVideo: string; videoPlaceholder: string; generatingVideo: string; videoFailed: string;
  modeLipsync: string; lipsyncPlaceholder: string; generatingLipsync: string; lipsyncFailed: string; lipsyncNeedFiles: string; lipsyncAuth: string; lipAudioLabel: string;
  stop: string; stopped: string; scrollDown: string; regenerate: string; elapsedHint: string; greeting: string; attachHint: string;
  instrumental: string; withVocals: string;
  narration: string; narrationCue: string;
}> = {
  ka: {
    title: 'ჭკვიანი ასისტენტი', subtitle: 'ინტელექტუალური მულტიმოდალური ასისტენტი',
    placeholder: 'დაწერე, ჩაწერე ხმა, ან მიამაგრე სურათი…', empty: 'ჰკითხე ნებისმიერი რამ, შექმენი სურათი ან მუსიკა — ტექსტით, ხმით ან ფაილით.',
    thinking: 'ფიქრობს…', recording: 'იწერება…', micHint: 'ხმის ჩაწერა',
    modeChat: 'ჩეთი', modeImage: 'სურათი', imgPlaceholder: 'აღწერე სურათი, რომ დაგიხატო…',
    generatingImage: 'სურათი იქმნება…', imageFailed: 'სურათის გენერაცია ვერ მოხერხდა. სცადე თავიდან.', imgDownload: 'ჩამოტვირთვა',
    magicHint: 'AI-ით პრომპტის გაუმჯობესება',
    modeMusic: 'მუსიკა', musicPlaceholder: 'აღწერე მუსიკა (მაგ. ეპიკური კინო-სცენა)…',
    generatingMusic: 'მუსიკა იქმნება… (1–3 წუთი)', musicFailed: 'მუსიკის გენერაცია ვერ მოხერხდა. სცადე თავიდან.',
    modeVideo: 'ვიდეო', videoPlaceholder: 'აღწერე 30-წამიანი ვიდეო (ფოტო — პერსონაჟისთვის)…',
    generatingVideo: 'ვიდეო იქმნება… (1–2 წუთი)', videoFailed: 'ვიდეოს გენერაცია ვერ მოხერხდა.',
    modeLipsync: 'ლიფსინქი', lipsyncPlaceholder: 'მიამაგრე ვიდეო + აუდიო და დააჭირე გაგზავნას…',
    generatingLipsync: 'ტუჩები სინქრონდება…', lipsyncFailed: 'ლიფსინქი ვერ მოხერხდა.', lipsyncNeedFiles: 'მიამაგრე ვიდეოც და აუდიოც.', lipsyncAuth: 'ლიფსინქისთვის ჯერ გაიარე ავტორიზაცია.', lipAudioLabel: 'აუდიო',
    stop: 'შეჩერება', stopped: 'შეჩერდა', scrollDown: 'ბოლოში გადასვლა', regenerate: 'თავიდან გენერაცია', elapsedHint: 'გავიდა', greeting: 'რით დაგეხმარო?', attachHint: 'დამატება',
    instrumental: 'ინსტრუმენტალი', withVocals: 'ვოკალით',
    narration: 'ნარაცია', narrationCue: ' (პროფესიონალი კომენტატორის ხმოვანი ნარაციით)',
  },
  en: {
    title: 'Smart Assistant', subtitle: 'Intelligent multimodal assistant',
    placeholder: 'Type, record your voice, or attach an image…', empty: 'Ask anything, or generate an image or music — by text, voice or file.',
    thinking: 'Thinking…', recording: 'Recording…', micHint: 'Record voice',
    modeChat: 'Chat', modeImage: 'Image', imgPlaceholder: 'Describe an image to generate…',
    generatingImage: 'Generating image…', imageFailed: 'Image generation failed. Try again.', imgDownload: 'Download',
    magicHint: 'Enhance prompt with AI',
    modeMusic: 'Music', musicPlaceholder: 'Describe the music (e.g. epic cinematic scene)…',
    generatingMusic: 'Composing music… (1–3 min)', musicFailed: 'Music generation failed. Try again.',
    modeVideo: 'Video', videoPlaceholder: 'Describe a 30-second video (attach a photo for the character)…',
    generatingVideo: 'Producing video… (1–2 min)', videoFailed: 'Video generation failed.',
    modeLipsync: 'Lip-sync', lipsyncPlaceholder: 'Attach a video + audio, then press send…',
    generatingLipsync: 'Syncing the lips…', lipsyncFailed: 'Lip-sync failed.', lipsyncNeedFiles: 'Attach both a video and audio.', lipsyncAuth: 'Sign in first to use lip-sync.', lipAudioLabel: 'Audio',
    stop: 'Stop', stopped: 'Stopped', scrollDown: 'Scroll to bottom', regenerate: 'Regenerate', elapsedHint: 'elapsed', greeting: 'How can I help?', attachHint: 'Add',
    instrumental: 'Instrumental', withVocals: 'Vocals',
    narration: 'Narration', narrationCue: ' (with professional spoken voice-over narration)',
  },
  ru: {
    title: 'Умный ассистент', subtitle: 'Интеллектуальный мультимодальный ассистент',
    placeholder: 'Напишите, запишите голос или прикрепите изображение…', empty: 'Спросите что угодно или создайте изображение или музыку — текстом, голосом или файлом.',
    thinking: 'Думает…', recording: 'Запись…', micHint: 'Записать голос',
    modeChat: 'Чат', modeImage: 'Изображение', imgPlaceholder: 'Опишите изображение для генерации…',
    generatingImage: 'Генерирую изображение…', imageFailed: 'Не удалось сгенерировать изображение. Попробуйте снова.', imgDownload: 'Скачать',
    magicHint: 'Улучшить промпт с AI',
    modeMusic: 'Музыка', musicPlaceholder: 'Опишите музыку (напр. эпичная кино-сцена)…',
    generatingMusic: 'Создаю музыку… (1–3 мин)', musicFailed: 'Не удалось создать музыку. Попробуйте снова.',
    modeVideo: 'Видео', videoPlaceholder: 'Опишите 30-секундное видео (фото — для персонажа)…',
    generatingVideo: 'Создаю видео… (1–2 мин)', videoFailed: 'Не удалось создать видео.',
    modeLipsync: 'Синхрон', lipsyncPlaceholder: 'Прикрепите видео + аудио и нажмите отправить…',
    generatingLipsync: 'Синхронизирую губы…', lipsyncFailed: 'Не удалось синхронизировать.', lipsyncNeedFiles: 'Прикрепите и видео, и аудио.', lipsyncAuth: 'Войдите, чтобы использовать синхронизацию.', lipAudioLabel: 'Аудио',
    stop: 'Стоп', stopped: 'Остановлено', scrollDown: 'Вниз', regenerate: 'Заново', elapsedHint: 'прошло', greeting: 'Чем помочь?', attachHint: 'Добавить',
    instrumental: 'Инструментал', withVocals: 'Вокал',
    narration: 'Озвучка', narrationCue: ' (с профессиональной голосовой озвучкой)',
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
  // image gen (2K) realistically takes ~50–75s; pace the bar to that so it doesn't
  // sit at 95% looking stuck (the old 22s target felt "broken / not generating").
  image: 65, music: 150, video: 110, lipsync: 70,
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
    <div className="w-[min(72vw,380px)] space-y-2 py-0.5">
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-app-accent">
          <Loader2 size={13} className="shrink-0 animate-spin" />
          <span className="truncate">{headline}</span>
        </span>
        <span className="shrink-0 tabular-nums text-app-muted">{fmtClock(elapsed)}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-app-border/10">
        <div className="h-full rounded-full bg-app-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.max(6, pct)}%` }} />
      </div>
      <div className="flex items-center gap-1.5">
        {stages.map((s, i) => (
          <span key={i} title={s} className={`h-0.5 flex-1 rounded-full transition-colors ${i <= stageIdx ? 'bg-app-accent/70' : 'bg-app-border/10'}`} />
        ))}
      </div>
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
interface Msg { role: 'user' | 'assistant'; text: string; medias?: Media[]; imageUrl?: string; audioUrl?: string; videoUrl?: string }

// Up to this many files/images (or one video) can ride along with a single message.
const MAX_ATTACHMENTS = 5;

const isImage = (m: string) => m.startsWith('image/');
const isAudio = (m: string) => m.startsWith('audio/');
const isVideo = (m: string) => m.startsWith('video/');

export default function OmniStudio({ locale = 'ka' }: { locale?: Lang }) {
  const t = COPY[locale] ?? COPY.ka;
  const [messages, setMessages] = useState<Msg[]>([]);
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
  const [musicInstrumental, setMusicInstrumental] = useState(true);
  const [musicGenre, setMusicGenre] = useState<string>('cinematic');
  const [videoOrientation, setVideoOrientation] = useState<'landscape' | 'vertical'>('landscape');
  const [videoStyle, setVideoStyle] = useState<string>('Cinematic');
  // PHASE 48 §2 — opt-in spoken commentator/narration. When on, a localized cue
  // is appended to the brief so the film pipeline's wantsCommentary() detector
  // fires and a voice-over track is generated + mixed under the score.
  const [videoNarration, setVideoNarration] = useState(false);

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
    if (mode === 'image' && text) {
      setMessages((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: '' }]);
      setInput(''); setBusy(true);
      try {
        const res = await fetch('/api/nanobanana/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, quality: imgQuality, aspectRatio: imgAspect, style: imgStyle === 'Auto' ? undefined : imgStyle }),
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
                ? { role: 'assistant', text: '', imageUrl: j.url }
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
    if (mode === 'music' && text) {
      setMessages((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: '' }]);
      setInput(''); setBusy(true);
      try {
        const res = await fetch('/api/ai/music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, style: musicGenre, instrumental: musicInstrumental }),
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
                ? { role: 'assistant', text: '', audioUrl: j.url }
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
      const sentMedias = attachments;
      setMessages((prev) => [
        ...prev,
        { role: 'user', text, ...(sentMedias.length ? { medias: sentMedias } : {}) },
        { role: 'assistant', text: t.generatingVideo },
      ]);
      setInput(''); setAttachments([]); setBusy(true);
      try {
        const res = await driveFilmStudio({
          prompt: `${videoStyle ? `${text}. Visual style: ${videoStyle.toLowerCase()}, cinematic.` : text}${videoNarration ? t.narrationCue : ''}`,
          referenceImages: refs,
          orientation: videoOrientation,
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
            next[next.length - 1] =
              res.ok && res.masterUrl
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
      return;
    }

    // ── CHAT (multimodal Gemini) ───────────────────────────────────────────────
    const userMsg: Msg = { role: 'user', text, ...(attachments.length ? { medias: attachments } : {}) };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', text: '' }]);
    setInput(''); setAttachments([]); setBusy(true);

    // Build the Gemini payload: text-only → string content; with media → native
    // multimodal parts. Each image maps to a {type:'image'} part; audio / video /
    // pdf map to {type:'file'} parts the route forwards to Gemini as inline_data
    // (full native multi-file understanding — up to MAX_ATTACHMENTS per turn).
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
          const m = line.match(/^data:\s*(.+)$/s);
          if (!m) continue;
          try {
            const j = JSON.parse(m[1]!) as { text?: string };
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
  }, [input, attachments, busy, messages, mode, locale, imgAspect, imgQuality, imgStyle, musicGenre, musicInstrumental, videoOrientation, videoStyle, videoNarration, t.narrationCue, t.imageFailed, t.musicFailed, t.videoFailed, t.generatingVideo]);

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
  const canSend = mode === 'chat' ? (!!input.trim() || attachments.length > 0) : !!input.trim();

  return (
    <div
      className="relative mx-auto flex h-full w-full max-w-3xl flex-col px-4 pt-2 text-app-text"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
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
                  <a
                    href={m.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
                  >
                    <Download size={13} /> {t.imgDownload}
                  </a>
                </div>
              )}
              {m.audioUrl && (
                <div className="space-y-2 rounded-2xl bg-app-elevated/50 p-3">
                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-app-muted"><Music2 size={14} className="text-app-accent" /> {t.modeMusic}</div>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio src={m.audioUrl} controls className="w-full" />
                  <a
                    href={m.audioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="inline-flex items-center gap-1.5 rounded-full bg-app-accent px-3.5 py-1.5 text-[12px] font-semibold text-app-bg shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
                  >
                    <Download size={13} /> {t.imgDownload}
                  </a>
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
                const pending = busy && m.role === 'assistant' && i === messages.length - 1 && !m.imageUrl && !m.audioUrl && !m.videoUrl;
                // Generative modes get the live staged progress card (bar + clock +
                // narrated steps) — the real "loading process". Chat gets typing dots.
                if (pending && mode !== 'chat') {
                  // Pace the image bar to the chosen resolution (1K ≈ 40s · 2K ≈
                  // 170s · 4K ≈ 220s) so it doesn't sit at 95% looking stuck.
                  const imgTarget = imgQuality === 'standard' ? 42 : imgQuality === 'high' ? 170 : 215;
                  return <GenerationProgress kind={mode} elapsed={elapsed} status={m.text} locale={locale} targetSec={mode === 'image' ? imgTarget : undefined} />;
                }
                if (pending && mode === 'chat' && !m.text) return <TypingDots />;
                if (!m.text) return null;
                // Assistant replies render as rich markdown (bold · lists · code ·
                // links · tables); the user's own text stays verbatim.
                return m.role === 'assistant'
                  ? <Markdown>{m.text}</Markdown>
                  : <span className="whitespace-pre-wrap">{m.text}</span>;
              })()}
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
                </div>
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
                <Chip active={videoOrientation === 'landscape'} onClick={() => setVideoOrientation('landscape')}>16:9</Chip>
                <Chip active={videoOrientation === 'vertical'} onClick={() => setVideoOrientation('vertical')}>9:16</Chip>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-app-border/15" />
                <Chip active={videoNarration} onClick={() => setVideoNarration((v) => !v)}>🎙 {t.narration}</Chip>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-app-border/15" />
                {VIDEO_STYLES.map((s) => <Chip key={s} active={videoStyle === s} onClick={() => setVideoStyle(s)}>{s}</Chip>)}
              </>
            )}
          </div>
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
        <div className="flex items-end gap-1 rounded-[26px] bg-app-elevated px-2 py-1.5">
          {/* [+] add / attach */}
          <button type="button" onClick={() => fileRef.current?.click()} aria-label={t.attachHint} title={t.attachHint}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-text">
            <Plus size={20} />
          </button>

          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            rows={1}
            disabled={enhancing}
            placeholder={recording ? t.recording : mode === 'image' ? t.imgPlaceholder : mode === 'music' ? t.musicPlaceholder : mode === 'video' ? t.videoPlaceholder : t.placeholder}
            className="max-h-40 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-1.5 py-2 text-[16px] text-app-text placeholder:text-app-muted/70 outline-none focus:ring-0 disabled:opacity-60"
          />

          {/* Inline mode selector — the "Flash ⌄" analog. Tap to pick what to create. */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setModeMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={modeMenuOpen}
              className="flex h-9 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-app-muted transition-colors hover:bg-app-surface hover:text-app-text"
            >
              <ActiveModeIcon size={15} />
              <span>{t[activeModeKey]}</span>
              <ChevronDown size={13} className={`transition-transform ${modeMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {modeMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setModeMenuOpen(false)} />
                <div role="menu" className="absolute bottom-full right-0 z-20 mb-2 w-48 overflow-hidden rounded-2xl border border-app-border/10 bg-app-surface p-1 shadow-2xl">
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-app-accent text-app-bg transition-opacity hover:opacity-90">
                <Send size={16} />
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

      {/* Full-screen image lightbox — tap any chat image to open it edge-to-edge.
          Backdrop tap / the X button / Esc all close it; the picture itself swallows
          the click so it stays open while you inspect it. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 backdrop-blur-sm"
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
          <a
            href={lightbox}
            target="_blank"
            rel="noopener noreferrer"
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 mx-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-app-accent px-4 py-2 text-[13px] font-semibold text-app-bg backdrop-blur"
            style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <Download size={14} /> {t.imgDownload}
          </a>
        </div>
      )}
    </div>
  );
}
