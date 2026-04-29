'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Mic, MicOff, PhoneOff, RadioTower } from 'lucide-react';
import { useTranslations } from 'next-intl';

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

type ActiveCallUIProps = {
  open: boolean;
  durationSeconds: number;
  transcript: string;
  activeJobTag: string;
  isMuted: boolean;
  callDropped?: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
  onRetry: () => void;
};

export function ActiveCallUI({
  open,
  durationSeconds,
  transcript,
  activeJobTag,
  isMuted,
  callDropped,
  onToggleMute,
  onEnd,
  onRetry,
}: ActiveCallUIProps) {
  const t = useTranslations('voice');

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="relative overflow-hidden rounded-2xl border border-cyan-300/30 bg-[#07101b]/85 p-4 shadow-[0_0_40px_rgba(34,211,238,0.18)]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.16),transparent_52%)]" />

          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/90">
              <RadioTower className="h-3.5 w-3.5" />
              {t('active')}
            </p>
            <p className="text-sm text-white/75">
              {t('duration')}: <span className="font-semibold text-white">{formatDuration(durationSeconds)}</span>
            </p>
          </div>

          <div className="relative mt-4 flex h-16 items-end gap-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            {Array.from({ length: 24 }).map((_, index) => (
              <motion.span
                key={index}
                className="w-1 rounded-full bg-cyan-300/75"
                animate={{
                  height: [8, 30 + ((index % 5) * 6), 10 + ((index % 3) * 4)],
                  opacity: [0.45, 0.9, 0.55],
                }}
                transition={{
                  duration: 1.4,
                  repeat: Number.POSITIVE_INFINITY,
                  delay: index * 0.04,
                }}
              />
            ))}
          </div>

          <div className="relative mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">{t('transcript')}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">
              {transcript || t('noTranscript')}
            </p>
          </div>

          {activeJobTag && (
            <div className="relative mt-3 rounded-xl border border-emerald-300/35 bg-emerald-400/10 p-3 text-sm text-emerald-100">
              {t('jobCreated')} {activeJobTag}
            </div>
          )}

          {callDropped && (
            <div className="relative mt-3 rounded-xl border border-amber-300/35 bg-amber-400/10 p-3 text-sm text-amber-100">
              <p>{t('callDropped')}</p>
              <button
                type="button"
                className="mt-2 rounded-lg border border-amber-200/45 bg-amber-300/20 px-2.5 py-1 text-xs font-semibold"
                onClick={onRetry}
              >
                {t('retry')}
              </button>
            </div>
          )}

          <div className="relative mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80"
            >
              {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {isMuted ? t('unmute') : t('mute')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('confirmEnd'))) {
                  onEnd();
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300/45 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              {t('endCall')}
            </button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

export default ActiveCallUI;
