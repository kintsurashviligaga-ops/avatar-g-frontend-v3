'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { formatGeorgianLocalNumber, isValidGeorgianMobile, toGeorgianE164FromLocal } from '@/lib/voice/phone';

type PhoneInputSheetProps = {
  open: boolean;
  pending?: boolean;
  errorCode?: string;
  onClose: () => void;
  onSubmit: (e164Phone: string, rememberPhone: boolean) => Promise<void> | void;
};

export function PhoneInputSheet({ open, pending, errorCode, onClose, onSubmit }: PhoneInputSheetProps) {
  const t = useTranslations('voice');

  const [localNumber, setLocalNumber] = useState('');
  const [rememberPhone, setRememberPhone] = useState(true);

  useEffect(() => {
    if (!open) {
      setLocalNumber('');
      setRememberPhone(true);
    }
  }, [open]);

  const normalizedE164 = useMemo(() => toGeorgianE164FromLocal(localNumber), [localNumber]);
  const isValid = useMemo(() => isValidGeorgianMobile(normalizedE164), [normalizedE164]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-label={t('close')}
          />

          <motion.section
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg rounded-t-2xl border border-white/12 bg-[#090b14]/95 p-4 shadow-[0_0_40px_rgba(0,0,0,0.45)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">{t('enterPhone')}</p>
            <p className="mt-1 text-sm text-white/65">{t('phoneHint')}</p>

            <label className="mt-4 flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5">
              <span className="text-sm">🇬🇪</span>
              <span className="text-sm text-white/70">+995</span>
              <input
                value={formatGeorgianLocalNumber(localNumber)}
                onChange={(event) => setLocalNumber(event.target.value)}
                inputMode="numeric"
                placeholder={t('phoneHint')}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
              />
            </label>

            <label className="mt-3 inline-flex items-center gap-2 text-sm text-white/75">
              <input
                type="checkbox"
                checked={rememberPhone}
                onChange={(event) => setRememberPhone(event.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-white/10"
              />
              {t('savePhone')}
            </label>

            {errorCode === 'invalid_georgian_phone' && (
              <p className="mt-2 text-xs text-amber-300">{t('phoneHint')}</p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white/75"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={!isValid || pending}
                onClick={() => {
                  if (!isValid || pending) {
                    return;
                  }

                  void onSubmit(normalizedE164, rememberPhone);
                }}
                className="rounded-lg border border-cyan-300/45 bg-cyan-500/20 px-3 py-1.5 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? t('calling') : t('startCall')}
              </button>
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}

export default PhoneInputSheet;
