"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/browser';
import { Sparkles, LogOut, ArrowRight } from 'lucide-react';
import { SERVICE_REGISTRY } from '@/lib/service-registry';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';
import { ApiClientError, fetchJson, toUserMessage } from '@/lib/api/clientFetch';

type WorkspaceClientProps = {
  userEmail: string | null;
  locale?: string;
};

type WorkspaceJob = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | string;
  service_slug: string;
  created_at: string;
};

type WorkspaceOutput = {
  id: string;
  service_slug: string;
  created_at: string;
};

export default function WorkspaceClient({ userEmail, locale }: WorkspaceClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [jobs, setJobs] = useState<WorkspaceJob[]>([]);
  const [outputs, setOutputs] = useState<WorkspaceOutput[]>([]);
  const [loading, setLoading] = useState(Boolean(userEmail));
  const [apiError, setApiError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);

  const resolvedLocale = locale || getLocaleFromPathname(pathname);
  const toLocale = (path: string) => withLocalePath(path, resolvedLocale);

  const isAuthenticated = Boolean(userEmail);

  const featuredServices = SERVICE_REGISTRY;

  useEffect(() => {
    if (!isAuthenticated) {
      setJobs([]);
      setOutputs([]);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setApiError(null);
      setAuthExpired(false);
      try {
        const [jobsData, outputsData] = await Promise.all([
          fetchJson<{ jobs: WorkspaceJob[] }>('/api/app/jobs', { cache: 'no-store' }),
          fetchJson<{ outputs: WorkspaceOutput[] }>('/api/app/outputs', { cache: 'no-store' }),
        ]);

        setJobs(Array.isArray(jobsData.jobs) ? jobsData.jobs : []);
        setOutputs(Array.isArray(outputsData.outputs) ? outputsData.outputs : []);
      } catch (error) {
        setJobs([]);
        setOutputs([]);

        if (error instanceof ApiClientError && error.status === 401) {
          setAuthExpired(true);
          setApiError('Session expired. Please login again.');
        } else {
          setApiError(toUserMessage(error));
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isAuthenticated]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = createBrowserClient();
      await supabase.auth.signOut();
      router.replace(`/auth?next=${encodeURIComponent(toLocale('/workspace'))}`);
      router.refresh();
    } catch {
      router.replace(`/auth?next=${encodeURIComponent(toLocale('/workspace'))}`);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <main className="relative min-h-screen px-4 pb-8 pt-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 rounded-2xl border border-app-border/30 bg-app-surface/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-app-neon">Welcome to Avatar G</p>
              <h1 className="mt-1 text-2xl font-semibold text-app-text sm:text-3xl">Start new creation</h1>
              <p className="mt-1 text-sm text-app-muted">
                {isAuthenticated ? `Signed in as ${userEmail}` : 'Sign in to unlock private workspace features'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => router.push(toLocale('/services/avatar-builder'))}>
                <Sparkles className="mr-1 h-4 w-4" /> Start now
              </Button>
              {isAuthenticated ? (
                <Button variant="secondary" onClick={handleLogout} disabled={isLoggingOut}>
                  <LogOut className="mr-1 h-4 w-4" /> {isLoggingOut ? 'Logging out...' : 'Logout'}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/auth?next=${encodeURIComponent(toLocale('/workspace'))}`)}
                >
                  <LogOut className="mr-1 h-4 w-4" /> Login
                </Button>
              )}
            </div>
          </div>
        </div>

        {!isAuthenticated && (
          <Card className="mb-4 border-cyan-500/30 bg-cyan-500/5">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-cyan-100">You are viewing workspace in guest mode. Sign in to load jobs, outputs, and saved progress.</p>
                <Button onClick={() => router.push(`/auth?next=${encodeURIComponent(toLocale('/workspace'))}`)}>
                  Continue to Login
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isAuthenticated && apiError && (
          <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-amber-100">{apiError}</p>
                {authExpired ? (
                  <Button onClick={() => router.push(`/auth?next=${encodeURIComponent(toLocale('/workspace'))}`)}>
                    Login to Continue
                  </Button>
                ) : (
                  <Button onClick={() => router.refresh()}>
                    Retry
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Services</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {featuredServices.map((service) => (
                  <Link key={service.id} href={service.route} className="rounded-xl border border-white/10 bg-black/25 p-3 transition hover:border-app-neon/40 hover:bg-black/35">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm">{service.icon}</span>
                      <span className="text-sm font-medium text-app-text">{service.name}</span>
                    </div>
                    <p className="text-xs text-app-muted">{service.description}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge variant="success">Active</Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-app-muted" />
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-3 text-right">
                <Link href={toLocale('/services')} className="text-sm text-cyan-300 hover:text-cyan-200">View all {featuredServices.length} services</Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent outputs</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Spinner label="Loading..." />
              ) : outputs.length === 0 ? (
                <EmptyState title="No assets" description="Generated files appear here." />
              ) : (
                <div className="space-y-2">
                  {outputs.slice(0, 5).map((output) => (
                    <div key={output.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <p className="text-xs text-app-text">{output.service_slug}</p>
                      <p className="text-[11px] text-app-muted">{new Date(output.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 text-right">
                <Link href="/library" className="text-sm text-cyan-300 hover:text-cyan-200">Open library</Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Spinner label="Loading activity..." />
            ) : jobs.length === 0 ? (
              <EmptyState title="No jobs yet" description="Run any service to populate your activity timeline." />
            ) : (
              <div className="space-y-2">
                {jobs.slice(0, 8).map((job) => (
                  <div key={job.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-app-text">{job.service_slug}</p>
                      <Badge variant={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : 'warning'}>{job.status}</Badge>
                    </div>
                    <p className="text-[11px] text-app-muted">{new Date(job.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 text-right">
              <Link href="/jobs" className="text-sm text-cyan-300 hover:text-cyan-200">Open jobs center</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}