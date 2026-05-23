'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Library as LibraryIcon,
  User as UserIcon,
  ImageIcon,
  Music as MusicIcon,
  Code as CodeIcon,
  Video as VideoIcon,
  Sofa as SofaIcon,
  Mic,
  Plus,
  Paperclip,
  Send,
  Volume2,
  Loader2,
  X,
  Copy,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Settings,
  LogOut,
  Check,
  Home as HomeIcon,
  HelpCircle,
  ChevronRight,
  RefreshCw,
  Sparkles,
  ChevronDown,
  Clock,
  Mic2,
  Brain,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/browser';
import InlineMedia, { detectInlineMedia } from './InlineMedia';
import UpgradeModal from './UpgradeModal';
import OnboardingModal from './OnboardingModal';
import PromptChips from './PromptChips';
import ActivityDashboard from '@/components/dashboard/ActivityDashboard';
import ExportPackModal from './ExportPackModal';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import RateLimitBanner from '@/components/dashboard/RateLimitBanner';
import ReferralPanel from '@/components/dashboard/ReferralPanel';
import InviteReferralBanner from '@/components/dashboard/InviteReferralBanner';
import { useRateLimit } from '@/hooks/useRateLimit';
import { analytics } from '@/components/analytics/PostHogProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

type Locale = 'ka' | 'en' | 'ru';
type View = 'chat' | 'library' | 'pricing' | 'activity' | 'admin';
// `chat` is the default Agent-G conversation mode (not a service).
// `app` covers code/app creation (legacy id `code` aliased server-side).
// The seven generation services exposed in the Hub: avatar / image / video /
// music / voice / interior / app — Agent G routes user intent to these.
type ServiceId = 'chat' | 'avatar' | 'image' | 'video' | 'music' | 'voice' | 'interior' | 'app';
type OrbState = 'idle' | 'listening' | 'speaking';
type LibraryFilter = 'all' | 'images' | 'videos' | 'audio' | 'avatars';
type ModelId = 'gemini-2.0-flash' | 'gemini-2.0-pro' | 'gemini-1.5-ultra';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  media?:
    | { kind: 'image'; url: string }
    | { kind: 'video'; url: string }
    | { kind: 'audio'; url: string }
    | { kind: 'code'; html: string; language?: string };
  service?: ServiceId;
  pending?: boolean;
  liked?: boolean;
  disliked?: boolean;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  retryFn?: () => void;
}

interface PipelineTask {
  taskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'partial';
  progress: {
    percent: number;
    completedSteps: number;
    totalSteps: number;
    currentStepKa?: string | null;
    etaRemainingSeconds?: number;
  };
  summaryKa?: string;
}

interface CommandCenterProps {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HISTORY_KEY = 'agentg_chat_history';

const COPY = {
  ka: {
    title: 'myavatar.ge',
    agentLabel: 'Agent G',
    standby: 'STANDBY',
    voiceTextMode: 'Voice & Text Mode',
    tabs: { chat: 'ჩატი', library: 'ბიბლიოთეკა', pricing: 'გეგმები', activity: 'აქტივობა' },
    creditsRemaining: 'კრედიტი დარჩა',
    monthlyReset: '10,000 ყოველთვიური · განახლება 18 დღეში',
    services: { chat: 'ჩატი', avatar: 'ავატარის შექმნა', image: 'ფოტოს შექმნა', video: 'ვიდეოს შექმნა', music: 'მუსიკის შექმნა', voice: 'ხმის', interior: 'ინტერიერის დიზაინი', app: 'აპლიკაციის შექმნა' },
    aiServices: 'AI სერვისები',
    placeholder: 'დაწერე ან ილაპარაკე...',
    sending: 'იგზავნება...',
    listening: 'ვუსმენ...',
    emptyHint: 'რა შევქმნათ დღეს?',
    libraryEmpty: 'ბიბლიოთეკა ცარიელია',
    historyEmpty: 'ჯერ ისტორია არ არის',
    errorGeneric: 'შეცდომა მოხდა. სცადეთ თავიდან.',
    insufficient: 'არასაკმარისი კრედიტი. გთხოვ გეგმა განაახლე.',
    copied: 'კოპირებულია!',
    today: 'TODAY',
    yesterday: 'YESTERDAY',
    last7: 'LAST 7 DAYS',
    older: 'OLDER',
    profile: 'Profile',
    recentConversations: 'Recent conversations',
    newChat: '+ New chat',
    settings: 'Settings',
    signOut: 'Sign out',
    model: 'MODEL',
    mediaLibrary: 'Media Library',
    helpDocs: 'Help & Docs',
    close: 'დახურვა',
    starter: 'STARTER',
    filterAll: 'ყველა',
    filterImages: 'სურათები',
    filterVideos: 'ვიდეო',
    filterAudio: 'აუდიო',
    filterAvatars: 'ავატარები',
    free: 'Free',
    pro: 'Pro',
    business: 'Business',
    plan: 'Plan',
  },
  en: {
    title: 'myavatar.ge',
    agentLabel: 'Agent G',
    standby: 'STANDBY',
    voiceTextMode: 'Voice & Text Mode',
    tabs: { chat: 'Chat', library: 'Library', pricing: 'Plans', activity: 'Activity' },
    creditsRemaining: 'CREDITS REMAINING',
    monthlyReset: '10,000 monthly · resets in 18 days',
    services: { chat: 'Chat', avatar: 'Avatar', image: 'Photo', video: 'Video', music: 'Music', voice: 'Voice', interior: 'Interior Design', app: 'App Creation' },
    aiServices: 'AI Services',
    placeholder: 'Type or speak your command...',
    sending: 'Sending...',
    listening: 'Listening...',
    emptyHint: 'What shall we create today?',
    libraryEmpty: 'Library is empty',
    historyEmpty: 'No history yet',
    errorGeneric: 'Something went wrong. Try again.',
    insufficient: 'Insufficient credits. Please upgrade your plan.',
    copied: 'Copied!',
    today: 'TODAY',
    yesterday: 'YESTERDAY',
    last7: 'LAST 7 DAYS',
    older: 'OLDER',
    profile: 'Profile',
    recentConversations: 'Recent conversations',
    newChat: '+ New chat',
    settings: 'Settings',
    signOut: 'Sign out',
    model: 'MODEL',
    mediaLibrary: 'Media Library',
    helpDocs: 'Help & Docs',
    close: 'Close',
    starter: 'STARTER',
    filterAll: 'All',
    filterImages: 'Images',
    filterVideos: 'Videos',
    filterAudio: 'Audio',
    filterAvatars: 'Avatars',
    free: 'Free',
    pro: 'Pro',
    business: 'Business',
    plan: 'Plan',
  },
  ru: {
    title: 'myavatar.ge',
    agentLabel: 'Agent G',
    standby: 'STANDBY',
    voiceTextMode: 'Голос & Текст',
    tabs: { chat: 'Чат', library: 'Библиотека', pricing: 'Тарифы', activity: 'Активность' },
    creditsRemaining: 'ОСТАЛОСЬ КРЕДИТОВ',
    monthlyReset: '10,000 в месяц · обновление через 18 дней',
    services: { chat: 'Чат', avatar: 'Аватар', image: 'Фото', video: 'Видео', music: 'Музыка', voice: 'Голос', interior: 'Интерьер', app: 'Приложение' },
    aiServices: 'AI Сервисы',
    placeholder: 'Напишите или скажите команду...',
    sending: 'Отправка...',
    listening: 'Слушаю...',
    emptyHint: 'Что создадим сегодня?',
    libraryEmpty: 'Библиотека пуста',
    historyEmpty: 'История пуста',
    errorGeneric: 'Что-то пошло не так. Попробуй снова.',
    insufficient: 'Недостаточно кредитов. Обнови тариф.',
    copied: 'Скопировано!',
    today: 'TODAY',
    yesterday: 'YESTERDAY',
    last7: 'LAST 7 DAYS',
    older: 'OLDER',
    profile: 'Профиль',
    recentConversations: 'Недавние разговоры',
    newChat: '+ Новый чат',
    settings: 'Настройки',
    signOut: 'Выйти',
    model: 'МОДЕЛЬ',
    mediaLibrary: 'Медиатека',
    helpDocs: 'Помощь',
    close: 'Закрыть',
    starter: 'STARTER',
    filterAll: 'Все',
    filterImages: 'Изображения',
    filterVideos: 'Видео',
    filterAudio: 'Аудио',
    filterAvatars: 'Аватары',
    free: 'Бесплатно',
    pro: 'Pro',
    business: 'Business',
    plan: 'Тариф',
  },
} as const;

const SERVICE_COSTS: Record<ServiceId, number> = {
  chat: 1, voice: 5, app: 8, image: 10, music: 15, avatar: 20, interior: 25, video: 50,
};

const SERVICE_ICONS: Record<ServiceId, React.ElementType> = {
  chat: HomeIcon, avatar: UserIcon, image: ImageIcon,
  video: VideoIcon, music: MusicIcon, voice: Volume2,
  interior: SofaIcon, app: CodeIcon,
};

// Service accent colors — each agent gets its own identity for the history feed
const SERVICE_COLORS: Record<ServiceId, string> = {
  chat: '#0ea5e9', avatar: '#38bdf8', image: '#06b6d4',
  video: '#f97316', music: '#f59e0b', voice: '#3b82f6',
  interior: '#14b8a6', app: '#10b981',
};

const MODELS: Array<{ id: ModelId; label: string; badge: string; badgeColor: string }> = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', badge: 'FAST', badgeColor: '#22c55e' },
  { id: 'gemini-2.0-pro', label: 'Gemini 2.0 Pro', badge: 'PRO', badgeColor: '#0ea5e9' },
  { id: 'gemini-1.5-ultra', label: 'Gemini 1.5 Ultra', badge: 'BEST', badgeColor: '#f59e0b' },
];

// Quick-pick services shown on the standby screen — the 4 most-used.
// The full 7 are reachable from the Hub drawer below.
const QUICK_SERVICES: ServiceId[] = ['avatar', 'image', 'video', 'music'];

// ElevenLabs Georgian voices
const ELEVENLABS_VOICES = [
  { id: 'pMsXgVXv3BLzUgSXRplE', name: 'Nino (Georgian)', lang: 'ka' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (English)', lang: 'en' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (English)', lang: 'en' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (English)', lang: 'en' },
] as const;

// Music style presets
const MUSIC_PRESETS = [
  { id: 'georgian-folk', label: '🎻 ქართული ხალხური', prompt: 'Georgian folk music, traditional instruments, panduri, chonguri, polyphony' },
  { id: 'electronic', label: '⚡ ელექტრონული', prompt: 'Electronic dance music, synthesizer, bass, modern beats' },
  { id: 'cinematic', label: '🎬 კინოსტილი', prompt: 'Cinematic orchestral score, epic, dramatic, strings and brass' },
  { id: 'pop', label: '🎵 პოპი', prompt: 'Contemporary pop music, catchy melody, upbeat rhythm' },
] as const;

// Video aspect ratios
const VIDEO_ASPECTS = [
  { id: '16:9', label: '16:9', icon: '▭', desc: 'Landscape' },
  { id: '9:16', label: '9:16', icon: '▯', desc: 'Portrait/Reel' },
  { id: '1:1', label: '1:1', icon: '□', desc: 'Square' },
] as const;

// Video durations
const VIDEO_DURATIONS = [5, 8, 12] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeLocale(loc: string): Locale {
  if (loc === 'en' || loc === 'ru') return loc;
  return 'ka';
}

function mkId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins} min ago`;
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return `Yesterday ${formatTime(ts)}`;
  const d = new Date(ts);
  return d.toLocaleDateString('en', { weekday: 'short' });
}

function dayBucket(ts: number): 'today' | 'yesterday' | 'last7' | 'older' {
  const diff = Math.floor((Date.now() - ts) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return 'last7';
  return 'older';
}

function sameDay(a: number, b: number) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function bucketLabel(bucket: ReturnType<typeof dayBucket>, copy: (typeof COPY)[Locale]): string {
  return copy[bucket === 'today' ? 'today' : bucket === 'yesterday' ? 'yesterday' : bucket === 'last7' ? 'last7' : 'older'];
}

// Agent G intent router — when the user types freely, Agent G inspects the
// text and delegates to the matching specialist agent. The seven services are
// avatar / image / video / music / voice / interior / app.
function detectSkillFromText(text: string): ServiceId | null {
  if (/\b(draw|paint|generate image|create image|make image|photo|სურათი|დახატე|ფოტო|нарисуй|фото)\b/i.test(text)) return 'image';
  if (/\b(create video|make video|generate video|animate|ვიდეო|видео)\b/i.test(text)) return 'video';
  if (/\b(compose|create music|make song|generate music|მუსიკა|музыка)\b/i.test(text)) return 'music';
  if (/\b(avatar|talking head|ავატარი|აავტარი|аватар)\b/i.test(text)) return 'avatar';
  if (/\b(speak|read aloud|say this|voice|text to speech|წაიკითხე|ხმა|прочитай)\b/i.test(text)) return 'voice';
  if (/\b(interior|room|bedroom|living room|kitchen|ინტერიერი|დიზაინი|ოთახი|интерьер|комната)\b/i.test(text)) return 'interior';
  if (/\b(app|application|web app|website|code|build app|აპლიკაცია|აპი|ვებსაიტი|приложение|сайт)\b/i.test(text)) return 'app';
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommandCenter({ locale, userName, isAuthenticated }: CommandCenterProps) {
  const localeCode = normalizeLocale(locale);
  const copy = COPY[localeCode];

  const [view, setView] = useState<View>('chat');
  const [activeService, setActiveService] = useState<ServiceId>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [credits, setCredits] = useState(200); // default Starter allowance; updated on mount
  const [isRecording, setIsRecording] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [voiceMode, setVoiceMode] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelId>('gemini-2.0-flash');

  // Drawer / overlay state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);

  // Async pipeline task
  const [pipelineTask, setPipelineTask] = useState<PipelineTask | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Library
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [dbCreations, setDbCreations] = useState<Array<{ id: string; kind: string; service: string; url: string | null; thumbnail_url: string | null; prompt: string | null; created_at: string }>>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Upgrade modal
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeCreditsNeeded, setUpgradeCreditsNeeded] = useState<number | undefined>(undefined);

  // Voice selection
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(ELEVENLABS_VOICES[0].id);
  const [voiceDropdownOpen, setVoiceDropdownOpen] = useState(false);

  // Music style preset
  const [musicPreset, setMusicPreset] = useState<string | null>(null);

  // Video options
  const [videoAspect, setVideoAspect] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [videoDuration, setVideoDuration] = useState<5 | 8 | 12>(5);

  // Character references for @mention
  const [characters, setCharacters] = useState<Array<{ id: string; name: string; slug: string; image_url: string }>>([]);
  const [charSuggestions, setCharSuggestions] = useState<typeof characters>([]);

  // Batch mode (image → 4 variations)
  const [batchMode, setBatchMode] = useState(false);
  const [batchResults, setBatchResults] = useState<Array<{ url: string; creationId: string | null }>>([]);

  // Export pack modal
  const [exportPackOpen, setExportPackOpen] = useState(false);

  // Admin check (by email stored in profile/user)
  const [isAdmin, setIsAdmin] = useState(false);

  // Onboarding
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Rate limit (Starter plan: 50 gen/day)
  const rateLimit = useRateLimit(isAuthenticated);
  const [rateLimitDismissed, setRateLimitDismissed] = useState(false);
  const [monthlyAllowance, setMonthlyAllowance] = useState(200);
  const [creditsResetAt, setCreditsResetAt] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string, type: Toast['type'] = 'success', retryFn?: () => void) => {
    const id = mkId();
    const ttl = type === 'error' ? 6000 : 3000;
    setToasts(t => [...t, { id, message, type, retryFn }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ttl);
  }, []);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);

  // Load persisted messages
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed.slice(-40));
      }
    } catch { /* ignore */ }
  }, []);

  // Persist messages
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.filter(m => !m.pending).slice(-40)));
    } catch { /* ignore */ }
  }, [messages]);

  // Escape closes drawers + dropdowns
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHistoryOpen(false); setProfileOpen(false); setHubOpen(false);
        setVoiceDropdownOpen(false); setCharSuggestions([]);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Check if user is admin
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/admin/creations-stats', { credentials: 'include' })
      .then(r => { if (r.ok) setIsAdmin(true); })
      .catch(() => {});
  }, [isAuthenticated]);

  // Auto-redeem referral code stored from signup URL (?ref=CODE)
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;
    const pendingCode = localStorage.getItem('agentg_pending_referral');
    if (!pendingCode) return;
    // Clear immediately to prevent double-redeem on refresh
    localStorage.removeItem('agentg_pending_referral');
    fetch('/api/referral/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code: pendingCode }),
    })
      .then(r => r.json())
      .then((d: { success?: boolean; bonusCredits?: number; message?: string; alreadyRedeemed?: boolean }) => {
        if (d.success && d.message) {
          showToast(d.message, 'success');
          analytics.referralRedeemed(pendingCode);
        }
        // alreadyRedeemed or code not found — silently ignore
      })
      .catch(() => {});
  }, [isAuthenticated, showToast]);

  // Show onboarding for first-time visitors
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onboarded = localStorage.getItem('agentg_onboarded');
    if (!onboarded) {
      const t = setTimeout(() => setOnboardingOpen(true), 800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  // Load character references for @mention
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/character/reference')
      .then(r => r.ok ? r.json() : { characters: [] })
      .then((d: { characters?: Array<{ id: string; name: string; slug: string; image_url: string }> }) => {
        setCharacters(d.characters ?? []);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  // @mention detection in input
  useEffect(() => {
    const match = input.match(/@(\w*)$/);
    if (match) {
      const query = (match[1] ?? '').toLowerCase();
      setCharSuggestions(characters.filter(c => c.name.toLowerCase().includes(query) || c.slug.includes(query)).slice(0, 5));
    } else {
      setCharSuggestions([]);
    }
  }, [input, characters]);

  // Supabase Realtime — subscribe to credit updates from profiles table
  useEffect(() => {
    if (!isAuthenticated) return;
    const supabase = createBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel('profile-credits')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: { new?: { credits?: number; credits_remaining?: number } }) => {
          const newCredits = payload.new?.credits ?? payload.new?.credits_remaining;
          if (typeof newCredits === 'number') {
            setCredits(newCredits);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAuthenticated]);

  // Fetch real credit balance on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/credits/balance', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: { balance?: number; monthlyAllowance?: number; resetAt?: string } | null) => {
        if (typeof d?.balance === 'number') setCredits(d.balance);
        if (typeof d?.monthlyAllowance === 'number') setMonthlyAllowance(d.monthlyAllowance);
        if (d?.resetAt) setCreditsResetAt(d.resetAt);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  // Load persisted creations from DB when Library tab is opened
  useEffect(() => {
    if (view !== 'library' || !isAuthenticated) return;
    setLibraryLoading(true);
    fetch('/api/creations?limit=50', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { creations: [] })
      .then((d: { creations?: Array<{ id: string; kind: string; service: string; url: string | null; thumbnail_url: string | null; prompt: string | null; created_at: string }> }) => {
        setDbCreations(d.creations ?? []);
      })
      .catch(() => {})
      .finally(() => setLibraryLoading(false));
  }, [view, isAuthenticated]);

  // Pipeline task polling
  useEffect(() => {
    if (!pipelineTask) return;
    if (pipelineTask.status === 'completed' || pipelineTask.status === 'failed' || pipelineTask.status === 'partial') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }

    // Keep-alive ping every 25s for long tasks (prevents tab suspension)
    const keepAlive = setInterval(() => { void fetch('/api/version', { cache: 'no-store' }).catch(() => {}); }, 25_000);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${pipelineTask.taskId}/status`);
        if (!res.ok) return;
        const data = await res.json() as {
          status: string;
          progress: {
            percent: number; completedSteps: number; totalSteps: number;
            currentStepKa?: string | null; etaRemainingSeconds?: number;
          };
          plan?: { summaryKa?: string };
        };
        setPipelineTask(prev => prev ? {
          ...prev,
          status: data.status as PipelineTask['status'],
          progress: data.progress,
          summaryKa: data.plan?.summaryKa ?? prev.summaryKa,
        } : null);

        if (data.status === 'completed' || data.status === 'partial') {
          clearInterval(pollRef.current!); clearInterval(keepAlive);
          pollRef.current = null;
          showToast('✅ Agent G-მ წარმატებით შეასრულა დავალება!', 'success');
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current!); clearInterval(keepAlive);
          pollRef.current = null;
          showToast('❌ დავალება ვერ შესრულდა. სცადეთ ხელახლა.', 'error');
        }
      } catch { /* ignore transient poll error */ }
    }, 3000);

    return () => {
      clearInterval(keepAlive);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [pipelineTask, showToast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setAttachedImage({ base64: reader.result as string, mimeType: file.type });
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const send = useCallback(async (rawText: string, forcedService?: ServiceId) => {
    const text = rawText.trim();
    if (!text || sending) return;

    let service = forcedService ?? activeService;
    if (service === 'chat' && !forcedService) {
      const det = detectSkillFromText(text);
      if (det) { service = det; setActiveService(det); }
    }

    const cost = SERVICE_COSTS[service];
    if (credits < cost) {
      setUpgradeCreditsNeeded(cost);
      setUpgradeOpen(true);
      return;
    }

    // Daily generation limit check (Starter plan: 50/day)
    if (rateLimit.isAtLimit) {
      showToast('დღის ლიმიტი ამოიწურა (50 გენ/დღე Starter-ზე). Pro-ზე გადასვლა: /pricing', 'error');
      setRateLimitDismissed(false); // re-show banner
      return;
    }

    const userMsg: ChatMessage = { id: mkId(), role: 'user', content: text, ts: Date.now(), service };
    const pendingMsg: ChatMessage = { id: mkId(), role: 'assistant', content: '', ts: Date.now() + 1, service, pending: true };

    setMessages(m => [...m, userMsg, pendingMsg]);
    setInput('');
    setBatchResults([]); // clear any previous batch grid on new generation
    setSending(true);
    setOrbState('speaking');

    let mediaGenerated = false; // tracks if a non-chat generation succeeded (for rate limit)
    const genStartTime = Date.now();
    analytics.generationStarted(service, cost);
    analytics.prompt(service, text);
    try {
      if (service === 'avatar') {
        const startRes = await fetch('/api/heygen/avatar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: text }),
        });
        const startData = await startRes.json() as { videoId?: string; error?: string };
        if (!startData?.videoId) throw new Error(startData?.error || copy.errorGeneric);
        let videoUrl: string | null = null;
        for (let i = 0; i < 24; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const poll = await fetch(`/api/heygen/avatar?videoId=${encodeURIComponent(startData.videoId)}`);
          if (!poll.ok) continue;
          const pd = await poll.json() as { status?: string; url?: string; error?: string };
          if (pd?.status === 'completed' && pd?.url) { videoUrl = pd.url; break; }
          if (pd?.status === 'failed') throw new Error(pd?.error || copy.errorGeneric);
        }
        if (!videoUrl) throw new Error('HeyGen: timed out');
        setMessages(m => m.map(msg => msg.id === pendingMsg.id ? { ...msg, pending: false, content: '', media: { kind: 'video', url: videoUrl! } } : msg));
        setCredits(c => c - cost);
        mediaGenerated = true;

      } else if (service === 'image') {
        if (batchMode) {
          // Batch: 4 variations in parallel
          const batchCost = cost * 4;
          if (credits < batchCost) {
            setUpgradeCreditsNeeded(batchCost);
            setUpgradeOpen(true);
            setMessages(m => m.filter(x => x.id !== pendingMsg.id && x.id !== userMsg.id));
            return;
          }
          setMessages(m => m.map(msg => msg.id === pendingMsg.id
            ? { ...msg, pending: true, content: '🎨 4 ვარიაციას ვქმნი...' }
            : msg
          ));
          const batchRes = await fetch('/api/creations/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text, count: 4 }),
          });
          const batchData = await batchRes.json() as {
            results?: Array<{ url: string; creationId: string | null }>;
            error?: string;
          };
          if (!batchRes.ok || !batchData.results?.length) throw new Error(batchData.error || copy.errorGeneric);
          setBatchResults(batchData.results);
          const firstUrl = batchData.results[0]!.url;
          setMessages(m => m.map(msg => msg.id === pendingMsg.id
            ? { ...msg, pending: false, content: `✅ 4 ვარიაცია შეიქმნა! (${batchData.results?.length ?? 0}/4)`, media: { kind: 'image', url: firstUrl } }
            : msg
          ));
          setCredits(c => c - batchCost);
          mediaGenerated = true;
        } else {
          const res = await fetch('/api/replicate/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text }) });
          const data = await res.json() as { url?: string; imageUrl?: string; output?: string[]; data?: { url?: string }; error?: string };
          const url = data?.url || data?.imageUrl || data?.output?.[0] || data?.data?.url;
          if (!url) throw new Error(data?.error || copy.errorGeneric);
          setMessages(m => m.map(msg => msg.id === pendingMsg.id ? { ...msg, pending: false, content: '', media: { kind: 'image', url } } : msg));
          setCredits(c => c - cost);
          mediaGenerated = true;
          // Auto-save to creations
          void fetch('/api/creations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'image', service: 'image', prompt: text, url, thumbnail_url: url, credits_used: cost }) });
        }

      } else if (service === 'music') {
        const musicPrompt = musicPreset
          ? `${text}. Style: ${MUSIC_PRESETS.find(p => p.id === musicPreset)?.prompt ?? ''}`
          : text;
        const res = await fetch('/api/udio/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: musicPrompt, make_instrumental: false }) });
        const data = await res.json() as { url?: string; audioUrl?: string; error?: string };
        const url = data?.url || data?.audioUrl;
        if (!url) throw new Error(data?.error || copy.errorGeneric);
        setMessages(m => m.map(msg => msg.id === pendingMsg.id ? { ...msg, pending: false, content: '', media: { kind: 'audio', url } } : msg));
        setCredits(c => c - cost);
        mediaGenerated = true;
        // Auto-save to creations
        void fetch('/api/creations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'audio', service: 'music', prompt: musicPrompt, url, thumbnail_url: url, credits_used: cost }) });

      } else if (service === 'video') {
        const res = await fetch('/api/ltx-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text, aspect_ratio: videoAspect, duration: videoDuration }) });
        if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e?.error || copy.errorGeneric); }
        const url = URL.createObjectURL(await res.blob());
        setMessages(m => m.map(msg => msg.id === pendingMsg.id ? { ...msg, pending: false, content: '', media: { kind: 'video', url } } : msg));
        setCredits(c => c - cost);
        mediaGenerated = true;
        // Track video generation in creations (blob URL is ephemeral — persist prompt only)
        void fetch('/api/creations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'video', service: 'video', prompt: text, credits_used: cost }) });

      } else if (service === 'voice') {
        const res = await fetch('/api/elevenlabs/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, locale: localeCode, voiceId: selectedVoiceId }) });
        if (!res.ok) throw new Error(copy.errorGeneric);
        const url = URL.createObjectURL(await res.blob());
        setMessages(m => m.map(msg => msg.id === pendingMsg.id ? { ...msg, pending: false, content: '🔊 Audio ready', media: { kind: 'audio', url } } : msg));
        setCredits(c => c - cost);
        mediaGenerated = true;
        // Note: blob URLs are ephemeral (session-only), so we don't persist to creations DB

      } else if (service === 'interior') {
        // Interior Design agent. Two paths:
        //  1. Full 3D experience via WorldLabs needs a room photo upload +
        //     multi-step confirmation flow — that lives on the dedicated
        //     /[locale]/services/interior page.
        //  2. Quick 2D interior render from chat — we augment the prompt with
        //     "modern interior design, architectural photography" cues and
        //     route to the regular image endpoint. Returns a real interior
        //     image inline.
        const augmented = `interior design render, ${text}, architectural photography, professional lighting, ultra detailed, 4k, photorealistic`;
        const res = await fetch('/api/replicate/image', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: augmented, quality: 'standard', ratio: '16:9' }),
        });
        const data = await res.json() as { url?: string; imageUrl?: string; output?: string[]; error?: string };
        const url = data?.url || data?.imageUrl || data?.output?.[0];
        if (!url) throw new Error(data?.error || copy.errorGeneric);
        setMessages(m => m.map(msg => msg.id === pendingMsg.id ? { ...msg, pending: false, content: '', media: { kind: 'image', url } } : msg));
        setCredits(c => c - cost);
        mediaGenerated = true;
        void fetch('/api/creations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'image', service: 'interior', prompt: text, url, thumbnail_url: url, credits_used: cost }) });

      } else if (service === 'app') {
        // Agent G → App Creation agent. Asks Gemini to return self-contained
        // HTML + inline CSS + JS. Renders as an inline interactive preview
        // (sandboxed iframe) via InlineMedia kind="code".
        const codePrompt = `You are a senior frontend engineer. Produce a single self-contained HTML document (with inline CSS and JS, no external assets) that fully implements the following request. Return ONLY the HTML — no markdown fences, no commentary.\n\nRequest: ${text}`;
        const res = await fetch('/api/chat/gemini', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: codePrompt }] }),
        });
        if (!res.ok || !res.body) throw new Error(copy.errorGeneric);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '', buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line.startsWith('data: ')) {
              try {
                const j = JSON.parse(line.slice(6)) as { type?: string; textDelta?: string };
                if (j.type === 'text-delta' && j.textDelta) accumulated += j.textDelta;
              } catch { /* tolerate non-JSON SSE lines */ }
            }
          }
        }
        // Strip any accidental markdown fences and trim
        const html = accumulated
          .replace(/^```(?:html)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();
        if (!html) throw new Error(copy.errorGeneric);
        setMessages(m => m.map(msg => msg.id === pendingMsg.id ? { ...msg, pending: false, content: '', media: { kind: 'code', html, language: 'html' } } : msg));
        setCredits(c => c - cost);
        mediaGenerated = true;

      } else {
        // chat / text / code → Gemini streaming SSE
        type Part = { type: 'text'; text: string } | { type: 'image'; image: string; mimeType: string };
        type Msg = { role: 'user' | 'assistant'; content: string } | { role: 'user'; content: Part[] };
        const history = messages.filter(m => !m.pending).slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
        const cur: Msg = attachedImage
          ? { role: 'user', content: [{ type: 'image', image: attachedImage.base64, mimeType: attachedImage.mimeType }, { type: 'text', text }] }
          : { role: 'user', content: text };
        if (attachedImage) setAttachedImage(null);

        const res = await fetch('/api/chat/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [...history, cur] }) });
        if (!res.ok || !res.body) throw new Error(copy.errorGeneric);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '', buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') break;
            try {
              const p = JSON.parse(raw) as { text?: string };
              if (p.text) {
                accumulated += p.text;
                setMessages(m => m.map(msg => msg.id === pendingMsg.id ? { ...msg, pending: false, content: accumulated } : msg));
              }
            } catch { /* skip */ }
          }
        }
        if (!accumulated) throw new Error(copy.errorGeneric);
        setCredits(c => c - cost);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : copy.errorGeneric;
      setMessages(m => m.map(msg2 => msg2.id === pendingMsg.id ? { ...msg2, pending: false, content: `⚠️ ${msg}` } : msg2));
      showToast(msg, 'error');
      analytics.generationFailed(service, msg);
    } finally {
      if (mediaGenerated) {
        rateLimit.incrementCount();
        analytics.generationSuccess(service, cost, Date.now() - genStartTime);
      }
      setSending(false);
      setOrbState('idle');
    }
  }, [activeService, batchMode, credits, copy, localeCode, messages, sending, attachedImage, showToast, rateLimit]);

  const toggleVoiceRecording = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition
      || (window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;
    if (isRecording && recogRef.current) { recogRef.current.stop(); setIsRecording(false); setOrbState('idle'); return; }
    const recog = new SR();
    recog.lang = localeCode === 'ka' ? 'ka-GE' : localeCode === 'ru' ? 'ru-RU' : 'en-US';
    recog.continuous = false;
    recog.interimResults = true;
    let final = '';
    recog.onresult = (e: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        const alt = r[0];
        if (!alt) continue;
        if (r.isFinal) final += alt.transcript;
        else interim += alt.transcript;
      }
      setInput((final + interim).trim());
    };
    recog.onend = () => { setIsRecording(false); setOrbState('idle'); if (final.trim()) send(final); };
    recog.onerror = () => { setIsRecording(false); setOrbState('idle'); };
    recogRef.current = recog;
    recog.start();
    setIsRecording(true);
    setOrbState('listening');
  }, [isRecording, localeCode, send]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const clearChat = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(HISTORY_KEY);
    setHistoryOpen(false);
  }, []);

  const copyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(() => showToast(copy.copied)).catch(() => { });
  }, [copy.copied, showToast]);

  const retryMessage = useCallback((msg: ChatMessage) => {
    const prev = [...messages].reverse().find(m => m.role === 'user');
    if (prev) send(prev.content, msg.service);
  }, [messages, send]);

  const speakMessage = useCallback(async (text: string) => {
    try {
      const res = await fetch('/api/elevenlabs/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, locale: localeCode }) });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      new Audio(url).play().catch(() => { });
    } catch { /* ignore */ }
  }, [localeCode]);

  const toggleLike = useCallback((id: string, type: 'liked' | 'disliked') => {
    setMessages(m => m.map(msg => {
      if (msg.id !== id) return msg;
      return { ...msg, liked: type === 'liked' ? !msg.liked : false, disliked: type === 'disliked' ? !msg.disliked : false };
    }));
  }, []);

  // Media for library — normalized items from both in-session messages AND DB creations
  const mediaItems = useMemo(() => messages.filter(m => m.media), [messages]);

  type LibraryItem = { id: string; kind: 'image' | 'video' | 'audio'; url: string; service: string; source: 'session' | 'db' };
  const allLibraryItems = useMemo((): LibraryItem[] => {
    // In-session items — narrow to media kinds that have a `url`, excluding 'code'
    const session: LibraryItem[] = mediaItems
      .filter((m): m is typeof m & { media: { kind: 'image' | 'video' | 'audio'; url: string } } =>
        !!m.media && (m.media.kind === 'image' || m.media.kind === 'video' || m.media.kind === 'audio') && !!m.media.url,
      )
      .map(m => ({ id: m.id, kind: m.media.kind, url: m.media.url, service: m.service ?? 'ai', source: 'session' as const }));
    // DB items (deduplicate by URL against session items)
    const sessionUrls = new Set(session.map(s => s.url));
    const db: LibraryItem[] = dbCreations
      .filter(c => c.url && !sessionUrls.has(c.url) && ['image', 'video', 'audio'].includes(c.kind))
      .map(c => ({ id: c.id, kind: c.kind as 'image' | 'video' | 'audio', url: c.thumbnail_url ?? c.url ?? '', service: c.service ?? 'ai', source: 'db' as const }));
    return [...session, ...db];
  }, [mediaItems, dbCreations]);

  const filteredLibrary = useMemo((): LibraryItem[] => {
    if (libraryFilter === 'all') return allLibraryItems;
    if (libraryFilter === 'images') return allLibraryItems.filter(m => m.kind === 'image');
    if (libraryFilter === 'videos') return allLibraryItems.filter(m => m.kind === 'video');
    if (libraryFilter === 'audio') return allLibraryItems.filter(m => m.kind === 'audio');
    return allLibraryItems.filter(m => m.service === 'avatar');
  }, [allLibraryItems, libraryFilter]);

  // History grouped by day
  const historyGroups = useMemo(() => {
    const buckets: Record<string, ChatMessage[]> = { today: [], yesterday: [], last7: [], older: [] };
    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      const b = dayBucket(msg.ts);
      buckets[b]!.push(msg);
    }
    return (['today', 'yesterday', 'last7', 'older'] as const)
      .map(key => ({ key, label: bucketLabel(key, copy), items: (buckets[key] ?? []).slice().reverse() }))
      .filter(g => g.items.length > 0);
  }, [messages, copy]);

  const anyDrawer = historyOpen || profileOpen;

  return (
    <div className="cc-root">

      {/* ── Upgrade Modal ── */}
      <UpgradeModal
        open={upgradeOpen}
        creditsNeeded={upgradeCreditsNeeded}
        currentCredits={credits}
        onClose={() => setUpgradeOpen(false)}
      />

      {/* ── Export Pack Modal ── */}
      <ExportPackModal
        open={exportPackOpen}
        items={allLibraryItems.filter(i => i.url).map(i => ({
          id: i.id,
          kind: i.kind,
          url: i.url,
          title: `${i.service} creation`,
        }))}
        onClose={() => setExportPackOpen(false)}
      />

      {/* ── Onboarding Modal ── */}
      <OnboardingModal
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onComplete={(prefill) => {
          setOnboardingOpen(false);
          if (prefill) {
            setInput(prefill);
            setView('chat');
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
      />

      {/* ── Toasts ── */}
      <div className="cc-toasts">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`cc-toast cc-toast-${t.type}`}
            >
              {t.type === 'success' && <Check style={{ width: 14, height: 14, flexShrink: 0 }} />}
              {t.type === 'error' && <X style={{ width: 14, height: 14, flexShrink: 0 }} />}
              {t.type === 'info' && <Sparkles style={{ width: 14, height: 14, flexShrink: 0 }} />}
              <span style={{ flex: 1 }}>{t.message}</span>
              {t.type === 'error' && t.retryFn && (
                <button
                  type="button"
                  onClick={() => { t.retryFn?.(); setToasts(ts => ts.filter(x => x.id !== t.id)); }}
                  className="cc-toast-retry"
                >
                  <RefreshCw style={{ width: 11, height: 11 }} />
                  <span>ხელახლა</span>
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Pipeline progress banner ── */}
      <AnimatePresence>
        {pipelineTask && !['completed', 'failed', 'partial'].includes(pipelineTask.status) && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="cc-pipeline-banner"
          >
            <Loader2 style={{ width: 13, height: 13, flexShrink: 0, color: '#0ea5e9' }} className="cc-spin" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cc-pipeline-txt">
                {pipelineTask.progress.currentStepKa
                  ? `${pipelineTask.progress.currentStepKa}-ს გენერაცია...`
                  : (pipelineTask.summaryKa ?? 'Agent G-ი მუშაობს...')}
              </div>
              <div className="cc-pipeline-sub">
                {pipelineTask.progress.completedSteps}/{pipelineTask.progress.totalSteps} ნაბიჯი
                {pipelineTask.progress.etaRemainingSeconds && pipelineTask.progress.etaRemainingSeconds > 0
                  ? ` · ~${pipelineTask.progress.etaRemainingSeconds}წმ დარჩა`
                  : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div className="cc-pipeline-progress">
                <div className="cc-pipeline-fill" style={{ width: `${pipelineTask.progress.percent}%` }} />
              </div>
              <span className="cc-pipeline-pct">{pipelineTask.progress.percent}%</span>
              <button
                type="button"
                className="cc-cancel-btn"
                onClick={async () => {
                  await fetch(`/api/tasks/${pipelineTask.taskId}/cancel`, { method: 'POST' }).catch(() => {});
                  setPipelineTask(null);
                  showToast('დავალება გაუქმდა.', 'info');
                }}
                title="გაუქმება"
              >
                <X style={{ width: 11, height: 11 }} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Backdrop ── */}
      {anyDrawer && <div className="cc-backdrop" onClick={() => { setHistoryOpen(false); setProfileOpen(false); }} />}

      {/* ── History Drawer (left) ── */}
      <aside className={`cc-drawer cc-drawer-left${historyOpen ? ' open' : ''}`}>
        <div className="cc-drawer-top">
          <span className="cc-drawer-title">{copy.recentConversations}</span>
          <button type="button" className="cc-icon-btn" onClick={() => setHistoryOpen(false)}><X style={{ width: 16, height: 16 }} /></button>
        </div>
        <div style={{ padding: '8px 12px' }}>
          <button type="button" className="cc-new-chat-btn" onClick={clearChat}>{copy.newChat}</button>
        </div>
        <div className="cc-drawer-body">
          {historyGroups.length === 0 ? (
            <p className="cc-empty-sm">{copy.historyEmpty}</p>
          ) : (
            historyGroups.map(group => (
              <div key={group.key} className="cc-hist-section">
                <span className="cc-hist-bucket">{group.label}</span>
                {group.items.map(msg => {
                  const svc = (msg.service ?? 'chat') as ServiceId;
                  const Icon = SERVICE_ICONS[svc];
                  const color = SERVICE_COLORS[svc];
                  return (
                    <button key={msg.id} type="button" className="cc-hist-row" onClick={() => { setView('chat'); setHistoryOpen(false); }}>
                      <div className="cc-hist-icon" style={{ background: `${color}22`, border: `1px solid ${color}44` }}>
                        <Icon style={{ width: 14, height: 14, color }} />
                      </div>
                      <div className="cc-hist-body">
                        <span className="cc-hist-text">{msg.content.slice(0, 50)}{msg.content.length > 50 ? '…' : ''}</span>
                        <span className="cc-hist-time">{relativeTime(msg.ts)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Profile Drawer (right) ── */}
      <aside className={`cc-drawer cc-drawer-right${profileOpen ? ' open' : ''}`}>
        <div className="cc-drawer-top" style={{ border: 'none', paddingBottom: 8 }}>
          <button type="button" className="cc-icon-btn" onClick={() => setProfileOpen(false)}><X style={{ width: 16, height: 16 }} /></button>
        </div>
        <div className="cc-drawer-body" style={{ paddingTop: 0 }}>
          {/* User */}
          <div className="cc-prof-user">
            <div className="cc-prof-avatar">{(userName || 'U').charAt(0).toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{userName || 'glo@myavatar.ge'}</div>
              <span className="cc-starter-badge">{copy.starter}</span>
            </div>
          </div>

          {/* Credits */}
          <div className="cc-credits-card">
            <span className="cc-credits-label">{copy.creditsRemaining}</span>
            <span className="cc-credits-num">{credits.toLocaleString()}</span>
            <div className="cc-credits-bar"><div className="cc-credits-fill" style={{ width: `${Math.min((credits / Math.max(monthlyAllowance, 1)) * 100, 100)}%` }} /></div>
            <span className="cc-credits-sub">
              {monthlyAllowance.toLocaleString()}{localeCode === 'ka' ? ' ყოველთვიური' : localeCode === 'ru' ? ' ежемесячно' : ' monthly'}
              {creditsResetAt && ` · ${localeCode === 'ka' ? 'განახლება' : localeCode === 'ru' ? 'обновление' : 'resets'} ${new Date(creditsResetAt).toLocaleDateString(localeCode === 'ka' ? 'ka-GE' : localeCode === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric' })}`}
            </span>
          </div>

          {/* Referral */}
          <ReferralPanel isAuthenticated={isAuthenticated} />

          {/* Model selector */}
          <div className="cc-model-section">
            <span className="cc-section-lbl">{copy.model}</span>
            {MODELS.map(m => (
              <label key={m.id} className={`cc-model-row${selectedModel === m.id ? ' selected' : ''}`}>
                <input type="radio" name="model" value={m.id} checked={selectedModel === m.id} onChange={() => setSelectedModel(m.id)} style={{ display: 'none' }} />
                <span className={`cc-radio${selectedModel === m.id ? ' on' : ''}`} />
                <span style={{ flex: 1, fontSize: 13, color: selectedModel === m.id ? '#fff' : 'rgba(255,255,255,0.65)' }}>{m.label}</span>
                <span className="cc-model-badge" style={{ background: `${m.badgeColor}22`, color: m.badgeColor, border: `1px solid ${m.badgeColor}44` }}>{m.badge}</span>
              </label>
            ))}
          </div>

          {/* Nav links */}
          <nav className="cc-prof-nav">
            <button type="button" className="cc-prof-link" onClick={() => { setView('library'); setProfileOpen(false); }}>
              <LibraryIcon style={{ width: 16, height: 16 }} /><span>{copy.mediaLibrary}</span><ChevronRight style={{ width: 14, height: 14, marginLeft: 'auto', opacity: 0.4 }} />
            </button>
            <Link href={`/${locale}/avatar`} className="cc-prof-link" onClick={() => setProfileOpen(false)}>
              <UserIcon style={{ width: 16, height: 16 }} /><span>{localeCode === 'ka' ? 'ჩემი ავატარი' : localeCode === 'ru' ? 'Мой аватар' : 'My Avatar'}</span><ChevronRight style={{ width: 14, height: 14, marginLeft: 'auto', opacity: 0.4 }} />
            </Link>
            <Link href={`/${locale}/voice-lab`} className="cc-prof-link" onClick={() => setProfileOpen(false)}>
              <Mic2 style={{ width: 16, height: 16 }} /><span>{localeCode === 'ka' ? 'ხმის ლაბორატორია' : localeCode === 'ru' ? 'Голосовая лаборатория' : 'Voice Lab'}</span><ChevronRight style={{ width: 14, height: 14, marginLeft: 'auto', opacity: 0.4 }} />
            </Link>
            <Link href={`/${locale}/memory`} className="cc-prof-link" onClick={() => setProfileOpen(false)}>
              <Brain style={{ width: 16, height: 16 }} /><span>{localeCode === 'ka' ? 'მეხსიერება' : localeCode === 'ru' ? 'Память' : 'Memory'}</span><ChevronRight style={{ width: 14, height: 14, marginLeft: 'auto', opacity: 0.4 }} />
            </Link>
            <Link href={`/${locale}/analytics`} className="cc-prof-link" onClick={() => setProfileOpen(false)}>
              <BarChart3 style={{ width: 16, height: 16 }} /><span>{localeCode === 'ka' ? 'ანალიტიკა' : localeCode === 'ru' ? 'Аналитика' : 'Analytics'}</span><ChevronRight style={{ width: 14, height: 14, marginLeft: 'auto', opacity: 0.4 }} />
            </Link>
            <div className="cc-prof-divider" />
            <button type="button" className="cc-prof-link">
              <Settings style={{ width: 16, height: 16 }} /><span>{copy.settings}</span><ChevronRight style={{ width: 14, height: 14, marginLeft: 'auto', opacity: 0.4 }} />
            </button>
            <button type="button" className="cc-prof-link">
              <HelpCircle style={{ width: 16, height: 16 }} /><span>{copy.helpDocs}</span><ChevronRight style={{ width: 14, height: 14, marginLeft: 'auto', opacity: 0.4 }} />
            </button>
            <div className="cc-prof-divider" />
            <button type="button" className="cc-prof-link cc-danger" onClick={async () => {
              try {
                const supabase = createBrowserClient();
                if (supabase) await supabase.auth.signOut();
              } catch { /* ignore */ }
              window.location.href = '/';
            }}>
              <LogOut style={{ width: 16, height: 16 }} /><span>{copy.signOut}</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* ── Header ── */}
      <header className="cc-header">
        <button type="button" className="cc-icon-btn" onClick={() => { setHistoryOpen(true); setProfileOpen(false); }} aria-label="History">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Mini orb — only visible when chat is active */}
          {messages.length > 0 && (
            <motion.div
              layoutId="agent-g-orb"
              className={`cc-orb-mini${orbState === 'listening' ? ' orb-listening' : orbState === 'speaking' ? ' orb-speaking' : ''}`}
              transition={{ type: 'spring', stiffness: 200, damping: 28 }}
            >
              <span className="cc-orb-g-sm">G</span>
            </motion.div>
          )}
          <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>{copy.title}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>·</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>
            {MODELS.find(m => m.id === selectedModel)?.label ?? 'Gemini 2.0 Flash'}
          </span>
        </div>
        <button type="button" className="cc-icon-btn" onClick={() => { setProfileOpen(true); setHistoryOpen(false); }} aria-label="Profile">
          <UserIcon style={{ width: 18, height: 18 }} />
        </button>
      </header>

      {/* ── Main content ── */}
      <main className="cc-main" ref={scrollRef}>

        {/* Rate limit banner — shows when Starter plan user is near/at daily gen limit */}
        {view === 'chat' && !rateLimitDismissed && (
          <RateLimitBanner
            status={rateLimit}
            onDismiss={() => setRateLimitDismissed(true)}
          />
        )}

        {/* Invite referral banner — shows when credits are low (< 300) */}
        {view === 'chat' && (
          <InviteReferralBanner credits={credits} />
        )}

        {/* CHAT */}
        {view === 'chat' && (
          <AnimatePresence mode="wait" initial={false}>
          {messages.length === 0 ? (
            /* Empty / standby state */
            <motion.div
              key="standby"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="cc-standby"
            >
              <motion.div
                layoutId="agent-g-orb"
                className={`cc-orb-lg${orbState === 'listening' ? ' orb-listening' : orbState === 'speaking' ? ' orb-speaking' : ''}`}
                transition={{ type: 'spring', stiffness: 200, damping: 28 }}
              >
                <span className="cc-orb-g">G</span>
              </motion.div>
              <div className="cc-standby-status">{copy.standby}</div>
              <h1 className="cc-standby-title">{copy.agentLabel}</h1>

              {/* Voice & Text Mode toggle */}
              <div className="cc-voice-toggle">
                <span className="cc-voice-toggle-label">{copy.voiceTextMode}</span>
                <button
                  type="button"
                  className={`cc-toggle${voiceMode ? ' on' : ''}`}
                  onClick={() => setVoiceMode(v => !v)}
                  role="switch"
                  aria-checked={voiceMode}
                  aria-label={copy.voiceTextMode}
                >
                  <span className="cc-toggle-thumb" />
                </button>
              </div>

              {/* Quick service cards */}
              <div className="cc-quick-cards">
                {QUICK_SERVICES.map((id, idx) => {
                  const Icon = SERVICE_ICONS[id];
                  const color = SERVICE_COLORS[id];
                  return (
                    <motion.button
                      key={id}
                      type="button"
                      className="cc-quick-card"
                      onClick={() => { setActiveService(id); inputRef.current?.focus(); }}
                      whileHover={{ scale: 1.03, y: -2 }}
                      whileTap={{ scale: 0.96 }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 + idx * 0.05, duration: 0.25, ease: 'easeOut' }}
                      style={{ ['--svc-color' as string]: color }}
                    >
                      <span className="cc-quick-icon-wrap" style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
                        <Icon style={{ width: 18, height: 18, color }} />
                      </span>
                      <span>{copy.services[id]}</span>
                      <span className="cc-quick-cost"><Zap style={{ width: 9, height: 9 }} />{SERVICE_COSTS[id]}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            /* Messages */
            <motion.div
              key="messages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="cc-messages"
            >
              {messages.map((msg, i) => {
                const prev = messages[i - 1];
                const showDiv = !prev || !sameDay(prev.ts, msg.ts);
                return (
                  <div key={msg.id}>
                    {showDiv && (
                      <div className="cc-day-div">
                        <span>{bucketLabel(dayBucket(msg.ts), copy)}</span>
                      </div>
                    )}
                    <MessageRow
                      msg={msg} copy={copy}
                      onCopy={() => copyMessage(msg.content)}
                      onRetry={() => retryMessage(msg)}
                      onSpeak={() => speakMessage(msg.content)}
                      onLike={() => toggleLike(msg.id, 'liked')}
                      onDislike={() => toggleLike(msg.id, 'disliked')}
                      onRemix={(p) => { setInput(p); setHubOpen(false); inputRef.current?.focus(); }}
                    />
                  </div>
                );
              })}
            </motion.div>
          )}
          </AnimatePresence>
        )}

        {/* LIBRARY */}
        {view === 'library' && (
          <div className="cc-library">
            <div className="cc-lib-filters">
              {(['all', 'images', 'videos', 'audio', 'avatars'] as LibraryFilter[]).map(f => (
                <button key={f} type="button" className={`cc-filter${libraryFilter === f ? ' active' : ''}`} onClick={() => setLibraryFilter(f)}>
                  {f === 'all' && copy.filterAll}{f === 'images' && copy.filterImages}{f === 'videos' && copy.filterVideos}{f === 'audio' && copy.filterAudio}{f === 'avatars' && copy.filterAvatars}
                </button>
              ))}
              {allLibraryItems.length > 0 && (
                <button
                  type="button"
                  className="cc-filter"
                  onClick={() => setExportPackOpen(true)}
                  style={{ marginLeft: 'auto', color: '#0ea5e9', borderColor: 'rgba(14,165,233,0.4)', background: 'rgba(14,165,233,0.08)' }}
                >
                  📦 Export
                </button>
              )}
            </div>
            {libraryLoading ? (
              <div className="cc-lib-grid" aria-busy="true" aria-label={localeCode === 'ka' ? 'იტვირთება' : localeCode === 'ru' ? 'Загрузка' : 'Loading'}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="cc-lib-skel" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
            ) : filteredLibrary.length === 0 ? (
              <motion.div
                className="cc-standby"
                style={{ paddingTop: 48 }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <div className="cc-empty-icon-halo">
                  <LibraryIcon style={{ width: 36, height: 36, color: 'rgba(56,189,248,0.85)' }} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginTop: 14 }}>{copy.libraryEmpty}</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6, maxWidth: 260 }}>
                  {localeCode === 'ka' ? 'შენი გენერირებული სურათები, ვიდეოები და მუსიკა აქ დაგროვდება — ხელით სამახსოვროდ შენახული.' : localeCode === 'ru' ? 'Здесь будут собираться все созданные изображения, видео и музыка — автоматически сохраненные.' : 'All your generated images, videos, and music will collect here — automatically saved.'}
                </p>
                <button
                  type="button"
                  className="cc-empty-cta"
                  onClick={() => setView('chat')}
                >
                  <Sparkles style={{ width: 14, height: 14 }} />
                  {localeCode === 'ka' ? 'დაიწყე გენერაცია' : localeCode === 'ru' ? 'Начать генерацию' : 'Start generating'}
                </button>
              </motion.div>
            ) : (
              <div className="cc-lib-grid">
                {filteredLibrary.map(item => (
                  <div key={item.id} className="cc-lib-item">
                    {item.kind === 'image' && <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />}
                    {item.kind === 'video' && (item.url ? <video src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop /> : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(249,115,22,0.08)' }}>
                        <VideoIcon style={{ width: 32, height: 32, color: 'rgba(249,115,22,0.6)' }} />
                      </div>
                    ))}
                    {item.kind === 'audio' && (
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(14,165,233,0.08)' }}>
                        <MusicIcon style={{ width: 32, height: 32, color: 'rgba(56,189,248,0.7)' }} />
                      </div>
                    )}
                    <div className="cc-lib-badge">{item.service}</div>
                    {item.source === 'db' && <div className="cc-lib-db-dot" title="Saved" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Batch results 2×2 grid (shown below messages when batch mode was used) */}
        {view === 'chat' && batchResults.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ padding: '0 16px 16px' }}
          >
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              🎨 4 ვარიაცია · {batchResults.length} generated
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {batchResults.map((r, idx) => (
                <motion.div
                  key={r.creationId ?? idx}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.08 }}
                  style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '1/1', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <img
                    src={r.url}
                    alt={`Variation ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                  />
                  <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: '2px 6px' }}>
                    #{idx + 1}
                  </div>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', gap: 4, padding: 6, background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}>
                    <a
                      href={r.url}
                      download
                      style={{ flex: 1, padding: '5px 0', textAlign: 'center', fontSize: 10, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.15)', borderRadius: 6, textDecoration: 'none' }}
                    >
                      ⬇
                    </a>
                    <button
                      type="button"
                      onClick={() => { setInput(messages.filter(m => m.role === 'user').slice(-1)[0]?.content ?? ''); setActiveService('image'); }}
                      style={{ flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 600, color: '#60a5fa', background: 'rgba(14,165,233,0.2)', borderRadius: 6, border: 'none', cursor: 'pointer' }}
                    >
                      🔄
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setBatchResults([])}
              style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              ✕ batch-ის გასუფთავება
            </button>
          </motion.div>
        )}

        {/* ACTIVITY */}
        {view === 'activity' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <ActivityDashboard />
          </div>
        )}

        {/* ADMIN */}
        {view === 'admin' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
            <AdminDashboard />
          </div>
        )}

        {/* PRICING */}
        {view === 'pricing' && (
          <div className="cc-pricing">
            <h2 className="cc-pricing-h">
              {localeCode === 'ka' ? 'გეგმა შეარჩიე' : localeCode === 'ru' ? 'Выберите тариф' : 'Choose Your Plan'}
            </h2>
            <p className="cc-pricing-sub">
              {localeCode === 'ka' ? 'ყველა ფასი ქართულ ლარში (₾)' : localeCode === 'ru' ? 'Все цены в лари (₾)' : 'All prices in Georgian Lari (₾)'}
            </p>
            <div className="cc-plans">
              <PlanCard
                name={localeCode === 'ka' ? 'სტარტერი' : localeCode === 'ru' ? 'Стартер' : 'Starter'}
                price="₾0"
                period={localeCode === 'ka' ? '/თვე' : localeCode === 'ru' ? '/мес' : '/mo'}
                features={
                  localeCode === 'ka'
                    ? ['200 კრედიტი/თვეში', '5 AI სურათი', '3 მუსიკის ტრეკი', 'Community Support']
                    : localeCode === 'ru'
                      ? ['200 кредитов/мес', '5 AI изображений', '3 музыкальных трека', 'Поддержка сообщества']
                      : ['200 credits/month', '5 AI images', '3 music tracks', 'Community support']
                }
                accent="#6b7280" btnClass="cc-btn-outline"
                btnText={localeCode === 'ka' ? 'მიმდინარე გეგმა' : localeCode === 'ru' ? 'Текущий тариф' : 'Current Plan'}
                href={`/${localeCode}/pricing`}
              />
              <PlanCard
                name="Pro"
                price="₾9"
                period={localeCode === 'ka' ? '/თვე' : localeCode === 'ru' ? '/мес' : '/mo'}
                features={
                  localeCode === 'ka'
                    ? ['500 კრედიტი/თვეში', 'შეუზღუდავი გენერაციები', '50 სურათი + მუსიკა', 'Email Support']
                    : localeCode === 'ru'
                      ? ['500 кредитов/мес', 'Неограниченные генерации', '50 изображений + музыка', 'Email поддержка']
                      : ['500 credits/month', 'Unlimited generations', '50 images + music', 'Email support']
                }
                accent="#38bdf8" btnClass="cc-btn-primary"
                btnText={localeCode === 'ka' ? 'Pro-ზე გადასვლა' : localeCode === 'ru' ? 'Перейти на Pro' : 'Upgrade to Pro'}
                badge={localeCode === 'ka' ? 'პოპულარული' : localeCode === 'ru' ? 'Популярный' : 'Popular'}
                href={`/${localeCode}/pricing`}
              />
              <PlanCard
                name="Ultimate"
                price="₾29"
                period={localeCode === 'ka' ? '/თვე' : localeCode === 'ru' ? '/мес' : '/mo'}
                features={
                  localeCode === 'ka'
                    ? ['2,000 კრედიტი/თვეში', 'ყველაფერი შეუზღუდავი', 'Batch ×4 სურათი', 'Priority + Slack']
                    : localeCode === 'ru'
                      ? ['2 000 кредитов/мес', 'Всё без ограничений', 'Batch ×4 изображений', 'Priority + Slack']
                      : ['2,000 credits/month', 'Unlimited everything', 'Batch ×4 images', 'Priority + Slack']
                }
                accent="#f59e0b" btnClass="cc-btn-ultimate"
                btnText={localeCode === 'ka' ? 'Ultimate-ზე გადასვლა' : localeCode === 'ru' ? 'Перейти на Ultimate' : 'Get Ultimate'}
                href={`/${localeCode}/pricing`}
              />
            </div>
            <div className="cc-credit-table">
              <div className="cc-credit-table-hd">Credit Costs</div>
              {(Object.entries(SERVICE_COSTS) as [ServiceId, number][]).map(([svc, cost]) => {
                const Icon = SERVICE_ICONS[svc];
                return (
                  <div key={svc} className="cc-credit-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${SERVICE_COLORS[svc]}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon style={{ width: 14, height: 14, color: SERVICE_COLORS[svc] }} />
                      </div>
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', textTransform: 'capitalize' }}>{copy.services[svc]}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(56,189,248,0.9)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Zap style={{ width: 11, height: 11 }} />{cost}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* ── Bottom nav tabs ── */}
      <nav className="cc-tabs">
        {(['chat', 'library', 'activity', 'pricing'] as const).map(v => (
          <button key={v} type="button" className={`cc-tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>
            {v === 'chat' && <HomeIcon style={{ width: 15, height: 15 }} />}
            {v === 'library' && <LibraryIcon style={{ width: 15, height: 15 }} />}
            {v === 'activity' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>}
            {v === 'pricing' && <Zap style={{ width: 15, height: 15 }} />}
            <span>{copy.tabs[v]}</span>
          </button>
        ))}
        {isAdmin && (
          <button type="button" className={`cc-tab${view === 'admin' ? ' active' : ''}`} onClick={() => setView('admin')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            <span>Admin</span>
          </button>
        )}
      </nav>

      {/* ── Service rail (chat only, with messages) ── */}
      {view === 'chat' && messages.length > 0 && (
        <div className="cc-rail">
          <button type="button" className="cc-rail-hub" onClick={() => setHubOpen(v => !v)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32 2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{copy.aiServices}</span>
          </button>
          <div className="cc-pills">
            {(['avatar', 'image', 'video', 'music', 'voice', 'interior', 'app'] as ServiceId[]).map(id => {
              const Icon = SERVICE_ICONS[id];
              const active = activeService === id;
              return (
                <button key={id} type="button" className={`cc-pill${active ? ' active' : ''}`} onClick={() => setActiveService(id)}>
                  <Icon style={{ width: 15, height: 15 }} /><span>{copy.services[id]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Input bar (chat only) ── */}
      {view === 'chat' && (
        <div className="cc-input-wrap">
          {/* @mention suggestions */}
          <AnimatePresence>
            {charSuggestions.length > 0 && (
              <motion.div
                className="cc-char-suggestions"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}
              >
                {charSuggestions.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="cc-char-suggestion-item"
                    onClick={() => {
                      setInput(input.replace(/@\w*$/, `@${c.slug} `));
                      setCharSuggestions([]);
                      inputRef.current?.focus();
                    }}
                  >
                    <img src={c.image_url} alt={c.name} className="cc-char-suggestion-img" />
                    <span>{c.name}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Attached image preview */}
          {attachedImage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 8px' }}>
              <img src={attachedImage.base64} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.15)' }} />
              <button type="button" onClick={() => setAttachedImage(null)} style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)' }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            </div>
          )}

          {/* Prompt suggestion chips — always visible when no messages */}
          {messages.length === 0 && (
            <PromptChips
              activeService={activeService}
              onSelect={(p) => { setInput(p); inputRef.current?.focus(); }}
            />
          )}

          {/* Batch mode toggle (visible when image service active) */}
          {activeService === 'image' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, padding: '0 2px' }}>
              <button
                type="button"
                onClick={() => setBatchMode(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '5px 12px',
                  background: batchMode ? 'rgba(14,165,233,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${batchMode ? 'rgba(14,165,233,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 20,
                  color: batchMode ? '#60a5fa' : 'rgba(255,255,255,0.5)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 12 }}>🎨🎨🎨🎨</span>
                <span>Batch ×4</span>
                {batchMode && (
                  <span style={{ fontSize: 10, background: 'rgba(14,165,233,0.25)', borderRadius: 4, padding: '1px 5px', color: '#60a5fa' }}>
                    40⚡
                  </span>
                )}
              </button>
              {batchMode && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                  4 ვარიაცია ერთდროულად
                </span>
              )}
            </div>
          )}

          {/* Music preset chips (visible when music service active) */}
          {activeService === 'music' && (
            <div className="cc-preset-bar">
              {MUSIC_PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`cc-preset-chip${musicPreset === p.id ? ' active' : ''}`}
                  onClick={() => setMusicPreset(prev => prev === p.id ? null : p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* Video options (visible when video service active) */}
          {activeService === 'video' && (
            <div className="cc-video-opts">
              <div className="cc-video-group">
                {VIDEO_ASPECTS.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    className={`cc-video-opt${videoAspect === a.id ? ' active' : ''}`}
                    onClick={() => setVideoAspect(a.id as typeof videoAspect)}
                    title={a.desc}
                  >
                    <span style={{ fontSize: 11 }}>{a.icon}</span>
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>
              <div className="cc-video-group">
                {VIDEO_DURATIONS.map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`cc-video-opt${videoDuration === d ? ' active' : ''}`}
                    onClick={() => setVideoDuration(d as typeof videoDuration)}
                  >
                    <Clock style={{ width: 10, height: 10 }} />
                    <span>{d}s</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Voice selector (visible when voice service active) */}
          {activeService === 'voice' && (
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <button
                type="button"
                className="cc-voice-selector"
                onClick={() => setVoiceDropdownOpen(v => !v)}
              >
                <Mic style={{ width: 13, height: 13, opacity: 0.7 }} />
                <span>{ELEVENLABS_VOICES.find(v => v.id === selectedVoiceId)?.name ?? 'Voice'}</span>
                <ChevronDown style={{ width: 12, height: 12, opacity: 0.5, marginLeft: 'auto' }} />
              </button>
              <AnimatePresence>
                {voiceDropdownOpen && (
                  <motion.div
                    className="cc-voice-dropdown"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.14 }}
                  >
                    {ELEVENLABS_VOICES.map(v => (
                      <button
                        key={v.id}
                        type="button"
                        className={`cc-voice-opt${selectedVoiceId === v.id ? ' active' : ''}`}
                        onClick={() => { setSelectedVoiceId(v.id); setVoiceDropdownOpen(false); }}
                      >
                        {v.name}
                        {selectedVoiceId === v.id && <Check style={{ width: 11, height: 11, marginLeft: 'auto', color: '#0ea5e9' }} />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="cc-input-bar">
            <button type="button" className="cc-ibtn" onClick={() => setHubOpen(v => !v)} aria-label="Services"><Plus style={{ width: 18, height: 18 }} /></button>
            <textarea
              ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
              rows={1} placeholder={isRecording ? copy.listening : copy.placeholder} className="cc-textarea"
              aria-label={copy.placeholder}
            />
            {isRecording && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px' }}>
                {[3, 5, 8, 6, 9, 4, 7].map((h, i) => (
                  <span key={i} style={{ display: 'block', width: 2, height: h * 2, borderRadius: 1, background: 'rgba(56,189,248,0.9)', animation: `cc-wave 0.9s ${i * 80}ms ease-in-out infinite` }} />
                ))}
              </div>
            )}
            {/* Cost preview badge */}
            {input.trim() && !sending && (
              <div className="cc-cost-badge">
                <Zap style={{ width: 9, height: 9 }} />
                {SERVICE_COSTS[activeService]}
              </div>
            )}
            <button type="button" className="cc-ibtn" onClick={() => fileInputRef.current?.click()} style={attachedImage ? { color: 'rgba(56,189,248,1)', background: 'rgba(14,165,233,0.18)' } : undefined}>
              <Paperclip style={{ width: 18, height: 18 }} />
            </button>
            <button type="button" className={`cc-ibtn${isRecording ? ' rec' : ''}`} onClick={toggleVoiceRecording} aria-pressed={isRecording}>
              <Mic style={{ width: 18, height: 18 }} />
              {isRecording && <span className="cc-rec-dot" />}
            </button>
            <button type="button" className={`cc-send${(input.trim() && !sending) ? ' ready' : ''}`} disabled={!input.trim() || sending} onClick={() => send(input)}>
              {sending ? <Loader2 style={{ width: 17, height: 17 }} className="cc-spin" /> : <Send style={{ width: 17, height: 17 }} />}
            </button>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} aria-hidden="true" />

      {/* ── Agent Hub — animated slide-up one-window menu ── */}
      <AnimatePresence>
        {hubOpen && (
          <>
            <motion.div
              key="hub-backdrop"
              className="cc-hub-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setHubOpen(false)}
            />
            <motion.div
              key="hub-panel"
              className="cc-hub"
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 36 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="cc-hub-handle" />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles style={{ width: 15, height: 15, color: '#0ea5e9' }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{copy.aiServices}</span>
                </div>
                <button type="button" className="cc-icon-btn" style={{ width: 30, height: 30 }} onClick={() => setHubOpen(false)}>
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
              <div className="cc-hub-grid">
                {([
                  // The 7 specialist agents Agent G routes to.
                  { id: 'avatar' as ServiceId },   { id: 'image' as ServiceId },
                  { id: 'video' as ServiceId },    { id: 'music' as ServiceId },
                  { id: 'voice' as ServiceId },    { id: 'interior' as ServiceId },
                  { id: 'app' as ServiceId },
                ]).map(({ id }, idx) => {
                  const Icon = SERVICE_ICONS[id];
                  const active = activeService === id;
                  return (
                    <motion.button
                      key={id}
                      type="button"
                      className={`cc-hub-item${active ? ' active' : ''}`}
                      onClick={() => { setActiveService(id); setHubOpen(false); }}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04, duration: 0.22 }}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                    >
                      <div className="cc-hub-icon" style={{ background: `${SERVICE_COLORS[id]}18`, border: `1px solid ${SERVICE_COLORS[id]}35` }}>
                        <Icon style={{ width: 18, height: 18, color: SERVICE_COLORS[id] }} />
                      </div>
                      <span className="cc-hub-name">{copy.services[id]}</span>
                      <span className="cc-hub-cost"><Zap style={{ width: 9, height: 9, display: 'inline' }} />{SERVICE_COSTS[id]}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Global styles ── */}
      <style jsx>{`
        .cc-root {
          position: relative; display: flex; flex-direction: column;
          height: 100%; width: 100%; overflow: hidden;
          background: radial-gradient(1400px 700px at 70% -100px, rgba(14,165,233,0.12), transparent 60%),
                      radial-gradient(900px 600px at -5% 110%, rgba(3,105,161,0.08), transparent 55%),
                      #0a0a0e;
          color: #f5f5f7;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        /* Backdrop */
        .cc-backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,0.65); backdrop-filter: blur(5px); }
        /* Drawers */
        .cc-drawer {
          position: fixed; top: 0; bottom: 0; z-index: 50; width: 300px;
          background: #0f0f14; display: flex; flex-direction: column;
          transition: transform 0.28s cubic-bezier(0.32,0.72,0,1);
        }
        .cc-drawer-left { left:0; border-right:1px solid rgba(255,255,255,0.07); transform:translateX(-100%); }
        .cc-drawer-right { right:0; border-left:1px solid rgba(255,255,255,0.07); transform:translateX(100%); }
        .cc-drawer.open { transform: translateX(0); }
        .cc-drawer-top {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 14px 12px; border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .cc-drawer-title { font-size:14px; font-weight:600; color:#fff; }
        .cc-drawer-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling: touch; }
        .cc-drawer-body::-webkit-scrollbar { width:3px; }
        .cc-drawer-body::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:2px; }
        .cc-new-chat-btn {
          display: block; width: 100%; padding: 9px 12px; border-radius: 10px; text-align: left;
          border: 1px dashed rgba(14,165,233,0.35); background: rgba(14,165,233,0.07);
          color: rgba(56,189,248,0.9); font-size: 13px; font-weight: 500; cursor: pointer;
          transition: background 0.15s;
        }
        .cc-new-chat-btn:hover { background: rgba(14,165,233,0.14); }
        .cc-empty-sm { padding: 24px 16px; text-align: center; font-size: 13px; color: rgba(255,255,255,0.3); }
        /* History rows */
        .cc-hist-section { padding: 4px 0 8px; }
        .cc-hist-bucket {
          display: block; padding: 8px 14px 5px;
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
          color: rgba(255,255,255,0.3);
        }
        .cc-hist-row {
          display: flex; align-items: center; gap: 10px; width: 100%;
          padding: 12px 14px; text-align: left; cursor: pointer; transition: background 0.12s;
          border: none; background: transparent; touch-action: manipulation; min-height: 52px;
        }
        .cc-hist-row:hover { background: rgba(255,255,255,0.04); }
        .cc-hist-row:active { background: rgba(255,255,255,0.06); }
        .cc-hist-icon {
          width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center;
          justify-content: center; flex-shrink: 0;
        }
        .cc-hist-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
        .cc-hist-text { font-size: 13px; color: rgba(255,255,255,0.75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cc-hist-time { font-size: 11px; color: rgba(255,255,255,0.3); }
        /* Profile drawer */
        .cc-prof-user { display: flex; align-items: center; gap: 12px; padding: 12px 14px 16px; }
        .cc-prof-avatar {
          width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg,#0ea5e9,#0369a1);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; font-weight: 700; color: #fff;
        }
        .cc-starter-badge {
          display: inline-block; margin-top: 3px; padding: 2px 7px; border-radius: 4px;
          background: rgba(251,146,60,0.15); border: 1px solid rgba(251,146,60,0.35);
          color: #fb923c; font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
        }
        .cc-credits-card {
          margin: 0 14px 14px; padding: 14px;
          background: rgba(14,165,233,0.07); border: 1px solid rgba(14,165,233,0.2);
          border-radius: 14px; display: flex; flex-direction: column; gap: 6px;
        }
        .cc-credits-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.4); }
        .cc-credits-num { font-size: 28px; font-weight: 800; color: #fff; line-height: 1; }
        .cc-credits-bar { height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
        .cc-credits-fill { height: 100%; background: linear-gradient(90deg,#0369a1,#0ea5e9); border-radius: 2px; transition: width 0.4s; }
        .cc-credits-sub { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 2px; }
        .cc-model-section { padding: 0 14px 12px; }
        .cc-section-lbl { display: block; padding-bottom: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.35); }
        .cc-model-row {
          display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px;
          cursor: pointer; transition: background 0.12s; margin-bottom: 3px; border: none; background: transparent;
          width: 100%; text-align: left;
        }
        .cc-model-row:hover { background: rgba(255,255,255,0.04); }
        .cc-model-row.selected { background: rgba(14,165,233,0.1); }
        .cc-radio {
          width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.25);
          flex-shrink: 0; display: flex; align-items: center; justify-content: center;
        }
        .cc-radio.on { border-color: #0ea5e9; background: radial-gradient(circle, #0ea5e9 40%, transparent 70%); }
        .cc-model-badge {
          font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;
          letter-spacing: 0.05em; flex-shrink: 0;
        }
        .cc-prof-nav { border-top: 1px solid rgba(255,255,255,0.06); padding: 6px 0; }
        .cc-prof-link {
          display: flex; align-items: center; gap: 12px; width: 100%;
          padding: 12px 16px; font-size: 13px; color: rgba(255,255,255,0.7);
          cursor: pointer; transition: background 0.12s; border: none; background: transparent;
        }
        .cc-prof-link:hover { background: rgba(255,255,255,0.04); }
        .cc-danger { color: rgba(248,113,113,0.85) !important; }
        .cc-danger:hover { background: rgba(239,68,68,0.06) !important; }
        .cc-prof-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 4px 0; }
        /* Icon btn — 44px min touch target (WCAG / Apple HIG) */
        .cc-icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
          border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.75); cursor: pointer; transition: all 0.14s;
          touch-action: manipulation;
        }
        .cc-icon-btn:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.14); }
        .cc-icon-btn:active { transform: scale(0.95); }
        /* Header */
        .cc-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06);
          backdrop-filter: blur(20px); flex-shrink: 0;
        }
        /* Orb large (standby) */
        .cc-orb-lg {
          width: 80px; height: 80px; border-radius: 50%;
          background: linear-gradient(135deg,#0ea5e9 0%,#0284c7 60%,#0c4a6e 100%);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 40px rgba(14,165,233,0.45), 0 0 80px rgba(3,105,161,0.2), inset 0 1px 0 rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.12);
        }
        .cc-orb-g { font-size: 32px; font-weight: 800; color: #fff; letter-spacing: -0.02em; }
        .cc-orb-lg.orb-listening { animation: orb-pulse 1s ease-in-out infinite; }
        .cc-orb-lg.orb-speaking { animation: orb-glow 0.75s ease-in-out infinite; }
        /* Mini orb in header */
        .cc-orb-mini {
          width: 30px; height: 30px; border-radius: 50%;
          background: linear-gradient(135deg,#0ea5e9 0%,#0284c7 60%,#0c4a6e 100%);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 14px rgba(14,165,233,0.55), inset 0 1px 0 rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.12); flex-shrink: 0;
        }
        .cc-orb-mini.orb-listening { animation: orb-pulse 1s ease-in-out infinite; }
        .cc-orb-mini.orb-speaking { animation: orb-glow 0.75s ease-in-out infinite; }
        .cc-orb-g-sm { font-size: 13px; font-weight: 800; color: #fff; letter-spacing: -0.02em; }
        /* Pipeline progress banner */
        .cc-pipeline-banner {
          position: relative; z-index: 10; display: flex; align-items: center; gap: 8px;
          padding: 8px 14px; background: rgba(14,165,233,0.08);
          border-bottom: 1px solid rgba(14,165,233,0.2); flex-shrink: 0;
        }
        .cc-pipeline-txt { flex: 1; font-size: 12px; color: rgba(255,255,255,0.7); }
        .cc-pipeline-progress {
          width: 80px; height: 3px; background: rgba(255,255,255,0.08);
          border-radius: 2px; overflow: hidden; flex-shrink: 0;
        }
        .cc-pipeline-fill {
          height: 100%; background: linear-gradient(90deg,#0284c7,#0ea5e9);
          border-radius: 2px; transition: width 0.5s;
        }
        .cc-pipeline-pct { font-size: 11px; font-weight: 600; color: rgba(56,189,248,0.8); flex-shrink: 0; }
        .cc-pipeline-sub { font-size: 11px; color: rgba(255,255,255,0.35); margin-top: 2px; }
        /* Cancel task button */
        /* Cancel task button — expanded touch target */
        .cc-cancel-btn {
          width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center;
          justify-content: center; border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5);
          cursor: pointer; transition: all 0.15s; flex-shrink: 0; touch-action: manipulation;
        }
        .cc-cancel-btn:hover { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); color: rgba(248,113,113,0.9); }
        .cc-cancel-btn:active { transform: scale(0.92); }
        /* Toast retry button */
        .cc-toast-retry {
          display: flex; align-items: center; gap: 3px; padding: 3px 8px;
          border-radius: 6px; border: 1px solid rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8);
          font-size: 11px; font-weight: 600; cursor: pointer; flex-shrink: 0;
          transition: background 0.15s;
        }
        .cc-toast-retry:hover { background: rgba(255,255,255,0.15); }
        /* Hub handle bar */
        .cc-hub-handle {
          width: 36px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.15);
          margin: 10px auto 0;
        }
        /* Standby — responsive vertical padding */
        .cc-standby {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 14px; padding: clamp(24px, 6vh, 48px) 24px;
          text-align: center; min-height: 100%;
        }
        @media (max-height: 600px) {
          .cc-standby { gap: 10px; padding: 16px 24px; }
          .cc-orb-lg { width: 60px; height: 60px; }
          .cc-orb-g { font-size: 24px; }
          .cc-standby-title { font-size: 20px; }
        }
        .cc-standby-status {
          font-size: 10px; font-weight: 700; letter-spacing: 0.14em;
          color: rgba(255,255,255,0.3); text-transform: uppercase;
        }
        .cc-standby-title { font-size: 26px; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
        /* Voice toggle */
        .cc-voice-toggle { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
        .cc-voice-toggle-label { font-size: 13px; color: rgba(255,255,255,0.55); }
        .cc-toggle {
          width: 44px; height: 24px; border-radius: 12px;
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.12);
          position: relative; cursor: pointer; transition: background 0.2s;
          flex-shrink: 0;
        }
        .cc-toggle.on { background: rgba(14,165,233,0.7); border-color: rgba(14,165,233,0.9); }
        .cc-toggle-thumb {
          position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
          border-radius: 50%; background: #fff; transition: transform 0.2s;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }
        .cc-toggle.on .cc-toggle-thumb { transform: translateX(20px); }
        /* Quick service cards — large touch targets, premium glow */
        .cc-quick-cards { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
        .cc-quick-card {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          padding: 16px 20px; border-radius: 18px; min-width: 96px;
          border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.03);
          cursor: pointer; transition: background 0.18s, border-color 0.18s, box-shadow 0.22s;
          touch-action: manipulation; position: relative; overflow: hidden;
          color: rgba(255,255,255,0.85);
        }
        .cc-quick-card::before {
          content: ''; position: absolute; inset: -1px; border-radius: inherit;
          background: radial-gradient(circle at 50% 0%, var(--svc-color, transparent) 0%, transparent 65%);
          opacity: 0; transition: opacity 0.22s ease; pointer-events: none;
          mix-blend-mode: screen;
        }
        .cc-quick-card:hover {
          background: rgba(255,255,255,0.06);
          border-color: color-mix(in srgb, var(--svc-color, rgba(255,255,255,0.18)) 45%, transparent);
          box-shadow: 0 8px 28px -10px color-mix(in srgb, var(--svc-color, rgba(0,0,0,0.4)) 60%, transparent);
        }
        .cc-quick-card:hover::before { opacity: 0.18; }
        .cc-quick-card:active { transform: scale(0.96); }
        .cc-quick-card:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--svc-color, #0ea5e9) 70%, transparent),
                      0 8px 28px -10px color-mix(in srgb, var(--svc-color, rgba(0,0,0,0.4)) 60%, transparent);
        }
        .cc-quick-icon-wrap {
          display: inline-flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; border-radius: 12px;
          transition: transform 0.25s cubic-bezier(.34,1.56,.64,1);
        }
        .cc-quick-card:hover .cc-quick-icon-wrap { transform: scale(1.08) rotate(-3deg); }
        .cc-quick-card > span:first-of-type, .cc-quick-card > span:nth-of-type(2) {
          font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.85);
        }
        .cc-quick-cost { display: flex; align-items: center; gap: 2px; font-size: 10px; color: rgba(255,255,255,0.35); font-weight: 500; }
        /* Messages */
        .cc-messages { display: flex; flex-direction: column; padding: 12px 14px 8px; max-width: 768px; margin: 0 auto; width: 100%; }
        .cc-day-div {
          display: flex; align-items: center; gap: 10px; margin: 12px 0 10px;
          font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em;
          color: rgba(255,255,255,0.2);
        }
        .cc-day-div::before, .cc-day-div::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.05); }
        /* Bottom tabs — 48px min height (44px touch target + comfort) */
        .cc-tabs {
          display: flex; border-top: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(16px);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .cc-tab {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
          padding: 12px 4px 10px; font-size: 10px; font-weight: 500;
          color: rgba(255,255,255,0.35); cursor: pointer; transition: all 0.14s; border: none; background: transparent;
          touch-action: manipulation; min-height: 48px;
        }
        .cc-tab:hover { color: rgba(255,255,255,0.65); }
        .cc-tab:active { transform: scale(0.95); }
        .cc-tab.active { color: rgba(56,189,248,1); }
        .cc-tab:focus-visible { outline: none; color: #fff; box-shadow: inset 0 -2px 0 rgba(14,165,233,0.85); }
        .cc-filter:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(14,165,233,0.6); }
        /* Rail — service selector strip */
        .cc-rail {
          display: flex; align-items: center; gap: 6px; padding: 10px 12px;
          overflow-x: auto; scrollbar-width: none; flex-shrink: 0;
          border-top: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.25);
          -webkit-overflow-scrolling: touch;
        }
        .cc-rail::-webkit-scrollbar { display: none; }
        .cc-rail-hub {
          display: flex; align-items: center; gap: 6px; flex-shrink: 0; padding: 9px 12px;
          border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.65);
          cursor: pointer; transition: background 0.14s; white-space: nowrap;
          touch-action: manipulation; min-height: 44px;
        }
        .cc-rail-hub:hover { background: rgba(255,255,255,0.07); }
        .cc-rail-hub:active { transform: scale(0.96); }
        .cc-pills { display: flex; gap: 6px; }
        /* Service pills — 56×52px for easy tapping */
        .cc-pill {
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          width: 56px; height: 52px; flex-shrink: 0; border-radius: 13px;
          border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02);
          font-size: 9px; font-weight: 500; color: rgba(255,255,255,0.45);
          cursor: pointer; transition: all 0.14s; touch-action: manipulation;
        }
        .cc-pill:hover { color: rgba(255,255,255,0.75); border-color: rgba(255,255,255,0.14); }
        .cc-pill:active { transform: scale(0.94); }
        .cc-pill.active { border-color: rgba(14,165,233,0.55); background: rgba(14,165,233,0.12); color: #fff; }
        /* Input area — safe bottom inset + keyboard handling */
        .cc-input-wrap {
          padding: 8px 12px; padding-bottom: max(env(safe-area-inset-bottom, 12px), 12px);
          flex-shrink: 0; position: relative;
        }
        .cc-input-bar {
          display: flex; align-items: flex-end; gap: 4px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 22px; padding: 4px;
          backdrop-filter: blur(16px);
          transition: border-color 0.2s, box-shadow 0.25s, background 0.2s;
        }
        .cc-input-bar:focus-within {
          border-color: rgba(14,165,233,0.45);
          background: rgba(255,255,255,0.06);
          box-shadow: 0 0 0 4px rgba(14,165,233,0.1), 0 8px 24px -10px rgba(14,165,233,0.35);
        }
        /* 16px on mobile prevents iOS auto-zoom; keep 15px with explicit override */
        .cc-textarea {
          flex: 1; min-height: 20px; max-height: 140px; resize: none;
          background: transparent; border: none; outline: none;
          font-size: 16px; line-height: 1.5; color: #fff; padding: 6px 6px;
          font-family: inherit; -webkit-appearance: none;
        }
        @media (min-width: 480px) { .cc-textarea { font-size: 15px; } }
        .cc-textarea::placeholder { color: rgba(255,255,255,0.3); }
        /* Input action buttons — 44px touch target */
        .cc-ibtn {
          width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.65);
          cursor: pointer; transition: all 0.14s; border: none; position: relative;
          touch-action: manipulation;
        }
        .cc-ibtn:hover { background: rgba(255,255,255,0.1); }
        .cc-ibtn:active { transform: scale(0.94); }
        .cc-ibtn.rec { background: rgba(239,68,68,0.18); color: rgba(248,113,113,1); }
        .cc-rec-dot {
          position: absolute; top: 5px; right: 5px; width: 7px; height: 7px;
          border-radius: 50%; background: #ef4444; animation: rec-blink 1s ease-in-out infinite;
          box-shadow: 0 0 5px rgba(239,68,68,0.8);
        }
        /* Send button — 44px touch target */
        .cc-send {
          width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.25);
          cursor: not-allowed; transition: all 0.18s; border: none;
          touch-action: manipulation;
        }
        .cc-send.ready {
          background: linear-gradient(135deg,#0369a1,#0ea5e9);
          color: #fff; cursor: pointer;
          box-shadow: 0 0 14px rgba(14,165,233,0.5);
          animation: cc-send-ready 2.4s ease-in-out infinite;
        }
        @keyframes cc-send-ready {
          0%, 100% { box-shadow: 0 0 14px rgba(14,165,233,0.45); }
          50% { box-shadow: 0 0 20px rgba(14,165,233,0.7); }
        }
        .cc-send.ready:hover { box-shadow: 0 0 24px rgba(14,165,233,0.8); transform: scale(1.06); animation: none; }
        .cc-send.ready:active { transform: scale(0.94); }
        .cc-send.ready:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(14,165,233,0.55), 0 0 20px rgba(14,165,233,0.7); }
        .cc-ibtn:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(14,165,233,0.6); }
        .cc-spin { animation: spin 0.8s linear infinite; }
        /* Library */
        .cc-library { padding: 14px; }
        .cc-lib-filters { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 10px; scrollbar-width: none; }
        .cc-lib-filters::-webkit-scrollbar { display: none; }
        .cc-filter {
          flex-shrink: 0; padding: 5px 13px; border-radius: 20px; font-size: 12px; font-weight: 500;
          border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.45); cursor: pointer; transition: all 0.14s;
        }
        .cc-filter.active { border-color: rgba(14,165,233,0.5); background: rgba(14,165,233,0.12); color: rgba(56,189,248,1); }
        .cc-filter:hover:not(.active) { color: rgba(255,255,255,0.75); }
        .cc-lib-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        @media (min-width: 440px) { .cc-lib-grid { grid-template-columns: repeat(3, 1fr); } }
        .cc-lib-item { position: relative; border-radius: 14px; overflow: hidden; aspect-ratio: 1; border: 1px solid rgba(255,255,255,0.06); }
        .cc-lib-badge {
          position: absolute; bottom: 6px; left: 6px; padding: 2px 7px; border-radius: 6px;
          background: rgba(0,0,0,0.55); font-size: 9px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.06em; color: rgba(255,255,255,0.8);
        }
        .cc-lib-db-dot {
          position: absolute; top: 6px; right: 6px; width: 7px; height: 7px;
          border-radius: 50%; background: rgba(34,197,94,0.85);
          box-shadow: 0 0 5px rgba(34,197,94,0.5);
        }
        /* Library skeleton — shimmer for premium loading */
        .cc-lib-skel {
          aspect-ratio: 1; border-radius: 14px;
          background: linear-gradient(110deg, rgba(255,255,255,0.04) 8%, rgba(255,255,255,0.08) 24%, rgba(255,255,255,0.04) 40%);
          background-size: 200% 100%; animation: cc-shimmer 1.6s ease-in-out infinite;
          border: 1px solid rgba(255,255,255,0.05);
        }
        @keyframes cc-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        /* Empty state halo + CTA */
        .cc-empty-icon-halo {
          width: 84px; height: 84px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: radial-gradient(circle at 50% 50%, rgba(56,189,248,0.18) 0%, rgba(56,189,248,0.06) 50%, transparent 70%);
          position: relative;
        }
        .cc-empty-icon-halo::before {
          content: ''; position: absolute; inset: -6px; border-radius: 50%;
          background: radial-gradient(circle, rgba(14,165,233,0.25) 0%, transparent 60%);
          animation: cc-halo-pulse 2.6s ease-in-out infinite;
        }
        @keyframes cc-halo-pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.12); opacity: 0.8; }
        }
        .cc-empty-cta {
          margin-top: 18px; display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 18px; border-radius: 999px; font-size: 13px; font-weight: 600;
          color: #fff; cursor: pointer; border: none;
          background: linear-gradient(135deg, #0369a1, #0ea5e9);
          box-shadow: 0 6px 20px -6px rgba(14,165,233,0.55);
          transition: transform 0.18s, box-shadow 0.22s;
        }
        .cc-empty-cta:hover { transform: translateY(-1px); box-shadow: 0 10px 28px -8px rgba(14,165,233,0.75); }
        .cc-empty-cta:active { transform: scale(0.97); }
        .cc-empty-cta:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(14,165,233,0.55), 0 6px 20px -6px rgba(14,165,233,0.55); }
        /* Pricing */
        .cc-pricing { padding: 20px 14px 36px; max-width: 440px; margin: 0 auto; }
        .cc-pricing-h { font-size: 20px; font-weight: 700; color: #fff; text-align: center; margin-bottom: 6px; }
        .cc-pricing-sub { font-size: 13px; color: rgba(255,255,255,0.4); text-align: center; margin-bottom: 20px; }
        .cc-plans { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
        .cc-credit-table { border-radius: 16px; border: 1px solid rgba(255,255,255,0.07); overflow: hidden; }
        .cc-credit-table-hd { padding: 11px 14px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.5); border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); }
        .cc-credit-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .cc-credit-row:last-child { border-bottom: none; }
        /* Hub overlay — slide-up service picker */
        .cc-hub-overlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-end; background: rgba(0,0,0,0.6); backdrop-filter: blur(5px); }
        .cc-hub {
          width: 100%; max-height: 70vh; background: #0f0f14; border-radius: 22px 22px 0 0;
          border: 1px solid rgba(255,255,255,0.08); border-bottom: none; overflow-y: auto;
          padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
          -webkit-overflow-scrolling: touch;
        }
        /* 4 cols on wide, 3 cols on small phones */
        .cc-hub-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 12px; }
        @media (max-width: 380px) { .cc-hub-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; } }
        .cc-hub-item {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 14px 4px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.02); cursor: pointer; transition: all 0.14s;
          touch-action: manipulation; min-height: 80px;
        }
        .cc-hub-item:hover { background: rgba(255,255,255,0.06); }
        .cc-hub-item:active { transform: scale(0.95); }
        .cc-hub-item.active { border-color: rgba(14,165,233,0.45); background: rgba(14,165,233,0.1); }
        .cc-hub-icon { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .cc-hub-name { font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.7); }
        .cc-hub-cost { font-size: 10px; color: rgba(255,255,255,0.3); display: flex; align-items: center; gap: 2px; }
        /* Toasts */
        .cc-toasts { position: fixed; bottom: 110px; left: 50%; transform: translateX(-50%); z-index: 100; display: flex; flex-direction: column; gap: 7px; align-items: center; pointer-events: none; }
        .cc-toast { display: flex; align-items: center; gap: 8px; padding: 9px 15px; border-radius: 20px; font-size: 13px; font-weight: 500; backdrop-filter: blur(16px); animation: toast-in 0.22s ease-out; white-space: nowrap; }
        .cc-toast-success { background: rgba(16,185,129,0.14); border: 1px solid rgba(16,185,129,0.28); color: #34d399; }
        .cc-toast-error { background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.28); color: #f87171; }
        .cc-toast-info { background: rgba(14,165,233,0.14); border: 1px solid rgba(14,165,233,0.3); color: #38bdf8; }
        /* Main scroll — momentum on iOS */
        .cc-main { flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; -webkit-overflow-scrolling: touch; }
        .cc-main::-webkit-scrollbar { width: 4px; }
        .cc-main::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 2px; }
        /* Keyframes */
        @keyframes orb-pulse {
          0%,100% { transform:scale(1); box-shadow:0 0 40px rgba(14,165,233,0.45),0 0 80px rgba(3,105,161,0.2),inset 0 1px 0 rgba(255,255,255,0.2); }
          50% { transform:scale(1.1); box-shadow:0 0 60px rgba(14,165,233,0.9),0 0 100px rgba(3,105,161,0.4),inset 0 1px 0 rgba(255,255,255,0.25); }
        }
        @keyframes orb-glow {
          0%,100% { box-shadow:0 0 40px rgba(14,165,233,0.5),0 0 80px rgba(3,105,161,0.2),inset 0 1px 0 rgba(255,255,255,0.2); }
          50% { box-shadow:0 0 70px rgba(14,165,233,1),0 0 120px rgba(56,189,248,0.6),inset 0 1px 0 rgba(255,255,255,0.3); }
        }
        @keyframes cc-wave { 0%,100% { transform:scaleY(0.5); } 50% { transform:scaleY(1.5); } }
        @keyframes rec-blink { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes cc-spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
        @keyframes bounce { 0%,100% { transform:translateY(0); opacity:0.5; } 50% { transform:translateY(-4px); opacity:1; } }
        @keyframes toast-in { from { opacity:0; transform:translateY(8px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes cc-shimmer { 0% { background-position:200% 0; } 100% { background-position:-200% 0; } }
        @keyframes cc-pulse { 0%,100% { opacity:0.6; transform:scale(1); } 50% { opacity:1; transform:scale(1.15); } }
        /* Cost badge */
        .cc-cost-badge {
          display: flex; align-items: center; gap: 3px;
          padding: 3px 8px; border-radius: 20px;
          background: rgba(14,165,233,0.15); border: 1px solid rgba(14,165,233,0.25);
          color: rgba(56,189,248,0.85); font-size: 11px; font-weight: 600;
          flex-shrink: 0; white-space: nowrap;
        }
        /* Music preset bar */
        .cc-preset-bar {
          display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;
          padding: 0 2px 8px; flex-wrap: nowrap;
        }
        .cc-preset-bar::-webkit-scrollbar { display: none; }
        .cc-preset-chip {
          flex-shrink: 0; padding: 5px 12px; border-radius: 20px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.55); font-size: 12px; cursor: pointer;
          transition: all 0.14s; white-space: nowrap;
        }
        .cc-preset-chip.active {
          background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.4);
          color: #fbbf24;
        }
        .cc-preset-chip:hover:not(.active) { background: rgba(255,255,255,0.08); color: #fff; }
        /* Video options */
        .cc-video-opts {
          display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;
        }
        .cc-video-group { display: flex; gap: 4px; }
        .cc-video-opt {
          display: flex; align-items: center; gap: 4px;
          padding: 5px 10px; border-radius: 8px; font-size: 11px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.14s;
          white-space: nowrap;
        }
        .cc-video-opt.active {
          background: rgba(249,115,22,0.15); border-color: rgba(249,115,22,0.4);
          color: #fb923c;
        }
        .cc-video-opt:hover:not(.active) { background: rgba(255,255,255,0.08); color: #fff; }
        /* Voice selector */
        .cc-voice-selector {
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 8px 12px; border-radius: 10px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.7); font-size: 13px; cursor: pointer;
          transition: all 0.14s; margin-bottom: 0;
        }
        .cc-voice-selector:hover { background: rgba(255,255,255,0.07); }
        .cc-voice-dropdown {
          position: absolute; bottom: calc(100% + 6px); left: 0; right: 0;
          background: #1a1a2e; border: 1px solid rgba(14,165,233,0.25);
          border-radius: 12px; overflow: hidden; z-index: 50;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .cc-voice-opt {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 10px 14px; font-size: 13px;
          color: rgba(255,255,255,0.7); cursor: pointer;
          transition: background 0.12s; border: none;
          background: transparent; text-align: left;
        }
        .cc-voice-opt:hover { background: rgba(255,255,255,0.06); color: #fff; }
        .cc-voice-opt.active { color: #7dd3fc; }
        /* @mention suggestions */
        .cc-char-suggestions {
          position: absolute; bottom: calc(100% + 6px); left: 12px; right: 12px;
          background: #1a1a2e; border: 1px solid rgba(14,165,233,0.25);
          border-radius: 12px; overflow: hidden; z-index: 50;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .cc-char-suggestion-item {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 10px 14px; font-size: 13px;
          color: rgba(255,255,255,0.75); cursor: pointer;
          transition: background 0.12s; border: none;
          background: transparent; text-align: left;
        }
        .cc-char-suggestion-item:hover { background: rgba(255,255,255,0.06); color: #fff; }
        .cc-char-suggestion-img {
          width: 28px; height: 28px; border-radius: 8px;
          object-fit: cover; border: 1px solid rgba(255,255,255,0.1);
          flex-shrink: 0;
        }
        /* Message action row — hidden on desktop until hover, always visible on touch */
        .cc-msg-actions {
          display: flex; gap: 3px; margin-top: 6px;
          opacity: 0; transition: opacity 0.15s;
        }
        .cc-msg-actions.hovered { opacity: 1; }
        /* Touch devices: always show */
        @media (pointer: coarse) {
          .cc-msg-actions { opacity: 0.55 !important; }
          .cc-msg-actions.hovered { opacity: 1 !important; }
        }
        /* Mobile responsive improvements */
        @media (max-width: 480px) {
          .cc-messages { padding: 8px 10px 4px; }
          .cc-input-wrap { padding: 6px 8px; padding-bottom: max(env(safe-area-inset-bottom, 8px), 8px); }
          .cc-orb-lg { width: 64px; height: 64px; }
          .cc-orb-g { font-size: 26px; }
          .cc-standby-title { font-size: 22px; }
          .cc-quick-cards { gap: 6px; }
          .cc-quick-card { padding: 11px 14px; min-width: 70px; }
          .cc-hub-grid { grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 8px 10px; }
          .cc-hub-item { padding: 10px 4px; }
          .cc-hub-icon { width: 32px; height: 32px; }
          .cc-rail { padding: 6px 8px; }
          .cc-toasts { bottom: 100px; width: calc(100% - 32px); }
          .cc-toast { white-space: normal; max-width: 100%; }
          .cc-preset-bar { padding-bottom: 6px; }
        }
        @media (max-width: 360px) {
          .cc-hub-grid { grid-template-columns: repeat(3, 1fr); }
          .cc-video-opts { gap: 6px; }
        }
      `}</style>
    </div>
  );
}

// ─── GenerationSkeleton ───────────────────────────────────────────────────────

function GenerationSkeleton({ service }: { service: string }) {
  const isVisual = ['image', 'video', 'avatar'].includes(service);
  const isAudio  = ['music', 'voice', 'audio'].includes(service);

  if (isVisual) {
    return (
      <div style={{ overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', display: 'inline-block', position: 'relative', width: 240, height: 200 }}>
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(110deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%)', backgroundSize: '200% 100%', animation: 'cc-shimmer 1.6s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div style={{ fontSize: 28, animation: 'cc-pulse 2s ease-in-out infinite' }}>
            {service === 'image' ? '🎨' : service === 'avatar' ? '🧑' : '🎬'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid rgba(14,165,233,0.4)', borderTopColor: '#0ea5e9', animation: 'cc-spin 0.8s linear infinite' }} />
            {service === 'image' ? 'სურათს ვქმნი...' : service === 'avatar' ? 'ავატარი...' : 'ვიდეო...'}
          </div>
        </div>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div style={{ padding: '14px 18px', borderRadius: '4px 18px 18px 18px', background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 240 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 20, animation: 'cc-pulse 1.5s ease-in-out infinite' }}>{service === 'music' ? '🎵' : '🎙️'}</div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{service === 'music' ? 'მუსიკას ვქმნი...' : 'ხმას ვქმნი...'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 28 }}>
          {Array.from({ length: 28 }, (_, i) => {
            const h = 4 + Math.abs(Math.sin(i * 0.7)) * 20;
            return (
              <div key={i} style={{ flex: 1, height: h, background: 'rgba(34,211,238,0.35)', borderRadius: 2, animation: `cc-wave 1.2s ${(i % 7) * 120}ms ease-in-out infinite` }} />
            );
          })}
        </div>
      </div>
    );
  }

  // Default: text typing dots
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '10px 14px', borderRadius: '4px 18px 18px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      {[0, 150, 300].map(d => (
        <span key={d} style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.45)', animation: `bounce 1s ${d}ms ease-in-out infinite` }} />
      ))}
    </div>
  );
}

// ─── MessageRow ───────────────────────────────────────────────────────────────

function MessageRow({ msg, copy, onCopy, onRetry, onSpeak, onLike, onDislike, onRemix }: {
  msg: ChatMessage;
  copy: (typeof COPY)[Locale];
  onCopy: () => void;
  onRetry: () => void;
  onSpeak: () => void;
  onLike: () => void;
  onDislike: () => void;
  onRemix: (prompt: string) => void;
}) {
  const [hover, setHover] = useState(false);

  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ padding: '10px 16px', borderRadius: '20px 20px 4px 20px', background: 'rgba(3,105,161,0.25)', border: '1px solid rgba(14,165,233,0.3)', fontSize: 15, lineHeight: 1.55, color: '#f5f5f7' }}>
            {msg.content}
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{formatTime(msg.ts)}</span>
        </div>
      </div>
    );
  }

  // Find related user message for prompt context
  const userPrompt = msg.content || '';

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {/* Orb */}
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#0ea5e9,#0369a1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 10px rgba(14,165,233,0.3)', marginTop: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>G</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>{copy.agentLabel}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{formatTime(msg.ts)}</span>
        </div>
        {msg.pending && !msg.content ? (
          <GenerationSkeleton service={msg.service ?? 'chat'} />
        ) : msg.pending && msg.content ? (
          <div style={{ padding: '10px 14px', borderRadius: '4px 18px 18px 18px', background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', fontSize: 14, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(14,165,233,0.4)', borderTopColor: '#0ea5e9', animation: 'cc-spin 0.8s linear infinite', flexShrink: 0 }} />
            {msg.content}
          </div>
        ) : msg.media ? (
          // ─── One Window: render media INLINE — never a raw URL ───
          msg.media.kind === 'code' ? (
            <InlineMedia kind="code" html={msg.media.html} language={msg.media.language} prompt={userPrompt} onRemix={onRemix} />
          ) : msg.media.kind === 'image' ? (
            <InlineMedia kind="image" url={msg.media.url} prompt={userPrompt} onRemix={onRemix} />
          ) : msg.media.kind === 'video' ? (
            <InlineMedia kind="video" url={msg.media.url} prompt={userPrompt} onRemix={onRemix} />
          ) : (
            <InlineMedia kind="audio" url={msg.media.url} prompt={userPrompt} onRemix={onRemix} />
          )
        ) : (() => {
          // ─── Auto-detect raw media URLs in text and hoist to InlineMedia ───
          const detected = detectInlineMedia(msg.content);
          if (detected) {
            const textWithoutUrl = msg.content.replace(detected.url, '').trim();
            return (
              <div>
                {textWithoutUrl && (
                  <div style={{ padding: '10px 14px', borderRadius: '4px 18px 18px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.88)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 8 }}>
                    {textWithoutUrl}
                  </div>
                )}
                <InlineMedia kind={detected.kind} url={detected.url} prompt={userPrompt} onRemix={onRemix} />
              </div>
            );
          }
          return (
            <div style={{ padding: '10px 14px', borderRadius: '4px 18px 18px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.88)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {msg.content}
            </div>
          );
        })()}
        {/* Actions — always visible on touch, fade-in on pointer:fine */}
        {!msg.pending && (msg.content || msg.media) && (
          <div className={`cc-msg-actions${hover ? ' hovered' : ''}`}>
            {msg.content && <Btn title="Copy" onClick={onCopy}><Copy style={{ width: 12, height: 12 }} /></Btn>}
            <Btn title="Retry" onClick={onRetry}><RotateCcw style={{ width: 12, height: 12 }} /></Btn>
            {msg.content && <Btn title="Speak" onClick={onSpeak}><Volume2 style={{ width: 12, height: 12 }} /></Btn>}
            <Btn title="Like" onClick={onLike} active={msg.liked}><ThumbsUp style={{ width: 12, height: 12 }} /></Btn>
            <Btn title="Dislike" onClick={onDislike} active={msg.disliked}><ThumbsDown style={{ width: 12, height: 12 }} /></Btn>
          </div>
        )}
      </div>
    </div>
  );
}

function Btn({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick} style={{
      width: 24, height: 24, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? 'rgba(14,165,233,0.2)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? 'rgba(14,165,233,0.4)' : 'rgba(255,255,255,0.06)'}`,
      color: active ? 'rgba(56,189,248,1)' : 'rgba(255,255,255,0.4)', cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

// ─── PlanCard ─────────────────────────────────────────────────────────────────

function PlanCard({ name, price, period, features, accent, btnClass, btnText, badge, href }: {
  name: string; price: string; period: string; features: string[];
  accent: string; btnClass: string; btnText: string; badge?: string; href?: string;
}) {
  const isUltimate = btnClass === 'cc-btn-ultimate';
  return (
    <div style={{
      position: 'relative', padding: 16, borderRadius: 18,
      border: `1px solid ${isUltimate ? 'rgba(245,158,11,0.4)' : badge ? 'rgba(14,165,233,0.45)' : 'rgba(255,255,255,0.08)'}`,
      background: isUltimate ? 'rgba(245,158,11,0.05)' : badge ? 'rgba(14,165,233,0.06)' : 'rgba(255,255,255,0.02)',
    }}>
      {badge && <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', padding: '3px 12px', borderRadius: 20, background: badge ? (isUltimate ? 'linear-gradient(90deg,#d97706,#f59e0b)' : 'linear-gradient(90deg,#0369a1,#0ea5e9)') : 'transparent', fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{badge}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{name}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: isUltimate ? '#f59e0b' : badge ? '#0ea5e9' : '#fff' }}>{price}<span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.35)' }}>{period}</span></span>
      </div>
      <ul style={{ listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {features.map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
            <Check style={{ width: 13, height: 13, color: accent, flexShrink: 0 }} />{f}
          </li>
        ))}
      </ul>
      {href ? (
        <a href={href} style={{ display: 'block', width: '100%', padding: '10px', borderRadius: 11, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }} className={btnClass}>
          {btnText}
        </a>
      ) : (
        <button type="button" className={btnClass} style={{ width: '100%', padding: '10px', borderRadius: 11, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {btnText}
        </button>
      )}
      <style jsx>{`
        .cc-btn-primary { background: linear-gradient(135deg,#0369a1,#0ea5e9); color:#fff; border:none; box-shadow:0 4px 18px rgba(14,165,233,0.4); }
        .cc-btn-primary:hover { transform:translateY(-1px); box-shadow:0 6px 22px rgba(14,165,233,0.55); }
        .cc-btn-ultimate { background: linear-gradient(135deg,#d97706,#f59e0b); color:#fff; border:none; box-shadow:0 4px 18px rgba(245,158,11,0.35); }
        .cc-btn-ultimate:hover { transform:translateY(-1px); box-shadow:0 6px 22px rgba(245,158,11,0.5); }
        .cc-btn-outline { background:transparent; color:rgba(255,255,255,0.55); border:1px solid rgba(255,255,255,0.12); }
        .cc-btn-outline:hover { border-color:rgba(255,255,255,0.25); color:#fff; }
      `}</style>
    </div>
  );
}
