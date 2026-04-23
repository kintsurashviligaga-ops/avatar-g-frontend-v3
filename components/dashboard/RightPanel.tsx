'use client';

import Link from 'next/link';
import { ChevronRight, Coins, Eye, Globe2, History, Loader2, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  DashboardJob,
  DashboardJobStatusLabels,
  DashboardPreview,
  DashboardRecentRun,
  ServiceDefinition,
  ServiceMode,
  SupportedLocale,
} from '@/types/dashboard';

const DEFAULT_SUPPORTED_LOCALES = ['en', 'ka', 'ru'] as const;
const DEFAULT_JOB_STATUS_LABELS: Required<DashboardJobStatusLabels> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};
const FALLBACK_SERVICE: ServiceDefinition = {
  id: 'agent-g',
  icon: Eye,
  accent: 'from-cyan-500 to-indigo-600',
  group: 'featured',
  cost: 0,
  label: { en: 'Dashboard', ka: 'დეშბორდი', ru: 'Дашборд' },
  description: {
    en: 'Connected workspace preview.',
    ka: 'დაკავშირებული სამუშაო სივრცის პრევიუ.',
    ru: 'Превью связанного рабочего пространства.',
  },
  related: [],
  searchTerms: ['dashboard'],
};

interface RightPanelProps {
  locale?: SupportedLocale;
  currentMeta?: ServiceDefinition;
  livePreview?: DashboardPreview | null;
  activeJobs?: DashboardJob[];
  activeJobCount?: number;
  tokenBalance?: number;
  relatedServices?: ServiceDefinition[];
  recentRuns?: DashboardRecentRun[];
  supportedLocales?: readonly SupportedLocale[];
  previewTitle?: string;
  previewEmpty?: string;
  previewDownload?: string;
  activeJobsTitle?: string;
  noActiveJobs?: string;
  activeServiceTitle?: string;
  estimatedCostLabel?: string;
  currentServiceCostLabel?: string;
  activeServiceHint?: string;
  tokenBalanceTitle?: string;
  tokenHint?: string;
  relatedServicesTitle?: string;
  languageTitle?: string;
  recentRunsTitle?: string;
  activeContextLabel?: string;
  noRuns?: string;
  workspaceSettingsTitle?: string;
  workspaceSettingsDetail?: string;
  settingsHref?: string;
  jobTotalLabel?: string;
  noRelatedServicesLabel?: string;
  jobStatusLabels?: DashboardJobStatusLabels;
  onPreviewDownload?: () => void;
  onServiceChange?: (service: ServiceMode) => void;
  onLocaleChange?: (locale: SupportedLocale) => void;
}

export function RightPanel({
  locale = 'en',
  currentMeta = FALLBACK_SERVICE,
  livePreview = null,
  activeJobs = [],
  activeJobCount = 0,
  tokenBalance = 0,
  relatedServices = [],
  recentRuns = [],
  supportedLocales = DEFAULT_SUPPORTED_LOCALES,
  previewTitle = 'Preview',
  previewEmpty = 'No preview available yet.',
  previewDownload = 'Download output',
  activeJobsTitle = 'Active Jobs',
  noActiveJobs = 'No active jobs.',
  activeServiceTitle = 'Active Service',
  estimatedCostLabel = 'Est. Cost',
  currentServiceCostLabel = 'Included',
  activeServiceHint = 'Connected services stay available in this workspace.',
  tokenBalanceTitle = 'Token Balance',
  tokenHint = 'Synced from your current session.',
  relatedServicesTitle = 'Related Services',
  languageTitle = 'Language',
  recentRunsTitle = 'Recent Runs',
  activeContextLabel = 'Live Context',
  noRuns = 'No runs yet.',
  workspaceSettingsTitle = 'Workspace Settings',
  workspaceSettingsDetail = 'Manage account, billing, and preferences.',
  settingsHref,
  jobTotalLabel = 'total',
  noRelatedServicesLabel = 'No related services yet.',
  jobStatusLabels,
  onPreviewDownload,
  onServiceChange,
  onLocaleChange,
}: RightPanelProps) {
  const CurrentIcon = currentMeta.icon;
  const safeTokenBalance = Number.isFinite(tokenBalance) ? tokenBalance : 0;
  const resolvedJobStatusLabels = { ...DEFAULT_JOB_STATUS_LABELS, ...jobStatusLabels };

  return (
    <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
      <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">{previewTitle}</h2>
            {livePreview && (
              <p className="mt-1 text-sm text-slate-300/70">{livePreview.title || currentMeta.label[locale]}</p>
            )}
          </div>
          <Eye className="h-4 w-4 text-slate-500" />
        </div>
        <div className="mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-black/30">
          <div className="flex aspect-video items-center justify-center p-4">
            {!livePreview ? (
              <p className="text-center text-sm text-slate-500">{previewEmpty}</p>
            ) : livePreview.kind === 'image' && livePreview.url ? (
              <img src={livePreview.url} alt={livePreview.title || currentMeta.label[locale]} className="h-full w-full object-cover" />
            ) : livePreview.kind === 'video' && livePreview.url ? (
              <video controls className="h-full w-full rounded-[20px]" src={livePreview.url} />
            ) : livePreview.kind === 'audio' && livePreview.url ? (
              <audio controls className="w-full" src={livePreview.url} />
            ) : (
              <pre className="max-h-56 w-full overflow-auto whitespace-pre-wrap text-sm text-slate-200">{livePreview.text}</pre>
            )}
          </div>
        </div>
        {livePreview && (
          <button
            type="button"
            onClick={onPreviewDownload}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/15"
          >
            <Eye className="h-4 w-4" />
            {previewDownload}
          </button>
        )}
      </section>

      <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">{activeJobsTitle}</h2>
            <p className="mt-1 text-sm text-slate-400">{activeJobs.length} {jobTotalLabel}</p>
          </div>
          <Loader2 className={cn('h-4 w-4 text-cyan-300', activeJobCount > 0 && 'animate-spin')} />
        </div>
        <div className="mt-4 space-y-3">
          {activeJobs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">
              {noActiveJobs}
            </div>
          ) : activeJobs.map((job) => (
            <div key={job.id} className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">{job.label}</p>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{resolvedJobStatusLabels[job.status] ?? job.status}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    job.status === 'failed' ? 'bg-rose-400' : 'bg-gradient-to-r from-cyan-400 to-indigo-500'
                  )}
                  style={{ width: `${Math.max(6, Math.min(100, job.progress))}%` }}
                />
              </div>
              {job.detail && (
                <p className="mt-2 text-xs text-slate-400">{job.detail}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', currentMeta.accent)}>
            <CurrentIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">{activeServiceTitle}</h2>
            <p className="mt-2 text-base font-semibold text-white">{currentMeta.label[locale]}</p>
            <p className="mt-1 text-sm text-slate-300/70">{currentMeta.description[locale]}</p>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs uppercase tracking-[0.24em] text-slate-400">{estimatedCostLabel}</span>
            <span className="text-sm font-semibold text-white">{currentServiceCostLabel}</span>
          </div>
          <p className="mt-3 text-sm text-slate-300/70">{activeServiceHint}</p>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">{tokenBalanceTitle}</h2>
            <p className="mt-1 text-3xl font-semibold text-white">{safeTokenBalance.toFixed(2)}</p>
            <p className="mt-1 text-sm text-slate-300/70">{tokenHint}</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300">
            <Coins className="h-6 w-6" />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
        <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">{relatedServicesTitle}</h2>
        <div className="mt-4 space-y-2">
          {relatedServices.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">
              {noRelatedServicesLabel}
            </div>
          ) : relatedServices.map((service) => {
            const ServiceIcon = service.icon;
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => onServiceChange?.(service.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.07]"
              >
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br text-white', service.accent)}>
                  <ServiceIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{service.label[locale]}</p>
                  <p className="line-clamp-1 text-xs text-slate-400">{service.description[locale]}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
        <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">{languageTitle}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {supportedLocales.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onLocaleChange?.(item)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors',
                item === locale
                  ? 'border-cyan-400/30 bg-cyan-400/12 text-cyan-100'
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.08]'
              )}
            >
              <Globe2 className="h-4 w-4" />
              {item.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">{recentRunsTitle}</h2>
            <p className="mt-1 text-sm text-slate-400">{activeContextLabel}</p>
          </div>
          <History className="h-4 w-4 text-slate-500" />
        </div>
        <div className="mt-4 space-y-3">
          {recentRuns.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">
              {noRuns}
            </div>
          ) : recentRuns.map((item) => (
            <div key={item.id} className={cn(
              'rounded-3xl px-4 py-3',
              item.muted ? 'border border-white/8 bg-white/[0.03]' : 'border border-white/10 bg-white/[0.04]'
            )}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">{item.title}</p>
                <span className="text-xs text-slate-400">{item.timestamp}</span>
              </div>
              <p className={cn('mt-1 text-sm text-slate-300/70', item.muted && 'line-clamp-2')}>
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {settingsHref ? (
        <Link
          href={settingsHref}
          className="flex items-center justify-between rounded-[28px] border border-white/10 bg-black/25 px-5 py-4 text-sm text-slate-300 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-slate-200">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-white">{workspaceSettingsTitle}</p>
              <p className="text-sm text-slate-400">{workspaceSettingsDetail}</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </Link>
      ) : (
        <div className="flex items-center justify-between rounded-[28px] border border-white/10 bg-black/25 px-5 py-4 text-sm text-slate-300">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-slate-200">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-white">{workspaceSettingsTitle}</p>
              <p className="text-sm text-slate-400">{workspaceSettingsDetail}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}