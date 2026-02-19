"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ServiceHeader } from '@/components/layout/ServiceHeader';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Briefcase } from 'lucide-react';

type Job = {
  id: string;
  service_slug: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  title: string;
  progress: number;
  created_at: string;
  updated_at: string;
  error_message: string | null;
};

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'queued', label: 'Queued' },
  { id: 'processing', label: 'Processing' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

export default function JobsPage() {
  const [status, setStatus] = useState('all');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    const query = status === 'all' ? '' : `?status=${status}`;
    const response = await fetch(`/api/app/jobs${query}`, { cache: 'no-store' });
    const data = await response.json();
    setJobs(data.jobs ?? []);
    setLoading(false);
  }, [status]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const counts = useMemo(
    () => ({
      all: jobs.length,
      queued: jobs.filter((job) => job.status === 'queued').length,
      processing: jobs.filter((job) => job.status === 'processing').length,
      completed: jobs.filter((job) => job.status === 'completed').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
    }),
    [jobs]
  );

  return (
    <div>
      <ServiceHeader title="Jobs Center" description="Track every generation job state across all 13 services." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs items={tabs} value={status} onChange={setStatus} />
        <div className="flex gap-2 text-xs text-app-muted">
          <Badge variant="neutral">Total {counts.all}</Badge>
          <Badge variant="success">Done {counts.completed}</Badge>
          <Badge variant="warning">Running {counts.processing + counts.queued}</Badge>
          <Badge variant="danger">Failed {counts.failed}</Badge>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10">
            <Spinner label="Loading jobs..." />
          </CardContent>
        </Card>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-5 w-5" />}
          title="No jobs yet"
          description="Run any service to see queued, processing, and completed jobs here."
        />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader>
                <div>
                  <CardTitle>{job.title}</CardTitle>
                  <p className="mt-1 text-xs text-app-muted">{job.service_slug}</p>
                </div>
                <Badge
                  variant={
                    job.status === 'completed'
                      ? 'success'
                      : job.status === 'failed'
                      ? 'danger'
                      : job.status === 'processing'
                      ? 'warning'
                      : 'accent'
                  }
                >
                  {job.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400"
                    style={{ width: `${Math.max(2, Math.min(100, job.progress || 0))}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-app-muted">
                  <span>{new Date(job.created_at).toLocaleString()}</span>
                  <span>{job.progress}%</span>
                </div>
                {job.error_message ? <p className="mt-2 text-xs text-red-300">{job.error_message}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}