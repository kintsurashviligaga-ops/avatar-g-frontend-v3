'use client';

import { motion } from 'framer-motion';
import { Sparkles, Waves } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useVoiceCall } from '@/hooks/useVoiceCall';

import { ActiveCallUI } from './ActiveCallUI';
import { CallHistory } from './CallHistory';
import { PhoneInputSheet } from './PhoneInputSheet';
import { VoiceCallButton } from './VoiceCallButton';
import { WebCallButton } from './WebCallButton';

type VoicePanelProps = {
  compact?: boolean;
};

function formatCallMeta(locale: string, createdAt: string, durationSeconds: number | null): string {
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(createdAt));
  const safe = Math.max(0, Math.floor(durationSeconds || 0));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${time} · ${min}:${String(sec).padStart(2, '0')}`;
}

function resolveErrorMessage(t: ReturnType<typeof useTranslations>, errorCode: string, browserGuide: string): string {
  if (!errorCode) {
    return '';
  }

  if (errorCode === 'insufficient_credits') {
    return t('creditWarning');
  }

  if (errorCode === 'mic_denied') {
    if (browserGuide === 'chrome') return t('micGuideChrome');
    if (browserGuide === 'safari') return t('micGuideSafari');
    if (browserGuide === 'firefox') return t('micGuideFirefox');
    return t('micDenied');
  }

  if (errorCode === 'invalid_phone' || errorCode === 'invalid_georgian_phone') {
    return t('phoneHint');
  }

  return t('callFailed');
}

export function VoicePanel({ compact }: VoicePanelProps) {
  const t = useTranslations('voice');
  const params = useParams();
  const locale = String(params?.locale || 'ka');

  const {
    phase,
    pending,
    countdownSeconds,
    callHistory,
    activeCall,
    latestCall,
    liveTranscript,
    activeJobTag,
    isMuted,
    callDropped,
    errorCode,
    browserGuide,
    phoneSheetOpen,
    setPhoneSheetOpen,
    initiateCallback,
    initiateWebCall,
    endCall,
    toggleMute,
    retryLastAction,
  } = useVoiceCall();

  const errorMessage = resolveErrorMessage(t, errorCode, browserGuide);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-cyan-300/25 bg-[linear-gradient(145deg,rgba(5,12,24,0.94),rgba(7,21,36,0.92))] p-3 sm:p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_5%,rgba(34,211,238,0.18),transparent_40%),radial-gradient(circle_at_10%_75%,rgba(56,189,248,0.15),transparent_35%)]" />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200/80">{t('sectionKicker')}</p>
          <h3 className="mt-1 inline-flex items-center gap-2 text-base font-semibold text-white">
            <Waves className="h-4.5 w-4.5 text-cyan-200" />
            {t('sectionTitle')}
          </h3>
          <p className="mt-1 text-sm text-white/60">{t('sectionSubtitle')}</p>
        </div>

        {!compact && latestCall && (
          <div className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-xs text-white/75">
            <p className="font-semibold text-white/85">{t('lastCall')}</p>
            <p>{formatCallMeta(locale, latestCall.created_at, latestCall.duration_seconds)}</p>
          </div>
        )}
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <VoiceCallButton
          phase={phase}
          pending={pending}
          countdownSeconds={countdownSeconds}
          onClick={() => {
            void initiateCallback();
          }}
        />

        <WebCallButton
          pending={pending}
          onClick={() => {
            void initiateWebCall();
          }}
        />
      </div>

      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mt-3 rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
        >
          {errorMessage}
        </motion.div>
      )}

      {latestCall?.status === 'ended' && latestCall.summary && (
        <motion.article
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mt-3 rounded-xl border border-emerald-300/35 bg-emerald-500/10 p-3"
        >
          <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-100">
            <Sparkles className="h-3.5 w-3.5" />
            {t('summary')}
          </p>
          <p className="mt-1 text-sm text-emerald-50/90">{latestCall.summary}</p>
        </motion.article>
      )}

      <div className="relative mt-3">
        <ActiveCallUI
          open={Boolean(activeCall && (activeCall.status === 'active' || phase === 'active'))}
          durationSeconds={activeCall?.duration_seconds || 0}
          transcript={liveTranscript}
          activeJobTag={activeJobTag}
          isMuted={isMuted}
          callDropped={callDropped}
          onToggleMute={toggleMute}
          onEnd={endCall}
          onRetry={retryLastAction}
        />
      </div>

      {!compact && (
        <div className="relative mt-3">
          <CallHistory calls={callHistory} />
        </div>
      )}

      <PhoneInputSheet
        open={phoneSheetOpen}
        pending={pending}
        errorCode={errorCode}
        onClose={() => setPhoneSheetOpen(false)}
        onSubmit={async (e164Phone, rememberPhone) => {
          await initiateCallback({
            phoneNumber: e164Phone,
            savePhone: rememberPhone,
            reason: 'dashboard_callback',
          });
        }}
      />
    </section>
  );
}

export default VoicePanel;
