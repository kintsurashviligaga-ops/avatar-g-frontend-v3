'use client';

/**
 * MyAvatarChat — the single Grok-style chat surface for myavatar.ge.
 *
 * Architecture (matches the user's "Unified One-Window Architecture"
 * diagram):
 *
 *     User
 *       ↓
 *     Agent G (Gemini orchestrator, this component's brain)
 *       ↓
 *     ┌─────────┬───────────┬──────────┬──────────────┐
 *     Chat       Avatar       Music      Voice
 *     Image      Video        Interior   App Builder
 *       ↓
 *     Inline Media Player (InlineMedia)  — renders every output
 *
 * UI (matches Grok mobile screenshots):
 *   • pure-black background
 *   • TopBar: hamburger · "Ask / Imagine" segmented · profile
 *   • Empty state: center logo only
 *   • Active state: scrollable chat with inline media
 *   • Bottom: action-pill row + "Ask Anything" input with paperclip /
 *     speed mode / mic / Speak button
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
  ChevronRight,
  Brain,
  Mic2,
  BarChart3,
  LogOut,
} from 'lucide-react';
import InlineMedia, { detectInlineMedia } from '@/components/dashboard/command-center/InlineMedia';
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

interface MediaPayload {
  kind: 'image' | 'video' | 'audio' | 'code';
  url?: string;
  html?: string;
  language?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
  service?: ServiceId;
  media?: MediaPayload;
  ts: number;
}

interface MyAvatarChatProps {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
}

// ─── Service catalog (8 specialists per architecture diagram) ────────────────

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

// Exported in case future surfaces want to reuse the service labels.
export function serviceLabel(s: ServiceId, locale: string) {
  return locale === 'ka' ? SERVICE_LABELS_KA[s] : SERVICE_LABELS_EN[s];
}

// ─── Agent G intent router — text → specialist agent ─────────────────────────

function detectIntent(text: string, mode: Mode): ServiceId {
  // "Imagine" mode → default to image, unless text clearly mentions another media
  if (mode === 'imagine') {
    if (/\b(video|ვიდეო|видео|movie|clip)\b/i.test(text)) return 'video';
    if (/\b(music|song|track|მუსიკ|музык)\b/i.test(text)) return 'music';
    if (/\b(avatar|talking|ავატარ|аватар)\b/i.test(text)) return 'avatar';
    return 'image';
  }
  // "Ask" mode → mostly chat, but route on clear creative intent
  if (/\b(draw|paint|generate image|create image|make image|photo|სურათი|ფოტო|დახატე|нарисуй|фото)\b/i.test(text))
    return 'image';
  if (/\b(create video|make video|generate video|animate|ვიდეო|видео)\b/i.test(text))
    return 'video';
  if (/\b(compose|create music|make song|generate music|მუსიკა|музыка)\b/i.test(text))
    return 'music';
  if (/\b(avatar|talking head|ავატარი|аватар)\b/i.test(text))
    return 'avatar';
  if (/\b(speak|read aloud|say this|voice|text to speech|წაიკითხე|ხმოვა|прочитай)\b/i.test(text))
    return 'voice';
  if (/\b(interior|room|bedroom|living room|kitchen|ინტერიერი|ოთახი|интерьер|комната)\b/i.test(text))
    return 'interior';
  if (/\b(app|application|website|html|code|build app|აპლიკაცია|ვებსაიტი|приложение|сайт)\b/i.test(text))
    return 'app';
  return 'chat';
}

// ─── ID + time helpers ──────────────────────────────────────────────────────

function mkId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Action pills shown above the input ──────────────────────────────────────

interface PillSpec {
  id: ServiceId;
  icon: typeof ImageIcon;
  label_ka: string;
  label_en: string;
  prompt_ka: string;
}

const PILLS: PillSpec[] = [
  { id: 'image',    icon: ImageIcon, label_ka: 'სურათი',      label_en: 'Image',     prompt_ka: 'ლამაზი მთის პეიზაჟი მზის ჩასვლისას, კინემატოგრაფიული' },
  { id: 'video',    icon: VideoIcon, label_ka: 'ვიდეო',       label_en: 'Video',     prompt_ka: 'ცინემატური ხედი ზღვის ნაპირზე მზის ჩასვლისას' },
  { id: 'music',    icon: MusicIcon, label_ka: 'მუსიკა',      label_en: 'Music',     prompt_ka: 'ჯაზური ფონური მუსიკა, თბილისური მოტივებით' },
  { id: 'voice',    icon: Volume2,   label_ka: 'ხმა',         label_en: 'Voice',     prompt_ka: 'გამარჯობა, ეს არის MyAvatar.ge ხმოვანი ნიმუში' },
  { id: 'avatar',   icon: UserIcon,  label_ka: 'ავატარი',     label_en: 'Avatar',    prompt_ka: 'გამარჯობა, მე ვარ შენი ციფრული ავატარი' },
  { id: 'interior', icon: SofaIcon,  label_ka: 'ინტერიერი',   label_en: 'Interior',  prompt_ka: 'მოდერნი სკანდინავიური მისაღები ოთახი, ბუნებრივი განათებით' },
  { id: 'app',      icon: CodeIcon,  label_ka: 'აპლიკაცია',   label_en: 'App',       prompt_ka: 'ლანდინგ გვერდი ფერადი ღილაკით რომელიც დაჭერისას ცვლის ფერს' },
];

// ─── Main component ──────────────────────────────────────────────────────────

export default function MyAvatarChat({ locale, userName, isAuthenticated }: MyAvatarChatProps) {
  const localeCode = (locale === 'ka' || locale === 'en' || locale === 'ru') ? locale : 'ka';
  const [mode, setMode] = useState<Mode>('ask');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new content
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);

  // ── Send handler ─────────────────────────────────────────────────────────
  const send = useCallback(async (text: string, forceService?: ServiceId) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const service = forceService ?? detectIntent(trimmed, mode);
    const userMsg: ChatMessage = { id: mkId(), role: 'user', text: trimmed, ts: Date.now() };
    const pendingMsg: ChatMessage = {
      id: mkId(),
      role: 'assistant',
      text: pendingTextFor(service, localeCode),
      pending: true,
      service,
      ts: Date.now() + 1,
    };
    setMessages(m => [...m, userMsg, pendingMsg]);
    setInput('');
    setSending(true);

    try {
      if (service === 'chat') {
        await runChat(trimmed, messages, pendingMsg.id, setMessages);
      } else if (service === 'image') {
        await runImage(trimmed, pendingMsg.id, setMessages);
      } else if (service === 'video') {
        await runVideo(trimmed, pendingMsg.id, setMessages);
      } else if (service === 'music') {
        await runMusic(trimmed, pendingMsg.id, setMessages);
      } else if (service === 'voice') {
        await runVoice(trimmed, pendingMsg.id, setMessages);
      } else if (service === 'avatar') {
        await runAvatar(trimmed, pendingMsg.id, setMessages);
      } else if (service === 'interior') {
        await runInterior(trimmed, pendingMsg.id, setMessages);
      } else if (service === 'app') {
        await runApp(trimmed, pendingMsg.id, setMessages);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'შეცდომა';
      setMessages(m => m.map(x =>
        x.id === pendingMsg.id ? { ...x, pending: false, text: `⚠️ ${msg}` } : x,
      ));
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
    const text = localeCode === 'ka' ? p.prompt_ka : `Create a ${p.label_en.toLowerCase()}: ${p.prompt_ka}`;
    void send(text, p.id);
  };

  const hasMessages = messages.length > 0;

  return (
    <main
      className="fixed inset-0 flex flex-col bg-black text-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* ── TopBar ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
        <button
          type="button"
          aria-label="Menu"
          onClick={() => setDrawerOpen(true)}
          className="h-10 w-10 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center transition"
        >
          <Menu size={18} className="text-white/80" />
        </button>

        <div className="flex items-center gap-1 bg-white/[0.04] rounded-full p-1">
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

        <button
          type="button"
          aria-label="Profile"
          onClick={() => setProfileOpen(true)}
          className="h-10 w-10 rounded-full bg-white/[0.04] hover:bg-white/10 flex items-center justify-center transition"
        >
          <UserIcon size={18} className="text-white/80" />
        </button>
      </header>

      {/* ── Body: empty state OR message list ───────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4">
        {!hasMessages ? (
          <EmptyState />
        ) : (
          <div className="max-w-2xl mx-auto py-4 space-y-4">
            {messages.map(m => (
              <MessageBubble key={m.id} m={m} onRemix={text => send(text)} />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* ── Bottom: action pills + input ────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2 bg-gradient-to-t from-black via-black to-transparent">
        {/* Action pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PILLS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePill(p)}
              disabled={sending}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-50 transition text-[13px] font-medium text-white/85"
            >
              <p.icon size={14} className="text-white/70" />
              {localeCode === 'ka' ? p.label_ka : p.label_en}
            </button>
          ))}
        </div>

        {/* Input area */}
        <div className="rounded-3xl bg-white/[0.06] border border-white/8 overflow-hidden focus-within:border-white/16 transition">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            placeholder={localeCode === 'ka' ? 'მკითხე ნებისმიერი' : 'Ask Anything'}
            aria-label={localeCode === 'ka' ? 'მკითხე ნებისმიერი' : 'Ask Anything'}
            className="w-full bg-transparent border-none outline-none resize-none px-4 pt-3 pb-1 text-[15px] text-white placeholder:text-white/40"
            style={{ minHeight: 24, maxHeight: 140 }}
          />
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={localeCode === 'ka' ? 'ფაილის მიმაგრება' : 'Attach file'}
                className="h-9 w-9 rounded-full hover:bg-white/8 flex items-center justify-center text-white/55 transition"
              >
                <Paperclip size={16} />
              </button>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] text-white/70 text-[12px] font-medium">
                <Zap size={12} className="text-yellow-300" />
                {localeCode === 'ka' ? 'სწრაფი' : 'Fast'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Voice"
                className="h-9 w-9 rounded-full hover:bg-white/8 flex items-center justify-center text-white/55 transition"
              >
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

      {/* ── Menu drawer (left, slide-in) ────────────────────────────────── */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        />
      )}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-[280px] bg-zinc-950 border-r border-white/8 transform transition-transform duration-200 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <DrawerContent locale={localeCode} userName={userName} isAuthenticated={isAuthenticated} onClose={() => setDrawerOpen(false)} />
      </aside>

      {/* ── Profile drawer (right, slide-in) ────────────────────────────── */}
      {profileOpen && (
        <button
          type="button"
          aria-label="Close profile"
          onClick={() => setProfileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        />
      )}
      <aside
        className={`fixed top-0 bottom-0 right-0 z-50 w-[280px] bg-zinc-950 border-l border-white/8 transform transition-transform duration-200 ${
          profileOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <ProfileDrawerContent
          locale={localeCode}
          userName={userName}
          isAuthenticated={isAuthenticated}
          onClose={() => setProfileOpen(false)}
        />
      </aside>
    </main>
  );
}

// ─── EmptyState — center logo ────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center pointer-events-none">
      <div className="relative">
        <div
          className="w-28 h-28 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle at 50% 35%, rgba(167,139,250,0.85) 0%, rgba(167,139,250,0.05) 60%, transparent 75%)',
            filter: 'blur(2px)',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/30">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z" />
            <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z" />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── MessageBubble ──────────────────────────────────────────────────────────

function MessageBubble({ m, onRemix }: { m: ChatMessage; onRemix: (text: string) => void }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-white/10 text-white text-[15px]">
          {m.text}
        </div>
      </div>
    );
  }

  // Assistant
  const detected = !m.media && !m.pending ? detectInlineMedia(m.text) : null;
  const text = detected ? m.text.replace(detected.url, '').trim() : m.text;

  return (
    <div className="flex flex-col gap-2 items-start">
      {m.pending ? (
        <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-white/8 text-white/70 text-[14px]">
          <Loader2 size={14} className="animate-spin text-violet-300" />
          {m.text}
        </div>
      ) : (
        <>
          {text && (
            <div className="max-w-[88%] px-4 py-2.5 rounded-2xl bg-transparent text-white/90 text-[15px] whitespace-pre-wrap break-words">
              {text}
            </div>
          )}
          {m.media && (
            <div className="ml-1">
              {m.media.kind === 'code' && m.media.html ? (
                <InlineMedia kind="code" html={m.media.html} language={m.media.language} prompt="" onRemix={onRemix} />
              ) : m.media.url ? (
                <InlineMedia kind={m.media.kind as 'image' | 'video' | 'audio'} url={m.media.url} prompt={m.text} onRemix={onRemix} />
              ) : null}
            </div>
          )}
          {!m.media && detected && (
            <div className="ml-1">
              <InlineMedia kind={detected.kind} url={detected.url} prompt={text} onRemix={onRemix} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Drawer (left) — Recent + nav ───────────────────────────────────────────

function DrawerContent({
  locale,
  userName: _userName,
  isAuthenticated,
  onClose,
}: {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
  onClose: () => void;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/6">
        <span className="text-[15px] font-semibold text-white">MyAvatar</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="h-8 w-8 rounded-full hover:bg-white/8 flex items-center justify-center text-white/55"
        >
          <X size={16} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {[
          { href: `/${locale}/dashboard`, label: locale === 'ka' ? 'მთავარი' : 'Home', icon: Sparkles },
          { href: `/${locale}/avatar`,    label: locale === 'ka' ? 'ჩემი ავატარი' : 'My Avatar', icon: UserIcon },
          { href: `/${locale}/voice-lab`, label: locale === 'ka' ? 'ხმის ლაბორატორია' : 'Voice Lab', icon: Mic2 },
          { href: `/${locale}/memory`,    label: locale === 'ka' ? 'მეხსიერება' : 'Memory', icon: Brain },
          { href: `/${locale}/analytics`, label: locale === 'ka' ? 'ანალიტიკა' : 'Analytics', icon: BarChart3 },
        ].map(item => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition"
          >
            <item.icon size={16} className="text-white/65" />
            <span className="text-[14px] text-white/85 flex-1">{item.label}</span>
            <ChevronRight size={14} className="text-white/30" />
          </Link>
        ))}
      </nav>
      {!isAuthenticated && (
        <div className="p-4 border-t border-white/6">
          <Link
            href={`/${locale}/login`}
            className="block w-full py-2.5 rounded-full bg-white text-black text-center text-[14px] font-semibold"
          >
            {locale === 'ka' ? 'შესვლა' : 'Sign in'}
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Profile drawer (right) ─────────────────────────────────────────────────

function ProfileDrawerContent({
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
  const signOut = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      if (supabase) await supabase.auth.signOut();
    } catch {
      // ignore — fallthrough to redirect
    }
    window.location.href = `/${locale}/login`;
  }, [locale]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/6">
        <span className="text-[15px] font-semibold text-white">{userName || 'Guest'}</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="h-8 w-8 rounded-full hover:bg-white/8 flex items-center justify-center text-white/55"
        >
          <X size={16} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {isAuthenticated ? (
          <>
            <Link href={`/${locale}/account`} onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition">
              <UserIcon size={16} className="text-white/65" />
              <span className="text-[14px] text-white/85 flex-1">{locale === 'ka' ? 'პროფილი' : 'Profile'}</span>
              <ChevronRight size={14} className="text-white/30" />
            </Link>
            <Link href={`/${locale}/pricing`} onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition">
              <Sparkles size={16} className="text-white/65" />
              <span className="text-[14px] text-white/85 flex-1">{locale === 'ka' ? 'პაკეტები' : 'Pricing'}</span>
              <ChevronRight size={14} className="text-white/30" />
            </Link>
            <button
              type="button"
              onClick={signOut}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition text-left"
            >
              <LogOut size={16} className="text-red-400" />
              <span className="text-[14px] text-red-400 flex-1">{locale === 'ka' ? 'გასვლა' : 'Sign out'}</span>
            </button>
          </>
        ) : (
          <Link href={`/${locale}/login`} onClick={onClose}
            className="block mx-4 mt-2 py-2.5 rounded-full bg-white text-black text-center text-[14px] font-semibold">
            {locale === 'ka' ? 'შესვლა' : 'Sign in'}
          </Link>
        )}
      </nav>
    </div>
  );
}

// ─── Dispatch helpers — one per specialist agent ─────────────────────────────

type Setter = React.Dispatch<React.SetStateAction<ChatMessage[]>>;

function patchMessage(setMessages: Setter, id: string, patch: Partial<ChatMessage>) {
  setMessages(m => m.map(x => x.id === id ? { ...x, ...patch, pending: false } : x));
}

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

async function runChat(text: string, history: ChatMessage[], pendingId: string, setMessages: Setter) {
  const trimmedHistory = history.filter(m => !m.pending).slice(-20).map(m => ({
    role: m.role, content: m.text,
  }));
  const res = await fetch('/api/chat/gemini', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [...trimmedHistory, { role: 'user', content: text }] }),
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
      } catch { /* skip non-JSON SSE */ }
    }
  }
  if (!acc) throw new Error('Empty response');
}

async function runImage(prompt: string, pendingId: string, setMessages: Setter) {
  const res = await fetch('/api/replicate/image', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, quality: 'standard', ratio: '16:9' }),
  });
  const data = await res.json() as { url?: string; imageUrl?: string; output?: string[]; error?: string };
  const url = data?.url || data?.imageUrl || data?.output?.[0];
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

  let videoUrl: string | null = null;
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await fetch(`/api/heygen/avatar?videoId=${encodeURIComponent(startData.videoId)}`);
    if (!poll.ok) continue;
    const pd = await poll.json() as { status?: string; url?: string; error?: string };
    if (pd.status === 'completed' && pd.url) { videoUrl = pd.url; break; }
    if (pd.status === 'failed') throw new Error(pd.error || 'Avatar failed');
  }
  if (!videoUrl) throw new Error('Avatar timed out');
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'video', url: videoUrl } });
}

async function runInterior(prompt: string, pendingId: string, setMessages: Setter) {
  const augmented = `interior design render, ${prompt}, architectural photography, professional lighting, ultra detailed, 4k, photorealistic`;
  const res = await fetch('/api/replicate/image', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: augmented, quality: 'standard', ratio: '16:9' }),
  });
  const data = await res.json() as { url?: string; imageUrl?: string; output?: string[]; error?: string };
  const url = data?.url || data?.imageUrl || data?.output?.[0];
  if (!url) throw new Error(data?.error || 'Interior failed');
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'image', url } });
}

async function runApp(prompt: string, pendingId: string, setMessages: Setter) {
  const codePrompt = `You are a senior frontend engineer. Produce a single self-contained HTML document (with inline CSS and JS, no external assets) that fully implements the following request. Return ONLY the HTML — no markdown fences, no commentary.\n\nRequest: ${prompt}`;
  const res = await fetch('/api/chat/gemini', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: codePrompt }] }),
  });
  if (!res.ok || !res.body) throw new Error('App build failed');

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
        if (p.text) acc += p.text;
      } catch { /* skip */ }
    }
  }
  const html = acc.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (!html) throw new Error('Empty HTML');
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'code', html, language: 'html' } });
}
