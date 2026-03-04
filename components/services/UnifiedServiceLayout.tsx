'use client';

import { useState, useRef, useEffect, useCallback, type DragEvent, type ChangeEvent } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  artifacts?: Artifact[];
  timestamp: Date;
}

interface Artifact {
  type: 'image' | 'video' | 'audio' | 'text' | 'file';
  url?: string;
  content?: string;
  label: string;
  mimeType: string;
}

interface UnifiedServiceLayoutProps {
  serviceId: string;
  serviceName: string;
  serviceIcon: string;
  agentId: string;
  locale: string;
  features: string[];
  description: string;
  onAuthRequired?: () => void;
  isAuthenticated?: boolean;
  demoMode?: boolean;
}

type LocaleCode = 'en' | 'ka' | 'ru';

// ─── Translations ────────────────────────────────────────────────────────────

const T: Record<string, Record<string, string>> = {
  en: {
    useAgent: 'Use Service Agent',
    placeholder: 'Describe what you want to create...',
    send: 'Send',
    upload: 'Upload',
    record: 'Voice',
    automation: 'Automation',
    export: 'Export',
    history: 'History',
    preview: 'Preview',
    tools: 'Tools',
    dragDrop: 'Drag & drop files here',
    loginRequired: 'Login required to run',
    login: 'Log In',
    quickActions: 'Quick Actions',
    credits: 'Credits',
    generating: 'Generating...',
    features: 'Capabilities',
    powered: 'Powered by Agent G',
    recording: 'Recording...',
    stopRecord: 'Stop',
    noPreview: 'Run a task to see preview',
    camera: 'Camera',
    closeCamera: 'Close Camera',
    support: 'Support',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    phone: 'Phone',
    retryNotice: 'Provider is rate-limited. Please retry in',
    seconds: 'seconds',
    dismiss: 'Dismiss',
  },
  ka: {
    useAgent: 'აგენტის გამოყენება',
    placeholder: 'აღწერე რა გინდა შექმნა...',
    send: 'გაგზავნა',
    upload: 'ატვირთვა',
    record: 'ხმა',
    automation: 'ავტომატიზაცია',
    export: 'ექსპორტი',
    history: 'ისტორია',
    preview: 'გადახედვა',
    tools: 'ხელსაწყოები',
    dragDrop: 'ჩააგდე ფაილები აქ',
    loginRequired: 'გაშვებისთვის საჭიროა ავტორიზაცია',
    login: 'შესვლა',
    quickActions: 'სწრაფი მოქმედებები',
    credits: 'კრედიტი',
    generating: 'იქმნება...',
    features: 'შესაძლებლობები',
    powered: 'აგენტი G-ით მართული',
    recording: 'ჩაწერა...',
    stopRecord: 'შეჩერება',
    noPreview: 'გაუშვი დავალება გადახედვისთვის',
    camera: 'კამერა',
    closeCamera: 'კამერის დახურვა',
    support: 'კონტაქტი',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    phone: 'ტელეფონი',
    retryNotice: 'პროვაიდერზე ლიმიტია. თავიდან სცადე',
    seconds: 'წამში',
    dismiss: 'დახურვა',
  },
  ru: {
    useAgent: 'Использовать агента',
    placeholder: 'Опишите что хотите создать...',
    send: 'Отправить',
    upload: 'Загрузить',
    record: 'Голос',
    automation: 'Автоматизация',
    export: 'Экспорт',
    history: 'История',
    preview: 'Просмотр',
    tools: 'Инструменты',
    dragDrop: 'Перетащите файлы сюда',
    loginRequired: 'Для запуска нужна авторизация',
    login: 'Войти',
    quickActions: 'Быстрые действия',
    credits: 'Кредиты',
    generating: 'Создаём...',
    features: 'Возможности',
    powered: 'На базе Агента G',
    recording: 'Запись...',
    stopRecord: 'Стоп',
    noPreview: 'Запустите задачу для просмотра',
    camera: 'Камера',
    closeCamera: 'Закрыть камеру',
    support: 'Контакты',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    phone: 'Телефон',
    retryNotice: 'Провайдер ограничен по лимиту. Повторите через',
    seconds: 'секунд',
    dismiss: 'Закрыть',
  },
};

function extractRetryAfterSeconds(input: string): number | null {
  const match = input.match(/retry(?:_after)?[^\d]*(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

// ─── Quick Action Chips ──────────────────────────────────────────────────────

const QUICK_ACTIONS: Record<string, string[]> = {
  avatar: ['Generate Avatar', 'Full-body Scan', 'Style Transfer', 'Export GLB'],
  video: ['Create Storyboard', 'Generate Video', 'Add Captions', 'Export 9:16'],
  editing: ['Auto Subtitles', 'Color Grade', 'Lip Sync', 'Batch Export'],
  music: ['Generate Beat', 'Add Vocals', 'Mix & Master', 'Export Stems'],
  photo: ['Remove Background', 'Retouch', 'Batch Process', 'Before/After'],
  image: ['Generate Poster', 'Create Thumbnail', 'Style Pack', 'Upscale'],
  media: ['Campaign Pack', 'Brand Kit Check', 'Brief Parse', 'Asset Pipeline'],
  text: ['Write Ad Copy', 'Landing Page', 'SEO Optimize', 'Multi-lang'],
  prompt: ['Design Prompt', 'Negative Set', 'Test Run', 'Export JSON'],
  'visual-intel': ['Score Creative', 'Brand Audit', 'Improve Suggest', 'Report'],
  workflow: ['Build Pipeline', 'Set Schedule', 'Add Gate', 'Template'],
  shop: ['Create Listing', 'Optimize SEO', 'Affiliate Setup', 'Store Audit'],
  'agent-g': ['Plan Task', 'Execute Pipeline', 'Quality Check', 'Bundle Run'],
};

const SERVICE_CONTEXT: Record<string, 'global' | 'music' | 'video' | 'avatar' | 'voice' | 'business'> = {
  music: 'music',
  video: 'video',
  editing: 'video',
  avatar: 'avatar',
  photo: 'avatar',
  image: 'avatar',
  software: 'business',
  business: 'business',
};

const SERVICE_BACKGROUNDS: Record<string, string> = {
  avatar: 'radial-gradient(1200px 650px at 18% 12%, rgba(56,189,248,0.24), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(168,85,247,0.22), transparent 52%), linear-gradient(180deg, #050814 0%, #03050f 100%)',
  video: 'radial-gradient(1200px 650px at 25% 20%, rgba(59,130,246,0.22), transparent 55%), radial-gradient(850px 520px at 82% 78%, rgba(236,72,153,0.2), transparent 52%), linear-gradient(180deg, #070b1a 0%, #040711 100%)',
  editing: 'radial-gradient(1200px 650px at 22% 18%, rgba(251,191,36,0.2), transparent 55%), radial-gradient(850px 520px at 84% 82%, rgba(99,102,241,0.22), transparent 52%), linear-gradient(180deg, #0b0c17 0%, #060712 100%)',
  music: 'radial-gradient(1200px 650px at 18% 12%, rgba(139,92,246,0.24), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(20,184,166,0.2), transparent 52%), linear-gradient(180deg, #070616 0%, #04030e 100%)',
  photo: 'radial-gradient(1200px 650px at 18% 12%, rgba(34,211,238,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(251,113,133,0.2), transparent 52%), linear-gradient(180deg, #060913 0%, #04060f 100%)',
  image: 'radial-gradient(1200px 650px at 18% 12%, rgba(99,102,241,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(244,63,94,0.22), transparent 52%), linear-gradient(180deg, #060813 0%, #04060e 100%)',
  media: 'radial-gradient(1200px 650px at 18% 12%, rgba(132,204,22,0.22), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(6,182,212,0.2), transparent 52%), linear-gradient(180deg, #050b13 0%, #03060d 100%)',
  text: 'radial-gradient(1200px 650px at 18% 12%, rgba(96,165,250,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(167,139,250,0.2), transparent 52%), linear-gradient(180deg, #080c17 0%, #05070f 100%)',
  prompt: 'radial-gradient(1200px 650px at 18% 12%, rgba(14,165,233,0.22), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(217,70,239,0.2), transparent 52%), linear-gradient(180deg, #060a14 0%, #04060f 100%)',
  'visual-intel': 'radial-gradient(1200px 650px at 18% 12%, rgba(168,85,247,0.22), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(16,185,129,0.2), transparent 52%), linear-gradient(180deg, #060913 0%, #04060f 100%)',
  workflow: 'radial-gradient(1200px 650px at 18% 12%, rgba(234,179,8,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(6,182,212,0.2), transparent 52%), linear-gradient(180deg, #090b14 0%, #05070f 100%)',
  shop: 'radial-gradient(1200px 650px at 18% 12%, rgba(244,63,94,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(14,165,233,0.2), transparent 52%), linear-gradient(180deg, #0a0814 0%, #06050f 100%)',
  software: 'radial-gradient(1200px 650px at 18% 12%, rgba(249,115,22,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(59,130,246,0.2), transparent 52%), linear-gradient(180deg, #090914 0%, #06070f 100%)',
  business: 'radial-gradient(1200px 650px at 18% 12%, rgba(20,184,166,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(96,165,250,0.2), transparent 52%), linear-gradient(180deg, #070b13 0%, #04060f 100%)',
  tourism: 'radial-gradient(1200px 650px at 18% 12%, rgba(16,185,129,0.2), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(56,189,248,0.2), transparent 52%), linear-gradient(180deg, #060a13 0%, #04060f 100%)',
  'agent-g': 'radial-gradient(1200px 650px at 18% 12%, rgba(6,182,212,0.25), transparent 55%), radial-gradient(850px 520px at 85% 85%, rgba(99,102,241,0.22), transparent 52%), linear-gradient(180deg, #050914 0%, #03060e 100%)',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function UnifiedServiceLayout({
  serviceId,
  serviceName,
  serviceIcon,
  agentId,
  locale,
  features,
  description,
  onAuthRequired,
  isAuthenticated = false,
  demoMode = false,
}: UnifiedServiceLayoutProps) {
  const t = T[(locale as LocaleCode)] ?? T['en']!;
  const quickActions = QUICK_ACTIONS[serviceId] ?? QUICK_ACTIONS['agent-g']!;

  // ─── State ───────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewArtifact, setPreviewArtifact] = useState<Artifact | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const serviceContext = SERVICE_CONTEXT[serviceId] ?? 'global';
  const serviceBackground = SERVICE_BACKGROUNDS[serviceId] ?? SERVICE_BACKGROUNDS['agent-g']!;
  const agentButtonLabel = `${t.useAgent} — ${serviceName}`;

  // ─── Auto-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  // ─── Send message ────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;

    if (!demoMode && !isAuthenticated) {
      setShowLoginModal(true);
      onAuthRequired?.();
      return;
    }

    setInput('');
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setSending(true);

    try {
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-8)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          agentId,
          language: locale,
          context: serviceContext,
          history,
          metadata: {
            serviceId,
            demoMode,
            agentEnabled: true,
          },
        }),
      });

      const data = await res.json() as {
        data?: { response?: string; artifacts?: Artifact[] };
        response?: string;
        artifacts?: Artifact[];
        error?: string;
      };

      if (!res.ok) throw new Error(data.error ?? 'Failed');

      const reply = data.data?.response ?? data.response ?? 'Processing...';
      const artifacts = data.data?.artifacts ?? data.artifacts;

      const loweredReply = reply.toLowerCase();
      if (loweredReply.includes('throttled') || loweredReply.includes('rate limit') || loweredReply.includes('quota')) {
        const retryAfterSeconds = extractRetryAfterSeconds(reply);
        const suffix = retryAfterSeconds ? ` ${retryAfterSeconds} ${t.seconds}.` : '.';
        setRateLimitNotice(`${t.retryNotice}${suffix}`);
      } else {
        setRateLimitNotice(null);
      }

      const assistantMessage: Message = {
        id: `msg_${Date.now()}_reply`,
        role: 'assistant',
        content: reply,
        artifacts,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Auto-preview first artifact
      if (artifacts?.length) {
        setPreviewArtifact(artifacts[0]!);
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Unknown error';
      const loweredError = errorText.toLowerCase();
      if (loweredError.includes('throttled') || loweredError.includes('rate limit') || loweredError.includes('quota')) {
        const retryAfterSeconds = extractRetryAfterSeconds(errorText);
        const suffix = retryAfterSeconds ? ` ${retryAfterSeconds} ${t.seconds}.` : '.';
        setRateLimitNotice(`${t.retryNotice}${suffix}`);
      }

      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: `Error: ${errorText}`,
        timestamp: new Date(),
      }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, demoMode, isAuthenticated, agentId, locale, serviceId, serviceContext, messages, onAuthRequired, t.retryNotice, t.seconds]);

  // ─── File upload ─────────────────────────────────────────────────────────
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const names = Array.from(files).map(f => f.name).join(', ');
    setInput(prev => `${prev} [Files: ${names}]`);
  };

  // ─── Drag & Drop ────────────────────────────────────────────────────────
  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length) {
      const names = Array.from(files).map(f => f.name).join(', ');
      setInput(prev => `${prev} [Dropped: ${names}]`);
    }
  };

  // ─── Voice recording (STT UI) ───────────────────────────────────────────
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (chunks.length) {
          setInput(prev => `${prev} [Voice message recorded]`);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      // Microphone not available
    }
  };

  const toggleCamera = async () => {
    if (cameraOn) {
      cameraStreamRef.current?.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
      setCameraOn(false);
      return;
    }

    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
      }
      setCameraOn(true);
    } catch {
      setCameraError(locale === 'ka'
        ? 'კამერაზე წვდომა ვერ მოხერხდა.'
        : locale === 'ru'
          ? 'Не удалось получить доступ к камере.'
          : 'Unable to access camera.');
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-transparent text-white">
      <div className="pointer-events-none absolute inset-0 opacity-95" style={{ backgroundImage: serviceBackground }} />
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 border-b border-white/[0.06] px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{serviceIcon}</span>
            <div>
              <h1 className="text-lg font-bold">{serviceName}</h1>
              <p className="text-xs text-white/40">{t.powered}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {demoMode && (
              <span className="px-2.5 py-1 text-[10px] uppercase tracking-wider rounded-full border border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
                Demo Mode
              </span>
            )}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3 py-1.5 text-xs border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
            >
              {t.history}
            </button>
            <button
              onClick={() => setShowExport(!showExport)}
              className="px-3 py-1.5 text-xs border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
            >
              {t.export}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Layout: Chat (70%) + Preview (30%) ─────────────────────── */}
      <div className="relative z-10 max-w-7xl mx-auto flex flex-col lg:flex-row min-h-[calc(100vh-64px)]">

        {/* ── Chat Window (70%) ─────────────────────────────────────────── */}
        <div
          className="flex-1 lg:w-[70%] flex flex-col border-r border-white/[0.06]"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-cyan-500/10 border-2 border-dashed border-cyan-500/50 rounded-xl flex items-center justify-center">
              <p className="text-cyan-300 font-semibold">{t.dragDrop}</p>
            </div>
          )}

          {/* Quick Action Chips */}
          <div className="px-4 py-3 border-b border-white/[0.04] flex gap-2 overflow-x-auto scrollbar-hide">
            {quickActions.map(action => (
              <button
                key={action}
                onClick={() => sendMessage(action)}
                className="flex-shrink-0 px-3 py-1.5 text-xs bg-white/[0.04] border border-white/[0.08] rounded-full hover:bg-white/[0.08] hover:border-cyan-500/30 transition-all whitespace-nowrap"
              >
                {action}
              </button>
            ))}
          </div>

          {/* Message list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full space-y-4 text-center py-20">
                <span className="text-5xl">{serviceIcon}</span>
                <h2 className="text-xl font-bold">{serviceName}</h2>
                <p className="text-sm text-white/40 max-w-md">{description}</p>

                {/* Features grid */}
                <div className="grid grid-cols-2 gap-2 mt-4 max-w-lg">
                  {features.map(f => (
                    <div key={f} className="text-xs text-white/30 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 flex items-center gap-2">
                      <span className="text-white/20">✦</span> {f}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 text-white'
                      : 'bg-white/[0.04] border border-white/[0.08] text-white/80'
                  }`}>
                    {msg.content}
                  </div>

                  {/* Artifact preview cards */}
                  {msg.artifacts?.map((art, i) => (
                    <button
                      key={i}
                      onClick={() => setPreviewArtifact(art)}
                      className="block w-full text-left bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 hover:border-cyan-500/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs">
                          {art.type === 'image' ? '🖼️' : art.type === 'video' ? '🎬' : art.type === 'audio' ? '🎵' : '📄'}
                        </span>
                        <span className="text-xs text-white/60">{art.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Generating indicator */}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 text-sm text-white/40 flex items-center gap-2">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                  {t.generating}
                </div>
              </div>
            )}
          </div>

          {/* ── Sticky Action Bar ───────────────────────────────────────── */}
          <div className="border-t border-white/[0.06] p-4 space-y-3">
            {rateLimitNotice && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-2">
                <p className="text-xs text-amber-100">{rateLimitNotice}</p>
                <button
                  onClick={() => setRateLimitNotice(null)}
                  className="text-[11px] text-amber-100/80 hover:text-amber-50"
                >
                  {t.dismiss}
                </button>
              </div>
            )}

            {/* Automation toggle */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAutomation}
                  onChange={() => setShowAutomation(!showAutomation)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-white/10 rounded-full peer-checked:bg-cyan-500/50 transition-colors relative">
                  <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                </div>
                <span className="text-xs text-white/40">{t.automation}</span>
              </label>

              <button
                onClick={toggleCamera}
                className={`px-3 py-1.5 text-xs border rounded-lg transition-colors ${
                  cameraOn
                    ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                    : 'border-white/10 text-white/60 hover:bg-white/5'
                }`}
              >
                {cameraOn ? t.closeCamera : t.camera}
              </button>

              <button
                onClick={() => {
                  if (!demoMode && !isAuthenticated) {
                    setShowLoginModal(true);
                    onAuthRequired?.();
                    return;
                  }
                  if (!input.trim()) {
                    const defaultPrompt = locale === 'ka'
                      ? `${serviceName} - დავალება: შექმენი შედეგი ნაბიჯ-ნაბიჯ.`
                      : locale === 'ru'
                        ? `${serviceName} — задача: создай результат пошагово.`
                        : `${serviceName} task: create output step by step.`;
                    setInput(defaultPrompt);
                  }
                  promptInputRef.current?.focus();
                }}
                className="px-3 py-1.5 text-xs border border-cyan-400/40 bg-cyan-500/10 rounded-lg hover:bg-cyan-500/20 transition-colors"
              >
                {agentButtonLabel}
              </button>
            </div>

            {(cameraOn || cameraError) && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2">
                {cameraOn ? (
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full max-h-44 rounded-lg object-cover border border-white/[0.08]"
                  />
                ) : null}
                {cameraError ? <p className="text-xs text-red-300 mt-1">{cameraError}</p> : null}
              </div>
            )}

            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-[11px] text-white/35 uppercase tracking-wider pr-1">{t.support}</span>
              <a
                href="https://wa.me/995000000000"
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 text-xs rounded-full border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.08]"
              >
                {t.whatsapp}
              </a>
              <a
                href="https://t.me/myavatar_ge"
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 text-xs rounded-full border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.08]"
              >
                {t.telegram}
              </a>
              <a
                href="tel:+995000000000"
                className="px-2.5 py-1 text-xs rounded-full border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.08]"
              >
                {t.phone}
              </a>
            </div>

            {/* Input row */}
            <div className="flex gap-2 items-end">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                multiple
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 p-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl hover:bg-white/[0.08] transition-colors"
                title={t.upload}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </button>

              <button
                onClick={toggleRecording}
                className={`flex-shrink-0 p-2.5 border rounded-xl transition-colors ${
                  isRecording
                    ? 'bg-red-500/20 border-red-500/50 text-red-400'
                    : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08] text-white/40'
                }`}
                title={isRecording ? t.stopRecord : t.record}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              </button>

              <div className="flex-1 relative">
                <textarea
                  ref={promptInputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={t.placeholder}
                  rows={1}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/40 resize-none"
                />
              </div>

              <button
                onClick={() => sendMessage()}
                disabled={sending || !input.trim()}
                className="flex-shrink-0 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t.send}
              </button>
            </div>
          </div>
        </div>

        {/* ── Preview/Tools Panel (30%) ─────────────────────────────────── */}
        <div className="lg:w-[30%] border-t lg:border-t-0 border-white/[0.06] flex flex-col">
          {/* Panel header */}
          <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">{t.preview}</span>
            <span className="text-xs text-white/20">{t.tools}</span>
          </div>

          {/* Preview content */}
          <div className="flex-1 p-4 flex items-center justify-center">
            {previewArtifact ? (
              <div className="w-full space-y-4">
                {previewArtifact.type === 'image' && previewArtifact.url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previewArtifact.url} alt={previewArtifact.label} className="w-full rounded-xl border border-white/[0.08]" />
                )}
                {previewArtifact.type === 'video' && previewArtifact.url && (
                  <video src={previewArtifact.url} controls className="w-full rounded-xl border border-white/[0.08]" />
                )}
                {previewArtifact.type === 'audio' && previewArtifact.url && (
                  <audio src={previewArtifact.url} controls className="w-full" />
                )}
                {previewArtifact.type === 'text' && (
                  <pre className="text-xs text-white/60 whitespace-pre-wrap bg-white/[0.02] p-4 rounded-xl border border-white/[0.06]">
                    {previewArtifact.content ?? ''}
                  </pre>
                )}
                <p className="text-xs text-white/30 text-center">{previewArtifact.label}</p>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="w-16 h-16 mx-auto bg-white/[0.03] border border-white/[0.06] rounded-2xl flex items-center justify-center">
                  <span className="text-2xl opacity-20">{serviceIcon}</span>
                </div>
                <p className="text-xs text-white/20">{t.noPreview}</p>
              </div>
            )}
          </div>

          {/* Export menu */}
          {showExport && (
            <div className="border-t border-white/[0.04] p-4 space-y-2">
              {['PNG', 'MP4', 'MP3', 'JSON', 'PDF'].map(fmt => (
                <button
                  key={fmt}
                  className="w-full text-left px-3 py-2 text-xs bg-white/[0.03] border border-white/[0.06] rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  Export as {fmt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Login Modal (NOT redirect) ──────────────────────────────────── */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowLoginModal(false)}>
          <div className="bg-[#0a0a1a] border border-white/[0.1] rounded-2xl p-8 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white">{t.loginRequired}</h2>
            <p className="text-sm text-white/40">
              {locale === 'ka' ? 'სერვისის გამოსაყენებლად გთხოვთ შეხვიდეთ ანგარიშში.' :
               locale === 'ru' ? 'Для использования сервиса войдите в аккаунт.' :
               'Please log in to use this service.'}
            </p>
            <div className="flex gap-3">
              <a
                href={`/${locale}/login?redirect=/${locale}/services/${serviceId}`}
                className="flex-1 text-center px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
              >
                {t.login}
              </a>
              <button
                onClick={() => setShowLoginModal(false)}
                className="px-4 py-2.5 border border-white/10 rounded-xl text-white/60 hover:bg-white/5 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
