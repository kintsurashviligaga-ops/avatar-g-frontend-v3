'use client';

/**
 * MyAvatarChat — the single Grok-style chat surface for myavatar.ge.
 *
 * Architecture (matches the user's "Unified One-Window Architecture"
 * diagram):
 *
 *     User
 *       ↓
 *     Agent G (Gemini orchestrator)
 *       ↓
 *     ┌───────┬────────┬────────┬─────────┐
 *     Chat     Avatar    Music    Voice
 *     Image    Video     Interior App Builder
 *       ↓
 *     Inline Media Player (InlineMedia)
 *
 * Single window — never redirects. The left drawer toggles `activeView`
 * to switch between Chat / Avatars / Voice Lab / Memory / Analytics /
 * Billing in place with fade transitions. The right top-bar button is
 * for system status / credits / sign-out only (no navigation).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Menu,
  User as UserIcon,
  Paperclip,
  Mic,
  Zap,
  Send,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
  Volume2,
  Code as CodeIcon,
  Sofa as SofaIcon,
  Sparkles,
  Loader2,
  X,
  Home as HomeIcon,
  Mic2,
  Brain,
  BarChart3,
  CreditCard,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Scissors,
  LogOut,
} from 'lucide-react';
import InlineMedia, { detectInlineMedia } from '@/components/dashboard/command-center/InlineMedia';
import VoiceLab from '@/components/voice/VoiceLab';
import MemoryPanel from '@/components/memory/MemoryPanel';
import { BarChart, KpiTile, LineChart, TopicList } from '@/components/analytics/AnalyticsCharts';
import { createBrowserClient } from '@/lib/supabase/browser';

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceId =
  | 'chat'
  | 'avatar'
  | 'image'
  | 'video'
  | 'music'
  | 'voice'
  | 'interior'
  | 'app';

type Mode = 'ask' | 'imagine';

type ViewId = 'chat' | 'avatar' | 'voice' | 'memory' | 'analytics' | 'billing';

interface MediaPayload {
  kind: 'image' | 'video' | 'audio' | 'code';
  url?: string;
  html?: string;
  language?: string;
  poster?: string;        // Optional thumbnail/poster for video — used by VideoBlock
                          // to render a clear preview frame BEFORE the video reaches
                          // canplay (avoids the "invisible black frame" bug where
                          // HeyGen videos load silently with a pitch-black first frame
                          // on a pitch-black background).
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
  service?: ServiceId;
  media?: MediaPayload;
  ts: number;
  liked?: boolean;
  disliked?: boolean;
}

interface MyAvatarChatProps {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
}

// ─── Service labels (used by Pills + intent labels) ───────────────────────────

const SERVICE_LABELS_KA: Record<ServiceId, string> = {
  chat: 'ჩატი',
  avatar: 'ავატარი',
  image: 'სურათი',
  video: 'ვიდეო',
  music: 'მუსიკა',
  voice: 'ხმა',
  interior: 'ინტერიერი',
  app: 'აპლიკაცია',
};

const SERVICE_LABELS_EN: Record<ServiceId, string> = {
  chat: 'Chat',
  avatar: 'Avatar',
  image: 'Image',
  video: 'Video',
  music: 'Music',
  voice: 'Voice',
  interior: 'Interior',
  app: 'App',
};

export function serviceLabel(s: ServiceId, locale: string) {
  return locale === 'ka' ? SERVICE_LABELS_KA[s] : SERVICE_LABELS_EN[s];
}

// ─── Agent G intent router ────────────────────────────────────────────────────

function detectIntent(text: string, mode: Mode): ServiceId {
  // "Imagine" mode is biased toward generation. Default to image, but
  // honor explicit hints for video / music / avatar.
  if (mode === 'imagine') {
    if (/\b(video|ვიდეო|видео|movie|clip)\b/i.test(text)) return 'video';
    if (/\b(music|song|track|მუსიკ|музык|სიმღერა|песн)\b/i.test(text)) return 'music';
    if (/\b(avatar|talking|ავატარ|аватар)\b/i.test(text)) return 'avatar';
    return 'image';
  }
  // "Ask" mode — broader keyword match so phrases like "an image of waves"
  // or "show me a video" trigger the right specialist without the user
  // needing to use the exact verb phrasing.
  if (/\b(draw|paint|render|image|picture|photo|სურათ|ფოტო|დახატე|нарисуй|изобрази|фото|картинк)\b/i.test(text)) return 'image';
  if (/\b(video|clip|animate|movie|ვიდეო|видео|анимаци)\b/i.test(text)) return 'video';
  if (/\b(music|song|track|tune|compose|მუსიკ|სიმღერა|музык|песн)\b/i.test(text)) return 'music';
  if (/\b(avatar|talking head|spokesperson|ავატარ|аватар)\b/i.test(text)) return 'avatar';
  if (/\b(speak|read aloud|say this|voice|text to speech|tts|წაიკითხე|ხმოვა|ხმა გააკეთე|прочитай|озвучь)\b/i.test(text)) return 'voice';
  if (/\b(interior|room|bedroom|living room|kitchen|design my room|ინტერიერ|ოთახ|интерьер|комнат|дизайн комнаты)\b/i.test(text)) return 'interior';
  if (/\b(app|application|website|landing page|html|webapp|build me a|build me an|აპლიკაცი|ვებგვერდ|ვებსაიტ|приложение|сайт|лендинг)\b/i.test(text)) return 'app';
  return 'chat';
}

function mkId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Pills above input ────────────────────────────────────────────────────────

interface PillSpec {
  id: ServiceId;
  icon: typeof ImageIcon;
  label_ka: string;
  label_en: string;
  prompt_ka: string;
}

const PILLS: PillSpec[] = [
  { id: 'image',    icon: ImageIcon, label_ka: 'სურათი',    label_en: 'Image',    prompt_ka: 'ლამაზი მთის პეიზაჟი მზის ჩასვლისას, კინემატოგრაფიული' },
  { id: 'video',    icon: VideoIcon, label_ka: 'ვიდეო',     label_en: 'Video',    prompt_ka: 'ცინემატური ხედი ზღვის ნაპირზე მზის ჩასვლისას' },
  { id: 'music',    icon: MusicIcon, label_ka: 'მუსიკა',    label_en: 'Music',    prompt_ka: 'ჯაზური ფონური მუსიკა, თბილისური მოტივებით' },
  { id: 'voice',    icon: Volume2,   label_ka: 'ხმა',       label_en: 'Voice',    prompt_ka: 'გამარჯობა, ეს არის MyAvatar.ge ხმოვანი ნიმუში' },
  { id: 'avatar',   icon: UserIcon,  label_ka: 'ავატარი',   label_en: 'Avatar',   prompt_ka: 'გამარჯობა, მე ვარ შენი ციფრული ავატარი' },
  { id: 'interior', icon: SofaIcon,  label_ka: 'ინტერიერი', label_en: 'Interior', prompt_ka: 'მოდერნი სკანდინავიური მისაღები ოთახი, ბუნებრივი განათებით' },
  { id: 'app',      icon: CodeIcon,  label_ka: 'აპლიკაცია', label_en: 'App',      prompt_ka: 'ლანდინგ გვერდი ფერადი ღილაკით რომელიც დაჭერისას ცვლის ფერს' },
];

// ─── Drawer items (matches the user's exact list) ────────────────────────────

const VIEW_ITEMS: Array<{
  id: ViewId;
  icon: typeof HomeIcon;
  label_ka: string;
  label_en: string;
}> = [
  { id: 'chat',      icon: HomeIcon,    label_ka: 'მთავარი',              label_en: 'Home' },
  { id: 'avatar',    icon: UserIcon,    label_ka: 'ჩემი ავატარი',         label_en: 'My Avatar' },
  { id: 'voice',     icon: Mic2,        label_ka: 'ხმის ლაბორატორია',     label_en: 'Voice Lab' },
  { id: 'memory',    icon: Brain,       label_ka: 'მეხსიერება',           label_en: 'Memory' },
  { id: 'analytics', icon: BarChart3,   label_ka: 'ანალიტიკა',            label_en: 'Analytics' },
  { id: 'billing',   icon: CreditCard,  label_ka: 'ფასები & სეთინგი',     label_en: 'Pricing & Settings' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function MyAvatarChat({ locale, userName, isAuthenticated }: MyAvatarChatProps) {
  const localeCode = (locale === 'ka' || locale === 'en' || locale === 'ru') ? locale : 'ka';
  const [activeView, setActiveView] = useState<ViewId>('chat');
  const [mode, setMode] = useState<Mode>('ask');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);

  const switchView = useCallback((id: ViewId) => {
    setActiveView(id);
    setDrawerOpen(false);
  }, []);

  // ── Send / regenerate ─────────────────────────────────────────────────────
  const send = useCallback(async (text: string, forceService?: ServiceId, replacePendingId?: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const service = forceService ?? detectIntent(trimmed, mode);
    const pendingId = replacePendingId ?? mkId();

    if (replacePendingId) {
      setMessages(m => m.map(x => x.id === replacePendingId
        ? { ...x, pending: true, text: pendingTextFor(service, localeCode), service, media: undefined, liked: false, disliked: false }
        : x,
      ));
    } else {
      const userMsg: ChatMessage = { id: mkId(), role: 'user', text: trimmed, ts: Date.now() };
      const pendingMsg: ChatMessage = {
        id: pendingId,
        role: 'assistant',
        text: pendingTextFor(service, localeCode),
        pending: true,
        service,
        ts: Date.now() + 1,
      };
      setMessages(m => [...m, userMsg, pendingMsg]);
      setInput('');
    }
    setSending(true);

    try {
      if (service === 'chat')         await runChat(trimmed, messages, pendingId, setMessages);
      else if (service === 'image')   await runImage(trimmed, pendingId, setMessages);
      else if (service === 'video')   await runVideo(trimmed, pendingId, setMessages);
      else if (service === 'music')   await runMusic(trimmed, pendingId, setMessages);
      else if (service === 'voice')   await runVoice(trimmed, pendingId, setMessages);
      else if (service === 'avatar')  await runAvatar(trimmed, pendingId, setMessages);
      else if (service === 'interior') await runInterior(trimmed, pendingId, setMessages);
      else if (service === 'app')     await runApp(trimmed, pendingId, setMessages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'შეცდომა';
      setMessages(m => m.map(x => x.id === pendingId ? { ...x, pending: false, text: `⚠️ ${msg}` } : x));
    } finally {
      setSending(false);
    }
  }, [mode, sending, messages, localeCode]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const handlePill = (p: PillSpec) => {
    if (activeView !== 'chat') setActiveView('chat');
    const text = localeCode === 'ka' ? p.prompt_ka : `Create a ${p.label_en.toLowerCase()}: ${p.prompt_ka}`;
    void send(text, p.id);
  };

  // ── Per-message actions (Like/Dislike/Copy/Regenerate/Speaker) ────────────
  const onLike = useCallback((id: string) => {
    setMessages(m => m.map(x => x.id === id ? { ...x, liked: !x.liked, disliked: false } : x));
  }, []);
  const onDislike = useCallback((id: string) => {
    setMessages(m => m.map(x => x.id === id ? { ...x, disliked: !x.disliked, liked: false } : x));
  }, []);
  const onCopy = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  }, []);
  const onSpeak = useCallback(async (text: string) => {
    try {
      const res = await fetch('/api/elevenlabs/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 500), locale: localeCode }),
      });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      new Audio(url).play().catch(() => undefined);
    } catch { /* ignore */ }
  }, [localeCode]);
  const onRegenerate = useCallback((id: string) => {
    // Find the user message preceding this assistant message
    const idx = messages.findIndex(m => m.id === id);
    if (idx < 1) return;
    const userMsg = messages[idx - 1];
    if (!userMsg || userMsg.role !== 'user') return;
    void send(userMsg.text, messages[idx]?.service, id);
  }, [messages, send]);
  const onRemix = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <main
      className="fixed inset-0 flex flex-col bg-black text-white antialiased"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', fontFamily: 'var(--font-geist, var(--font-ui, system-ui))' }}
    >
      {/* Pure pitch black — no background visuals per user spec */}

      {/* ── TopBar ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
        <button
          type="button"
          aria-label="Menu"
          onClick={() => setDrawerOpen(true)}
          className="h-10 w-10 rounded-full bg-white/[0.05] hover:bg-white/[0.12] flex items-center justify-center transition"
        >
          <Menu size={18} className="text-white" />
        </button>

        {activeView === 'chat' ? (
          <div className="flex items-center gap-1 bg-white/[0.05] rounded-full p-1">
            <button
              type="button"
              onClick={() => setMode('ask')}
              className={`px-4 py-1.5 rounded-full text-[14px] font-semibold transition ${
                mode === 'ask' ? 'bg-white/15 text-white' : 'text-white/55'
              }`}
            >
              {localeCode === 'ka' ? 'კითხვა' : 'Ask'}
            </button>
            <button
              type="button"
              onClick={() => setMode('imagine')}
              className={`px-4 py-1.5 rounded-full text-[14px] font-semibold transition ${
                mode === 'imagine' ? 'bg-white/15 text-white' : 'text-white/55'
              }`}
            >
              {localeCode === 'ka' ? 'შექმნა' : 'Imagine'}
            </button>
          </div>
        ) : (
          <h1 className="text-[15px] font-semibold text-white">
            {VIEW_ITEMS.find(v => v.id === activeView)?.[localeCode === 'ka' ? 'label_ka' : 'label_en']}
          </h1>
        )}

        <button
          type="button"
          aria-label="System status"
          onClick={() => setProfileOpen(true)}
          className="h-10 w-10 rounded-full bg-white/[0.05] hover:bg-white/[0.12] flex items-center justify-center transition relative"
        >
          <UserIcon size={18} className="text-white" />
        </button>
      </header>

      {/* ── Body with view switcher (AnimatePresence fade) ──────────────── */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col">
        <AnimatePresence mode="wait">
          {activeView === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex-1 min-h-0 overflow-y-auto px-4"
            >
              {!hasMessages ? (
                <EmptyState />
              ) : (
                <div className="max-w-2xl mx-auto py-4 space-y-3">
                  {messages.map(m => (
                    <MessageRow
                      key={m.id}
                      m={m}
                      locale={localeCode}
                      onLike={() => onLike(m.id)}
                      onDislike={() => onDislike(m.id)}
                      onCopy={() => onCopy(m.text)}
                      onRegenerate={() => onRegenerate(m.id)}
                      onSpeak={() => onSpeak(m.text)}
                      onRemix={onRemix}
                    />
                  ))}
                  <div ref={endRef} />
                </div>
              )}
            </motion.div>
          )}
          {activeView === 'avatar' && (
            <motion.div key="avatar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
              className="flex-1 overflow-y-auto px-4 py-4">
              <AvatarGalleryView locale={localeCode} onBackToChat={() => switchView('chat')} />
            </motion.div>
          )}
          {activeView === 'voice' && (
            <motion.div key="voice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
              className="flex-1 overflow-y-auto">
              <VoiceLab />
            </motion.div>
          )}
          {activeView === 'memory' && (
            <motion.div key="memory" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
              className="flex-1 overflow-y-auto px-4 py-4">
              <MemoryPanel />
            </motion.div>
          )}
          {activeView === 'analytics' && (
            <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
              className="flex-1 overflow-y-auto px-4 py-4">
              <AnalyticsView locale={localeCode} />
            </motion.div>
          )}
          {activeView === 'billing' && (
            <motion.div key="billing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
              className="flex-1 overflow-y-auto px-4 py-4">
              <BillingView locale={localeCode} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom input — only on chat view ────────────────────────────── */}
      {activeView === 'chat' && (
        <div className="relative z-10 flex-shrink-0 px-3 pb-3 pt-2 bg-gradient-to-t from-black via-black/95 to-transparent">
          <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PILLS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePill(p)}
                disabled={sending}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-50 transition text-[13px] font-medium text-white"
              >
                <p.icon size={14} className="text-white/85" />
                {localeCode === 'ka' ? p.label_ka : p.label_en}
              </button>
            ))}
          </div>

          <div className="rounded-3xl bg-white/[0.06] border border-white/[0.08] overflow-hidden focus-within:border-white/[0.18] transition">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder={localeCode === 'ka' ? 'მკითხე ნებისმიერი' : 'Ask Anything'}
              aria-label={localeCode === 'ka' ? 'მკითხე ნებისმიერი' : 'Ask Anything'}
              className="w-full bg-transparent border-none outline-none resize-none px-4 pt-3 pb-1 text-[15px] text-white placeholder:text-[#94A3B8]"
              style={{ minHeight: 24, maxHeight: 140 }}
            />
            <div className="flex items-center justify-between px-2 py-1.5">
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Attach" className="h-9 w-9 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-[#94A3B8] transition">
                  <Paperclip size={16} />
                </button>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] text-white/85 text-[12px] font-medium">
                  <Zap size={12} className="text-yellow-300" />
                  {localeCode === 'ka' ? 'სწრაფი' : 'Fast'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Voice" className="h-9 w-9 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-[#94A3B8] transition">
                  <Mic size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={!input.trim() || sending}
                  className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-full font-semibold text-[13px] transition ${
                    input.trim() && !sending
                      ? 'bg-white text-black hover:bg-white/90'
                      : 'bg-white/[0.08] text-white/40 cursor-not-allowed'
                  }`}
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {localeCode === 'ka' ? 'გაგზავნა' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Left drawer — VIEW SWITCHER (in-place, never redirects) ─────── */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.button
            key="drawer-bg"
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          />
        )}
        {drawerOpen && (
          <motion.aside
            key="drawer-panel"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
            className="fixed top-0 bottom-0 left-0 z-50 w-[280px] bg-black border-r border-white/[0.08]"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06]">
                <span className="text-[15px] font-semibold text-white">MyAvatar</span>
                <button type="button" aria-label="Close" onClick={() => setDrawerOpen(false)}
                  className="h-8 w-8 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-[#94A3B8]">
                  <X size={16} />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto py-2">
                {VIEW_ITEMS.map(item => {
                  const active = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => switchView(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                        active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <item.icon size={16} className={active ? 'text-white' : 'text-[#94A3B8]'} />
                      <span className={`text-[14px] flex-1 ${active ? 'text-white font-semibold' : 'text-white/85'}`}>
                        {localeCode === 'ka' ? item.label_ka : item.label_en}
                      </span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </button>
                  );
                })}
              </nav>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Right drawer — SYSTEM STATUS (status/credits/sign-out only) ── */}
      <AnimatePresence>
        {profileOpen && (
          <motion.button
            key="profile-bg"
            type="button"
            aria-label="Close"
            onClick={() => setProfileOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          />
        )}
        {profileOpen && (
          <motion.aside
            key="profile-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
            className="fixed top-0 bottom-0 right-0 z-50 w-[300px] bg-black border-l border-white/[0.08]"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <SystemStatusDrawer
              locale={localeCode}
              userName={userName}
              isAuthenticated={isAuthenticated}
              onClose={() => setProfileOpen(false)}
            />
          </motion.aside>
        )}
      </AnimatePresence>
    </main>
  );
}

// ─── EmptyState (faded center glyph) ─────────────────────────────────────────

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center pointer-events-none">
      <div className="relative">
        <div
          className="w-32 h-32 rounded-full opacity-25"
          style={{
            background: 'radial-gradient(circle at 50% 40%, rgba(167,139,250,0.7) 0%, rgba(167,139,250,0.05) 55%, transparent 75%)',
            filter: 'blur(4px)',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/30">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" />
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── MessageRow ──────────────────────────────────────────────────────────────

interface MessageRowProps {
  m: ChatMessage;
  locale: string;
  onLike: () => void;
  onDislike: () => void;
  onCopy: () => void;
  onRegenerate: () => void;
  onSpeak: () => void;
  onRemix: (prompt: string) => void;
}

function MessageRow({ m, locale: _locale, onLike, onDislike, onCopy, onRegenerate, onSpeak, onRemix }: MessageRowProps) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] px-4 py-2.5 rounded-2xl bg-white/10 text-white text-[15px] leading-relaxed">
          {m.text}
        </div>
      </div>
    );
  }

  const detected = !m.media && !m.pending ? detectInlineMedia(m.text) : null;
  // After we hoist the URL into an InlineMedia block, scrub leftover markdown
  // wrappers ("[label]()", "(  )", trailing colons) so the user-visible text
  // doesn't show "Here's your image:" with a dangling empty bracket.
  const text = detected
    ? m.text
        .replace(detected.url, '')
        .replace(/\[([^\]]*)\]\(\s*\)/g, '$1')   // "[image]()" → "image"
        .replace(/\(\s*\)/g, '')                  // empty "(  )"
        .replace(/!\[([^\]]*)\]/g, '$1')          // "![alt]" → "alt"
        .replace(/\s+:\s*$/m, '')                 // trailing ":"
        .replace(/\s{2,}/g, ' ')                  // collapse spaces
        .trim()
    : m.text;
  const hasMedia = !!m.media || !!detected;

  return (
    <div className="flex flex-col items-start gap-2">
      {m.pending ? (
        <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white/80 text-[14px]">
          <Loader2 size={14} className="animate-spin text-violet-300" />
          {m.text}
        </div>
      ) : (
        <>
          {text && (
            <div className="max-w-[88%] px-1 text-white text-[15px] leading-relaxed whitespace-pre-wrap break-words">
              {text}
            </div>
          )}
          {(m.media || detected) && (
            <div className="ml-1 relative group">
              {m.media?.kind === 'code' && m.media.html ? (
                <InlineMedia kind="code" html={m.media.html} language={m.media.language} prompt="" onRemix={onRemix} />
              ) : m.media?.url ? (
                <InlineMedia
                  kind={m.media.kind as 'image' | 'video' | 'audio'}
                  url={m.media.url}
                  poster={m.media.poster}
                  prompt={m.text}
                  onRemix={onRemix}
                />
              ) : detected ? (
                <InlineMedia kind={detected.kind} url={detected.url} prompt={text} onRemix={onRemix} />
              ) : null}
            </div>
          )}

          {/* Action row — anchored under the media (or under the text if none) */}
          <div className="flex items-center gap-0.5 -mt-0.5 opacity-60 hover:opacity-100 transition">
            <ActionIcon title="Copy" onClick={onCopy}><Copy size={13} /></ActionIcon>
            <ActionIcon title="Regenerate" onClick={onRegenerate}><RotateCcw size={13} /></ActionIcon>
            <ActionIcon title="Speak" onClick={onSpeak}><Volume2 size={13} /></ActionIcon>
            <ActionIcon title="Like" onClick={onLike} active={m.liked}><ThumbsUp size={13} /></ActionIcon>
            <ActionIcon title="Dislike" onClick={onDislike} active={m.disliked}><ThumbsDown size={13} /></ActionIcon>
            {hasMedia && (m.media?.kind === 'video' || m.media?.kind === 'audio') && (
              <ActionIcon title="CapCut / Edit" onClick={() => undefined /* InlineMedia hosts the real CapCut */ }>
                <Scissors size={13} />
              </ActionIcon>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ActionIcon({ children, title, onClick, active }: { children: React.ReactNode; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-7 w-7 rounded-full flex items-center justify-center transition ${
        active ? 'text-violet-300 bg-violet-500/15' : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.08]'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Embedded views (in-place, no redirects) ─────────────────────────────────

function AvatarGalleryView({ locale, onBackToChat }: { locale: string; onBackToChat: () => void }) {
  const [items, setItems] = useState<Array<{ id: string; url: string | null; prompt: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const res = await fetch('/api/creations?kind=video&service=avatar&limit=24', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json() as { creations?: Array<{ id: string; url: string | null; prompt: string | null; created_at: string }> };
        if (!cancel) setItems(data.creations ?? []);
      } catch {
        // ignore
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-[13px] text-[#94A3B8] mb-3">
        {locale === 'ka' ? 'შენი HeyGen ვიდეო-ავატარები' : 'Your HeyGen video avatars'}
      </p>
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="aspect-video rounded-xl bg-white/[0.04] animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-8 text-center">
          <p className="text-[14px] text-white mb-2">
            {locale === 'ka' ? 'ჯერ არ გაქვს ავატარი' : 'No avatars yet'}
          </p>
          <p className="text-[12px] text-[#94A3B8] mb-4">
            {locale === 'ka' ? 'დაიწყე "ავატარი" სერვისით ჩატში' : 'Use the Avatar pill in chat to create one'}
          </p>
          <button onClick={onBackToChat} className="px-4 py-2 rounded-full bg-white text-black text-[13px] font-semibold">
            {locale === 'ka' ? 'მთავარ ჩატში დაბრუნება' : 'Back to chat'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map(it => (
            <div key={it.id} className="rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.02]">
              {it.url
                ? <InlineMedia kind="video" url={it.url} prompt={it.prompt ?? ''} />
                : <div className="aspect-video flex items-center justify-center text-[#94A3B8] text-[12px]">No URL</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyticsView({ locale }: { locale: string }) {
  const [data, setData] = useState<{
    messagesPerDay: Array<{ date: string; count: number }>;
    generationUsage: { image: number; video: number; audio: number; avatar: number; code: number; text: number };
    topTopics: Array<{ topic: string; count: number }>;
    totalMessages: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const res = await fetch('/api/analytics/summary', { credentials: 'include' });
        if (!res.ok) return;
        const j = await res.json();
        if (!cancel) setData(j);
      } catch { /* ignore */ }
      finally { if (!cancel) setLoading(false); }
    })();
    return () => { cancel = true; };
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-[#94A3B8] text-[13px]">{locale === 'ka' ? 'იტვირთება...' : 'Loading…'}</div>;
  }
  if (!data || data.totalMessages < 5) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <p className="text-[14px] text-white">{locale === 'ka' ? 'ჯერ მცირე მონაცემია' : 'Not enough data yet'}</p>
        <p className="text-[12px] text-[#94A3B8] mt-2">
          {locale === 'ka' ? 'გააგზავნე მინიმუმ 5 შეტყობინება' : 'Send at least 5 messages to unlock analytics'}
        </p>
      </div>
    );
  }
  const u = data.generationUsage;
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label={locale === 'ka' ? 'შეტყობინება' : 'Messages'} value={data.totalMessages} accent="#a855f7" />
        <KpiTile label={locale === 'ka' ? 'სურათი' : 'Images'} value={u.image} accent="#ec4899" />
        <KpiTile label={locale === 'ka' ? 'ვიდეო' : 'Videos'} value={u.video} accent="#f97316" />
        <KpiTile label={locale === 'ka' ? 'აუდიო' : 'Audio'} value={u.audio} accent="#06b6d4" />
      </div>
      <section className="rounded-2xl p-4 bg-white/[0.04] border border-white/[0.08]">
        <h3 className="text-[13px] font-semibold text-white mb-3">
          {locale === 'ka' ? 'შეტყობინებები / დღე — ბოლო 30 დღე' : 'Messages per day · last 30 days'}
        </h3>
        <LineChart data={data.messagesPerDay} />
      </section>
      <section className="rounded-2xl p-4 bg-white/[0.04] border border-white/[0.08]">
        <h3 className="text-[13px] font-semibold text-white mb-3">
          {locale === 'ka' ? 'გენერაცია სერვისების მიხედვით' : 'Generation usage'}
        </h3>
        <BarChart data={[
          { label: 'image', count: u.image,  color: 'linear-gradient(180deg,#ec4899,#be185d)' },
          { label: 'video', count: u.video,  color: 'linear-gradient(180deg,#f97316,#c2410c)' },
          { label: 'audio', count: u.audio,  color: 'linear-gradient(180deg,#06b6d4,#0891b2)' },
          { label: 'avatar', count: u.avatar, color: 'linear-gradient(180deg,#8b5cf6,#6d28d9)' },
          { label: 'code',  count: u.code,   color: 'linear-gradient(180deg,#10b981,#047857)' },
        ]} />
      </section>
      {data.topTopics.length > 0 && (
        <section className="rounded-2xl p-4 bg-white/[0.04] border border-white/[0.08]">
          <h3 className="text-[13px] font-semibold text-white mb-3">{locale === 'ka' ? 'ტოპ თემები' : 'Top topics'}</h3>
          <TopicList topics={data.topTopics} />
        </section>
      )}
    </div>
  );
}

function BillingView({ locale }: { locale: string }) {
  return (
    <div className="max-w-md mx-auto space-y-4 pt-4">
      <h2 className="text-[18px] font-bold text-white">
        {locale === 'ka' ? 'ფასები & სეთინგი' : 'Pricing & Settings'}
      </h2>
      <p className="text-[13px] text-[#94A3B8]">
        {locale === 'ka' ? 'Stripe billing dashboard' : 'Stripe billing dashboard'}
      </p>
      <div className="rounded-2xl p-5 bg-white/[0.04] border border-white/[0.08] space-y-3">
        <PlanRow name="Starter" price="₾0" desc={locale === 'ka' ? 'უფასო · 200 კრედიტი თვეში' : 'Free · 200 credits / month'} />
        <PlanRow name="Pro" price="₾9" desc={locale === 'ka' ? '5,000 კრედიტი · უპირატესი მოდელები' : '5,000 credits · premium models'} />
        <PlanRow name="Ultimate" price="₾29" desc={locale === 'ka' ? '20,000 კრედიტი · HeyGen Pro · Voice Clone' : '20,000 credits · HeyGen Pro · Voice Clone'} />
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            const r = await fetch('/api/billing/portal', { method: 'POST', credentials: 'include' });
            const j = await r.json() as { url?: string };
            if (j.url) window.location.href = j.url;
          } catch { /* ignore */ }
        }}
        className="w-full py-3 rounded-2xl bg-white text-black font-semibold text-[14px]"
      >
        {locale === 'ka' ? 'Stripe Customer Portal-ის გახსნა' : 'Open Stripe Customer Portal'}
      </button>
    </div>
  );
}

function PlanRow({ name, price, desc }: { name: string; price: string; desc: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[14px] font-semibold text-white">{name}</div>
        <div className="text-[11px] text-[#94A3B8] mt-0.5">{desc}</div>
      </div>
      <div className="text-[16px] font-bold text-white">{price}</div>
    </div>
  );
}

// ─── System Status drawer (right) ────────────────────────────────────────────

function SystemStatusDrawer({
  locale,
  userName,
  isAuthenticated,
  onClose,
}: {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
  onClose: () => void;
}) {
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      try {
        const r = await fetch('/api/billing/usage', { credentials: 'include' });
        if (!r.ok) return;
        const j = await r.json() as { credits_balance?: number; balance?: number };
        const v = j.credits_balance ?? j.balance ?? null;
        if (v != null) setCreditsBalance(v);
      } catch { /* ignore */ }
    })();
  }, [isAuthenticated]);

  const signOut = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      if (supabase) await supabase.auth.signOut();
    } catch { /* ignore */ }
    window.location.href = `/${locale}/login`;
  }, [locale]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06]">
        <span className="text-[15px] font-semibold text-white truncate pr-2">
          {userName || (locale === 'ka' ? 'სტუმარი' : 'Guest')}
        </span>
        <button type="button" aria-label="Close" onClick={onClose}
          className="h-8 w-8 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-[#94A3B8]">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Credits */}
        <section className="rounded-2xl p-4 bg-white/[0.04] border border-white/[0.08]">
          <div className="text-[10px] font-bold tracking-wider uppercase text-[#94A3B8]">
            {locale === 'ka' ? 'კრედიტი' : 'Credits'}
          </div>
          <div className="text-[28px] font-bold text-white mt-1">
            {creditsBalance != null ? creditsBalance.toLocaleString() : '—'}
          </div>
        </section>

        {/* System status (provider live signal) */}
        <section className="rounded-2xl p-4 bg-white/[0.04] border border-white/[0.08]">
          <div className="text-[10px] font-bold tracking-wider uppercase text-[#94A3B8] mb-2">
            {locale === 'ka' ? 'სისტემის სტატუსი' : 'System Status'}
          </div>
          <div className="flex items-center gap-2 text-[13px] text-white">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {locale === 'ka' ? 'ყველა სერვისი მუშაობს' : 'All systems operational'}
          </div>
          <Sparkles size={12} className="hidden" />
        </section>

        {/* Sign out (if authed) */}
        {isAuthenticated && (
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-white/[0.04] transition text-left"
          >
            <LogOut size={16} className="text-red-400" />
            <span className="text-[14px] text-red-400 font-medium">{locale === 'ka' ? 'გასვლა' : 'Sign out'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Pending text per service ────────────────────────────────────────────────

type Setter = React.Dispatch<React.SetStateAction<ChatMessage[]>>;

function pendingTextFor(s: ServiceId, locale: string): string {
  const ka: Record<ServiceId, string> = {
    chat: 'ვფიქრობ...',
    avatar: 'ვქმნი ავატარს...',
    image: 'ვქმნი სურათს...',
    video: 'ვქმნი ვიდეოს...',
    music: 'ვქმნი მუსიკას...',
    voice: 'ვამზადებ ხმოვან ჩანაწერს...',
    interior: 'ვქმნი ინტერიერის რენდერს...',
    app: 'ვაშენებ აპლიკაციას...',
  };
  const en: Record<ServiceId, string> = {
    chat: 'Thinking...',
    avatar: 'Generating avatar...',
    image: 'Generating image...',
    video: 'Generating video...',
    music: 'Composing music...',
    voice: 'Synthesizing voice...',
    interior: 'Rendering interior...',
    app: 'Building app...',
  };
  return (locale === 'ka' ? ka : en)[s];
}

function patchMessage(setMessages: Setter, id: string, patch: Partial<ChatMessage>) {
  setMessages(m => m.map(x => x.id === id ? { ...x, ...patch, pending: false } : x));
}

// ─── Specialist runners — one per agent ──────────────────────────────────────

async function runChat(text: string, history: ChatMessage[], pendingId: string, setMessages: Setter) {
  const trimmed = history.filter(m => !m.pending).slice(-20).map(m => ({ role: m.role, content: m.text }));
  const res = await fetch('/api/chat/gemini', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [...trimmed, { role: 'user', content: text }] }),
  });
  if (!res.ok || !res.body) throw new Error('Chat failed');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = '', buffer = '';
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
          acc += p.text;
          setMessages(m => m.map(x => x.id === pendingId ? { ...x, pending: false, text: acc } : x));
        }
      } catch { /* skip */ }
    }
  }
  if (!acc) throw new Error('Empty response');
}

async function runImage(prompt: string, pendingId: string, setMessages: Setter) {
  const res = await fetch('/api/replicate/image', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, quality: 'standard', ratio: '16:9' }),
  });
  const data = await res.json() as { url?: string; imageUrl?: string; output?: string[]; predictionId?: string; error?: string };
  let url = data?.url || data?.imageUrl || data?.output?.[0];
  // If a predictionId came back, the generation isn't done — poll briefly
  if (!url && data?.predictionId) {
    for (let i = 0; i < 18; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const poll = await fetch('/api/replicate/image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictionId: data.predictionId }),
      });
      if (!poll.ok) continue;
      const pd = await poll.json() as { url?: string; status?: string; output?: string[] };
      const u = pd.url || pd.output?.[0];
      if (u) { url = u; break; }
      if (pd.status === 'failed') throw new Error('Image generation failed');
    }
  }
  if (!url) throw new Error(data?.error || 'Image generation failed');
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'image', url } });
}

async function runVideo(prompt: string, pendingId: string, setMessages: Setter) {
  const res = await fetch('/api/ltx-video', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, aspect_ratio: '16:9', duration: 6 }),
  });
  if (!res.ok) throw new Error(`Video failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'video', url } });
}

async function runMusic(prompt: string, pendingId: string, setMessages: Setter) {
  const res = await fetch('/api/udio/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, make_instrumental: false }),
  });
  const data = await res.json() as { url?: string; audioUrl?: string; error?: string };
  const url = data?.url || data?.audioUrl;
  if (!url) throw new Error(data?.error || 'Music generation failed');
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'audio', url } });
}

async function runVoice(text: string, pendingId: string, setMessages: Setter) {
  const res = await fetch('/api/elevenlabs/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, locale: 'ka' }),
  });
  if (!res.ok) throw new Error('Voice failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'audio', url } });
}

async function runAvatar(script: string, pendingId: string, setMessages: Setter) {
  const start = await fetch('/api/heygen/avatar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script }),
  });
  const startData = await start.json() as { videoId?: string; error?: string };
  if (!startData.videoId) throw new Error(startData.error || 'Avatar failed');

  // HeyGen avatar generation often takes 2–4 minutes for short scripts and
  // can occasionally exceed 4 min for longer ones. The previous 24×5s=120s
  // budget caused frequent "Avatar timed out" errors AND a worse failure
  // mode: in some edge cases the catch handler fires *after* the GET had
  // already begun returning a URL on a parallel tick, leaving an orphaned
  // message. Extend to 60×5s=300s and also capture the thumbnail URL as a
  // video poster so the user sees a clear preview frame even before
  // canplay fires (fixes the "black-on-black invisible video" bug).
  let videoUrl: string | null = null;
  let posterUrl: string | null = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await fetch(`/api/heygen/avatar?videoId=${encodeURIComponent(startData.videoId)}`);
    if (!poll.ok) continue;
    const pd = await poll.json() as { status?: string; url?: string; thumbnail?: string; error?: string };
    if (pd.status === 'completed' && pd.url) {
      videoUrl = pd.url;
      posterUrl = pd.thumbnail ?? null;
      break;
    }
    if (pd.status === 'failed') throw new Error(pd.error || 'Avatar failed');
  }
  if (!videoUrl) throw new Error('Avatar timed out (5 min)');
  patchMessage(setMessages, pendingId, {
    text: '',
    media: { kind: 'video', url: videoUrl, ...(posterUrl ? { poster: posterUrl } : {}) },
  });
}

async function runInterior(prompt: string, pendingId: string, setMessages: Setter) {
  const augmented = `interior design render, ${prompt}, architectural photography, professional lighting, ultra detailed, 4k, photorealistic`;
  await runImage(augmented, pendingId, setMessages);
}

async function runApp(prompt: string, pendingId: string, setMessages: Setter) {
  // App Builder uses Anthropic Claude (better at self-contained HTML/CSS/JS
  // than Gemini). Endpoint streams plain text (no SSE framing) so we just
  // concatenate the body chunks.
  const res = await fetch('/api/chat/claude', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok || !res.body) throw new Error('App build failed');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });
  }
  const html = acc.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (!html) throw new Error('Empty HTML');
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'code', html, language: 'html' } });
}
