'use client';

import { motion } from 'framer-motion';
import { Headphones } from 'lucide-react';
import { useTranslations } from 'next-intl';

type WebCallButtonProps = {
  pending?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function WebCallButton({ pending, disabled, onClick }: WebCallButtonProps) {
  const t = useTranslations('voice');

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={Boolean(disabled || pending)}
      whileHover={!disabled ? { y: -1 } : undefined}
      whileTap={!disabled ? { scale: 0.99 } : undefined}
      className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-55"
      aria-label={t('webCallButton')}
    >
      <Headphones className="h-4.5 w-4.5" />
      <span>{pending ? t('calling') : t('webCallButton')}</span>
    </motion.button>
  );
}

export default WebCallButton;
