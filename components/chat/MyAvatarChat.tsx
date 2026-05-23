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
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Menu,
  User as UserIcon,
  Mic,
  Camera,
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
  Check,
  Zap,
  Crown,
  ExternalLink,
  Square,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import InlineMedia, { detectInlineMedia } from '@/components/dashboard/command-center/InlineMedia';
import AuthModal from '@/components/chat/AuthModal';
import VideoControlSuite from '@/components/chat/VideoControlSuite';
import { type RenderSettings, renderSettingsToPayload } from '@/lib/orchestrator/render-settings';
import { useRenderSettings } from '@/hooks/useRenderSettings';
import SwarmStatusPanel from '@/components/chat/SwarmStatusPanel';
import type { RoomGeometry, StyleGuide } from '@/lib/orchestrator/interior';
import { CameraModal } from '@/components/service-chat/CameraModal';

// R3F is client-only + heavy — load the 3D room viewer on demand (no SSR).
const RoomViewer = dynamic(() => import('@/components/chat/RoomViewer'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: 320, borderRadius: 14, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.10)' }} className="inline-media-skel" aria-busy="true" />
  ),
});
import type { ServiceChatAttachment } from '@/components/service-chat/types';
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

// Truthful per-asset render metadata — populated by the runner from the exact
// parameters the generation actually used (never fabricated). Drives the dynamic
// meta-chips in InlineMedia.
interface RenderMeta {
  fps?: number;
  resolution?: string;     // e.g. "1920x1080"
  aspectRatio?: string;    // e.g. "16:9"
  duckingPct?: number;     // 0–100, music attenuation under vocals
  voiceProvider?: string;  // e.g. "ElevenLabs"
  engine?: string;         // producing engine, e.g. "LTX-2"
}

interface MediaPayload {
  kind: 'image' | 'video' | 'audio' | 'code' | 'room';
  url?: string;
  /** Interior service: extracted geometry + style → inline Three.js RoomViewer. */
  room?: { geometry: RoomGeometry; style?: StyleGuide };
  html?: string;
  language?: string;
  poster?: string;        // Optional thumbnail/poster for video — used by VideoBlock
                          // to render a clear preview frame BEFORE the video reaches
                          // canplay (avoids the "invisible black frame" bug where
                          // HeyGen videos load silently with a pitch-black first frame
                          // on a pitch-black background).
  meta?: RenderMeta;      // truthful render parameters → InlineMedia meta-chips
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  pending?: boolean;
  service?: ServiceId;
  media?: MediaPayload;
  /** Data URL of an image the USER attached — rendered inline in their bubble. */
  userImage?: string;
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

// ─── Local-QA hard bypass ─────────────────────────────────────────────────────
// In `next dev` ONLY (statically inlined by Next at build time, so it compiles
// out of the production bundle), every client-side auth gate is decoupled and a
// null session is swapped for a deterministic QA profile — so Produce Film /
// AI Avatar / Design Room 3D / mic are immediately operational with zero
// friction. This NEVER affects production (NODE_ENV !== 'development' there).
const DEV_BYPASS = process.env.NODE_ENV === 'development';
const QA_PROFILE_NAME = 'Giorgi-QA-Session';

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

// Force-download a media asset. For same-origin / CORS-friendly URLs the
// `download` attribute names the file; cross-origin falls back to opening it.
function downloadAsset(url: string | undefined, name = 'myavatar-media') {
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ─── Reload recovery (#5) ─────────────────────────────────────────────────────
// A produce run persists to `generation_jobs` (row id == SSE pipelineId). The
// SSE itself streams over an unreplayable POST body, so the durable row IS the
// recovery channel: on mount the chat queries the user's recent jobs, re-renders
// any that finished while away, and resumes polling any still in-flight.

type JobServiceType = 'film' | 'avatar' | 'interior' | 'image' | 'music' | 'voice';

interface RecoveredJob {
  id: string;
  service_type: JobServiceType;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  current_stage: string | null;
  pct: number;
  result: Record<string, unknown> | null;
  signed_url: string | null;
  error: string | null;
  updated_at: string;
}

const JOB_SERVICE_TO_ID: Record<JobServiceType, ServiceId> = {
  film: 'video', avatar: 'avatar', interior: 'interior', image: 'image', music: 'music', voice: 'voice',
};

/** Reconstruct the inline MediaPayload from a completed job's stored result. */
function jobResultToMedia(serviceType: JobServiceType, result: Record<string, unknown> | null, signedUrl: string | null): MediaPayload | null {
  const url = (typeof result?.url === 'string' ? result.url : null) ?? signedUrl ?? undefined;
  switch (serviceType) {
    case 'film':
      return url ? { kind: 'video', url, meta: { engine: 'MyAvatar Swarm', fps: 24, aspectRatio: '16:9' } } : null;
    case 'avatar': {
      const poster = typeof result?.poster === 'string' ? result.poster : undefined;
      return url ? { kind: 'video', url, ...(poster ? { poster } : {}), meta: { engine: 'HeyGen' } } : null;
    }
    case 'image': {
      const ratio = typeof result?.ratio === 'string' ? result.ratio : undefined;
      return url ? { kind: 'image', url, meta: { engine: 'AI Image', ...(ratio ? { aspectRatio: ratio } : {}) } } : null;
    }
    case 'music':
      return url ? { kind: 'audio', url, meta: { engine: 'Udio' } } : null;
    case 'voice':
      return url ? { kind: 'audio', url, meta: { engine: 'ElevenLabs', voiceProvider: 'ElevenLabs' } } : null;
    case 'interior': {
      const geometry = result?.geometry as RoomGeometry | undefined;
      if (!geometry) return null;
      const style = result?.style as StyleGuide | undefined;
      return { kind: 'room', room: { geometry, ...(style ? { style } : {}) } };
    }
    default:
      return null;
  }
}

/** Localized "resuming your <service>…" ticker for an in-flight recovered job. */
function recoveryResumeLabel(job: RecoveredJob, locale: Locale): string {
  const svc = serviceLabel(JOB_SERVICE_TO_ID[job.service_type], locale);
  const pct = job.pct > 0 ? ` · ${job.pct}%` : '';
  return locale === 'ka' ? `⏳ ვაგრძელებ თქვენს ${svc}-ს${pct}…`
    : locale === 'ru' ? `⏳ Возобновляю ваш ${svc}${pct}…`
      : `⏳ Resuming your ${svc}${pct}…`;
}

function recoveryFailedLabel(locale: Locale): string {
  return locale === 'ka' ? '⚠ წინა გენერაცია ვერ დასრულდა — სცადე თავიდან.'
    : locale === 'ru' ? '⚠ Предыдущая генерация не завершилась — попробуйте снова.'
      : '⚠ A previous generation didn’t finish — please try again.';
}

/** Only auto-surface terminal jobs that finished recently (avoid dumping history). */
const RECOVERY_RECENT_MS = 30 * 60 * 1000;

export default function MyAvatarChat({ locale, userName, isAuthenticated }: MyAvatarChatProps) {
  const localeCode = (locale === 'ka' || locale === 'en' || locale === 'ru') ? locale : 'ka';
  // Local-QA bypass: treat the session as authed and surface a deterministic
  // mock profile so every produce action is unlocked under `next dev` only.
  const effectiveAuth = isAuthenticated || DEV_BYPASS;
  const effectiveUserName = isAuthenticated ? userName : (DEV_BYPASS ? QA_PROFILE_NAME : userName);
  const [activeView, setActiveView] = useState<ViewId>('chat');
  // Ask/Imagine toggle removed — intent is resolved from keywords, pills,
  // and slash commands. Mode is fixed to 'ask' (the broad-routing default).
  const mode: Mode = 'ask';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [renderSettings, setRenderSettings] = useRenderSettings();
  const [renderPanelOpen, setRenderPanelOpen] = useState(false);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [producing, setProducing] = useState(false);
  const [produceStage, setProduceStage] = useState<string>('');
  const [producePct, setProducePct] = useState(0);
  const [produceDetail, setProduceDetail] = useState('');
  // (Removed: latestMedia + mobileView — previews are now inline-only.)
  const [attachment, setAttachment] = useState<{ name: string; type: string; base64: string; previewUrl: string } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Lets the user cancel an in-flight produce pipeline (Film/Avatar/Interior/
  // Image-Music-Voice) — those flows stream over a long-lived fetch.
  const produceAbortRef = useRef<AbortController | null>(null);

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
  // True while the user intends to keep dictating — drives the seamless
  // auto-restart of continuous SpeechRecognition (Chrome ends sessions on
  // silence; we restart until the user manually stops).
  const srWantRef = useRef(false);

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

  // ── Reload recovery (#5): on mount, re-hydrate finished produce jobs and
  //    resume any still in-flight. The durable `generation_jobs` row is the
  //    recovery channel (produce SSE streams over an unreplayable POST body).
  const recoveredSeenRef = useRef<Set<string>>(new Set());
  const recoveredDoneRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    let added = 0;
    let firstPollDone = false;

    const applyJob = (job: RecoveredJob) => {
      const active = job.status === 'pending' || job.status === 'processing';
      const recent = Date.now() - new Date(job.updated_at).getTime() < RECOVERY_RECENT_MS;
      const seen = recoveredSeenRef.current.has(job.id);
      const done = recoveredDoneRef.current.has(job.id);

      if (!seen) {
        // First sighting. Surface in-flight jobs always; terminal jobs only if recent.
        if (active) {
          if (added >= 6) return;
          added++;
          recoveredSeenRef.current.add(job.id);
          setMessages(m => m.some(x => x.id === job.id) ? m : [...m, {
            id: job.id, role: 'assistant', text: recoveryResumeLabel(job, localeCode),
            pending: true, service: JOB_SERVICE_TO_ID[job.service_type], ts: Date.now(),
          }]);
        } else if (job.status === 'completed' && recent) {
          const media = jobResultToMedia(job.service_type, job.result, job.signed_url);
          if (!media) return;
          if (added >= 6) return;
          added++;
          recoveredSeenRef.current.add(job.id);
          recoveredDoneRef.current.add(job.id);
          setMessages(m => m.some(x => x.id === job.id) ? m : [...m, {
            id: job.id, role: 'assistant', text: '', media,
            service: JOB_SERVICE_TO_ID[job.service_type], ts: Date.now(),
          }]);
        }
        return;
      }

      // Already surfaced as an in-flight card → drive it to its terminal state.
      if (done) return;
      if (job.status === 'completed') {
        const media = jobResultToMedia(job.service_type, job.result, job.signed_url);
        recoveredDoneRef.current.add(job.id);
        if (media) patchMessage(setMessages, job.id, { text: '', media });
        else patchMessage(setMessages, job.id, { pending: false, text: recoveryFailedLabel(localeCode) });
      } else if (job.status === 'failed') {
        recoveredDoneRef.current.add(job.id);
        patchMessage(setMessages, job.id, { pending: false, text: recoveryFailedLabel(localeCode) });
      } else {
        // Still running → refresh the ticker (progress %).
        tickPending(setMessages, job.id, recoveryResumeLabel(job, localeCode));
      }
    };

    const inFlightRemaining = () =>
      [...recoveredSeenRef.current].some(id => !recoveredDoneRef.current.has(id));

    const poll = async () => {
      try {
        const res = await fetch('/api/orchestrator/jobs?limit=20', { cache: 'no-store', credentials: 'include' });
        if (!res.ok || cancelled) return;
        const { jobs } = await res.json() as { jobs?: RecoveredJob[] };
        if (cancelled || !Array.isArray(jobs)) return;
        // Oldest-first so recovered cards land in chronological order.
        for (const job of [...jobs].reverse()) applyJob(job);
      } catch { /* ignore */ } finally { firstPollDone = true; }
    };

    void poll();
    const iv = setInterval(() => {
      if (cancelled) return;
      if (!firstPollDone || inFlightRemaining()) void poll();
      else clearInterval(iv);
    }, 4000);
    const stop = setTimeout(() => clearInterval(iv), 8 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); clearTimeout(stop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

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

  // Fluid auto-grow without layout shift: measure in a rAF (after paint), clamp
  // to the 140px ceiling (textarea then scrolls internally), and reset cleanly
  // to the single-row baseline when emptied so the toolbar never jumps.
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    const raf = requestAnimationFrame(() => {
      try {
        ta.style.height = 'auto';
        ta.style.height = input ? `${Math.min(ta.scrollHeight, 140)}px` : '24px';
      } catch { /* ignore measurement edge cases */ }
    });
    return () => cancelAnimationFrame(raf);
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
  // Single ingest path shared by the file picker AND drag-and-drop. Image-only:
  // the vision/avatar runners are the only consumers of an attachment, so we
  // reject non-images up front rather than appending a payload nothing reads.
  const ingestImageFile = useCallback((f: File | undefined | null) => {
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
  const onFileChosen = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    ingestImageFile(f);
  }, [ingestImageFile]);
  const onDropFiles = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    ingestImageFile(e.dataTransfer?.files?.[0]);
  }, [ingestImageFile]);
  const onDragOverInput = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);
  const onDragLeaveInput = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);
  const clearAttachment = useCallback(() => setAttachment(null), []);

  // Defensive camera launch — guard the hardware-capability probe so a missing
  // mediaDevices API surfaces an elegant notice instead of an empty black modal.
  const openCamera = useCallback(() => {
    try {
      if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
        setPermissionNotice(cameraUnavailableMessage(localeCode));
        return;
      }
      setPermissionNotice(null);
      setCameraOpen(true);
    } catch {
      setPermissionNotice(cameraUnavailableMessage(localeCode));
    }
  }, [localeCode]);

  // Camera capture → chat attachment. CameraModal hands back a blob: URL; we
  // read it into a base64 data URL so it (a) matches the vision/avatar payload
  // contract and (b) survives a page reload via the localStorage recovery above
  // (blob: URLs do not). Only still photos feed the attachment — captured video
  // has no consuming runner yet, so it's ignored rather than silently broken.
  const onCameraAttach = useCallback(async (att: ServiceChatAttachment) => {
    setCameraOpen(false);
    if (att.type !== 'image' || !att.dataUrl) return;
    try {
      const blob = await (await fetch(att.dataUrl)).blob();
      if (blob.size > 8 * 1024 * 1024) return; // 8 MB cap, matches file picker
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? '');
        const base64 = result.includes(',') ? result.split(',')[1] ?? '' : result;
        setAttachment({ name: att.name, type: att.mimeType || 'image/jpeg', base64, previewUrl: result });
      };
      reader.readAsDataURL(blob);
    } catch { /* capture dropped — user can retry */ }
  }, []);

  const toggleVoiceInput = useCallback(async () => {
    type SRAlt = { transcript: string };
    type SRResult = ArrayLike<SRAlt> & { isFinal: boolean };
    type SpeechRecognitionLike = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: ((e: { resultIndex: number; results: ArrayLike<SRResult> }) => void) | null;
      onend: (() => void) | null;
      onerror: ((e: { error?: string }) => void) | null;
      start: () => void;
      stop: () => void;
    };
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SRCtor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    const lang = localeCode === 'ka' ? 'ka-GE' : localeCode === 'ru' ? 'ru-RU' : 'en-US';

    // STOP path (works for either backend). Clear intent first so the
    // self-restart guard in onend does NOT relaunch the session.
    if (listening) {
      srWantRef.current = false;
      const ref = recognitionRef.current as { stop?: () => void } | null;
      try { ref?.stop?.(); } catch { /* ignore */ }
      setListening(false);
      return;
    }

    // Backend A: Web Speech API (Chrome, Edge, Safari macOS 14+ partial).
    // interimResults streams partial tokens so the user watches their speech
    // turn into text in real time; continuous keeps the mic hot until they stop.
    if (SRCtor) {
      // Production-hardened continuous dictation: each session re-reads the
      // current input as its base, so a seamless auto-restart on `onend`
      // (Chrome stops on silence) never loses already-committed transcript.
      // A fast-fail guard prevents a runaway restart loop when the engine ends
      // immediately (no audio device / mic thrash): normal silence-gap restarts
      // run for >1.2s and reset the counter; ≥4 consecutive sub-1.2s sessions
      // back off and stop instead of spinning.
      let lastStartTs = 0;
      let fastFails = 0;
      const startSR = () => {
        try {
          const rec = new SRCtor();
          rec.lang = lang;
          rec.continuous = true;
          rec.interimResults = true;
          const base = (inputRef.current?.value ?? '').trim();
          let finalText = '';
          rec.onresult = (e) => {
            fastFails = 0; // real audio captured → not a thrash loop
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const seg = e.results[i];
              const txt = seg?.[0]?.transcript ?? '';
              if (seg?.isFinal) finalText += txt;
              else interim += txt;
            }
            const live = `${finalText}${interim}`.trim();
            setInput(base ? (live ? `${base} ${live}` : base) : live);
          };
          rec.onend = () => {
            if (!srWantRef.current) { setListening(false); return; }
            // Track runaway thrash: sub-1.2s sessions are "fast fails".
            fastFails = (Date.now() - lastStartTs < 1200) ? fastFails + 1 : 0;
            if (fastFails >= 4) { srWantRef.current = false; setListening(false); return; }
            // Restart seamlessly; tiny backoff after a fast-fail to avoid a tight loop.
            const delay = fastFails > 0 ? 300 : 0;
            window.setTimeout(() => {
              if (srWantRef.current) { try { startSR(); } catch { srWantRef.current = false; setListening(false); } }
            }, delay);
          };
          rec.onerror = (e) => {
            // Fatal (permission) → stop for good + guide the user. Transient
            // ('no-speech' / 'aborted' / 'network') → let onend auto-restart.
            if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
              srWantRef.current = false;
              setListening(false);
              setPermissionNotice(micPermissionMessage(localeCode));
            }
          };
          lastStartTs = Date.now();
          rec.start();
          recognitionRef.current = rec;
        } catch {
          srWantRef.current = false;
          setListening(false);
        }
      };
      setPermissionNotice(null);
      srWantRef.current = true;
      setListening(true);
      startSR();
      return;
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
    } catch (err) {
      setListening(false);
      if (err instanceof DOMException && err.name === 'NotAllowedError') setPermissionNotice(micPermissionMessage(localeCode));
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
    const att = attachment; // snapshot before any async/clear so the payload is never dropped

    if (replacePendingId) {
      setMessages(m => m.map(x => x.id === replacePendingId
        ? { ...x, pending: true, text: pendingTextFor(service, localeCode), service, media: undefined, liked: false, disliked: false }
        : x,
      ));
    } else {
      const userMsg: ChatMessage = {
        id: mkId(), role: 'user', text: trimmed, ts: Date.now(),
        ...(att?.previewUrl ? { userImage: att.previewUrl } : {}),
      };
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
    // Attachment is captured into the user message + the dispatch below; clear the
    // composer now so it never lingers or double-sends across services.
    if (att) setAttachment(null);
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
        const visionImg = att ? { base64: att.base64, mimeType: att.type } : undefined;
        await runChat(cleanText, messages, pendingId, setMessages, controller.signal, visionImg);
      }
      else if (service === 'image')   await runImage(cleanText, pendingId, setMessages, controller.signal, opts);
      else if (service === 'video')   await runVideo(cleanText, pendingId, setMessages, controller.signal, { ...opts, renderSettings });
      else if (service === 'music')   await runMusic(cleanText, pendingId, setMessages, controller.signal, opts);
      else if (service === 'voice')   await runVoice(cleanText, pendingId, setMessages, controller.signal, opts);
      else if (service === 'avatar')  {
        await runAvatar(cleanText, pendingId, setMessages, att?.base64, att?.type, controller.signal, opts);
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

  // Auth interceptor — opens the in-window login. Hard-bypassed under `next dev`
  // so a 401 never blocks local QA (the server bypass already returns 200 there;
  // this guarantees the modal never appears even on an anomalous 401).
  const promptAuth = useCallback(() => {
    if (DEV_BYPASS) return;
    setAuthOpen(true);
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
    // Image/Music route through the swarm produce flow (Agent P / Agent S + SSE
    // telemetry); everything else uses the standard dispatch.
    if (p.id === 'image' || p.id === 'music' || p.id === 'voice') { void runMediaProduce(p.id, input.trim() || text); return; }
    void send(text, p.id);
  };

  // ── Per-message actions (Like/Dislike/Copy/Regenerate/Speaker) ────────────
  const onLike = useCallback((id: string) => {
    setMessages(m => m.map(x => x.id === id ? { ...x, liked: !x.liked, disliked: false } : x));
  }, []);
  const onDislike = useCallback((id: string) => {
    setMessages(m => m.map(x => x.id === id ? { ...x, disliked: !x.disliked, liked: false } : x));
  }, []);
  // Copy + Speak are now self-contained per-message components (CopyButton /
  // SpeakerButton) that own their loading/cached/playing state — no parent
  // handler needed.
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
  // ── One-tap cinematic production. POSTs to the authed /produce orchestrator
  //    and renders the live SSE stage stream into a progress tracker; on
  //    completion the final 30s master mounts inline in the timeline.
  // Cancel any in-flight produce pipeline. The aborted fetch rejects with
  // AbortError, which each flow surfaces as a graceful "stopped" message.
  const cancelProduce = useCallback(() => {
    try { produceAbortRef.current?.abort(); } catch { /* noop */ }
  }, []);

  const runProduce = useCallback(async () => {
    if (producing || sending) return;
    const prompt = input.trim() || (localeCode === 'ka' ? 'კინემატოგრაფიული 30-წამიანი რგოლი' : 'a cinematic 30-second promo');
    setProducing(true); setProduceStage('initiated'); setProducePct(3); setProduceDetail('');
    setInput('');
    const userId = mkId();
    const pendId = mkId();
    setMessages(m => [
      ...m,
      { id: userId, role: 'user', text: `🎬 ${prompt}`, ts: Date.now() },
      { id: pendId, role: 'assistant', text: produceStageLabel('initiated', localeCode), pending: true, service: 'video', ts: Date.now() },
    ]);
    const controller = new AbortController();
    produceAbortRef.current = controller;
    try {
      const res = await fetch('/api/orchestrator/produce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt, totalDurationSec: 30 }),
        signal: controller.signal,
      });
      if (res.status === 401) {
        setMessages(m => m.filter(x => x.id !== pendId && x.id !== userId));
        promptAuth();
        return;
      }
      if (!res.ok || !res.body) throw new Error(`produce_${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let finalUrl: string | null = null;
      let failed: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let ev: { stage?: string; pct?: number; url?: string; error?: string; ready?: number; total?: number; shots?: number };
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.stage) {
            setProduceStage(ev.stage);
            if (typeof ev.pct === 'number') setProducePct(ev.pct);
            const det = ev.stage === 'video.segments.ready' ? `${ev.ready}/${ev.total}`
              : ev.stage === 'script.compiled' && ev.shots ? `${ev.shots} ${localeCode === 'ka' ? 'კადრი' : 'shots'}`
              : '';
            setProduceDetail(det);
            tickPending(setMessages, pendId, produceStageLabel(ev.stage, localeCode, det));
          }
          if (ev.stage === 'completed' && ev.url) finalUrl = ev.url;
          if (ev.stage === 'failed') failed = ev.error ?? 'failed';
        }
      }
      if (finalUrl) {
        patchMessage(setMessages, pendId, { text: '', media: { kind: 'video', url: finalUrl, meta: { engine: 'MyAvatar Swarm', fps: 24, aspectRatio: '16:9' } } });
      } else {
        patchMessage(setMessages, pendId, { pending: false, text: localizedProduceError(failed, localeCode) });
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        patchMessage(setMessages, pendId, { pending: false, text: localizedError(e, localeCode) });
      } else {
        patchMessage(setMessages, pendId, { pending: false, text: localizedProduceError(e instanceof Error ? e.message : null, localeCode) });
      }
    } finally {
      produceAbortRef.current = null;
      setProducing(false); setProduceStage(''); setProducePct(0); setProduceDetail('');
    }
  }, [producing, sending, input, localeCode, promptAuth]);

  // ── Interior design (3D). Uses the attached room photo (📎/📷) + brief, streams
  //    the Agent N→K telemetry, then mounts the inline Three.js RoomViewer.
  const runInteriorDesign = useCallback(async () => {
    if (producing || sending) return;
    if (!attachment) {
      setMessages(m => [...m, {
        id: mkId(), role: 'assistant', ts: Date.now(),
        text: localeCode === 'ka' ? 'ჯერ მიამაგრე ოთახის ფოტო (📎 ან 📷), მერე დააჭირე „ოთახის დიზაინი 3D".'
          : localeCode === 'ru' ? 'Сначала прикрепите фото комнаты (📎 или 📷), затем нажмите «Дизайн комнаты 3D».'
          : 'Attach a room photo first (📎 or 📷), then tap "Design Room 3D".',
      }]);
      return;
    }
    const brief = input.trim();
    const imageUrl = attachment.previewUrl;
    setProducing(true); setProduceStage('[Capturing room…]'); setProducePct(5); setProduceDetail('');
    setInput('');
    const userId = mkId();
    const pendId = mkId();
    setMessages(m => [
      ...m,
      { id: userId, role: 'user', text: `🛋️ ${brief || (localeCode === 'ka' ? 'ოთახის დიზაინი' : 'redesign my room')}`, ts: Date.now() },
      { id: pendId, role: 'assistant', text: '[Extracting Spatial Matrix…]', pending: true, service: 'interior', ts: Date.now() },
    ]);
    setAttachment(null);
    const controller = new AbortController();
    produceAbortRef.current = controller;
    try {
      const res = await fetch('/api/orchestrator/interior/produce', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ imageUrls: [imageUrl], brief }),
        signal: controller.signal,
      });
      if (res.status === 401) { setMessages(m => m.filter(x => x.id !== pendId && x.id !== userId)); promptAuth(); return; }
      if (!res.ok || !res.body) throw new Error(`interior_${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let geometry: RoomGeometry | null = null;
      let style: StyleGuide | undefined;
      let failed: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let ev: { stage?: string; pct?: number; ticker?: string; geometry?: RoomGeometry; style?: StyleGuide; error?: string };
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.stage) {
            setProduceStage(ev.ticker ?? ev.stage);
            if (typeof ev.pct === 'number') setProducePct(ev.pct);
            tickPending(setMessages, pendId, ev.ticker ?? ev.stage);
          }
          if (ev.stage === 'completed' && ev.geometry) { geometry = ev.geometry; style = ev.style; }
          if (ev.stage === 'failed') failed = ev.error ?? 'failed';
        }
      }
      if (geometry) {
        patchMessage(setMessages, pendId, {
          text: localeCode === 'ka' ? 'შენი ახალი ოთახი — დაატრიალე და დაათვალიერე 👇' : localeCode === 'ru' ? 'Ваша новая комната — вращайте и масштабируйте 👇' : 'Your redesigned room — drag to orbit & zoom 👇',
          media: { kind: 'room', room: { geometry, ...(style ? { style } : {}) } },
        });
      } else {
        patchMessage(setMessages, pendId, { pending: false, text: localizedInteriorError(failed, localeCode) });
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        patchMessage(setMessages, pendId, { pending: false, text: localizedError(e, localeCode) });
      } else {
        patchMessage(setMessages, pendId, { pending: false, text: localizedInteriorError(e instanceof Error ? e.message : null, localeCode) });
      }
    } finally {
      produceAbortRef.current = null;
      setProducing(false); setProduceStage(''); setProducePct(0); setProduceDetail('');
    }
  }, [producing, sending, attachment, input, localeCode, promptAuth]);

  // ── AI Avatar video (HeyGen). Script (input) + optional attached photo →
  //    Agent V/H/M telemetry → inline HD talking-avatar video.
  const runAvatarProduce = useCallback(async () => {
    if (producing || sending) return;
    const script = input.trim();
    if (!script) {
      setMessages(m => [...m, {
        id: mkId(), role: 'assistant', ts: Date.now(),
        text: localeCode === 'ka' ? 'დაწერე ტექსტი/სცენარი, მერე დააჭირე „AI ავატარი" (სურვილისამებრ მიამაგრე ფოტო).'
          : localeCode === 'ru' ? 'Введите текст/сценарий, затем нажмите «AI Аватар» (фото — по желанию).'
          : 'Type a script first, then tap "AI Avatar" (attach a photo optionally).',
      }]);
      return;
    }
    setProducing(true); setProduceStage('[Initializing HeyGen session…]'); setProducePct(5); setProduceDetail('');
    setInput('');
    const photo = attachment;
    const userId = mkId();
    const pendId = mkId();
    setMessages(m => [
      ...m,
      { id: userId, role: 'user', text: `🗣️ ${script}`, ts: Date.now() },
      { id: pendId, role: 'assistant', text: '[Initializing HeyGen session…]', pending: true, service: 'avatar', ts: Date.now() },
    ]);
    setAttachment(null);
    const controller = new AbortController();
    produceAbortRef.current = controller;
    try {
      const res = await fetch('/api/orchestrator/avatar/produce', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ script, ...(photo ? { photoBase64: photo.base64, photoMimeType: photo.type } : {}) }),
        signal: controller.signal,
      });
      if (res.status === 401) { setMessages(m => m.filter(x => x.id !== pendId && x.id !== userId)); promptAuth(); return; }
      if (!res.ok || !res.body) throw new Error(`avatar_${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let url: string | null = null;
      let poster: string | null = null;
      let failed: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let ev: { stage?: string; pct?: number; ticker?: string; url?: string; poster?: string | null; error?: string };
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.stage) {
            setProduceStage(ev.ticker ?? ev.stage);
            if (typeof ev.pct === 'number') setProducePct(ev.pct);
            tickPending(setMessages, pendId, ev.ticker ?? ev.stage);
          }
          if (ev.stage === 'completed' && ev.url) { url = ev.url; poster = ev.poster ?? null; }
          if (ev.stage === 'failed') failed = ev.error ?? 'failed';
        }
      }
      if (url) {
        patchMessage(setMessages, pendId, { text: '', media: { kind: 'video', url, ...(poster ? { poster } : {}), meta: { engine: 'HeyGen' } } });
      } else {
        patchMessage(setMessages, pendId, { pending: false, text: localizedAvatarError(failed, localeCode) });
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        patchMessage(setMessages, pendId, { pending: false, text: localizedError(e, localeCode) });
      } else {
        patchMessage(setMessages, pendId, { pending: false, text: localizedAvatarError(e instanceof Error ? e.message : null, localeCode) });
      }
    } finally {
      produceAbortRef.current = null;
      setProducing(false); setProduceStage(''); setProducePct(0); setProduceDetail('');
    }
  }, [producing, sending, input, attachment, localeCode, promptAuth]);

  // ── Image / Music swarm produce (Agent P / Agent S) with live SSE telemetry.
  //    Logged-out users transparently fall back to the direct generation path
  //    (which needs no auth) so the chips never dead-end.
  const runMediaProduce = useCallback(async (kind: 'image' | 'music' | 'voice', rawPrompt: string) => {
    if (producing || sending) return;
    const prompt = (rawPrompt.trim() || input.trim());
    if (!prompt) return;
    setProducing(true);
    setProduceStage(kind === 'image' ? '[Agent P: Formulating Visual Prompt Matrix…]'
      : kind === 'voice' ? '[Agent H: Synthesizing Vocal Frequency Spectrum…]'
      : '[Agent S: Architecting Lyric/Vibe Matrix…]');
    setProducePct(5); setProduceDetail('');
    const controller = new AbortController();
    produceAbortRef.current = controller;
    let res: Response;
    try {
      res = await fetch(`/api/orchestrator/${kind}/produce`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(kind === 'voice' ? { text: prompt, locale: localeCode } : { prompt }),
        signal: controller.signal,
      });
    } catch (e) {
      setProducing(false); setProduceStage(''); setProducePct(0);
      produceAbortRef.current = null;
      if ((e as Error)?.name === 'AbortError') return; // user cancelled — no fallback
      void send(prompt, kind); return; // network → direct path
    }
    if (res.status === 401) {
      // Not logged in → use the unauthenticated direct generator (still inline).
      setProducing(false); setProduceStage(''); setProducePct(0);
      void send(prompt, kind); return;
    }
    const userId = mkId();
    const pendId = mkId();
    setMessages(m => [
      ...m,
      { id: userId, role: 'user', text: prompt, ts: Date.now() },
      { id: pendId, role: 'assistant', text: produceStage, pending: true, service: kind, ts: Date.now() },
    ]);
    setInput('');
    try {
      if (!res.ok || !res.body) throw new Error(`${kind}_${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let url: string | null = null;
      let ratio: string | undefined;
      let failed: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          let ev: { stage?: string; pct?: number; ticker?: string; url?: string; ratio?: string; error?: string };
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.stage) { setProduceStage(ev.ticker ?? ev.stage); if (typeof ev.pct === 'number') setProducePct(ev.pct); tickPending(setMessages, pendId, ev.ticker ?? ev.stage); }
          if (ev.stage === 'completed' && ev.url) { url = ev.url; ratio = ev.ratio; }
          if (ev.stage === 'failed') failed = ev.error ?? 'failed';
        }
      }
      if (url) {
        patchMessage(setMessages, pendId, {
          text: '',
          media: kind === 'image'
            ? { kind: 'image', url, meta: { engine: 'AI Image', ...(ratio ? { aspectRatio: ratio } : {}) } }
            : kind === 'voice'
              ? { kind: 'audio', url, meta: { engine: 'ElevenLabs', voiceProvider: 'ElevenLabs' } }
              : { kind: 'audio', url, meta: { engine: 'Udio' } },
        });
      } else {
        patchMessage(setMessages, pendId, { pending: false, text: localizedProduceError(failed, localeCode) });
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        patchMessage(setMessages, pendId, { pending: false, text: localizedError(e, localeCode) });
      } else {
        patchMessage(setMessages, pendId, { pending: false, text: localizedProduceError(e instanceof Error ? e.message : null, localeCode) });
      }
    } finally {
      produceAbortRef.current = null;
      setProducing(false); setProduceStage(''); setProducePct(0); setProduceDetail('');
    }
  }, [producing, sending, input, produceStage, localeCode, send]);

  // Inline-only: "Open in preview" scrolls the inline media into view.
  // The per-bubble click-to-lightbox in InlineMedia handles fullscreen.
  const onOpenInPreview = useCallback((m: ChatMessage) => {
    const node = document.querySelector(`[data-msg-id="${m.id}"]`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Contextual post-production actions rendered under each completed media block.
  // Every action does something real: re-dispatch a generation with a crafted
  // intent, open the render-settings panel, download the asset, or load the
  // script back into the composer for editing.
  const handleContextAction = useCallback((action: string, p: { prompt: string; url?: string }) => {
    const base = (p.prompt || '').trim();
    switch (action) {
      // ── Image ──
      case 'image.upscale':  void send(`${base} — ultra-detailed, 4K resolution, maximum sharpness and clarity`, 'image'); break;
      case 'image.variant':  void send(`${base} — a fresh creative variation`, 'image'); break;
      case 'image.aspect':   void send(`${base} — 16:9 widescreen cinematic composition`, 'image'); break;
      case 'image.toVideo':  void send(base || 'animate this scene into motion', 'video'); break;
      // ── Video ──
      case 'video.extend':   void send(`${base} — continue the scene, the next 5 seconds`, 'video'); break;
      case 'video.voiceover':void send(`Voice-over narration for: ${base}`, 'voice'); break;
      case 'video.fps':      setRenderSettings({ ...renderSettings, fps: 60 }); setRenderPanelOpen(true); break;
      case 'video.transition': setRenderPanelOpen(true); break;
      // ── Music / Voice ──
      case 'music.rescore':  void send(base || 'a fresh musical theme', 'music'); break;
      case 'music.ducking':  setRenderPanelOpen(true); break;
      case 'audio.download': downloadAsset(p.url, 'myavatar-audio'); break;
      // ── Avatar ──
      case 'avatar.script':  setInput(base); requestAnimationFrame(() => inputRef.current?.focus()); break;
      case 'avatar.lipsync': void send(base, 'avatar'); break;
      case 'avatar.background': void send(`${base} — with a different background scene`, 'avatar'); break;
    }
  }, [send, renderSettings, setRenderSettings]);

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
          <span className="text-[15px] font-semibold tracking-tight text-white select-none">
            MyAvatar<span className="text-white/40">.ge</span>
          </span>
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
                      onRegenerate={() => onRegenerate(m.id)}
                      onRemix={onRemix}
                      onOpenInPreview={() => onOpenInPreview(m)}
                      onContextAction={handleContextAction}
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
                    const asset: AssetRef | undefined = last.media?.url && last.media.kind !== 'room'
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
          {/* Hardware-permission notice — elegant inline guidance, never a dead button */}
          {permissionNotice && (
            <div className="max-w-2xl mx-auto mb-2 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
              <span className="mt-0.5">🔒</span>
              <span className="flex-1 leading-relaxed">{permissionNotice}</span>
              <button type="button" onClick={() => setPermissionNotice(null)} aria-label="Dismiss" className="text-amber-200/70 hover:text-amber-100 transition active:scale-90">
                <X size={14} />
              </button>
            </div>
          )}
          {/* One-tap cinematic production — button → live SSE telemetry → inline film */}
          <div className="max-w-2xl mx-auto mb-2">
            {producing ? (
              <ProduceProgress stage={produceStage} pct={producePct} detail={produceDetail} locale={localeCode} onCancel={cancelProduce} />
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runProduce()}
                  disabled={sending}
                  className="flex-1 min-w-[30%] inline-flex items-center justify-center gap-1.5 h-11 rounded-2xl font-semibold text-[13px] text-white bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 hover:from-cyan-300 hover:via-sky-400 hover:to-blue-500 active:scale-[0.99] disabled:opacity-50 transition-transform duration-150 shadow-[0_8px_30px_-8px_rgba(56,189,248,0.6)]"
                >
                  <Sparkles size={15} />
                  {localeCode === 'ka' ? '30წ ფილმი' : localeCode === 'ru' ? '30с фильм' : 'Produce Film'}
                </button>
                <button
                  type="button"
                  onClick={() => void runAvatarProduce()}
                  disabled={sending}
                  title={localeCode === 'ka' ? 'დაწერე ტექსტი (+სურვ. ფოტო)' : 'Type a script (+optional photo)'}
                  className="flex-1 min-w-[30%] inline-flex items-center justify-center gap-1.5 h-11 rounded-2xl font-semibold text-[13px] text-white bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 active:scale-[0.99] disabled:opacity-50 transition-transform duration-150 shadow-[0_8px_30px_-8px_rgba(37,99,235,0.55)]"
                >
                  <UserIcon size={15} />
                  {localeCode === 'ka' ? 'AI ავატარი' : localeCode === 'ru' ? 'AI Аватар' : 'AI Avatar'}
                </button>
                <button
                  type="button"
                  onClick={() => void runInteriorDesign()}
                  disabled={sending}
                  title={localeCode === 'ka' ? 'მიამაგრე ოთახის ფოტო, მერე დააჭირე' : 'Attach a room photo, then tap'}
                  className="flex-1 min-w-[30%] inline-flex items-center justify-center gap-1.5 h-11 rounded-2xl font-semibold text-[13px] text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-[0.99] disabled:opacity-50 transition-transform duration-150 shadow-[0_8px_30px_-8px_rgba(16,185,129,0.55)]"
                >
                  <SofaIcon size={15} />
                  {localeCode === 'ka' ? 'ოთახის 3D' : localeCode === 'ru' ? 'Комната 3D' : 'Design Room'}
                </button>
              </div>
            )}
          </div>
          {/* In-chat video render controls — strictly hidden unless the user is in a
              film/video context (a video-intent prompt OR an active film production). */}
          {(producing || /\b(video|ვიდეო|видео|film|ფილმ|фильм|clip|რგოლ|montage|მონტაჟ|cinematic|კინო)\b/i.test(input)) && (
            <div className="max-w-2xl mx-auto mb-2">
              <VideoControlSuite
                locale={localeCode}
                open={renderPanelOpen}
                onToggle={() => setRenderPanelOpen(v => !v)}
                settings={renderSettings}
                onChange={setRenderSettings}
              />
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PILLS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePill(p)}
                disabled={sending}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-black border border-white/[0.10] hover:border-sky-400/45 hover:bg-white/[0.05] hover:shadow-[0_0_18px_-5px_rgba(56,189,248,0.6)] active:scale-95 disabled:opacity-50 transition-all duration-150 text-[13px] font-medium text-white"
              >
                <p.icon size={14} className="text-white/85" />
                {localeCode === 'ka' ? p.label_ka : p.label_en}
              </button>
            ))}
          </div>

          <div
            onDrop={onDropFiles}
            onDragOver={onDragOverInput}
            onDragLeave={onDragLeaveInput}
            className={`relative rounded-3xl bg-black border overflow-hidden transition ${
              dragActive
                ? 'border-sky-400/60 ring-2 ring-sky-500/30'
                : 'border-white/[0.10] focus-within:border-white/[0.22]'
            }`}
          >
            {dragActive && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-sm pointer-events-none">
                <span className="inline-flex items-center gap-2 text-[13px] font-medium text-cyan-200">
                  <ImageIcon size={16} />
                  {localeCode === 'ka' ? 'ჩააგდე სურათი აქ' : localeCode === 'ru' ? 'Перетащите изображение' : 'Drop image here'}
                </span>
              </div>
            )}
            {/* Attachment chip animates its height so adding/removing a file
                grows the composer fluidly — no layout shift, no clipping. */}
            <AnimatePresence initial={false}>
              {attachment && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
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
                </motion.div>
              )}
            </AnimatePresence>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder={localeCode === 'ka' ? 'მკითხე ნებისმიერი' : 'Ask Anything'}
              aria-label={localeCode === 'ka' ? 'მკითხე ნებისმიერი' : 'Ask Anything'}
              className="w-full bg-transparent border-none outline-none resize-none overflow-y-auto px-4 pt-3 pb-1.5 text-[15px] font-medium leading-relaxed text-white placeholder:text-white/45 placeholder:font-normal [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Attach image"
                  onClick={onPickFile}
                  title={localeCode === 'ka' ? 'სურათის მიმაგრება (ავატარისთვის)' : 'Attach image (for Avatar)'}
                  className="h-9 w-9 rounded-full hover:bg-white/[0.06] flex items-center justify-center text-[#94A3B8] hover:text-white transition active:scale-90"
                >
                  <Paperclip size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Camera"
                  onClick={openCamera}
                  title={localeCode === 'ka' ? 'კამერა' : 'Camera'}
                  className="h-9 w-9 rounded-full hover:bg-white/[0.06] flex items-center justify-center text-[#94A3B8] hover:text-white transition active:scale-90"
                >
                  <Camera size={16} />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <AnimatePresence>{listening && <SoundwaveMeter />}</AnimatePresence>
                <button
                  type="button"
                  aria-label={listening ? 'Stop listening' : 'Voice input'}
                  onClick={toggleVoiceInput}
                  className={`h-9 w-9 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out active:scale-90 ${
                    listening
                      ? 'bg-gradient-to-br from-cyan-400 to-blue-600 text-white ring-1 ring-sky-300/50 shadow-[0_0_18px_-4px_rgba(56,189,248,0.7)] animate-pulse'
                      : 'hover:bg-white/[0.06] text-[#94A3B8] hover:text-white'
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
                    className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-full font-semibold text-[13px] transition-all duration-300 ease-in-out ${
                      input.trim()
                        ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-white hover:from-cyan-300 hover:to-blue-500 shadow-[0_6px_22px_-8px_rgba(56,189,248,0.7)]'
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
                <span className="text-[15px] font-semibold tracking-tight text-white">
                  MyAvatar<span className="text-white/40">.ge</span>
                </span>
                <button type="button" aria-label="Close" onClick={() => setDrawerOpen(false)}
                  className="h-8 w-8 rounded-full hover:bg-white/[0.08] flex items-center justify-center text-[#94A3B8]">
                  <X size={16} />
                </button>
              </div>

              {/* Prominent New chat CTA */}
              <div className="px-3 pt-3">
                <motion.button
                  type="button"
                  onClick={newSession}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-white text-black text-[13px] font-semibold hover:bg-white/90 transition"
                >
                  <Sparkles size={15} />
                  {localeCode === 'ka' ? 'ახალი ჩატი' : localeCode === 'ru' ? 'Новый чат' : 'New chat'}
                </motion.button>
              </div>

              <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/35">
                {localeCode === 'ka' ? 'სამუშაო სივრცე' : localeCode === 'ru' ? 'Рабочее пространство' : 'Workspace'}
              </div>
              <nav className="flex-shrink-0 pb-2 border-b border-white/[0.06]">
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
                userName={effectiveUserName}
                isAuthenticated={effectiveAuth}
                // Close the drawer first, then open auth once it has animated out
                // so the two overlays never stack into a broken fragment.
                onLogin={() => { setDrawerOpen(false); window.setTimeout(promptAuth, 200); }}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* In-window camera capture — photos land as an input attachment */}
      <CameraModal
        isOpen={cameraOpen}
        accentColor="#0ea5e9"
        onClose={() => setCameraOpen(false)}
        onAttach={onCameraAttach}
        showFaceGuide
        fullScreen
      />

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

// ─── Produce-film pipeline telemetry ─────────────────────────────────────────
const PRODUCE_STAGES = [
  'scripting', 'script.compiled', 'generating_clips', 'video.segments.ready', 'voiceover', 'assembling', 'completed',
] as const;

function produceStageLabel(stage: string, locale: string, detail = ''): string {
  const ka: Record<string, string> = {
    initiated: 'ვიწყებ წარმოებას…', scripting: 'ვწერ სცენარს…', 'script.compiled': 'სცენარი მზადაა',
    generating_clips: 'ვქმნი კადრებს…', 'video.segments.ready': 'კადრები მზადაა', voiceover: 'ვამატებ ხმას…',
    'audio.segments.ready': 'ხმა მზადაა', assembling: 'ვაერთებ 30წ ფილმს…', completed: 'მზადაა', failed: 'ვერ მოხერხდა',
  };
  const en: Record<string, string> = {
    initiated: 'Starting production…', scripting: 'Writing the script…', 'script.compiled': 'Script ready',
    generating_clips: 'Generating clips…', 'video.segments.ready': 'Clips ready', voiceover: 'Adding voiceover…',
    'audio.segments.ready': 'Audio ready', assembling: 'Assembling the 30s film…', completed: 'Done', failed: 'Failed',
  };
  const base = (locale === 'ka' ? ka : en)[stage] ?? stage;
  return detail ? `${base} · ${detail}` : base;
}

// TASK 4: elegant, user-centric failure copy — never a raw system break.
function localizedProduceError(_err: string | null, locale: string): string {
  if (locale === 'ka') return 'ფილმის აწყობა ამ წამს ვერ მოხერხდა — ერთ-ერთი ძრავა დროებით დაკავებულია. სცადე ხელახლა რამდენიმე წამში (კრედიტი არ ჩამოგეჭრა).';
  if (locale === 'ru') return 'Не удалось собрать фильм прямо сейчас — один из движков временно занят. Повторите через несколько секунд (кредиты не списаны).';
  return "I couldn't finish the film just now — one of the engines is briefly busy. Try again in a few seconds (you weren't charged).";
}

// TASK 4: graceful interior failure (e.g. unsupported video / streaming bottleneck).
function localizedInteriorError(_err: string | null, locale: string): string {
  if (locale === 'ka') return 'ოთახის 3D ანალიზი ამ წამს ვერ დასრულდა — ფაილი ან ფორმატი ვერ დამუშავდა. სცადე სხვა/ნათელი ფოტოთი (JPG/PNG) ან ცადე ხელახლა.';
  if (locale === 'ru') return 'Не удалось завершить 3D-анализ комнаты — файл или формат не обработан. Попробуйте другое чёткое фото (JPG/PNG) или повторите.';
  return "I couldn't finish the 3D room analysis — that file or format didn't process. Try a clearer photo (JPG/PNG) or give it another go.";
}

// TASK 4: graceful avatar failure — HeyGen concurrency gets a calm queue message.
function localizedAvatarError(reason: string | null, locale: string): string {
  if (reason === 'concurrency') {
    if (locale === 'ka') return 'HeyGen ამჟამად დატვირთულია — ავატარი რიგშია და ავტომატურად დაიწყება მალე. სცადე ცოტა ხანში.';
    if (locale === 'ru') return 'HeyGen сейчас перегружен — аватар в очереди и запустится автоматически. Повторите чуть позже.';
    return 'HeyGen is at capacity right now — your avatar is queued and will retry automatically in a moment. Feel free to try again shortly.';
  }
  if (locale === 'ka') return 'ავატარის გენერაცია ვერ დასრულდა — სცადე უფრო მოკლე ტექსტით ან ხელახლა.';
  if (locale === 'ru') return 'Не удалось создать аватара — попробуйте более короткий текст или повторите.';
  return "Couldn't finish the avatar — try a shorter script or give it another go.";
}

// TASK 4.2: elegant mic-permission guidance instead of a silent dead button.
function micPermissionMessage(locale: string): string {
  if (locale === 'ka') return 'მიკროფონზე წვდომა დაბლოკილია. ჩართე ბრაუზერის მისამართის ზოლის 🔒 ხატულადან → Microphone → Allow, შემდეგ სცადე ხელახლა.';
  if (locale === 'ru') return 'Доступ к микрофону заблокирован. Включите его через значок 🔒 в адресной строке → Микрофон → Разрешить, затем повторите.';
  return "Microphone access is blocked. Enable it from the 🔒 icon in your browser's address bar → Microphone → Allow, then try again.";
}

function cameraUnavailableMessage(locale: string): string {
  if (locale === 'ka') return 'კამერა მიუწვდომელია ამ მოწყობილობაზე ან ბრაუზერში. სცადე სხვა ბრაუზერი ან შეამოწმე ნებართვები.';
  if (locale === 'ru') return 'Камера недоступна на этом устройстве или в браузере. Попробуйте другой браузер или проверьте разрешения.';
  return 'The camera is unavailable on this device or browser. Try another browser or check your permissions.';
}

function ProduceProgress({ stage, pct, detail, locale, onCancel }: { stage: string; pct: number; detail: string; locale: string; onCancel?: () => void }) {
  const curIdx = PRODUCE_STAGES.indexOf(stage as (typeof PRODUCE_STAGES)[number]);
  const stopLabel = locale === 'ka' ? 'შეჩერება' : locale === 'ru' ? 'Стоп' : 'Stop';
  return (
    <div className="rounded-2xl bg-black border border-sky-400/15 px-4 py-3 will-change-transform shadow-[0_0_24px_-10px_rgba(56,189,248,0.45)]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[12px] font-semibold text-white inline-flex items-center gap-1.5 min-w-0">
          <Sparkles size={13} className="text-cyan-300 animate-pulse flex-shrink-0" />
          <span className="truncate">{produceStageLabel(stage, locale, detail)}</span>
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-white/50 tabular-nums">{Math.round(pct)}%</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label={stopLabel}
              className="inline-flex items-center gap-1 px-2 h-6 rounded-full text-[11px] font-semibold bg-rose-500/90 hover:bg-rose-500 text-white transition active:scale-95"
            >
              <span className="block h-2 w-2 bg-white rounded-[2px]" />
              {stopLabel}
            </button>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(3, Math.min(100, pct))}%` }}
          transition={{ ease: 'easeOut', duration: 0.4 }}
        />
      </div>
      <div className="flex gap-1 mt-2">
        {PRODUCE_STAGES.map((s, i) => (
          <span key={s} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= curIdx ? 'bg-sky-400/70' : 'bg-white/[0.08]'}`} />
        ))}
      </div>
    </div>
  );
}

// ─── SoundwaveMeter — live "listening" indicator next to the mic button ──────
// Seven Framer-Motion bars with a cyan→sky→blue ocean gradient, each pulsing on
// its own organic cadence so the cluster reads like a live waveform while voice
// capture is active. Honest feedback that the mic is hot (not decoded amplitude);
// mounted/unmounted via AnimatePresence so it slides in and out cleanly.
function SoundwaveMeter() {
  const bars = [0, 1, 2, 3, 4, 5, 6];
  const peaks = [10, 20, 13, 24, 11, 18, 9];
  const durs = [0.74, 0.96, 0.62, 1.02, 0.82, 0.7, 0.66];
  return (
    <motion.div
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: 'auto' }}
      exit={{ opacity: 0, width: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-center gap-[3px] h-6 px-1.5 overflow-hidden"
      aria-hidden="true"
    >
      {bars.map(i => {
        const peak = peaks[i] ?? 12;
        return (
          <motion.span
            key={i}
            className="w-[2.5px] rounded-full bg-gradient-to-t from-blue-500 via-sky-400 to-cyan-300"
            initial={{ height: 4 }}
            animate={{ height: [4, peak, 7, peak - 5, 4] }}
            transition={{ duration: durs[i] ?? 0.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.09 }}
          />
        );
      })}
    </motion.div>
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
  // High-end minimalist hero — a single question, perfectly centered, with a
  // staggered entrance and a soft sky/marine aura behind the mark for depth.
  const welcome = locale === 'ka' ? 'რა გსურს?' : locale === 'ru' ? 'Чего хотите?' : 'What would you like?';
  const sub = locale === 'ka'
    ? 'ფილმი, ავატარი, მუსიკა, ხმა, ინტერიერი — ერთ სივრცეში.'
    : locale === 'ru'
      ? 'Фильм, аватар, музыка, голос, интерьер — в одном окне.'
      : 'Film, avatar, music, voice, interiors — all in one place.';
  const ease = [0.22, 1, 0.36, 1] as const;
  return (
    <div className="h-full flex flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="relative mb-5"
      >
        <span aria-hidden className="absolute inset-0 -z-10 blur-2xl rounded-full bg-sky-500/20 scale-150" />
        <Sparkles size={32} className="text-cyan-300/80" />
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08, ease }}
        className="text-[30px] sm:text-[36px] font-semibold text-white tracking-tight leading-[1.1]"
      >
        {welcome}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.16, ease }}
        className="mt-2.5 max-w-xs text-[14px] text-white/45 leading-relaxed"
      >
        {sub}
      </motion.p>
    </div>
  );
}

// ─── MessageRow ──────────────────────────────────────────────────────────────

// ─── MediaContextActions — contextual post-production chips under each media ──
// Renders a service-specific row of one-tap actions beneath a completed media
// block. Each chip dispatches a real action through onAction → handleContextAction.
type CtxAction = { key: string; en: string; ka: string; ru: string };

const MEDIA_ACTIONS: Record<'image' | 'video' | 'music' | 'avatar', CtxAction[]> = {
  image: [
    { key: 'image.upscale', en: '4K Upscale', ka: '4K გადიდება', ru: '4K Апскейл' },
    { key: 'image.variant', en: 'Variant', ka: 'ვარიანტი', ru: 'Вариант' },
    { key: 'image.aspect', en: 'Crop 16:9', ka: 'კადრი 16:9', ru: 'Кадр 16:9' },
    { key: 'image.toVideo', en: '→ Video', ka: '→ ვიდეო', ru: '→ Видео' },
  ],
  video: [
    { key: 'video.extend', en: 'Extend +5s', ka: '+5წ გაგრძელება', ru: 'Продлить +5с' },
    { key: 'video.voiceover', en: 'Voice-Over', ka: 'ხმის დადება', ru: 'Озвучка' },
    { key: 'video.fps', en: '60fps Smooth', ka: '60fps', ru: '60fps' },
    { key: 'video.transition', en: 'Transition', ka: 'გადასვლა', ru: 'Переход' },
  ],
  music: [
    { key: 'music.rescore', en: 'Re-Score', ka: 'თავიდან', ru: 'Перезаписать' },
    { key: 'music.ducking', en: 'Ducking', ka: 'დაკინგი', ru: 'Дакинг' },
    { key: 'audio.download', en: 'Download', ka: 'ჩამოტვირთვა', ru: 'Скачать' },
  ],
  avatar: [
    { key: 'avatar.script', en: 'Edit Script', ka: 'სცენარი', ru: 'Сценарий' },
    { key: 'avatar.lipsync', en: 'Retime Lip-Sync', ka: 'ლიპ-სინქი', ru: 'Синхрон' },
    { key: 'avatar.background', en: 'Change BG', ka: 'ფონი', ru: 'Фон' },
  ],
};

function mediaActionCategory(service: ServiceId | undefined, kind: string | undefined): keyof typeof MEDIA_ACTIONS | null {
  if (service === 'image' || service === 'interior') return 'image';
  if (service === 'video') return 'video';
  if (service === 'avatar') return 'avatar';
  if (service === 'music' || service === 'voice') return 'music';
  if (kind === 'image') return 'image';
  if (kind === 'video') return 'video';
  if (kind === 'audio') return 'music';
  return null;
}

// Truthful provenance/format badges for a media bubble — reflects the real
// engine that produced the asset (no fabricated "4K/60fps" claims).
function mediaBadges(service: ServiceId | undefined, kind: string | undefined): string[] {
  switch (service) {
    case 'video': return ['LTX-2', 'MP4'];
    case 'avatar': return ['HeyGen', 'Lip-Sync'];
    case 'music': return ['Udio', 'Audio'];
    case 'voice': return ['ElevenLabs', 'TTS'];
    case 'image': return ['AI Image'];
    case 'interior': return ['AI · Interior'];
    case 'app': return ['Claude', 'HTML'];
    default:
      if (kind === 'image') return ['Image'];
      if (kind === 'video') return ['Video'];
      if (kind === 'audio') return ['Audio'];
      if (kind === 'code') return ['HTML'];
      return [];
  }
}

function MediaContextActions({
  service, kind, prompt, url, locale, onAction,
}: {
  service?: ServiceId;
  kind?: string;
  prompt: string;
  url?: string;
  locale: string;
  onAction: (action: string, payload: { prompt: string; url?: string }) => void;
}) {
  const cat = mediaActionCategory(service, kind);
  if (!cat) return null;
  const label = (a: CtxAction) => (locale === 'ka' ? a.ka : locale === 'ru' ? a.ru : a.en);
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {MEDIA_ACTIONS[cat].map(a => (
        <button
          key={a.key}
          type="button"
          onClick={() => onAction(a.key, { prompt, url })}
          className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium text-white/80 bg-white/[0.05] border border-white/[0.10] hover:bg-white/[0.10] hover:text-white hover:border-white/[0.20] active:scale-95 transition"
        >
          {label(a)}
        </button>
      ))}
    </div>
  );
}

interface MessageRowProps {
  m: ChatMessage;
  locale: string;
  onLike: () => void;
  onDislike: () => void;
  onRegenerate: () => void;
  onRemix: (prompt: string) => void;
  onOpenInPreview: () => void;
  onContextAction: (action: string, payload: { prompt: string; url?: string }) => void;
}

function MessageRow({ m, locale, onLike, onDislike, onRegenerate, onRemix, onOpenInPreview, onContextAction }: MessageRowProps) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] flex flex-col items-end gap-1.5">
          {m.userImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.userImage}
              alt=""
              className="max-w-[220px] max-h-[220px] rounded-2xl object-cover border border-sky-400/20"
            />
          )}
          {m.text && (
            // Marine-cohesive user bubble: sky-tinted glass with a soft blur +
            // faint ocean glow (TASK 2.3) — distinct from the neutral assistant text.
            <div className="px-4 py-2.5 rounded-2xl bg-sky-500/[0.08] backdrop-blur-sm border border-sky-400/20 text-white text-[15px] leading-relaxed break-words shadow-[0_2px_16px_-6px_rgba(56,189,248,0.35)]">
              {m.text}
            </div>
          )}
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
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-sky-400/20 text-white/85 text-[14px] overflow-hidden shadow-[0_0_24px_-8px_rgba(56,189,248,0.45)]"
        >
          {/* Sweeping premium glow that reflects active processing time */}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-500/0 via-cyan-400/[0.12] to-sky-500/0 animate-pulse" />
          <Loader2 size={14} className="relative animate-spin text-cyan-300" />
          <span className="relative">{m.text}</span>
        </motion.div>
      ) : (
        <>
          {text && (
            <div className="max-w-[88%] px-1 text-white text-[15px] leading-relaxed break-words chat-md">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Render external links safely in a new tab.
                  a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200 underline-offset-4 hover:underline" />,
                  // Inline + block code styles.
                  code: ({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
                    if (inline) {
                      return <code className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[13px] font-mono text-cyan-200" {...props}>{children}</code>;
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
                  blockquote: ({ node: _n, ...props }) => <blockquote {...props} className="border-l-2 border-sky-400/40 pl-3 my-2 text-white/75 italic" />,
                }}
              >
                {text}
              </ReactMarkdown>
            </div>
          )}
          {(m.media || detected) && (
            <div className="ml-1 relative group">
              {m.media?.kind === 'room' && m.media.room ? (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <RoomViewer geometry={m.media.room.geometry} style={m.media.room.style} />
                </motion.div>
              ) : m.media?.kind === 'code' && m.media.html ? (
                <InlineMedia kind="code" html={m.media.html} language={m.media.language} prompt="" badges={mediaBadges(m.service, 'code')} onRemix={onRemix} />
              ) : m.media?.url ? (
                <InlineMedia
                  kind={m.media.kind as 'image' | 'video' | 'audio'}
                  url={m.media.url}
                  poster={m.media.poster}
                  prompt={m.text}
                  badges={mediaBadges(m.service, m.media.kind)}
                  meta={m.media.meta}
                  onRemix={onRemix}
                />
              ) : detected ? (
                <InlineMedia kind={detected.kind} url={detected.url} prompt={text} badges={mediaBadges(m.service, detected.kind)} onRemix={onRemix} />
              ) : null}
              {/* Open this media in the dedicated preview canvas — bigger view + share/scrub */}
              <button
                type="button"
                onClick={onOpenInPreview}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 transition"
              >
                {locale === 'ka' ? 'პრევიუში გახსნა →' : 'Open in preview →'}
              </button>
              {/* Contextual post-production actions (per service) */}
              <MediaContextActions
                service={m.service}
                kind={m.media?.kind ?? detected?.kind}
                prompt={m.text}
                url={m.media?.url ?? detected?.url}
                locale={locale}
                onAction={onContextAction}
              />
            </div>
          )}

          {/* Action row — anchored under the media (or under the text if none).
              Note: CapCut/edit lives inside the InlineMedia overlay, not here, to
              avoid two buttons for the same action. */}
          <div className="flex items-center gap-3 text-neutral-400 dark:text-neutral-500 mt-2">
            <CopyButton text={m.text} />
            <ActionIcon title="Regenerate" onClick={onRegenerate}><RotateCcw size={13} /></ActionIcon>
            <SpeakerButton text={m.text} locale={locale} />
            <ActionIcon title="Like" onClick={onLike} active={m.liked} tone="sky"><ThumbsUp size={13} /></ActionIcon>
            <ActionIcon title="Dislike" onClick={onDislike} active={m.disliked} tone="cyan"><ThumbsDown size={13} /></ActionIcon>
          </div>
        </>
      )}
    </div>
  );
}

function ActionIcon({
  children, title, onClick, active, tone = 'sky',
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  tone?: 'sky' | 'cyan';
}) {
  // Active = registered state with a premium marine neon glow (sky for
  // affirmative actions, deep cyan/blue for dissent / playback).
  const activeCls = tone === 'cyan'
    ? 'text-cyan-200 bg-blue-600/15 shadow-[0_0_14px_-2px_rgba(37,99,235,0.65)]'
    : 'text-sky-200 bg-sky-500/15 shadow-[0_0_14px_-2px_rgba(56,189,248,0.65)]';
  // Safeguard runtime — never let a handler throw bubble into render.
  const handle = () => { try { onClick(); } catch { /* swallow */ } };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active ?? undefined}
      onClick={handle}
      className={`h-7 w-7 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${
        active ? activeCls : 'hover:text-cyan-300 hover:bg-white/[0.08]'
      }`}
    >
      {children}
    </button>
  );
}

// Copy-to-clipboard with a defensive hidden-textarea fallback (older / locked-down
// browsers) and a 2-second checkmark success state.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const copy = useCallback(async () => {
    const fallback = (s: string): boolean => {
      try {
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch { return false; }
    };
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        ok = fallback(text);
      }
    } catch {
      ok = fallback(text);
    }
    if (ok) {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <ActionIcon title={copied ? 'Copied' : 'Copy'} onClick={copy} active={copied} tone="sky">
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </ActionIcon>
  );
}

// Premium TTS — high-fidelity Georgian voice via the platform synthesis engine.
// Lifecycle: idle → loading (spinner) → playing (stop control). The first
// synthesis is cached as a blob URL + Audio element so repeat clicks replay
// instantly with zero additional API charge. Stops cleanly + frees the blob.
function SpeakerButton({ text, locale }: { text: string; locale: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => () => {
    try { audioRef.current?.pause(); } catch { /* noop */ }
    if (urlRef.current) { try { URL.revokeObjectURL(urlRef.current); } catch { /* noop */ } }
  }, []);

  const startPlayback = useCallback((audio: HTMLAudioElement) => {
    audio.onended = () => setState('idle');
    audio.play().then(() => setState('playing')).catch(() => setState('idle'));
  }, []);

  const onClick = useCallback(async () => {
    try {
      if (state === 'loading') return;
      // Active playback → stop + rewind.
      if (state === 'playing') {
        const a = audioRef.current;
        if (a) { try { a.pause(); a.currentTime = 0; } catch { /* noop */ } }
        setState('idle');
        return;
      }
      // Cached audio → replay instantly (no redundant API charge).
      if (audioRef.current && urlRef.current) { startPlayback(audioRef.current); return; }
      const clean = text.replace(/\s+/g, ' ').trim().slice(0, 800);
      if (!clean) return;
      setState('loading');
      const res = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, locale }),
      });
      if (!res.ok) { setState('idle'); return; }
      const blob = await res.blob();
      if (!blob.size) { setState('idle'); return; }
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      startPlayback(audio);
    } catch {
      setState('idle');
    }
  }, [state, text, locale, startPlayback]);

  const title = state === 'playing' ? 'Stop' : state === 'loading' ? 'Synthesizing' : 'Speak';
  return (
    <ActionIcon title={title} onClick={onClick} active={state === 'playing'} tone="cyan">
      {state === 'loading'
        ? <Loader2 size={13} className="animate-spin" />
        : state === 'playing'
          ? <Square size={13} className="fill-current" />
          : <Volume2 size={13} />}
    </ActionIcon>
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
        <KpiTile label={locale === 'ka' ? 'შეტყობინება' : 'Messages'} value={data.totalMessages} accent="#0ea5e9" />
        <KpiTile label={locale === 'ka' ? 'სურათი' : 'Images'} value={u.image} accent="#06b6d4" />
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
          { label: 'image', count: u.image,  color: 'linear-gradient(180deg,#06b6d4,#0e7490)' },
          { label: 'video', count: u.video,  color: 'linear-gradient(180deg,#f97316,#c2410c)' },
          { label: 'audio', count: u.audio,  color: 'linear-gradient(180deg,#06b6d4,#0891b2)' },
          { label: 'avatar', count: u.avatar, color: 'linear-gradient(180deg,#22d3ee,#0284c7)' },
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

interface PricePlan {
  id: 'starter' | 'pro' | 'ultimate';
  name: string;
  price: string;
  period: string;
  credits: string;
  creditsLabel: string;
  icon: typeof Zap;
  features: string[];
  popular?: boolean;
}

function BillingView({ locale }: { locale: string }) {
  const t = (ka: string, en: string, ru: string) => (locale === 'ka' ? ka : locale === 'ru' ? ru : en);
  const creditsLabel = t('კრედიტი / თვე', 'credits / month', 'кредитов / мес');

  const plans: PricePlan[] = [
    {
      id: 'starter', name: t('სტარტერი', 'Starter', 'Стартер'), price: '₾0',
      period: t('სამუდამოდ', 'forever', 'навсегда'), credits: '200', creditsLabel, icon: Sparkles,
      features: [
        t('ჩატი + სურათები', 'Chat + images', 'Чат + изображения'),
        t('საბაზისო მოდელები', 'Standard models', 'Базовые модели'),
        t('1 ავატარი', '1 avatar', '1 аватар'),
      ],
    },
    {
      id: 'pro', name: 'Pro', price: '₾9', period: t('თვეში', '/ month', '/ мес'),
      credits: '5,000', creditsLabel, icon: Zap, popular: true,
      features: [
        t('უპირატესი მოდელები', 'Premium models', 'Премиум-модели'),
        t('ვიდეო + მუსიკა', 'Video + music', 'Видео + музыка'),
        t('პრიორიტეტული რიგი', 'Priority queue', 'Приоритетная очередь'),
      ],
    },
    {
      id: 'ultimate', name: 'Ultimate', price: '₾29', period: t('თვეში', '/ month', '/ мес'),
      credits: '20,000', creditsLabel, icon: Crown,
      features: [
        t('HeyGen Pro ავატარები', 'HeyGen Pro avatars', 'HeyGen Pro аватары'),
        t('Voice Clone', 'Voice Clone', 'Клон голоса'),
        t('მაქს. პრიორიტეტი', 'Max priority', 'Макс. приоритет'),
      ],
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-md mx-auto pt-5 pb-10 space-y-5"
    >
      <header className="text-center space-y-1.5">
        <h2 className="text-[24px] font-bold tracking-tight text-white">
          {t('აირჩიე გეგმა', 'Choose your plan', 'Выберите план')}
        </h2>
        <p className="text-[13px] text-white/55 leading-relaxed px-2">
          {t('გაამძაფრე შემოქმედება — გაზარდე ან გააუქმე ნებისმიერ დროს.',
            'Scale your creativity — upgrade or cancel anytime.',
            'Масштабируйте творчество — меняйте план в любой момент.')}
        </p>
      </header>

      <div className="space-y-3.5">
        {plans.map((p, idx) => {
          const Icon = p.icon;
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.06 * idx, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              {/* Gradient halo ring — the memorable anchor on the Pro tier */}
              {p.popular && (
                <div aria-hidden className="absolute -inset-px rounded-[1.55rem] bg-gradient-to-br from-cyan-400/70 via-sky-500/45 to-blue-500/70" />
              )}
              <div
                className={`relative rounded-[1.5rem] p-5 border backdrop-blur-xl transition-all duration-300 ${
                  p.popular
                    ? 'border-transparent bg-[#0b0712] shadow-[0_20px_64px_-22px_rgba(56,189,248,0.6)]'
                    : 'border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.05]'
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] text-white bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 shadow-[0_6px_22px_-6px_rgba(37,99,235,0.85)] whitespace-nowrap">
                    <Sparkles size={11} /> {t('პოპულარული', 'Popular', 'Популярный')}
                  </span>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${p.popular ? 'bg-sky-500/20 text-cyan-200' : 'bg-white/[0.06] text-white/70'}`}>
                      <Icon size={17} />
                    </span>
                    <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/75 truncate">{p.name}</span>
                  </div>
                  <div className="text-right leading-none flex-shrink-0">
                    <span className="text-[26px] font-extrabold tabular-nums text-white">{p.price}</span>
                    <span className="block text-[11px] text-white/45 mt-1">{p.period}</span>
                  </div>
                </div>

                {/* Credit structure — high-contrast, unmissable */}
                <div className="mt-4 flex items-baseline gap-1.5 rounded-2xl bg-black/40 border border-white/[0.06] px-3.5 py-2.5">
                  <span className={`text-[22px] font-bold tabular-nums tracking-tight ${p.popular ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-sky-200' : 'text-white'}`}>{p.credits}</span>
                  <span className="text-[12px] text-white/55">{p.creditsLabel}</span>
                </div>

                <ul className="mt-3.5 space-y-2">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-[12.5px] text-white/75">
                      <Check size={14} className={`flex-shrink-0 ${p.popular ? 'text-cyan-300' : 'text-emerald-400'}`} />
                      <span className="truncate">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Credit → output guide — makes per-route cost legible to first-time
          guests. Mirrors PRODUCE_COST in lib/orchestrator/rate-limit.ts. */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55 mb-3">
          {t('რას ქმნის კრედიტი', 'What your credits make', 'Что создают кредиты')}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {([
            { icon: VideoIcon, label: t('ფილმი', 'Film', 'Фильм'), cr: 20 },
            { icon: UserIcon, label: t('ავატარი', 'Avatar', 'Аватар'), cr: 15 },
            { icon: SofaIcon, label: t('ინტერიერი 3D', 'Interior 3D', 'Интерьер 3D'), cr: 8 },
            { icon: MusicIcon, label: t('მუსიკა', 'Music', 'Музыка'), cr: 6 },
            { icon: ImageIcon, label: t('სურათი', 'Image', 'Изображение'), cr: 2 },
            { icon: Volume2, label: t('ხმა', 'Voice', 'Голос'), cr: 2 },
          ]).map(({ icon: Icon, label, cr }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[12.5px] text-white/75 min-w-0">
                <Icon size={14} className="text-sky-300 flex-shrink-0" />
                <span className="truncate">{label}</span>
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-cyan-200 flex-shrink-0">
                {cr} {t('კრ', 'cr', 'кр')}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-white/40 leading-relaxed">
          {t('მაგ: Pro-ს 5,000 კრედიტი = 250 ფილმი ან 2,500 სურათი.',
            "e.g. Pro's 5,000 credits = 250 films or 2,500 images.",
            'Напр.: 5,000 кредитов Pro = 250 фильмов или 2,500 изображений.')}
        </p>
      </div>

      <StripePortalButton locale={locale} />

      <p className="text-center text-[11px] text-white/35 leading-relaxed px-4">
        {t('გადახდები მუშავდება Stripe-ით. გააუქმე ნებისმიერ დროს.',
          'Payments are processed securely by Stripe. Cancel anytime.',
          'Платежи обрабатываются через Stripe. Отмена в любое время.')}
      </p>
    </motion.div>
  );
}

// Glassmorphic primary CTA — animated diagonal sheen on hover, explicit
// loading/active/focus states, perfectly centered within the billing column.
function StripePortalButton({ locale }: { locale: string }) {
  const [loading, setLoading] = useState(false);
  const label = locale === 'ka' ? 'Stripe პორტალის გახსნა' : locale === 'ru' ? 'Открыть портал Stripe' : 'Open Stripe Customer Portal';
  const openPortal = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const r = await fetch('/api/billing/portal', { method: 'POST', credentials: 'include' });
      const j = await r.json() as { url?: string };
      if (j.url) { window.location.href = j.url; return; }
      setLoading(false);
    } catch { setLoading(false); }
  }, [loading]);

  return (
    <button
      type="button"
      onClick={openPortal}
      disabled={loading}
      aria-label={label}
      className="group relative w-full overflow-hidden rounded-2xl px-5 py-3.5 flex items-center justify-center gap-2.5 border border-white/[0.14] bg-white/[0.06] backdrop-blur-xl text-white font-semibold text-[14px] transition-all duration-300 hover:bg-white/[0.10] hover:border-white/[0.24] hover:shadow-[0_14px_44px_-14px_rgba(56,189,248,0.55)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:opacity-70"
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/[0.16] to-transparent" />
      {loading
        ? <Loader2 size={16} className="relative animate-spin text-cyan-200" />
        : <CreditCard size={16} className="relative text-cyan-200" />}
      <span className="relative">{label}</span>
      {!loading && <ExternalLink size={14} className="relative text-white/50 group-hover:text-white/85 transition" />}
    </button>
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

          {/* Legal / support — deterministic routes, opened in a new tab so the
              chat session is never lost and no in-app panel can overlap/break. */}
          <div className="pt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-white/45">
            {[
              { href: `/${locale}/support`, label: locale === 'ka' ? 'მხარდაჭერა' : locale === 'ru' ? 'Поддержка' : 'Support' },
              { href: `/${locale}/privacy`, label: locale === 'ka' ? 'კონფიდენც.' : locale === 'ru' ? 'Приватность' : 'Privacy' },
              { href: `/${locale}/terms`, label: locale === 'ka' ? 'პირობები' : locale === 'ru' ? 'Условия' : 'Terms' },
              { href: `/${locale}/refund-policy`, label: locale === 'ka' ? 'დაბრუნება' : locale === 'ru' ? 'Возврат' : 'Refunds' },
            ].map((lnk, i, arr) => (
              <span key={lnk.href} className="inline-flex items-center gap-2.5">
                <a
                  href={lnk.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/85 underline-offset-2 hover:underline transition-colors"
                >
                  {lnk.label}
                </a>
                {i < arr.length - 1 && <span aria-hidden className="text-white/20">·</span>}
              </span>
            ))}
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
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'image', url, meta: { engine: 'AI Image', aspectRatio: ratio } } });
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
    const fps = opts?.renderSettings?.fps ?? 24;
    const res = await fetchWithRetry('/api/ltx-video', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, aspect_ratio, duration: 6, fps, generate_audio: true, ...(render ? { render } : {}) }),
      // Generation is expensive + non-idempotent: never auto-retry (a retry
      // would silently bill a second render). Allow 3 min — audio synthesis
      // adds to the ~25s video base.
    }, { signal, timeoutMs: 180_000, maxAttempts: 1 });
    if (!res.ok) {
      // Surface server's error body if present
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      throw new Error(`Video failed (${res.status}) ${detail}`.trim());
    }
    // Read the truthful render params the server actually applied.
    const hdrFps = Number(res.headers.get('x-render-fps')) || fps;
    const hdrRes = res.headers.get('x-render-resolution') || undefined;
    const blob = await res.blob();
    if (blob.size === 0) throw new Error('Empty video');
    const url = URL.createObjectURL(blob);
    patchMessage(setMessages, pendingId, {
      text: '',
      media: {
        kind: 'video',
        url,
        meta: { engine: 'LTX-2', fps: hdrFps, resolution: hdrRes, aspectRatio: aspect_ratio },
      },
    });
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
    patchMessage(setMessages, pendingId, { text: '', media: { kind: 'audio', url, meta: { engine: 'Udio' } } });
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
  patchMessage(setMessages, pendingId, { text: '', media: { kind: 'audio', url, meta: { engine: 'ElevenLabs', voiceProvider: 'ElevenLabs' } } });
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
    media: { kind: 'video', url: videoUrl, ...(posterUrl ? { poster: posterUrl } : {}), meta: { engine: 'HeyGen' } },
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
