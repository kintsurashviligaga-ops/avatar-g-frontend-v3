'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Zap,
  Library as LibraryIcon,
  History as HistoryIcon,
  User as UserIcon,
  ImageIcon,
  Type as TextIcon,
  Music as MusicIcon,
  Code as CodeIcon,
  Video as VideoIcon,
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
  ChevronRight,
  Settings,
  LogOut,
  Check,
  Home as HomeIcon,
  CreditCard,
  Menu,
  Home,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Locale = 'ka' | 'en' | 'ru';
type View = 'chat' | 'library' | 'pricing';
type ServiceId = 'chat' | 'avatar' | 'image' | 'text' | 'music' | 'code' | 'video' | 'voice';
type OrbState = 'idle' | 'listening' | 'speaking';
type LibraryFilter = 'all' | 'images' | 'videos' | 'audio' | 'avatars';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  media?: { kind: 'image' | 'video' | 'audio'; url: string };
  service?: ServiceId;
  pending?: boolean;
  liked?: boolean;
  disliked?: boolean;
}

interface ConversationGroup {
  id: string;
  title: string;
  messages: ChatMessage[];
  ts: number;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
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
    subtitle: 'Agent G',
    agentLabel: 'Agent G',
    tabs: { chat: 'ჩატი', library: 'ბიბლიოთეკა', pricing: 'გეგმები' },
    credits: 'კრედიტი',
    services: { chat: 'ჩატი', avatar: 'ავატარი', image: 'სურათი', text: 'ტექსტი', music: 'მუსიკა', code: 'კოდი', video: 'ვიდეო', voice: 'ხმა' },
    aiServices: 'AI სერვისები',
    creativeTools: '8 შემოქმედებითი ხელსაწყო',
    placeholder: 'რა შევქმნათ დღეს...',
    sending: 'იგზავნება...',
    listening: 'ვუსმენ...',
    empty: 'გამარჯობა! მე ვარ Agent G.\nრა შევქმნათ დღეს?',
    libraryEmpty: 'ბიბლიოთეკა ცარიელია',
    historyEmpty: 'ისტორია ცარიელია',
    errorGeneric: 'შეცდომა მოხდა. სცადეთ თავიდან.',
    insufficient: 'არასაკმარისი კრედიტი. გთხოვ გეგმა განაახლე.',
    copied: 'კოპირებულია!',
    today: 'დღეს',
    yesterday: 'გუშინ',
    last7: 'ბოლო 7 დღე',
    older: 'ადრე',
    profile: 'პროფილი',
    history: 'ისტორია',
    settings: 'პარამეტრები',
    signOut: 'გასვლა',
    model: 'მოდელი',
    plan: 'გეგმა',
    free: 'უფასო',
    pro: 'Pro',
    business: 'Business',
    filterAll: 'ყველა',
    filterImages: 'სურათები',
    filterVideos: 'ვიდეო',
    filterAudio: 'აუდიო',
    filterAvatars: 'ავატარები',
    newChat: 'ახალი ჩატი',
    close: 'დახურვა',
    interior: 'ინტერიერი',
  },
  en: {
    title: 'myavatar.ge',
    subtitle: 'Agent G',
    agentLabel: 'Agent G',
    tabs: { chat: 'Chat', library: 'Library', pricing: 'Plans' },
    credits: 'Credits',
    services: { chat: 'Chat', avatar: 'Avatar', image: 'Image', text: 'Text', music: 'Music', code: 'Code', video: 'Video', voice: 'Voice' },
    aiServices: 'AI Services',
    creativeTools: '8 creative tools',
    placeholder: 'What shall we create today...',
    sending: 'Sending...',
    listening: 'Listening...',
    empty: "Hello! I'm Agent G.\nWhat shall we create today?",
    libraryEmpty: 'Library is empty',
    historyEmpty: 'No history yet',
    errorGeneric: 'Something went wrong. Try again.',
    insufficient: 'Insufficient credits. Please upgrade your plan.',
    copied: 'Copied!',
    today: 'Today',
    yesterday: 'Yesterday',
    last7: 'Last 7 days',
    older: 'Older',
    profile: 'Profile',
    history: 'History',
    settings: 'Settings',
    signOut: 'Sign out',
    model: 'Model',
    plan: 'Plan',
    free: 'Free',
    pro: 'Pro',
    business: 'Business',
    filterAll: 'All',
    filterImages: 'Images',
    filterVideos: 'Videos',
    filterAudio: 'Audio',
    filterAvatars: 'Avatars',
    newChat: 'New Chat',
    close: 'Close',
    interior: 'Interior',
  },
  ru: {
    title: 'myavatar.ge',
    subtitle: 'Agent G',
    agentLabel: 'Agent G',
    tabs: { chat: 'Чат', library: 'Библиотека', pricing: 'Тарифы' },
    credits: 'Кредиты',
    services: { chat: 'Чат', avatar: 'Аватар', image: 'Изображение', text: 'Текст', music: 'Музыка', code: 'Код', video: 'Видео', voice: 'Голос' },
    aiServices: 'AI Сервисы',
    creativeTools: '8 инструментов',
    placeholder: 'Что создадим сегодня...',
    sending: 'Отправка...',
    listening: 'Слушаю...',
    empty: 'Привет! Я Agent G.\nЧто создадим сегодня?',
    libraryEmpty: 'Библиотека пуста',
    historyEmpty: 'История пуста',
    errorGeneric: 'Что-то пошло не так. Попробуй снова.',
    insufficient: 'Недостаточно кредитов. Обнови тариф.',
    copied: 'Скопировано!',
    today: 'Сегодня',
    yesterday: 'Вчера',
    last7: 'Последние 7 дней',
    older: 'Раньше',
    profile: 'Профиль',
    history: 'История',
    settings: 'Настройки',
    signOut: 'Выйти',
    model: 'Модель',
    plan: 'Тариф',
    free: 'Бесплатно',
    pro: 'Pro',
    business: 'Business',
    filterAll: 'Все',
    filterImages: 'Изображения',
    filterVideos: 'Видео',
    filterAudio: 'Аудио',
    filterAvatars: 'Аватары',
    newChat: 'Новый чат',
    close: 'Закрыть',
    interior: 'Интерьер',
  },
} as const;

const SERVICE_COSTS: Record<ServiceId, number> = {
  chat: 1,
  text: 2,
  code: 5,
  voice: 5,
  image: 10,
  music: 15,
  avatar: 20,
  video: 50,
};

const SERVICE_ICONS: Record<ServiceId, React.ElementType> = {
  chat: TextIcon,
  avatar: UserIcon,
  image: ImageIcon,
  text: TextIcon,
  music: MusicIcon,
  code: CodeIcon,
  video: VideoIcon,
  voice: Volume2,
};

const QUICK_SERVICES: ServiceId[] = ['avatar', 'image', 'video', 'music', 'text', 'code', 'voice'];

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

function formatDate(ts: number, copy: (typeof COPY)[Locale]) {
  const now = new Date();
  const d = new Date(ts);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return copy.today;
  if (diffDays === 1) return copy.yesterday;
  if (diffDays < 7) return copy.last7;
  return copy.older;
}

function detectSkillFromText(text: string): ServiceId | null {
  if (/\b(draw|paint|generate image|create image|make image|photo|სურათი|დახატე|შექმენი სურათი|нарисуй|создай фото)\b/i.test(text)) return 'image';
  if (/\b(create video|make video|generate video|animate|ვიდეო|შექმენი ვიდეო|видео)\b/i.test(text)) return 'video';
  if (/\b(compose|create music|make song|generate music|მუსიკა|შექმენი მუსიკა|музыка|create song)\b/i.test(text)) return 'music';
  if (/\b(avatar|talking head|ავატარი|аватар)\b/i.test(text)) return 'avatar';
  if (/\b(speak|read aloud|say this|voice|text to speech|წაიკითხე|прочитай)\b/i.test(text)) return 'voice';
  return null;
}

function sameDay(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CommandCenter({ locale, userName, isAuthenticated }: CommandCenterProps) {
  const localeCode = normalizeLocale(locale);
  const copy = COPY[localeCode];

  // Core state
  const [view, setView] = useState<View>('chat');
  const [activeService, setActiveService] = useState<ServiceId>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [credits, setCredits] = useState(4200);
  const [isRecording, setIsRecording] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string } | null>(null);

  // Drawer state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);

  // Library state
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');

  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast helpers
  const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = mkId();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
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

  // Load history
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed.slice(-40));
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Persist history
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const toSave = messages.filter(m => !m.pending).slice(-40);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(toSave));
    } catch { /* ignore */ }
  }, [messages]);

  // Close drawers on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHistoryOpen(false);
        setProfileOpen(false);
        setHubOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // File select handler
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage({ base64: reader.result as string, mimeType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  // Send message
  const send = useCallback(async (rawText: string, forcedService?: ServiceId) => {
    const text = rawText.trim();
    if (!text || sending) return;

    let service = forcedService ?? activeService;
    if (service === 'chat' && !forcedService) {
      const detected = detectSkillFromText(text);
      if (detected) { service = detected; setActiveService(detected); }
    }

    const cost = SERVICE_COSTS[service];
    if (credits < cost) {
      showToast(copy.insufficient, 'error');
      return;
    }

    const userMsg: ChatMessage = { id: mkId(), role: 'user', content: text, ts: Date.now(), service };
    const pendingMsg: ChatMessage = { id: mkId(), role: 'assistant', content: '', ts: Date.now() + 1, service, pending: true };

    setMessages(m => [...m, userMsg, pendingMsg]);
    setInput('');
    setSending(true);
    setOrbState('speaking');

    try {
      if (service === 'avatar') {
        const startRes = await fetch('/api/heygen/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: text }),
        });
        const startData = await startRes.json() as { videoId?: string; error?: string };
        if (!startData?.videoId) throw new Error(startData?.error || copy.errorGeneric);
        const videoId = startData.videoId;
        let videoUrl: string | null = null;
        for (let i = 0; i < 24; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const pollRes = await fetch(`/api/heygen/avatar?videoId=${encodeURIComponent(videoId)}`);
          if (!pollRes.ok) continue;
          const pollData = await pollRes.json() as { status?: string; url?: string; error?: string };
          if (pollData?.status === 'completed' && pollData?.url) { videoUrl = pollData.url; break; }
          if (pollData?.status === 'failed') throw new Error(pollData?.error || copy.errorGeneric);
        }
        if (!videoUrl) throw new Error('HeyGen: video timed out');
        setMessages(m => m.map(msg => msg.id === pendingMsg.id
          ? { ...msg, pending: false, content: '', media: { kind: 'video', url: videoUrl! } }
          : msg));
        setCredits(c => c - cost);

      } else if (service === 'image') {
        const res = await fetch('/api/replicate/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });
        const data = await res.json() as { url?: string; imageUrl?: string; output?: string[]; data?: { url?: string }; error?: string };
        const url = data?.url || data?.imageUrl || data?.output?.[0] || data?.data?.url;
        if (!url) throw new Error(data?.error || copy.errorGeneric);
        setMessages(m => m.map(msg => msg.id === pendingMsg.id
          ? { ...msg, pending: false, content: '', media: { kind: 'image', url } }
          : msg));
        setCredits(c => c - cost);

      } else if (service === 'video') {
        const res = await fetch('/api/ltx-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(errData?.error || copy.errorGeneric);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setMessages(m => m.map(msg => msg.id === pendingMsg.id
          ? { ...msg, pending: false, content: '', media: { kind: 'video', url } }
          : msg));
        setCredits(c => c - cost);

      } else if (service === 'music') {
        const res = await fetch('/api/udio/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, make_instrumental: false }),
        });
        const data = await res.json() as { url?: string; audioUrl?: string; error?: string };
        const url = data?.url || data?.audioUrl;
        if (!url) throw new Error(data?.error || copy.errorGeneric);
        setMessages(m => m.map(msg => msg.id === pendingMsg.id
          ? { ...msg, pending: false, content: '', media: { kind: 'audio', url } }
          : msg));
        setCredits(c => c - cost);

      } else if (service === 'voice') {
        const res = await fetch('/api/elevenlabs/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, locale: localeCode }),
        });
        if (!res.ok) throw new Error(copy.errorGeneric);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setMessages(m => m.map(msg => msg.id === pendingMsg.id
          ? { ...msg, pending: false, content: '🔊 Audio ready', media: { kind: 'audio', url } }
          : msg));
        setCredits(c => c - cost);

      } else {
        // chat / text / code → Gemini streaming
        type GeminiPart = { type: 'text'; text: string } | { type: 'image'; image: string; mimeType: string };
        type GeminiMsg = { role: 'user' | 'assistant'; content: string } | { role: 'user'; content: GeminiPart[] };

        const historyMessages = messages.filter(m => !m.pending).slice(-20)
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        const currentMessage: GeminiMsg = attachedImage
          ? { role: 'user', content: [{ type: 'image', image: attachedImage.base64, mimeType: attachedImage.mimeType }, { type: 'text', text }] }
          : { role: 'user', content: text };

        const geminiMessages: GeminiMsg[] = [...historyMessages, currentMessage];
        if (attachedImage) setAttachedImage(null);

        const res = await fetch('/api/chat/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: geminiMessages }),
        });

        if (!res.ok || !res.body) throw new Error(copy.errorGeneric);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

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
              const parsed = JSON.parse(raw) as { text?: string };
              if (parsed.text) {
                accumulated += parsed.text;
                setMessages(m => m.map(msg => msg.id === pendingMsg.id
                  ? { ...msg, pending: false, content: accumulated }
                  : msg));
              }
            } catch { /* skip */ }
          }
        }

        if (!accumulated) throw new Error(copy.errorGeneric);
        setCredits(c => c - cost);
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : copy.errorGeneric;
      setMessages(m => m.map(msg => msg.id === pendingMsg.id
        ? { ...msg, pending: false, content: `⚠️ ${errMsg}` }
        : msg));
      showToast(errMsg, 'error');
    } finally {
      setSending(false);
      setOrbState('idle');
    }
  }, [activeService, credits, copy, localeCode, messages, sending, attachedImage, showToast]);

  // Voice recording
  const toggleVoiceRecording = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition
      || (window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;

    if (isRecording && recogRef.current) {
      recogRef.current.stop();
      setIsRecording(false);
      setOrbState('idle');
      return;
    }

    const recog = new SR();
    recog.lang = localeCode === 'ka' ? 'ka-GE' : localeCode === 'ru' ? 'ru-RU' : 'en-US';
    recog.continuous = false;
    recog.interimResults = true;

    let finalText = '';
    recog.onresult = (e: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (!result) continue;
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) finalText += alt.transcript;
        else interim += alt.transcript;
      }
      setInput((finalText + interim).trim());
    };
    recog.onend = () => {
      setIsRecording(false);
      setOrbState('idle');
      if (finalText.trim()) send(finalText);
    };
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
    navigator.clipboard.writeText(content).then(() => showToast(copy.copied)).catch(() => { /* ignore */ });
  }, [copy.copied, showToast]);

  const retryMessage = useCallback((msg: ChatMessage) => {
    const prev = messages.findLast(m => m.role === 'user' && m.id !== msg.id);
    if (prev) send(prev.content, msg.service);
  }, [messages, send]);

  const speakMessage = useCallback(async (text: string) => {
    try {
      const res = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, locale: localeCode }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play().catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }, [localeCode]);

  const toggleLike = useCallback((id: string, type: 'liked' | 'disliked') => {
    setMessages(m => m.map(msg => {
      if (msg.id !== id) return msg;
      const isOn = msg[type];
      return { ...msg, liked: type === 'liked' ? !isOn : false, disliked: type === 'disliked' ? !isOn : false };
    }));
  }, []);

  // Media items for library
  const mediaItems = useMemo(() => messages.filter(m => m.media), [messages]);
  const filteredMedia = useMemo(() => {
    if (libraryFilter === 'all') return mediaItems;
    if (libraryFilter === 'images') return mediaItems.filter(m => m.media?.kind === 'image');
    if (libraryFilter === 'videos') return mediaItems.filter(m => m.media?.kind === 'video');
    if (libraryFilter === 'audio') return mediaItems.filter(m => m.media?.kind === 'audio');
    if (libraryFilter === 'avatars') return mediaItems.filter(m => m.service === 'avatar');
    return mediaItems;
  }, [mediaItems, libraryFilter]);

  // Conversation groups for history
  const conversationGroups = useMemo<ConversationGroup[]>(() => {
    const groups: ConversationGroup[] = [];
    let currentGroup: ConversationGroup | null = null;

    for (const msg of messages) {
      if (msg.role !== 'user') continue;
      const label = formatDate(msg.ts, copy);
      if (!currentGroup || !sameDay(currentGroup.ts, msg.ts)) {
        currentGroup = { id: mkId(), title: label, messages: [msg], ts: msg.ts };
        groups.push(currentGroup);
      } else {
        currentGroup.messages.push(msg);
      }
    }

    return groups.reverse();
  }, [messages, copy]);

  const anyDrawerOpen = historyOpen || profileOpen;

  return (
    <div className="cc-root">
      {/* ─── Toast notifications ─── */}
      <div className="cc-toasts">
        {toasts.map(t => (
          <div key={t.id} className={`cc-toast cc-toast-${t.type}`}>
            {t.type === 'success' && <Check className="h-4 w-4" />}
            {t.type === 'error' && <X className="h-4 w-4" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* ─── Backdrop for drawers ─── */}
      {anyDrawerOpen && (
        <div
          className="cc-backdrop"
          onClick={() => { setHistoryOpen(false); setProfileOpen(false); }}
          aria-hidden="true"
        />
      )}

      {/* ─── History Drawer (left) ─── */}
      <aside className={`cc-drawer cc-drawer-left${historyOpen ? ' open' : ''}`}>
        <div className="cc-drawer-header">
          <span className="cc-drawer-title">{copy.history}</span>
          <button type="button" className="cc-icon-btn" onClick={() => setHistoryOpen(false)} aria-label={copy.close}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <button type="button" className="cc-new-chat-btn" onClick={clearChat}>
          <Plus className="h-4 w-4" />
          <span>{copy.newChat}</span>
        </button>
        <div className="cc-drawer-body">
          {conversationGroups.length === 0 ? (
            <p className="cc-empty-small">{copy.historyEmpty}</p>
          ) : (
            conversationGroups.map(group => (
              <div key={group.id} className="cc-hist-group">
                <span className="cc-hist-label">{group.title}</span>
                {group.messages.map(msg => (
                  <button
                    key={msg.id}
                    type="button"
                    className="cc-hist-item"
                    onClick={() => {
                      setView('chat');
                      setHistoryOpen(false);
                    }}
                  >
                    <span className="cc-hist-text">{msg.content}</span>
                    <span className="cc-hist-time">{formatTime(msg.ts)}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ─── Profile Drawer (right) ─── */}
      <aside className={`cc-drawer cc-drawer-right${profileOpen ? ' open' : ''}`}>
        <div className="cc-drawer-header">
          <span className="cc-drawer-title">{copy.profile}</span>
          <button type="button" className="cc-icon-btn" onClick={() => setProfileOpen(false)} aria-label={copy.close}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="cc-drawer-body">
          {/* User info */}
          <div className="cc-profile-user">
            <div className="cc-avatar-circle">
              {userName ? userName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="cc-profile-info">
              <span className="cc-profile-name">{userName || 'User'}</span>
              <span className="cc-profile-plan cc-plan-free">{copy.free}</span>
            </div>
          </div>

          {/* Credits */}
          <div className="cc-credits-card">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-purple-300" />
              <span className="text-sm text-white/70">{copy.credits}</span>
            </div>
            <span className="cc-credits-big">{credits.toLocaleString()}</span>
            <div className="cc-credits-bar">
              <div className="cc-credits-fill" style={{ width: `${Math.min((credits / 5000) * 100, 100)}%` }} />
            </div>
          </div>

          {/* Model */}
          <div className="cc-profile-section">
            <span className="cc-section-label">{copy.model}</span>
            <div className="cc-model-pill">
              <span className="cc-model-dot" />
              <span>Gemini 2.5 Flash</span>
            </div>
          </div>

          {/* Menu items */}
          <nav className="cc-profile-nav">
            <button type="button" className="cc-nav-item" onClick={() => { setView('pricing'); setProfileOpen(false); }}>
              <CreditCard className="h-4 w-4" />
              <span>{copy.plan}</span>
              <ChevronRight className="h-4 w-4 ml-auto opacity-40" />
            </button>
            <button type="button" className="cc-nav-item">
              <Settings className="h-4 w-4" />
              <span>{copy.settings}</span>
              <ChevronRight className="h-4 w-4 ml-auto opacity-40" />
            </button>
            <button type="button" className="cc-nav-item cc-nav-danger">
              <LogOut className="h-4 w-4" />
              <span>{copy.signOut}</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* ─── Header ─── */}
      <header className="cc-header">
        <button
          type="button"
          className="cc-icon-btn"
          onClick={() => { setHistoryOpen(true); setProfileOpen(false); }}
          aria-label={copy.history}
        >
          <HistoryIcon className="h-5 w-5" />
        </button>

        <div className="cc-header-center">
          <div className={`cc-orb${orbState === 'listening' ? ' orb-listening' : orbState === 'speaking' ? ' orb-speaking' : ''}`}>
            <span className="cc-orb-letter">G</span>
          </div>
          <div className="cc-header-text">
            <span className="cc-header-title">{copy.title}</span>
            <span className="cc-header-sub">{copy.subtitle}</span>
          </div>
        </div>

        <button
          type="button"
          className="cc-icon-btn"
          onClick={() => { setProfileOpen(true); setHistoryOpen(false); }}
          aria-label={copy.profile}
        >
          <UserIcon className="h-5 w-5" />
        </button>
      </header>

      {/* ─── Tab Bar ─── */}
      <nav className="cc-tabs">
        <button
          type="button"
          className={`cc-tab${view === 'chat' ? ' active' : ''}`}
          onClick={() => setView('chat')}
        >
          <Home className="h-3.5 w-3.5" />
          <span>{copy.tabs.chat}</span>
          {view === 'chat' && <span className="cc-tab-dot" />}
        </button>
        <button
          type="button"
          className={`cc-tab${view === 'library' ? ' active' : ''}`}
          onClick={() => setView('library')}
        >
          <LibraryIcon className="h-3.5 w-3.5" />
          <span>{copy.tabs.library}</span>
        </button>
        <button
          type="button"
          className={`cc-tab${view === 'pricing' ? ' active' : ''}`}
          onClick={() => setView('pricing')}
        >
          <Zap className="h-3.5 w-3.5" />
          <span>{copy.tabs.pricing}</span>
        </button>
      </nav>

      {/* ─── Main Content ─── */}
      <main className="cc-main" ref={scrollRef}>
        {/* ── Chat View ── */}
        {view === 'chat' && (
          <div className="cc-chat">
            {messages.length === 0 ? (
              <div className="cc-empty">
                <div className="cc-orb cc-orb-lg">
                  <span className="cc-orb-letter" style={{ fontSize: 28 }}>G</span>
                </div>
                <p className="cc-empty-text">{copy.empty}</p>
                {/* Quick start chips */}
                <div className="cc-quick-chips">
                  {(['image', 'video', 'music', 'avatar'] as ServiceId[]).map(id => {
                    const Icon = SERVICE_ICONS[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        className="cc-chip"
                        onClick={() => setActiveService(id)}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{copy.services[id]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="cc-messages">
                {messages.map((msg, i) => {
                  const prevMsg = messages[i - 1];
                  const showDivider = !prevMsg || !sameDay(prevMsg.ts, msg.ts);
                  return (
                    <div key={msg.id}>
                      {showDivider && (
                        <div className="cc-day-divider">
                          <span>{formatDate(msg.ts, copy)}</span>
                        </div>
                      )}
                      <MessageRow
                        msg={msg}
                        copy={copy}
                        onCopy={() => copyMessage(msg.content)}
                        onRetry={() => retryMessage(msg)}
                        onSpeak={() => speakMessage(msg.content)}
                        onLike={() => toggleLike(msg.id, 'liked')}
                        onDislike={() => toggleLike(msg.id, 'disliked')}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Library View ── */}
        {view === 'library' && (
          <div className="cc-library">
            {/* Filter pills */}
            <div className="cc-lib-filters">
              {(['all', 'images', 'videos', 'audio', 'avatars'] as LibraryFilter[]).map(f => (
                <button
                  key={f}
                  type="button"
                  className={`cc-filter-pill${libraryFilter === f ? ' active' : ''}`}
                  onClick={() => setLibraryFilter(f)}
                >
                  {f === 'all' && copy.filterAll}
                  {f === 'images' && copy.filterImages}
                  {f === 'videos' && copy.filterVideos}
                  {f === 'audio' && copy.filterAudio}
                  {f === 'avatars' && copy.filterAvatars}
                </button>
              ))}
            </div>
            {filteredMedia.length === 0 ? (
              <div className="cc-empty">
                <LibraryIcon className="h-12 w-12 text-white/20" />
                <p className="cc-empty-text">{copy.libraryEmpty}</p>
              </div>
            ) : (
              <div className="cc-lib-grid">
                {filteredMedia.map(m => (
                  <div key={m.id} className="cc-lib-item">
                    {m.media?.kind === 'image' && (
                      <img src={m.media.url} alt="" className="cc-lib-media" loading="lazy" />
                    )}
                    {m.media?.kind === 'video' && (
                      <video src={m.media.url} className="cc-lib-media" muted loop />
                    )}
                    {m.media?.kind === 'audio' && (
                      <div className="cc-lib-audio">
                        <MusicIcon className="h-10 w-10 text-purple-300" />
                        <span className="text-xs text-white/50 mt-1">{formatTime(m.ts)}</span>
                      </div>
                    )}
                    <div className="cc-lib-overlay">
                      <span className="text-[10px] text-white/80 uppercase">{m.service ?? 'ai'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pricing View ── */}
        {view === 'pricing' && (
          <div className="cc-pricing">
            <h2 className="cc-pricing-title">Choose Your Plan</h2>
            <p className="cc-pricing-sub">Unlock the full power of AI creation</p>
            <div className="cc-plans">
              {/* Free */}
              <div className="cc-plan">
                <div className="cc-plan-header">
                  <span className="cc-plan-name">{copy.free}</span>
                  <span className="cc-plan-price">$0<span className="cc-plan-period">/mo</span></span>
                </div>
                <ul className="cc-plan-features">
                  <li><Check className="h-3.5 w-3.5 text-green-400" /><span>100 credits/month</span></li>
                  <li><Check className="h-3.5 w-3.5 text-green-400" /><span>Basic chat</span></li>
                  <li><Check className="h-3.5 w-3.5 text-green-400" /><span>5 image generations</span></li>
                </ul>
                <button type="button" className="cc-plan-btn cc-plan-btn-outline">Current Plan</button>
              </div>

              {/* Pro */}
              <div className="cc-plan cc-plan-featured">
                <div className="cc-plan-badge">Popular</div>
                <div className="cc-plan-header">
                  <span className="cc-plan-name">{copy.pro}</span>
                  <span className="cc-plan-price">$20<span className="cc-plan-period">/mo</span></span>
                </div>
                <ul className="cc-plan-features">
                  <li><Check className="h-3.5 w-3.5 text-purple-400" /><span>5,000 credits/month</span></li>
                  <li><Check className="h-3.5 w-3.5 text-purple-400" /><span>All AI services</span></li>
                  <li><Check className="h-3.5 w-3.5 text-purple-400" /><span>Priority generation</span></li>
                  <li><Check className="h-3.5 w-3.5 text-purple-400" /><span>HD video output</span></li>
                </ul>
                <button type="button" className="cc-plan-btn cc-plan-btn-primary">Upgrade to Pro</button>
              </div>

              {/* Business */}
              <div className="cc-plan">
                <div className="cc-plan-header">
                  <span className="cc-plan-name">{copy.business}</span>
                  <span className="cc-plan-price">$40<span className="cc-plan-period">/mo</span></span>
                </div>
                <ul className="cc-plan-features">
                  <li><Check className="h-3.5 w-3.5 text-green-400" /><span>15,000 credits/month</span></li>
                  <li><Check className="h-3.5 w-3.5 text-green-400" /><span>API access</span></li>
                  <li><Check className="h-3.5 w-3.5 text-green-400" /><span>Custom avatars</span></li>
                  <li><Check className="h-3.5 w-3.5 text-green-400" /><span>Team workspace</span></li>
                </ul>
                <button type="button" className="cc-plan-btn cc-plan-btn-outline">Get Business</button>
              </div>
            </div>

            {/* Credit table */}
            <div className="cc-credit-table">
              <h3 className="cc-credit-table-title">Credit Costs</h3>
              <div className="cc-credit-rows">
                {(Object.entries(SERVICE_COSTS) as [ServiceId, number][]).map(([svc, cost]) => {
                  const Icon = SERVICE_ICONS[svc];
                  return (
                    <div key={svc} className="cc-credit-row">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-purple-400" />
                        <span className="text-sm text-white/80 capitalize">{copy.services[svc]}</span>
                      </div>
                      <span className="cc-credit-cost">
                        <Zap className="h-3 w-3 text-purple-400 inline mr-0.5" />
                        {cost}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ─── Service Rail (chat only) ─── */}
      {view === 'chat' && (
        <div className="cc-rail">
          <button
            type="button"
            className="cc-hub-btn"
            onClick={() => setHubOpen(v => !v)}
          >
            <span className="cc-hub-icon"><Menu className="h-4 w-4" /></span>
            <div className="cc-hub-text">
              <span className="text-sm font-semibold text-white">{copy.aiServices}</span>
              <span className="text-[11px] text-white/50">{copy.creativeTools}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-white/40 ml-auto" />
          </button>

          <div className="cc-service-pills">
            {QUICK_SERVICES.map(id => {
              const Icon = SERVICE_ICONS[id];
              const active = activeService === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveService(id)}
                  aria-pressed={active}
                  className={`cc-pill${active ? ' active' : ''}`}
                >
                  <Icon className="h-[17px] w-[17px]" />
                  <span>{copy.services[id]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Input Bar (chat only) ─── */}
      {view === 'chat' && (
        <div className="cc-input-wrap">
          {/* Attached image preview */}
          {attachedImage && (
            <div className="cc-attachment">
              <img src={attachedImage.base64} alt="" className="cc-attachment-img" />
              <button type="button" className="cc-attachment-rm" onClick={() => setAttachedImage(null)}>
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Credits display */}
          <div className="cc-input-meta">
            <span className="cc-credits-badge">
              <Zap className="h-3 w-3" />
              {credits.toLocaleString()}
            </span>
            {sending && <span className="cc-sending-text">{copy.sending}</span>}
          </div>

          <div className="cc-input-bar">
            <button
              type="button"
              className="cc-input-btn"
              aria-label="More"
              onClick={() => setHubOpen(v => !v)}
            >
              <Plus className="h-5 w-5" />
            </button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder={isRecording ? copy.listening : copy.placeholder}
              className="cc-textarea"
              inputMode="text"
            />

            {isRecording && (
              <div className="cc-waveform" aria-hidden="true">
                {[3, 5, 8, 6, 9, 4, 7].map((h, i) => (
                  <span key={i} className="cc-wave-bar" style={{ height: `${h * 2}px`, animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
            )}

            <button
              type="button"
              className="cc-input-btn"
              aria-label="Attach image"
              onClick={() => fileInputRef.current?.click()}
              style={attachedImage ? { color: 'rgba(167,139,250,1)', background: 'rgba(139,92,246,0.2)' } : undefined}
            >
              <Paperclip className="h-5 w-5" />
            </button>

            <button
              type="button"
              className={`cc-input-btn${isRecording ? ' recording' : ''}`}
              aria-label="Voice"
              aria-pressed={isRecording}
              onClick={toggleVoiceRecording}
            >
              <Mic className="h-5 w-5" />
              {isRecording && <span className="cc-rec-dot" />}
            </button>

            <button
              type="button"
              className={`cc-send-btn${(input.trim() && !sending) ? ' ready' : ''}`}
              aria-label="Send"
              disabled={!input.trim() || sending}
              onClick={() => send(input)}
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}

      {/* ─── Hidden file input ─── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        aria-hidden="true"
      />

      {/* ─── Agent Hub popup ─── */}
      {hubOpen && (
        <div className="cc-hub-overlay" onClick={() => setHubOpen(false)} aria-hidden="true">
          <div className="cc-hub" onClick={e => e.stopPropagation()}>
            <div className="cc-hub-header">
              <span className="cc-hub-title">{copy.aiServices}</span>
              <button type="button" className="cc-icon-btn" onClick={() => setHubOpen(false)} style={{ height: 32, width: 32 }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="cc-hub-grid">
              {([
                { id: 'avatar' as ServiceId, Icon: UserIcon },
                { id: 'image' as ServiceId, Icon: ImageIcon },
                { id: 'video' as ServiceId, Icon: VideoIcon },
                { id: 'music' as ServiceId, Icon: MusicIcon },
                { id: 'text' as ServiceId, Icon: TextIcon },
                { id: 'code' as ServiceId, Icon: CodeIcon },
                { id: 'voice' as ServiceId, Icon: Volume2 },
                { id: 'chat' as ServiceId, Icon: HomeIcon },
              ]).map(({ id, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`cc-hub-item${activeService === id ? ' active' : ''}`}
                  onClick={() => { setActiveService(id); setHubOpen(false); }}
                >
                  <div className="cc-hub-item-icon">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="cc-hub-item-name">{copy.services[id]}</span>
                  <span className="cc-hub-item-cost">
                    <Zap className="h-2.5 w-2.5 inline mr-0.5 text-purple-400" />
                    {SERVICE_COSTS[id]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Styles ─── */}
      <style jsx>{`
        /* === Root === */
        .cc-root {
          position: relative;
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
          overflow: hidden;
          background:
            radial-gradient(1400px 700px at 75% -120px, rgba(139, 92, 246, 0.13), transparent 60%),
            radial-gradient(1000px 600px at -5% 110%, rgba(124, 58, 237, 0.09), transparent 60%),
            #0a0a0e;
          color: #f8f8fc;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        /* === Backdrop === */
        .cc-backdrop {
          position: fixed;
          inset: 0;
          z-index: 40;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
        }

        /* === Drawers === */
        .cc-drawer {
          position: fixed;
          top: 0;
          bottom: 0;
          z-index: 50;
          width: 280px;
          background: #111116;
          border-color: rgba(255,255,255,0.07);
          display: flex;
          flex-direction: column;
          transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .cc-drawer-left {
          left: 0;
          border-right: 1px solid rgba(255,255,255,0.07);
          transform: translateX(-100%);
        }
        .cc-drawer-right {
          right: 0;
          border-left: 1px solid rgba(255,255,255,0.07);
          transform: translateX(100%);
        }
        .cc-drawer.open {
          transform: translateX(0);
        }
        .cc-drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .cc-drawer-title {
          font-size: 15px;
          font-weight: 600;
          color: #fff;
        }
        .cc-drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px 0;
        }
        .cc-drawer-body::-webkit-scrollbar { width: 4px; }
        .cc-drawer-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        .cc-new-chat-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 8px 12px 4px;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px dashed rgba(139,92,246,0.35);
          background: rgba(139,92,246,0.08);
          color: rgba(167,139,250,1);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s;
        }
        .cc-new-chat-btn:hover { background: rgba(139,92,246,0.15); }
        .cc-empty-small {
          padding: 24px 16px;
          text-align: center;
          font-size: 13px;
          color: rgba(255,255,255,0.35);
        }

        /* History items */
        .cc-hist-group { padding: 4px 0; }
        .cc-hist-label {
          display: block;
          padding: 8px 16px 4px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: rgba(255,255,255,0.35);
        }
        .cc-hist-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          padding: 10px 16px;
          text-align: left;
          cursor: pointer;
          transition: background 0.12s;
        }
        .cc-hist-item:hover { background: rgba(255,255,255,0.04); }
        .cc-hist-text {
          font-size: 13px;
          color: rgba(255,255,255,0.75);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }
        .cc-hist-time {
          font-size: 10px;
          color: rgba(255,255,255,0.3);
          flex-shrink: 0;
        }

        /* Profile drawer */
        .cc-profile-user {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          margin-bottom: 8px;
        }
        .cc-avatar-circle {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a855f7, #7c3aed);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }
        .cc-profile-info { display: flex; flex-direction: column; gap: 2px; }
        .cc-profile-name { font-size: 14px; font-weight: 600; color: #fff; }
        .cc-profile-plan {
          display: inline-block;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .cc-plan-free { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.55); }
        .cc-plan-pro { background: rgba(139,92,246,0.25); color: rgba(167,139,250,1); }
        .cc-credits-card {
          margin: 0 12px 8px;
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(139,92,246,0.08);
          border: 1px solid rgba(139,92,246,0.2);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .cc-credits-big { font-size: 24px; font-weight: 700; color: #fff; }
        .cc-credits-bar {
          height: 4px;
          border-radius: 2px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
        }
        .cc-credits-fill {
          height: 100%;
          border-radius: 2px;
          background: linear-gradient(90deg, #7c3aed, #a855f7);
          transition: width 0.4s ease;
        }
        .cc-profile-section { padding: 8px 16px; }
        .cc-section-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: rgba(255,255,255,0.35);
          display: block;
          margin-bottom: 6px;
        }
        .cc-model-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 8px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          font-size: 12px;
          color: rgba(255,255,255,0.75);
        }
        .cc-model-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #34d399;
          box-shadow: 0 0 6px rgba(52,211,153,0.7);
        }
        .cc-profile-nav { padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 4px; }
        .cc-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 12px 16px;
          font-size: 13px;
          color: rgba(255,255,255,0.75);
          cursor: pointer;
          transition: background 0.12s;
        }
        .cc-nav-item:hover { background: rgba(255,255,255,0.04); }
        .cc-nav-danger { color: rgba(248,113,113,0.85); }
        .cc-nav-danger:hover { background: rgba(239,68,68,0.06); }

        /* === Header === */
        .cc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          backdrop-filter: blur(20px);
          flex-shrink: 0;
        }
        .cc-header-center {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cc-header-text {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }
        .cc-header-title {
          font-size: 14px;
          font-weight: 700;
          color: #fff;
        }
        .cc-header-sub {
          font-size: 11px;
          color: rgba(255,255,255,0.45);
        }

        /* Orb */
        .cc-orb {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a855f7 0%, #7c3aed 60%, #5b21b6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 20px rgba(139,92,246,0.4), inset 0 1px 0 rgba(255,255,255,0.22);
          border: 1px solid rgba(255,255,255,0.12);
          flex-shrink: 0;
          transition: box-shadow 0.3s ease;
        }
        .cc-orb-lg {
          width: 64px;
          height: 64px;
          box-shadow: 0 0 32px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.22);
        }
        .cc-orb-letter {
          font-size: 16px;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.02em;
        }
        .cc-orb.orb-listening {
          animation: orb-pulse 1s ease-in-out infinite;
        }
        .cc-orb.orb-speaking {
          animation: orb-glow 0.75s ease-in-out infinite;
        }

        /* Icon button */
        .cc-icon-btn {
          height: 40px;
          width: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.8);
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          flex-shrink: 0;
        }
        .cc-icon-btn:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.15); }

        /* === Tabs === */
        .cc-tabs {
          display: flex;
          align-items: center;
          padding: 8px 16px;
          gap: 4px;
          flex-shrink: 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .cc-tab {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 7px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          color: rgba(255,255,255,0.45);
          cursor: pointer;
          transition: all 0.15s;
          position: relative;
        }
        .cc-tab:hover { color: rgba(255,255,255,0.75); }
        .cc-tab.active {
          background: rgba(255,255,255,0.08);
          color: #fff;
          font-weight: 600;
        }
        .cc-tab-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #34d399;
          box-shadow: 0 0 5px rgba(52,211,153,0.8);
        }

        /* === Main scroll area === */
        .cc-main {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }
        .cc-main::-webkit-scrollbar { width: 5px; }
        .cc-main::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }

        /* === Chat === */
        .cc-chat { display: flex; flex-direction: column; min-height: 100%; }
        .cc-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 48px 24px;
          text-align: center;
        }
        .cc-empty-text {
          font-size: 15px;
          color: rgba(255,255,255,0.5);
          white-space: pre-line;
          line-height: 1.6;
        }
        .cc-quick-chips {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
          margin-top: 8px;
        }
        .cc-chip {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 7px 14px;
          border-radius: 20px;
          border: 1px solid rgba(139,92,246,0.3);
          background: rgba(139,92,246,0.08);
          color: rgba(167,139,250,0.9);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }
        .cc-chip:hover { background: rgba(139,92,246,0.18); border-color: rgba(139,92,246,0.5); }

        .cc-messages {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 16px;
          max-width: 768px;
          margin: 0 auto;
          width: 100%;
        }

        /* Day divider */
        .cc-day-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 16px 0 12px;
          color: rgba(255,255,255,0.25);
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .cc-day-divider::before,
        .cc-day-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.06);
        }

        /* === Library === */
        .cc-library { padding: 16px; }
        .cc-lib-filters {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 12px;
          scrollbar-width: none;
        }
        .cc-lib-filters::-webkit-scrollbar { display: none; }
        .cc-filter-pill {
          flex-shrink: 0;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.5);
          cursor: pointer;
          transition: all 0.15s;
        }
        .cc-filter-pill.active {
          border-color: rgba(139,92,246,0.5);
          background: rgba(139,92,246,0.15);
          color: rgba(167,139,250,1);
        }
        .cc-filter-pill:hover:not(.active) { color: rgba(255,255,255,0.8); }
        .cc-lib-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        @media (min-width: 480px) { .cc-lib-grid { grid-template-columns: repeat(3, 1fr); } }
        .cc-lib-item {
          position: relative;
          border-radius: 14px;
          overflow: hidden;
          aspect-ratio: 1;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.02);
        }
        .cc-lib-media { width: 100%; height: 100%; object-fit: cover; }
        .cc-lib-audio {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(139,92,246,0.08);
        }
        .cc-lib-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 4px 8px;
          background: linear-gradient(to top, rgba(0,0,0,0.6), transparent);
        }

        /* === Pricing === */
        .cc-pricing { padding: 20px 16px 32px; max-width: 480px; margin: 0 auto; }
        .cc-pricing-title { font-size: 22px; font-weight: 700; color: #fff; text-align: center; margin-bottom: 6px; }
        .cc-pricing-sub { font-size: 13px; color: rgba(255,255,255,0.45); text-align: center; margin-bottom: 24px; }
        .cc-plans { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
        .cc-plan {
          position: relative;
          padding: 18px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.02);
        }
        .cc-plan-featured {
          border-color: rgba(139,92,246,0.5);
          background: rgba(139,92,246,0.07);
        }
        .cc-plan-badge {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          padding: 3px 12px;
          border-radius: 20px;
          background: linear-gradient(90deg, #7c3aed, #a855f7);
          font-size: 10px;
          font-weight: 700;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .cc-plan-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
        .cc-plan-name { font-size: 16px; font-weight: 700; color: #fff; }
        .cc-plan-price { font-size: 24px; font-weight: 800; color: #fff; }
        .cc-plan-period { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.4); }
        .cc-plan-features { display: flex; flex-direction: column; gap: 8px; list-style: none; margin-bottom: 16px; padding: 0; }
        .cc-plan-features li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.7); }
        .cc-plan-btn {
          width: 100%;
          padding: 11px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .cc-plan-btn-primary {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          color: #fff;
          border: none;
          box-shadow: 0 4px 20px rgba(139,92,246,0.4);
        }
        .cc-plan-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(139,92,246,0.55); }
        .cc-plan-btn-outline {
          background: transparent;
          color: rgba(255,255,255,0.65);
          border: 1px solid rgba(255,255,255,0.12);
        }
        .cc-plan-btn-outline:hover { border-color: rgba(255,255,255,0.25); color: #fff; }

        .cc-credit-table {
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.07);
          overflow: hidden;
        }
        .cc-credit-table-title {
          padding: 12px 16px;
          font-size: 13px;
          font-weight: 600;
          color: rgba(255,255,255,0.6);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }
        .cc-credit-rows { display: flex; flex-direction: column; }
        .cc-credit-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .cc-credit-row:last-child { border-bottom: none; }
        .cc-credit-cost { font-size: 13px; font-weight: 600; color: rgba(167,139,250,0.9); }

        /* === Service rail === */
        .cc-rail {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          overflow-x: auto;
          scrollbar-width: none;
          flex-shrink: 0;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .cc-rail::-webkit-scrollbar { display: none; }
        .cc-hub-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
          padding: 8px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.03);
          cursor: pointer;
          transition: all 0.15s;
          min-width: 160px;
        }
        .cc-hub-btn:hover { background: rgba(255,255,255,0.06); }
        .cc-hub-icon {
          width: 30px;
          height: 30px;
          border-radius: 9px;
          background: rgba(139,92,246,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(167,139,250,1);
          flex-shrink: 0;
        }
        .cc-hub-text { display: flex; flex-direction: column; line-height: 1.2; text-align: left; }
        .cc-service-pills { display: flex; gap: 6px; }
        .cc-pill {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          width: 58px;
          height: 54px;
          flex-shrink: 0;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.02);
          font-size: 10px;
          font-weight: 500;
          color: rgba(255,255,255,0.5);
          cursor: pointer;
          transition: all 0.15s;
        }
        .cc-pill:hover { color: rgba(255,255,255,0.8); border-color: rgba(255,255,255,0.15); }
        .cc-pill.active {
          border-color: rgba(139,92,246,0.6);
          background: rgba(139,92,246,0.14);
          color: #fff;
          box-shadow: 0 0 14px rgba(139,92,246,0.15);
        }

        /* === Input wrap === */
        .cc-input-wrap {
          padding: 8px 12px 12px;
          padding-bottom: max(env(safe-area-inset-bottom, 12px), 12px);
          flex-shrink: 0;
        }
        .cc-attachment {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          padding: 0 4px;
        }
        .cc-attachment-img {
          width: 56px;
          height: 56px;
          border-radius: 10px;
          object-fit: cover;
          border: 1px solid rgba(255,255,255,0.15);
        }
        .cc-attachment-rm {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.6);
          cursor: pointer;
        }
        .cc-input-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 4px 6px;
        }
        .cc-credits-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: rgba(167,139,250,0.75);
          font-weight: 500;
        }
        .cc-sending-text {
          font-size: 11px;
          color: rgba(255,255,255,0.35);
          animation: pulse 1.5s ease-in-out infinite;
        }
        .cc-input-bar {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 24px;
          padding: 6px 6px;
          backdrop-filter: blur(16px);
        }
        .cc-textarea {
          flex: 1;
          min-height: 22px;
          resize: none;
          background: transparent;
          border: none;
          outline: none;
          font-size: 15px;
          line-height: 1.5;
          color: #fff;
          padding: 6px 8px;
        }
        .cc-textarea::placeholder { color: rgba(255,255,255,0.35); }
        .cc-input-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.7);
          cursor: pointer;
          transition: all 0.15s;
          position: relative;
          border: none;
        }
        .cc-input-btn:hover { background: rgba(255,255,255,0.12); }
        .cc-input-btn.recording { background: rgba(239,68,68,0.2); color: rgba(248,113,113,1); }
        .cc-rec-dot {
          position: absolute;
          top: 6px;
          right: 6px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #ef4444;
          animation: pulse 1s ease-in-out infinite;
          box-shadow: 0 0 6px rgba(239,68,68,0.8);
        }
        .cc-send-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.3);
          cursor: not-allowed;
          transition: all 0.2s;
          border: none;
        }
        .cc-send-btn.ready {
          background: linear-gradient(135deg, #7c3aed, #a855f7);
          color: #fff;
          cursor: pointer;
          box-shadow: 0 0 16px rgba(139,92,246,0.5);
        }
        .cc-send-btn.ready:hover { box-shadow: 0 0 24px rgba(139,92,246,0.7); transform: scale(1.05); }

        /* Waveform */
        .cc-waveform {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 0 8px;
          height: 38px;
        }
        .cc-wave-bar {
          display: block;
          width: 2px;
          border-radius: 1px;
          background: rgba(167,139,250,0.9);
          animation: cc-wave 0.9s ease-in-out infinite;
        }

        /* === Agent Hub overlay === */
        .cc-hub-overlay {
          position: fixed;
          inset: 0;
          z-index: 60;
          display: flex;
          align-items: flex-end;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(4px);
        }
        .cc-hub {
          width: 100%;
          max-height: 70vh;
          background: #111116;
          border-radius: 24px 24px 0 0;
          border: 1px solid rgba(255,255,255,0.08);
          border-bottom: none;
          overflow-y: auto;
          padding-bottom: max(env(safe-area-inset-bottom, 16px), 16px);
        }
        .cc-hub-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 16px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .cc-hub-title { font-size: 15px; font-weight: 600; color: #fff; }
        .cc-hub-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          padding: 12px;
        }
        .cc-hub-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          padding: 14px 6px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.02);
          cursor: pointer;
          transition: all 0.15s;
        }
        .cc-hub-item:hover { background: rgba(255,255,255,0.06); }
        .cc-hub-item.active {
          border-color: rgba(139,92,246,0.5);
          background: rgba(139,92,246,0.12);
        }
        .cc-hub-item-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: rgba(139,92,246,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(167,139,250,0.9);
          border: 1px solid rgba(139,92,246,0.2);
        }
        .cc-hub-item.active .cc-hub-item-icon {
          background: rgba(139,92,246,0.25);
          border-color: rgba(139,92,246,0.45);
        }
        .cc-hub-item-name {
          font-size: 11px;
          font-weight: 500;
          color: rgba(255,255,255,0.7);
        }
        .cc-hub-item-cost {
          font-size: 10px;
          color: rgba(255,255,255,0.35);
        }

        /* === Toasts === */
        .cc-toasts {
          position: fixed;
          bottom: 120px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
          pointer-events: none;
        }
        .cc-toast {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          backdrop-filter: blur(16px);
          animation: toast-in 0.25s ease-out;
          white-space: nowrap;
        }
        .cc-toast-success {
          background: rgba(16,185,129,0.15);
          border: 1px solid rgba(16,185,129,0.3);
          color: rgba(52,211,153,1);
        }
        .cc-toast-error {
          background: rgba(239,68,68,0.15);
          border: 1px solid rgba(239,68,68,0.3);
          color: rgba(248,113,113,1);
        }
        .cc-toast-info {
          background: rgba(139,92,246,0.15);
          border: 1px solid rgba(139,92,246,0.3);
          color: rgba(167,139,250,1);
        }

        /* === Animations === */
        @keyframes cc-wave {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1.4); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes orb-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 20px rgba(139,92,246,0.4), inset 0 1px 0 rgba(255,255,255,0.22);
          }
          50% {
            transform: scale(1.14);
            box-shadow: 0 0 48px rgba(139,92,246,0.9), 0 0 72px rgba(139,92,246,0.35), inset 0 1px 0 rgba(255,255,255,0.25);
          }
        }
        @keyframes orb-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(139,92,246,0.45), inset 0 1px 0 rgba(255,255,255,0.22);
          }
          50% {
            box-shadow: 0 0 56px rgba(139,92,246,1), 0 0 90px rgba(167,139,250,0.6), inset 0 1px 0 rgba(255,255,255,0.3);
          }
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── MessageRow ───────────────────────────────────────────────────────────────

function MessageRow({
  msg,
  copy,
  onCopy,
  onRetry,
  onSpeak,
  onLike,
  onDislike,
}: {
  msg: ChatMessage;
  copy: (typeof COPY)[Locale];
  onCopy: () => void;
  onRetry: () => void;
  onSpeak: () => void;
  onLike: () => void;
  onDislike: () => void;
}) {
  const [actionsVisible, setActionsVisible] = useState(false);

  if (msg.role === 'user') {
    return (
      <div className="msg-user" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{
            padding: '10px 16px',
            borderRadius: '20px 20px 4px 20px',
            background: 'rgba(139,92,246,0.2)',
            border: '1px solid rgba(139,92,246,0.3)',
            fontSize: 15,
            lineHeight: 1.5,
            color: '#fff',
          }}>
            {msg.content}
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{formatTime(msg.ts)}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}
      onMouseEnter={() => setActionsVisible(true)}
      onMouseLeave={() => setActionsVisible(false)}
    >
      {/* Orb avatar */}
      <div style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 0 12px rgba(139,92,246,0.35)',
        border: '1px solid rgba(255,255,255,0.1)',
        marginTop: 2,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>G</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{copy.agentLabel}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{formatTime(msg.ts)}</span>
        </div>

        {msg.pending && !msg.content ? (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '10px 16px',
            borderRadius: '4px 20px 20px 20px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {[0, 150, 300].map(delay => (
              <span key={delay} style={{
                display: 'block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.5)',
                animation: `bounce 1s ${delay}ms ease-in-out infinite`,
              }} />
            ))}
          </div>
        ) : msg.media ? (
          <div style={{ overflow: 'hidden', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
            {msg.media.kind === 'image' && (
              <img src={msg.media.url} alt="" style={{ maxWidth: 300, display: 'block', objectFit: 'cover' }} loading="lazy" />
            )}
            {msg.media.kind === 'video' && (
              <video src={msg.media.url} controls style={{ maxWidth: 300, display: 'block' }} />
            )}
            {msg.media.kind === 'audio' && (
              <div style={{ padding: 12 }}>
                <audio src={msg.media.url} controls style={{ width: 260 }} />
              </div>
            )}
          </div>
        ) : (
          <div style={{
            padding: '10px 16px',
            borderRadius: '4px 20px 20px 20px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            fontSize: 15,
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.9)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {msg.content}
          </div>
        )}

        {/* Message actions */}
        {!msg.pending && msg.content && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            marginTop: 6,
            opacity: actionsVisible ? 1 : 0,
            transition: 'opacity 0.15s',
          }}>
            <ActionBtn onClick={onCopy} title="Copy"><Copy style={{ width: 13, height: 13 }} /></ActionBtn>
            <ActionBtn onClick={onRetry} title="Retry"><RotateCcw style={{ width: 13, height: 13 }} /></ActionBtn>
            <ActionBtn onClick={onSpeak} title="Speak"><Volume2 style={{ width: 13, height: 13 }} /></ActionBtn>
            <ActionBtn onClick={onLike} title="Like" active={msg.liked}><ThumbsUp style={{ width: 13, height: 13 }} /></ActionBtn>
            <ActionBtn onClick={onDislike} title="Dislike" active={msg.disliked}><ThumbsDown style={{ width: 13, height: 13 }} /></ActionBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, title, active }: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
        color: active ? 'rgba(167,139,250,1)' : 'rgba(255,255,255,0.45)',
        cursor: 'pointer',
        transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  );
}
