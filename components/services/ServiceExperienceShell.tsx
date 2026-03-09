'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/Skeleton';
import { SERVICE_REGISTRY } from '@/lib/service-registry';
import { getServiceBySlug } from '@/lib/app/services';
import { ServiceHeader } from '@/components/services/ServiceHeader';
import { StatusBadge, type ServiceRunStatus } from '@/components/services/StatusBadge';
import { TierBadge } from '@/components/services/TierBadge';
import { CostBadge } from '@/components/services/CostBadge';
import { ExecutionProgress } from '@/components/services/ExecutionProgress';
import { RetryButton } from '@/components/services/RetryButton';
import { CancelButton } from '@/components/services/CancelButton';
import { ServiceCard } from '@/components/services/ServiceCard';

type ServiceJob = {
  id: string;
  service_slug: string;
  title: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  attempt_count: number;
  created_at: string;
  updated_at: string;
  error_message?: string | null;
};

type SortMode = 'newest' | 'oldest' | 'duration';
type FilterMode = 'all' | ServiceJob['status'];

type ServiceExperienceShellProps = {
  children: ReactNode;
  forcedSlug?: string;
};

function resolveServiceSlug(pathname: string): string | null {
  const match = pathname.match(/\/services\/([^/]+)/);
  return match?.[1] ?? null;
}

function jobDurationMs(job: Pick<ServiceJob, 'created_at' | 'updated_at'>): number {
  const start = new Date(job.created_at).getTime();
  const end = new Date(job.updated_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.round(ms / 100) / 10;
  return `${sec}s`;
}

export default function ServiceExperienceShell({ children, forcedSlug }: ServiceExperienceShellProps) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sort, setSort] = useState<SortMode>('newest');
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const slug = useMemo(() => forcedSlug ?? resolveServiceSlug(pathname), [forcedSlug, pathname]);

  const service = useMemo(() => {
    if (!slug) return null;
    const def = SERVICE_REGISTRY.find((entry) => entry.slug === slug || entry.id === slug);
    return {
      registry: def,
      app: getServiceBySlug(slug),
    };
  }, [slug]);

  const loadJobs = useCallback(async () => {
    if (!slug) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/app/jobs?service=${slug}`, { cache: 'no-store' });
      const data = (await response.json()) as { jobs?: ServiceJob[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load service history');
      }

      setJobs(data.jobs ?? []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load service history');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const activeJob = useMemo(
    () => jobs.find((job) => job.status === 'queued' || job.status === 'processing') ?? null,
    [jobs]
  );

  const visibleJobs = useMemo(() => {
    const filtered = filter === 'all' ? [...jobs] : jobs.filter((job) => job.status === filter);

    filtered.sort((left, right) => {
      if (sort === 'duration') return jobDurationMs(right) - jobDurationMs(left);
      if (sort === 'oldest') return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });

    return filtered;
  }, [jobs, filter, sort]);

  const avgExecutionMs = useMemo(() => {
    if (jobs.length === 0) return 0;
    const total = jobs.reduce((sum, job) => sum + jobDurationMs(job), 0);
    return Math.round(total / jobs.length);
  }, [jobs]);

  const totalCredits = useMemo(() => {
    const perJob = service?.app?.credits ?? 0;
    return perJob * jobs.length;
  }, [jobs.length, service?.app?.credits]);

  const runAction = useCallback(
    async (jobId: string, action: 'retry' | 'cancel') => {
      setBusyJobId(jobId);
      setError(null);

      try {
        const response = await fetch(`/api/app/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'retry' ? { retry: true } : { cancel: true }),
        });
        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(data.error || `Failed to ${action} job`);
        }

        await loadJobs();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : `Failed to ${action} job`);
      } finally {
        setBusyJobId(null);
      }
    },
    [loadJobs]
  );

  const status: ServiceRunStatus = activeJob ? activeJob.status : 'idle';
  const heading = service?.registry?.name ?? 'Service';
  const description = service?.registry?.description;
  const icon = service?.registry?.icon;

  return (
    <section className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <ServiceHeader
        icon={icon}
        title={heading}
        description={description}
        badges={
          <>
            <StatusBadge status={status} />
            <TierBadge plan="ENTERPRISE" />
            <CostBadge credits={service?.app?.credits ?? 0} />
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ServiceCard
          title="Execution"
          description="Live service status with retry and cancel controls"
          className="lg:col-span-2 transition-all duration-200"
        >
          <div className="space-y-3">
            <ExecutionProgress progress={activeJob?.progress ?? 0} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
              <span>Average execution: {formatDuration(avgExecutionMs)}</span>
              <span>•</span>
              <span>Credits used: {totalCredits}</span>
            </div>
          </div>
        </ServiceCard>

        <ServiceCard title="History Controls" description="Filter and sort execution history">
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="History filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value as FilterMode)}
              className="h-10 rounded-xl border border-white/[0.10] bg-[linear-gradient(135deg,rgba(7,14,30,0.85),rgba(4,9,22,0.75))] px-3 text-sm text-white/80 backdrop-blur-sm focus:border-cyan-400/35 focus:outline-none transition-all"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="duration">Longest</option>
            </select>
          </div>
        </ServiceCard>
      </div>

      {error ? (
        <Card className="border-red-400/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p className="text-sm text-red-200">{error}</p>
            <RetryButton onClick={() => void loadJobs()} loading={loading} />
          </CardContent>
        </Card>
      ) : null}

      <ServiceCard title="Execution History" description="Unified status, duration, credits, retry, and cancel patterns">
        <div className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : visibleJobs.length === 0 ? (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-sm text-white/40">
              No execution history yet for this service.
            </div>
          ) : (
            visibleJobs.slice(0, 10).map((job) => {
              const isBusy = busyJobId === job.id;
              const isActive = job.status === 'queued' || job.status === 'processing';

              return (
                <div key={job.id} className="grid gap-3 rounded-xl border border-white/[0.07] bg-[linear-gradient(135deg,rgba(7,14,30,0.70),rgba(4,9,22,0.60))] p-3 sm:grid-cols-[1fr_auto] hover:border-white/[0.12] transition-all">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={job.status} />
                      <span className="text-xs text-white/35">{formatDuration(jobDurationMs(job))}</span>
                      <CostBadge credits={service?.app?.credits ?? 0} compact />
                    </div>
                    <p className="text-sm text-white/80">{job.title}</p>
                    {job.error_message ? <p className="text-xs text-red-200">{job.error_message}</p> : null}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <RetryButton
                      onClick={() => void runAction(job.id, 'retry')}
                      disabled={job.status !== 'failed'}
                      loading={isBusy && job.status === 'failed'}
                    />
                    <CancelButton
                      onClick={() => void runAction(job.id, 'cancel')}
                      disabled={!isActive}
                      loading={isBusy && isActive}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ServiceCard>

      <div className="transition-opacity duration-200">{children}</div>
    </section>
  );
}
