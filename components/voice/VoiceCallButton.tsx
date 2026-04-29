'use client';

import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';

type VoiceCallPhase = 'idle' | 'requesting_phone' | 'calling' | 'ringing' | 'active' | 'ended';

type VoiceCallButtonProps = {
  phase: VoiceCallPhase;
  countdownSeconds: number;
  pending?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function resolveLabel(t: ReturnType<typeof useTranslations>, phase: VoiceCallPhase, countdownSeconds: number): string {
  if (phase === 'calling') {
    return `${t('calling')} ${Math.max(0, countdownSeconds)}s`;
  }

  if (phase === 'ringing') {
    return t('ringing');
  }

  if (phase === 'active') {
    return t('active');
  }

  if (phase === 'ended') {
    return t('ended');
  }

  if (phase === 'requesting_phone') {
    return t('enterPhone');
  }

  return t('callButton');
}

export function VoiceCallButton({ phase, countdownSeconds, pending, disabled, onClick }: VoiceCallButtonProps) {
  const t = useTranslations('voice');
  const label = resolveLabel(t, phase, countdownSeconds);

  const isInteractive = !disabled && !pending;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!isInteractive}
      whileHover={isInteractive ? { y: -1 } : undefined}
      whileTap={isInteractive ? { scale: 0.99 } : undefined}
      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border border-cyan-300/40 bg-cyan-400/15 px-4 py-2.5 text-sm font-semibold text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_0_28px_rgba(34,211,238,0.12)] transition disabled:cursor-not-allowed disabled:opacity-60"
      aria-label={label}
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.28),transparent_50%)] opacity-90" />
      <motion.span
        animate={phase === 'idle' ? { scale: [1, 1.12, 1] } : undefined}
        transition={phase === 'idle' ? { duration: 1.35, repeat: Number.POSITIVE_INFINITY } : undefined}
        className="relative"
      >
        <Mic className="h-4.5 w-4.5" />
      </motion.span>
      <span className="relative">{label}</span>
    </motion.button>
  );
}

export default VoiceCallButton;
