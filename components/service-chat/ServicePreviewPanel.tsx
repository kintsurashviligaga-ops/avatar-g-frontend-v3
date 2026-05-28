'use client';

/**
 * components/service-chat/ServicePreviewPanel.tsx
 * ==================================================
 * Preview display for service outputs. Renders four lifecycle states:
 *
 *   pending / running →  Cyber-Black skeleton + staggered telemetry feed
 *                        (per-sub-agent status when `item.legs` is populated)
 *   ready             →  Image / video / audio / text card with a smooth
 *                        crossfade swap from the skeleton (framer AnimatePresence)
 *   failed            →  Inline error pill, accent rose
 *
 * When the composite music-video pipeline reports the music leg as ready
 * but the video leg is still rendering, an animated CSS waveform takes
 * the centre of the skeleton so the user has something visually responsive
 * to look at.
 */

import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { X, Download, AlertCircle, Maximize2, CheckCircle2, Loader2, CircleSlash } from 'lucide-react';
import type { PreviewItem, PreviewLeg, PreviewLegs, PreviewLegStatus, ServiceChatConfig } from './types';

interface Props {
  config: ServiceChatConfig;
  previews: PreviewItem[];
  language: string;
  onClearPreviews: () => void;
}

interface PreviewCopy {
  title: string;
  imagePreview: string;
  videoPreview: string;
  audioPreview: string;
  textPreview: string;
  workflowPreview: string;
  awaitingVideo: string;
}

function getPreviewCopy(language: string): PreviewCopy {
  const lang = language === 'ka' || language === 'ru' ? language : 'en';
  if (lang === 'ka') {
    return {
      title: 'პრევიუ',
      imagePreview: 'სურათის პრევიუ',
      videoPreview: 'ვიდეოს პრევიუ',
      audioPreview: 'აუდიოს პრევიუ',
      textPreview: 'ტექსტის პრევიუ',
      workflowPreview: 'Workflow პრევიუ',
      awaitingVideo: 'ვიდეო კლიპის რენდერი მიმდინარეობს...',
    };
  }
  if (lang === 'ru') {
    return {
      title: 'Превью',
      imagePreview: 'Предпросмотр изображения',
      videoPreview: 'Предпросмотр видео',
      audioPreview: 'Предпросмотр аудио',
      textPreview: 'Предпросмотр текста',
      workflowPreview: 'Предпросмотр workflow',
      awaitingVideo: 'Рендер видеоклипа в процессе...',
    };
  }
  return {
    title: 'Preview',
    imagePreview: 'Image preview',
    videoPreview: 'Video preview',
    audioPreview: 'Audio preview',
    textPreview: 'Text preview',
    workflowPreview: 'Workflow Preview',
    awaitingVideo: 'Cinematic video clip is still rendering…',
  };
}

export function ServicePreviewPanel({ config, previews, language, onClearPreviews }: Props) {
  if (previews.length === 0) return null;

  const latest = previews[previews.length - 1];
  const copy = getPreviewCopy(language);
  if (!latest) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex-shrink-0 overflow-hidden"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <div className="px-4 py-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: config.accentColor }}>
              {copy.title}
              {previews.length > 1 && ` (${previews.length})`}
            </span>
            <div className="flex items-center gap-1">
              <button className="p-1 rounded-lg hover:bg-zinc-900" style={{ color: 'var(--color-text-tertiary)' }}>
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button className="p-1 rounded-lg hover:bg-zinc-900" style={{ color: 'var(--color-text-tertiary)' }}>
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={onClearPreviews} className="p-1 rounded-lg hover:bg-zinc-900" style={{ color: 'var(--color-text-tertiary)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content — crossfade between skeleton and ready states using the
              item.id + status as the key so AnimatePresence triggers cleanly
              on every lifecycle transition. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${latest.id}-${latest.status ?? 'ready'}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <PreviewContent item={latest} accentColor={config.accentColor} copy={copy} />
            </motion.div>
          </AnimatePresence>

          {/* Thumbnail strip for multiple */}
          {previews.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {previews.map((p, i) => (
                <div
                  key={p.id}
                  className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden border"
                  style={{
                    borderColor: i === previews.length - 1 ? `${config.accentColor}60` : 'rgba(63,63,70,0.6)',
                    background: 'rgba(255,255,255,0.025)',
                  }}
                >
                  {p.thumbnail ? (
                    <Image src={p.thumbnail} alt="" width={48} height={48} unoptimized className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {i + 1}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ─── Telemetry feed (per-sub-agent status) ──────────────────────────────── */

function legStatusIcon(status: PreviewLegStatus, accentColor: string) {
  switch (status) {
    case 'ready':
      return <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#34d399' }} />;
    case 'running':
    case 'pending':
      return <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" style={{ color: accentColor }} />;
    case 'failed':
      return <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#f87171' }} />;
    case 'skipped':
      return <CircleSlash className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(212,212,216,0.45)' }} />;
  }
}

function TelemetryRow({ icon, leg, accentColor }: { icon: string; leg: PreviewLeg; accentColor: string }) {
  const statusText = leg.status === 'ready' ? '[DONE]'
    : leg.status === 'failed' ? '[FAIL]'
    : leg.status === 'skipped' ? '[SKIP]'
    : leg.progress != null ? `${Math.round(leg.progress)}%`
    : leg.status === 'running' ? '...' : '...';
  return (
    <div className="flex items-center gap-2 text-[12px] leading-relaxed font-mono" style={{ color: 'var(--color-text-secondary)' }}>
      {legStatusIcon(leg.status, accentColor)}
      <span className="text-[12px]">{icon}</span>
      <span className="flex-1 truncate">
        <span className="font-semibold text-zinc-100">{leg.label}</span>
        {leg.detail ? <span className="text-zinc-400">: {leg.detail}</span> : null}
        {leg.status === 'failed' && leg.error ? <span className="text-rose-300/80">: {leg.error}</span> : null}
      </span>
      <span className="tabular-nums text-[11px] text-zinc-400">{statusText}</span>
    </div>
  );
}

function TelemetryFeed({ legs, accentColor }: { legs: PreviewLegs; accentColor: string }) {
  // Render in the canonical Script → Music → Video order; extras tail.
  const rows: { icon: string; leg: PreviewLeg }[] = [];
  if (legs.lyrics) rows.push({ icon: '🤖', leg: legs.lyrics });
  if (legs.music) rows.push({ icon: '🎵', leg: legs.music });
  if (legs.video) rows.push({ icon: '🎬', leg: legs.video });
  for (const extra of legs.extra ?? []) rows.push({ icon: '⚙️', leg: extra });

  if (rows.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <motion.div
          key={`${row.leg.label}-${i}`}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06, duration: 0.25, ease: 'easeOut' }}
        >
          <TelemetryRow icon={row.icon} leg={row.leg} accentColor={accentColor} />
        </motion.div>
      ))}
    </div>
  );
}

/* ─── Waveform (music-ready, video-pending interlude) ────────────────────── */

const WAVEFORM_BARS = 28;

function Waveform({ accentColor }: { accentColor: string }) {
  // Pure-CSS animated bars. Each bar gets a deterministic phase offset so the
  // overall motion reads as a coherent waveform rather than random jitter.
  const bars = Array.from({ length: WAVEFORM_BARS }, (_, i) => i);
  return (
    <div className="flex items-end justify-center gap-[3px] h-16 w-full px-2">
      {bars.map((i) => {
        const delay = (i * 0.07) % 1.4;
        const baseHeight = 18 + ((i * 5) % 22);
        return (
          <span
            key={i}
            aria-hidden
            className="rounded-full"
            style={{
              width: 3,
              minHeight: 6,
              height: baseHeight,
              background: `linear-gradient(180deg, ${accentColor}, ${accentColor}55)`,
              animation: `pp-wave 1.4s ease-in-out ${delay}s infinite`,
              boxShadow: `0 0 6px -2px ${accentColor}88`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes pp-wave {
          0%, 100% { transform: scaleY(0.4); opacity: 0.7; }
          50%      { transform: scaleY(1.0); opacity: 1.0; }
        }
      `}</style>
    </div>
  );
}

/* ─── Cyber-Black pending state (with optional waveform + telemetry) ─────── */

function PendingState({
  accentColor, label, legs, showWaveform,
}: {
  accentColor: string;
  label: string;
  legs?: PreviewLegs;
  showWaveform: boolean;
}) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden border bg-zinc-900/80 backdrop-blur-md"
      style={{
        borderColor: `${accentColor}25`,
        boxShadow: `0 0 32px -16px ${accentColor}55, inset 0 0 0 1px rgba(255,255,255,0.02)`,
        minHeight: legs ? undefined : 140,
      }}
    >
      {/* Soft neon aura — radial gradient over the card. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(50% 50% at 50% 0%, ${accentColor}18 0%, transparent 70%)`,
        }}
      />
      {/* Animated grain shimmer — slower than the v1 shimmer, more subtle. */}
      <div
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          background: `linear-gradient(120deg, transparent 35%, ${accentColor}10 50%, transparent 65%)`,
          backgroundSize: '300% 100%',
          animation: 'pp-shimmer 2.4s ease-in-out infinite',
        }}
      />
      <div className="relative p-4">
        {showWaveform ? (
          <Waveform accentColor={accentColor} />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: accentColor }} />
            <span className="text-[12px] font-medium tracking-wide text-zinc-200">{label}</span>
          </div>
        )}
        {legs ? <TelemetryFeed legs={legs} accentColor={accentColor} /> : null}
      </div>
      <style>{`
        @keyframes pp-shimmer {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}

function FailedState({ accentColor, message }: { accentColor: string; message: string }) {
  return (
    <div
      className="rounded-xl p-3 border flex items-start gap-2"
      style={{ borderColor: 'rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)' }}
    >
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#f87171' }} />
      <span className="text-[12px] leading-snug text-zinc-100">{message}</span>
      <span className="ml-auto text-[10px] uppercase tracking-wider font-semibold opacity-60" style={{ color: accentColor }}>failed</span>
    </div>
  );
}

function PreviewContent({ item, accentColor, copy }: { item: PreviewItem; accentColor: string; copy: PreviewCopy }) {
  // Show the waveform if the music leg is ready but the video leg is still
  // running. This is the "post-beat, pre-cinematic-clip" interlude that the
  // blueprint specifically called for.
  const showWaveform = !!(
    item.legs?.music?.status === 'ready'
    && item.legs?.video && item.legs.video.status !== 'ready' && item.legs.video.status !== 'failed' && item.legs.video.status !== 'skipped'
  );

  if (item.status === 'pending' || item.status === 'running') {
    const label = item.title || (item.type === 'video' ? copy.videoPreview : item.type === 'audio' ? copy.audioPreview : item.type === 'text' ? copy.textPreview : copy.imagePreview);
    return <PendingState accentColor={accentColor} label={showWaveform ? copy.awaitingVideo : label} legs={item.legs} showWaveform={showWaveform} />;
  }
  if (item.status === 'failed') {
    return <FailedState accentColor={accentColor} message={item.errorMessage || 'Generation failed'} />;
  }

  switch (item.type) {
    case 'image':
      return (
        <div className="rounded-2xl overflow-hidden border bg-black/40" style={{ borderColor: 'rgba(63,63,70,0.6)' }}>
          {item.url ? (
            <Image src={item.url} alt={item.title || 'Preview'} width={1200} height={800} unoptimized className="w-full max-h-[220px] object-contain bg-black" />
          ) : (
            <div className="w-full h-[120px] flex items-center justify-center text-zinc-400">
              {copy.imagePreview}
            </div>
          )}
        </div>
      );

    case 'video':
      return (
        <div className="rounded-2xl overflow-hidden border bg-black" style={{ borderColor: 'rgba(63,63,70,0.6)' }}>
          {item.url ? (
            <video controls className="w-full max-h-[260px] bg-black">
              <source src={item.url} />
            </video>
          ) : (
            <div className="w-full h-[120px] flex items-center justify-center text-zinc-400">
              {copy.videoPreview}
            </div>
          )}
        </div>
      );

    case 'audio':
      return (
        <div className="rounded-2xl p-3 border bg-zinc-950" style={{ borderColor: 'rgba(63,63,70,0.6)' }}>
          {item.url ? (
            <audio controls className="w-full" style={{ height: 36 }}>
              <source src={item.url} />
            </audio>
          ) : (
            <div className="flex items-center justify-center py-4 text-zinc-500">
              {copy.audioPreview}
            </div>
          )}
          {/* If a secondary asset rides along (composite music-video: video
              alongside the primary music), render it inline beneath. */}
          {item.secondaryUrl ? (
            <video controls className="mt-3 w-full max-h-[220px] rounded-xl bg-black">
              <source src={item.secondaryUrl} />
            </video>
          ) : null}
          {item.title ? (
            <p className="text-[11px] mt-2 truncate text-zinc-400">{item.title}</p>
          ) : null}
        </div>
      );

    case 'text':
      return (
        <div
          className="rounded-2xl p-3 border max-h-[180px] overflow-y-auto text-[13px] leading-7 text-zinc-100 bg-zinc-950"
          style={{ borderColor: 'rgba(63,63,70,0.6)' }}
        >
          {item.content || copy.textPreview}
        </div>
      );

    case 'workflow':
      return (
        <div
          className="rounded-2xl p-3 border bg-zinc-950"
          style={{ borderColor: 'rgba(63,63,70,0.6)' }}
        >
          <div className="flex items-center gap-2" style={{ color: accentColor }}>
            <span className="text-[12px] font-medium">⚡ {copy.workflowPreview}</span>
          </div>
          {item.content ? (
            <p className="text-[12px] mt-2 text-zinc-300">{item.content}</p>
          ) : null}
        </div>
      );

    default:
      return null;
  }
}
