"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { notFound, useParams } from 'next/navigation';
import { ServiceHeader } from '@/components/layout/ServiceHeader';
import { getServiceBySlug } from '@/lib/app/services';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

type Job = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  created_at: string;
  error_message?: string | null;
};

type Output = {
  id: string;
  service_slug: string;
  external_url: string | null;
  output_type: 'image' | 'video' | 'audio' | 'text';
  created_at: string;
};

export default function DynamicServicePage() {
  const params = useParams<{ slug: string }>();
  const service = useMemo(() => getServiceBySlug(params.slug), [params.slug]);
  const { addToast } = useToast();

  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);

  const loadData = useCallback(async () => {
    const [jobsRes, outputsRes] = await Promise.all([
      fetch(`/api/app/jobs?service=${params.slug}`, { cache: 'no-store' }),
      fetch('/api/app/outputs', { cache: 'no-store' }),
    ]);

    const jobsData = await jobsRes.json();
    const outputsData = await outputsRes.json();

    setJobs(jobsData.jobs ?? []);
    setOutputs(((outputsData.outputs ?? []) as Output[]).filter((output: Output) => output.service_slug === params.slug));
  }, [params.slug]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!service) {
    notFound();
  }

  const runService = async () => {
    if (!prompt.trim()) {
      addToast('error', 'Please enter a prompt');
      return;
    }

    setRunning(true);
    try {
      const response = await fetch(`/api/app/services/${service.slug}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          inputPayload: {
            mode: 'mvp',
            service: service.slug,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Run failed');

      addToast('success', `${service.name} output generated`);
      setPrompt('');
      await loadData();
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Service execution failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <ServiceHeader title={service.name} description={service.description} credits={service.credits} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Input</CardTitle>
          </CardHeader>
          <CardContent>
            <label className="mb-2 block text-xs uppercase tracking-wide text-app-muted">Prompt</label>
            <Input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={`Describe what you want ${service.name} to generate...`}
            />
            <Button className="mt-3 w-full" onClick={runService} disabled={running}>
              {running ? <Spinner label="Running..." /> : 'Run Service'}
            </Button>
            <p className="mt-2 text-xs text-app-muted">Estimated usage: {service.credits} credits per run.</p>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Outputs</CardTitle>
          </CardHeader>
          <CardContent>
            {outputs.length === 0 ? (
              <EmptyState title="No outputs yet" description="Run the service to generate your first result." />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {outputs.map((output) => (
                  <div key={output.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <Badge variant="accent">{output.output_type}</Badge>
                      <span className="text-xs text-app-muted">{new Date(output.created_at).toLocaleString()}</span>
                    </div>
                    {output.external_url ? (
                      <a href={output.external_url} target="_blank" rel="noreferrer" className="text-sm text-cyan-300 hover:text-cyan-200">
                        Open output
                      </a>
                    ) : (
                      <p className="text-sm text-app-muted">Stored in private bucket</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-app-muted">No runs yet.</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-app-text">{new Date(job.created_at).toLocaleString()}</span>
                    <Badge
                      variant={
                        job.status === 'completed'
                          ? 'success'
                          : job.status === 'failed'
                          ? 'danger'
                          : job.status === 'processing'
                          ? 'warning'
                          : 'neutral'
                      }
                    >
                      {job.status}
                    </Badge>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400" style={{ width: `${Math.max(job.progress, 2)}%` }} />
                  </div>
                  {job.error_message ? <p className="mt-2 text-xs text-red-300">{job.error_message}</p> : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}