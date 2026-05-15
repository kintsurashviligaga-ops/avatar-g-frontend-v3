'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Menu,
  Zap,
  Check,
  Library as LibraryIcon,
  History as HistoryIcon,
  ChevronRight,
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
} from 'lucide-react';

type Locale = 'ka' | 'en' | 'ru';
type Tab = 'chat' | 'library' | 'history';
type ServiceId = 'chat' | 'avatar' | 'image' | 'text' | 'music' | 'code' | 'video' | 'voice';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  media?: { kind: 'image' | 'video' | 'audio'; url: string };
  service?: ServiceId;
  pending?: boolean;
}

interface CommandCenterProps {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
}

const COPY = {
  ka: {
    title: 'myavatar.ge',
    subtitle: 'Command Center',
    agentLabel: 'Agent G',
    tabs: { chat: 'ჩატი', library: 'ბიბლიოთეკა', history: 'ისტორია' },
    credits: 'კრედიტი',
    services: { chat: 'ჩატი', avatar: 'ავატარი', image: 'სურათი', text: 'ტექსტი', music: 'მუსიკა', code: 'კოდი', video: 'ვიდეო', voice: 'ხმა' },
    aiServices: 'AI სერვისები',
    creativeTools: '8 შემოქმედებითი ხელსაწყო',
    placeholder: 'რა შევქმნათ დღეს...',
    sending: 'იგზავნება...',
    listening: 'მისმინე...',
    empty: 'დაიწყე საუბარი Agent G-სთან',
    libraryEmpty: 'ბიბლიოთეკა ცარიელია',
    historyEmpty: 'ისტორია ცარიელია',
    errorGeneric: 'შეცდომა მოხდა. სცადეთ თავიდან.',
    insufficient: 'არასაკმარისი კრედიტი',
  },
  en: {
    title: 'myavatar.ge',
    subtitle: 'Command Center',
    agentLabel: 'Agent G',
    tabs: { chat: 'Chat', library: 'Library', history: 'History' },
    credits: 'Credits',
    services: { chat: 'Chat', avatar: 'Avatar', image: 'Image', text: 'Text', music: 'Music', code: 'Code', video: 'Video', voice: 'Voice' },
    aiServices: 'AI Services',
    creativeTools: '8 creative tools',
    placeholder: 'Make a photo of a...',
    sending: 'Sending...',
    listening: 'Listening...',
    empty: 'Start a conversation with Agent G',
    libraryEmpty: 'Library is empty',
    historyEmpty: 'History is empty',
    errorGeneric: 'Something went wrong. Try again.',
    insufficient: 'Insufficient credits',
  },
  ru: {
    title: 'myavatar.ge',
    subtitle: 'Command Center',
    agentLabel: 'Agent G',
    tabs: { chat: 'Чат', library: 'Библиотека', history: 'История' },
    credits: 'Кредиты',
    services: { chat: 'Чат', avatar: 'Аватар', image: 'Изображение', text: 'Текст', music: 'Музыка', code: 'Код', video: 'Видео', voice: 'Голос' },
    aiServices: 'AI Сервисы',
    creativeTools: '8 креативных инструментов',
    placeholder: 'Сделай фото...',
    sending: 'Отправка...',
    listening: 'Слушаю...',
    empty: 'Начни разговор с Agent G',
    libraryEmpty: 'Библиотека пуста',
    historyEmpty: 'История пуста',
    errorGeneric: 'Что-то пошло не так. Попробуй снова.',
    insufficient: 'Недостаточно кредитов',
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

const SERVICES: Array<{ id: ServiceId; Icon: typeof UserIcon }> = [
  { id: 'avatar', Icon: UserIcon },
  { id: 'image', Icon: ImageIcon },
  { id: 'text', Icon: TextIcon },
  { id: 'music', Icon: MusicIcon },
  { id: 'code', Icon: CodeIcon },
  { id: 'video', Icon: VideoIcon },
  { id: 'voice', Icon: Volume2 },
];

function normalizeLocale(loc: string): Locale {
  if (loc === 'en' || loc === 'ru') return loc;
  return 'ka';
}

function mkId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

type OrbState = 'idle' | 'listening' | 'speaking';

const HISTORY_KEY = 'agentg_chat_history';

function detectSkillFromText(text: string): ServiceId | null {
  const t = text.toLowerCase();
  if (/\b(draw|paint|generate image|create image|make image|photo|სურათი|დახატე|შექმენი სურათი|нарисуй|создай фото)\b/i.test(t)) return 'image';
  if (/\b(create video|make video|generate video|animate|ვიდეო|შექმენი ვიდეო|видео)\b/i.test(t)) return 'video';
  if (/\b(compose|create music|make song|generate music|მუსიკა|შექმენი მუსიკა|музыка|create song|write song)\b/i.test(t)) return 'music';
  if (/\b(avatar|talking head|ავატარი|аватар)\b/i.test(t)) return 'avatar';
  if (/\b(speak|read aloud|read this|say this|voice|text to speech|წაიკითხე|ხმით|прочитай)\b/i.test(t)) return 'voice';
  return null;
}

export default function CommandCenter({ locale, userName, isAuthenticated }: CommandCenterProps) {
  const localeCode = normalizeLocale(locale);
  const copy = COPY[localeCode];

  const [tab, setTab] = useState<Tab>('chat');
  const [activeService, setActiveService] = useState<ServiceId>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [credits, setCredits] = useState(4200);
  const [isRecording, setIsRecording] = useState(false);
  const [aiServicesOpen, setAiServicesOpen] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<any>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new message
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

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed.slice(-20));
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Persist history on change
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      const toSave = messages.filter((m) => !m.pending).slice(-20);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(toSave));
    } catch { /* ignore */ }
  }, [messages]);

  // File attachment handler
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setAttachedImage({ base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const send = useCallback(
    async (rawText: string, forcedService?: ServiceId) => {
      const text = rawText.trim();
      if (!text || sending) return;

      // Auto-detect skill intent when in chat mode
      let service = forcedService ?? activeService;
      if (service === 'chat' && !forcedService) {
        const detected = detectSkillFromText(text);
        if (detected) {
          service = detected;
          setActiveService(detected);
        }
      }

      const cost = SERVICE_COSTS[service];

      if (credits < cost) {
        setMessages((m) => [
          ...m,
          {
            id: mkId(),
            role: 'assistant',
            content: copy.insufficient,
            ts: Date.now(),
          },
        ]);
        return;
      }

      const userMsg: ChatMessage = {
        id: mkId(),
        role: 'user',
        content: text,
        ts: Date.now(),
        service,
      };
      const pendingMsg: ChatMessage = {
        id: mkId(),
        role: 'assistant',
        content: '',
        ts: Date.now() + 1,
        service,
        pending: true,
      };

      setMessages((m) => [...m, userMsg, pendingMsg]);
      setInput('');
      setSending(true);
      setOrbState('speaking');

      try {
        // Route by service. Generative services hit dedicated endpoints; chat/text/code go through Agent G.
        if (service === 'avatar') {
          // HeyGen: start job, then client-polls status every 5s for up to 2 min
          const startRes = await fetch('/api/heygen/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: text }),
          });
          const startData = await startRes.json();
          if (!startData?.videoId) throw new Error(startData?.error || copy.errorGeneric);

          const videoId: string = startData.videoId;
          let videoUrl: string | null = null;

          for (let attempt = 0; attempt < 24; attempt++) {
            await new Promise((r) => setTimeout(r, 5000));
            const pollRes = await fetch(`/api/heygen/avatar?videoId=${encodeURIComponent(videoId)}`);
            if (!pollRes.ok) continue;
            const pollData = await pollRes.json();
            if (pollData?.status === 'completed' && pollData?.url) {
              videoUrl = pollData.url;
              break;
            }
            if (pollData?.status === 'failed') throw new Error(pollData?.error || copy.errorGeneric);
          }

          if (!videoUrl) throw new Error('HeyGen: video generation timed out');

          setMessages((m) =>
            m.map((msg) =>
              msg.id === pendingMsg.id
                ? { ...msg, pending: false, content: '', media: { kind: 'video', url: videoUrl! } }
                : msg,
            ),
          );
          setCredits((c) => c - cost);
        } else if (service === 'image') {
          const res = await fetch('/api/replicate/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text }),
          });
          const data = await res.json();
          const url = data?.url || data?.imageUrl || data?.output?.[0] || data?.data?.url;
          if (url) {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === pendingMsg.id
                  ? { ...msg, pending: false, content: '', media: { kind: 'image', url } }
                  : msg,
              ),
            );
            setCredits((c) => c - cost);
          } else {
            throw new Error(data?.error || copy.errorGeneric);
          }
        } else if (service === 'video') {
          const res = await fetch('/api/ltx-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text }),
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error((errData as any)?.error || copy.errorGeneric);
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === pendingMsg.id
                ? { ...msg, pending: false, content: '', media: { kind: 'video', url } }
                : msg,
            ),
          );
          setCredits((c) => c - cost);
        } else if (service === 'music') {
          const res = await fetch('/api/udio/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text, make_instrumental: false }),
          });
          const data = await res.json();
          const url = data?.url || data?.audioUrl;
          if (url) {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === pendingMsg.id
                  ? { ...msg, pending: false, content: '', media: { kind: 'audio', url } }
                  : msg,
              ),
            );
            setCredits((c) => c - cost);
          } else {
            throw new Error(data?.error || copy.errorGeneric);
          }
        } else if (service === 'voice') {
          // Voice = TTS via ElevenLabs
          const res = await fetch('/api/elevenlabs/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, locale: localeCode }),
          });
          if (!res.ok) throw new Error(copy.errorGeneric);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === pendingMsg.id
                ? { ...msg, pending: false, content: '🔊', media: { kind: 'audio', url } }
                : msg,
            ),
          );
          setCredits((c) => c - cost);
        } else {
          // chat / text / code → Gemini streaming (with vision if image attached)
          const historyMessages = messages
            .filter((m) => !m.pending)
            .slice(-20)
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

          type GeminiPart = { type: 'text'; text: string } | { type: 'image'; image: string; mimeType: string };
          type GeminiMsg =
            | { role: 'user' | 'assistant'; content: string }
            | { role: 'user'; content: GeminiPart[] };

          const currentMessage: GeminiMsg = attachedImage
            ? { role: 'user', content: [
                { type: 'image', image: attachedImage.base64, mimeType: attachedImage.mimeType },
                { type: 'text', text },
              ] }
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
                  setMessages((m) =>
                    m.map((msg) =>
                      msg.id === pendingMsg.id
                        ? { ...msg, pending: false, content: accumulated }
                        : msg,
                    ),
                  );
                }
              } catch { /* skip malformed SSE lines */ }
            }
          }

          if (!accumulated) throw new Error(copy.errorGeneric);
          setCredits((c) => c - cost);
        }
      } catch (err: any) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === pendingMsg.id
              ? { ...msg, pending: false, content: `⚠️ ${err?.message || copy.errorGeneric}` }
              : msg,
          ),
        );
      } finally {
        setSending(false);
        setOrbState('idle');
      }
    },
    [activeService, credits, copy, localeCode, messages, sending, attachedImage],
  );

  // Browser Web Speech API for STT — free, instant, no API key needed
  const toggleVoiceRecording = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      // Browser doesn't support — gracefully no-op
      return;
    }

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
    recog.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      setInput((finalText + interim).trim());
    };
    recog.onend = () => {
      setIsRecording(false);
      setOrbState('idle');
      if (finalText.trim()) {
        send(finalText);
      }
    };
    recog.onerror = () => { setIsRecording(false); setOrbState('idle'); };
    recogRef.current = recog;
    recog.start();
    setIsRecording(true);
    setOrbState('listening');
  }, [isRecording, localeCode, send]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  // Library + history use messages as the source of truth
  const libraryItems = useMemo(
    () => messages.filter((m) => m.media),
    [messages],
  );
  const historyItems = useMemo(
    () => messages.filter((m) => m.role === 'user'),
    [messages],
  );

  return (
    <div className="cc-root flex h-full w-full flex-col">
      {/* === HEADER === */}
      <header className="cc-header flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Menu"
            className="cc-icon-btn"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className={`cc-logo-wrap${orbState === 'listening' ? ' orb-listening' : orbState === 'speaking' ? ' orb-speaking' : ''}`}>
            <span className="cc-logo">G</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-white sm:text-base">
              {copy.title}
            </span>
            <span className="text-[11px] text-white/55 sm:text-xs">{copy.subtitle}</span>
          </div>
        </div>

        <div className="cc-credits flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-500/15 px-3 py-2 sm:px-4">
          <Zap className="h-4 w-4 text-purple-300" />
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wider text-purple-200/70">
              {copy.credits}
            </span>
            <span className="text-sm font-bold text-white sm:text-base">
              {credits.toLocaleString()}
            </span>
          </div>
        </div>
      </header>

      {/* === AGENT G LABEL + TABS === */}
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-1 sm:px-6">
        <span className="text-sm font-medium text-white/65">{copy.agentLabel}</span>
        <div className="cc-tabs flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1 backdrop-blur-xl">
          {(['chat', 'library', 'history'] as Tab[]).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
                  active
                    ? 'bg-white/10 text-white shadow-inner'
                    : 'text-white/55 hover:text-white/80'
                }`}
              >
                {t === 'chat' && <Check className="h-3.5 w-3.5" />}
                {t === 'library' && <LibraryIcon className="h-3.5 w-3.5" />}
                {t === 'history' && <HistoryIcon className="h-3.5 w-3.5" />}
                <span>{copy.tabs[t]}</span>
                {t === 'chat' && active && (
                  <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* === MAIN AREA === */}
      <div ref={scrollRef} className="cc-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
        {tab === 'chat' && (
          <ChatPanel
            messages={messages}
            copy={copy}
          />
        )}
        {tab === 'library' && (
          <PlaceholderPanel
            items={libraryItems}
            emptyText={copy.libraryEmpty}
            renderItem={(m) => (
              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                {m.media?.kind === 'image' && (
                  <img src={m.media.url} alt="" className="aspect-square w-full object-cover" />
                )}
                {m.media?.kind === 'video' && (
                  <video src={m.media.url} className="aspect-square w-full object-cover" muted loop />
                )}
                {m.media?.kind === 'audio' && (
                  <div className="flex aspect-square items-center justify-center bg-purple-500/10">
                    <MusicIcon className="h-12 w-12 text-purple-300" />
                  </div>
                )}
              </div>
            )}
          />
        )}
        {tab === 'history' && (
          <PlaceholderPanel
            items={historyItems}
            emptyText={copy.historyEmpty}
            renderItem={(m) => (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-white/45">
                  <span className="uppercase tracking-wider">{m.service ?? 'chat'}</span>
                  <span>{formatTime(m.ts)}</span>
                </div>
                <p className="line-clamp-2 text-sm text-white/85">{m.content}</p>
              </div>
            )}
          />
        )}
      </div>

      {/* === SERVICES RAIL === */}
      <div className="cc-services flex items-center gap-2 overflow-x-auto px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setAiServicesOpen((v) => !v)}
          className="cc-service-hub flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-left transition hover:bg-white/[0.07]"
        >
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-white">{copy.aiServices}</span>
            <span className="text-[11px] text-white/55">{copy.creativeTools}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-white/50" />
        </button>

        <div className="flex items-center gap-2">
          {SERVICES.map(({ id, Icon }) => {
            const active = activeService === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveService(id)}
                aria-pressed={active}
                className={`cc-service-pill flex h-[58px] w-[64px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border text-[11px] font-medium transition ${
                  active
                    ? 'border-purple-400/60 bg-purple-500/15 text-white shadow-[0_0_18px_rgba(139,92,246,0.18)]'
                    : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/85'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span>{copy.services[id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
        aria-hidden="true"
      />

      {/* === INPUT BAR === */}
      <div className="cc-input-wrap px-4 pb-4 sm:px-6 sm:pb-5" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        {/* Attached image preview */}
        {attachedImage && (
          <div className="mb-2 flex items-center gap-2 px-2">
            <img
              src={attachedImage.base64}
              alt="Attachment"
              className="h-16 w-16 rounded-xl border border-white/20 object-cover"
            />
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              className="text-white/50 hover:text-white"
              aria-label="Remove attachment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="cc-input flex items-end gap-2 rounded-full border border-white/12 bg-black/40 px-2 py-2 backdrop-blur-xl">
          <button
            type="button"
            aria-label="Add"
            className="cc-input-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/80 hover:bg-white/[0.12]"
          >
            <Plus className="h-5 w-5" />
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder={isRecording ? copy.listening : copy.placeholder}
            className="cc-textarea min-h-[24px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed text-white placeholder:text-white/40 focus:outline-none"
            inputMode="text"
          />

          {/* Waveform indicator when recording */}
          {isRecording && (
            <div className="flex h-10 items-center gap-[2px] px-2" aria-hidden="true">
              {[3, 5, 8, 6, 9, 4, 7].map((h, i) => (
                <span
                  key={i}
                  className="block w-[2px] rounded-full bg-purple-400"
                  style={{
                    height: `${h * 2}px`,
                    animation: `cc-wave 0.9s ${i * 80}ms infinite ease-in-out`,
                  }}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            aria-label="Voice"
            aria-pressed={isRecording}
            onClick={toggleVoiceRecording}
            className={`cc-input-btn relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
              isRecording
                ? 'bg-red-500/20 text-red-300'
                : 'bg-white/[0.06] text-white/80 hover:bg-white/[0.12]'
            }`}
          >
            <Mic className="h-5 w-5" />
            {isRecording && (
              <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
            )}
          </button>

          <button
            type="button"
            aria-label="Attach image"
            onClick={() => fileInputRef.current?.click()}
            className={`cc-input-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
              attachedImage
                ? 'bg-purple-500/30 text-purple-300'
                : 'bg-white/[0.06] text-white/80 hover:bg-white/[0.12]'
            }`}
          >
            <Paperclip className="h-5 w-5" />
          </button>

          <button
            type="button"
            aria-label="Send"
            disabled={!input.trim() || sending}
            onClick={() => send(input)}
            className={`cc-input-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
              input.trim() && !sending
                ? 'bg-purple-500 text-white shadow-[0_0_18px_rgba(139,92,246,0.5)] hover:bg-purple-400'
                : 'bg-white/[0.08] text-white/40'
            }`}
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* AI Services side sheet */}
      {aiServicesOpen && (
        <AiServicesSheet
          onClose={() => setAiServicesOpen(false)}
          onSelect={(id) => {
            setActiveService(id);
            setAiServicesOpen(false);
          }}
          copy={copy}
        />
      )}

      {/* === STYLES === */}
      <style jsx>{`
        .cc-root {
          background:
            radial-gradient(1200px 600px at 80% -100px, rgba(139, 92, 246, 0.14), transparent 60%),
            radial-gradient(900px 500px at -10% 110%, rgba(124, 58, 237, 0.10), transparent 60%),
            #09090b;
          color: #fafafa;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
        }
        .cc-header {
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(20px);
        }
        .cc-icon-btn {
          height: 44px;
          width: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.85);
          transition: all 0.15s ease;
        }
        .cc-icon-btn:hover {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.18);
        }
        .cc-logo-wrap {
          height: 40px;
          width: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a855f7 0%, #7c3aed 60%, #5b21b6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 24px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .cc-logo {
          font-size: 18px;
          font-weight: 800;
          color: #ffffff;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          letter-spacing: -0.02em;
        }
        .cc-services::-webkit-scrollbar {
          display: none;
        }
        .cc-services {
          scrollbar-width: none;
        }
        .cc-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .cc-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        @keyframes cc-wave {
          0%,
          100% {
            transform: scaleY(0.6);
          }
          50% {
            transform: scaleY(1.4);
          }
        }
        @keyframes orb-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 24px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25);
          }
          50% {
            transform: scale(1.12);
            box-shadow: 0 0 48px rgba(139, 92, 246, 0.9), 0 0 72px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25);
          }
        }
        @keyframes orb-glow {
          0%, 100% {
            box-shadow: 0 0 24px rgba(139, 92, 246, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.25);
          }
          50% {
            box-shadow: 0 0 56px rgba(139, 92, 246, 1), 0 0 90px rgba(167, 139, 250, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.3);
          }
        }
        .cc-logo-wrap.orb-listening {
          animation: orb-pulse 1s ease-in-out infinite;
        }
        .cc-logo-wrap.orb-speaking {
          animation: orb-glow 0.75s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ChatPanel({
  messages,
  copy,
}: {
  messages: ChatMessage[];
  copy: (typeof COPY)[Locale];
}) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 py-12 text-center">
        <div className="cc-logo-wrap mx-auto" style={{ height: 56, width: 56 }}>
          <span className="cc-logo" style={{ fontSize: 24 }}>
            G
          </span>
        </div>
        <p className="text-sm text-white/55">{copy.empty}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-4">
      {messages.map((m) => (
        <MessageRow key={m.id} msg={m} copy={copy} />
      ))}
    </div>
  );
}

function MessageRow({ msg, copy }: { msg: ChatMessage; copy: (typeof COPY)[Locale] }) {
  if (msg.role === 'user') {
    return (
      <div className="flex items-start justify-end gap-2">
        <div className="flex max-w-[78%] flex-col items-end gap-1">
          <div className="rounded-[20px] rounded-br-md border border-purple-400/30 bg-purple-500/20 px-4 py-2.5 text-[15px] leading-relaxed text-white">
            {msg.content}
          </div>
          <span className="text-[10px] text-white/40">{formatTime(msg.ts)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div className="cc-logo-wrap shrink-0" style={{ height: 32, width: 32 }}>
        <span className="cc-logo" style={{ fontSize: 14 }}>
          G
        </span>
      </div>
      <div className="flex max-w-[78%] flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/70">{copy.agentLabel}</span>
          <span className="text-[10px] text-white/40">{formatTime(msg.ts)}</span>
        </div>
        {msg.pending && !msg.content ? (
          <div className="flex items-center gap-1 rounded-[20px] rounded-tl-md border border-white/10 bg-white/[0.04] px-4 py-3">
            <span className="block h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.3s]" />
            <span className="block h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:-0.15s]" />
            <span className="block h-1.5 w-1.5 animate-bounce rounded-full bg-white/60" />
          </div>
        ) : msg.media ? (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            {msg.media.kind === 'image' && (
              <img
                src={msg.media.url}
                alt=""
                className="max-w-[320px] object-cover"
                loading="lazy"
              />
            )}
            {msg.media.kind === 'video' && (
              <video src={msg.media.url} controls className="max-w-[320px]" />
            )}
            {msg.media.kind === 'audio' && (
              <div className="p-3">
                <audio src={msg.media.url} controls className="w-[280px]" />
              </div>
            )}
          </div>
        ) : (
          <div className="whitespace-pre-wrap rounded-[20px] rounded-tl-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[15px] leading-relaxed text-white/92">
            {msg.content}
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceholderPanel<T extends ChatMessage>({
  items,
  emptyText,
  renderItem,
}: {
  items: T[];
  emptyText: string;
  renderItem: (m: T) => React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center py-12 text-sm text-white/45">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-3 py-4 sm:grid-cols-3">
      {items.map((m) => (
        <div key={m.id}>{renderItem(m)}</div>
      ))}
    </div>
  );
}

function AiServicesSheet({
  onClose,
  onSelect,
  copy,
}: {
  onClose: () => void;
  onSelect: (id: ServiceId) => void;
  copy: (typeof COPY)[Locale];
}) {
  const ALL: Array<{ id: ServiceId; Icon: typeof UserIcon; cost: number }> = [
    { id: 'chat', Icon: TextIcon, cost: SERVICE_COSTS.chat },
    { id: 'avatar', Icon: UserIcon, cost: SERVICE_COSTS.avatar },
    { id: 'image', Icon: ImageIcon, cost: SERVICE_COSTS.image },
    { id: 'text', Icon: TextIcon, cost: SERVICE_COSTS.text },
    { id: 'music', Icon: MusicIcon, cost: SERVICE_COSTS.music },
    { id: 'code', Icon: CodeIcon, cost: SERVICE_COSTS.code },
    { id: 'video', Icon: VideoIcon, cost: SERVICE_COSTS.video },
    { id: 'voice', Icon: Volume2, cost: SERVICE_COSTS.voice },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#111115] p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{copy.aiServices}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cc-icon-btn"
            style={{ height: 36, width: 36 }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ALL.map(({ id, Icon, cost }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-purple-400/40 hover:bg-purple-500/10"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
                <Icon className="h-5 w-5 text-purple-300" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium text-white">{copy.services[id]}</span>
                <span className="text-[11px] text-white/50">
                  <Zap className="mr-0.5 inline h-2.5 w-2.5" />
                  {cost}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
