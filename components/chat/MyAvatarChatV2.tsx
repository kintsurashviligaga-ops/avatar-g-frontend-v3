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

import { Component, isValidElement, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Components } from 'react-markdown';
import {
  AlertCircle,
  Box,
  Camera,
  Check,
  ChevronDown,
  Circle,
  Copy,
  Cpu,
  Download,
  Film,
  Globe,
  ImagePlus,
  Link2,
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
  Pause,
  Plus,
  Pencil,
  PictureInPicture2,
  RotateCcw,
  Search,
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
  Wallet,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { BalanceChip, WalletRefillModal } from '@/components/chat/WalletRefill';
import { formatGEL } from '@/lib/billing/gel';
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
import { generateConversationTitle } from '@/lib/chat/titleClient';
import { deriveCarryContext } from '@/lib/chat/carryContext';
import { classifyChatError } from '@/lib/chat/errorResilience';
import { resolveAssetType } from '@/lib/chat/assetType';

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
  en: { placeholder: 'Type a message…', signIn: 'Sign in', signOut: 'Sign out', clearHistory: 'Clear history', history: 'History', menu: 'Menu', settings: 'Settings', language: 'Language', sound: 'Avatar sound', genericError: 'Something went wrong. Try again.', fileTooLarge: 'File is too large (max {max}MB).', fileBadType: 'Unsupported file type. Use an image, video, or audio file.', voiceUnsupported: 'Voice input isn’t supported in this browser.', listening: 'Listening…', micDenied: 'Microphone access is blocked. Enable it in your browser settings and try again.', micNoDevice: 'No microphone was found. Connect one and try again.', micNetwork: 'Voice recognition couldn’t reach the network. Check your connection.', micError: 'The microphone couldn’t start. Please try again.' },
  ka: { placeholder: 'დაწერე შეტყობინება…', signIn: 'შესვლა', signOut: 'გასვლა', clearHistory: 'ისტორიის გასუფთავება', history: 'ისტორია', menu: 'მენიუ', settings: 'პარამეტრები', language: 'ენა', sound: 'ავატარის ხმა', genericError: 'რაღაც ხარვეზი. სცადე ხელახლა.', fileTooLarge: 'ფაილი ძალიან დიდია (მაქს. {max}MB).', fileBadType: 'არასწორი ფაილის ტიპი. გამოიყენე სურათი, ვიდეო ან აუდიო.', voiceUnsupported: 'ხმოვანი შეყვანა ამ ბრაუზერში არ მუშაობს.', listening: 'გისმენ…', micDenied: 'მიკროფონზე წვდომა დაბლოკილია. ჩართე ბრაუზერის პარამეტრებში და სცადე ხელახლა.', micNoDevice: 'მიკროფონი ვერ მოიძებნა. დააკავშირე და სცადე ხელახლა.', micNetwork: 'ხმის ამოცნობამ ქსელთან დაკავშირება ვერ შეძლო. შეამოწმე კავშირი.', micError: 'მიკროფონი ვერ ჩაირთო. გთხოვ, სცადე ხელახლა.' },
  ru: { placeholder: 'Введите сообщение…', signIn: 'Войти', signOut: 'Выйти', clearHistory: 'Очистить историю', history: 'История', menu: 'Меню', settings: 'Настройки', language: 'Язык', sound: 'Звук аватара', genericError: 'Что-то пошло не так. Попробуйте снова.', fileTooLarge: 'Файл слишком большой (макс. {max}МБ).', fileBadType: 'Неподдерживаемый тип файла. Используйте изображение, видео или аудио.', voiceUnsupported: 'Голосовой ввод не поддерживается в этом браузере.', listening: 'Слушаю…', micDenied: 'Доступ к микрофону заблокирован. Включите его в настройках браузера и попробуйте снова.', micNoDevice: 'Микрофон не найден. Подключите его и попробуйте снова.', micNetwork: 'Распознавание речи не смогло подключиться к сети. Проверьте соединение.', micError: 'Не удалось запустить микрофон. Пожалуйста, попробуйте снова.' },
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
    readAloud: 'Read aloud', pauseReading: 'Pause', via: 'via', searchChats: 'Search chats',
    noResults: 'No matching chats', emptyTitle: 'What can I create for you?',
    emptySubtitle: 'Pick a starting point, or just type below.',
    greeting: 'Hello', selectService: 'Select a service',
    workspace: 'Workspace', expand: 'Expand to workspace', details: 'Details',
    promptLabel: 'Prompt', agentLabel: 'Agent', aspectLabel: 'Aspect',
    room3d: 'Interior Design', orbitHint: 'Drag to orbit · scroll to zoom',
    dropToAnalyze: 'Drop media to analyze with MyAvatarG', working: 'is working…',
    refine: 'Refine', resetView: 'Reset', download: 'Download', expandHint: 'Expand to workspace',
    nextSteps: 'What’s next', copyLink: 'Copy link', linkCopied: 'Link copied', share: 'Share',
    diagnosticsLoading: 'Streaming from provider…', diagnosticsSlow: 'Taking longer than usual — still working',
    diagnosticsRetry: 'Connection hiccup — retrying', mediaUnavailable: 'Preview unavailable — open or download directly',
    retry: 'Retry', previewReady: 'Preview ready — opened in workspace',
    emptyAgentHint: 'ready — describe what to create below', transmit: 'Sending your prompt to {agent}…',
    filmStoryboard: 'Assembling your 30-second film', filmScene: 'Scene',
    filmStitching: 'Editor agent stitching the final cut…',
    filmStitchReady: '30-second film ready — opened in workspace',
    filmStitchFallback: 'Editor couldn’t finish the stitch — showing the first scene',
    refImagesLock: '{n}/3 reference images — identity locked across your film',
    planBalance: 'Plan & Balance', balanceLabel: 'Wallet balance', planLabel: 'Account tier',
    engineLabel: 'AI engine', engineValue: 'Gemini Core · Claude specialist',
    topUp: 'Top up', signInForBalance: 'Sign in to view your balance and add funds.',
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
    readAloud: 'ხმამაღლა წაკითხვა', pauseReading: 'პაუზა', via: '·', searchChats: 'ჩატების ძებნა',
    noResults: 'ჩატები ვერ მოიძებნა', emptyTitle: 'რა შევქმნა შენთვის?',
    emptySubtitle: 'აირჩიე დასაწყისი ან უბრალოდ დაწერე ქვემოთ.',
    greeting: 'გამარჯობა', selectService: 'აირჩიე სერვისი',
    workspace: 'სამუშაო სივრცე', expand: 'სამუშაო სივრცეში გაშლა', details: 'დეტალები',
    promptLabel: 'მოთხოვნა', agentLabel: 'აგენტი', aspectLabel: 'ფორმატი',
    room3d: 'ინტერიერის დიზაინი', orbitHint: 'გადაათრიე ბრუნვისთვის · სქროლი მასშტაბისთვის',
    dropToAnalyze: 'ჩააგდე მედია MyAvatarG-ით გასაანალიზებლად', working: 'მუშაობს…',
    refine: 'დახვეწა', resetView: 'საწყისზე', download: 'ჩამოტვირთვა', expandHint: 'სამუშაო სივრცეში გაშლა',
    nextSteps: 'შემდეგ ნაბიჯები', copyLink: 'ბმულის კოპირება', linkCopied: 'ბმული დაკოპირდა', share: 'გაზიარება',
    diagnosticsLoading: 'იტვირთება პროვაიდერიდან…', diagnosticsSlow: 'ჩვეულებრივზე მეტ დროს იღებს — მუშაობა გრძელდება',
    diagnosticsRetry: 'კავშირის შეფერხება — ხელახლა ვცდილობთ', mediaUnavailable: 'გადახედვა მიუწვდომელია — გახსენი ან ჩამოტვირთე პირდაპირ',
    retry: 'ხელახლა', previewReady: 'გადახედვა მზადაა — გაიხსნა სამუშაო სივრცეში',
    emptyAgentHint: 'მზადაა — აღწერე ქვემოთ რა შევქმნა', transmit: 'შენი მოთხოვნა იგზავნება {agent}-თან…',
    filmStoryboard: 'იქმნება შენი 30-წამიანი ფილმი', filmScene: 'სცენა',
    filmStitching: 'მონტაჟის აგენტი ასრულებს საბოლოო კადრს…',
    filmStitchReady: '30-წამიანი ფილმი მზადაა — გაიხსნა სამუშაო სივრცეში',
    filmStitchFallback: 'მონტაჟი ვერ დასრულდა — ნაჩვენებია პირველი სცენა',
    refImagesLock: '{n}/3 რეფერენს სურათი — პერსონაჟი დაფიქსირდა მთელ ფილმში',
    planBalance: 'გეგმა და ბალანსი', balanceLabel: 'საფულის ბალანსი', planLabel: 'ანგარიშის დონე',
    engineLabel: 'AI ძრავა', engineValue: 'Gemini Core · Claude სპეციალისტი',
    topUp: 'შევსება', signInForBalance: 'შედი ბალანსის სანახავად და თანხის დასამატებლად.',
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
    readAloud: 'Озвучить', pauseReading: 'Пауза', via: '·', searchChats: 'Поиск чатов',
    noResults: 'Ничего не найдено', emptyTitle: 'Что мне создать для вас?',
    emptySubtitle: 'Выберите начало или просто напишите ниже.',
    greeting: 'Привет', selectService: 'Выберите сервис',
    workspace: 'Рабочая область', expand: 'Развернуть в рабочую область', details: 'Детали',
    promptLabel: 'Запрос', agentLabel: 'Агент', aspectLabel: 'Формат',
    room3d: 'Дизайн интерьера', orbitHint: 'Перетащите для вращения · колесо для зума',
    dropToAnalyze: 'Перетащите медиа для анализа в MyAvatarG', working: 'работает…',
    refine: 'Уточнить', resetView: 'Сброс', download: 'Скачать', expandHint: 'Развернуть в рабочую область',
    nextSteps: 'Что дальше', copyLink: 'Копировать ссылку', linkCopied: 'Ссылка скопирована', share: 'Поделиться',
    diagnosticsLoading: 'Загрузка от провайдера…', diagnosticsSlow: 'Дольше обычного — всё ещё работаем',
    diagnosticsRetry: 'Сбой соединения — повторяем', mediaUnavailable: 'Предпросмотр недоступен — откройте или скачайте напрямую',
    retry: 'Повторить', previewReady: 'Превью готово — открыто в рабочей области',
    emptyAgentHint: 'готов — опишите ниже, что создать', transmit: 'Отправляю ваш запрос в {agent}…',
    filmStoryboard: 'Собираем ваш 30-секундный фильм', filmScene: 'Сцена',
    filmStitching: 'Агент монтажа собирает финальную версию…',
    filmStitchReady: '30-секундный фильм готов — открыт в рабочей области',
    filmStitchFallback: 'Монтаж не завершён — показана первая сцена',
    refImagesLock: '{n}/3 референс-изображения — личность зафиксирована во всём фильме',
    planBalance: 'Тариф и баланс', balanceLabel: 'Баланс кошелька', planLabel: 'Уровень аккаунта',
    engineLabel: 'AI-движок', engineValue: 'Gemini Core · Claude специалист',
    topUp: 'Пополнить', signInForBalance: 'Войдите, чтобы увидеть баланс и пополнить счёт.',
  },
} as const;

// PHASE 45 §4 — Autonomous agent-to-agent dialogue telemetry. These three beats
// narrate the Nano Banano → Director (LTX) → Editor (Udio + ElevenLabs) handoff
// while the film renders. Agent names are proper nouns, so the strings are shared
// verbatim across locales (not translated) to match the production blueprint exactly.
const FILM_AGENT_DIALOGUE = [
  '🧠 Nano Banano communicating 5-beat script architecture to Director Agent…',
  '🎬 Director Agent enforcing characterReference array into LTX generation…',
  '🎵 Editor Agent syncing Udio score and ElevenLabs audio master track…',
] as const;

// PHASE 46 §3 — graceful failure boundaries. When a provider leg throws a
// transient network/auth error mid-generation, the telemetry strip degrades to
// one of these honest fallback lines instead of locking the skeleton in an
// infinite spin. The pipeline itself already treats audio as optional, so the
// film still mounts — these lines just narrate the degraded path truthfully.
const FILM_AGENT_FALLBACKS = {
  audio: '⚠️ Audio agent auth failed – mounting film with local ambient soundtrack fallback…',
  clip: '⚠️ A scene render failed – Editor will assemble the remaining clips…',
  stitch: '⚠️ Editor hit a snag – mounting the first completed scene…',
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
 * Lazy-mount gate (PHASE 38 §3b — Hydration & Storage Optimization).
 *
 * Returns a ref + a latched `inView` flag that flips true the first time the
 * element nears the viewport. Used to defer decoding heavy historical media
 * (inline base64 images, videos, 3D canvases) until it's actually about to be
 * seen — so restoring a long conversation never blocks the main thread mounting
 * every asset at once. SSR / unsupported-IO environments resolve to `true`
 * immediately so nothing is ever hidden.
 */
function useInView<T extends HTMLElement>(rootMargin = '400px 0px', eager = false): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  // `eager` (PHASE 39 §1) bypasses lazy evaluation entirely — used for the
  // freshly returned asset so a just-generated MP4/PNG/3D mounts the instant the
  // token lands, never gated behind an IntersectionObserver that may not fire
  // inside the fixed/transformed chat container.
  const [inView, setInView] = useState(eager);
  useEffect(() => {
    if (inView) return undefined; // latched — stop observing once seen
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) { setInView(true); io.disconnect(); break; }
        }
      },
      { rootMargin },
    );
    io.observe(el);
    // Safety net: if the observer never reports (transformed/clipped ancestor on
    // some iOS PWA wrappers), force-resolve so a placeholder can NEVER get stuck.
    const failsafe = setTimeout(() => setInView(true), 2500);
    return () => { io.disconnect(); clearTimeout(failsafe); };
  }, [inView, rootMargin]);
  return [ref, inView];
}

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
  { id: 'interior', Icon: Box,           accent: '#10b981', label: { en: 'Interior Design', ka: 'ინტერიერის დიზაინი', ru: 'Дизайн интерьера' } },
  { id: 'voice',    Icon: Volume2,       accent: '#f59e0b', label: { en: 'Voice',     ka: 'ხმა',             ru: 'Голос' } },
] as const;
type ServiceMode = typeof MODES[number]['id'];

// PHASE 42 §2 — The flagship "30-Second Film" call-to-action. The Cyan button in
// the composer dock PRIMES the composer with this starter brief and retargets the
// video engine; it never auto-sends (no surprise paid render). The user reviews /
// edits the brief, then hits send to launch the multi-agent studio pipeline.
const FILM_FLAGSHIP = {
  title:   { en: '30-Second Film',           ka: '30-წამიანი ფილმი',         ru: '30-секундный фильм' },
  tagline: { en: 'Full AI studio · one prompt', ka: 'სრული AI სტუდია · ერთი ბრძანება', ru: 'Полная AI-студия · один запрос' },
  starter: {
    en: 'Make a 30-second film of my avatar in cyberpunk Tokyo — cinematic, neon-lit, with a cohesive score.',
    ka: 'შექმენი ჩემი ავატარის 30-წამიანი ფილმი კიბერპანკ ტოკიოში — კინემატოგრაფიული, ნეონის შუქით, ერთიანი მუსიკით.',
    ru: 'Сделай 30-секундный фильм с моим аватаром в киберпанк-Токио — кинематографично, неоновый свет, цельный саундтрек.',
  },
} as const;

// Modes that dispatch a media-generation engine (vs. plain text chat / voice).
// Drives the PHASE 39 §3 transmission micro-toast so the user always sees a
// render request leave the composer.
const GENERATION_MODES = new Set<ServiceMode>(['image', 'video', 'avatar', 'interior', 'music']);

/* PHASE 53 §5 — Smart contextual file uploads ("blind sensing"). When an asset
 * is transmitted with an EMPTY prompt box, the user bubble shows just the image,
 * but the orchestrator is handed this localized instruction so the primary Gemini
 * core intercepts the action, parses the file's visual/metadata context, and
 * returns an intuitive conversational question (instead of failing inert). */
const CONTEXTUAL_FILE_PROMPT: Record<'en' | 'ka' | 'ru', string> = {
  en: 'I have attached a file without any instructions. Briefly describe what you see, then ask me one concise question about what I would like to do with it.',
  ka: 'ფაილი ავტვირთე ინსტრუქციის გარეშე. მოკლედ აღწერე რას ხედავ და დამისვი ერთი ლაკონური შეკითხვა, თუ რისი გაკეთება მსურს მასთან დაკავშირებით.',
  ru: 'Я прикрепил файл без инструкций. Кратко опиши, что видишь, и задай один лаконичный вопрос о том, что я хочу с ним сделать.',
};

/* PHASE 39 §3 — The 4 legacy "middle template" capability cards (CAPABILITY_CARDS)
 * and their applyCapabilityCard handler were completely removed. The empty state
 * now renders a clean minimalist greeting pill synced to the composer's active
 * agent/mode (see the empty-state block below). */

/**
 * Multi-agent identity registry — maps a service mode to the specialized
 * sub-agent that handles it. Drives the "Agent presence" indicator, the
 * composer's agent-theme border, and the @-mention router. Codenames echo the
 * mandate's voice ("Agent N: Interior Designer", "Agent K: Cinematic Orchestrator").
 */
const AGENTS: Record<ServiceMode, {
  codename: string;
  color: string;
  Icon: typeof MessageSquare;
  name: { en: string; ka: string; ru: string };
}> = {
  global:   { codename: 'G', color: '#22d3ee', Icon: MessageSquare, name: { en: 'General Concierge',      ka: 'ზოგადი კონსიერჟი',     ru: 'Главный консьерж' } },
  image:    { codename: 'I', color: '#34d399', Icon: ImagePlus,     name: { en: 'Image Synthesist',        ka: 'სურათის სინთეზატორი',  ru: 'Синтезатор изображений' } },
  video:    { codename: 'K', color: '#38bdf8', Icon: Film,          name: { en: 'Cinematic Orchestrator',  ka: 'კინო-ორკესტრატორი',    ru: 'Кинематографический оркестратор' } },
  music:    { codename: 'M', color: '#f472b6', Icon: Music,         name: { en: 'Music Composer',          ka: 'მუსიკის კომპოზიტორი',  ru: 'Музыкальный композитор' } },
  avatar:   { codename: 'A', color: '#818cf8', Icon: User,          name: { en: 'Avatar Director',         ka: 'ავატარის რეჟისორი',    ru: 'Режиссёр аватаров' } },
  interior: { codename: 'N', color: '#10b981', Icon: Box,           name: { en: 'Interior Designer',       ka: 'ინტერიერის დიზაინერი', ru: 'Дизайнер интерьера' } },
  voice:    { codename: 'V', color: '#f59e0b', Icon: Volume2,       name: { en: 'Voice Synthesist',        ka: 'ხმის სინთეზატორი',     ru: 'Синтезатор голоса' } },
};

/**
 * @-mention → service-mode router. Typing e.g. "@interior", "@film", "@avatar"
 * at the start of the composer instantly retargets the orchestrator engine.
 */
const AGENT_MENTIONS: Record<string, ServiceMode> = {
  chat: 'global', general: 'global',
  image: 'image', img: 'image', photo: 'image',
  film: 'video', video: 'video', cinema: 'video',
  music: 'music', song: 'music', audio: 'music',
  avatar: 'avatar', face: 'avatar',
  interior: 'interior', room: 'interior', '3d': 'interior',
  voice: 'voice', tts: 'voice', speak: 'voice',
};

/** Detect a leading "@mention" token and resolve it to a service mode (or null). */
function detectAgentMention(text: string): ServiceMode | null {
  const m = /^\s*@([a-z0-9]+)/i.exec(text);
  if (!m || !m[1]) return null;
  return AGENT_MENTIONS[m[1].toLowerCase()] ?? null;
}

/**
 * Contextual refinement chips shown under a finished media output. Clicking a
 * chip primes the composer with the instruction (it does NOT auto-send — the
 * user reviews and presses send, so no render is ever billed by surprise).
 */
const REFINEMENTS: Partial<Record<ServiceMode, { en: string; ka: string; ru: string }[]>> = {
  image: [
    { en: 'Make it more photorealistic', ka: 'უფრო ფოტორეალისტური გახადე', ru: 'Сделай более фотореалистичным' },
    { en: 'Brighter, warmer lighting', ka: 'უფრო კაშკაშა, თბილი განათება', ru: 'Ярче, тёплый свет' },
    { en: 'Try a different angle', ka: 'სხვა რაკურსი სცადე', ru: 'Попробуй другой ракурс' },
  ],
  video: [
    { en: 'Extend the video by 5 seconds', ka: 'გააგრძელე ვიდეო 5 წამით', ru: 'Продли видео на 5 секунд' },
    { en: 'Make the lighting warmer', ka: 'განათება უფრო თბილი გახადე', ru: 'Сделай освещение теплее' },
    { en: 'Add a slow-motion moment', ka: 'დაამატე ნელი მოძრაობის მომენტი', ru: 'Добавь момент слоу-мо' },
  ],
  avatar: [
    { en: 'Warmer studio lighting', ka: 'უფრო თბილი სტუდიური განათება', ru: 'Тёплый студийный свет' },
    { en: 'Closer, tighter framing', ka: 'უფრო ახლო კადრირება', ru: 'Более крупный план' },
    { en: 'Change the outfit', ka: 'შეცვალე სამოსი', ru: 'Смени наряд' },
  ],
  interior: [
    { en: 'Warmer lighting', ka: 'უფრო თბილი განათება', ru: 'Тёплое освещение' },
    { en: 'Add more plants', ka: 'დაამატე მეტი მცენარე', ru: 'Добавь больше растений' },
    { en: 'Try Scandinavian style', ka: 'სცადე სკანდინავიური სტილი', ru: 'Попробуй скандинавский стиль' },
  ],
  music: [
    { en: 'Slower tempo', ka: 'უფრო ნელი ტემპი', ru: 'Медленнее темп' },
    { en: 'Add drums', ka: 'დაამატე დასარტყამები', ru: 'Добавь барабаны' },
    { en: 'More upbeat mood', ka: 'უფრო ენერგიული განწყობა', ru: 'Более бодрое настроение' },
  ],
  voice: [
    { en: 'Change the voice profile', ka: 'შეცვალე ხმის პროფილი', ru: 'Смени профиль голоса' },
    { en: 'Slower pace', ka: 'უფრო ნელი ტემპი', ru: 'Медленнее темп' },
    { en: 'More expressive delivery', ka: 'უფრო ექსპრესიული კითხვა', ru: 'Более выразительно' },
  ],
};

/**
 * Dynamic Quick-Followups (PHASE 38 §1b). At the end of a complete generation
 * cycle we surface three output-aware "what's next" actions under the latest
 * media result. Unlike REFINEMENTS (which tweak the *same* output), these are
 * next-step transformations — and several cross into a different agent. When a
 * chip carries `mode`, picking it retargets the engine (so the @-mention router
 * + Smart Adaptive Context Memory carry the prior creative direction forward).
 * Like every chip in this app, they PRIME the composer and NEVER auto-send, so
 * no paid render is ever billed without the user's explicit confirmation.
 */
type Followup = { en: string; ka: string; ru: string; mode?: ServiceMode };
const FOLLOWUPS: Partial<Record<ServiceMode, Followup[]>> = {
  image: [
    { en: 'Upscale to 4K', ka: 'გაადიდე 4K-მდე', ru: 'Апскейл до 4K' },
    { en: 'Animate this into a 5-second video', ka: 'აქციე ეს 5-წამიან ვიდეოდ', ru: 'Оживи это в 5-секундное видео', mode: 'video' },
    { en: 'Create three variations', ka: 'შექმენი სამი ვარიაცია', ru: 'Создай три вариации' },
  ],
  video: [
    { en: 'Upscale to 4K', ka: 'გაადიდე 4K-მდე', ru: 'Апскейл до 4K' },
    { en: 'Regenerate with orchestral audio', ka: 'ხელახლა შექმენი ორკესტრის მუსიკით', ru: 'Перегенерируй с оркестровым аудио' },
    { en: 'Extract keyframes as images', ka: 'ამოიღე საკვანძო კადრები სურათებად', ru: 'Извлеки ключевые кадры как изображения', mode: 'image' },
  ],
  avatar: [
    { en: 'Upscale to 4K', ka: 'გაადიდე 4K-მდე', ru: 'Апскейл до 4K' },
    { en: 'Give the avatar a spoken intro', ka: 'დაამატე ავატარს ნათქვამი ინტრო', ru: 'Добавь аватару озвученное интро', mode: 'voice' },
    { en: 'Try a cinematic camera move', ka: 'სცადე კინემატოგრაფიული კამერა', ru: 'Попробуй кинематографичное движение камеры' },
  ],
  interior: [
    { en: 'Render a night-time version', ka: 'დააგენერირე ღამის ვერსია', ru: 'Сделай ночную версию' },
    { en: 'Generate a 3D walkthrough video', ka: 'შექმენი 3D ვიდეო-ტური', ru: 'Сгенерируй видео-обход в 3D', mode: 'video' },
    { en: 'Produce a styling shopping list', ka: 'შეადგინე ნივთების სია', ru: 'Составь список для покупок', mode: 'global' },
  ],
  music: [
    { en: 'Extend the track by 30 seconds', ka: 'გააგრძელე ტრეკი 30 წამით', ru: 'Продли трек на 30 секунд' },
    { en: 'Create a matching music video', ka: 'შექმენი შესაბამისი მუსიკალური ვიდეო', ru: 'Создай подходящий клип', mode: 'video' },
    { en: 'Export an instrumental mix', ka: 'შექმენი ინსტრუმენტული მიქსი', ru: 'Экспортируй инструментал' },
  ],
  voice: [
    { en: 'Try a different voice profile', ka: 'სცადე სხვა ხმის პროფილი', ru: 'Попробуй другой голос' },
    { en: 'Generate a talking avatar', ka: 'შექმენი მოლაპარაკე ავატარი', ru: 'Создай говорящего аватара', mode: 'avatar' },
    { en: 'Add background music', ka: 'დაამატე ფონური მუსიკა', ru: 'Добавь фоновую музыку', mode: 'music' },
  ],
};

/* ─── Live orchestration telemetry (driven by real backend status) ───────────
 * /api/chat/orchestrate returns a single JSON response; async media generation
 * carries a `predictionId` + `predictionStatus` (Replicate-style) that the
 * client re-POSTs to poll. The composite music-video pipeline additionally
 * reports genuine per-leg states under metadata.legs. The telemetry UI below
 * is bound strictly to these real fields — never to timers. */

type LegStatus = 'pending' | 'succeeded' | 'failed' | 'skipped';

// PHASE 42 §1/§4 — the 30-second-film production matrix surfaced by the server
// film composite (lib/chat/filmComposite.ts). Drives the progressive agent
// timeline (Storyboard → 5 clips → Stitch → Audio → Finalize).
type FilmLegStatus = 'pending' | 'queued' | 'succeeded' | 'failed' | 'skipped';
interface FilmClipMeta {
  ordinal: number;
  status: FilmLegStatus;
  /** PHASE 43 §1 — resolved clip URL once the leg lands (drives the skeleton). */
  url?: string | null;
  /** PHASE 43 §3 — dispatch attempts; >1 means the master agent retried it. */
  attempts?: number;
}
interface FilmMeta {
  sceneCount: number;
  seed: number;
  storyboard: FilmLegStatus;
  clips: FilmClipMeta[];
  stitch: FilmLegStatus;
  audio: FilmLegStatus;
  /** PHASE 43 §1 — cohesive score URL once Udio lands. */
  audioUrl?: string | null;
  /** PHASE 43 §1/§4 — true when every clip has landed and the editor can stitch. */
  readyToStitch?: boolean;
  /** PHASE 47 §1 — key for the storage-backed unified status tracker
   *  (GET /api/video/status/[tokenId]); lets the finished master survive a reload. */
  statusTokenId?: string;
}

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
    // PHASE 40 §1 — LTX now ships a synchronized native audio track; this flag
    // lets the telemetry surface a real "audio synthesis" stage instead of
    // marking it skipped on single-prediction video jobs.
    audioEnabled?: boolean;
    // PHASE 42 §1/§4 — full 30-second-film production matrix (multi-agent).
    film?: FilmMeta;
    [k: string]: unknown;
  };
  error?: string;
}

type StageState = 'pending' | 'active' | 'done' | 'failed' | 'skipped';
interface PipelineStage {
  // 'analysis' | 'audio' | 'render' for standard jobs; widened to string so the
  // 30-second-film pipeline can emit per-clip stage keys (storyboard, clip_N…).
  key: string;
  label: { en: string; ka: string; ru: string };
  state: StageState;
  // PHASE 47 §2 — per-clip cinematic preview hints (film pipeline only). When a
  // clip leg lands, `previewUrl` carries its playable URL so the storyboard slot
  // shows live native playback instead of a static glyph; `recovered` marks a
  // leg the master agent retried, so the slot can blend in a seamless filter
  // rather than expose an abrupt cut.
  previewUrl?: string | null;
  recovered?: boolean;
}
interface PipelineState { active: boolean; stages: PipelineStage[] }

// Narrow literal keys (not PipelineStage['key'], which is widened to string for
// the film pipeline) so property access stays non-optional under
// noUncheckedIndexedAccess.
const STAGE_LABELS: Record<'analysis' | 'audio' | 'render', PipelineStage['label']> = {
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

/**
 * Map a single film leg's backend status to a telemetry StageState.
 * `terminal`/`failed` reflect the primary tracker (first clip) so that legs the
 * backend reports as still-queued surface as 'active' while the job is live, and
 * resolve to done/failed once the tracked prediction reaches a terminal state.
 */
function filmLegToStage(s: FilmLegStatus | undefined, terminal: boolean, failed: boolean): StageState {
  if (s === 'succeeded') return 'done';
  if (s === 'failed') return 'failed';
  if (s === 'skipped') return 'skipped';
  if (failed) return 'failed';
  if (terminal) return 'done';
  // 'queued' | 'pending' (or unknown) while the pipeline is still running.
  return 'active';
}

/**
 * PHASE 42 §4 — Progressive agentic transparency for the 30-second film studio.
 * Expands the real `metadata.film` production matrix into the per-agent timeline
 * the user watches: Storyboard → Clip 1…N (character consistency) → Stitch →
 * Score. Labels are inlined (trilingual) so the client never imports the
 * server-only film pipeline module.
 */
function deriveFilmStages(film: FilmMeta, terminal: boolean, failed: boolean): PipelineState {
  const stages: PipelineStage[] = [];

  stages.push({
    key: 'storyboard',
    label: {
      en: 'Storyboard Agent — scene breakdown',
      ka: 'სცენარის აგენტი — სცენების დაყოფა',
      ru: 'Агент раскадровки — разбивка сцен',
    },
    state: filmLegToStage(film.storyboard, terminal, failed),
  });

  const clips = [...(film.clips || [])].sort((a, b) => a.ordinal - b.ordinal);
  const total = film.sceneCount || clips.length;
  for (const clip of clips) {
    const stageState = filmLegToStage(clip.status, terminal, failed);
    // PHASE 43 §3 — when the master agent retried this leg, surface it subtly
    // ("Retrying scene N…") instead of alarming the user with a hard failure.
    const retrying = (clip.attempts ?? 1) > 1 && (stageState === 'active' || stageState === 'failed');
    const label = retrying
      ? {
          en: `Retrying scene ${clip.ordinal} of ${total}…`,
          ka: `სცენა ${clip.ordinal}/${total} ხელახლა…`,
          ru: `Повтор сцены ${clip.ordinal} из ${total}…`,
        }
      : {
          en: `Rendering clip ${clip.ordinal} of ${total} — character consistency`,
          ka: `კლიპი ${clip.ordinal}/${total} — პერსონაჟის თანმიმდევრულობა`,
          ru: `Клип ${clip.ordinal} из ${total} — консистентность персонажа`,
        };
    // PHASE 47 §2 — pass the landed clip URL + retry flag to the storyboard slot
    // so it can mount live native playback and blend recovered scenes seamlessly.
    stages.push({
      key: `clip_${clip.ordinal}`,
      label,
      state: stageState,
      previewUrl: clip.url ?? null,
      recovered: (clip.attempts ?? 1) > 1,
    });
  }

  stages.push({
    key: 'stitch',
    label: {
      en: 'Editor Agent — stitching final cut',
      ka: 'მონტაჟის აგენტი — საბოლოო კადრის აწყობა',
      ru: 'Агент монтажа — сборка финальной версии',
    },
    state: filmLegToStage(film.stitch, terminal, failed),
  });

  stages.push({
    key: 'film_audio',
    label: {
      en: 'Audio & Foley Agent — scoring the film',
      ka: 'აუდიო აგენტი — ფილმის გახმოვანება',
      ru: 'Аудио-агент — озвучивание фильма',
    },
    state: filmLegToStage(film.audio, terminal, failed),
  });

  return { active: !terminal, stages };
}

/**
 * PHASE 43 §4 — telemetry for the brief window where the Union Poll has resolved
 * every clip and the client is driving the real /api/video/assemble stitch. All
 * render legs read done; the Editor (stitch) stage pulses active until the master
 * lands, then the workspace swaps in the finished film.
 */
function deriveFilmStitching(resp: OrchestrateResponse): PipelineState {
  const film = resp.metadata?.film;
  if (!film) return derivePipeline(resp);
  const stitching: FilmMeta = {
    ...film,
    storyboard: 'succeeded',
    clips: film.clips.map((c) => ({ ...c, status: c.status === 'skipped' ? 'skipped' : 'succeeded' })),
    stitch: 'queued',
    audio: film.audio === 'skipped' ? 'skipped' : 'succeeded',
  };
  // terminal=false so the 'queued' stitch leg resolves to an 'active' stage.
  return deriveFilmStages(stitching, false, false);
}

/**
 * PHASE 43 §4 — Editor Agent dispatch. Hands the landed clip URLs (+ cohesive
 * score) to the authenticated /api/video/assemble endpoint, which stitches the
 * final audio-synced 30s master (GPU RunPod when provisioned, else CPU ffmpeg).
 * Returns the master URL, or null when the editor couldn't finish (caller falls
 * back to the first-scene preview). Credentials ride the browser session.
 */
async function assembleFilm(
  clipUrls: string[],
  musicUrl: string | null,
  signal?: AbortSignal,
  statusTokenId?: string,
  scorePrompt?: string | null,
): Promise<string | null> {
  const res = await fetch('/api/video/assemble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({
      segments: clipUrls.map((url) => ({ url, durationSec: 6 })),
      ...(musicUrl ? { musicUrl } : {}),
      // PHASE 55 §2 — when the Udio score is missing (musicUrl null), the route
      // composes a MusicGen fallback; pass the brief so it matches the film mood.
      ...(scorePrompt && scorePrompt.trim() ? { scorePrompt: scorePrompt.trim() } : {}),
      // PHASE 47 §1 — let the route stamp the finished master onto the unified
      // status tracker so a reload / second device can recover it.
      ...(statusTokenId ? { filmTokenId: statusTokenId } : {}),
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { url?: unknown } | null;
  return json && typeof json.url === 'string' && json.url.length > 0 ? json.url : null;
}

/**
 * PHASE 47 §1 — Recover an already-assembled master from the storage-backed
 * tracker. A reload or second device that re-enters a film whose render finished
 * elsewhere can mount the playable 30s master without re-driving the pipeline.
 * Returns the hosted master URL when the tracker reports phase 'assembled'.
 */
async function fetchAssembledMaster(statusTokenId: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`/api/video/status/${encodeURIComponent(statusTokenId)}`, {
      method: 'GET',
      credentials: 'include',
      signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { phase?: unknown; masterUrl?: unknown } | null;
    if (json && json.phase === 'assembled' && typeof json.masterUrl === 'string' && json.masterUrl.length > 0) {
      return json.masterUrl;
    }
    return null;
  } catch {
    return null;
  }
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

  // PHASE 42 §4 — the 30-second film studio publishes a full production matrix;
  // surface the per-agent timeline instead of the generic 3-stage pipeline.
  if (resp.metadata?.film) return deriveFilmStages(resp.metadata.film, terminal, failed);

  // Analysis completes the moment the backend accepts the request.
  const analysis: StageState = 'done';

  let audio: StageState;
  let render: StageState;

  if (legs) {
    // Composite music-video pipeline: bind to genuine per-leg status.
    audio = legToStage(legs.music?.status);
    render = legToStage(legs.video?.status);
  } else if (resp.metadata?.audioEnabled && resp.responseType === 'video') {
    // PHASE 40 §1 — single LTX video job with a native synchronized audio track.
    // Surface a real audio-synthesis stage that completes alongside the render
    // (LTX muxes audio in-pipeline, so the two finish together).
    render = failed ? 'failed' : terminal ? 'done' : 'active';
    audio = render;
  } else {
    // Single async prediction with no audio track: no separate audio leg.
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

/**
 * PHASE 49 §4 — Map a Web Speech API error code to a clear, localized notice.
 *
 * The mic previously failed SILENTLY: `onerror` only flipped the recording flag
 * off, so a blocked-permission or no-device handshake looked identical to "the
 * user said nothing" — the exact "mic fails to register audio" live symptom.
 * Returns `null` for benign codes ('no-speech'/'aborted') so we don't nag the
 * user when they simply paused or tapped stop.
 */
function sttErrorMessage(
  code: string | undefined,
  copy: { micDenied: string; micNoDevice: string; micNetwork: string; micError: string },
): string | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return copy.micDenied;
    case 'audio-capture':
      return copy.micNoDevice;
    case 'network':
      return copy.micNetwork;
    case 'no-speech':
    case 'aborted':
      return null;
    default:
      return copy.micError;
  }
}

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
  // Artifacts/Canvas split-pane: the message whose asset is mounted in the
  // right-hand Preview Workspace (null = single-column chat). Kept mounted while
  // switching artifacts so the panel slides/swaps without an unmount flash.
  const [workspace, setWorkspace] = useState<ChatMessage | null>(null);
  const [balanceGel, setBalanceGel] = useState<number | null>(null);
  // PHASE 53 §2 — the account tier (plan_id from /api/billing/credits), surfaced
  // read-only in Settings → Plan & Balance.
  const [planId, setPlanId] = useState<string | null>(null);
  const [mode, setMode] = useState<ServiceMode>('global');
  // PHASE 52 TASK 3 — the service-vector pill row is consolidated into a single
  // Gemini-style selection dropdown. This drives its open/collapsed state.
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  // PHASE 52 TASK 2 — honor reduced-motion for the clean-canvas greeting fade.
  const prefersReducedMotion = useReducedMotion();
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
  // Real-time history search (filters conversation titles in the sidebar).
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Set when a ⌘/Ctrl+K shortcut opens the drawer so the search field can grab
  // focus once it mounts (see the historyOpen effect below).
  const focusSearchRef = useRef(false);
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

  // PHASE 49 §4 — keep the mic-error handler current (locale-aware) for the
  // once-created SpeechRecognition instance. Benign codes resolve to null and
  // raise no notice; real handshake failures surface a clear localized message.
  useEffect(() => {
    sttErrorRef.current = (code?: string) => {
      const msg = sttErrorMessage(code, copy);
      if (msg) showNotice(msg);
    };
  }, [copy, showNotice]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlsRef = useRef<string[]>([]);        // object-URLs to revoke on unmount
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTranscriptRef = useRef('');           // input text snapshot at mic-start
  const [speechSupported, setSpeechSupported] = useState(false);
  // PHASE 49 §4 — the SpeechRecognition instance is created once in a []-deps
  // effect, so its onerror callback would close over a STALE locale/notice. We
  // route errors through this ref (kept current by the effect below) so the mic
  // failure surfaces a fresh, correctly-localized notice instead of dying mute.
  const sttErrorRef = useRef<(code?: string) => void>(() => {});
  const stageRef = useRef<HTMLDivElement>(null);          // drag-constraints boundary
  const cornerVideoRef = useRef<HTMLVideoElement>(null);  // ambient corner loop
  const fullVideoRef = useRef<HTMLVideoElement>(null);    // expanded 9:16 preview
  const avatarDraggedRef = useRef(false);                 // distinguishes drag from tap
  // Conversation ids we've already attempted auto-titling for. Seeded on
  // hydration with every restored conversation so a RESTORE never re-bills the
  // title endpoint — only chats minted in this session are eligible.
  const titledRef = useRef<Set<string>>(new Set());
  // PHASE 50 §3 — image-to-video anchor. When the user taps "Turn this into a
  // video" under an image card, the source image's hosted URL is parked here and
  // forwarded on the NEXT send as a hard LTX image_reference, so the Video Agent
  // animates the actual image instead of writing a fresh prompt from scratch.
  // Consumed (and cleared) by sendMessage; cleared on new/restore chat.
  const pendingVideoSourceRef = useRef<string | null>(null);

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
    const loaded = loadConversations();
    setConversations(loaded);
    setPrefs(loadPreferences());
    // Mark every restored conversation as already-titled so opening an old
    // chat never re-triggers (or re-bills) the title endpoint.
    loaded.forEach((c) => titledRef.current.add(c.id));
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

  // ── Incremental auto-title (Tier-1 LLM) ────────────────────────────
  // Once a NEW chat has its first user prompt, async-call the fast LLM tier for
  // a clean ≤4-word title and swap it into the sidebar — but only if the user
  // hasn't manually renamed it (we apply the result only while the stored title
  // still equals the deterministic placeholder). Runs once per conversation;
  // restored chats are pre-seeded into titledRef so they're skipped entirely.
  useEffect(() => {
    const firstUser = messages.find((m) => m.role === 'user');
    const prompt = firstUser?.text.trim();
    if (!prompt || titledRef.current.has(conversationId)) return;
    titledRef.current.add(conversationId);
    const id = conversationId;
    const ctrl = new AbortController();
    void generateConversationTitle(prompt, lang, ctrl.signal).then((title) => {
      if (!title) return;
      const existing = getConversation(id);
      // Only adopt the generated title if it would replace the auto-derived
      // placeholder — never clobber a manual rename.
      if (!existing || existing.title !== deriveTitle(prompt)) return;
      setConversations(renameConversation(id, title));
    });
    return () => ctrl.abort();
  }, [messages, conversationId, lang]);

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
    rec.onerror = (e) => {
      // Stop the recording UI AND surface a clear, localized reason (permission
      // blocked / no device / network) instead of failing silently.
      dispatch({ type: 'SET_RECORDING', value: false });
      sttErrorRef.current?.(e?.error);
    };
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
      .then((j: { balance?: number; plan_id?: string } | null) => {
        if (!alive || !j) return;
        if (typeof j.balance === 'number') setBalanceGel(j.balance);
        if (typeof j.plan_id === 'string') setPlanId(j.plan_id);
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
    if (isLoading) return;
    const rawText = (overrideText ?? inputText).trim();
    const hasAttachment = attachments.length > 0;

    // PHASE 53 §5 — a send is valid with EITHER typed text OR an attachment.
    // Voice (ხმა) is pure TTS, so it always needs text to read aloud.
    if (!rawText && !hasAttachment) return;
    if (mode === 'voice' && !rawText) return;

    // PHASE 53 §5 — "blind sensing": the user bubble shows whatever they actually
    // typed (`displayText`, may be empty for an image-only send), but the
    // orchestrator receives a localized "describe + ask me a question" instruction
    // whenever the prompt box was empty so the Gemini core parses the asset and
    // replies conversationally instead of stalling on an empty message.
    const displayText = rawText;
    const text = rawText || CONTEXTUAL_FILE_PROMPT[lang];

    // Image attachment → orchestrator `imageUrl` (it accepts data: URLs directly,
    // see providerRouter.loadImageAsDataUrl). This is what drives the image-edit /
    // interior (ოთახის 3D) / photo→avatar pipelines.
    const imageAttachment = attachments.find((a) => a.type === 'image' && (a.dataUrl || a.preview));
    const imageUrl = imageAttachment?.dataUrl || imageAttachment?.preview;

    // PHASE 45 §2/§3 — multimodal identity lock. Collect up to THREE image
    // attachments and forward them as `referenceImages`; the film pipeline maps
    // them into the LTX character-reference / IP-Adapter array so the protagonist
    // stays identical across all 5 clips. (imageUrl above remains the single-image
    // path for image-edit / interior / photo→avatar.)
    const referenceImages = attachments
      .filter((a) => a.type === 'image')
      .map((a) => a.dataUrl || a.preview)
      .filter((u): u is string => typeof u === 'string' && u.length > 0)
      .slice(0, 3);

    dispatch({ type: 'ADD_MESSAGE', message: {
      id: `u_${Date.now()}`,
      role: 'user',
      text: displayText,
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

      // Smart Adaptive Context Memory — when the user has pivoted to a different
      // creative agent (e.g. @Interior → @Film), carry the prior output's
      // creative direction forward so palettes / aesthetics survive the switch
      // without re-typing. Tolerant extra field (backend may use or ignore it).
      const carryContext = deriveCarryContext(messages, mode);

      // PHASE 39 §3 — End-to-End Visual State Verification. Surface a visible
      // micro-toast the moment we transmit prompt parameters to a generation
      // engine, so the user always SEES the request leave (e.g. avatar engine).
      if (GENERATION_MODES.has(mode)) {
        showNotice(xc.transmit.replace('{agent}', AGENTS[mode].name[lang]));
      }

      // PHASE 50 §3 — consume the image-to-video anchor (set when the user tapped
      // "Turn this into a video" under an image card). Forwarded via selectedOptions
      // — NOT imageUrl — so it binds as a hard LTX image_reference WITHOUT diverting
      // the request into the Gemini image-analysis path. One-shot: cleared on read.
      const videoAnchorUrl = mode === 'video' ? pendingVideoSourceRef.current : null;
      pendingVideoSourceRef.current = null;

      let resp = await postOrchestrate({
        message: text,
        sessionId: conversationId,
        serviceContext: mode,
        locale: lang,
        history,
        ...(imageUrl ? { imageUrl } : {}),
        ...(referenceImages.length ? { referenceImages } : {}),
        ...(videoAnchorUrl ? { selectedOptions: { image_reference: videoAnchorUrl } } : {}),
        ...(carryContext ? { carryContext } : {}),
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

      // PHASE 43 §4 — Editor Agent. Once the Union Poll confirms every clip has
      // landed (`readyToStitch`), assemble the ordered clips + cohesive score
      // into the fully stitched + audio-synced 30s master via /api/video/assemble
      // (the authenticated, credit-metered stitch). The master replaces the
      // preview-clip URL so the workspace mounts the finished film, not scene 1.
      const film = resp.metadata?.film;
      if (film?.readyToStitch && resp.predictionStatus === 'succeeded') {
        const clipUrls = [...(film.clips || [])]
          .sort((a, b) => a.ordinal - b.ordinal)
          .map((c) => c.url)
          .filter((u): u is string => typeof u === 'string' && u.length > 0);
        if (clipUrls.length >= 2) {
          setPipeline(deriveFilmStitching(resp));
          showNotice(xc.filmStitching);
          const statusTokenId = film.statusTokenId;
          try {
            // PHASE 47 §1 — if this film was already assembled (e.g. on another
            // device / before a reload), recover the hosted master from the
            // storage-backed tracker instead of paying to stitch it again.
            const recovered = statusTokenId ? await fetchAssembledMaster(statusTokenId, signal) : null;
            const masterUrl = recovered ?? (await assembleFilm(clipUrls, film.audioUrl ?? null, signal, statusTokenId, text));
            if (masterUrl) {
              resp = { ...resp, assetUrl: masterUrl, message: resp.message };
            } else {
              showNotice(xc.filmStitchFallback);
            }
          } catch (stitchErr) {
            if (stitchErr instanceof Error && stitchErr.name === 'AbortError') throw stitchErr;
            showNotice(xc.filmStitchFallback);
          }
        }
      }

      // PHASE 57 hotfix — derive the renderable kind defensively. `responseType`
      // is authoritative when it names a media kind, but a service that returns
      // an asset URL under a non-media responseType must STILL show a preview, so
      // we sniff the URL (and finally the composer mode) as fallbacks. Without
      // this, any such turn silently dropped to a text-only bubble — the
      // "no service shows a preview" regression.
      const assetType: ChatMessage['assetType'] = resolveAssetType(
        resp.responseType,
        resp.assetUrl,
        mode,
      );

      const assistantMessage: ChatMessage = {
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
      };
      dispatch({ type: 'ADD_MESSAGE', message: assistantMessage });

      // PHASE 39 §1 — Auto-Mount on Success. The instant a visual asset
      // (PNG / MP4 / interactive 3D room) lands, slide the Preview Workspace open
      // and inject the resolved URL directly into its canvas — no user download
      // action is ever required to initialize the viewer.
      if (
        assistantMessage.role === 'assistant'
        && assistantMessage.assetUrl
        && (assetType === 'image' || assetType === 'video')
      ) {
        setWorkspace(assistantMessage);
        showNotice(xc.previewReady);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // user cancelled; keep prior messages
      } else {
        // Intelligent Error Resilience — translate raw provider/auth faults into
        // a friendly, localized troubleshooting prompt (the transient retry
        // already happened silently inside postOrchestrate).
        const friendly = classifyChatError(err, lang, err instanceof Error ? err.message : undefined);
        dispatch({ type: 'ADD_MESSAGE', message: {
          id: `e_${Date.now()}`,
          role: 'error',
          text: friendly.message || copy.genericError,
          timestamp: Date.now(),
        }});
      }
    } finally {
      dispatch({ type: 'SET_LOADING', value: false });
      setPipeline(null);
      abortRef.current = null;
    }
  }, [inputText, isLoading, messages, lang, mode, attachments, conversationId, prefs.customInstructions, copy.genericError, showNotice, xc]);

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

  // Open / swap the Preview Workspace for a given message's asset. Setting state
  // (rather than remounting) lets the panel repopulate instantly with no flash.
  const openWorkspace = useCallback((m: ChatMessage) => {
    if (!m.assetUrl) return;
    setWorkspace(m);
  }, []);
  const closeWorkspace = useCallback(() => setWorkspace(null), []);

  // Refinement chip → prime the composer with a follow-up instruction (mode kept,
  // focus moved to composer). Deliberately does NOT auto-send to avoid billing a
  // render the user didn't explicitly confirm.
  const applyRefinement = useCallback((instruction: string) => {
    editPrompt(instruction);
  }, [editPrompt]);

  // Dynamic Quick-Followup → prime the composer with a next-step action. If the
  // chip targets a different agent (e.g. image → @Film), retarget the mode first
  // so the engine + Smart Adaptive Context Memory carry the prior creative
  // direction forward. Still PRIMES only (never auto-sends) — no surprise spend.
  const applyFollowup = useCallback((instruction: string, nextMode?: ServiceMode, sourceImageUrl?: string) => {
    if (nextMode) setMode(nextMode);
    // PHASE 50 §3 — "Turn this into a video" carries the originating image's
    // hosted URL forward as the image-to-video anchor (only a real http(s) URL is
    // usable server-side; data:/blob: previews are dropped). Picking any other
    // chip clears a stale anchor so it never leaks onto an unrelated render.
    pendingVideoSourceRef.current =
      nextMode === 'video' && typeof sourceImageUrl === 'string' && /^https?:\/\//i.test(sourceImageUrl)
        ? sourceImageUrl
        : null;
    editPrompt(instruction);
  }, [editPrompt]);

  // PHASE 42 §2 — Flagship "30-Second Film" CTA. Retargets the video engine and
  // primes the composer with the starter brief so the user can personalise it
  // (swap the avatar, scene, mood) before launching the multi-agent studio. Like
  // every chip in the app it PRIMES only — never auto-sends a paid render.
  const startFilmFlagship = useCallback(() => {
    setMode('video');
    editPrompt(FILM_FLAGSHIP.starter[lang]);
  }, [editPrompt, lang]);

  // Composer input handler with inline "@mention" agent routing. Typing e.g.
  // "@interior" / "@film" / "@avatar" at the start instantly retargets the
  // orchestrator engine (and re-themes the composer border) while leaving the
  // text intact so the user keeps typing their prompt after the mention.
  const onComposerInput = useCallback((text: string) => {
    dispatch({ type: 'SET_INPUT', text });
    const mention = detectAgentMention(text);
    if (mention) setMode((prev) => (prev === mention ? prev : mention));
  }, []);

  // ── Conversation lifecycle (sidebar: new / restore / rename / delete) ──
  const startNewChat = useCallback(() => {
    abortRef.current?.abort();
    pendingVideoSourceRef.current = null; // PHASE 50 §3 — drop any unused anchor
    setConversationId(newSessionId());
    dispatch({ type: 'LOAD_MESSAGES', messages: [] });
    setHistoryOpen(false);
    setWorkspace(null);
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
    setWorkspace(null);
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
      // PHASE 49 §4 — lock the transcription decoder to the active locale's BCP-47
      // tag. 'ka-GE' forces the engine to decode the Georgian script + phonology
      // (mojibake/empty results otherwise); 'ru-RU'/'en-US' for the other locales.
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
    } else if (kind === 'video') {
      // Object-URL preview → render the first video frame as a micro-thumbnail
      // (revoked on unmount). Purely visual; the send path ignores video blobs.
      const objectUrl = URL.createObjectURL(file);
      blobUrlsRef.current.push(objectUrl);
      dispatch({ type: 'ADD_ATTACHMENT', attachment: { ...att, preview: objectUrl } });
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

  // Real-time title filter — drops empty buckets so the sidebar collapses
  // cleanly to just the matching results (or none) as the user types.
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groupedConversations;
    return groupedConversations
      .map((g) => ({
        bucket: g.bucket,
        conversations: g.conversations.filter((c) => c.title.toLowerCase().includes(q)),
      }))
      .filter((g) => g.conversations.length > 0);
  }, [groupedConversations, search]);

  // ── Global keyboard shortcuts (Tier-1 LLM parity) ──────────────────
  //   ⌘/Ctrl+K        → open the history drawer with the search field focused
  //   ⌘/Ctrl+Shift+O  → toggle the history sidebar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'k' && !e.shiftKey) {
        e.preventDefault();
        focusSearchRef.current = true;
        setHistoryOpen(true);
        // Already-open case: the historyOpen effect won't re-fire, so focus now.
        searchInputRef.current?.focus();
      } else if (key === 'o' && e.shiftKey) {
        e.preventDefault();
        setHistoryOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Revoke any object-URL attachment previews (video thumbnails) on unmount so
  // the browser can reclaim the blobs.
  useEffect(() => () => {
    blobUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* noop */ } });
    blobUrlsRef.current = [];
  }, []);

  // Grab focus for the search field once the drawer mounts after a ⌘/Ctrl+K.
  useEffect(() => {
    if (historyOpen && focusSearchRef.current) {
      focusSearchRef.current = false;
      searchInputRef.current?.focus();
    }
  }, [historyOpen]);

  /* ─── Render ─────────────────────────────────────────────────────── */

  return (
    <div
      ref={stageRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="fixed inset-x-0 top-0 z-[5] flex bg-[#030303] text-zinc-100 antialiased overflow-hidden"
      style={{ height: keyboardOffset > 0 ? `calc(100dvh - ${keyboardOffset}px)` : '100dvh' }}
    >
      {/* ── Chat column (Left: stream) ─────────────────────────────────
          The header + feed + composer live in a self-contained flex column
          so the Preview Workspace can dock beside them as a real split pane
          on wide screens (and overlay full-screen on mobile). */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
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
            // PHASE 52 TASK 2 — THE IMMACULATE CLEAN CANVAS INCEPTION.
            // All persistent landing layout (capability cards, icon badge,
            // title/subtitle, agent greeting pill) is purged. The only element
            // present at the center of the frame is a single luxurious fade-in
            // greeting: "Hello".
            <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
              <motion.h1
                initial={prefersReducedMotion ? false : { opacity: 0, y: 14, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                className="select-none bg-gradient-to-br from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent text-[44px] sm:text-[64px] font-semibold tracking-tight leading-none"
                style={{ textShadow: '0 1px 40px rgba(255,255,255,0.06)' }}
              >
                {xc.greeting}
              </motion.h1>
            </div>
          ) : (
            messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                accent={ACCENT}
                lang={lang}
                autoplay={prefs.autoplayMedia}
                eager={i === messages.length - 1}
                mediaExpiredLabel={xc.mediaExpired}
                expandLabel={xc.expandHint}
                ttsLabels={{ readAloud: xc.readAloud, pause: xc.pauseReading, via: xc.via }}
                streaming={i === messages.length - 1 && m.role === 'assistant' && !!m.text && !isLoading}
                onStreamTick={() => pinBottom(false)}
                onRegenerate={() => sendMessage(m.sourcePrompt)}
                onEdit={editPrompt}
                onFeedback={sendFeedback}
                onPlayAudio={playAssetAudio}
                onExpand={openWorkspace}
                onRefine={applyRefinement}
              />
            ))
          )}
          {isLoading ? (
            <div className="flex flex-col gap-2.5">
              {/* Agent presence — which sub-agent is handling this request. */}
              <div className="flex items-center gap-2 text-[12px]">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/10 text-[11px] font-bold leading-none"
                  style={{ backgroundColor: `${AGENTS[mode].color}1f`, color: AGENTS[mode].color }}
                >
                  {AGENTS[mode].codename}
                </span>
                <span className="font-medium text-zinc-300">{AGENTS[mode].name[lang]}</span>
                <span className="text-zinc-500">{xc.working}</span>
                <Loader2 size={12} className="animate-spin text-zinc-500" />
              </div>
              <MediaSkeleton mode={mode} accent={ACCENT} />
              {mode !== 'global' && pipeline?.active && pipeline.stages.length ? (
                <PipelineTelemetry stages={pipeline.stages} lang={lang} accent={ACCENT} />
              ) : null}
            </div>
          ) : null}

          {/* Dynamic Quick-Followups — output-aware next-step chips rendered at
              the end of a complete generation cycle (latest media result). They
              PRIME the composer (and retarget the agent when cross-mode); never
              auto-send, so no paid render is billed without explicit confirm. */}
          {(() => {
            if (isLoading) return null;
            const last = messages[messages.length - 1];
            if (!last || last.role !== 'assistant' || !last.assetUrl || !last.mode) return null;
            const chips = FOLLOWUPS[last.mode];
            if (!chips || !chips.length) return null;
            return (
              <div className="flex flex-col gap-1.5">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-zinc-500">
                  <Sparkles size={12} /> {xc.nextSteps}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {chips.map((f) => (
                    <button
                      key={f.en}
                      type="button"
                      onClick={() => applyFollowup(
                        f[lang],
                        f.mode,
                        // PHASE 50 §3 — when the next-step is a video and the
                        // current card is an image, hand its URL to the anchor.
                        f.mode === 'video' && last.assetType === 'image' && last.assetUrl
                          ? last.assetUrl
                          : undefined,
                      )}
                      className="rounded-full border border-zinc-800/80 bg-[#0a0a0a] px-3 py-1 text-[12px] font-medium text-zinc-300 transition hover:border-zinc-600/80 hover:text-zinc-100 active:scale-95"
                    >
                      {f[lang]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
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
          <>
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
              ) : att.type === 'video' && att.preview ? (
                <div
                  key={att.id}
                  className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 group bg-black border border-zinc-800/70"
                >
                  <video src={att.preview} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white/90 pointer-events-none">
                    <Film size={14} />
                  </span>
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
          {/* PHASE 45 §3 — reference-image identity-lock caption. Surfaces that 1–3
              uploaded images are threaded into the film's characterReference array. */}
          {(() => {
            const imageCount = attachments.filter((a) => a.type === 'image').length;
            if (imageCount < 1) return null;
            return (
              <div className="px-3 pt-1.5 max-w-2xl mx-auto">
                {/* PHASE 54 §1 — NEON PURGE: cyan caption → neutral zinc tone. */}
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                  <span aria-hidden>🔒</span>
                  {xc.refImagesLock.replace('{n}', String(Math.min(3, imageCount)))}
                </span>
              </div>
            );
          })()}
          </>
        ) : null}

        {/* ── Unified monolithic console: mode selector + composer ─────
            The border picks up the active agent's theme colour (set via mode
            pill or an "@mention"), giving an at-a-glance cue of which engine
            the next prompt will route to. */}
        <div className="px-3 sm:px-4 pt-2.5 pb-2.5 max-w-3xl mx-auto">
          {/* PHASE 53 §1 — SANITIZED GEMINI BAR. The per-agent neon accent track
              (agent-coloured border) and shifting focus animations are removed.
              The panel is a single solid, calm surface with one hairline neutral
              border that only brightens subtly on focus — matching Gemini's clean
              aesthetic. The active engine is now communicated by the selection
              dropdown chip above, not by a coloured glow around the whole bar. */}
          <div className="rounded-3xl border border-white/[0.07] bg-[#0a0a0a] transition-colors focus-within:border-white/20">
            {/* ── PHASE 54 §1 — Flagship "30-Second Film" CTA (SANITIZED) ───
                NEON PURGE: the prior cyan gradient, multi-layer glow shadows,
                cyan ring, and animated hover sheen-sweep are all removed. This
                is now a static, solid obsidian surface with a single neutral
                hairline border (Gemini paradigm). It primes the composer with a
                starter brief + targets the film studio; never auto-sends, so the
                user always confirms the (paid) render. */}
            <div className="px-2 pt-2">
              <button
                type="button"
                onClick={startFilmFlagship}
                aria-label={FILM_FLAGSHIP.title[lang]}
                className="w-full rounded-xl px-3.5 py-2.5 flex items-center gap-3 text-left border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-colors active:scale-[0.99]"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                  <Film size={17} className="text-zinc-200" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight text-zinc-100">
                    {FILM_FLAGSHIP.title[lang]}
                    <Sparkles size={12} className="text-zinc-400" />
                  </span>
                  <span className="truncate text-[11px] font-medium leading-tight text-zinc-400">
                    {FILM_FLAGSHIP.tagline[lang]}
                  </span>
                </span>
              </button>
            </div>

            {/* ── PHASE 52 TASK 3 — SERVICE-VECTOR SELECTION DROPDOWN ──────
                The deprecated multi-slide pill carousel is removed. The four+
                service vectors (Chat, Image, 30s Film, Music, Avatar, Interior,
                Voice) consolidate into a single elegant selection button. A
                click reveals a seamless drop-down list; choosing a node maps the
                session context (setMode) and instantly auto-collapses. */}
            <div className="relative px-2 pt-2 pb-1.5">
              <button
                type="button"
                onClick={() => setModeMenuOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={modeMenuOpen}
                aria-label={xc.selectService}
                className="inline-flex items-center gap-2 h-9 pl-2 pr-2.5 rounded-full border border-white/10 bg-[#121212] text-[12.5px] font-medium text-zinc-200 hover:border-white/20 transition active:scale-[0.98]"
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10"
                  style={{ backgroundColor: mode !== 'global' ? `${AGENTS[mode].color}1f` : 'rgba(255,255,255,0.04)' }}
                >
                  {(() => {
                    const ActiveIcon = AGENTS[mode].Icon;
                    return <ActiveIcon size={13} style={mode !== 'global' ? { color: AGENTS[mode].color } : undefined} />;
                  })()}
                </span>
                <span>{MODES.find((m) => m.id === mode)?.label[lang] ?? xc.selectService}</span>
                <ChevronDown size={15} className={`text-zinc-500 transition-transform duration-200 ${modeMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {modeMenuOpen ? (
                  <>
                    {/* click-away scrim — collapses the dropdown */}
                    <button
                      type="button"
                      aria-hidden
                      tabIndex={-1}
                      onClick={() => setModeMenuOpen(false)}
                      className="fixed inset-0 z-[40] cursor-default"
                    />
                    <motion.ul
                      role="listbox"
                      aria-label={xc.selectService}
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute bottom-[calc(100%+6px)] left-2 z-[41] w-60 origin-bottom-left overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] p-1.5 shadow-[0_12px_44px_-8px_rgba(0,0,0,0.85)]"
                    >
                      {MODES.map(({ id, Icon, label }) => {
                        const active = mode === id;
                        return (
                          <li key={id} role="option" aria-selected={active}>
                            <button
                              type="button"
                              onClick={() => { setMode(id); setModeMenuOpen(false); }}
                              className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors ${
                                active ? 'bg-white/[0.08] text-zinc-50' : 'text-zinc-300 hover:bg-white/[0.04]'
                              }`}
                            >
                              <span
                                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/10"
                                style={{ backgroundColor: id !== 'global' ? `${AGENTS[id].color}1f` : 'rgba(255,255,255,0.04)' }}
                              >
                                <Icon size={15} style={id !== 'global' ? { color: AGENTS[id].color } : undefined} />
                              </span>
                              <span className="flex-1 font-medium">{label[lang]}</span>
                              {active ? <Check size={15} className="text-zinc-300" /> : null}
                            </button>
                          </li>
                        );
                      })}
                    </motion.ul>
                  </>
                ) : null}
              </AnimatePresence>
            </div>


            {/* Composer row — attachment, camera, input, mic, send */}
            <div className="flex items-end gap-1.5 px-2 py-2">
              <input ref={fileInputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/*,video/*,audio/*,application/pdf,.pdf" onChange={onFileChange} />
              {/* PHASE 52 TASK 1 — the legacy paperclip upload control is replaced
                  by a high-end minimalist Plus ("+") icon button sitting on the
                  immediate left of the inner text boundary box (Gemini paradigm). */}
              <button
                onClick={onPickFile}
                aria-label="Add attachment"
                className="h-10 w-10 flex items-center justify-center rounded-full border border-white/10 text-zinc-300 hover:text-white hover:border-white/25 hover:bg-white/[0.05] transition active:scale-95"
              >
                <Plus size={20} />
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
                onChange={(e) => onComposerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  // Honour the user's send-key preference:
                  //  • on  → Enter sends, Shift+Enter = newline
                  //  • off → Enter = newline, ⌘/Ctrl+Enter sends
                  const shouldSend = prefs.submitOnEnter ? !e.shiftKey : (e.metaKey || e.ctrlKey);
                  if (!shouldSend) return;
                  e.preventDefault();
                  // PHASE 53 §5 — Enter also sends an attachment-only message.
                  if ((inputText.trim() || attachments.length > 0) && !isLoading) void sendMessage();
                }}
                placeholder={copy.placeholder}
                rows={1}
                data-testid="chat-input"
                className="flex-1 bg-transparent text-base leading-7 text-zinc-50 placeholder-zinc-500 resize-none outline-none px-1.5 py-2 min-h-[44px] max-h-48"
              />
              <button
                onClick={toggleRecording}
                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                aria-pressed={isRecording}
                title={speechSupported ? undefined : copy.voiceUnsupported}
                className={`relative h-9 w-9 flex items-center justify-center rounded-xl transition-colors active:scale-95 ${isRecording ? 'text-rose-300 bg-rose-500/15 border border-rose-400/40' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'}`}
              >
                {/* PHASE 54 §1 — NEON PURGE: the animate-ping ring and the two
                    stacked animate-pulse layers are removed. Active recording is
                    now shown with a calm, static rose tint + hairline border —
                    no flashing. */}
                <Mic size={18} className="relative" />
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
                  disabled={!inputText.trim() && attachments.length === 0}
                  aria-label="Send"
                  className="h-9 w-9 flex items-center justify-center rounded-xl text-zinc-950 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    // PHASE 53 §5 — light the send button for an attachment-only send too.
                    background: (inputText.trim() || attachments.length > 0) ? ACCENT : 'transparent',
                  }}
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>
      </div>{/* /chat column */}

      {/* ── Preview Workspace (Right: interactive media canvas) ───────
          Docks as a split pane on wide screens, full-screen overlay on
          mobile. Driven purely by `workspace` state (never remounted), so
          clicking any historical media card repopulates it instantly with
          no flash. */}
      <AnimatePresence mode="wait">
        {workspace ? (
          <PreviewErrorBoundary
            key="preview-workspace"
            resetKey={workspace.id}
            onClose={closeWorkspace}
            labels={{
              mediaUnavailable: xc.mediaUnavailable, retry: xc.retry,
              close: xc.close, workspace: xc.workspace,
            }}
          >
            <PreviewWorkspace
              message={workspace}
              lang={lang}
              accent={ACCENT}
              labels={{
                workspace: xc.workspace, details: xc.details, promptLabel: xc.promptLabel,
                agentLabel: xc.agentLabel, aspectLabel: xc.aspectLabel, room3d: xc.room3d,
                orbitHint: xc.orbitHint, resetView: xc.resetView, refine: xc.refine,
                download: xc.download, close: xc.close, copyLink: xc.copyLink, linkCopied: xc.linkCopied,
                diagnosticsLoading: xc.diagnosticsLoading, diagnosticsSlow: xc.diagnosticsSlow,
                mediaUnavailable: xc.mediaUnavailable, retry: xc.retry,
              }}
              autoplay={prefs.autoplayMedia}
              onClose={closeWorkspace}
              onRefine={applyRefinement}
            />
          </PreviewErrorBoundary>
        ) : pipeline?.active && pipeline.stages.some((s) => s.key.startsWith('clip_')) ? (
          // PHASE 43 §2 — no finished asset yet, but a 30-second film is rendering:
          // dock the cinematic Storyboard skeleton so the canvas lights up scene by
          // scene. Swaps seamlessly to PreviewWorkspace once the master mp4 mounts.
          <FilmStoryboardSkeleton
            key="film-storyboard"
            stages={pipeline.stages}
            lang={lang}
            accent={ACCENT}
            labels={{ storyboard: xc.filmStoryboard, scene: xc.filmScene, stitching: xc.filmStitching }}
          />
        ) : null}
      </AnimatePresence>

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

              {/* Real-time history search (filters titles client-side) */}
              {conversations.length > 0 ? (
                <div className="px-3 pb-2">
                  <div className="relative">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={xc.searchChats}
                      aria-label={xc.searchChats}
                      className="w-full h-9 pl-9 pr-8 rounded-xl border border-zinc-800/80 bg-[#0a0a0a] text-[13px] text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-zinc-600/80 transition"
                    />
                    {search ? (
                      <button
                        onClick={() => {
                          setSearch('');
                          searchInputRef.current?.focus();
                        }}
                        aria-label={xc.close}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition active:scale-90"
                      >
                        <X size={13} />
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Time-grouped conversation log */}
              <div className="flex-1 overflow-y-auto px-2 py-1 [scrollbar-width:thin]">
                {groupedConversations.length === 0 ? (
                  <p className="px-2 py-4 text-[12px] text-zinc-500">{xc.noChats}</p>
                ) : filteredGroups.length === 0 ? (
                  <p className="px-2 py-4 text-[12px] text-zinc-500">{xc.noResults}</p>
                ) : (
                  filteredGroups.map((group) => (
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

              {/* PHASE 54 §3 — Sidebar matrix footer. Rounds out the nav panel
                  with the session's two standing destinations: Billing (wallet
                  balance + top-up) and Settings. Each closes the drawer first so
                  the target surface opens cleanly with no overlapping layers. */}
              <div className="mt-auto border-t border-zinc-800/70 px-3 pt-3 space-y-1">
                <button
                  onClick={() => { setHistoryOpen(false); setWalletOpen(true); }}
                  className="w-full inline-flex items-center gap-2.5 h-10 px-3 rounded-xl text-[13px] font-medium text-zinc-200 hover:bg-zinc-900 transition active:scale-[0.99]"
                >
                  <Wallet size={16} className="text-zinc-400" />
                  <span className="flex-1 text-left">{xc.balanceLabel}</span>
                  <span className="text-[12px] font-semibold text-zinc-400">{balanceGel === null ? '—' : formatGEL(balanceGel)}</span>
                </button>
                <button
                  onClick={() => { setHistoryOpen(false); setSettingsOpen(true); }}
                  className="w-full inline-flex items-center gap-2.5 h-10 px-3 rounded-xl text-[13px] font-medium text-zinc-200 hover:bg-zinc-900 transition active:scale-[0.99]"
                >
                  <Settings size={16} className="text-zinc-400" />
                  <span className="flex-1 text-left">{copy.settings}</span>
                </button>
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

                {/* PHASE 53 §2 — Plan & Balance: real wallet balance + account tier
                    (from /api/billing/credits), the active AI engine, and a direct
                    top-up entry into the Pay-As-You-Go wallet refill flow. */}
                <section className="flex flex-col gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{xc.planBalance}</h3>
                  {isAuthenticated ? (
                    <div className="rounded-2xl border border-zinc-800/70 bg-[#0f0f0f] divide-y divide-zinc-800/60">
                      {/* Wallet balance + Top-up */}
                      <div className="flex items-center justify-between gap-3 px-3 py-3">
                        <span className="flex items-center gap-2 text-[13.5px] text-zinc-200">
                          <Wallet size={15} /> {xc.balanceLabel}
                        </span>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[14px] font-semibold tabular-nums text-zinc-50">
                            {balanceGel === null ? '—' : formatGEL(balanceGel)}
                          </span>
                          <button
                            onClick={() => { setSettingsOpen(false); setWalletOpen(true); }}
                            className="h-7 px-3 rounded-full text-[12px] font-semibold text-[#0A0A0A] active:scale-95 transition"
                            style={{ background: '#D4AF37' }}
                          >
                            {xc.topUp}
                          </button>
                        </div>
                      </div>
                      {/* Account tier */}
                      <div className="flex items-center justify-between gap-3 px-3 py-3">
                        <span className="flex items-center gap-2 text-[13.5px] text-zinc-200">
                          <Sparkles size={15} /> {xc.planLabel}
                        </span>
                        <span className="text-[13px] font-medium capitalize text-zinc-100">
                          {planId ?? '—'}
                        </span>
                      </div>
                      {/* Active AI engine (read-only — hybrid routing is automatic) */}
                      <div className="flex items-center justify-between gap-3 px-3 py-3">
                        <span className="flex items-center gap-2 text-[13.5px] text-zinc-200">
                          <Cpu size={15} /> {xc.engineLabel}
                        </span>
                        <span className="text-[12.5px] font-medium text-zinc-400">{xc.engineValue}</span>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setSettingsOpen(false); setAuthOpen(true); }}
                      className="rounded-2xl border border-zinc-800/70 bg-[#0f0f0f] px-3 py-3 text-left text-[13px] text-zinc-400 hover:border-zinc-600/80 hover:text-zinc-200 transition"
                    >
                      {xc.signInForBalance}
                    </button>
                  )}
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

      {/* ── Global drag-and-drop overlay ─────────────────────────────
          Whole-window dropzone: dragging any file over the dashboard blurs the
          surface and invites the user to "Drop media to analyze with MyAvatarG". */}
      <AnimatePresence>
        {dragActive ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center bg-black/65 backdrop-blur-md p-6"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="flex flex-col items-center gap-3 rounded-[1.75rem] border-2 border-dashed border-white/30 bg-[#0a0a0a]/85 px-12 py-10 text-center shadow-[0_40px_140px_-30px_rgba(0,0,0,0.9)]"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <ImagePlus size={28} className="text-zinc-100" />
              </span>
              <p className="max-w-[16rem] text-[15px] font-semibold leading-snug text-zinc-50">{xc.dropToAnalyze}</p>
              <p className="text-[11.5px] uppercase tracking-wide text-zinc-500">PDF · JPG · PNG · MP4 · MP3</p>
            </motion.div>
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
  p: ({ children }) => <p className="my-2 leading-relaxed break-words first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-1.5 mt-3 text-[17px] font-semibold break-words first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 mt-3 text-[15px] font-semibold break-words first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2.5 text-[14px] font-semibold break-words first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-neutral-500">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-neutral-500">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed break-words">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-neutral-50">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all" style={{ color: ACCENT }}>
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
        <code className="rounded bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-100 break-all">
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
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
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
    <div className="md-body min-w-0 max-w-full break-words">
      <MarkdownView source={shown} />
      {blinking ? (
        <span className="-mt-1 inline-block h-[0.95em] w-[2px] translate-y-[2px] animate-pulse bg-current opacity-70" aria-hidden />
      ) : null}
    </div>
  );
}

/* ─── Token/cost transparency — map a raw model id to a friendly label so the
 * assistant footer can read "· Gemini 2.5 Pro" (the directive's optional
 * processing-mode indicator). Returns null when there's nothing worth showing. */
function prettyModel(model?: string): string | null {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.includes('gemini')) {
    const ver = m.includes('2.5') ? '2.5' : m.includes('1.5') ? '1.5' : '';
    const tier = m.includes('pro') ? 'Pro' : m.includes('flash') ? 'Flash' : '';
    return `Gemini${ver ? ` ${ver}` : ''}${tier ? ` ${tier}` : ''}`.trim();
  }
  if (m.includes('claude')) {
    if (m.includes('opus')) return 'Claude Opus';
    if (m.includes('sonnet')) return 'Claude Sonnet';
    if (m.includes('haiku')) return 'Claude Haiku';
    return 'Claude';
  }
  if (m.includes('udio')) return 'Udio';
  if (m.includes('marble') || m.includes('worldlabs')) return 'World Labs';
  if (m.includes('nanobanana') || m.includes('nano-banana')) return 'Nano Banana';
  // Otherwise surface a trimmed raw id (capped) rather than nothing.
  return model.length > 22 ? `${model.slice(0, 22)}…` : model;
}

/** Map the surface locale to a BCP-47 tag for SpeechSynthesis read-aloud. */
function speechLang(lang: 'en' | 'ka' | 'ru'): string {
  return lang === 'ka' ? 'ka-GE' : lang === 'ru' ? 'ru-RU' : 'en-US';
}

/** True when a URL resolves to a directly-renderable raster image. */
function isDirectImage(url: string): boolean {
  return /^data:image\//i.test(url) || /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i.test(url);
}

/**
 * Build a clean, human-readable download filename base from the generating
 * prompt (the "generated short title"). Latin-slugged + length-capped so it is
 * filesystem-safe across PWA/Safari; falls back to the message id when the
 * prompt is non-latin (e.g. Georgian/Russian) or empty.
 */
function assetFileBase(message: { id: string; sourcePrompt?: string }): string {
  const slug = (message.sourcePrompt ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join('-')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug ? `myavatarg-${slug}` : `myavatarg-${message.id}`;
}

/* ─── Preview render guard ────────────────────────────────────────────
 * PHASE 55 §1 (Task 1) — a hard error boundary wrapping the live preview dock.
 * If ANY descendant throws during render or mount (a malformed asset payload,
 * an unexpected null deref, a media node that blows up while binding), React
 * would otherwise tear down the ENTIRE chat tree and leave a blank screen —
 * the precise "throwing critical rendering errors / empty wireframe" symptom
 * from the audit. This intercepts the throw, keeps the chat surface alive, and
 * paints a graceful, dismissible card in the dock instead. It auto re-arms the
 * instant a new asset arrives (`resetKey` = message id changes) so one broken
 * payload can never permanently wedge the preview for every asset after it.
 * Error boundaries have no hook form, hence the class. */
type PreviewBoundaryProps = {
  resetKey: string;
  onClose: () => void;
  labels: { mediaUnavailable: string; retry: string; close: string; workspace: string };
  children: ReactNode;
};
type PreviewBoundaryState = { hasError: boolean };

class PreviewErrorBoundary extends Component<PreviewBoundaryProps, PreviewBoundaryState> {
  state: PreviewBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PreviewBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: PreviewBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  private handleRetry = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    const { labels, onClose } = this.props;
    return (
      <aside
        className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-[#050505] px-8 text-center lg:static lg:z-auto lg:h-full lg:w-[44%] lg:max-w-[680px] lg:min-w-[380px] lg:shrink-0 lg:border-l lg:border-white/[0.06]"
        aria-label={labels.workspace}
      >
        <AlertCircle size={28} className="text-zinc-300" />
        <p className="max-w-xs text-[13px] font-medium text-zinc-300">{labels.mediaUnavailable}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/40 bg-[#0A0A0A] px-3.5 py-1.5 text-[12px] transition hover:border-[#D4AF37] active:scale-95"
            style={{ color: '#D4AF37' }}
          >
            <RotateCcw size={13} /> {labels.retry}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3.5 py-1.5 text-[12px] text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100 active:scale-95"
          >
            {labels.close}
          </button>
        </div>
      </aside>
    );
  }
}

/* ─── Preview Workspace (split-pane interactive media canvas) ──────────
 * Docks beside the chat stream on wide screens and overlays full-screen on
 * mobile. It is driven purely by the `message` prop (never remounted between
 * artifacts), so clicking any historical media card repopulates it instantly
 * with no unmount flash. Every media type gets a tailored canvas:
 *   • image / video → aspect-ratio switcher (native · 9:16 · 16:9) + scrubber
 *   • interior 3D   → iframe canvas mount (WorldLabs/Marble) with orbit hint,
 *                     cleanly bypassing the static fallback when a live URL is
 *                     delivered; falls back to a framed still otherwise
 *   • audio         → full-width player
 * A metadata layer surfaces the originating prompt, agent identity, and model.
 * Refinement chips PRIME the composer (never auto-send → no surprise renders). */
type Aspect = 'native' | '9:16' | '16:9';

function PreviewWorkspace({
  message, lang, accent, labels, autoplay = false, onClose, onRefine,
}: {
  message: ChatMessage;
  lang: 'en' | 'ka' | 'ru';
  accent: string;
  labels: {
    workspace: string; details: string; promptLabel: string; agentLabel: string;
    aspectLabel: string; room3d: string; orbitHint: string; resetView: string;
    refine: string; download: string; close: string; copyLink: string; linkCopied: string;
    diagnosticsLoading: string; diagnosticsSlow: string; mediaUnavailable: string; retry: string;
  };
  /** PHASE 44 §3 — when on, the mounted film/video auto-plays (muted, per
   *  browser policy) the instant it decodes, with native controls left visible. */
  autoplay?: boolean;
  onClose: () => void;
  onRefine: (instruction: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [aspect, setAspect] = useState<Aspect>('native');
  const [mediaReady, setMediaReady] = useState(false);
  // Ultimate Resiliency Guard — track decode failure + a "slow-stream" phase so
  // the viewer frame NEVER collapses; it shows a high-fidelity skeleton with
  // live diagnostics while a third-party asset streams, and a graceful direct
  // open/download fallback if it ultimately fails.
  const [mediaError, setMediaError] = useState(false);
  const [loadPhase, setLoadPhase] = useState<'loading' | 'slow'>('loading');
  // PHASE 39 §1 — a decode hiccup must NEVER permanently dead-end the canvas.
  // Bumping this nonce remounts the media element so it re-attempts the stream
  // in place, removing the old "download-to-view" blocking fallback.
  const [reloadNonce, setReloadNonce] = useState(0);
  // v61 — DIRECT NATIVE MOUNT. The old cross-origin "recovery proxy" (on a media
  // onError, fetch the bytes → re-wrap them as a same-origin blob: URL) is GONE.
  // That fetch needs CORS, which provider CDNs (replicate.delivery / Supabase /
  // R2 / api.ltx.video) do NOT grant, so it ALWAYS threw → setMediaError(true) →
  // the black "preview unavailable" card dropped over a perfectly playable
  // asset. Native <img>/<video>/<audio> play cross-origin media WITHOUT CORS, so
  // we let the element own the load and only surface the fallback card on a
  // genuine, terminal native onError.
  // One-Click Asset Extraction — Shareable Link Builder copy-state feedback.
  const [linkCopied, setLinkCopied] = useState(false);
  // PHASE 41 §2 — visible download feedback so the UI never feels frozen while
  // the asset streams down over the network.
  const [downloading, setDownloading] = useState(false);
  // PHASE 40 §3 — hardware-accelerated viewport lock: when a fresh asset mounts,
  // bring the workspace into active display center rather than leaving it parked
  // off-screen in the desktop split-pane.
  const rootRef = useRef<HTMLElement>(null);
  // PHASE 44 §3 — direct handle on the workspace <video> so we can kick off a
  // muted autoplay the instant the master film/clip decodes (browsers block
  // unmuted autoplay), while leaving the native controls fully interactive.
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  const mode: ServiceMode = message.mode ?? 'global';
  const agent = AGENTS[mode];
  const assetUrl = message.assetUrl ?? '';
  const assetType = message.assetType ?? null;
  const modelLabel = prettyModel(message.model);
  const refinements = REFINEMENTS[mode];
  // Interior asset that isn't a flat image → treat as a live 3D room canvas.
  const isRoom3D = mode === 'interior' && !!assetUrl && !isDirectImage(assetUrl) && assetType !== 'video' && assetType !== 'audio';
  const showAspect = assetType === 'image' || assetType === 'video';
  // A real, distributable URL (not an inline data:/blob:) → eligible for the
  // Shareable Link Builder (internal team distribution).
  const isShareableUrl = /^https?:\/\//i.test(assetUrl);
  // Reset framing + decode/diagnostic state whenever we swap to a different
  // artifact so the panel never inherits the previous asset's flags.
  useEffect(() => {
    setAspect('native');
    // PHASE 54 §2 — INSTANT LOADER CLEAR. An inline data: image carries its full
    // bytes in the URL (there is NO network stream), so it is decodable the moment
    // it mounts — it must never sit behind a spinner. Initialise it ready so the
    // loader shell clears the same tick the completed asset registers. Streamed
    // (https/blob) assets start gated and are cleared by decode events or the short
    // safety net below; the onError recovery path still fires independently.
    const inlineImage = assetType === 'image' && assetUrl.startsWith('data:');
    setMediaReady(inlineImage);
    setMediaError(false);
    setLoadPhase('loading');
    setLinkCopied(false);
  }, [message.id]);

  // v61 — Genuine, terminal failure handler. A native <img>/<video>/<audio>
  // only fires `onError` when the resource truly cannot be loaded or decoded;
  // it never fires for a valid cross-origin asset. So this is a safe,
  // non-spurious trigger for the download-anchor fallback card — no pre-fetch,
  // no blob recovery, nothing that could mask a working asset.
  const handleMediaError = useCallback(() => {
    setMediaError(true);
  }, []);

  // PHASE 40 §3 — the instant a successful asset mounts, scroll the workspace
  // into the active viewport center (smooth, GPU-composited). On mobile the
  // panel is a full-screen fixed overlay so this is a no-op there.
  useEffect(() => {
    if (!assetUrl || typeof window === 'undefined') return;
    const el = rootRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const id = requestAnimationFrame(() => {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); }
      catch { /* older engines — non-fatal */ }
    });
    return () => cancelAnimationFrame(id);
  }, [message.id, assetUrl]);

  // Live diagnostics escalation: if the asset hasn't decoded within ~6s, flip
  // the inline skeleton's status copy to "taking longer than usual" — honest
  // progress feedback instead of a dead frame. Cleared once ready/errored.
  useEffect(() => {
    if (mediaReady || mediaError) return undefined;
    const t = setTimeout(() => setLoadPhase('slow'), 6000);
    return () => clearTimeout(t);
  }, [mediaReady, mediaError, message.id]);

  // v61 — the old 14s anti-hang watchdog that escalated to setMediaError(true)
  // (or to the CORS-doomed recovery fetch) is REMOVED: it was a primary source
  // of the spurious black card. A native media element manages its own buffering
  // and never needs us to time it out; if it genuinely cannot load it fires
  // onError, which is the only thing that now reveals the fallback card.

  // PHASE 51 §2 — Optimistic native-reveal (kills the infinite "assembling"
  // spinner). Founder directive: when the parent message carries a VALID hosted
  // file payload URL, the workspace must break out of the loading layout
  // INSTANTLY and render the asset through native HTML media nodes — never sit
  // forever waiting on a JS decode event (onLoadedMetadata/onCanPlay) that a
  // hosted CDN sometimes never fires. The server now re-hosts LTX output to a
  // real *.supabase.co https URL (PHASE 51 §2 server fix), so a short grace
  // after mount we force `mediaReady` and let the native <video>/<img> own its
  // OWN buffering + controls instead of our skeleton. We scope this to real
  // https sources (streamable natively); data:/blob: payloads keep the strict
  // event-gated reveal so a broken inline asset still escalates through the
  // recovery watchdog above. Re-arms on each (re)mount via reloadNonce.
  useEffect(() => {
    if (mediaReady || mediaError) return undefined;
    // PHASE 55 §1 (Task 1) — net now also covers the live 3D-room iframe. The
    // iframe reveal previously relied SOLELY on its `onLoad`; a cross-origin
    // world canvas that never fires `onLoad` (or fires it before its scene is
    // navigable) would leave the dock spinning forever with no watchdog. Image
    // / video / room are now all caught.
    if (assetType !== 'video' && assetType !== 'image' && !isRoom3D) return undefined;
    if (!assetUrl) return undefined;
    // PHASE 54 §2 — UNIVERSAL anti-lock net (was https-only). Mobile browsers
    // (notably iOS Safari/standalone PWA) silently drop decode events
    // (onLoad/onLoadedData/onCanPlay) for hosted https sources, which froze the
    // loader shell forever. We force-reveal across every scheme so the spinner
    // can never lock: images reveal almost immediately (400ms — they decode fast
    // or are already inline), videos get a tight 900ms grace to begin buffering,
    // the 3D room gets 2500ms to mount its canvas. This only DISMISSES the
    // cosmetic loader; it never sets the failure flag, so it can't mask media.
    const grace = assetType === 'image' ? 400 : isRoom3D ? 2500 : 900;
    const t = setTimeout(() => setMediaReady(true), grace);
    return () => clearTimeout(t);
  }, [mediaReady, mediaError, assetType, isRoom3D, assetUrl, reloadNonce]);

  // v61 — the old 300ms "re-fetch the bytes" inline failsafe is REMOVED. It
  // fired the CORS-doomed recovery fetch for ordinary cross-origin images and
  // was the direct cause of the black card landing on a fully-decodable image.
  // Inline data: images are marked ready synchronously on mount (see the reset
  // effect's `inlineImage`), and every other asset rides the native element.

  // PHASE 54 (single-focus preview ultimatum) — UNCONDITIONAL muted autostart.
  // The instant the <video> node exists we set `muted` as a real DOM PROPERTY
  // (React does not reliably apply the `muted` *attribute* — a long-standing
  // quirk — so the bare `autoPlay muted` markup alone can be silently rejected)
  // and call play(). Muted autoplay is the one form every browser/webview permits
  // without a user gesture, so the clip shows motion immediately, no tap, no
  // spinner. Fires on mount/remount, independent of the autoplay preference; the
  // pref-gated effect just below then upgrades to unmuted SOUND when ready.
  useEffect(() => {
    if (assetType !== 'video' || !assetUrl) return undefined;
    const v = previewVideoRef.current;
    if (!v) return undefined;
    v.muted = true;
    void Promise.resolve(v.play()).catch(() => { /* gesture-gated — native controls remain */ });
    return undefined;
  }, [assetType, assetUrl, reloadNonce]);

  // PHASE 45 §4 — unmuted final-cut transition. The decoded artifact (a finished
  // 30-second film carrying a real audio master — Udio score + ElevenLabs VO, or
  // a single clip) upgrades to sound the instant it's ready. We attempt UNMUTED
  // playback so the film lands with audio. Browser autoplay policy may reject
  // sound without a fresh user gesture; if the unmuted play() promise rejects we
  // transparently fall back to muted playback with native controls still visible,
  // so the user unmutes with one tap. No silent dead-frame, and we never claim
  // sound is playing when the gate blocked it. Gated on `mediaReady` + the
  // autoplay preference.
  useEffect(() => {
    if (!autoplay || assetType !== 'video' || !assetUrl || !mediaReady) return undefined;
    const v = previewVideoRef.current;
    if (!v) return undefined;
    let cancelled = false;
    v.muted = false;
    void Promise.resolve(v.play()).catch(() => {
      if (cancelled) return undefined;
      // Unmuted gate closed — degrade to muted autoplay so motion still starts.
      v.muted = true;
      return Promise.resolve(v.play()).catch(() => { /* gate fully closed — controls remain */ });
    });
    return () => { cancelled = true; };
  }, [autoplay, assetType, assetUrl, mediaReady, reloadNonce]);

  const frameClass =
    aspect === '9:16' ? 'aspect-[9/16] max-h-[64vh] mx-auto'
    : aspect === '16:9' ? 'aspect-[16/9]'
    : 'min-h-[38vh] max-h-[64vh]';
  // PHASE 45 §4 — the 30-second film mounts into a hard, hardware-accelerated
  // 16:9 container so the layout reserves its exact box BEFORE the .mp4 decodes
  // (zero CLS). 'native' resolves to a locked 16:9 here (object-contain
  // letterboxes any off-ratio source); the 9:16 toggle still applies for verticals.
  const videoFrameClass =
    aspect === '9:16' ? 'aspect-[9/16] max-h-[64vh] mx-auto'
    : 'aspect-[16/9]';
  // PHASE 54 (single-focus preview ultimatum) — the media node mounts VISIBLE
  // from the first paint. We NO LONGER hide it behind an opacity/blur gate that
  // waits on a decode handshake (onLoad / onLoadedData / onCanPlay); those
  // events silently never fire on some iOS-PWA / flaky-CDN paths, which is the
  // exact regression that stranded a perfectly good asset behind an eternal
  // spinner. The native element owns its own progressive paint; the loading
  // shimmer now renders BEHIND it (see the split overlay below) so a decoded
  // frame always wins and the spinner can never mask working media.
  const fadeClass = 'opacity-100 transform-gpu';

  // Direct Download — robust streaming trigger. Routes through
  // arrayBuffer → Blob(octet-stream) so the browser SAVES (critical for
  // standalone Safari/PWA) rather than navigating; falls back to a direct
  // anchor when the asset is CORS-blocked. Named from the generated short title.
  const downloadAsset = useCallback(async () => {
    if (!assetUrl || downloading) return;
    const ext = assetType === 'video' ? 'mp4' : assetType === 'audio' ? 'mp3' : 'png';
    const filename = `${assetFileBase(message)}.${ext}`;
    setDownloading(true);
    try {
      const res = await fetch(assetUrl, { credentials: 'omit' });
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
    } finally {
      setDownloading(false);
    }
    const a = document.createElement('a');
    a.href = assetUrl;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [assetUrl, assetType, message, downloading]);

  // Shareable Link Builder — copy the canonical asset URL for fast internal
  // distribution. Only offered for real http(s) URLs (never inline data:/blob:).
  const copyShareLink = useCallback(() => {
    if (!isShareableUrl || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(assetUrl)
      .then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800); })
      .catch(() => { /* clipboard blocked — no-op */ });
  }, [assetUrl, isShareableUrl]);

  // PHASE 54 — the old single `renderDiagnostics()` overlay sat ON TOP of the
  // media and was gated only by `mediaReady`, so a decode event that never
  // fired left the spinner permanently covering a working asset. It is now
  // split in two, with the media element sandwiched between them in the DOM:
  //
  //   renderLoadingBackdrop()  → z-0, BEHIND the media — purely cosmetic; the
  //                              instant the native node paints a frame it wins.
  //   <img>/<video>/<iframe>   → z-[1], VISIBLE from first paint.
  //   renderErrorCard()        → z-20, ON TOP, but ONLY on a genuine, terminal
  //                              native onError (no recovery fetch, no watchdog).
  //
  // Net effect: the spinner can no longer hang over a decodable asset — exactly
  // the OpenAI/Gemini/Grok behaviour (element present, shimmer behind, frame
  // replaces it, error card only on true failure).
  const renderLoadingBackdrop = () => {
    // PHASE 56 §1 — FORCED SYNCHRONOUS MOUNT. The loader's lifetime is bound to
    // URL PRESENCE, never to an async decode handshake. The split second a valid
    // `assetUrl` exists, the skeleton is destroyed from the DOM and the native
    // media node (already mounted at z-[1], opacity-100) owns the frame — its OWN
    // buffering UI covers any network wait. Gating the loader on a JS decode
    // event (onLoad / onLoadedData / onCanPlay) is the exact defect that stranded
    // a perfectly good asset behind an eternal spinner on iOS-PWA / flaky-CDN
    // paths where those events are silently dropped by the webview. The dock only
    // ever opens WITH a resolved URL, so this skeleton is now effectively never
    // shown; a genuine native `onError` is the sole authority for a dead asset.
    if (assetUrl || mediaError) return null;
    const text = loadPhase === 'slow' ? labels.diagnosticsSlow : labels.diagnosticsLoading;
    return (
      <div className="absolute inset-0 z-0 flex items-center justify-center">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-900/80 via-black to-zinc-900/50" />
        <div className="relative flex flex-col items-center gap-2.5 px-6 text-center">
          <span
            className="h-7 w-7 animate-spin rounded-full border-2 border-white/15"
            style={{ borderTopColor: accent }}
          />
          <span className="text-[12px] font-medium text-zinc-300">{text}</span>
        </div>
      </div>
    );
  };

  const renderErrorCard = () => {
    if (!mediaError) return null;
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75">
        <div className="relative flex flex-col items-center gap-2.5 px-6 text-center">
          <AlertCircle size={24} className="text-zinc-300" />
          <span className="text-[12px] font-medium text-zinc-300">{labels.mediaUnavailable}</span>
          <div className="mt-1 flex items-center gap-2">
            {/* Primary: re-initialize the canvas in place (no download needed). */}
            <button
              type="button"
              onClick={() => { setMediaError(false); setMediaReady(false); setLoadPhase('loading'); setReloadNonce((n) => n + 1); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/40 bg-[#0A0A0A] px-3 py-1 text-[11.5px] text-zinc-100 transition hover:border-[#D4AF37] active:scale-95"
              style={{ color: '#D4AF37' }}
            >
              <RotateCcw size={13} /> {labels.retry}
            </button>
            {/* Secondary: open the asset directly if the stream stays unreachable. */}
            <a
              href={assetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[11.5px] text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
            >
              {labels.download}
            </a>
          </div>
        </div>
      </div>
    );
  };

  if (!assetUrl) return null;

  return (
    <motion.aside
      ref={rootRef}
      initial={reduceMotion ? { opacity: 0 } : { x: '100%', opacity: 0 }}
      animate={reduceMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 36 }}
      className="fixed inset-0 z-[70] flex flex-col bg-[#050505] lg:static lg:z-auto lg:h-full lg:w-[44%] lg:max-w-[680px] lg:min-w-[380px] lg:shrink-0 lg:border-l lg:border-white/[0.06]"
      aria-label={labels.workspace}
      data-testid="preview-workspace"
    >
      {/* Header: agent identity + close / download */}
      <div
        className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5"
        style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[12px] font-bold"
            style={{ backgroundColor: `${agent.color}1f`, color: agent.color }}
          >
            {agent.codename}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-zinc-100">{agent.name[lang]}</p>
            <p className="truncate text-[11px] text-zinc-500">{labels.workspace}</p>
          </div>
        </div>
        {/* One-Click Asset Extraction — premium action group: Direct Download +
            Shareable Link Builder (the latter only for real distributable URLs). */}
        <div className="flex items-center gap-1">
          <button
            onClick={downloadAsset}
            disabled={downloading}
            aria-label={labels.download}
            aria-busy={downloading}
            title={labels.download}
            className="h-9 w-9 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition active:scale-95 disabled:opacity-70"
          >
            {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          </button>
          {isShareableUrl ? (
            <button
              onClick={copyShareLink}
              aria-label={linkCopied ? labels.linkCopied : labels.copyLink}
              title={linkCopied ? labels.linkCopied : labels.copyLink}
              className={`h-9 w-9 flex items-center justify-center rounded-full transition active:scale-95 ${
                linkCopied ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              }`}
            >
              {linkCopied ? <Check size={18} /> : <Link2 size={18} />}
            </button>
          ) : null}
          <span className="mx-0.5 h-5 w-px bg-white/10" aria-hidden />
          <button
            onClick={onClose}
            aria-label={labels.close}
            title={labels.close}
            className="h-9 w-9 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition active:scale-95"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Aspect-ratio switcher — only meaningful for image / video. */}
      {showAspect ? (
        <div className="flex items-center gap-2 border-b border-white/[0.04] px-3 py-2">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">{labels.aspectLabel}</span>
          <div className="flex items-center gap-1 rounded-full bg-zinc-900/80 p-0.5">
            {(['native', '9:16', '16:9'] as Aspect[]).map((a) => (
              <button
                key={a}
                onClick={() => setAspect(a)}
                aria-pressed={aspect === a}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  aspect === a ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {a === 'native' ? labels.resetView : a}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Canvas body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
        {assetType === 'image' && !isRoom3D ? (
          <div
            className={`relative w-full overflow-hidden rounded-2xl border border-[#D4AF37]/25 ${frameClass}`}
            style={{ backgroundColor: '#0A0A0A' }}
          >
            {renderLoadingBackdrop()}
            {/* v61 — native <img> mounted DIRECTLY from the raw `assetUrl` (no
                next/image optimizer, no blob recovery indirection). z-[1] +
                always-visible: it paints over the shimmer the instant bytes
                decode; never gated behind a decode handshake. A real cross-origin
                image loads here WITHOUT CORS — onError only fires if it's truly
                dead, which is the only thing that reveals the fallback card. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`img-${reloadNonce}`}
              src={assetUrl}
              alt="Generated"
              decoding="async"
              onLoad={() => setMediaReady(true)}
              onError={handleMediaError}
              className={`absolute inset-0 z-[1] h-full w-full object-contain ${fadeClass}`}
            />
            {renderErrorCard()}
          </div>
        ) : null}

        {assetType === 'video' ? (
          <div
            className={`relative w-full overflow-hidden rounded-2xl border border-[#D4AF37]/25 transform-gpu ${videoFrameClass}`}
            style={{ backgroundColor: '#0A0A0A' }}
          >
            {renderLoadingBackdrop()}
            {/* v62 — `src` directly on the <video> node (NOT a child <source>).
                A typeless child <source> makes Safari/iOS refuse to load a
                signed/extensionless/cross-origin URL (it never probes the real
                Content-Type), which left the player frozen with no metadata. A
                direct `src` forces the request, reads the hosted Content-Type,
                and an inline data:video/... URI carries its own MIME. */}
            <video
              key={`vid-${reloadNonce}`}
              ref={previewVideoRef}
              src={assetUrl}
              controls
              playsInline
              // PHASE 54 (single-focus preview ultimatum) — `autoPlay muted` on the
              // DOM node itself force-initialises the clip the instant it mounts,
              // bypassing the mobile-webview "no playback without a user gesture"
              // restriction. It starts muted (the only autoplay browsers permit),
              // native controls stay live, and the unmute-on-ready effect below
              // upgrades to sound when the autoplay preference is on.
              autoPlay
              muted
              preload="metadata"
              // PHASE 50 §2 — recognize readiness on ANY of the decode milestones,
              // not just `loadeddata`. Under preload="metadata" some browsers/CDNs
              // (notably hosted .mp4 without range support) fire loadedmetadata /
              // canplay but never loadeddata. These now only DISMISS THE SHIMMER —
              // the element is already visible (z-[1]), so even if none ever fire
              // the decoded frame still paints over the backdrop.
              onLoadedMetadata={() => setMediaReady(true)}
              onLoadedData={() => setMediaReady(true)}
              onCanPlay={() => setMediaReady(true)}
              onError={handleMediaError}
              style={{ transform: 'translateZ(0)' }}
              className={`absolute inset-0 z-[1] h-full w-full object-contain ${fadeClass}`}
            />
            {renderErrorCard()}
          </div>
        ) : null}

        {isRoom3D ? (
          <div className="overflow-hidden rounded-2xl border border-[#D4AF37]/25" style={{ backgroundColor: '#0A0A0A' }}>
            <div className="relative aspect-[16/9] w-full">
              {renderLoadingBackdrop()}
              <iframe
                key={`room-${reloadNonce}`}
                src={assetUrl}
                title={labels.room3d}
                allow="accelerometer; gyroscope; xr-spatial-tracking; fullscreen"
                sandbox="allow-scripts allow-same-origin allow-pointer-lock"
                onLoad={() => setMediaReady(true)}
                onError={() => setMediaError(true)}
                className={`absolute inset-0 z-[1] h-full w-full ${fadeClass}`}
              />
              {renderErrorCard()}
            </div>
            <div className="flex items-center gap-2 px-3 py-2 text-[11.5px] text-zinc-400">
              <Box size={14} style={{ color: agent.color }} />
              <span>{labels.orbitHint}</span>
            </div>
          </div>
        ) : null}

        {assetType === 'audio' ? (
          <div className="w-full rounded-2xl border border-[#D4AF37]/25 p-4" style={{ backgroundColor: '#0A0A0A' }}>
            <div className="flex items-center gap-2 pb-3 text-[13px] font-medium text-zinc-200">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5">
                <Volume2 size={18} style={{ color: accent }} />
              </span>
              <span>{agent.name[lang]}</span>
            </div>
            {/* PHASE 54 — `autoPlay` so the score/VO begins the instant it mounts;
                browsers that gate unmuted audio autoplay simply leave the native
                controls ready for a one-tap start (no spinner, no download path).
                v62 — `src` directly on the <audio> node (NOT a child <source>):
                a typeless <source> left Safari/iOS stuck at 00:00 on signed/
                extensionless URLs because it never probed the real Content-Type. */}
            <audio
              key={`aud-${reloadNonce}`}
              src={assetUrl}
              controls
              autoPlay
              preload="metadata"
              onError={handleMediaError}
              className="w-full"
            />
          </div>
        ) : null}

        {/* Metadata layer */}
        <div className="mt-3 space-y-2 rounded-2xl border border-white/[0.05] bg-[#080808] p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-zinc-500">
            <Sparkles size={12} /> <span>{labels.details}</span>
          </div>
          <dl className="space-y-1.5 text-[12.5px]">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-zinc-500">{labels.agentLabel}</dt>
              <dd className="min-w-0 text-zinc-200" style={{ color: agent.color }}>{agent.name[lang]}</dd>
            </div>
            {modelLabel ? (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-zinc-500">Model</dt>
                <dd className="min-w-0 break-words text-zinc-300">{modelLabel}</dd>
              </div>
            ) : null}
            {message.sourcePrompt ? (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-zinc-500">{labels.promptLabel}</dt>
                <dd className="min-w-0 break-words text-zinc-300">{message.sourcePrompt}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {/* Refinement chips — prime the composer (no auto-send). */}
        {refinements && refinements.length ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-500">{labels.refine}</p>
            <div className="flex flex-wrap gap-1.5">
              {refinements.map((r) => (
                <button
                  key={r.en}
                  type="button"
                  onClick={() => onRefine(r[lang])}
                  className="rounded-full border border-zinc-800/80 bg-[#0a0a0a] px-3 py-1 text-[12px] font-medium text-zinc-300 transition hover:border-zinc-600/80 hover:text-zinc-100 active:scale-95"
                >
                  {r[lang]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </motion.aside>
  );
}

/* ─── Per-message bubble with executive toolbar ────────────────────── */

function MessageBubble({
  message, accent, lang, streaming = false, autoplay = false, eager = false, mediaExpiredLabel, expandLabel, ttsLabels, onStreamTick, onRegenerate, onEdit, onFeedback, onPlayAudio, onExpand, onRefine,
}: {
  message: ChatMessage;
  accent: string;
  lang: 'en' | 'ka' | 'ru';
  streaming?: boolean;
  autoplay?: boolean;
  eager?: boolean;
  mediaExpiredLabel?: string;
  expandLabel?: string;
  ttsLabels: { readAloud: string; pause: string; via: string };
  onStreamTick?: () => void;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
  onFeedback: (id: string, rating: 'up' | 'down') => void;
  onPlayAudio: (url: string) => void;
  onExpand?: (m: ChatMessage) => void;
  onRefine?: (instruction: string) => void;
}) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const bubbleVideoRef = useRef<HTMLVideoElement>(null);
  const bubbleAudioRef = useRef<HTMLAudioElement>(null);
  const [lightbox, setLightbox] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  // Reactive feedback selection (Tier-1 micro-interaction). Local-only; the
  // network call is fire-and-forget via onFeedback.
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  // Read-aloud lifecycle. PHASE 56 — premium ElevenLabs audio is the PRIMARY
  // engine (eleven_multilingual_v2 for Georgian, Google ka-GE fallback server-
  // side); the browser SpeechSynthesis path survives only as a last resort, so
  // `loading` covers the network fetch of the synthesized clip.
  const [ttsState, setTtsState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const readAloudAudioRef = useRef<HTMLAudioElement | null>(null);
  // Smooth content mount: media starts blurred + transparent and resolves to a
  // crisp frame on first decode (hardware-accelerated opacity+blur transition).
  const [mediaReady, setMediaReady] = useState(false);
  // Lazy-mount gate (§3b): heavy media (inline base64 image / video) only mounts
  // once this bubble nears the viewport, so restoring a long conversation never
  // decodes every historical asset synchronously on the main thread. PHASE 39 §1:
  // the freshly returned bubble passes `eager` to bypass the gate so a brand-new
  // asset paints immediately (no download-to-reveal regression).
  const [mediaRef, mediaInView] = useInView<HTMLDivElement>('400px 0px', eager);
  // PHASE 54 (single-focus preview ultimatum) — the in-stream asset is VISIBLE
  // from the first paint, exactly like the Preview dock. We dropped the
  // opacity/blur gate that waited on a decode handshake (onLoadingComplete /
  // onLoadedData / onCanPlay) which silently never fires on some iOS-PWA / CDN
  // paths and stranded the bubble's media invisible. The lazy in-view gate
  // (mediaInView) still defers heavy historical assets for scroll perf, but once
  // a bubble is mounted its asset paints progressively with no reveal gate.
  const mediaFadeClass = 'opacity-100 transform-gpu';

  // PHASE 53 §3 — inline-media anti-hang net. next/image's onLoadingComplete and
  // the <video> decode events (onLoadedMetadata/onCanPlay) can SILENTLY never fire
  // on flaky CDNs / iOS PWA wrappers, which would freeze this bubble's asset at
  // opacity-0 forever (the "loading fallback hang"). Once the asset is mounted in
  // view, force-reveal after a short grace so the native element always owns its
  // own loading state and the decoded frame is never masked by the fade gate.
  useEffect(() => {
    if (!message.assetUrl || !mediaInView || mediaReady) return undefined;
    const t = setTimeout(() => setMediaReady(true), 1500);
    return () => clearTimeout(t);
  }, [message.assetUrl, mediaInView, mediaReady]);

  // PHASE 54 (single-focus preview ultimatum) — inline video gets UNCONDITIONAL
  // muted autostart (React doesn't reliably apply the `muted` attribute, so we
  // set the DOM property + call play() here); re-runs when the bubble scrolls
  // into view and the element actually mounts (`mediaInView` dep). Audio
  // autostart stays preference-gated — unprompted sound in a scrolling feed is
  // intrusive and browsers block it anyway, so the native controls are the path.
  useEffect(() => {
    if (!message.assetUrl || !mediaInView) return;
    if (message.assetType === 'video') {
      const v = bubbleVideoRef.current;
      if (v) { v.muted = true; void Promise.resolve(v.play()).catch(() => {}); }
    } else if (autoplay && message.assetType === 'audio') {
      const a = bubbleAudioRef.current;
      if (a) void Promise.resolve(a.play()).catch(() => {});
    }
  }, [autoplay, message.assetUrl, message.assetType, mediaInView]);

  const copyMessageText = useCallback(() => {
    if (!navigator.clipboard || !message.text) return;
    navigator.clipboard.writeText(message.text)
      .then(() => { setCopiedText(true); setTimeout(() => setCopiedText(false), 1800); })
      .catch(() => { /* clipboard blocked — no-op */ });
  }, [message.text]);

  // Tear down any in-flight read (browser speech OR the ElevenLabs audio clip)
  // and release its blob URL when the bubble unmounts.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && utterRef.current) {
        try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      }
      const audio = readAloudAudioRef.current;
      if (audio) {
        try { audio.pause(); } catch { /* noop */ }
        try { if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src); } catch { /* noop */ }
        readAloudAudioRef.current = null;
      }
    };
  }, []);

  const handleFeedback = useCallback((rating: 'up' | 'down') => {
    setFeedback((prev) => (prev === rating ? null : rating));
    onFeedback(message.id, rating);
  }, [message.id, onFeedback]);

  // Browser SpeechSynthesis — the LAST-RESORT read engine. Most browsers ship
  // no Georgian (ka-GE) voice, so this only runs when the premium ElevenLabs
  // stream is unreachable. Markdown-stripped prose, surface-locale voice.
  const speakViaBrowser = useCallback((plain: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) { setTtsState('idle'); return; }
    const synth = window.speechSynthesis;
    try { synth.cancel(); } catch { /* noop */ }
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = speechLang(lang);
    utter.onend = () => { utterRef.current = null; setTtsState('idle'); };
    utter.onerror = () => { utterRef.current = null; setTtsState('idle'); };
    utterRef.current = utter;
    try { synth.speak(utter); setTtsState('playing'); } catch { setTtsState('idle'); }
  }, [lang]);

  // Read-aloud play/pause toggle. PHASE 56 — first tap synthesizes the message
  // through the premium ElevenLabs voice (/api/elevenlabs/tts: multilingual_v2
  // for Georgian, Google ka-GE fallback) and plays the returned clip; a second
  // tap pauses, a third resumes. ElevenLabs is a server call so it works on
  // every browser — unlike SpeechSynthesis, which can't pronounce Georgian.
  const toggleReadAloud = useCallback(async () => {
    if (!message.text || ttsState === 'loading') return;

    const audio = readAloudAudioRef.current;
    if (ttsState === 'playing') {
      if (audio) { try { audio.pause(); } catch { /* noop */ } }
      else if (typeof window !== 'undefined' && 'speechSynthesis' in window) { try { window.speechSynthesis.pause(); } catch { /* noop */ } }
      setTtsState('paused');
      return;
    }
    if (ttsState === 'paused') {
      if (audio) { try { await audio.play(); } catch { /* noop */ } }
      else if (typeof window !== 'undefined' && 'speechSynthesis' in window) { try { window.speechSynthesis.resume(); } catch { /* noop */ } }
      setTtsState('playing');
      return;
    }

    const plain = message.text.replace(/[*_`#>~|]/g, '').replace(/\[(.*?)\]\(.*?\)/g, '$1').slice(0, 4000);

    // Cancel any prior read (this bubble's or, for speech, a sibling's).
    if (readAloudAudioRef.current) {
      try { readAloudAudioRef.current.pause(); } catch { /* noop */ }
      try { if (readAloudAudioRef.current.src.startsWith('blob:')) URL.revokeObjectURL(readAloudAudioRef.current.src); } catch { /* noop */ }
      readAloudAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch { /* noop */ } }

    setTtsState('loading');
    try {
      const res = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: plain, locale: lang }),
      });
      if (!res.ok) throw new Error(`tts ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      el.onended = () => { try { URL.revokeObjectURL(url); } catch { /* noop */ } readAloudAudioRef.current = null; setTtsState('idle'); };
      el.onerror = () => { try { URL.revokeObjectURL(url); } catch { /* noop */ } readAloudAudioRef.current = null; setTtsState('idle'); };
      readAloudAudioRef.current = el;
      await el.play();
      setTtsState('playing');
    } catch {
      // Premium voice unreachable — degrade to the browser engine.
      readAloudAudioRef.current = null;
      speakViaBrowser(plain);
    }
  }, [ttsState, message.text, lang, speakViaBrowser]);

  const modelLabel = prettyModel(message.model);
  // Agent presence: which specialized sub-agent produced this turn. Derived from
  // the message's service mode (reliable) — surfaced as a small identity chip on
  // assistant turns from a specialized engine (general chat stays chip-free).
  const bubbleMode: ServiceMode = message.mode ?? 'global';
  const bubbleAgent = AGENTS[bubbleMode];
  const showAgentChip = !isUser && !isError && (bubbleMode !== 'global' || !!message.assetUrl);

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
    <div ref={mediaRef} className={`group flex min-w-0 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col gap-2 min-w-0 max-w-[88%] ${isUser ? 'items-end' : 'items-start'}`}>
        {showAgentChip ? (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md border border-white/10 text-[10px] font-bold leading-none"
              style={{ backgroundColor: `${bubbleAgent.color}1f`, color: bubbleAgent.color }}
            >
              {bubbleAgent.codename}
            </span>
            <span className="font-medium text-zinc-400">{bubbleAgent.name[lang]}</span>
          </div>
        ) : null}
        {message.text ? (
          <div
            className={
              isError
                ? 'max-w-full min-w-0 overflow-hidden break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed tracking-[-0.01em] border border-rose-500/25 bg-rose-500/[0.05] text-rose-200'
                : isUser
                ? 'max-w-full min-w-0 overflow-hidden break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed tracking-[-0.01em] bg-neutral-100 text-neutral-900'
                : 'max-w-full min-w-0 overflow-hidden break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed tracking-[-0.01em] bg-neutral-900/80 border border-neutral-800 text-neutral-100'
            }
          >
            {!isUser && !isError
              ? <StreamingText text={message.text} active={streaming} onTick={onStreamTick} />
              : <span className="whitespace-pre-wrap break-words">{message.text}</span>}
          </div>
        ) : null}

        {message.assetUrl && message.assetType === 'image' ? (
          mediaInView ? (
            <button
              type="button"
              // PHASE 53 §4 — tapping ANY image card (generated or uploaded) opens
              // the unconfined full-screen Lightbox layer. (The explicit "expand"
              // affordance below still mounts the split-pane Preview Workspace.)
              onClick={() => setLightbox(true)}
              aria-label={expandLabel || 'Open full-size image'}
              className="group relative block overflow-hidden rounded-2xl border border-zinc-800/70 bg-black max-w-full active:scale-[0.99] transition"
            >
              <Image
                src={message.assetUrl}
                alt="Generated"
                width={1200}
                height={800}
                unoptimized
                decoding="async"
                onLoadingComplete={() => setMediaReady(true)}
                className={`max-w-full max-h-[300px] w-auto object-contain ${mediaFadeClass}`}
              />
              <span className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white/90 opacity-0 group-hover:opacity-100 transition">
                <Maximize2 size={14} />
              </span>
            </button>
          ) : (
            // Lazy placeholder — reserves space (no CLS) until scrolled near.
            <div className="h-48 w-64 max-w-full animate-pulse rounded-2xl border border-zinc-800/70 bg-zinc-900/60" aria-hidden />
          )
        ) : null}
        {message.assetUrl && message.assetType === 'video' ? (
          mediaInView ? (
            message.mode === 'avatar' ? (
              // Avatar → strict native 9:16 portrait stage (object-cover, premium framing).
              <div className="aspect-[9/16] w-full max-w-[320px] rounded-2xl overflow-hidden border border-zinc-800/70 shadow-2xl bg-black">
                {/* v62 — direct `src` (not a typeless child <source>) so Safari/iOS
                    actually loads signed/extensionless avatar clips. */}
                <video
                  ref={bubbleVideoRef}
                  src={message.assetUrl}
                  controls
                  playsInline
                  // PHASE 54 — force instant muted autoplay so the inline clip
                  // self-starts in mobile webviews without a tap; controls stay live.
                  autoPlay
                  muted
                  preload="metadata"
                  // PHASE 50 §2 — reveal on any decode milestone, not just
                  // loadeddata (which can never fire under preload="metadata").
                  onLoadedMetadata={() => setMediaReady(true)}
                  onLoadedData={() => setMediaReady(true)}
                  onCanPlay={() => setMediaReady(true)}
                  style={{ transform: 'translateZ(0)' }}
                  className={`h-full w-full object-cover ${mediaFadeClass}`}
                />
              </div>
            ) : (
              // Film / other → adaptive responsive framing (object-contain, no distortion).
              // v62 — direct `src` (not a typeless child <source>) so Safari/iOS
              // loads signed/extensionless hosted clips and reads their Content-Type.
              <video
                ref={bubbleVideoRef}
                src={message.assetUrl}
                controls
                playsInline
                // PHASE 54 — force instant muted autoplay (see avatar branch above).
                autoPlay
                muted
                preload="metadata"
                // PHASE 50 §2 — reveal on any decode milestone (see above).
                onLoadedMetadata={() => setMediaReady(true)}
                onLoadedData={() => setMediaReady(true)}
                onCanPlay={() => setMediaReady(true)}
                style={{ transform: 'translateZ(0)' }}
                className={`rounded-2xl border border-zinc-800/70 max-w-full max-h-[320px] w-auto object-contain bg-black ${mediaFadeClass}`}
              />
            )
          ) : (
            // Lazy placeholder — reserves portrait/landscape footprint until near.
            <div
              className={`animate-pulse rounded-2xl border border-zinc-800/70 bg-zinc-900/60 ${
                message.mode === 'avatar' ? 'aspect-[9/16] w-full max-w-[320px]' : 'h-48 w-72 max-w-full'
              }`}
              aria-hidden
            />
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
            {/* PHASE 54 — autoPlay so the track begins on mount; gated browsers
                fall back to one-tap on the live native controls.
                v62 — `src` directly on the <audio> node (NOT a typeless child
                <source>), which was the cause of the "00:00 / no duration" stall:
                Safari/iOS never probed the signed/extensionless URL's real MIME. */}
            <audio
              ref={bubbleAudioRef}
              src={message.assetUrl}
              controls
              autoPlay
              preload="metadata"
              className="w-full"
            />
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
              {/* PHASE 53 §4 — the image scales up into the unconfined layer; tapping
                  the image itself doesn't dismiss (only the backdrop / close button). */}
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center"
              >
                <Image src={message.assetUrl} alt="Generated (full size)" width={2048} height={2048} unoptimized className="max-h-[92vh] max-w-[96vw] w-auto h-auto object-contain rounded-xl" />
              </motion.div>
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

        {/* Refinement chips — under a finished media output. Each chip PRIMES
            the composer with a follow-up instruction (never auto-sends), so the
            user reviews and confirms before any paid render is billed. */}
        {!isUser && !isError && message.assetUrl && message.mode && onRefine && REFINEMENTS[message.mode] ? (
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {(REFINEMENTS[message.mode] ?? []).map((r) => (
              <button
                key={r.en}
                type="button"
                onClick={() => onRefine(r[lang])}
                className="rounded-full border border-zinc-800/80 bg-[#0a0a0a] px-3 py-1 text-[12px] font-medium text-zinc-300 transition hover:border-zinc-600/80 hover:text-zinc-100 active:scale-95"
              >
                {r[lang]}
              </button>
            ))}
          </div>
        ) : null}

        {/* Executive toolbar — assistant messages only */}
        {!isUser && !isError ? (
          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-neutral-500">
            <button
              onClick={() => handleFeedback('up')}
              aria-label="Good response"
              aria-pressed={feedback === 'up'}
              className={`h-9 w-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 ${
                feedback === 'up' ? 'text-emerald-400 bg-emerald-500/10 scale-110' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
              }`}
            >
              <ThumbsUp size={18} fill={feedback === 'up' ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => handleFeedback('down')}
              aria-label="Poor response"
              aria-pressed={feedback === 'down'}
              className={`h-9 w-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 ${
                feedback === 'down' ? 'text-rose-400 bg-rose-500/10 scale-110' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
              }`}
            >
              <ThumbsDown size={18} fill={feedback === 'down' ? 'currentColor' : 'none'} />
            </button>
            {message.text ? (
              <button
                onClick={toggleReadAloud}
                disabled={ttsState === 'loading'}
                aria-label={ttsState === 'playing' ? ttsLabels.pause : ttsLabels.readAloud}
                aria-pressed={ttsState !== 'idle'}
                aria-busy={ttsState === 'loading'}
                title={ttsState === 'playing' ? ttsLabels.pause : ttsLabels.readAloud}
                className={`h-9 w-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 ${
                  ttsState !== 'idle' ? 'text-neutral-100 bg-neutral-800' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
                }`}
              >
                {ttsState === 'loading' ? <Loader2 size={18} className="animate-spin" />
                  : ttsState === 'playing' ? <Pause size={18} />
                  : <Volume2 size={18} />}
              </button>
            ) : null}
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
            {message.assetUrl && onExpand ? (
              <button
                onClick={() => onExpand(message)}
                aria-label={expandLabel || 'Expand to workspace'}
                title={expandLabel || 'Expand to workspace'}
                className="h-9 w-9 flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 transition-all duration-200 active:scale-95"
              >
                <Maximize2 size={18} />
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
            {/* Token/cost transparency — minimalist processing-mode indicator */}
            {modelLabel ? (
              <span
                className="ml-0.5 inline-flex items-center gap-1 h-6 rounded-full px-2 text-[10.5px] font-medium text-neutral-500 select-none"
                title={message.model}
              >
                <Sparkles size={11} className="opacity-70" />
                <span className="whitespace-nowrap">{ttsLabels.via} {modelLabel}</span>
              </span>
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

/* ─── PHASE 43 §2 — Multi-Stage Cinematic Loading Skeleton ("the Storyboard").
 * While the 30-second film renders, the Preview Workspace docks this in place of
 * the not-yet-existent player: a filmstrip of N scene slots that light up / show
 * a checkmark the instant each LTX clip lands (driven by the SAME Union-Poll
 * telemetry that feeds the left-rail strip), plus an Editor (stitch) + Score
 * footer. Pure-derived from `pipeline.stages` — ZERO local state, so it can never
 * trigger a re-render loop, and it shares the PreviewWorkspace container exactly
 * so the swap to the finished player is seamless. */

function FilmLegGlyph({ state, accent, size = 14 }: { state: StageState; accent: string; size?: number }) {
  if (state === 'done') return <Check size={size} className="text-emerald-400" />;
  if (state === 'active') return <Loader2 size={size} className="animate-spin" style={{ color: accent }} />;
  if (state === 'failed') return <AlertCircle size={size} className="text-rose-400" />;
  return <Circle size={Math.round(size * 0.64)} className="text-neutral-600" />;
}

function FilmStoryboardSkeleton({
  stages, lang, accent, labels,
}: {
  stages: PipelineStage[];
  lang: 'en' | 'ka' | 'ru';
  accent: string;
  labels: { storyboard: string; scene: string; stitching: string };
}) {
  const reduceMotion = useReducedMotion();
  const clips = stages.filter((s) => s.key.startsWith('clip_'));
  const stitch = stages.find((s) => s.key === 'stitch');
  const score = stages.find((s) => s.key === 'film_audio');
  const total = clips.length || 5;
  const doneCount = clips.filter((s) => s.state === 'done').length;
  // PHASE 55 §1 — whole-film percentage across every leg (storyboard → clips →
  // stitch → score), so the canvas shows a live, fluid completion figure.
  const filmPct = useSmoothProgress(stages, reduceMotion ?? false);

  // PHASE 45 §4 — autonomous agent-to-agent dialogue. Pick which handoff beat is
  // narrating right now from genuine pipeline state (no fabricated timeline):
  //   0 → Nano Banano scripting (no clip has started yet)
  //   1 → Director enforcing characterReference into LTX (clips in flight)
  //   2 → Editor syncing Udio + ElevenLabs (all clips done, stitch/score running)
  const anyClipStarted = clips.some((s) => s.state === 'active' || s.state === 'done');
  const allClipsResolved = clips.length > 0 && clips.every((s) => s.state === 'done' || s.state === 'failed' || s.state === 'skipped');
  const audioOrStitchActive =
    stitch?.state === 'active' || stitch?.state === 'done' || score?.state === 'active' || score?.state === 'done';
  const dialogueIndex = (audioOrStitchActive || allClipsResolved) ? 2 : anyClipStarted ? 1 : 0;

  // PHASE 46 §3 — a failed leg takes priority over the forward-progress beat and
  // surfaces an honest degraded line (highest-severity first: stitch > audio >
  // clip). `isDegraded` repaints the strip amber and stops it claiming progress.
  const stitchFailed = stitch?.state === 'failed';
  const scoreFailed = score?.state === 'failed';
  const someClipFailed = clips.some((s) => s.state === 'failed');
  const degradedLine =
    stitchFailed ? FILM_AGENT_FALLBACKS.stitch
    : scoreFailed ? FILM_AGENT_FALLBACKS.audio
    : (someClipFailed && allClipsResolved) ? FILM_AGENT_FALLBACKS.clip
    : null;
  const isDegraded = degradedLine !== null;
  const dialogueLine = degradedLine ?? FILM_AGENT_DIALOGUE[dialogueIndex] ?? FILM_AGENT_DIALOGUE[0];
  const dialogueKey = isDegraded ? `degraded:${stitchFailed ? 's' : scoreFailed ? 'a' : 'c'}` : `beat:${dialogueIndex}`;

  return (
    <motion.aside
      initial={reduceMotion ? { opacity: 0 } : { x: '100%', opacity: 0 }}
      animate={reduceMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 36 }}
      className="fixed inset-0 z-[70] flex flex-col bg-[#050505] lg:static lg:z-auto lg:h-full lg:w-[44%] lg:max-w-[680px] lg:min-w-[380px] lg:shrink-0 lg:border-l lg:border-white/[0.06]"
      aria-label={labels.storyboard}
      aria-busy
    >
      {/* Header — film identity + live scene progress */}
      <div
        className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5"
        style={{ paddingTop: 'calc(0.625rem + env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10"
            style={{ backgroundColor: `${accent}1f`, color: accent }}
          >
            <Film size={15} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-zinc-100">{labels.storyboard}</p>
            <p className="truncate text-[11px] text-zinc-500 tabular-nums">{doneCount}/{total} · {labels.scene}</p>
          </div>
        </div>
        <Loader2 size={16} className="animate-spin text-zinc-500" />
      </div>

      {/* PHASE 55 §1 — whole-film linear tracking bar + live numeric percentage. */}
      <div className="border-b border-white/[0.06] px-3 py-2.5">
        <PercentBar pct={filmPct} accent={accent} failed={isDegraded} />
      </div>

      {/* PHASE 45 §4 — live agent-to-agent dialogue micro-progress strip. The
          three beats narrate the Nano Banano → Director (LTX) → Editor (Udio +
          ElevenLabs) handoff, switching as real pipeline state advances. */}
      <div
        className={`flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 ${isDegraded ? 'bg-amber-500/[0.06]' : 'bg-white/[0.02]'}`}
        aria-live="polite"
        aria-atomic
      >
        <span
          className={`flex h-1.5 w-1.5 shrink-0 rounded-full ${isDegraded ? '' : 'animate-pulse'}`}
          style={{ backgroundColor: isDegraded ? '#f59e0b' : accent }}
          aria-hidden
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={dialogueKey}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.28 }}
            className={`min-w-0 flex-1 truncate text-[11.5px] font-medium leading-5 ${isDegraded ? 'text-amber-300' : 'text-zinc-300'}`}
          >
            {dialogueLine}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Scene filmstrip — one cinematic 16:9 slot per scene, lit per status. */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2.5">
          {clips.map((s, idx) => {
            const ordinal = Number(s.key.slice('clip_'.length)) || idx + 1;
            const st = s.state;
            // PHASE 47 §2 — a landed clip with a playable URL upgrades its slot
            // from a status glyph to live, high-fidelity native playback.
            const hasPreview = st === 'done' && typeof s.previewUrl === 'string' && s.previewUrl.length > 0;
            const recovered = s.recovered === true;
            const frame =
              st === 'done' ? (recovered ? 'border-amber-400/40 bg-amber-400/[0.05]' : 'border-emerald-500/40 bg-emerald-500/[0.05]')
              : st === 'active' ? 'border-white/[0.12] bg-neutral-900'
              : st === 'failed' ? 'border-rose-500/40 bg-rose-500/[0.05]'
              : st === 'skipped' ? 'border-white/[0.06] bg-neutral-950 opacity-50'
              : 'border-dashed border-white/10 bg-neutral-950';
            return (
              <motion.div
                key={s.key}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 30, delay: reduceMotion ? 0 : idx * 0.04 }}
                className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border transition-colors duration-500 ${frame}`}
              >
                {/* indeterminate light sweep while this scene is in flight */}
                {st === 'active' && !reduceMotion ? (
                  <motion.span
                    className="pointer-events-none absolute inset-y-0 w-1/3"
                    style={{ background: `linear-gradient(90deg, transparent, ${accent}1f, transparent)` }}
                    initial={{ x: '-120%' }}
                    animate={{ x: ['-120%', '320%'] }}
                    transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
                  />
                ) : null}

                {/* PHASE 47 §2 — crossfade between the status glyph and the landed
                    clip's live playback. Both occupy the SAME aspect-video box, so
                    the swap is zero-CLS. A recovered scene gets a seamless filter +
                    a vignette so it reads as continuity, never an abrupt cut. */}
                <AnimatePresence mode="wait" initial={false}>
                  {hasPreview ? (
                    <motion.div
                      key="preview"
                      className="absolute inset-0"
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.04 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0.2 : 0.6, ease: 'easeOut' }}
                    >
                      <video
                        src={s.previewUrl ?? undefined}
                        muted
                        loop
                        autoPlay
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover transform-gpu"
                        style={recovered ? { filter: 'saturate(1.06) contrast(1.03) brightness(1.02)' } : undefined}
                      />
                      {/* gradient scrim so the ordinal + label stay legible over video */}
                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25" aria-hidden />
                      {recovered && !reduceMotion ? (
                        <motion.span
                          className="pointer-events-none absolute inset-0"
                          style={{ boxShadow: 'inset 0 0 48px rgba(245,158,11,0.18)' }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: [0, 1, 0.6] }}
                          transition={{ duration: 1.1, ease: 'easeInOut' }}
                          aria-hidden
                        />
                      ) : null}
                    </motion.div>
                  ) : (
                    <motion.span
                      key="glyph"
                      className="relative flex h-9 w-9 items-center justify-center"
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <FilmLegGlyph state={st} accent={accent} size={st === 'done' ? 22 : 20} />
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* scene ordinal badge */}
                <span className="absolute left-2.5 top-2 z-10 text-[11px] font-bold tabular-nums tracking-wide text-zinc-300 mix-blend-plus-lighter">
                  {String(ordinal).padStart(2, '0')}
                </span>

                {/* PHASE 47 §2 — recovered-scene chip: honest signal that this beat
                    was re-rendered on-model to keep the cut continuous. */}
                {recovered ? (
                  <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                    <RotateCcw size={9} /> recovered
                  </span>
                ) : null}

                {/* scene label */}
                <span className="absolute bottom-2 left-2.5 z-10 text-[11px] font-medium text-zinc-300">
                  {labels.scene} {ordinal}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Footer — Editor (stitch) leg + cohesive Score leg. */}
      <div
        className="border-t border-white/[0.06] px-3 py-2.5"
        style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center gap-2 text-[12px]">
          <span className="flex h-4 w-4 items-center justify-center flex-shrink-0">
            <FilmLegGlyph state={stitch?.state ?? 'pending'} accent={accent} />
          </span>
          <span className="text-zinc-400">{labels.stitching}</span>
          {score && score.state !== 'skipped' ? (
            <span className="ml-auto flex items-center gap-1.5 text-zinc-500">
              <Music size={12} />
              <FilmLegGlyph state={score.state} accent={accent} size={13} />
            </span>
          ) : null}
        </div>
      </div>
    </motion.aside>
  );
}

/* ─── PHASE 55 §1 — Real-time percentage progression.
 * A smooth, mathematically sound asymptotic loader bound to GENUINE pipeline
 * state — not a blind timer. Every completed stage sets a hard floor; the
 * in-flight stage lets the bar crawl (easing out) into, but never complete, its
 * own slice; the bar snaps to 100% the instant the backend confirms every stage
 * done. The exponential ease produces the desired feel — a rapid early climb,
 * a steady advance through the middle, then a crisp snap-completion — without
 * ever fabricating a number ahead of the real lifecycle phase. */
function useSmoothProgress(stages: PipelineStage[], reduceMotion = false): number {
  const visible = stages.filter((s) => s.state !== 'skipped');
  const total = Math.max(1, visible.length);
  const done = visible.filter((s) => s.state === 'done').length;
  const active = visible.some((s) => s.state === 'active');
  const allDone = done >= total;

  // Real completion floor + the headroom the in-flight stage may crawl into.
  const slice = 100 / total;
  const floor = done * slice;
  const cap = allDone ? 100 : Math.min(97, floor + (active ? slice * 0.94 : slice * 0.25));

  const [pct, setPct] = useState(() => Math.round(floor));
  const valueRef = useRef(floor);
  const shownRef = useRef(Math.round(floor));

  useEffect(() => {
    if (reduceMotion) {
      const target = Math.round(allDone ? 100 : cap);
      valueRef.current = target;
      shownRef.current = target;
      setPct(target);
      return;
    }
    let frame = 0;
    const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let last = clock();
    const tick = () => {
      const now = clock();
      const dt = Math.min(0.12, (now - last) / 1000);
      last = now;
      // A just-completed stage snaps the floor up immediately; otherwise ease
      // exponentially toward the cap (fast far away, slow near it).
      let next = Math.max(valueRef.current, floor);
      const k = allDone ? 9 : 1.1;
      next = Math.min(next + (cap - next) * Math.min(1, dt * k), allDone ? 100 : cap);
      valueRef.current = next;
      const r = Math.round(next);
      if (r !== shownRef.current) { shownRef.current = r; setPct(r); }
      if (allDone && next >= 99.6) { valueRef.current = 100; if (shownRef.current !== 100) { shownRef.current = 100; setPct(100); } return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [floor, cap, allDone, reduceMotion]);

  return pct;
}

/* A sleek horizontal linear tracking bar + live numeric percentage. The fill
 * width is CSS-transitioned so the integer ticks read as one fluid climb. */
function PercentBar({ pct, accent, failed = false }: { pct: number; accent: string; failed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%`, backgroundColor: failed ? '#f43f5e' : accent }}
        />
      </div>
      <span
        className="w-9 shrink-0 text-right text-[12px] font-semibold tabular-nums"
        style={{ color: failed ? '#fb7185' : accent }}
      >
        {pct}%
      </span>
    </div>
  );
}

/* ─── Live render telemetry — a per-stage progress strip bound to genuine
 * backend status (derivePipeline). Each row reflects a real lifecycle phase:
 * analysis → audio synthesis → GPU render, fronted by the §1 percentage bar. */

function PipelineTelemetry({
  stages, lang, accent,
}: {
  stages: PipelineStage[];
  lang: 'en' | 'ka' | 'ru';
  accent: string;
}) {
  const reduceMotion = useReducedMotion();
  const visible = stages.filter((s) => s.state !== 'skipped');
  const failed = visible.some((s) => s.state === 'failed');
  const pct = useSmoothProgress(stages, reduceMotion ?? false);

  return (
    // PHASE 53 §7 — cohesive Obsidian Black (#0A0A0A) loading card with the same
    // hairline Metallic Gold (#D4AF37) border as the shaped MediaSkeleton, so the
    // whole render-status surface (Pending → Generating → Stitched) reads as one
    // luxury loading language.
    <div className="w-full max-w-sm rounded-2xl border border-[#D4AF37]/25 bg-[#0A0A0A] p-3 flex flex-col gap-3">
      {/* PHASE 55 §1 — single sleek linear tracking bar + live numeric percentage,
          asymptotically tied to genuine lifecycle phases (useSmoothProgress). */}
      <PercentBar pct={pct} accent={accent} failed={failed} />

      {/* Per-stage labels, bound to the same backend status. */}
      <div className="flex flex-col gap-2">
        {visible.map((s) => {
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
    </div>
  );
}

/* ─── Shaped skeleton loaders — the placeholder assumes the exact shape of the
 * incoming asset (9:16 for avatar, square for image, 16:9 for film, waveform for
 * audio) so the real preview lands with zero layout shift. */

function MediaSkeleton({ mode, accent }: { mode: ServiceMode; accent: string }) {
  // PHASE 52 TASK 4a — every loading block is re-skinned to a highly responsive
  // shimmering skeleton framed in solid Obsidian Black (#0A0A0A) with a hairline
  // Metallic Gold (#D4AF37) border. `obsidian` = surface + hairline; `shimmer` =
  // the gold light-sweep overlay (reuses the shipped `shimmer` keyframe).
  const obsidian = 'bg-[#0A0A0A] border border-[#D4AF37]/25';
  const shimmer =
    'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite] before:bg-gradient-to-r before:from-transparent before:via-[#D4AF37]/15 before:to-transparent';

  // Chat → slim text shimmer.
  if (mode === 'global') {
    return (
      <div className="flex items-center gap-2.5">
        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: accent }} />
        <div className="flex flex-col gap-1.5">
          <span className={`h-2.5 w-40 rounded ${obsidian} ${shimmer}`} />
          <span className={`h-2.5 w-24 rounded ${obsidian} ${shimmer}`} />
        </div>
      </div>
    );
  }

  // Music / Voice → sleek shimmering waveform on an obsidian/gold card.
  if (mode === 'music' || mode === 'voice') {
    return (
      <div className={`w-full max-w-sm rounded-2xl p-3 ${obsidian}`}>
        <div className="flex items-center gap-2 pb-2 text-[12px] text-zinc-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: accent }} />
          <span>{mode === 'voice' ? 'Synthesizing voice…' : 'Composing…'}</span>
        </div>
        <div className="flex items-end gap-[3px] h-12">
          {Array.from({ length: 32 }).map((_, i) => (
            <span
              key={i}
              className="flex-1 rounded-full bg-[#D4AF37]/25 animate-pulse"
              style={{ height: `${25 + ((i * 41) % 70)}%`, animationDelay: `${(i % 8) * 90}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Image / Video / Avatar → a shimmering block in the exact future aspect ratio.
  const shape =
    mode === 'avatar' ? 'aspect-[9/16] w-full max-w-[320px]'
    : mode === 'image' ? 'aspect-square w-full max-w-[280px]'
    : 'aspect-video w-full max-w-full';
  return (
    <div className={`rounded-2xl ${obsidian} ${shimmer} ${shape}`}>
      <span className="absolute inset-0 z-[1] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
      </span>
    </div>
  );
}
