"use client";

import { useEffect, useState } from 'react';
import { ServiceHeader } from '@/components/layout/ServiceHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/Spinner';

type Job = {
  id: string;
  service_slug: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempt_count: number;
  max_attempts: number;
  heartbeat_at: string | null;
  error_message: string | null;
  updated_at: string;
};

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const response = await fetch('/api/app/admin/jobs', { cache: 'no-store' });
      const data = await response.json();
      setJobs(data.jobs ?? []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div>
      <ServiceHeader title="Admin Job Diagnostics" description="Monitor failed and stuck processing jobs with retry/dead-letter indicators." />

      {loading ? (
        <Card>
          <CardContent className="py-10">
            <Spinner label="Loading diagnostics..." />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader>
                <div>
                  <CardTitle>{job.service_slug}</CardTitle>
                  <p className="text-xs text-app-muted">{job.id}</p>
                </div>
                <Badge variant={job.status === 'failed' ? 'danger' : 'warning'}>{job.status}</Badge>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 text-xs text-app-muted">
                  <span>attempts {job.attempt_count}/{job.max_attempts}</span>
                  <span>heartbeat {job.heartbeat_at ? new Date(job.heartbeat_at).toLocaleString() : 'none'}</span>
                  <span>updated {new Date(job.updated_at).toLocaleString()}</span>
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