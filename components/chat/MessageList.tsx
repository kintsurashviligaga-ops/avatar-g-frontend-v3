'use client';

/**
 * MessageList — the downward chat stream (Roadmap #12 decomposition).
 *
 * Owns the entire message-rendering subtree extracted from the MyAvatarChat
 * monolith: message bubbles (memoized rows), inline media, per-service context
 * actions, the toolbar (copy / regenerate / premium speak / like / dislike), the
 * orchestrator-driven suggested-action chips, and the empty state. Purely
 * presentational — all state + handlers stay in the MyAvatarChat container and
 * arrive as STABLE props, so React.memo keeps untouched rows from re-rendering
 * while the latest bubble streams.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, RotateCcw, ThumbsUp, ThumbsDown, Check, Copy, Square, Volume2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import InlineMedia, { detectInlineMedia } from '@/components/dashboard/command-center/InlineMedia';
import { buildSuggestedActions } from '@/lib/orchestrator/actions';
import type { AssetRef, PipelineContext, ServiceResponse, SuggestedAction } from '@/lib/orchestrator/types';
import type { ChatMessage, ServiceId, Locale } from '@/components/chat/types';
import { speakPremium, stopPremium } from '@/lib/audio/premium-tts';

// R3F is client-only + heavy — load the 3D room viewer on demand (no SSR).
const RoomViewer = dynamic(() => import('@/components/chat/RoomViewer'), {
  ssr: false,
  loading: () => (
    <div style={{ width: '100%', height: 320, borderRadius: 14, background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.10)' }} className="inline-media-skel" aria-busy="true" />
  ),
});

// ─── SuggestedActionRow — orchestrator-driven chip row below replies ─────────
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

// Suggested starter prompts — tappable, fill the composer (localized).
const SUGGESTIONS: Array<{ icon: string; ka: string; en: string; ru: string }> = [
  { icon: '🎬', ka: 'შექმენი 30 წამიანი კინემატოგრაფიული ფილმი ზღვაზე', en: 'Make a 30s cinematic film of the sea', ru: 'Сделай 30-сек кино о море' },
  { icon: '🖼️', ka: 'დახატე მთის პეიზაჟი მზის ჩასვლისას, 4K', en: 'A mountain landscape at sunset, 4K', ru: 'Горный пейзаж на закате, 4K' },
  { icon: '🏠', ka: 'დააპროექტე მოდერნი მისაღები ოთახი 3D-ში', en: 'Design a modern living room in 3D', ru: 'Спроектируй гостиную в 3D' },
  { icon: '🎵', ka: 'დაწერე თბილი ჯაზური ფონური მუსიკა', en: 'Compose warm jazz background music', ru: 'Сочини тёплый джаз' },
];

// ─── EmptyState — welcome + tappable suggested prompts (first-run UX) ─────────
function EmptyState({ locale, onPick }: { locale: Locale; onPick?: (text: string) => void }) {
  const welcome = locale === 'ka' ? 'რა გსურს?' : locale === 'ru' ? 'Чего хотите?' : 'What would you like?';
  const sub = locale === 'ka'
    ? 'ფილმი, ავატარი, მუსიკა, ხმა, ინტერიერი — ერთ სივრცეში.'
    : locale === 'ru'
      ? 'Фильм, аватар, музыка, голос, интерьер — в одном окне.'
      : 'Film, avatar, music, voice, interiors — all in one place.';
  const ease = [0.22, 1, 0.36, 1] as const;
  const pick = (s: typeof SUGGESTIONS[number]) => locale === 'ka' ? s.ka : locale === 'ru' ? s.ru : s.en;
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
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08, ease }}
        className="text-[30px] sm:text-[36px] font-semibold text-white tracking-tight leading-[1.1]"
      >
        {welcome}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.16, ease }}
        className="mt-2.5 max-w-xs text-[14px] text-white/45 leading-relaxed"
      >
        {sub}
      </motion.p>

      {/* Suggested prompts — tap to drop into the composer */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.26, ease }}
        className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl"
      >
        {SUGGESTIONS.map((s) => (
          <button
            key={s.en}
            type="button"
            onClick={() => onPick?.(pick(s))}
            className="group flex items-center gap-2.5 text-left rounded-2xl border border-white/[0.10] bg-white/[0.03] px-3.5 py-3 hover:border-sky-400/45 hover:bg-white/[0.06] hover:shadow-[0_8px_30px_-12px_rgba(56,189,248,0.6)] active:scale-[0.99] transition-all duration-200"
          >
            <span className="text-[18px] leading-none">{s.icon}</span>
            <span className="text-[13.5px] text-white/85 group-hover:text-white leading-snug">{pick(s)}</span>
          </button>
        ))}
      </motion.div>
    </div>
  );
}

// ─── MediaContextActions — contextual post-production chips under each media ──
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

// ─── MediaSkeleton — instant live-preview placeholder for media generations ──
// Renders the moment a media prompt is submitted (the pending message), then is
// swapped for the real player when patchMessage delivers the asset URL.
function MediaSkeleton({ service, label }: { service: ServiceId; label: string }) {
  const isAudio = service === 'music' || service === 'voice';
  const aspect = service === 'video' || service === 'interior'
    ? 'aspect-video'
    : service === 'avatar'
      ? 'aspect-[3/4]'
      : 'aspect-square';

  const ProgressBar = (
    <div className="mt-2 h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
      <motion.span
        className="block h-full w-2/5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
        animate={{ x: ['-45%', '255%'] }}
        transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
  const StatusRow = (
    <div className="flex items-center gap-2 text-[13px] font-medium text-white/85">
      <motion.span className="h-2 w-2 rounded-full bg-cyan-300"
        animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }} />
      <span className="truncate">{label}</span>
    </div>
  );
  const Shimmer = (
    <motion.span
      aria-hidden className="pointer-events-none absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.12] to-transparent"
      initial={{ x: '-120%' }} animate={{ x: '120%' }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    />
  );

  if (isAudio) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 shadow-[0_0_30px_-12px_rgba(56,189,248,0.5)]">
        <div className="relative flex items-end gap-[3px] h-12 overflow-hidden rounded-xl bg-black/30 px-3 py-2">
          {Shimmer}
          {[14, 26, 10, 30, 18, 24, 12, 28, 16, 22, 9, 20].map((h, i) => (
            <motion.span key={i} className="w-[3px] rounded-full bg-gradient-to-t from-blue-500 to-cyan-300"
              animate={{ height: [6, h, 8, h - 4, 6] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.06 }} />
          ))}
        </div>
        <div className="mt-2.5">{StatusRow}{ProgressBar}</div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden shadow-[0_0_30px_-12px_rgba(56,189,248,0.5)]">
      <div className={`relative ${aspect} w-full bg-gradient-to-br from-white/[0.07] to-white/[0.02] overflow-hidden`}>
        {Shimmer}
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 size={30} className="animate-spin text-cyan-300/90" />
        </div>
      </div>
      <div className="px-3.5 py-3">{StatusRow}{ProgressBar}</div>
    </motion.div>
  );
}

interface MessageRowProps {
  m: ChatMessage;
  locale: string;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onRegenerate: (id: string) => void;
  onRemix: (prompt: string) => void;
  onOpenInPreview: (m: ChatMessage) => void;
  onContextAction: (action: string, payload: { prompt: string; url?: string }) => void;
}

export const MessageRow = memo(function MessageRow({ m, locale, onLike, onDislike, onRegenerate, onRemix, onOpenInPreview, onContextAction }: MessageRowProps) {
  if (m.role === 'user') {
    return (
      <div data-msg-id={m.id} className="flex justify-end">
        <div className="max-w-[82%] flex flex-col items-end gap-1.5">
          {m.userImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.userImage} alt="" className="max-w-[220px] max-h-[220px] rounded-2xl object-cover border border-sky-400/20" />
          )}
          {m.text && (
            <div className="px-4 py-2.5 rounded-2xl bg-sky-500/[0.08] backdrop-blur-sm border border-sky-400/20 text-white text-[1.05rem] leading-[1.625] break-words shadow-[0_2px_16px_-6px_rgba(56,189,248,0.35)]">
              {m.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  const detected = !m.media && !m.pending ? detectInlineMedia(m.text) : null;
  const text = detected
    ? m.text
        .replace(detected.url, '')
        .replace(/\[([^\]]*)\]\(\s*\)/g, '$1')
        .replace(/\(\s*\)/g, '')
        .replace(/!\[([^\]]*)\]/g, '$1')
        .replace(/\s+:\s*$/m, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    : m.text;

  return (
    <div data-msg-id={m.id} className="flex flex-col items-start gap-2">
      {m.pending ? (
        m.service && m.service !== 'chat' && m.service !== 'app' ? (
          // Instant live-preview skeleton for media generations — swaps to the
          // real player the moment patchMessage delivers the asset URL.
          <MediaSkeleton service={m.service} label={m.text} />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="relative inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white/[0.04] border border-sky-400/20 text-white/85 text-[14px] overflow-hidden shadow-[0_0_24px_-8px_rgba(56,189,248,0.45)]"
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-500/0 via-cyan-400/[0.12] to-sky-500/0 animate-pulse" />
            <Loader2 size={14} className="relative animate-spin text-cyan-300" />
            <span className="relative">{m.text}</span>
          </motion.div>
        )
      ) : (
        <>
          {text && (
            <div className="max-w-[88%] px-1 text-white text-[1.05rem] leading-[1.625] break-words chat-md">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node: _n, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200 underline-offset-4 hover:underline" />,
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
              <button
                type="button"
                onClick={() => onOpenInPreview(m)}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 transition"
              >
                {locale === 'ka' ? 'პრევიუში გახსნა →' : 'Open in preview →'}
              </button>
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

          <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-500 mt-2.5">
            <CopyButton text={m.text} />
            <ActionIcon title="Regenerate" onClick={() => onRegenerate(m.id)}><RotateCcw size={17} /></ActionIcon>
            <SpeakerButton text={m.text} locale={locale} />
            <ActionIcon title="Like" onClick={() => onLike(m.id)} active={m.liked} tone="sky"><ThumbsUp size={17} /></ActionIcon>
            <ActionIcon title="Dislike" onClick={() => onDislike(m.id)} active={m.disliked} tone="cyan"><ThumbsDown size={17} /></ActionIcon>
          </div>
        </>
      )}
    </div>
  );
});

function ActionIcon({
  children, title, onClick, active, tone = 'sky',
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  tone?: 'sky' | 'cyan';
}) {
  const activeCls = tone === 'cyan'
    ? 'text-cyan-200 bg-blue-600/15 shadow-[0_0_14px_-2px_rgba(37,99,235,0.65)]'
    : 'text-sky-200 bg-sky-500/15 shadow-[0_0_14px_-2px_rgba(56,189,248,0.65)]';
  const handle = () => { try { onClick(); } catch { /* swallow */ } };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active ?? undefined}
      onClick={handle}
      className={`h-9 w-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${
        active ? activeCls : 'hover:text-cyan-300 hover:bg-white/[0.08]'
      }`}
    >
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const copy = useCallback(async () => {
    const fallback = (s: string): boolean => {
      try {
        const ta = document.createElement('textarea');
        ta.value = s; ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch { return false; }
    };
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); ok = true; }
      else ok = fallback(text);
    } catch { ok = fallback(text); }
    if (ok) {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <ActionIcon title={copied ? 'Copied' : 'Copy'} onClick={copy} active={copied} tone="sky">
      {copied ? <Check size={17} /> : <Copy size={17} />}
    </ActionIcon>
  );
}

// Premium TTS — routes through the shared streaming-capable speakPremium handler
// (ElevenLabs Georgian, progressive chunk-buffered playback; NEVER a browser voice).
function SpeakerButton({ text, locale }: { text: string; locale: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { try { audioRef.current?.pause(); } catch { /* noop */ } }, []);

  const onClick = useCallback(async () => {
    if (state === 'loading') return;
    if (state === 'playing') { stopPremium(); setState('idle'); return; }
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 800);
    if (!clean) return;
    setState('loading');
    const a = await speakPremium(clean, (locale === 'en' || locale === 'ru' ? locale : 'ka'));
    if (!a) { setState('idle'); return; }
    audioRef.current = a;
    setState('playing');
    a.addEventListener('ended', () => setState('idle'));
  }, [state, text, locale]);

  const title = state === 'playing' ? 'Stop' : state === 'loading' ? 'Synthesizing' : 'Speak';
  return (
    <ActionIcon title={title} onClick={onClick} active={state === 'playing'} tone="cyan">
      {state === 'loading'
        ? <Loader2 size={17} className="animate-spin" />
        : state === 'playing'
          ? <Square size={17} className="fill-current" />
          : <Volume2 size={17} />}
    </ActionIcon>
  );
}

// ─── MessageList — the downward stream container ─────────────────────────────
export interface MessageListProps {
  messages: ChatMessage[];
  locale: Locale;
  sending: boolean;
  endRef: React.RefObject<HTMLDivElement>;
  onLike: (id: string) => void;
  onDislike: (id: string) => void;
  onRegenerate: (id: string) => void;
  onRemix: (prompt: string) => void;
  onOpenInPreview: (m: ChatMessage) => void;
  onContextAction: (action: string, payload: { prompt: string; url?: string }) => void;
  onDispatchAction: (a: SuggestedAction) => void;
  onSuggestion?: (text: string) => void;
}

export function MessageList({
  messages, locale, sending, endRef,
  onLike, onDislike, onRegenerate, onRemix, onOpenInPreview, onContextAction, onDispatchAction, onSuggestion,
}: MessageListProps) {
  if (messages.length === 0) return <EmptyState locale={locale} onPick={onSuggestion} />;
  return (
    <div className="max-w-2xl mx-auto py-4 space-y-3">
      {messages.map(m => (
        <MessageRow
          key={m.id}
          m={m}
          locale={locale}
          onLike={onLike}
          onDislike={onDislike}
          onRegenerate={onRegenerate}
          onRemix={onRemix}
          onOpenInPreview={onOpenInPreview}
          onContextAction={onContextAction}
        />
      ))}
      {!sending && messages.length > 0 && (() => {
        const last = messages[messages.length - 1];
        if (!last || last.role !== 'assistant' || last.pending) return null;
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
          locale,
          assets: asset ? [asset] : [],
          lastIntent: last.service,
          notes: `last_user_prompt=${userPrompt.slice(0, 200)};`,
        };
        const actions = buildSuggestedActions(response, ctx);
        return <SuggestedActionRow actions={actions} onDispatch={onDispatchAction} />;
      })()}
      <div ref={endRef} />
    </div>
  );
}
