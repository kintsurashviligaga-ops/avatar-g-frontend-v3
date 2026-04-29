'use client';

import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Globe2, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { VoiceCallRecord } from '@/types/voice';

type CallHistoryProps = {
  calls: VoiceCallRecord[];
};

function formatDuration(value: number | null): string {
  if (!value || value <= 0) {
    return '0:00';
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ka-GE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function directionIcon(direction: VoiceCallRecord['direction']) {
  if (direction === 'inbound') {
    return PhoneIncoming;
  }

  if (direction === 'outbound') {
    return PhoneOutgoing;
  }

  return Globe2;
}

export function CallHistory({ calls }: CallHistoryProps) {
  const t = useTranslations('voice');
  const params = useParams();
  const locale = String(params?.locale || 'ka');

  const [expandedId, setExpandedId] = useState<string>('');

  const rows = useMemo(() => calls.slice(0, 10), [calls]);

  return (
    <section className="rounded-xl border border-white/12 bg-black/25 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">{t('historyTitle')}</p>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-white/55">{t('noCalls')}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {rows.map((call) => {
            const Icon = directionIcon(call.direction);
            const isExpanded = expandedId === call.id;
            const jobs = Array.isArray(call.metadata?.jobs_created) ? (call.metadata.jobs_created as Array<Record<string, unknown>>) : [];

            return (
              <motion.article
                key={call.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-white/10 bg-white/[0.04] p-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-sm text-white/80">
                    <Icon className="h-4 w-4 text-cyan-200" />
                    <span>{t(`direction.${call.direction}`)}</span>
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/65">
                      {t(`status.${call.status}`)}
                    </span>
                  </div>

                  <div className="text-xs text-white/60">
                    <span>{formatDateTime(call.created_at)}</span>
                    <span className="mx-1.5">·</span>
                    <span>{t('duration')}: {formatDuration(call.duration_seconds)}</span>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="line-clamp-1 text-xs text-white/60">{call.summary || t('summary')}</p>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? '' : call.id)}
                    className="inline-flex items-center gap-1 text-xs text-cyan-100/80"
                  >
                    {isExpanded ? t('collapse') : t('expand')}
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-black/30 p-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">{t('transcript')}</p>
                    <p className="whitespace-pre-wrap text-sm text-white/78">{call.transcript || t('noTranscript')}</p>

                    {jobs.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">{t('jobsTitle')}</p>
                        <ul className="mt-1 space-y-1 text-xs text-cyan-100/85">
                          {jobs.map((job) => {
                            const id = String(job.id || '');
                            const label = String(job.service || id || 'job');

                            return (
                              <li key={id || label}>
                                <a href={`/${locale}/studio/history?job=${encodeURIComponent(id)}`} className="underline-offset-2 hover:underline">
                                  {label}
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </motion.article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default CallHistory;
