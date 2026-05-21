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
  Mic,
  Send,
  Paperclip,
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
  LogOut,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import InlineMedia, { detectInlineMedia } from '@/components/dashboard/command-center/InlineMedia';
import AuthModal from '@/components/chat/AuthModal';
import VideoControlSuite from '@/components/chat/VideoControlSuite';
import { type RenderSettings, renderSettingsToPayload } from '@/lib/orchestrator/render-settings';
import { useRenderSettings } from '@/hooks/useRenderSettings';
import SwarmStatusPanel from '@/components/chat/SwarmStatusPanel';
import { publishPipeline } from '@/lib/orchestrator/broker-instance';
import { buildSuggestedActions } from '@/lib/orchestrator/actions';
import type { AssetRef, PipelineContext, ServiceResponse, SuggestedAction } from '@/lib/orchestrator/types';
import VoiceLab from '@/components/voice/VoiceLab';
import MemoryPanel from '@/components/memory/MemoryPanel';
import { BarChart, KpiTile, LineChart, TopicList, WeeklyUsageChart } from '@/components/analytics/AnalyticsCharts';
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

interface ChatSessionMeta {
  id: string;
  title: string;
  ts: number;
  messageCount: number;
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

// Slash commands: power-user shortcut to lock the next message to a
// specific specialist. Returns the parsed { service, rest } when the
// text starts with a known slash, else null.
const SLASH_COMMANDS: Record<string, ServiceId> = {
  '/image':    'image',
  '/img':      'image',
  '/photo':    'image',
  '/video':    'video',
  '/vid':      'video',
  '/music':    'music',
  '/song':     'music',
  '/voice':    'voice',
  '/tts':      'voice',
  '/avatar':   'avatar',
  '/interior': 'interior',
  '/app':      'app',
  '/code':     'app',
  '/chat':     'chat',
  '/ask':      'chat',
};

function parseSlash(text: string): { service: ServiceId; rest: string } | null {
  const m = text.match(/^\s*(\/[a-z]+)\s*(.*)$/i);
  if (!m) return null;
  const cmd = m[1]?.toLowerCase() ?? '';
  const rest = (m[2] ?? '').trim();
  const service = SLASH_COMMANDS[cmd];
  return service ? { service, rest } : null;
}

function detectIntent(text: string, mode: Mode): ServiceId {
  // Power-user slash commands always win.
  const slash = parseSlash(text);
  if (slash) return slash.service;
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
  const [listening, setListening] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [renderSettings, setRenderSettings] = useRenderSettings();
  const [renderPanelOpen, setRenderPanelOpen] = useState(false);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  // (Removed: latestMedia + mobileView — previews are now inline-only.)
  const [attachment, setAttachment] = useState<{ name: string; type: string; base64: string; previewUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Session-recovery: persist the pending attachment to localStorage so a
  // page reload doesn't drop the file the user was about to send. Cleared
  // on successful dispatch or manual remove.
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('myavatar-attachment');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { name: string; type: string; base64: string; previewUrl: string };
      if (parsed?.base64 && parsed?.type) setAttachment(parsed);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      if (attachment) localStorage.setItem('myavatar-attachment', JSON.stringify(attachment));
      else localStorage.removeItem('myavatar-attachment');
    } catch { /* quota — ignore */ }
  }, [attachment]);
  const [sessionId, setSessionId] = useState<string>(() => mkId());
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<unknown>(null);

  // Inline-only: when a new media-bearing assistant message lands, smoothly
  // scroll it into view so it's immediately framed in the chat viewport.
  const prevMediaIdRef = useRef<string | null>(null);
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m || m.role !== 'assistant' || m.pending) continue;
      const hasMedia = m.media?.url || m.media?.html || detectInlineMedia(m.text);
      if (!hasMedia) continue;
      if (prevMediaIdRef.current !== m.id) {
        prevMediaIdRef.current = m.id;
        // Defer to next tick so the DOM node exists before scrolling.
        requestAnimationFrame(() => {
          const node = document.querySelector(`[data-msg-id="${m.id}"]`);
          node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
      return;
    }
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // ── Persist sessions to localStorage. Keeps last 20 conversations per
  //    browser. Each session lives at `myavatar-chat:<id>`. Index at
  //    `myavatar-chat:index` stores the recent-list metadata for the sidebar.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('myavatar-chat:index');
      if (raw) {
        const list = JSON.parse(raw) as ChatSessionMeta[];
        if (Array.isArray(list)) setSessions(list);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    // Skip empty / brand-new sessions.
    if (messages.length === 0) return;
    try {
      const title = (messages.find(m => m.role === 'user')?.text ?? 'New chat').slice(0, 60);
      const meta: ChatSessionMeta = { id: sessionId, title, ts: Date.now(), messageCount: messages.length };
      // Strip transient state from saved messages.
      const persistable = messages
        .filter(m => !m.pending)
        .map(m => ({ ...m, pending: undefined, liked: undefined, disliked: undefined }));
      localStorage.setItem(`myavatar-chat:${sessionId}`, JSON.stringify(persistable));
      const next: ChatSessionMeta[] = [meta, ...sessions.filter(s => s.id !== sessionId)].slice(0, 20);
      setSessions(next);
      localStorage.setItem('myavatar-chat:index', JSON.stringify(next));
      // GC: drop any saved sessions beyond the 20-cap.
      const keep = new Set(next.map(s => s.id));
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('myavatar-chat:') && k !== 'myavatar-chat:index') {
            const id = k.slice('myavatar-chat:'.length);
            if (!keep.has(id)) localStorage.removeItem(k);
          }
        }
      } catch { /* ignore */ }
    } catch { /* ignore localStorage quota */ }
    // sessions intentionally not in deps — would loop. We read latest via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, sessionId]);

  const loadSession = useCallback((id: string) => {
    try {
      const raw = localStorage.getItem(`myavatar-chat:${id}`);
      if (!raw) return;
      const data = JSON.parse(raw) as ChatMessage[];
      if (!Array.isArray(data)) return;
      setMessages(data);
      setSessionId(id);
      setDrawerOpen(false);
    } catch { /* ignore */ }
  }, []);

  const newSession = useCallback(() => {
    setMessages([]);
    setSessionId(mkId());
    setDrawerOpen(false);
  }, []);

  const deleteSession = useCallback((id: string) => {
    try {
      localStorage.removeItem(`myavatar-chat:${id}`);
      const next = sessions.filter(s => s.id !== id);
      setSessions(next);
      localStorage.setItem('myavatar-chat:index', JSON.stringify(next));
      if (id === sessionId) newSession();
    } catch { /* ignore */ }
  }, [sessionId, sessions, newSession]);

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

  // ── Voice-to-text input. Tries native SpeechRecognition first (Chrome/Edge);
  //    falls back to MediaRecorder + /api/voice/transcribe (Whisper) so iOS
  //    Safari users — where SpeechRecognition is unreliable — get the same UX.
  //    Append transcript to current input rather than overwriting, so the user
  //    can mix typing and speech.
  // Attach an image — currently only used by the Avatar specialist (HeyGen's
  // talking-photo flow). Other services accept the message text only and the
  // attachment is silently dropped.
  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const onFileChosen = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!f) return;
    if (!f.type.startsWith('image/')) return;
    if (f.size > 8 * 1024 * 1024) return; // 8 MB hard cap, prevents huge base64 strings
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const base64 = result.includes(',') ? result.split(',')[1] ?? '' : result;
      setAttachment({ name: f.name, type: f.type, base64, previewUrl: result });
    };
    reader.readAsDataURL(f);
  }, []);
  const clearAttachment = useCallback(() => setAttachment(null), []);

  const toggleVoiceInput = useCallback(async () => {
    type SpeechRecognitionLike = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SRCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    const lang = localeCode === 'ka' ? 'ka-GE' : localeCode === 'ru' ? 'ru-RU' : 'en-US';

    // STOP path (works for either backend)
    if (listening) {
      const ref = recognitionRef.current as { stop?: () => void } | null;
      try { ref?.stop?.(); } catch { /* ignore */ }
      setListening(false);
      return;
    }

    // Backend A: Web Speech API (Chrome, Edge, Safari macOS 14+ partial).
    if (SRCtor) {
      try {
        const rec = new SRCtor();
        rec.lang = lang;
        rec.continuous = false;
        rec.interimResults = false;
        rec.onresult = (e) => {
          const transcript = e.results[0]?.[0]?.transcript ?? '';
          if (transcript) setInput(prev => (prev ? `${prev} ${transcript}` : transcript));
        };
        rec.onend = () => setListening(false);
        rec.onerror = () => setListening(false);
        rec.start();
        recognitionRef.current = rec;
        setListening(true);
        return;
      } catch { /* fall through to MediaRecorder */ }
    }

    // Backend B: MediaRecorder + Whisper (iOS Safari, anywhere SR is missing).
    if (typeof navigator.mediaDevices?.getUserMedia !== 'function' || typeof MediaRecorder === 'undefined') {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
                 : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
                 : '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (chunks.length === 0) { setListening(false); return; }
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const form = new FormData();
        form.append('audio', blob, `voice.${(rec.mimeType || 'audio/webm').includes('mp4') ? 'm4a' : 'webm'}`);
        form.append('language', lang);
        try {
          const res = await fetch('/api/voice/transcribe', { method: 'POST', body: form });
          if (res.ok) {
            const data = await res.json() as { text?: string };
            const txt = (data.text || '').trim();
            if (txt) setInput(prev => (prev ? `${prev} ${txt}` : txt));
          }
        } catch { /* ignore — user can retry */ }
        finally { setListening(false); }
      };
      // Stop wrapper exposes a unified .stop() for the toggle
      recognitionRef.current = { stop: () => { try { rec.stop(); } catch { /* noop */ } } };
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [listening, localeCode]);

  // ── Send / regenerate ─────────────────────────────────────────────────────
  const send = useCallback(async (text: string, forceService?: ServiceId, replacePendingId?: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    // Strip slash-command prefix from outgoing payload — e.g. "/image a cat" →
    // service=image, payload="a cat". `/help`, `/clear` are intercepted below.
    const slash = parseSlash(trimmed);
    if (slash?.service === 'chat' && /^(\/help|\/h|\/\?)$/i.test(trimmed.trim().split(/\s+/)[0] ?? '')) {
      // Built-in /help — render an in-line markdown cheat-sheet.
      const helpMd = localeCode === 'ka'
        ? `**ხელმისაწვდომი ბრძანებები**\n\n- \`/image <prompt>\` — სურათი\n- \`/video <prompt>\` — ვიდეო\n- \`/music <prompt>\` — მუსიკა\n- \`/voice <prompt>\` — ხმოვანი (TTS)\n- \`/avatar <script>\` — HeyGen ავატარი\n- \`/interior <room>\` — ინტერიერი\n- \`/app <description>\` — Claude აპლიკაცია\n- \`/clear\` — საუბრის გასუფთავება\n- \`/help\` — ეს დახმარება`
        : `**Available slash commands**\n\n- \`/image <prompt>\` — image\n- \`/video <prompt>\` — video\n- \`/music <prompt>\` — music\n- \`/voice <prompt>\` — voice (TTS)\n- \`/avatar <script>\` — HeyGen avatar\n- \`/interior <room>\` — interior render\n- \`/app <description>\` — Claude HTML app\n- \`/clear\` — clear conversation\n- \`/help\` — this help`;
      setMessages(m => [
        ...m,
        { id: mkId(), role: 'user', text: trimmed, ts: Date.now() },
        { id: mkId(), role: 'assistant', text: helpMd, ts: Date.now() + 1 },
      ]);
      setInput('');
      return;
    }
    if (/^\/clear\b/i.test(trimmed.trim())) {
      setMessages([]);
      setInput('');
      return;
    }
    const cleanText = slash?.rest && slash.rest.length > 0 ? slash.rest : trimmed;
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
    const controller = new AbortController();
    abortRef.current = controller;

    // The swarm status panel tracks media pipelines (video/avatar/music).
    const isPipeline = service === 'video' || service === 'avatar' || service === 'music';
    const pipelineId = isPipeline ? `pl_${pendingId}` : null;
    if (pipelineId) {
      setActivePipelineId(pipelineId);
      publishPipeline('media.pipeline.initiated', pipelineId, { service });
    }

    try {
      const opts = { localeCode: localeCode as Locale };
      if (service === 'chat')         {
        const visionImg = attachment ? { base64: attachment.base64, mimeType: attachment.type } : undefined;
        await runChat(cleanText, messages, pendingId, setMessages, controller.signal, visionImg);
        if (attachment) setAttachment(null);
      }
      else if (service === 'image')   await runImage(cleanText, pendingId, setMessages, controller.signal, opts);
      else if (service === 'video')   await runVideo(cleanText, pendingId, setMessages, controller.signal, { ...opts, renderSettings });
      else if (service === 'music')   await runMusic(cleanText, pendingId, setMessages, controller.signal, opts);
      else if (service === 'voice')   await runVoice(cleanText, pendingId, setMessages, controller.signal, opts);
      else if (service === 'avatar')  {
        await runAvatar(cleanText, pendingId, setMessages, attachment?.base64, attachment?.type, controller.signal, opts);
        setAttachment(null);
      }
      else if (service === 'interior') await runInterior(cleanText, pendingId, setMessages, controller.signal, opts);
      else if (service === 'app')     await runApp(cleanText, pendingId, setMessages, controller.signal, opts);
      if (pipelineId) publishPipeline('pipeline.completed', pipelineId);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        // Suppressed — user clicked Stop. runChat handled the message already.
        if (pipelineId) publishPipeline('pipeline.failed', pipelineId, { reason: 'aborted' });
      } else {
        if (pipelineId) publishPipeline('pipeline.failed', pipelineId, { reason: 'error' });
        setMessages(m => m.map(x => x.id === pendingId
          ? { ...x, pending: false, text: localizedError(err, localeCode) }
          : x));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
      if (pipelineId) setTimeout(() => setActivePipelineId(cur => (cur === pipelineId ? null : cur)), 1500);
    }
  }, [mode, sending, messages, localeCode, attachment, renderSettings]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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

  // Central dispatch for orchestrator-generated SuggestedAction chips.
  // Inline-only: "Open in preview" scrolls the inline media into view.
  // The per-bubble click-to-lightbox in InlineMedia handles fullscreen.
  const onOpenInPreview = useCallback((m: ChatMessage) => {
    const node = document.querySelector(`[data-msg-id="${m.id}"]`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // The orchestrator decides WHAT to suggest; this handler decides HOW
  // to execute each canonical ActionKey against the existing chat state.
  const dispatchAction = useCallback((a: SuggestedAction) => {
    const payload = a.payload ?? {};
    switch (a.action) {
      case 'RUN_AGENT': {
        const agent = payload['agent'] as ServiceId | undefined;
        const prompt = String(payload['prompt'] ?? '');
        if (!prompt) return;
        void send(prompt, agent);
        return;
      }
      case 'RETRY_LAST': {
        // Find the last assistant message and resend its user prompt.
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if (m?.role === 'assistant' && !m.pending) {
            void send(messages[i - 1]?.text ?? '', m.service, m.id);
            return;
          }
        }
        return;
      }
      case 'STOP': {
        abortRef.current?.abort();
        return;
      }
      case 'OPEN_PREVIEW': {
        const id = String(payload['assetId'] ?? '');
        const target = messages.find(m => m.id === id);
        if (target) onOpenInPreview(target);
        return;
      }
      case 'DOWNLOAD': {
        const id = String(payload['assetId'] ?? '');
        const target = messages.find(m => m.id === id);
        const url = target?.media?.url;
        if (!url) return;
        const link = document.createElement('a');
        link.href = url;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      case 'SHARE': {
        const id = String(payload['assetId'] ?? '');
        const target = messages.find(m => m.id === id);
        const url = target?.media?.url;
        if (!url) return;
        if (typeof navigator.share === 'function') {
          void navigator.share({ url }).catch(() => undefined);
        } else {
          void navigator.clipboard.writeText(url).catch(() => undefined);
        }
        return;
      }
      case 'CLEAR': {
        setMessages([]);
        return;
      }
      case 'ADD_VIDEO_SEGMENT': {
        const prompt = String(payload['prompt'] ?? '');
        if (prompt) void send(prompt, 'video');
        return;
      }
      case 'ADD_MUSIC': {
        const prompt = String(payload['prompt'] ?? 'background music');
        void send(prompt, 'music');
        return;
      }
      case 'ADD_VOICEOVER': {
        const text = String(payload['text'] ?? '');
        if (text) void send(text, 'voice');
        return;
      }
      case 'ASSEMBLE_VIDEO':
      case 'REGEN_SEGMENT':
      case 'REMOVE_SEGMENT':
      case 'REORDER_SEGMENT':
      case 'SET_CAM_ZOOM_IN':
      case 'SET_CAM_ZOOM_OUT':
      case 'SET_CAM_PAN_LEFT':
      case 'SET_CAM_PAN_RIGHT':
      case 'SET_CAM_DOLLY':
      case 'EXPORT_SESSION':
        // Stubs — wired in a follow-up sprint once the video editor lands.
        return;
    }
  }, [messages, send, onOpenInPreview]);

  const hasMessages = messages.length > 0;

  return (
    <main
      className="fixed inset-0 z-[5] flex flex-col bg-black text-white antialiased overflow-hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', fontFamily: 'var(--font-geist, var(--font-ui, system-ui))' }}
    >
      {/* Pure pitch black — no background visuals per user spec */}

      {/* ── Chat column (full width mobile, 60% desktop) ─────────────────── */}
      <div className="relative flex flex-col flex-1 min-h-0 w-full">

      {/* ── TopBar ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
        <button
          type="button"
          aria-label="Menu"
          onClick={() => setDrawerOpen(true)}
          className="h-10 w-10 rounded-full bg-black border border-white/[0.10] hover:border-white/[0.22] flex items-center justify-center transition"
        >
          <Menu size={18} className="text-white" />
        </button>

        {activeView === 'chat' ? (
          <div className="flex items-center gap-1 bg-black border border-white/[0.10] rounded-full p-1">
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

        {/* Right side intentionally empty — account, status, settings, and
            auth all live in the left hamburger drawer now. Spacer keeps the
            centre toggle visually centred. */}
        <div className="h-10 w-10 flex-shrink-0" aria-hidden />
      </header>

      {/* All previews now render INLINE inside the message bubbles
          (InlineMedia + InlinePreviewOverlay). No side panel, no
          Chat/Preview tab — per the latest brief, the chat IS the
          preview surface. */}

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
                <EmptyState locale={localeCode} />
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
                      onOpenInPreview={() => onOpenInPreview(m)}
                    />
                  ))}
                  {!sending && messages.length > 0 && (() => {
                    const last = messages[messages.length - 1];
                    if (!last || last.role !== 'assistant' || last.pending) return null;
                    // Synthesize an orchestrator-shaped response so the same
                    // buildSuggestedActions() that powers the standalone
                    // orchestrator drives the chip row here too — single
                    // source of truth for "what next".
                    const userPrompt = messages[messages.length - 2]?.text ?? '';
                    const asset: AssetRef | undefined = last.media?.url
                      ? {
                          id: last.id,
                          kind: last.media.kind === 'code' ? 'code' : last.media.kind,
                          url: last.media.url,
                          html: last.media.html,
                          language: last.media.language,
                          poster: last.media.poster,
                          prompt: userPrompt,
                          createdAt: last.ts,
                        }
                      : last.media?.kind === 'code' && last.media.html
                        ? { id: last.id, kind: 'code', html: last.media.html, language: last.media.language, prompt: userPrompt, createdAt: last.ts }
                        : undefined;
                    const response: ServiceResponse = { ok: true, taskId: last.id, asset };
                    const ctx: PipelineContext = {
                      locale: localeCode,
                      assets: asset ? [asset] : [],
                      lastIntent: last.service,
                      notes: `last_user_prompt=${userPrompt.slice(0, 200)};`,
                    };
                    const actions = buildSuggestedActions(response, ctx);
                    return (
                      <SuggestedActionRow
                        actions={actions}
                        onDispatch={(a) => dispatchAction(a)}
                      />
                    );
                  })()}
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

      {/* ── Bottom input — only on chat view, and hidden when mobile previews are active */}
      {activeView === 'chat' && (
        <div className="relative z-10 flex-shrink-0 px-3 pb-3 pt-2 bg-black">
          {/* Live agentic-swarm progress — shown while a media pipeline runs */}
          {activePipelineId && (
            <div className="max-w-2xl mx-auto mb-2">
              <SwarmStatusPanel locale={localeCode} pipelineId={activePipelineId} />
            </div>
          )}
          {/* In-chat video render controls — settings fold into the render payload */}
          <div className="max-w-2xl mx-auto mb-2">
            <VideoControlSuite
              locale={localeCode}
              open={renderPanelOpen}
              onToggle={() => setRenderPanelOpen(v => !v)}
              settings={renderSettings}
              onChange={setRenderSettings}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PILLS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePill(p)}
                disabled={sending}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-black border border-white/[0.10] hover:border-white/[0.20] hover:bg-white/[0.04] disabled:opacity-50 transition text-[13px] font-medium text-white"
              >
                <p.icon size={14} className="text-white/85" />
                {localeCode === 'ka' ? p.label_ka : p.label_en}
              </button>
            ))}
          </div>

          <div className="rounded-3xl bg-black border border-white/[0.10] overflow-hidden focus-within:border-white/[0.22] transition">
            {attachment && (
              <div className="px-3 pt-3 -mb-1">
                <div className="inline-flex items-center gap-2 max-w-full pl-1 pr-2 py-1 rounded-full bg-white/[0.05] border border-white/[0.10] text-[11px] text-white/85">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={attachment.previewUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                  <span className="truncate max-w-[180px]">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={clearAttachment}
                    aria-label="Remove attachment"
                    className="h-5 w-5 rounded-full hover:bg-white/[0.10] flex items-center justify-center text-white/65 hover:text-white transition"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            )}
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onFileChosen}
            />
            <div className="flex items-center justify-between px-2 py-1.5">
              <button
                type="button"
                aria-label="Attach image"
                onClick={onPickFile}
                title={localeCode === 'ka' ? 'სურათის მიმაგრება (ავატარისთვის)' : 'Attach image (for Avatar)'}
                className="h-9 w-9 rounded-full hover:bg-white/[0.06] flex items-center justify-center text-[#94A3B8] hover:text-white transition"
              >
                <Paperclip size={16} />
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={listening ? 'Stop listening' : 'Voice input'}
                  onClick={toggleVoiceInput}
                  className={`h-9 w-9 rounded-full flex items-center justify-center transition ${
                    listening
                      ? 'bg-violet-500/20 text-violet-200 animate-pulse'
                      : 'hover:bg-white/[0.06] text-[#94A3B8]'
                  }`}
                >
                  <Mic size={16} />
                </button>
                {sending ? (
                  <button
                    type="button"
                    onClick={stopGeneration}
                    aria-label="Stop"
                    className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full font-semibold text-[13px] bg-rose-500/90 hover:bg-rose-500 text-white transition"
                  >
                    <span className="block h-2.5 w-2.5 bg-white rounded-[2px]" />
                    {localeCode === 'ka' ? 'შეჩერება' : 'Stop'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void send(input)}
                    disabled={!input.trim()}
                    className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-full font-semibold text-[13px] transition ${
                      input.trim()
                        ? 'bg-white text-black hover:bg-white/90'
                        : 'bg-black border border-white/[0.10] text-white/35 cursor-not-allowed'
                    }`}
                  >
                    <Send size={14} />
                    {localeCode === 'ka' ? 'გაგზავნა' : 'Send'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── /Chat column ─────────────────────────────────────────────────── */}
      </div>

      {/* Inline-only: the right preview canvas was removed per the
          Inline-Preview brief. Big-format viewing now happens via the
          message-bubble's inline media + click-to-lightbox flow. */}

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
              <nav className="flex-shrink-0 py-2 border-b border-white/[0.06]">
                {VIEW_ITEMS.map(item => {
                  const active = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => switchView(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition ${
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

              {/* Recent chats — localStorage-backed; persists across visits. */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/45">
                  {localeCode === 'ka' ? 'ბოლო ჩათები' : 'Recent chats'}
                </span>
                <button
                  type="button"
                  onClick={newSession}
                  title={localeCode === 'ka' ? 'ახალი ჩათი' : 'New chat'}
                  className="h-7 w-7 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-white/65 hover:text-white transition"
                  aria-label="New chat"
                >
                  +
                </button>
              </div>
              <div className="flex-1 overflow-y-auto pb-2">
                {sessions.length === 0 ? (
                  <div className="px-4 py-3 text-[11px] text-white/35">
                    {localeCode === 'ka' ? 'ჯერ არ გაქვს დაცული ჩათი' : 'No saved chats yet'}
                  </div>
                ) : sessions.map(s => {
                  const active = s.id === sessionId;
                  return (
                    <div
                      key={s.id}
                      className={`group flex items-center gap-2 px-3 mx-1 my-0.5 rounded-lg transition ${
                        active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => loadSession(s.id)}
                        className="flex-1 text-left py-2 min-w-0"
                      >
                        <div className={`text-[13px] truncate ${active ? 'text-white font-medium' : 'text-white/85'}`}>{s.title}</div>
                        <div className="text-[10px] text-white/35">{new Date(s.ts).toLocaleDateString()} · {s.messageCount}</div>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                        aria-label="Delete session"
                        className="h-7 w-7 rounded-full text-white/35 hover:text-rose-300 hover:bg-white/[0.06] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Account / status / settings / auth — everything that used
                  to live in the right drawer now lives here, pinned to the
                  bottom of the single left hamburger. */}
              <AccountSection
                locale={localeCode}
                userName={userName}
                isAuthenticated={isAuthenticated}
                onLogin={() => { setDrawerOpen(false); setAuthOpen(true); }}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* In-window auth (One Window) — login / register / reset / magic link */}
      <AuthModal
        open={authOpen}
        locale={localeCode}
        onClose={() => setAuthOpen(false)}
        onAuthed={() => { setAuthOpen(false); window.location.reload(); }}
      />
    </main>
  );
}

// ─── SuggestedActionRow — orchestrator-driven chip row below replies ─────────
// Renders the JSON contract from buildSuggestedActions() as a flex-wrap of
// tappable chips. Primary chips get the white-on-black emphasis treatment.

function SuggestedActionRow({ actions, onDispatch }: { actions: SuggestedAction[]; onDispatch: (a: SuggestedAction) => void }) {
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-1 pl-1">
      {actions.map(a => (
        <button
          key={`${a.action}-${a.label}`}
          type="button"
          onClick={() => onDispatch(a)}
          className={`inline-flex items-center px-3 py-1.5 rounded-full text-[12px] transition ${
            a.primary
              ? 'bg-white text-black font-semibold hover:bg-white/90'
              : 'bg-black border border-white/[0.10] text-white/85 font-medium hover:border-white/[0.22] hover:bg-white/[0.04]'
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ─── EmptyState — welcome + tappable example prompts (first-run UX) ──────────

function EmptyState({ locale }: { locale: 'ka' | 'en' | 'ru' }) {
  const welcome  = locale === 'ka' ? 'როგორ შემიძლია დაგეხმარო?' : locale === 'ru' ? 'Чем могу помочь?' : 'How can I help you?';
  const subtitle = locale === 'ka'
    ? 'აკრიფე ნებისმიერი — ყველაფერს ერთ ფანჯარაში ვქმნი.'
    : locale === 'ru'
      ? 'Напишите что угодно — всё создаю в одном окне.'
      : 'Type anything — I create everything in one window.';
  // Minimal, distraction-free centre. No template cards — the specialist
  // pills above the input bar are the discoverable entry points.
  return (
    <div className="h-full flex flex-col items-center justify-center px-4 text-center">
      <Sparkles size={32} className="text-white/40 mb-5" />
      <h2 className="text-[22px] font-semibold text-white mb-2 tracking-tight">{welcome}</h2>
      <p className="text-[13px] text-white/55 max-w-[320px] leading-relaxed">{subtitle}</p>
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
  onOpenInPreview: () => void;
}

function MessageRow({ m, locale, onLike, onDislike, onCopy, onRegenerate, onSpeak, onRemix, onOpenInPreview }: MessageRowProps) {
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
            <div className="max-w-[88%] px-1 text-white text-[15px] leading-relaxed break-words chat-md">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Render external links safely in a new tab.
                  a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:text-violet-200 underline-offset-4 hover:underline" />,
                  // Inline + block code styles.
                  code: ({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
                    if (inline) {
                      return <code className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[13px] font-mono text-violet-200" {...props}>{children}</code>;
                    }
                    return (
                      <pre className="my-2 rounded-xl bg-black border border-white/[0.10] p-3 overflow-x-auto text-[12px] leading-[1.55]">
                        <code className={`font-mono text-zinc-100 ${className ?? ''}`} {...props}>{children}</code>
                      </pre>
                    );
                  },
                  ul: ({ node: _n, ...props }) => <ul {...props} className="list-disc pl-5 space-y-1 my-2" />,
                  ol: ({ node: _n, ...props }) => <ol {...props} className="list-decimal pl-5 space-y-1 my-2" />,
                  p:  ({ node: _n, ...props }) => <p  {...props} className="whitespace-pre-wrap" />,
                  h1: ({ node: _n, ...props }) => <h1 {...props} className="text-[18px] font-semibold mt-3 mb-1.5" />,
                  h2: ({ node: _n, ...props }) => <h2 {...props} className="text-[16px] font-semibold mt-3 mb-1.5" />,
                  h3: ({ node: _n, ...props }) => <h3 {...props} className="text-[15px] font-semibold mt-2.5 mb-1" />,
                  table: ({ node: _n, ...props }) => <div className="overflow-x-auto my-2"><table {...props} className="text-[13px] border border-white/[0.10] rounded-md" /></div>,
                  th: ({ node: _n, ...props }) => <th {...props} className="px-2 py-1 border border-white/[0.08] bg-white/[0.04] text-left font-semibold" />,
                  td: ({ node: _n, ...props }) => <td {...props} className="px-2 py-1 border border-white/[0.06]" />,
                  blockquote: ({ node: _n, ...props }) => <blockquote {...props} className="border-l-2 border-violet-400/40 pl-3 my-2 text-white/75 italic" />,
                }}
              >
                {text}
              </ReactMarkdown>
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
              {/* Open this media in the dedicated preview canvas — bigger view + share/scrub */}
              <button
                type="button"
                onClick={onOpenInPreview}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200 transition"
              >
                {locale === 'ka' ? 'პრევიუში გახსნა →' : 'Open in preview →'}
              </button>
            </div>
          )}

          {/* Action row — anchored under the media (or under the text if none).
              Note: CapCut/edit lives inside the InlineMedia overlay, not here, to
              avoid two buttons for the same action. */}
          <div className="flex items-center gap-0.5 -mt-0.5 opacity-60 hover:opacity-100 transition">
            <ActionIcon title="Copy" onClick={onCopy}><Copy size={13} /></ActionIcon>
            <ActionIcon title="Regenerate" onClick={onRegenerate}><RotateCcw size={13} /></ActionIcon>
            <ActionIcon title="Speak" onClick={onSpeak}><Volume2 size={13} /></ActionIcon>
            <ActionIcon title="Like" onClick={onLike} active={m.liked}><ThumbsUp size={13} /></ActionIcon>
            <ActionIcon title="Dislike" onClick={onDislike} active={m.disliked}><ThumbsDown size={13} /></ActionIcon>
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
          {locale === 'ka' ? 'კვირეული გამოყენება — ბოლო 7 დღე' : locale === 'ru' ? 'Недельная активность — 7 дней' : 'Weekly Usage · last 7 days'}
        </h3>
        <WeeklyUsageChart data={data.messagesPerDay} locale={locale === 'ka' || locale === 'ru' ? locale : 'en'} />
      </section>
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

/**
 * AccountSection — pinned to the bottom of the single left hamburger drawer.
 * Consolidates everything that previously lived in the removed right drawer:
 * credits, live system status, language settings, auth (login / sign-out),
 * and the legal/support links.
 */
function AccountSection({
  locale,
  userName,
  isAuthenticated,
  onLogin,
}: {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
  onLogin: () => void;
}) {
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [providersReachable, setProvidersReachable] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);

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

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  type Bucket = 'ok' | 'degraded' | 'down' | 'unconfigured';
  type Category = 'chat' | 'image' | 'video' | 'music' | 'voice' | 'avatar';
  const [providerSnapshot, setProviderSnapshot] = useState<Record<Category, Bucket> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/health/public');
        if (!r.ok) { if (!cancelled) setProvidersReachable(false); return; }
        const j = await r.json() as { online?: boolean; categories?: Record<Category, Bucket> };
        if (cancelled) return;
        setProvidersReachable(j.online === true);
        if (j.categories) setProviderSnapshot(j.categories);
      } catch {
        if (!cancelled) setProvidersReachable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const statusOk = online && providersReachable !== false;

  const signOut = useCallback(async () => {
    try {
      const supabase = createBrowserClient();
      if (supabase) await supabase.auth.signOut();
    } catch { /* ignore */ }
    window.location.href = `/${locale}/login`;
  }, [locale]);

  const switchLocale = useCallback((next: 'ka' | 'en' | 'ru') => {
    if (next === locale) return;
    try { document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`; } catch { /* ignore */ }
    // Preserve the current path, swapping only the locale segment.
    const path = window.location.pathname.replace(/^\/(ka|en|ru)(?=\/|$)/, '') || '/dashboard';
    window.location.href = `/${next}${path}`;
  }, [locale]);

  const LOCALES: Array<{ id: 'ka' | 'en' | 'ru'; label: string }> = [
    { id: 'ka', label: 'ქარ' },
    { id: 'en', label: 'EN' },
    { id: 'ru', label: 'RU' },
  ];

  return (
    <div className="flex-shrink-0 border-t border-white/[0.08] bg-black">
      {/* Account header row — tap to expand status + settings */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition text-left"
      >
        <span className="h-8 w-8 rounded-full bg-white/[0.06] border border-white/[0.10] flex items-center justify-center flex-shrink-0">
          <UserIcon size={15} className="text-white/80" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] text-white font-medium truncate">
            {userName || (locale === 'ka' ? 'სტუმარი' : locale === 'ru' ? 'Гость' : 'Guest')}
          </span>
          <span className="block text-[11px] text-white/45">
            {creditsBalance != null
              ? `${creditsBalance.toLocaleString()} ${locale === 'ka' ? 'კრედიტი' : locale === 'ru' ? 'кредитов' : 'credits'}`
              : (locale === 'ka' ? 'ანგარიში' : locale === 'ru' ? 'Аккаунт' : 'Account')}
          </span>
        </span>
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${statusOk ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 max-h-[46vh] overflow-y-auto">
          {/* Live system status */}
          <section className="rounded-xl p-3 bg-white/[0.02] border border-white/[0.08]">
            <div className="text-[10px] font-bold tracking-wider uppercase text-[#94A3B8] mb-2">
              {locale === 'ka' ? 'სისტემის სტატუსი' : locale === 'ru' ? 'Состояние' : 'System Status'}
            </div>
            {!online ? (
              <div className="text-[12px] text-rose-300">
                {locale === 'ka' ? 'ინტერნეტი გათიშულია' : locale === 'ru' ? 'Нет сети' : 'You are offline'}
              </div>
            ) : providerSnapshot ? (
              <div className="grid grid-cols-2 gap-1.5">
                {(['chat','image','video','music','voice','avatar'] as Category[]).map(cat => {
                  const b = providerSnapshot[cat];
                  const dot = b === 'ok' ? 'bg-emerald-400' : b === 'down' ? 'bg-rose-400' : b === 'degraded' ? 'bg-amber-400' : 'bg-white/25';
                  const labels: Record<Category, [string, string]> = {
                    chat: ['ჩატი','Chat'], image: ['სურათი','Image'], video: ['ვიდეო','Video'],
                    music: ['მუსიკა','Music'], voice: ['ხმა','Voice'], avatar: ['ავატარი','Avatar'],
                  };
                  return (
                    <div key={cat} className="flex items-center gap-1.5 text-[12px] text-white/80">
                      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                      {locale === 'ka' ? labels[cat][0] : labels[cat][1]}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-white/55">{locale === 'ka' ? 'შემოწმება...' : 'Checking…'}</div>
            )}
          </section>

          {/* Settings — language */}
          <section className="rounded-xl p-3 bg-white/[0.02] border border-white/[0.08]">
            <div className="text-[10px] font-bold tracking-wider uppercase text-[#94A3B8] mb-2">
              {locale === 'ka' ? 'ენა' : locale === 'ru' ? 'Язык' : 'Language'}
            </div>
            <div className="flex gap-1.5">
              {LOCALES.map(l => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => switchLocale(l.id)}
                  className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition ${
                    l.id === locale ? 'bg-white text-black' : 'bg-black border border-white/[0.12] text-white/70 hover:border-white/[0.25]'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </section>

          {/* Auth */}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={signOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition text-left"
            >
              <LogOut size={15} className="text-rose-400" />
              <span className="text-[13px] text-rose-400 font-medium">{locale === 'ka' ? 'გასვლა' : locale === 'ru' ? 'Выйти' : 'Sign out'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white text-black text-[13px] font-semibold hover:bg-white/90 transition"
            >
              <UserIcon size={15} />
              {locale === 'ka' ? 'შესვლა' : locale === 'ru' ? 'Войти' : 'Log in'}
            </button>
          )}

          {/* Legal / support */}
          <div className="pt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/45">
            <a href={`/${locale}/support`} className="hover:text-white/80 transition">{locale === 'ka' ? 'მხარდაჭერა' : locale === 'ru' ? 'Поддержка' : 'Support'}</a>
            <span aria-hidden>·</span>
            <a href={`/${locale}/privacy`} className="hover:text-white/80 transition">{locale === 'ka' ? 'კონფიდენც.' : locale === 'ru' ? 'Приватность' : 'Privacy'}</a>
            <span aria-hidden>·</span>
            <a href={`/${locale}/terms`} className="hover:text-white/80 transition">{locale === 'ka' ? 'პირობები' : locale === 'ru' ? 'Условия' : 'Terms'}</a>
            <span aria-hidden>·</span>
            <a href={`/${locale}/refund-policy`} className="hover:text-white/80 transition">{locale === 'ka' ? 'დაბრუნება' : locale === 'ru' ? 'Возврат' : 'Refunds'}</a>
          </div>
        </div>
      )}
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

// ─── Shared runner helpers ───────────────────────────────────────────────────

type Locale = 'ka' | 'en' | 'ru';

/**
 * Map raw provider failures to a clear, localized message. The runner
 * catches an error, calls this, and surfaces the result instead of the
 * raw "fetch failed" / "500 internal server error" leakage.
 */
function localizedError(raw: unknown, locale: Locale): string {
  const m = (raw instanceof Error ? raw.message : String(raw ?? '')).toLowerCase();
  const t = (ka: string, en: string, ru: string) => locale === 'ka' ? ka : locale === 'ru' ? ru : en;
  if (m.includes('abort')) {
    return t('⏹ შეჩერდა', '⏹ Stopped', '⏹ Остановлено');
  }
  if (m.includes('timed out') || m.includes('timeout')) {
    return t('⏱ პროვაიდერი დროზე გადააცილებდა — სცადე თავიდან.', '⏱ Provider timed out — try again.', '⏱ Тайм-аут провайдера — попробуйте снова.');
  }
  if (m.includes('credit') || m.includes('quota') || m.includes('limit')) {
    return t('💳 კრედიტი ან კვოტა ამოიწურა. Billing-ში დაამატე და სცადე თავიდან.', '💳 Out of credits or quota. Top up in Billing and retry.', '💳 Закончились кредиты или квота. Пополните в Billing.');
  }
  if (m.includes('content policy') || m.includes('safety') || m.includes('moderation') || m.includes('nsfw')) {
    return t('🛡 პროვაიდერმა ეს ბრძანება უარყო პოლიტიკის გამო. სცადე ფრაზის შეცვლა.', '🛡 The provider refused this request under its safety policy. Try rephrasing.', '🛡 Провайдер отклонил запрос по политике безопасности. Перефразируйте.');
  }
  if (m.includes('5') && m.includes('failed')) {
    return t('⚠ პროვაიდერთან დროებითი პრობლემაა — სცადე თავიდან.', '⚠ Transient provider error — try again.', '⚠ Временная ошибка провайдера — попробуйте снова.');
  }
  if (m.includes('network') || m.includes('failed to fetch')) {
    return t('📡 ქსელის შეცდომა. შეამოწმე კავშირი.', '📡 Network error. Check your connection.', '📡 Сетевая ошибка. Проверьте подключение.');
  }
  // Fallback — surface the raw message but cap it.
  const cap = m.slice(0, 140);
  return t(`⚠ შეცდომა — ${cap}`, `⚠ Error — ${cap}`, `⚠ Ошибка — ${cap}`);
}

/**
 * fetch with an AbortController timeout + exponential-backoff retry on
 * transient 5xx and 429. Caller can pass their own signal — composed
 * with the inner timeout so either path aborts cleanly.
 *
 * Retry schedule: up to `maxAttempts` total attempts (default 3) with
 * `baseDelayMs * 2^(attempt-1)` between them, jittered ±25 %, capped
 * at 10 s per pause. Status codes the loop retries on: 408, 425,
 * 429, 500, 502, 503, 504. Other failures bail immediately.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: {
    timeoutMs?: number;
    retryOn5xx?: boolean;
    signal?: AbortSignal;
    maxAttempts?: number;
    baseDelayMs?: number;
  } = {},
): Promise<Response> {
  const {
    timeoutMs = 60_000,
    retryOn5xx = true,
    signal: outerSignal,
    maxAttempts = 3,
    baseDelayMs = 600,
  } = opts;
  const transient = new Set([408, 425, 429, 500, 502, 503, 504]);
  const attempt = async (): Promise<Response> => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(new DOMException('timeout', 'AbortError')), timeoutMs);
    const onOuter = () => ctl.abort(outerSignal?.reason);
    if (outerSignal) {
      if (outerSignal.aborted) ctl.abort(outerSignal.reason);
      else outerSignal.addEventListener('abort', onOuter, { once: true });
    }
    try {
      return await fetch(url, { ...init, signal: ctl.signal });
    } finally {
      clearTimeout(t);
      outerSignal?.removeEventListener('abort', onOuter);
    }
  };
  let res: Response | null = null;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      res = await attempt();
    } catch (e) {
      // Outer abort → propagate. Timeout / network → retry if budget left.
      if (outerSignal?.aborted) throw e;
      if (i === maxAttempts) throw e;
    }
    if (res && (!retryOn5xx || !transient.has(res.status))) return res;
    if (i === maxAttempts) break;
    if (outerSignal?.aborted) break;
    const delay = Math.min(10_000, baseDelayMs * 2 ** (i - 1));
    const jittered = delay * (0.75 + Math.random() * 0.5);
    await new Promise(r => setTimeout(r, jittered));
  }
  // Last response (still transient) returned to the caller for normal handling.
  return res as Response;
}

/** Update the pending message's text in place — used for progress ticks. */
function tickPending(setMessages: Setter, pendingId: string, text: string) {
  setMessages(m => m.map(x => x.id === pendingId ? { ...x, text } : x));
}

// ─── Specialist runners — one per agent ──────────────────────────────────────

async function runChat(text: string, history: ChatMessage[], pendingId: string, setMessages: Setter, signal?: AbortSignal, image?: { base64: string; mimeType: string }) {
  const trimmed = history.filter(m => !m.pending).slice(-20).map(m => ({ role: m.role, content: m.text }));
  const lastMessage = image
    ? {
        role: 'user',
        content: [
          { type: 'text', text },
          { type: 'image', image: `data:${image.mimeType};base64,${image.base64}`, mimeType: image.mimeType },
        ],
      }
    : { role: 'user', content: text };

  // Chat is its own streaming SSE; we cannot use fetchWithRetry (which would
  // consume the whole body). Instead: wrap fetch in an outer AbortController
  // that fires if the stream goes idle for >25 s — that's the "Stream idle
  // timeout" the user was seeing in the wild.
  const idleAbort = new AbortController();
  const combined = new AbortController();
  const onOuter = () => combined.abort(signal?.reason);
  signal?.addEventListener('abort', onOuter, { once: true });
  const onIdle = () => combined.abort(new DOMException('idle', 'AbortError'));
  idleAbort.signal.addEventListener('abort', onIdle, { once: true });
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const kickIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => idleAbort.abort(), 25_000);
  };

  // Manual retry loop — exponential backoff on 5xx / 429 / network error
  // BEFORE the stream starts. Once streaming has begun we never retry
  // (the model has already produced text that would be lost).
  let res: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      kickIdle();
      res = await fetch('/api/chat/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...trimmed, lastMessage] }),
        signal: combined.signal,
      });
      if (res.ok) break;
      // Transient → retry. Non-transient (400 / 401 / 413) → bail.
      const transient = new Set([408, 425, 429, 500, 502, 503, 504]);
      if (!transient.has(res.status)) break;
    } catch (e) {
      lastErr = e;
      if ((e as Error)?.name === 'AbortError') break;
    }
    if (attempt < 3 && !combined.signal.aborted) {
      const delay = Math.min(10_000, 600 * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  if (idleTimer) clearTimeout(idleTimer);
  if (!res || !res.ok || !res.body) {
    if (lastErr && (lastErr as Error)?.name === 'AbortError') throw lastErr;
    // Surface the server's body when present — much more useful than "Chat failed".
    let detail = '';
    try { detail = res ? (await res.text()).slice(0, 200) : ''; } catch { /* ignore */ }
    throw new Error(res ? `Chat failed (${res.status}) ${detail}`.trim() : 'Chat failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = '', buffer = '';
  try {
    kickIdle();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      kickIdle();
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
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      // Whether it's the user clicking Stop or the idle watchdog firing,
      // surface whatever streamed so far instead of throwing away the work.
      setMessages(m => m.map(x => x.id === pendingId ? { ...x, pending: false, text: acc || '⏹ შეჩერდა' } : x));
      return;
    }
    throw e;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    signal?.removeEventListener('abort', onOuter);
  }
  if (!acc) throw new Error('Empty response');
}

function detectImageRatio(prompt: string): '1:1' | '16:9' | '9:16' | '4:3' | '3:4' {
  const p = prompt.toLowerCase();
  // Portrait cues (KA + EN + RU)
  if (/\b(portrait|პორტრე|портре|person|face|სახე|лицо|tall|vertical|story|reels?|tiktok|9:16)\b/.test(p)) return '9:16';
  // Square cues (Instagram square, profile pic, logo, icon, avatar headshot)
  if (/\b(square|1:1|logo|icon|profile pic|avatar|ლოგო|იკონ|логотип|иконк|квадрат)\b/.test(p)) return '1:1';
  // Classic 4:3 / 3:4
  if (/\b(4:3)\b/.test(p)) return '4:3';
  if (/\b(3:4)\b/.test(p)) return '3:4';
  // Default → 16:9 cinematic landscape
  return '16:9';
}

async function runImage(prompt: string, pendingId: string, setMessages: Setter, signal?: AbortSignal, opts?: { localeCode?: Locale }) {
  const locale: Locale = opts?.localeCode ?? 'ka';
  const ratio = detectImageRatio(prompt);
  const res = await fetchWithRetry('/api/replicate/image', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, quality: 'standard', ratio }),
  }, { signal, timeoutMs: 60_000 });
  if (!res.ok) throw new Error(`Image failed (${res.status})`);
  const data = await res.json() as { url?: string; imageUrl?: string; output?: string[]; predictionId?: string; error?: string };
  let url = data?.url || data?.imageUrl || data?.output?.[0];
  // If a predictionId came back, the generation isn't done — poll briefly
  if (!url && data?.predictionId) {
    for (let i = 0; i < 18; i++) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      await new Promise(r => setTimeout(r, 2000));
      const elapsed = (i + 1) * 2;
      tickPending(setMessages, pendingId, locale === 'ka'
        ? `ვქმნი სურათს · ${elapsed}წ`
        : locale === 'ru' ? `Генерирую изображение · ${elapsed}с` : `Generating image · ${elapsed}s`);
      const poll = await fetchWithRetry('/api/replicate/image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictionId: data.predictionId }),
      }, { signal, timeoutMs: 30_000, retryOn5xx: false });
      if (!poll.ok) continue;
      const pd = await poll.json() as { url?: string; status?: string; output?: string[]; error?: string };
      const u = pd.url || pd.output?.[0];
      if (u) { url = u; break; }
      if (pd.status === 'failed') throw new Error(pd.error || 'Image generation failed');
    }
  }
  if (!url) throw new Error(data?.error || 'Image generation failed');
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'image', url } });
}

function detectVideoAspect(prompt: string): '16:9' | '9:16' | '1:1' {
  const p = prompt.toLowerCase();
  if (/\b(portrait|vertical|story|reels?|tiktok|9:16|პორტრე|вертикал|сторис)\b/.test(p)) return '9:16';
  if (/\b(square|1:1|ig|instagram|კვადრ|квадрат)\b/.test(p)) return '1:1';
  return '16:9';
}

async function runVideo(prompt: string, pendingId: string, setMessages: Setter, signal?: AbortSignal, opts?: { localeCode?: Locale; renderSettings?: RenderSettings }) {
  const locale: Locale = opts?.localeCode ?? 'ka';
  const aspect_ratio = detectVideoAspect(prompt);
  // Render settings (transition / caption theme / ducking / fps) flow as
  // plain JSON into the payload — folded for the CapCut render agent.
  const render = opts?.renderSettings ? renderSettingsToPayload(opts.renderSettings) : undefined;
  // LTX generation is async on the server (5-15s). Provide reassuring tick so
  // the user doesn't think the UI froze.
  let alive = true;
  let elapsed = 0;
  const tick = setInterval(() => {
    if (!alive) return;
    elapsed += 2;
    tickPending(setMessages, pendingId, locale === 'ka'
      ? `ვქმნი ვიდეოს · ${elapsed}წ`
      : locale === 'ru' ? `Генерирую видео · ${elapsed}с` : `Generating video · ${elapsed}s`);
  }, 2000);
  try {
    const res = await fetchWithRetry('/api/ltx-video', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, aspect_ratio, duration: 6, ...(render ? { render } : {}) }),
    }, { signal, timeoutMs: 120_000 });
    if (!res.ok) {
      // Surface server's error body if present
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      throw new Error(`Video failed (${res.status}) ${detail}`.trim());
    }
    const blob = await res.blob();
    if (blob.size === 0) throw new Error('Empty video');
    const url = URL.createObjectURL(blob);
    patchMessage(setMessages, pendingId, { text: '', media: { kind: 'video', url } });
  } finally {
    alive = false;
    clearInterval(tick);
  }
}

function detectInstrumental(prompt: string): boolean {
  return /\b(instrumental|no\s*vocals?|no\s*lyrics|background|ფონ|без\s*вокал|инструментал|საფონო)\b/i.test(prompt);
}

async function runMusic(prompt: string, pendingId: string, setMessages: Setter, signal?: AbortSignal, opts?: { localeCode?: Locale }) {
  const locale: Locale = opts?.localeCode ?? 'ka';
  let alive = true;
  let elapsed = 0;
  const tick = setInterval(() => {
    if (!alive) return;
    elapsed += 3;
    tickPending(setMessages, pendingId, locale === 'ka'
      ? `ვქმნი მუსიკას · ${elapsed}წ`
      : locale === 'ru' ? `Создаю музыку · ${elapsed}с` : `Composing music · ${elapsed}s`);
  }, 3000);
  try {
    const res = await fetchWithRetry('/api/udio/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, make_instrumental: detectInstrumental(prompt) }),
    }, { signal, timeoutMs: 120_000 });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      throw new Error(`Music failed (${res.status}) ${detail}`.trim());
    }
    const data = await res.json() as { url?: string; audioUrl?: string; error?: string };
    const url = data?.url || data?.audioUrl;
    if (!url) throw new Error(data?.error || 'Music generation failed');
    patchMessage(setMessages, pendingId, { text: '', media: { kind: 'audio', url } });
  } finally {
    alive = false;
    clearInterval(tick);
  }
}

async function runVoice(text: string, pendingId: string, setMessages: Setter, signal?: AbortSignal, opts?: { localeCode?: Locale }) {
  const locale: Locale = opts?.localeCode ?? 'ka';
  const res = await fetchWithRetry('/api/elevenlabs/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, locale }),
  }, { signal, timeoutMs: 60_000 });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new Error(`Voice failed (${res.status}) ${detail}`.trim());
  }
  const blob = await res.blob();
  if (blob.size === 0) throw new Error('Empty voice clip');
  const url = URL.createObjectURL(blob);
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'audio', url } });
}

async function runAvatar(
  script: string,
  pendingId: string,
  setMessages: Setter,
  photoBase64?: string,
  photoMimeType?: string,
  signal?: AbortSignal,
  opts?: { localeCode?: Locale },
) {
  const locale: Locale = opts?.localeCode ?? 'ka';
  const start = await fetchWithRetry('/api/heygen/avatar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(photoBase64 ? { script, photoBase64, photoMimeType } : { script }),
  }, { signal, timeoutMs: 60_000 });
  if (!start.ok) {
    let detail = '';
    try { detail = (await start.text()).slice(0, 200); } catch { /* ignore */ }
    throw new Error(`Avatar start failed (${start.status}) ${detail}`.trim());
  }
  const startData = await start.json() as { videoId?: string; error?: string };
  if (!startData.videoId) throw new Error(startData.error || 'Avatar failed');

  // HeyGen avatar generation often takes 2–4 minutes for short scripts.
  // 60×5s=300s polling budget. Tick the pending message so the user sees
  // visible progress instead of guessing whether the request died.
  let videoUrl: string | null = null;
  let posterUrl: string | null = null;
  for (let i = 0; i < 60; i++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    await new Promise(r => setTimeout(r, 5000));
    const elapsed = (i + 1) * 5;
    tickPending(setMessages, pendingId, locale === 'ka'
      ? `ვქმნი ავატარს · ${elapsed}წ (≤ 5წთ)`
      : locale === 'ru' ? `Создаю аватара · ${elapsed}с (≤ 5 мин)` : `Generating avatar · ${elapsed}s (≤ 5 min)`);
    const poll = await fetchWithRetry(`/api/heygen/avatar?videoId=${encodeURIComponent(startData.videoId)}`,
      { method: 'GET' },
      { signal, timeoutMs: 20_000, retryOn5xx: false });
    if (!poll.ok) continue;
    const pd = await poll.json() as { status?: string; url?: string; thumbnail?: string; error?: string };
    if (pd.status === 'completed' && pd.url) {
      videoUrl = pd.url;
      posterUrl = pd.thumbnail ?? null;
      break;
    }
    if (pd.status === 'failed') throw new Error(pd.error || 'Avatar failed');
  }
  if (!videoUrl) throw new Error('timeout');
  patchMessage(setMessages, pendingId, {
    text: '',
    media: { kind: 'video', url: videoUrl, ...(posterUrl ? { poster: posterUrl } : {}) },
  });
}

async function runInterior(prompt: string, pendingId: string, setMessages: Setter, signal?: AbortSignal, opts?: { localeCode?: Locale }) {
  const augmented = `interior design render, ${prompt}, architectural photography, professional lighting, ultra detailed, 4k, photorealistic`;
  await runImage(augmented, pendingId, setMessages, signal, opts);
}

async function runApp(prompt: string, pendingId: string, setMessages: Setter, signal?: AbortSignal, opts?: { localeCode?: Locale }) {
  const locale: Locale = opts?.localeCode ?? 'ka';
  // App Builder uses Anthropic Claude (better at self-contained HTML/CSS/JS
  // than Gemini). Endpoint streams plain text (no SSE framing) so we just
  // concatenate the body chunks. We stream-update the pending message so
  // the user sees building progress.
  const res = await fetchWithRetry('/api/chat/claude', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  }, { signal, timeoutMs: 120_000 });
  if (!res.ok || !res.body) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new Error(`App build failed (${res.status}) ${detail}`.trim());
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += decoder.decode(value, { stream: true });
      // Live progress: surface character count to user.
      const kb = (acc.length / 1024).toFixed(1);
      tickPending(setMessages, pendingId, locale === 'ka'
        ? `ვაშენებ აპლიკაციას · ${kb} KB`
        : locale === 'ru' ? `Собираю приложение · ${kb} KB` : `Building app · ${kb} KB`);
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      // Promote whatever we have if it looks complete-ish; otherwise surface stop.
      const partial = acc.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      if (partial.length > 200 && partial.includes('</')) {
        patchMessage(setMessages, pendingId, { text: '', media: { kind: 'code', html: partial, language: 'html' } });
        return;
      }
      throw e;
    }
    throw e;
  }
  const html = acc.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (!html) throw new Error('Empty HTML');
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'code', html, language: 'html' } });
}
