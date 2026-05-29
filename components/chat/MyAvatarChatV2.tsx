'use client';

/**
 * components/chat/MyAvatarChatV2.tsx
 * ===================================
 * Minimalist Cyber-Black single-window chatbot — `/dashboard` entry surface.
 *
 * Built from scratch as an isolated, narrow-surface alternative to the
 * 2,602-line MyAvatarChat. Deliberately omits the heavy 3D avatar canvas,
 * onboarding flow, gallery/analytics/billing views, and SwarmStatusPanel
 * to keep the contract simple and the layout predictable.
 *
 * Contract:
 *   • Same prop shape as MyAvatarChat so app/[locale]/dashboard/page.tsx
 *     can swap between them without touching auth or onboarding logic.
 *   • Calls /api/chat/orchestrate (the same orchestrator that handles the
 *     composite music-video pipeline, founder audit hook, etc).
 *   • Reuses BalanceChip + WalletRefillModal + CameraModal + AuthModal so
 *     the wallet, camera, and auth flows stay consistent with V1.
 *
 * Layout matrix (per directive):
 *   ┌───────────────────────────────────────────────────────────┐
 *   │ 🕒 history    💳 wallet         🔐 auth                    │  ← thin top bar
 *   ├───────────────────────────────────────────────────────────┤
 *   │                                                           │
 *   │              messages feed (auto-scroll)                  │
 *   │                                                           │
 *   │                                                           │
 *   │                                                  ╭─╮      │
 *   │                                                  │A│ ⛶    │  ← floating avatar
 *   │                                                  ╰─╯      │
 *   ├───────────────────────────────────────────────────────────┤
 *   │ 📎 📷  [   text input          ]  🎤  ⤴                    │  ← composer
 *   └───────────────────────────────────────────────────────────┘
 *      ↑ safe-area-inset-bottom padding so iOS Safari can't clip
 */

import { isValidElement, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';
import {
  AlertCircle,
  Box,
  Camera,
  Check,
  Circle,
  Copy,
  Download,
  Film,
  Globe,
  ImagePlus,
  Loader2,
  LogOut,
  Maximize2,
  Menu,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  MoreHorizontal,
  Music,
  Paperclip,
  Pencil,
  PictureInPicture2,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  PenSquare,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { BalanceChip, WalletRefillModal } from '@/components/chat/WalletRefill';
import { CameraModal } from '@/components/service-chat/CameraModal';
import AuthModal from '@/components/chat/AuthModal';
import type { ServiceChatAttachment } from '@/components/service-chat/types';
import { resolveAvatarVideo } from '@/lib/avatar/video-config';
import { useKeyboardResilience } from '@/hooks/useKeyboardResilience';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  deriveTitle,
  deleteConversation,
  getConversation,
  groupConversationsByTime,
  loadConversations,
  renameConversation,
  upsertConversation,
  type StoredConversation,
  type StoredMessage,
  type TimeBucket,
} from '@/lib/chat/conversationStore';
import {
  DEFAULT_PREFERENCES,
  MAX_CUSTOM_INSTRUCTIONS,
  loadPreferences,
  savePreferences,
  type ChatPreferences,
} from '@/lib/chat/preferences';

// Monochrome system accent (near-white). Keeps the whole workspace flat and
// premium (Apple/Gemini dark aesthetic) — no neon, no chroma. Drives the send
// button, skeleton spinners, speaker glyphs, and audio scrubber.
const ACCENT = '#e5e5e5';

// Bundled fallback so the floating widget always renders the real executive
// avatar even when NEXT_PUBLIC_AVATAR_IDLE_VIDEO_URL isn't configured in the
// deploy environment. A configured env var still wins (resolveAvatarVideo).
const FALLBACK_AVATAR_VIDEO = '/media/avatar/greeting-v4.mp4';
const FALLBACK_AVATAR_POSTER = '/media/avatar/greeting-v4.jpg';

const _avatar = resolveAvatarVideo();
const AVATAR_VIDEO = _avatar.hasVideo ? _avatar.idleUrl : FALLBACK_AVATAR_VIDEO;
const AVATAR_POSTER = _avatar.hasVideo ? _avatar.poster : FALLBACK_AVATAR_POSTER;
const HAS_AVATAR_VIDEO = true;

interface Props {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
  /** Logged-in email, surfaced in Settings → Account. Optional (guest = none). */
  userEmail?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error';
  text: string;
  timestamp: number;
  assetUrl?: string | null;
  assetType?: 'image' | 'video' | 'audio' | null;
  /** Server-side predictionId — used to drive Regenerate. */
  sourcePrompt?: string;
  agentId?: string;
  model?: string;
  /** Service mode that produced this asset (drives preview aspect, e.g. avatar→9:16). */
  mode?: ServiceMode;
  /** Set on restore when a large/ephemeral asset was dropped from local storage. */
  assetEvicted?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  inputText: string;
  isLoading: boolean;
  attachments: ServiceChatAttachment[];
  isRecording: boolean;
}

type Action =
  | { type: 'SET_INPUT'; text: string }
  | { type: 'SET_LOADING'; value: boolean }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'LOAD_MESSAGES'; messages: ChatMessage[] }
  | { type: 'ADD_ATTACHMENT'; attachment: ServiceChatAttachment }
  | { type: 'REMOVE_ATTACHMENT'; id: string }
  | { type: 'CLEAR_ATTACHMENTS' }
  | { type: 'SET_RECORDING'; value: boolean };

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'SET_INPUT':         return { ...state, inputText: action.text };
    case 'SET_LOADING':       return { ...state, isLoading: action.value };
    case 'ADD_MESSAGE':       return { ...state, messages: [...state.messages, action.message] };
    case 'CLEAR_MESSAGES':    return { ...state, messages: [] };
    // Wholesale replace — used to restore a stored conversation into the viewport.
    case 'LOAD_MESSAGES':     return { ...state, messages: action.messages, inputText: '', attachments: [] };
    case 'ADD_ATTACHMENT':    return { ...state, attachments: [...state.attachments, action.attachment] };
    case 'REMOVE_ATTACHMENT': return { ...state, attachments: state.attachments.filter((a) => a.id !== action.id) };
    case 'CLEAR_ATTACHMENTS': return { ...state, attachments: [] };
    case 'SET_RECORDING':     return { ...state, isRecording: action.value };
    default: return state;
  }
}

const initialState: ChatState = {
  messages: [],
  inputText: '',
  isLoading: false,
  attachments: [],
  isRecording: false,
};

const COPY = {
  en: { placeholder: 'Type a message…', signIn: 'Sign in', signOut: 'Sign out', clearHistory: 'Clear history', history: 'History', menu: 'Menu', settings: 'Settings', language: 'Language', sound: 'Avatar sound', genericError: 'Something went wrong. Try again.', fileTooLarge: 'File is too large (max {max}MB).', fileBadType: 'Unsupported file type. Use an image, video, or audio file.', voiceUnsupported: 'Voice input isn’t supported in this browser.', listening: 'Listening…' },
  ka: { placeholder: 'დაწერე შეტყობინება…', signIn: 'შესვლა', signOut: 'გასვლა', clearHistory: 'ისტორიის გასუფთავება', history: 'ისტორია', menu: 'მენიუ', settings: 'პარამეტრები', language: 'ენა', sound: 'ავატარის ხმა', genericError: 'რაღაც ხარვეზი. სცადე ხელახლა.', fileTooLarge: 'ფაილი ძალიან დიდია (მაქს. {max}MB).', fileBadType: 'არასწორი ფაილის ტიპი. გამოიყენე სურათი, ვიდეო ან აუდიო.', voiceUnsupported: 'ხმოვანი შეყვანა ამ ბრაუზერში არ მუშაობს.', listening: 'გისმენ…' },
  ru: { placeholder: 'Введите сообщение…', signIn: 'Войти', signOut: 'Выйти', clearHistory: 'Очистить историю', history: 'История', menu: 'Меню', settings: 'Настройки', language: 'Язык', sound: 'Звук аватара', genericError: 'Что-то пошло не так. Попробуйте снова.', fileTooLarge: 'Файл слишком большой (макс. {max}МБ).', fileBadType: 'Неподдерживаемый тип файла. Используйте изображение, видео или аудио.', voiceUnsupported: 'Голосовой ввод не поддерживается в этом браузере.', listening: 'Слушаю…' },
} as const;

// Ecosystem-tier strings (history sidebar, settings modal, attachments). Kept
// in a separate map so the large base COPY block above stays untouched.
const XCOPY = {
  en: {
    newChat: 'New chat', rename: 'Rename', delete: 'Delete', open: 'Open',
    deleteTitle: 'Delete chat?', deleteBody: 'This conversation will be permanently removed from this device. This can’t be undone.',
    cancel: 'Cancel', save: 'Save', done: 'Done', close: 'Close', noChats: 'No conversations yet.',
    account: 'Account', preferences: 'Preferences', signedInAs: 'Signed in as', guest: 'Guest (not signed in)',
    submitOnEnter: 'Send with Enter', submitOnEnterHint: 'Off: Enter adds a new line, ⌘/Ctrl+Enter sends',
    autoplay: 'Autoplay generated media', customInstructions: 'Custom instructions',
    ciPlaceholder: 'e.g. Always reply in Georgian, be concise, prefer cinematic prompts…',
    ciHint: 'Added to every conversation to personalise the assistant.',
    dropToAttach: 'Drop to attach', mediaExpired: 'Media not stored — regenerate to view',
  },
  ka: {
    newChat: 'ახალი ჩატი', rename: 'გადარქმევა', delete: 'წაშლა', open: 'გახსნა',
    deleteTitle: 'წავშალო ჩატი?', deleteBody: 'ეს საუბარი სამუდამოდ წაიშლება ამ მოწყობილობიდან. დაბრუნება შეუძლებელია.',
    cancel: 'გაუქმება', save: 'შენახვა', done: 'მზადაა', close: 'დახურვა', noChats: 'ჯერ საუბრები არ არის.',
    account: 'ანგარიში', preferences: 'პარამეტრები', signedInAs: 'შესული ხართ', guest: 'სტუმარი (არ ხართ შესული)',
    submitOnEnter: 'გაგზავნა Enter-ით', submitOnEnterHint: 'გამორთულზე: Enter ახალ ხაზს ამატებს, ⌘/Ctrl+Enter აგზავნის',
    autoplay: 'მედიის ავტომატური დაკვრა', customInstructions: 'პერსონალური ინსტრუქციები',
    ciPlaceholder: 'მაგ.: ყოველთვის უპასუხე ქართულად, იყავი ლაკონური…',
    ciHint: 'ემატება ყველა საუბარს ასისტენტის პერსონალიზაციისთვის.',
    dropToAttach: 'ჩააგდე მისამაგრებლად', mediaExpired: 'მედია არ შენახულა — ხელახლა დააგენერირე',
  },
  ru: {
    newChat: 'Новый чат', rename: 'Переименовать', delete: 'Удалить', open: 'Открыть',
    deleteTitle: 'Удалить чат?', deleteBody: 'Этот разговор будет навсегда удалён с этого устройства. Отменить нельзя.',
    cancel: 'Отмена', save: 'Сохранить', done: 'Готово', close: 'Закрыть', noChats: 'Пока нет разговоров.',
    account: 'Аккаунт', preferences: 'Настройки', signedInAs: 'Вы вошли как', guest: 'Гость (не выполнен вход)',
    submitOnEnter: 'Отправка по Enter', submitOnEnterHint: 'Выкл.: Enter — новая строка, ⌘/Ctrl+Enter — отправка',
    autoplay: 'Автовоспроизведение медиа', customInstructions: 'Пользовательские инструкции',
    ciPlaceholder: 'Напр.: всегда отвечай по-русски, будь краток…',
    ciHint: 'Добавляется к каждому разговору для персонализации ассистента.',
    dropToAttach: 'Отпустите, чтобы прикрепить', mediaExpired: 'Медиа не сохранено — сгенерируйте заново',
  },
} as const;

// Time-bucket headers for the grouped history sidebar (Tier-1 LLM layout).
const GROUP_LABELS: Record<TimeBucket, { en: string; ka: string; ru: string }> = {
  today: { en: 'Today', ka: 'დღეს', ru: 'Сегодня' },
  previous7: { en: 'Previous 7 Days', ka: 'წინა 7 დღე', ru: 'Предыдущие 7 дней' },
  previous30: { en: 'Previous 30 Days', ka: 'წინა 30 დღე', ru: 'Предыдущие 30 дней' },
  older: { en: 'Older', ka: 'უფრო ძველი', ru: 'Ранее' },
};

/** Fresh stable session id (also the conversation key). */
function newSessionId(): string {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `session_web_${rand}`;
}

/** Runtime → persisted message (assets are sanitized inside the store). */
function toStored(m: ChatMessage): StoredMessage {
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    timestamp: m.timestamp,
    assetUrl: m.assetUrl ?? null,
    assetType: m.assetType ?? null,
    sourcePrompt: m.sourcePrompt,
    agentId: m.agentId,
    model: m.model,
    mode: m.mode,
    assetEvicted: m.assetEvicted,
  };
}

/** Persisted → runtime message (restoration into the viewport). */
function fromStored(m: StoredMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    timestamp: m.timestamp,
    assetUrl: m.assetUrl ?? null,
    assetType: m.assetType ?? null,
    sourcePrompt: m.sourcePrompt,
    agentId: m.agentId,
    model: m.model,
    mode: m.mode as ServiceMode | undefined,
    assetEvicted: m.assetEvicted,
  };
}

// Pre-flight upload bounds. Images are inlined as base64 data URLs (≈+33%), so
// the image cap is conservative to stay under serverless request-body limits.
const MAX_IMAGE_MB = 4;
const MAX_MEDIA_MB = 25;

/**
 * Unified control-dock modes. The selected mode is passed as `serviceContext`
 * to /api/chat/orchestrate, which biases intent detection + output type
 * (text / image / video / audio). `global` is the default free-form chat.
 */
const MODES = [
  { id: 'global',   Icon: MessageSquare, accent: '#22d3ee', label: { en: 'Chat',     ka: 'ჩათი',            ru: 'Чат' } },
  { id: 'image',    Icon: ImagePlus,     accent: '#34d399', label: { en: 'Image',     ka: 'სურათი',          ru: 'Изображение' } },
  { id: 'video',    Icon: Film,          accent: '#38bdf8', label: { en: '30s Film',  ka: '30 წმ ფილმი',     ru: '30-сек фильм' } },
  { id: 'music',    Icon: Music,         accent: '#f472b6', label: { en: 'Music',     ka: 'მუსიკა',          ru: 'Музыка' } },
  { id: 'avatar',   Icon: User,          accent: '#818cf8', label: { en: 'Avatar',    ka: 'AI ავატარი',      ru: 'AI Аватар' } },
  { id: 'interior', Icon: Box,           accent: '#10b981', label: { en: 'Room 3D',   ka: 'ოთახის 3D',       ru: 'Комната 3D' } },
  { id: 'voice',    Icon: Volume2,       accent: '#f59e0b', label: { en: 'Voice',     ka: 'ხმა',             ru: 'Голос' } },
] as const;
type ServiceMode = typeof MODES[number]['id'];

/* ─── Live orchestration telemetry (driven by real backend status) ───────────
 * /api/chat/orchestrate returns a single JSON response; async media generation
 * carries a `predictionId` + `predictionStatus` (Replicate-style) that the
 * client re-POSTs to poll. The composite music-video pipeline additionally
 * reports genuine per-leg states under metadata.legs. The telemetry UI below
 * is bound strictly to these real fields — never to timers. */

type LegStatus = 'pending' | 'succeeded' | 'failed' | 'skipped';

interface OrchestrateResponse {
  success?: boolean;
  message?: string;
  responseType?: 'text' | 'image' | 'video' | 'audio' | 'analysis' | 'action_suggestions';
  assetUrl?: string | null;
  predictionId?: string;
  predictionStatus?: string;
  metadata?: {
    model?: string;
    agentId?: string;
    legs?: { music?: { status: LegStatus }; video?: { status: LegStatus } };
    [k: string]: unknown;
  };
  error?: string;
}

type StageState = 'pending' | 'active' | 'done' | 'failed' | 'skipped';
interface PipelineStage {
  key: 'analysis' | 'audio' | 'render';
  label: { en: string; ka: string; ru: string };
  state: StageState;
}
interface PipelineState { active: boolean; stages: PipelineStage[] }

const STAGE_LABELS: Record<PipelineStage['key'], PipelineStage['label']> = {
  analysis: { en: 'Script & layout analysis', ka: 'სცენარის ანალიზი', ru: 'Анализ сценария' },
  audio:    { en: 'Audio & waveform synthesis', ka: 'აუდიოს სინთეზი', ru: 'Синтез аудио' },
  render:   { en: 'GPU cinematic render', ka: 'GPU ვიდეო რენდერი', ru: 'GPU рендер видео' },
};

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'error', 'canceled']);
function isTerminalStatus(status?: string): boolean {
  return !status || TERMINAL_STATUSES.has(status);
}

function legToStage(s: LegStatus | undefined): StageState {
  if (s === 'succeeded') return 'done';
  if (s === 'failed') return 'failed';
  if (s === 'skipped') return 'skipped';
  if (s === 'pending') return 'active';
  return 'pending';
}

/** Build the telemetry stage list from a real response (or in-flight state). */
function derivePipeline(resp: OrchestrateResponse | null): PipelineState {
  // No response yet → the request itself is in flight (analysis active).
  if (!resp) {
    return {
      active: true,
      stages: [
        { key: 'analysis', label: STAGE_LABELS.analysis, state: 'active' },
        { key: 'audio', label: STAGE_LABELS.audio, state: 'pending' },
        { key: 'render', label: STAGE_LABELS.render, state: 'pending' },
      ],
    };
  }

  const legs = resp.metadata?.legs;

  // Pure text / analysis reply — no media render pipeline to surface.
  const isMediaJob = !!resp.predictionId || !!legs || ['image', 'video', 'audio'].includes(resp.responseType || '');
  if (!isMediaJob) return { active: false, stages: [] };

  const terminal = isTerminalStatus(resp.predictionStatus);
  const failed = resp.predictionStatus === 'failed' || resp.predictionStatus === 'error' || resp.predictionStatus === 'canceled';

  // Analysis completes the moment the backend accepts the request.
  const analysis: StageState = 'done';

  let audio: StageState;
  let render: StageState;

  if (legs) {
    // Composite music-video pipeline: bind to genuine per-leg status.
    audio = legToStage(legs.music?.status);
    render = legToStage(legs.video?.status);
  } else {
    // Single async prediction: no separate audio leg.
    audio = 'skipped';
    render = failed ? 'failed' : terminal ? 'done' : 'active';
  }

  return {
    active: !terminal || (!!legs && (audio === 'active' || render === 'active')),
    stages: [
      { key: 'analysis', label: STAGE_LABELS.analysis, state: analysis },
      { key: 'audio', label: STAGE_LABELS.audio, state: audio },
      { key: 'render', label: STAGE_LABELS.render, state: render },
    ],
  };
}

/** Promise sleep that rejects if the provided signal aborts (cancellation). */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { resultIndex?: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void;
  onend: () => void;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

export default function MyAvatarChatV2({ locale, userName, isAuthenticated, userEmail }: Props) {
  const lang = (locale === 'ka' || locale === 'ru' ? locale : 'en') as 'en' | 'ka' | 'ru';
  const copy = COPY[lang];
  const xc = XCOPY[lang];

  const [state, dispatch] = useReducer(reducer, initialState);
  const { messages, inputText, isLoading, attachments, isRecording } = state;
  const { keyboardOffset } = useKeyboardResilience();

  // Local-only UI state
  const [walletOpen, setWalletOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [avatarExpanded, setAvatarExpanded] = useState(false);
  const [balanceGel, setBalanceGel] = useState<number | null>(null);
  const [mode, setMode] = useState<ServiceMode>('global');
  // Stable per-conversation id sent on EVERY request (initial + polls). The
  // backend bakes this into the predictionId/taskRef; if polls arrive with a
  // different (or missing) session it throws "Session mismatch". It doubles as
  // the persisted conversation key, so starting a new chat mints a fresh one.
  const [conversationId, setConversationId] = useState<string>(() => newSessionId());
  // Persisted conversation log (localStorage) + grouping / restore UI state.
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [switching, setSwitching] = useState(false);      // brief skeleton on restore
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // Persisted user preferences (Submit-on-Enter, autoplay, custom instructions).
  const [prefs, setPrefs] = useState<ChatPreferences>(DEFAULT_PREFERENCES);
  const [dragActive, setDragActive] = useState(false);    // composer drag-and-drop
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarSoundOn, setAvatarSoundOn] = useState(false);
  // Live multi-stage render telemetry, driven by REAL backend poll status
  // (derivePipeline). Surfaced under the shaped <MediaSkeleton/> as the chat's
  // micro-progress indicator for media jobs.
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Non-blocking transient alert (auto-dismiss) for pre-flight validation, etc.
  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTranscriptRef = useRef('');           // input text snapshot at mic-start
  const [speechSupported, setSpeechSupported] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);          // drag-constraints boundary
  const cornerVideoRef = useRef<HTMLVideoElement>(null);  // ambient corner loop
  const fullVideoRef = useRef<HTMLVideoElement>(null);    // expanded 9:16 preview
  const avatarDraggedRef = useRef(false);                 // distinguishes drag from tap

  // ── Stick-to-bottom auto-scroll (Tier-1 LLM behavior) ──────────────
  // The viewport pins to the newest token / media block. We respect the user's
  // intent: if they scroll up to re-read, we stop yanking them down; the moment
  // they return near the bottom (or send a new message) pinning resumes.
  const mainRef = useRef<HTMLElement>(null);
  const stickRef = useRef(true);
  const onMainScroll = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);
  const pinBottom = useCallback((smooth: boolean) => {
    if (!stickRef.current) return;
    endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  }, []);

  useEffect(() => { pinBottom(true); }, [messages.length, isLoading, pipeline, pinBottom]);

  // ── Restore focus to the composer the instant generation finishes ──
  // (only on the loading→idle transition, never on initial mount, so we
  // don't force the mobile keyboard open before the user types).
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading) inputRef.current?.focus();
    wasLoadingRef.current = isLoading;
  }, [isLoading]);

  // ── Auto-resize textarea ───────────────────────────────────────────
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [inputText]);

  // ── Hydrate persisted conversations + preferences (client only) ─────
  useEffect(() => {
    setConversations(loadConversations());
    setPrefs(loadPreferences());
  }, []);

  // ── Persist the live conversation on every change ───────────────────
  // Keyed by [messages, conversationId] so both appending a turn and
  // switching chats flush to localStorage. A pre-existing manual title is
  // preserved; otherwise the title is auto-derived from the first prompt.
  // Large/ephemeral assets are evicted inside the store (data:/blob: URLs).
  useEffect(() => {
    const first = messages[0];
    const last = messages[messages.length - 1];
    if (!first || !last) return;
    const firstUser = messages.find((m) => m.role === 'user');
    const existing = getConversation(conversationId);
    const convo: StoredConversation = {
      id: conversationId,
      title: existing?.title || deriveTitle(firstUser?.text || ''),
      createdAt: existing?.createdAt ?? first.timestamp,
      updatedAt: last.timestamp,
      messages: messages.map(toStored),
    };
    setConversations(upsertConversation(convo));
  }, [messages, conversationId]);

  // ── Speech recognition init (Web Speech API) ───────────────────────
  // Continuous dictation: every recognized chunk (interim + final) is folded
  // into the live transcript and appended to whatever the user had already
  // typed, so speaking flows straight into the composer in real time.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      SpeechRecognition?: new () => SpeechRecognitionLike;
    });
    const Ctor = SR.SpeechRecognition || SR.webkitSpeechRecognition;
    if (!Ctor) { setSpeechSupported(false); return; }
    setSpeechSupported(true);

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i]?.[0]?.transcript ?? '';
      }
      transcript = transcript.trim();
      const base = baseTranscriptRef.current;
      const merged = base ? `${base} ${transcript}`.trim() : transcript;
      dispatch({ type: 'SET_INPUT', text: merged });
    };
    rec.onerror = () => dispatch({ type: 'SET_RECORDING', value: false });
    rec.onend = () => dispatch({ type: 'SET_RECORDING', value: false });
    recognitionRef.current = rec;

    return () => { try { rec.stop(); } catch { /* noop */ } };
  }, []);

  // ── Fetch wallet balance ──────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    fetch('/api/billing/credits', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((j: { balance?: number } | null) => {
        if (alive && j && typeof j.balance === 'number') setBalanceGel(j.balance);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAuthenticated]);

  // Sound preference mirrored to a ref so the expand effect can read it
  // without re-running (and restarting playback) on every toggle.
  const soundPrefRef = useRef(avatarSoundOn);
  useEffect(() => { soundPrefRef.current = avatarSoundOn; }, [avatarSoundOn]);

  // ── Avatar: ambient muted loop on the corner widget ───────────────
  useEffect(() => {
    if (!HAS_AVATAR_VIDEO || avatarExpanded) return;
    const v = cornerVideoRef.current;
    if (!v) return;
    v.muted = true; v.loop = true;
    void Promise.resolve(v.play()).catch(() => { /* autoplay blocked — poster stays */ });
  }, [avatarExpanded]);

  // ── Avatar: on expand, play full 9:16 (sound follows the preference;
  //    the click is a user gesture so unmuted playback is permitted) ──
  useEffect(() => {
    if (!HAS_AVATAR_VIDEO || !avatarExpanded) return;
    const v = fullVideoRef.current;
    if (!v) return;
    v.loop = true;
    try { v.currentTime = 0; } catch { /* noop */ }
    const wantSound = soundPrefRef.current;
    v.muted = !wantSound;
    void Promise.resolve(v.play()).catch(() => {
      // Unmuted autoplay blocked → fall back to muted so it still animates.
      v.muted = true;
      setAvatarSoundOn(false);
      void Promise.resolve(v.play()).catch(() => {});
    });
  }, [avatarExpanded]);

  const toggleAvatarSound = useCallback(() => {
    setAvatarSoundOn((prev) => {
      const next = !prev;
      const v = fullVideoRef.current;
      if (v) {
        v.muted = !next;
        if (next) void Promise.resolve(v.play()).catch(() => {});
      }
      return next;
    });
  }, []);

  // ── Send message (real async lifecycle: POST → poll predictionId) ──
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? inputText).trim();
    if (!text || isLoading) return;

    // Image attachment → orchestrator `imageUrl` (it accepts data: URLs directly,
    // see providerRouter.loadImageAsDataUrl). This is what drives the image-edit /
    // interior (ოთახის 3D) / photo→avatar pipelines.
    const imageAttachment = attachments.find((a) => a.type === 'image' && (a.dataUrl || a.preview));
    const imageUrl = imageAttachment?.dataUrl || imageAttachment?.preview;

    dispatch({ type: 'ADD_MESSAGE', message: {
      id: `u_${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now(),
      assetUrl: imageUrl ?? null,
      assetType: imageUrl ? 'image' : null,
    } });
    dispatch({ type: 'SET_INPUT', text: '' });
    dispatch({ type: 'CLEAR_ATTACHMENTS' });
    dispatch({ type: 'SET_LOADING', value: true });
    setPipeline(derivePipeline(null));
    stickRef.current = true; // sending always re-pins the viewport to the bottom

    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    // POST with a 45s per-attempt timeout + bounded retry on network/5xx —
    // the client-side fail-safe for dropouts/timeouts (covers the interior /
    // ოთახის 3D pipeline and every other mode). User-cancel is not retried.
    const postOrchestrate = async (payload: Record<string, unknown>): Promise<OrchestrateResponse> => {
      const RETRIES = 2;
      let lastErr: unknown;
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        const timeoutCtl = new AbortController();
        const onUserAbort = () => timeoutCtl.abort();
        signal.addEventListener('abort', onUserAbort, { once: true });
        const timer = setTimeout(() => timeoutCtl.abort(), 45000);
        try {
          const res = await fetch('/api/chat/orchestrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            signal: timeoutCtl.signal,
            body: JSON.stringify(payload),
          });
          clearTimeout(timer);
          signal.removeEventListener('abort', onUserAbort);
          const json = (await res.json()) as OrchestrateResponse;
          if (!res.ok && res.status >= 500 && attempt < RETRIES) {
            lastErr = new Error(json.error || json.message || 'server error');
            await sleep(1200 * (attempt + 1), signal);
            continue;
          }
          if (!res.ok) throw new Error(json.error || json.message || copy.genericError);
          return json;
        } catch (e) {
          clearTimeout(timer);
          signal.removeEventListener('abort', onUserAbort);
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          lastErr = e;
          if (attempt < RETRIES) { await sleep(1200 * (attempt + 1), signal); continue; }
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error(copy.genericError);
    };

    try {
      // ── Voice (ხმა): pure TTS → ElevenLabs, independent of the text track ──
      if (mode === 'voice') {
        setPipeline(null); // not a multi-stage render; show the simple spinner
        const ttsRes = await fetch('/api/elevenlabs/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal,
          body: JSON.stringify({ text, locale: lang }),
        });
        if (!ttsRes.ok) {
          const errText = await ttsRes.text().catch(() => '');
          throw new Error(errText || `Voice synthesis failed (${ttsRes.status})`);
        }
        const audioBlob = await ttsRes.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        dispatch({ type: 'ADD_MESSAGE', message: {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: '',
          timestamp: Date.now(),
          assetUrl: audioUrl,
          assetType: 'audio',
          sourcePrompt: text,
          mode: 'voice',
          model: ttsRes.headers.get('X-Voice-Provider') || 'elevenlabs',
        }});
        return;
      }

      const history = messages
        .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role === 'user' || m.role === 'assistant')
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.text }));

      let resp = await postOrchestrate({
        message: text,
        sessionId: conversationId,
        serviceContext: mode,
        locale: lang,
        history,
        ...(imageUrl ? { imageUrl } : {}),
        ...(prefs.customInstructions.trim() ? { customInstructions: prefs.customInstructions } : {}),
      });
      if (resp.success === false && !resp.predictionId) {
        throw new Error(resp.error || resp.message || copy.genericError);
      }
      setPipeline(derivePipeline(resp));

      // Poll the real prediction lifecycle until terminal (the route's poll
      // path skips budget; schema still requires `message`, so we resend it).
      const POLL_INTERVAL = 2500;
      const MAX_POLLS = 90;
      let polls = 0;
      while (resp.predictionId && !isTerminalStatus(resp.predictionStatus) && polls < MAX_POLLS) {
        await sleep(POLL_INTERVAL, signal);
        polls++;
        resp = await postOrchestrate({ message: text, sessionId: conversationId, predictionId: resp.predictionId, serviceContext: mode, locale: lang });
        setPipeline(derivePipeline(resp));
      }

      const assetType: ChatMessage['assetType'] =
        resp.responseType === 'image' ? 'image'
        : resp.responseType === 'video' ? 'video'
        : resp.responseType === 'audio' ? 'audio'
        : null;

      dispatch({ type: 'ADD_MESSAGE', message: {
        id: `a_${Date.now()}`,
        role: resp.success === false ? 'error' : 'assistant',
        text: resp.message || (resp.success === false ? copy.genericError : ''),
        timestamp: Date.now(),
        assetUrl: resp.assetUrl ?? null,
        assetType,
        sourcePrompt: text,
        mode,
        agentId: resp.metadata?.agentId,
        model: resp.metadata?.model,
      }});
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // user cancelled; keep prior messages
      } else {
        dispatch({ type: 'ADD_MESSAGE', message: {
          id: `e_${Date.now()}`,
          role: 'error',
          text: err instanceof Error ? err.message : copy.genericError,
          timestamp: Date.now(),
        }});
      }
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
      setPipeline(null);
      abortRef.current = null;
    }
  }, [inputText, isLoading, messages, lang, mode, attachments, conversationId, prefs.customInstructions, copy.genericError]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Edit a prior user prompt → pull it back into the composer, focus, and place
  // the caret at the end so the user can refine and resubmit (branching the
  // conversation with a fresh turn rather than mutating history in place).
  const editPrompt = useCallback((text: string) => {
    dispatch({ type: 'SET_INPUT', text });
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      try { el.setSelectionRange(end, end); } catch { /* noop */ }
      el.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  // ── Conversation lifecycle (sidebar: new / restore / rename / delete) ──
  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    setConversationId(newSessionId());
    dispatch({ type: 'LOAD_MESSAGES', messages: [] });
    setHistoryOpen(false);
  }, []);

  // Seamless restore: clicking a past chat replaces the viewport with its
  // stored messages WITHOUT re-triggering any generation. A short skeleton
  // beat makes the load read as deliberate (Tier-1 LLM feel).
  const openConversation = useCallback((id: string) => {
    const convo = getConversation(id);
    if (!convo) return;
    abortRef.current?.abort();
    setSwitching(true);
    setConversationId(id);
    dispatch({ type: 'LOAD_MESSAGES', messages: convo.messages.map(fromStored) });
    setHistoryOpen(false);
    window.setTimeout(() => setSwitching(false), 280);
  }, []);

  const renameConvo = useCallback((id: string, title: string) => {
    setConversations(renameConversation(id, title));
    setRenamingId(null);
  }, []);

  const removeConvo = useCallback((id: string) => {
    setConversations(deleteConversation(id));
    setDeleteTarget(null);
    if (id === conversationId) startNewChat();
  }, [conversationId, startNewChat]);

  const updatePref = useCallback((partial: Partial<ChatPreferences>) => {
    setPrefs((prev) => savePreferences({ ...prev, ...partial }));
  }, []);

  const toggleRecording = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || !speechSupported) {
      showNotice(copy.voiceUnsupported);
      return;
    }
    if (isRecording) {
      try { rec.stop(); } catch { /* noop */ }
      dispatch({ type: 'SET_RECORDING', value: false });
    } else {
      // Snapshot the current composer text so dictation appends, not overwrites.
      baseTranscriptRef.current = inputText.trim();
      rec.lang = lang === 'ka' ? 'ka-GE' : lang === 'ru' ? 'ru-RU' : 'en-US';
      try { rec.start(); dispatch({ type: 'SET_RECORDING', value: true }); }
      catch { /* already started — ignore */ }
    }
  }, [isRecording, lang, inputText, speechSupported, showNotice, copy.voiceUnsupported]);

  const onPickFile = useCallback(() => fileInputRef.current?.click(), []);

  // Shared ingestion for both the file picker and drag-and-drop. Accepts
  // images / video / audio plus PDF documents (PDF/JPG/PNG are the directive's
  // first-class types); anything else is rejected with a non-blocking notice.
  const ingestFile = useCallback((file: File) => {
    const kind: ServiceChatAttachment['type'] | null =
      file.type.startsWith('image/') ? 'image'
      : file.type.startsWith('video/') ? 'video'
      : file.type.startsWith('audio/') ? 'audio'
      : (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) ? 'file'
      : null;
    if (!kind) {
      showNotice(copy.fileBadType);
      return;
    }
    const maxMb = kind === 'image' ? MAX_IMAGE_MB : MAX_MEDIA_MB;
    if (file.size > maxMb * 1024 * 1024) {
      showNotice(copy.fileTooLarge.replace('{max}', String(maxMb)));
      return;
    }

    const att: ServiceChatAttachment = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      type: kind,
      mimeType: file.type || (kind === 'file' ? 'application/pdf' : ''),
      size: file.size,
    };
    if (kind === 'image') {
      const reader = new FileReader();
      reader.onload = () => dispatch({ type: 'ADD_ATTACHMENT', attachment: { ...att, preview: reader.result as string, dataUrl: reader.result as string } });
      reader.onerror = () => showNotice(copy.genericError);
      reader.readAsDataURL(file);
    } else {
      dispatch({ type: 'ADD_ATTACHMENT', attachment: att });
    }
  }, [showNotice, copy.fileBadType, copy.fileTooLarge, copy.genericError]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset early so re-picking the same file re-fires
    if (file) ingestFile(file);
  }, [ingestFile]);

  // ── Drag-and-drop attachment (whole-surface drop target) ────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      setDragActive(true);
    }
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear when the cursor actually leaves the surface (not on child cross).
    if (e.currentTarget === e.target) setDragActive(false);
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    Array.from(e.dataTransfer?.files || []).forEach(ingestFile);
  }, [ingestFile]);

  const handleSignOut = useCallback(async () => {
    try {
      await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    window.location.reload();
  }, []);

  const changeLanguage = useCallback((next: 'ka' | 'en' | 'ru') => {
    if (next === lang) { setSettingsOpen(false); return; }
    const { pathname, search } = window.location;
    const rest = pathname.replace(/^\/(ka|en|ru)(?=\/|$)/, '');
    window.location.href = `/${next}${rest || '/dashboard'}${search}`;
  }, [lang]);

  const playAssetAudio = useCallback((url: string) => {
    const a = new Audio(url);
    void a.play().catch(() => {});
  }, []);

  const sendFeedback = useCallback(async (messageId: string, rating: 'up' | 'down') => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messageId, rating, surface: 'dashboard-v2' }),
      });
    } catch { /* best-effort */ }
  }, []);

  // Time-grouped conversation list for the sidebar (Today / Previous 7 / 30 / Older).
  const groupedConversations = useMemo(
    () => groupConversationsByTime(conversations),
    [conversations],
  );

  /* ─── Render ─────────────────────────────────────────────────────── */

  return (
    <div
      ref={stageRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="fixed inset-x-0 top-0 z-[5] flex flex-col bg-[#030303] text-zinc-100 antialiased overflow-hidden"
      style={{ height: keyboardOffset > 0 ? `calc(100dvh - ${keyboardOffset}px)` : '100dvh' }}
    >
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05] bg-[#030303]/95 backdrop-blur-md"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}
      >
        {/* Hamburger → conversation drawer · New chat → clears context */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setHistoryOpen(true)}
            aria-label={copy.menu}
            className="h-9 w-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-zinc-50 hover:bg-zinc-900 transition active:scale-95"
          >
            <Menu size={18} />
          </button>
          <button
            onClick={startNewChat}
            aria-label={xc.newChat}
            title={xc.newChat}
            className="h-9 w-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-zinc-50 hover:bg-zinc-900 transition active:scale-95"
          >
            <PenSquare size={18} />
          </button>
        </div>

        <BalanceChip balanceGel={balanceGel} onClick={() => setWalletOpen(true)} />

        <div className="flex items-center gap-1">
          {/* Settings gear → full Settings & Profile modal */}
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label={copy.settings}
            aria-haspopup="dialog"
            className="h-9 w-9 rounded-full flex items-center justify-center transition active:scale-95 text-zinc-300 hover:text-zinc-50 hover:bg-zinc-900"
          >
            <Settings size={18} />
          </button>

          {isAuthenticated ? (
            <button
              onClick={handleSignOut}
              aria-label={copy.signOut}
              className="h-9 px-3 rounded-full flex items-center gap-2 text-[12px] font-medium text-zinc-300 hover:text-zinc-50 hover:bg-zinc-900 transition active:scale-95"
            >
              <LogOut size={14} /> <span className="hidden sm:inline">{userName}</span>
            </button>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="h-9 px-4 rounded-full flex items-center gap-2 text-[12px] font-semibold border border-zinc-700/70 bg-[#070707] text-zinc-100 hover:border-zinc-500/80 transition active:scale-95"
            >
              {copy.signIn}
            </button>
          )}
        </div>
      </header>

      {/* ── Message feed ──────────────────────────────────────────── */}
      <main ref={mainRef} onScroll={onMainScroll} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 flex flex-col gap-4">
          {switching ? (
            // Premium restore skeleton — brief beat while a stored chat loads.
            <div className="flex flex-col gap-4 py-2">
              <div className="flex justify-end"><Skeleton className="h-10 w-1/2 rounded-2xl" /></div>
              <div className="flex justify-start"><Skeleton className="h-24 w-3/4 rounded-2xl" /></div>
              <div className="flex justify-end"><Skeleton className="h-10 w-2/5 rounded-2xl" /></div>
              <div className="flex justify-start"><Skeleton className="h-16 w-2/3 rounded-2xl" /></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800/70 flex items-center justify-center mb-4 text-[28px]">⬡</div>
              <p className="text-[13px] text-zinc-400 leading-7">Ask anything. Generate music, video, or images.</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                accent={ACCENT}
                autoplay={prefs.autoplayMedia}
                mediaExpiredLabel={xc.mediaExpired}
                streaming={i === messages.length - 1 && m.role === 'assistant' && !!m.text && !isLoading}
                onStreamTick={() => pinBottom(false)}
                onRegenerate={() => sendMessage(m.sourcePrompt)}
                onEdit={editPrompt}
                onFeedback={sendFeedback}
                onPlayAudio={playAssetAudio}
              />
            ))
          )}
          {isLoading ? (
            <div className="flex flex-col gap-2.5">
              <MediaSkeleton mode={mode} accent={ACCENT} />
              {mode !== 'global' && pipeline?.active && pipeline.stages.length ? (
                <PipelineTelemetry stages={pipeline.stages} lang={lang} accent={ACCENT} />
              ) : null}
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </main>

      {/* ── Floating avatar ──────────────────────────────────────────
          Collapsed: a draggable circular video widget (framer-motion drag,
          constrained to the viewport). A genuine tap (no drag) expands it
          into a centered 9:16 talking-avatar preview. Falls back to a marine
          orb when no avatar video asset is configured. */}
      <AnimatePresence>
        {avatarExpanded ? (
          <motion.div
            key="avatar-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-[#030303] flex items-center justify-center"
          >
            <div className="relative h-full w-full overflow-hidden md:h-[94vh] md:w-auto md:aspect-[9/16] md:rounded-[1.75rem] md:border md:border-white/10 md:shadow-[0_40px_140px_-30px_rgba(0,0,0,0.85)]">
              {HAS_AVATAR_VIDEO ? (
                <video
                  ref={fullVideoRef}
                  src={AVATAR_VIDEO}
                  poster={AVATAR_POSTER}
                  playsInline
                  preload="auto"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-zinc-400">
                  <span className="flex h-28 w-28 items-center justify-center rounded-full bg-neutral-800 border border-white/10 text-neutral-200 text-[44px]">🤖</span>
                  <p className="text-sm">Live avatar</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setAvatarExpanded(false)}
              className="absolute top-4 right-4 h-11 w-11 rounded-full flex items-center justify-center bg-zinc-900/80 backdrop-blur-md border border-zinc-700/70 text-zinc-100 hover:border-zinc-500/80 active:scale-90 transition"
              style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
              aria-label="Collapse avatar"
            >
              <Minimize2 size={18} />
            </button>
            {HAS_AVATAR_VIDEO ? (
              <button
                onClick={toggleAvatarSound}
                aria-label={avatarSoundOn ? 'Mute avatar' : 'Unmute avatar'}
                className="absolute top-4 left-4 h-11 w-11 rounded-full flex items-center justify-center bg-zinc-900/80 backdrop-blur-md border border-zinc-700/70 text-zinc-100 hover:border-zinc-500/80 active:scale-90 transition"
                style={{ top: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
              >
                {avatarSoundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="avatar-floating"
            role="button"
            tabIndex={0}
            aria-label="Expand avatar"
            drag
            dragConstraints={stageRef}
            dragElastic={0.12}
            dragMomentum={false}
            whileDrag={{ scale: 1.08, cursor: 'grabbing' }}
            onDragStart={() => { avatarDraggedRef.current = true; }}
            onDragEnd={() => { window.setTimeout(() => { avatarDraggedRef.current = false; }, 0); }}
            onClick={() => { if (avatarDraggedRef.current) return; setAvatarExpanded(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAvatarExpanded(true); } }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="fixed z-40 h-16 w-16 rounded-full overflow-hidden flex items-center justify-center cursor-grab touch-none select-none active:scale-95"
            style={{
              bottom: 'calc(150px + env(safe-area-inset-bottom, 0px))',
              right: 16,
              border: '2px solid rgba(255,255,255,0.14)',
              boxShadow: '0 10px 36px -8px rgba(0,0,0,0.85)',
              background: 'radial-gradient(60% 60% at 50% 35%, rgba(255,255,255,0.06), rgba(0,0,0,0.65))',
            }}
          >
            {HAS_AVATAR_VIDEO ? (
              <video
                ref={cornerVideoRef}
                src={AVATAR_VIDEO}
                poster={AVATAR_POSTER}
                muted
                loop
                playsInline
                preload="metadata"
                className="pointer-events-none h-full w-full object-cover"
              />
            ) : (
              <span className="text-[24px] pointer-events-none" aria-hidden>🤖</span>
            )}
            <span aria-hidden className="pointer-events-none absolute -inset-px rounded-full ring-1 ring-white/10" />
            <span className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full bg-[#030303] border border-zinc-700/80 flex items-center justify-center pointer-events-none">
              <Maximize2 size={9} className="text-zinc-300" />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Composer (bottom anchor) ─────────────────────────────── */}
      <footer
        className="flex-shrink-0 border-t border-white/[0.05] bg-[#030303]/95 backdrop-blur-md"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Attachment pills — image = thumbnail, document/media = labelled pill */}
        {attachments.length > 0 ? (
          <div className="px-3 pt-2 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {attachments.map((att) => (
              att.type === 'image' && att.preview ? (
                <div
                  key={att.id}
                  className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 group bg-zinc-900 border border-zinc-800/70"
                >
                  <Image src={att.preview} alt={att.name} width={48} height={48} unoptimized className="w-full h-full object-cover" />
                  <button
                    onClick={() => dispatch({ type: 'REMOVE_ATTACHMENT', id: att.id })}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove attachment"
                  >
                    <span className="text-[8px] text-white">✕</span>
                  </button>
                </div>
              ) : (
                <div
                  key={att.id}
                  className="relative flex-shrink-0 group inline-flex items-center gap-2 h-12 max-w-[220px] pl-2.5 pr-8 rounded-xl bg-zinc-900 border border-zinc-800/70"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-[14px]">
                    {att.type === 'video' ? '🎬' : att.type === 'audio' ? '🎵' : '📄'}
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="truncate text-[12px] font-medium text-zinc-200 max-w-[150px]">{att.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                      {att.type === 'file' ? 'PDF' : att.type} · {Math.max(1, Math.round(att.size / 1024))} KB
                    </span>
                  </span>
                  <button
                    onClick={() => dispatch({ type: 'REMOVE_ATTACHMENT', id: att.id })}
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-zinc-300 hover:text-white hover:bg-black/80 transition"
                    aria-label="Remove attachment"
                  >
                    <X size={11} />
                  </button>
                </div>
              )
            ))}
          </div>
        ) : null}

        {/* ── Unified monolithic console: mode selector + composer ───── */}
        <div className="px-3 pt-2 pb-2 max-w-2xl mx-auto">
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] transition-colors focus-within:border-white/[0.12]">
            {/* Mode selector — sets the orchestrator service context */}
            <div className="flex gap-1.5 overflow-x-auto px-2 pt-2 pb-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {MODES.map(({ id, Icon, label }) => {
                const active = mode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    aria-pressed={active}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium border transition-colors active:scale-95 ${
                      active
                        ? 'border-white/15 bg-neutral-800 text-neutral-50'
                        : 'border-transparent bg-[#121212] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Icon size={14} />
                    {label[lang]}
                  </button>
                );
              })}
            </div>


            {/* Composer row — attachment, camera, input, mic, send */}
            <div className="flex items-end gap-1.5 px-2 py-2">
              <input ref={fileInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/*,video/*,audio/*,application/pdf,.pdf" onChange={onFileChange} />
              <button
                onClick={onPickFile}
                aria-label="Attach file"
                className="h-9 w-9 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition active:scale-95"
              >
                <Paperclip size={18} />
              </button>
              <button
                onClick={() => setCameraOpen(true)}
                aria-label="Open camera"
                className="h-9 w-9 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition active:scale-95"
              >
                <Camera size={18} />
              </button>
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => dispatch({ type: 'SET_INPUT', text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  // Honour the user's send-key preference:
                  //  • on  → Enter sends, Shift+Enter = newline
                  //  • off → Enter = newline, ⌘/Ctrl+Enter sends
                  const shouldSend = prefs.submitOnEnter ? !e.shiftKey : (e.metaKey || e.ctrlKey);
                  if (!shouldSend) return;
                  e.preventDefault();
                  if (inputText.trim() && !isLoading) void sendMessage();
                }}
                placeholder={copy.placeholder}
                rows={1}
                className="flex-1 bg-transparent text-[15px] leading-7 text-zinc-50 placeholder-zinc-500 resize-none outline-none px-1 py-1.5 min-h-[36px]"
              />
              <button
                onClick={toggleRecording}
                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                aria-pressed={isRecording}
                title={speechSupported ? undefined : copy.voiceUnsupported}
                className={`relative h-9 w-9 flex items-center justify-center rounded-xl transition active:scale-95 ${isRecording ? 'text-rose-300 bg-rose-500/10' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'}`}
              >
                {isRecording ? (
                  <>
                    {/* Pulsating active-listening indicator */}
                    <span className="absolute inset-0 rounded-xl border border-rose-400/60 animate-ping" aria-hidden />
                    <span className="absolute inset-0 rounded-xl bg-rose-500/10 animate-pulse" aria-hidden />
                    <Mic size={18} className="relative animate-pulse" />
                  </>
                ) : (
                  <Mic size={18} />
                )}
              </button>
              {isLoading ? (
                <button
                  onClick={stop}
                  aria-label="Stop"
                  className="h-9 w-9 flex items-center justify-center rounded-xl text-rose-300 hover:bg-rose-500/10 active:scale-95"
                >
                  <X size={18} />
                </button>
              ) : (
                <button
                  onClick={() => void sendMessage()}
                  disabled={!inputText.trim()}
                  aria-label="Send"
                  className="h-9 w-9 flex items-center justify-center rounded-xl text-zinc-950 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: inputText.trim() ? ACCENT : 'transparent',
                  }}
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* ── Side-drawer history ──────────────────────────────────── */}
      <AnimatePresence>
        {historyOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            onClick={() => setHistoryOpen(false)}
          >
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[#030303] border-r border-zinc-800/70 flex flex-col"
              style={{
                paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
                paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
              }}
            >
              <div className="flex items-center justify-between px-4 pb-3 border-b border-zinc-800/70">
                <span className="text-[13px] font-semibold tracking-wide text-zinc-100">{copy.history}</span>
                <button
                  onClick={() => setHistoryOpen(false)}
                  aria-label={xc.close}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition active:scale-95"
                >
                  <X size={15} />
                </button>
              </div>

              {/* New chat — clears context without reloading the app */}
              <div className="px-3 pt-3 pb-2">
                <button
                  onClick={startNewChat}
                  className="w-full inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-zinc-800/80 bg-[#0a0a0a] text-[13px] font-medium text-zinc-100 hover:border-zinc-600/80 hover:bg-zinc-900 transition active:scale-[0.99]"
                >
                  <PenSquare size={16} /> {xc.newChat}
                </button>
              </div>

              {/* Time-grouped conversation log */}
              <div className="flex-1 overflow-y-auto px-2 py-1 [scrollbar-width:thin]">
                {groupedConversations.length === 0 ? (
                  <p className="px-2 py-4 text-[12px] text-zinc-500">{xc.noChats}</p>
                ) : (
                  groupedConversations.map((group) => (
                    <div key={group.bucket} className="pb-2">
                      <div className="px-2 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
                        {GROUP_LABELS[group.bucket][lang]}
                      </div>
                      {group.conversations.map((c) => (
                        <ConversationRow
                          key={c.id}
                          convo={c}
                          active={c.id === conversationId}
                          renaming={renamingId === c.id}
                          xc={xc}
                          onOpen={() => openConversation(c.id)}
                          onStartRename={() => setRenamingId(c.id)}
                          onCancelRename={() => setRenamingId(null)}
                          onCommitRename={(title) => renameConvo(c.id, title)}
                          onDelete={() => setDeleteTarget(c.id)}
                        />
                      ))}
                    </div>
                  ))
                )}
              </div>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Settings & Profile modal ─────────────────────────────── */}
      <AnimatePresence>
        {settingsOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setSettingsOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-3xl border border-zinc-800/80 bg-[#0a0a0a] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-zinc-800/70 bg-[#0a0a0a]/95 backdrop-blur">
                <span className="text-[15px] font-semibold text-zinc-50">{copy.settings}</span>
                <button
                  onClick={() => setSettingsOpen(false)}
                  aria-label={xc.close}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition active:scale-95"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="px-5 py-4 flex flex-col gap-6">
                {/* Account */}
                <section className="flex flex-col gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{xc.account}</h3>
                  <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/70 bg-[#0f0f0f] p-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 text-neutral-200">
                      <User size={18} />
                    </span>
                    <div className="min-w-0">
                      {isAuthenticated ? (
                        <>
                          <p className="text-[10px] uppercase tracking-wider text-zinc-500">{xc.signedInAs}</p>
                          <p className="truncate text-[13.5px] font-medium text-zinc-100">{userEmail || userName}</p>
                        </>
                      ) : (
                        <p className="text-[13px] text-zinc-400">{xc.guest}</p>
                      )}
                    </div>
                  </div>
                </section>

                {/* Preferences */}
                <section className="flex flex-col gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{xc.preferences}</h3>
                  <div className="rounded-2xl border border-zinc-800/70 bg-[#0f0f0f] divide-y divide-zinc-800/60">
                    <SettingToggle
                      label={xc.submitOnEnter}
                      hint={xc.submitOnEnterHint}
                      checked={prefs.submitOnEnter}
                      onChange={(v) => updatePref({ submitOnEnter: v })}
                    />
                    <SettingToggle
                      label={xc.autoplay}
                      checked={prefs.autoplayMedia}
                      onChange={(v) => updatePref({ autoplayMedia: v })}
                    />
                    <SettingToggle
                      label={copy.sound}
                      checked={avatarSoundOn}
                      onChange={() => toggleAvatarSound()}
                    />
                    {/* Language */}
                    <div className="flex items-center justify-between gap-3 px-3 py-3">
                      <span className="flex items-center gap-2 text-[13.5px] text-zinc-200">
                        <Globe size={15} /> {copy.language}
                      </span>
                      <div className="flex gap-1.5">
                        {(['ka', 'en', 'ru'] as const).map((lc) => (
                          <button
                            key={lc}
                            onClick={() => changeLanguage(lc)}
                            className={`h-8 w-9 rounded-lg text-[12px] font-semibold uppercase transition active:scale-95 border ${lang === lc ? 'border-white/25 bg-neutral-800 text-neutral-50' : 'border-white/10 bg-[#121212] text-zinc-400 hover:text-zinc-200'}`}
                          >
                            {lc}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Custom instructions */}
                <section className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <Sparkles size={13} /> {xc.customInstructions}
                  </h3>
                  <textarea
                    value={prefs.customInstructions}
                    onChange={(e) => updatePref({ customInstructions: e.target.value })}
                    maxLength={MAX_CUSTOM_INSTRUCTIONS}
                    rows={4}
                    placeholder={xc.ciPlaceholder}
                    className="w-full resize-none rounded-2xl border border-zinc-800/70 bg-[#0f0f0f] p-3 text-[13.5px] leading-6 text-zinc-100 placeholder-zinc-600 outline-none focus:border-zinc-600/80 transition"
                  />
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{xc.ciHint}</span>
                    <span className="tabular-nums">{prefs.customInstructions.length}/{MAX_CUSTOM_INSTRUCTIONS}</span>
                  </div>
                </section>
              </div>

              <div className="sticky bottom-0 flex justify-end px-5 py-4 border-t border-zinc-800/70 bg-[#0a0a0a]/95 backdrop-blur">
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="h-9 px-5 rounded-full text-[13px] font-semibold bg-neutral-100 text-neutral-900 hover:bg-white transition active:scale-95"
                >
                  {xc.done}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Delete-conversation confirmation ─────────────────────── */}
      <AnimatePresence>
        {deleteTarget ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            onClick={() => setDeleteTarget(null)}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl border border-zinc-800/80 bg-[#0a0a0a] p-5 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]"
            >
              <div className="flex items-center gap-2.5 pb-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500/10 text-rose-300">
                  <Trash2 size={17} />
                </span>
                <h3 className="text-[15px] font-semibold text-zinc-50">{xc.deleteTitle}</h3>
              </div>
              <p className="text-[13px] leading-6 text-zinc-400 pb-4">{xc.deleteBody}</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="h-9 px-4 rounded-full text-[13px] font-medium text-zinc-300 hover:bg-zinc-900 transition active:scale-95"
                >
                  {xc.cancel}
                </button>
                <button
                  onClick={() => removeConvo(deleteTarget)}
                  className="h-9 px-4 rounded-full text-[13px] font-semibold bg-rose-500/90 text-white hover:bg-rose-500 transition active:scale-95"
                >
                  {xc.delete}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Drag-and-drop overlay ────────────────────────────────── */}
      <AnimatePresence>
        {dragActive ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-white/30 bg-[#0a0a0a]/80 px-10 py-8 text-center">
              <Paperclip size={28} className="text-zinc-200" />
              <p className="text-[14px] font-semibold text-zinc-100">{xc.dropToAttach}</p>
              <p className="text-[11.5px] text-zinc-500">PDF · JPG · PNG</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Modals ─────────────────────────────────────────────── */}
      <WalletRefillModal open={walletOpen} locale={lang} onClose={() => setWalletOpen(false)} />
      <AuthModal open={authOpen} locale={lang} onClose={() => setAuthOpen(false)} onAuthed={() => { setAuthOpen(false); window.location.reload(); }} />
      <CameraModal
        isOpen={cameraOpen}
        accentColor={ACCENT}
        onClose={() => setCameraOpen(false)}
        onAttach={(att) => { dispatch({ type: 'ADD_ATTACHMENT', attachment: att }); setCameraOpen(false); }}
      />

      {/* Non-blocking transient notice (pre-flight validation, export errors) */}
      <AnimatePresence>
        {notice ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="alert"
            className="fixed left-1/2 z-[70] -translate-x-1/2 rounded-full border border-white/15 bg-neutral-900/95 px-4 py-2 text-[12.5px] font-medium text-neutral-100 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md"
            style={{ bottom: 'calc(180px + env(safe-area-inset-bottom, 0px))' }}
          >
            {notice}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ─── Settings row toggle — labelled switch with an optional hint line. ─── */
function SettingToggle({
  label, hint, checked, onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left hover:bg-zinc-900/40 transition"
    >
      <span className="flex flex-col min-w-0">
        <span className="text-[13.5px] text-zinc-200">{label}</span>
        {hint ? <span className="text-[11px] leading-4 text-zinc-500">{hint}</span> : null}
      </span>
      <span className={`relative h-5 w-9 flex-shrink-0 rounded-full transition ${checked ? 'bg-neutral-200' : 'bg-zinc-700'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${checked ? 'left-[1.125rem] bg-neutral-900' : 'left-0.5 bg-white'}`} />
      </span>
    </button>
  );
}

/* ─── Conversation row — title button + hover (…) menu (Rename / Delete).
 * Rename swaps the title into an inline input; Enter / blur commits, Esc
 * cancels. The whole row opens the stored chat (seamless restore). ─────── */
function ConversationRow({
  convo, active, renaming, xc, onOpen, onStartRename, onCancelRename, onCommitRename, onDelete,
}: {
  convo: StoredConversation;
  active: boolean;
  renaming: boolean;
  xc: typeof XCOPY[keyof typeof XCOPY];
  onOpen: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(convo.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      setDraft(convo.title);
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    }
  }, [renaming, convo.title]);

  if (renaming) {
    return (
      <div className="px-1.5 py-0.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onCommitRename(draft); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancelRename(); }
          }}
          onBlur={() => onCommitRename(draft)}
          className="w-full h-9 px-2.5 rounded-lg bg-[#121212] border border-zinc-600/70 text-[13px] text-zinc-100 outline-none focus:border-zinc-400/70"
        />
      </div>
    );
  }

  return (
    <div className="relative group/row px-1.5">
      <button
        onClick={onOpen}
        className={`w-full flex items-center gap-2 h-9 pl-2.5 pr-8 rounded-lg text-left text-[13px] truncate transition ${
          active ? 'bg-neutral-800 text-neutral-50' : 'text-zinc-300 hover:bg-zinc-900'
        }`}
      >
        <MessageSquare size={14} className="flex-shrink-0 opacity-60" />
        <span className="truncate">{convo.title}</span>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        aria-label={`${xc.rename} / ${xc.delete}`}
        aria-haspopup="menu"
        className={`absolute top-1/2 right-2 -translate-y-1/2 h-6 w-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition ${
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 focus:opacity-100'
        }`}
      >
        <MoreHorizontal size={15} />
      </button>

      <AnimatePresence>
        {menuOpen ? (
          <>
            <div className="fixed inset-0 z-[61]" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} aria-hidden />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.13 }}
              role="menu"
              className="absolute right-2 top-9 z-[62] w-36 rounded-xl border border-zinc-800/80 bg-[#0d0d0d] p-1 shadow-[0_20px_50px_-18px_rgba(0,0,0,0.9)]"
            >
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onStartRename(); }}
                className="w-full flex items-center gap-2 h-8 px-2.5 rounded-lg text-[12.5px] text-zinc-200 hover:bg-zinc-800 transition"
              >
                <Pencil size={14} /> {xc.rename}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                className="w-full flex items-center gap-2 h-8 px-2.5 rounded-lg text-[12.5px] text-rose-300 hover:bg-rose-500/10 transition"
              >
                <Trash2 size={14} /> {xc.delete}
              </button>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ─── Streaming text — progressive typewriter reveal of an assistant reply.
 * The orchestrator returns the full text in one JSON; this animates its reveal
 * for the fluid, token-by-token feel of a Tier-1 LLM. Duration is bounded (~1.7s)
 * regardless of length, snaps to full if interrupted, and respects
 * prefers-reduced-motion (instant render). onTick lets the parent pin scroll. */

/* ─── Markdown rendering — full GFM (tables, lists, headers, bold) with
 * dark-themed syntax-highlighted code blocks + a Copy button. Styled to the
 * monochrome Apple/Gemini system so generated content reads like a Tier-1 LLM
 * surface rather than a plain-text dump. */

// Flatten React children (including rehype-highlight's nested <span> token tree)
// back to the raw source string — needed so "Copy" yields clean, un-highlighted
// code rather than the DOM's interleaved markup.
function nodeToText(node: ReactNode): string {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  if (isValidElement(node)) return nodeToText((node.props as { children?: ReactNode }).children);
  return '';
}

function CodeBlock({ language, raw, codeClassName, children }: {
  language?: string;
  raw: string;
  codeClassName?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(raw)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })
      .catch(() => { /* clipboard blocked — no-op */ });
  }, [raw]);

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-neutral-800 bg-[#0b0b0b]">
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/50 px-3 py-1.5">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-neutral-500">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-neutral-400 transition-colors hover:text-neutral-100 active:scale-95"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 text-[12.5px] leading-relaxed">
        <code className={`${codeClassName || ''} font-mono`}>{children}</code>
      </pre>
    </div>
  );
}

const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-1.5 mt-3 text-[17px] font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-[15px] font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2.5 text-[14px] font-semibold first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-neutral-500">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-neutral-500">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-neutral-50">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: ACCENT }}>
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-neutral-700 pl-3 text-neutral-400">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-neutral-800" />,
  table: ({ children }) => (
    <div className="my-2.5 overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-neutral-900/60">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-1.5 text-left font-semibold text-neutral-200">{children}</th>,
  td: ({ children }) => <td className="border-t border-neutral-800/70 px-3 py-1.5 align-top">{children}</td>,
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const match = /language-(\w+)/.exec(className || '');
    const raw = nodeToText(children);
    const isBlock = !!match || raw.includes('\n');
    if (!isBlock) {
      return (
        <code className="rounded bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-100">
          {children}
        </code>
      );
    }
    return (
      <CodeBlock language={match?.[1]} raw={raw.replace(/\n$/, '')} codeClassName={className}>
        {children}
      </CodeBlock>
    );
  },
};

function MarkdownView({ source }: { source: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={MD_COMPONENTS}
    >
      {source}
    </ReactMarkdown>
  );
}

function StreamingText({
  text, active, onTick,
}: {
  text: string;
  active: boolean;
  onTick?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const animate = active && !reduceMotion;
  const [count, setCount] = useState(animate ? 0 : text.length);
  const onTickRef = useRef(onTick);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  useEffect(() => {
    if (!animate) { setCount(text.length); return; }
    let cancelled = false;
    let current = 0;
    let last = 0;
    const total = text.length;
    const step = Math.max(2, Math.ceil(total / 70)); // bound total reveal ≈1.7s
    let raf = 0;
    const tick = (ts: number) => {
      if (cancelled) return;
      if (ts - last >= 24) {
        last = ts;
        current = Math.min(total, current + step);
        setCount(current);
        onTickRef.current?.();
      }
      if (current < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [text, animate]);

  const shown = animate ? text.slice(0, count) : text;
  const blinking = animate && count < text.length;
  return (
    <div className="md-body">
      <MarkdownView source={shown} />
      {blinking ? (
        <span className="-mt-1 inline-block h-[0.95em] w-[2px] translate-y-[2px] animate-pulse bg-current opacity-70" aria-hidden />
      ) : null}
    </div>
  );
}

/* ─── Per-message bubble with executive toolbar ────────────────────── */

function MessageBubble({
  message, accent, streaming = false, autoplay = false, mediaExpiredLabel, onStreamTick, onRegenerate, onEdit, onFeedback, onPlayAudio,
}: {
  message: ChatMessage;
  accent: string;
  streaming?: boolean;
  autoplay?: boolean;
  mediaExpiredLabel?: string;
  onStreamTick?: () => void;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
  onFeedback: (id: string, rating: 'up' | 'down') => void;
  onPlayAudio: (url: string) => void;
}) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const bubbleVideoRef = useRef<HTMLVideoElement>(null);
  const bubbleAudioRef = useRef<HTMLAudioElement>(null);
  const [lightbox, setLightbox] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Autoplay generated media when the preference is on. Video plays muted
  // (browsers block unmuted autoplay); audio play is best-effort.
  useEffect(() => {
    if (!autoplay || !message.assetUrl) return;
    if (message.assetType === 'video') {
      const v = bubbleVideoRef.current;
      if (v) { v.muted = true; void Promise.resolve(v.play()).catch(() => {}); }
    } else if (message.assetType === 'audio') {
      const a = bubbleAudioRef.current;
      if (a) void Promise.resolve(a.play()).catch(() => {});
    }
  }, [autoplay, message.assetUrl, message.assetType]);

  const copyMessageText = useCallback(() => {
    if (!navigator.clipboard || !message.text) return;
    navigator.clipboard.writeText(message.text)
      .then(() => { setCopiedText(true); setTimeout(() => setCopiedText(false), 1800); })
      .catch(() => { /* clipboard blocked — no-op */ });
  }, [message.text]);

  const togglePiP = useCallback(async () => {
    const v = bubbleVideoRef.current;
    if (!v || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement === v) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch { /* PiP unsupported / blocked — no-op */ }
  }, []);

  const downloadAsset = useCallback(async () => {
    const url = message.assetUrl;
    if (!url) return;
    const ext = message.assetType === 'video' ? 'mp4'
      : message.assetType === 'audio' ? 'mp3'
      : message.assetType === 'image' ? 'png'
      : 'bin';
    const filename = `myavatar-${message.id}.${ext}`;

    // Always route through arrayBuffer → Blob(application/octet-stream) so the
    // browser is forced to SAVE rather than navigate/open a raw asset tab —
    // critical for standalone Safari/PWA web-views. Falls back to a direct
    // anchor only when the fetch is CORS-blocked (truly cross-origin assets).
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) throw new Error('fetch failed');
      const buf = await res.arrayBuffer();
      const objectUrl = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
      return;
    } catch {
      /* CORS / network — best-effort direct anchor */
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [message.assetUrl, message.assetType, message.id]);

  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col gap-2 max-w-[88%] ${isUser ? 'items-end' : 'items-start'}`}>
        {message.text ? (
          <div
            className={
              isError
                ? 'rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed tracking-[-0.01em] border border-rose-500/25 bg-rose-500/[0.05] text-rose-200'
                : isUser
                ? 'rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed tracking-[-0.01em] bg-neutral-100 text-neutral-900'
                : 'rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed tracking-[-0.01em] bg-neutral-900/80 border border-neutral-800 text-neutral-100'
            }
          >
            {!isUser && !isError
              ? <StreamingText text={message.text} active={streaming} onTick={onStreamTick} />
              : message.text}
          </div>
        ) : null}

        {message.assetUrl && message.assetType === 'image' ? (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            aria-label="Open full-size image"
            className="group relative block overflow-hidden rounded-2xl border border-zinc-800/70 bg-black max-w-full active:scale-[0.99] transition"
          >
            <Image src={message.assetUrl} alt="Generated" width={1200} height={800} unoptimized className="max-w-full max-h-[300px] w-auto object-contain" />
            <span className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white/90 opacity-0 group-hover:opacity-100 transition">
              <Maximize2 size={14} />
            </span>
          </button>
        ) : null}
        {message.assetUrl && message.assetType === 'video' ? (
          message.mode === 'avatar' ? (
            // Avatar → strict native 9:16 portrait stage (object-cover, premium framing).
            <div className="aspect-[9/16] w-full max-w-[320px] rounded-2xl overflow-hidden border border-zinc-800/70 shadow-2xl bg-black">
              <video
                ref={bubbleVideoRef}
                controls
                playsInline
                preload="metadata"
                style={{ transform: 'translateZ(0)' }}
                className="h-full w-full object-cover"
              >
                <source src={message.assetUrl} />
              </video>
            </div>
          ) : (
            // Film / other → adaptive responsive framing (object-contain, no distortion).
            <video
              ref={bubbleVideoRef}
              controls
              playsInline
              preload="metadata"
              style={{ transform: 'translateZ(0)' }}
              className="rounded-2xl border border-zinc-800/70 max-w-full max-h-[320px] w-auto object-contain bg-black"
            >
              <source src={message.assetUrl} />
            </video>
          )
        ) : null}
        {message.assetUrl && message.assetType === 'audio' ? (
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800/70 bg-[#0a0a0a] p-3">
            <div className="flex items-center gap-2 pb-2 text-[12px] font-medium text-zinc-300">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5">
                <Volume2 size={18} style={{ color: accent }} />
              </span>
              <span>Audio</span>
            </div>
            <audio ref={bubbleAudioRef} controls preload="metadata" className="w-full">
              <source src={message.assetUrl} />
            </audio>
          </div>
        ) : null}

        {/* Evicted-media hint — the asset was too large/ephemeral to persist
            (data:/blob: URL dropped on save); offer regeneration instead. */}
        {!message.assetUrl && message.assetEvicted && mediaExpiredLabel ? (
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-800/70 bg-[#0a0a0a] px-3 py-2.5 text-[12px] text-zinc-400">
            <Film size={14} className="opacity-60" />
            <span>{mediaExpiredLabel}</span>
          </div>
        ) : null}

        {/* Image lightbox */}
        <AnimatePresence>
          {lightbox && message.assetUrl && message.assetType === 'image' ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
              onClick={() => setLightbox(false)}
            >
              <Image src={message.assetUrl} alt="Generated (full size)" width={2048} height={2048} unoptimized className="max-h-[92vh] max-w-[96vw] w-auto h-auto object-contain rounded-xl" />
              <button
                onClick={() => setLightbox(false)}
                aria-label="Close"
                className="absolute top-5 right-5 h-11 w-11 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition"
                style={{ top: 'calc(1.25rem + env(safe-area-inset-top, 0px))' }}
              >
                <X size={20} />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Executive toolbar — assistant messages only */}
        {!isUser && !isError ? (
          <div className="flex items-center gap-1.5 mt-1 text-neutral-500">
            <button
              onClick={() => onFeedback(message.id, 'up')}
              aria-label="Good response"
              className="h-9 w-9 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 transition-all duration-200 active:scale-95"
            >
              <ThumbsUp size={18} />
            </button>
            <button
              onClick={() => onFeedback(message.id, 'down')}
              aria-label="Poor response"
              className="h-9 w-9 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 transition-all duration-200 active:scale-95"
            >
              <ThumbsDown size={18} />
            </button>
            {message.assetUrl && message.assetType === 'audio' ? (
              <button
                onClick={() => onPlayAudio(message.assetUrl!)}
                aria-label="Play audio"
                className="h-9 w-9 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 transition-all duration-200 active:scale-95"
                style={{ color: accent }}
              >
                <Volume2 size={18} />
              </button>
            ) : null}
            {message.assetUrl && message.assetType === 'video' ? (
              <button
                onClick={togglePiP}
                aria-label="Picture in picture"
                className="h-9 w-9 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 transition-all duration-200 active:scale-95"
              >
                <PictureInPicture2 size={18} />
              </button>
            ) : null}
            {message.assetUrl ? (
              <button
                onClick={downloadAsset}
                aria-label="Download media"
                className="h-9 w-9 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 transition-all duration-200 active:scale-95"
              >
                <Download size={18} />
              </button>
            ) : null}
            {message.text ? (
              <button
                onClick={copyMessageText}
                aria-label="Copy response"
                className="h-9 w-9 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 transition-all duration-200 active:scale-95"
              >
                {copiedText ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              </button>
            ) : null}
            {message.sourcePrompt ? (
              <button
                onClick={onRegenerate}
                aria-label="Regenerate"
                className="h-9 w-9 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 transition-all duration-200 active:scale-95"
              >
                <RotateCcw size={18} />
              </button>
            ) : null}
          </div>
        ) : null}

        {/* User controls — discreet Edit (branch the prompt) + Copy */}
        {isUser && message.text ? (
          <div className="flex items-center gap-1 mt-0.5 text-neutral-600 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={() => onEdit(message.text)}
              aria-label="Edit prompt"
              className="h-8 w-8 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 transition-all duration-200 active:scale-95"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={copyMessageText}
              aria-label="Copy prompt"
              className="h-8 w-8 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 transition-all duration-200 active:scale-95"
            >
              {copiedText ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Live render telemetry — a per-stage progress strip bound to genuine
 * backend status (derivePipeline). Each row reflects a real lifecycle phase:
 * analysis → audio synthesis → GPU render. No fabricated percentages. */

function PipelineTelemetry({
  stages, lang, accent,
}: {
  stages: PipelineStage[];
  lang: 'en' | 'ka' | 'ru';
  accent: string;
}) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-800/70 bg-[#0a0a0a] p-3 flex flex-col gap-2">
      {stages
        .filter((s) => s.state !== 'skipped')
        .map((s) => {
          const labelColor =
            s.state === 'done' ? 'text-neutral-300'
            : s.state === 'active' ? 'text-neutral-100'
            : s.state === 'failed' ? 'text-rose-300'
            : 'text-neutral-500';
          return (
            <div key={s.key} className="flex items-center gap-2.5 text-[12px]">
              <span className="flex h-4 w-4 items-center justify-center flex-shrink-0">
                {s.state === 'done' ? (
                  <Check size={14} className="text-emerald-400" />
                ) : s.state === 'active' ? (
                  <Loader2 size={14} className="animate-spin" style={{ color: accent }} />
                ) : s.state === 'failed' ? (
                  <AlertCircle size={14} className="text-rose-400" />
                ) : (
                  <Circle size={9} className="text-neutral-600" />
                )}
              </span>
              <span className={`leading-tight ${labelColor}`}>{s.label[lang]}</span>
            </div>
          );
        })}
    </div>
  );
}

/* ─── Shaped skeleton loaders — the placeholder assumes the exact shape of the
 * incoming asset (9:16 for avatar, square for image, 16:9 for film, waveform for
 * audio) so the real preview lands with zero layout shift. */

function MediaSkeleton({ mode, accent }: { mode: ServiceMode; accent: string }) {
  // Chat → slim text shimmer.
  if (mode === 'global') {
    return (
      <div className="flex items-center gap-2.5">
        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: accent }} />
        <div className="flex flex-col gap-1.5">
          <span className="h-2.5 w-40 rounded bg-neutral-800 animate-pulse" />
          <span className="h-2.5 w-24 rounded bg-neutral-800 animate-pulse" />
        </div>
      </div>
    );
  }

  // Music / Voice → sleek pulsing waveform.
  if (mode === 'music' || mode === 'voice') {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800/70 bg-[#0a0a0a] p-3">
        <div className="flex items-center gap-2 pb-2 text-[12px] text-zinc-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: accent }} />
          <span>{mode === 'voice' ? 'Synthesizing voice…' : 'Composing…'}</span>
        </div>
        <div className="flex items-end gap-[3px] h-12">
          {Array.from({ length: 32 }).map((_, i) => (
            <span
              key={i}
              className="flex-1 rounded-full bg-neutral-800 animate-pulse"
              style={{ height: `${25 + ((i * 41) % 70)}%`, animationDelay: `${(i % 8) * 90}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Image / Video / Avatar → a block in the exact future aspect ratio.
  const shape =
    mode === 'avatar' ? 'aspect-[9/16] w-full max-w-[320px]'
    : mode === 'image' ? 'aspect-square w-full max-w-[280px]'
    : 'aspect-video w-full max-w-full';
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-zinc-800/70 bg-neutral-900 animate-pulse ${shape}`}>
      <span className="absolute inset-0 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
      </span>
    </div>
  );
}
