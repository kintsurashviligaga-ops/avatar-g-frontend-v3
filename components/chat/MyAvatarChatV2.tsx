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

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box,
  Camera,
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
  Music,
  Paperclip,
  PictureInPicture2,
  RotateCcw,
  Send,
  Settings,
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

const ACCENT = '#22d3ee';
const { idleUrl: AVATAR_VIDEO, poster: AVATAR_POSTER, hasVideo: HAS_AVATAR_VIDEO } = resolveAvatarVideo();

interface Props {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
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
  en: { placeholder: 'Type a message…', signIn: 'Sign in', signOut: 'Sign out', clearHistory: 'Clear history', history: 'History', menu: 'Menu', settings: 'Settings', language: 'Language', sound: 'Avatar sound', genericError: 'Something went wrong. Try again.' },
  ka: { placeholder: 'დაწერე შეტყობინება…', signIn: 'შესვლა', signOut: 'გასვლა', clearHistory: 'ისტორიის გასუფთავება', history: 'ისტორია', menu: 'მენიუ', settings: 'პარამეტრები', language: 'ენა', sound: 'ავატარის ხმა', genericError: 'რაღაც ხარვეზი. სცადე ხელახლა.' },
  ru: { placeholder: 'Введите сообщение…', signIn: 'Войти', signOut: 'Выйти', clearHistory: 'Очистить историю', history: 'История', menu: 'Меню', settings: 'Настройки', language: 'Язык', sound: 'Звук аватара', genericError: 'Что-то пошло не так. Попробуйте снова.' },
} as const;

/**
 * Unified control-dock modes. The selected mode is passed as `serviceContext`
 * to /api/chat/orchestrate, which biases intent detection + output type
 * (text / image / video / audio). `global` is the default free-form chat.
 */
const MODES = [
  { id: 'global',   Icon: MessageSquare, accent: '#22d3ee', label: { en: 'Chat',    ka: 'ჩატი',       ru: 'Чат' } },
  { id: 'video',    Icon: Film,          accent: '#38bdf8', label: { en: 'Film',    ka: 'ფილმი',      ru: 'Фильм' } },
  { id: 'avatar',   Icon: User,     accent: '#818cf8', label: { en: 'Avatar',  ka: 'AI ავატარი', ru: 'AI Аватар' } },
  { id: 'image',    Icon: ImagePlus,     accent: '#34d399', label: { en: 'Image',   ka: 'სურათი',     ru: 'Изображение' } },
  { id: 'music',    Icon: Music,         accent: '#f472b6', label: { en: 'Music',   ka: 'მუსიკა',     ru: 'Музыка' } },
  { id: 'interior', Icon: Box,           accent: '#10b981', label: { en: 'Room 3D', ka: 'ოთახის 3D',  ru: 'Комната 3D' } },
] as const;
type ServiceMode = typeof MODES[number]['id'];

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

export default function MyAvatarChatV2({ locale, userName, isAuthenticated }: Props) {
  const lang = (locale === 'ka' || locale === 'ru' ? locale : 'en') as 'en' | 'ka' | 'ru';
  const copy = COPY[lang];

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarSoundOn, setAvatarSoundOn] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);          // drag-constraints boundary
  const cornerVideoRef = useRef<HTMLVideoElement>(null);  // ambient corner loop
  const fullVideoRef = useRef<HTMLVideoElement>(null);    // expanded 9:16 preview
  const avatarDraggedRef = useRef(false);                 // distinguishes drag from tap

  // ── Auto-scroll on new message ─────────────────────────────────────
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isLoading]);

  // ── Auto-resize textarea ───────────────────────────────────────────
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [inputText]);

  // ── Speech recognition init ────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
      .webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript;
      if (t) dispatch({ type: 'SET_INPUT', text: t });
    };
    rec.onend = () => dispatch({ type: 'SET_RECORDING', value: false });
    recognitionRef.current = rec;
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

  // ── Send message ──────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? inputText).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now(),
    };
    dispatch({ type: 'ADD_MESSAGE', message: userMsg });
    dispatch({ type: 'SET_INPUT', text: '' });
    dispatch({ type: 'CLEAR_ATTACHMENTS' });
    dispatch({ type: 'SET_LOADING', value: true });

    try {
      abortRef.current = new AbortController();
      const history = messages
        .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role === 'user' || m.role === 'assistant')
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.text }));

      const res = await fetch('/api/chat/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: abortRef.current.signal,
        body: JSON.stringify({
          message: text,
          serviceContext: mode,
          locale: lang,
          history,
        }),
      });

      const data = await res.json() as {
        success?: boolean;
        message?: string;
        responseType?: 'text' | 'image' | 'video' | 'audio' | 'analysis' | 'action_suggestions';
        assetUrl?: string | null;
        metadata?: { model?: string; agentId?: string };
        error?: string;
      };

      if (!res.ok || data.success === false) {
        throw new Error(data.error || data.message || copy.genericError);
      }

      const assetType: ChatMessage['assetType'] =
        data.responseType === 'image' ? 'image'
        : data.responseType === 'video' ? 'video'
        : data.responseType === 'audio' ? 'audio'
        : null;

      dispatch({ type: 'ADD_MESSAGE', message: {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: data.message || '',
        timestamp: Date.now(),
        assetUrl: data.assetUrl ?? null,
        assetType,
        sourcePrompt: text,
        agentId: data.metadata?.agentId,
        model: data.metadata?.model,
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
      abortRef.current = null;
    }
  }, [inputText, isLoading, messages, lang, mode, copy.genericError]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const toggleRecording = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (isRecording) { rec.stop(); dispatch({ type: 'SET_RECORDING', value: false }); }
    else { rec.lang = lang === 'ka' ? 'ka-GE' : lang === 'ru' ? 'ru-RU' : 'en-US'; rec.start(); dispatch({ type: 'SET_RECORDING', value: true }); }
  }, [isRecording, lang]);

  const onPickFile = useCallback(() => fileInputRef.current?.click(), []);
  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const att: ServiceChatAttachment = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'file',
      mimeType: file.type,
      size: file.size,
    };
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => dispatch({ type: 'ADD_ATTACHMENT', attachment: { ...att, preview: reader.result as string, dataUrl: reader.result as string } });
      reader.readAsDataURL(file);
    } else {
      dispatch({ type: 'ADD_ATTACHMENT', attachment: att });
    }
    e.target.value = '';
  }, []);

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

  /* ─── Render ─────────────────────────────────────────────────────── */

  return (
    <div
      ref={stageRef}
      className="fixed inset-x-0 top-0 z-[5] flex flex-col bg-[#030303] text-zinc-100 antialiased overflow-hidden"
      style={{ height: keyboardOffset > 0 ? `calc(100dvh - ${keyboardOffset}px)` : '100dvh' }}
    >
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/70 bg-[#030303]/95 backdrop-blur-md"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}
      >
        {/* Hamburger → conversation-log drawer */}
        <button
          onClick={() => setHistoryOpen(true)}
          aria-label={copy.menu}
          className="h-9 w-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-zinc-50 hover:bg-zinc-900 transition active:scale-95"
        >
          <Menu size={18} />
        </button>

        <BalanceChip balanceGel={balanceGel} onClick={() => setWalletOpen(true)} />

        <div className="relative flex items-center gap-1">
          {/* Settings gear → system-state popover */}
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label={copy.settings}
            aria-expanded={settingsOpen}
            className={`h-9 w-9 rounded-full flex items-center justify-center transition active:scale-95 ${settingsOpen ? 'text-cyan-300 bg-zinc-900' : 'text-zinc-300 hover:text-zinc-50 hover:bg-zinc-900'}`}
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

          {/* Settings popover */}
          <AnimatePresence>
            {settingsOpen ? (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)} aria-hidden />
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  role="menu"
                  className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-zinc-800/80 bg-[#0a0a0a] p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
                >
                  <div className="flex items-center gap-2 px-1 pb-2 text-[11px] uppercase tracking-wider text-zinc-500">
                    <Globe size={13} /> {copy.language}
                  </div>
                  <div className="flex gap-1.5 pb-3">
                    {(['ka', 'en', 'ru'] as const).map((lc) => (
                      <button
                        key={lc}
                        onClick={() => changeLanguage(lc)}
                        className={`flex-1 h-8 rounded-lg text-[12px] font-semibold uppercase transition active:scale-95 border ${lang === lc ? 'border-cyan-400/50 bg-[#121212] text-cyan-200' : 'border-white/10 bg-[#121212] text-zinc-400 hover:text-zinc-200'}`}
                      >
                        {lc}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={toggleAvatarSound}
                    role="menuitemcheckbox"
                    aria-checked={avatarSoundOn}
                    className="w-full h-9 px-2 rounded-lg flex items-center justify-between text-[12.5px] text-zinc-300 hover:bg-zinc-900 transition"
                  >
                    <span className="flex items-center gap-2">
                      {avatarSoundOn ? <Volume2 size={15} /> : <VolumeX size={15} />} {copy.sound}
                    </span>
                    <span className={`relative h-5 w-9 rounded-full transition ${avatarSoundOn ? 'bg-cyan-500/70' : 'bg-zinc-700'}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${avatarSoundOn ? 'left-[1.125rem]' : 'left-0.5'}`} />
                    </span>
                  </button>
                </motion.div>
              </>
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      {/* ── Message feed ──────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 flex flex-col gap-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800/70 flex items-center justify-center mb-4 text-[28px]">⬡</div>
              <p className="text-[13px] text-zinc-400 leading-7">Ask anything. Generate music, video, or images.</p>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} accent={ACCENT} onRegenerate={() => sendMessage(m.sourcePrompt)} onFeedback={sendFeedback} onPlayAudio={playAssetAudio} />)
          )}
          {isLoading ? (
            <div className="flex items-center gap-2 text-[12px] text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: ACCENT }} />
              <span>...</span>
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
            <div className="relative h-full w-full overflow-hidden md:h-[94vh] md:w-auto md:aspect-[9/16] md:rounded-[1.75rem] md:border md:border-white/10 md:shadow-[0_40px_140px_-30px_rgba(34,211,238,0.6)]">
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
                  <span className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 text-white text-[44px]">🤖</span>
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
              border: `2px solid ${ACCENT}55`,
              boxShadow: `0 10px 36px -8px ${ACCENT}99`,
              background: 'radial-gradient(60% 60% at 50% 35%, rgba(34,211,238,0.18), rgba(0,0,0,0.6))',
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
            <span aria-hidden className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-cyan-400/30 animate-ping" />
            <span className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full bg-[#030303] border border-zinc-700/80 flex items-center justify-center pointer-events-none">
              <Maximize2 size={9} className="text-zinc-300" />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Composer (bottom anchor) ─────────────────────────────── */}
      <footer
        className="flex-shrink-0 border-t border-zinc-800/70 bg-[#030303]/95 backdrop-blur-md"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Attachment chips */}
        {attachments.length > 0 ? (
          <div className="px-3 pt-2 flex gap-2 overflow-x-auto">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 group bg-zinc-900 border border-zinc-800/70"
              >
                {att.preview ? (
                  <Image src={att.preview} alt={att.name} width={48} height={48} unoptimized className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400">
                    {att.type === 'video' ? '🎬' : att.type === 'audio' ? '🎵' : '📄'}
                  </div>
                )}
                <button
                  onClick={() => dispatch({ type: 'REMOVE_ATTACHMENT', id: att.id })}
                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove attachment"
                >
                  <span className="text-[8px] text-white">✕</span>
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Unified monolithic console: mode selector + composer ───── */}
        <div className="px-3 pt-2 pb-2 max-w-2xl mx-auto">
          <div className="rounded-3xl border border-zinc-800/80 bg-[#0a0a0a] transition-all focus-within:border-cyan-400/40 focus-within:shadow-[0_0_0_3px_rgba(34,211,238,0.08)]">
            {/* Mode selector — sets the orchestrator service context */}
            <div className="flex gap-1.5 overflow-x-auto px-2 pt-2 pb-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {MODES.map(({ id, Icon, accent, label }) => {
                const active = mode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    aria-pressed={active}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium border bg-[#121212] transition-all active:scale-95 ${
                      active
                        ? 'border-cyan-400/50 text-zinc-100 shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_6px_22px_-10px_rgba(34,211,238,0.7)]'
                        : 'border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
                    }`}
                  >
                    <Icon size={14} style={active ? { color: accent } : undefined} />
                    {label[lang]}
                  </button>
                );
              })}
            </div>

            <div className="mx-2 border-t border-zinc-800/70" />

            {/* Composer row — attachment, camera, input, mic, send */}
            <div className="flex items-end gap-1.5 px-2 py-2">
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" onChange={onFileChange} />
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
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (inputText.trim() && !isLoading) void sendMessage();
                  }
                }}
                placeholder={copy.placeholder}
                rows={1}
                className="flex-1 bg-transparent text-[15px] leading-7 text-zinc-50 placeholder-zinc-500 resize-none outline-none px-1 py-1.5 min-h-[36px]"
              />
              <button
                onClick={toggleRecording}
                aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
                className={`h-9 w-9 flex items-center justify-center rounded-xl transition active:scale-95 ${isRecording ? 'text-rose-300 bg-rose-500/10' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'}`}
              >
                {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
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
                    background: inputText.trim() ? `linear-gradient(135deg, ${ACCENT}, #0891b2)` : 'transparent',
                    boxShadow: inputText.trim() ? `0 0 18px -4px ${ACCENT}88` : 'none',
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
                  onClick={() => { dispatch({ type: 'CLEAR_MESSAGES' }); setHistoryOpen(false); }}
                  aria-label={copy.clearHistory}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] text-rose-300 hover:bg-rose-500/10 transition active:scale-95"
                >
                  <Trash2 size={13} /> {copy.clearHistory}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 text-[12px] text-zinc-500">
                {/* Server-side history list lives in a follow-up — local-session preview only. */}
                {messages.length === 0 ? (
                  <p>No messages yet.</p>
                ) : (
                  messages.slice(-20).map((m) => (
                    <div key={m.id} className="py-1.5 truncate" style={{ color: m.role === 'user' ? '#d4d4d8' : '#a1a1aa' }}>
                      <span className="text-[10px] uppercase tracking-wider mr-1.5 text-zinc-500">{m.role}</span>
                      {m.text.slice(0, 80)}
                    </div>
                  ))
                )}
              </div>
            </motion.aside>
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
    </div>
  );
}

/* ─── Per-message bubble with executive toolbar ────────────────────── */

function MessageBubble({
  message, accent, onRegenerate, onFeedback, onPlayAudio,
}: {
  message: ChatMessage;
  accent: string;
  onRegenerate: () => void;
  onFeedback: (id: string, rating: 'up' | 'down') => void;
  onPlayAudio: (url: string) => void;
}) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const bubbleVideoRef = useRef<HTMLVideoElement>(null);

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

  const downloadAsset = useCallback(() => {
    if (!message.assetUrl) return;
    // Real generated cloud asset — best-effort download (cross-origin URLs may
    // open in a new tab when the browser ignores the download attribute).
    const a = document.createElement('a');
    a.href = message.assetUrl;
    a.download = `myavatar-${message.id}`;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [message.assetUrl, message.id]);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col gap-2 max-w-[88%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={
            isError
              ? 'rounded-2xl px-3.5 py-2.5 text-[14px] leading-7 border border-rose-500/30 bg-rose-500/[0.06] text-rose-200'
              : isUser
              ? 'rounded-2xl px-3.5 py-2.5 text-[14px] leading-7 bg-zinc-100 text-zinc-950'
              : 'rounded-2xl px-3.5 py-2.5 text-[15px] leading-7 bg-[#0a0a0a] border border-zinc-800/70 text-zinc-100'
          }
        >
          {message.text}
        </div>

        {message.assetUrl && message.assetType === 'image' ? (
          <Image src={message.assetUrl} alt="Generated" width={1200} height={800} unoptimized className="rounded-2xl border border-zinc-800/70 max-w-full max-h-[280px] object-contain bg-black" />
        ) : null}
        {message.assetUrl && message.assetType === 'video' ? (
          <video
            ref={bubbleVideoRef}
            controls
            playsInline
            preload="metadata"
            className="rounded-2xl border border-zinc-800/70 max-w-full max-h-[280px] bg-black"
          >
            <source src={message.assetUrl} />
          </video>
        ) : null}
        {message.assetUrl && message.assetType === 'audio' ? (
          <audio controls preload="metadata" className="rounded-2xl">
            <source src={message.assetUrl} />
          </audio>
        ) : null}

        {/* Executive toolbar — assistant messages only */}
        {!isUser && !isError ? (
          <div className="flex items-center gap-1 mt-0.5 text-zinc-500">
            <button
              onClick={() => onFeedback(message.id, 'up')}
              aria-label="Good response"
              className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-zinc-900 hover:text-zinc-200 transition active:scale-95"
            >
              <ThumbsUp size={13} />
            </button>
            <button
              onClick={() => onFeedback(message.id, 'down')}
              aria-label="Poor response"
              className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-zinc-900 hover:text-zinc-200 transition active:scale-95"
            >
              <ThumbsDown size={13} />
            </button>
            {message.assetUrl && message.assetType === 'audio' ? (
              <button
                onClick={() => onPlayAudio(message.assetUrl!)}
                aria-label="Play audio"
                className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-zinc-900 hover:text-zinc-200 transition active:scale-95"
                style={{ color: accent }}
              >
                <Volume2 size={13} />
              </button>
            ) : null}
            {message.assetUrl && message.assetType === 'video' ? (
              <button
                onClick={togglePiP}
                aria-label="Picture in picture"
                className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-zinc-900 hover:text-zinc-200 transition active:scale-95"
              >
                <PictureInPicture2 size={13} />
              </button>
            ) : null}
            {message.assetUrl ? (
              <button
                onClick={downloadAsset}
                aria-label="Download media"
                className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-zinc-900 hover:text-zinc-200 transition active:scale-95"
              >
                <Download size={13} />
              </button>
            ) : null}
            {message.sourcePrompt ? (
              <button
                onClick={onRegenerate}
                aria-label="Regenerate"
                className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-zinc-900 hover:text-zinc-200 transition active:scale-95"
              >
                <RotateCcw size={13} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
