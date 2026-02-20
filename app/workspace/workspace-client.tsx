"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { getOwnerId } from '@/lib/auth/identity';

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

type SavedAvatar = {
  id: string;
};

type BusinessAgentProject = {
  id: string;
  title: string;
  updated_at: string;
};

type VoiceLabProject = {
  id: string;
  title: string;
  updated_at: string;
};

type MarketplaceListingLite = {
  id: string;
  title: string;
  updated_at: string;
};

type MarketplaceInquiryLite = {
  id: string;
  subject: string | null;
  updated_at: string;
};

type MarketplaceFavoriteLite = {
  listing_id: string;
  created_at: string;
};

type AgentGTaskLite = {
  id: string;
  goal: string;
  status: string;
  created_at: string;
};

export default function WorkspaceClient({ userEmail, locale }: WorkspaceClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [jobs, setJobs] = useState<WorkspaceJob[]>([]);
  const [outputs, setOutputs] = useState<WorkspaceOutput[]>([]);
  const [loading, setLoading] = useState(Boolean(userEmail));
  const [apiError, setApiError] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [hasAvatar, setHasAvatar] = useState<boolean | null>(null);
  const [businessAgentProjects, setBusinessAgentProjects] = useState<BusinessAgentProject[]>([]);
  const [voiceLabProjects, setVoiceLabProjects] = useState<VoiceLabProject[]>([]);
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListingLite[]>([]);
  const [marketplaceInquiries, setMarketplaceInquiries] = useState<MarketplaceInquiryLite[]>([]);
  const [marketplaceFavorites, setMarketplaceFavorites] = useState<MarketplaceFavoriteLite[]>([]);
  const [agentGTasks, setAgentGTasks] = useState<AgentGTaskLite[]>([]);

  const resolvedLocale = locale || getLocaleFromPathname(pathname);
  const toLocale = (path: string) => withLocalePath(path, resolvedLocale);

  const isAuthenticated = Boolean(userEmail);
  const smmSource = searchParams.get('from') === 'smm';
  const smmProject = searchParams.get('project');
  const baSource = searchParams.get('from') === 'business-agent';
  const baProject = searchParams.get('project');
  const voiceLabSource = searchParams.get('from') === 'voice-lab';
  const voiceLabProject = searchParams.get('project');
  const marketplaceSource = searchParams.get('from') === 'marketplace';
  const marketplaceListing = searchParams.get('listing');
  const agentGSource = searchParams.get('from') === 'agent-g';
  const agentGTask = searchParams.get('task');

  const featuredServices = SERVICE_REGISTRY;

  useEffect(() => {
    if (!isAuthenticated) {
      setJobs([]);
      setOutputs([]);
      setHasAvatar(null);
      const raw = localStorage.getItem('business_agent_demo_projects_v1');
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as BusinessAgentProject[];
          setBusinessAgentProjects(Array.isArray(parsed) ? parsed : []);
        } catch {
          setBusinessAgentProjects([]);
        }
      } else {
        setBusinessAgentProjects([]);
      }
      const voiceRaw = localStorage.getItem('voice_lab_demo_projects_v1');
      if (voiceRaw) {
        try {
          const parsed = JSON.parse(voiceRaw) as VoiceLabProject[];
          setVoiceLabProjects(Array.isArray(parsed) ? parsed : []);
        } catch {
          setVoiceLabProjects([]);
        }
      } else {
        setVoiceLabProjects([]);
      }
      setMarketplaceListings([]);
      setMarketplaceInquiries([]);
      setMarketplaceFavorites([]);
      setAgentGTasks([]);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setApiError(null);
      setAuthExpired(false);
      try {
        const ownerId = await getOwnerId();
        const [jobsData, outputsData, businessData, voiceData, marketplaceListingData, marketplaceInquiryData, marketplaceFavoriteData, agentGData] = await Promise.all([
          fetchJson<{ jobs: WorkspaceJob[] }>('/api/app/jobs', { cache: 'no-store' }),
          fetchJson<{ outputs: WorkspaceOutput[] }>('/api/app/outputs', { cache: 'no-store' }),
          fetchJson<{ projects: BusinessAgentProject[] }>('/api/business-agent/projects', { cache: 'no-store' }),
          fetchJson<{ projects: VoiceLabProject[] }>('/api/voice-lab/projects', { cache: 'no-store' }),
          fetchJson<{ listings: MarketplaceListingLite[] }>('/api/marketplace/listings?mine=1&limit=5', { cache: 'no-store' }),
          fetchJson<{ inquiries: MarketplaceInquiryLite[] }>('/api/marketplace/inquiries?mine=1&limit=5', { cache: 'no-store' }),
          fetchJson<{ favorites: MarketplaceFavoriteLite[] }>('/api/marketplace/favorites?limit=5', { cache: 'no-store' }),
          fetchJson<{ tasks: AgentGTaskLite[] }>('/api/agent-g/status', { cache: 'no-store' }),
        ]);

        const avatarData = await fetchJson<{ avatars: SavedAvatar[] }>(
          `/api/avatars?owner_id=${encodeURIComponent(ownerId)}&limit=1`,
          { cache: 'no-store' }
        );

        setJobs(Array.isArray(jobsData.jobs) ? jobsData.jobs : []);
        setOutputs(Array.isArray(outputsData.outputs) ? outputsData.outputs : []);
        setBusinessAgentProjects(Array.isArray(businessData.projects) ? businessData.projects : []);
        setVoiceLabProjects(Array.isArray(voiceData.projects) ? voiceData.projects : []);
        setMarketplaceListings(Array.isArray(marketplaceListingData.listings) ? marketplaceListingData.listings : []);
        setMarketplaceInquiries(Array.isArray(marketplaceInquiryData.inquiries) ? marketplaceInquiryData.inquiries : []);
        setMarketplaceFavorites(Array.isArray(marketplaceFavoriteData.favorites) ? marketplaceFavoriteData.favorites : []);
        setAgentGTasks(Array.isArray(agentGData.tasks) ? agentGData.tasks : []);
        setHasAvatar(Array.isArray(avatarData.avatars) && avatarData.avatars.length > 0);
      } catch (error) {
        setJobs([]);
        setOutputs([]);
        setHasAvatar(false);
        setBusinessAgentProjects([]);
        setVoiceLabProjects([]);
        setMarketplaceListings([]);
        setMarketplaceInquiries([]);
        setMarketplaceFavorites([]);
        setAgentGTasks([]);

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

        {smmSource && (
          <Card className="mb-4 border-app-neon/30 bg-app-neon/5">
            <CardContent className="pt-6">
              <p className="text-sm text-app-text">
                Social Media Manager context loaded{smmProject ? ` for project: ${smmProject}` : ''}.
              </p>
            </CardContent>
          </Card>
        )}

        {baSource && (
          <Card className="mb-4 border-emerald-500/30 bg-emerald-500/10">
            <CardContent className="pt-6">
              <p className="text-sm text-emerald-100">
                Business Agent context loaded{baProject ? ` for project: ${baProject}` : ''}.
              </p>
            </CardContent>
          </Card>
        )}

        {voiceLabSource && (
          <Card className="mb-4 border-amber-500/30 bg-amber-500/10">
            <CardContent className="pt-6">
              <p className="text-sm text-amber-100">
                Voice Lab context loaded{voiceLabProject ? ` for project: ${voiceLabProject}` : ''}.
              </p>
            </CardContent>
          </Card>
        )}

        {marketplaceSource && (
          <Card className="mb-4 border-fuchsia-500/30 bg-fuchsia-500/10">
            <CardContent className="pt-6">
              <p className="text-sm text-fuchsia-100">
                Marketplace context loaded{marketplaceListing ? ` for listing: ${marketplaceListing}` : ''}.
              </p>
            </CardContent>
          </Card>
        )}

        {agentGSource && (
          <Card className="mb-4 border-cyan-500/30 bg-cyan-500/10">
            <CardContent className="pt-6">
              <p className="text-sm text-cyan-100">
                Agent G context loaded{agentGTask ? ` for task: ${agentGTask}` : ''}.
              </p>
            </CardContent>
          </Card>
        )}

        {isAuthenticated && hasAvatar === false && (
          <Card className="mb-4 border-blue-500/30 bg-blue-500/5">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-blue-100">No avatar found yet. Create your first avatar to unlock identity features.</p>
                <div className="flex gap-2">
                  <Button onClick={() => router.push(toLocale('/services/avatar-builder'))}>
                    Create Your First Avatar
                  </Button>
                  <Button variant="secondary" onClick={() => router.push(`${toLocale('/workspace')}?create=true`)}>
                    Open Create Mode
                  </Button>
                </div>
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

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Business Agent projects</CardTitle>
          </CardHeader>
          <CardContent>
            {businessAgentProjects.length === 0 ? (
              <EmptyState title="No Business Agent projects" description="Create your first Business Agent plan and it appears here." />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {businessAgentProjects.slice(0, 9).map((project) => (
                  <Link
                    key={project.id}
                    href={`${toLocale('/services/business-agent')}?project=${encodeURIComponent(project.id)}`}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 transition hover:border-emerald-400/50"
                  >
                    <p className="text-sm text-app-text">{project.title}</p>
                    <p className="text-[11px] text-app-muted">{new Date(project.updated_at).toLocaleString()}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Voice Lab projects</CardTitle>
          </CardHeader>
          <CardContent>
            {voiceLabProjects.length === 0 ? (
              <EmptyState title="No Voice Lab projects" description="Create your first Voice Lab project and it appears here." />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {voiceLabProjects.slice(0, 9).map((project) => (
                  <Link
                    key={project.id}
                    href={`${toLocale('/services/voice-lab')}?project=${encodeURIComponent(project.id)}`}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 transition hover:border-amber-400/50"
                  >
                    <p className="text-sm text-app-text">{project.title}</p>
                    <p className="text-[11px] text-app-muted">{new Date(project.updated_at).toLocaleString()}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Marketplace activity</CardTitle>
          </CardHeader>
          <CardContent>
            {marketplaceListings.length === 0 && marketplaceInquiries.length === 0 && marketplaceFavorites.length === 0 ? (
              <EmptyState title="No Marketplace activity" description="Create listings, favorite items, or send inquiries to populate this panel." />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">My listings</p>
                  {marketplaceListings.slice(0, 5).map((item) => (
                    <Link
                      key={item.id}
                      href={`${toLocale('/services/marketplace/listings')}/${item.id}`}
                      className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-app-text transition hover:border-fuchsia-400/50"
                    >
                      <p>{item.title}</p>
                      <p className="text-[11px] text-app-muted">{new Date(item.updated_at).toLocaleString()}</p>
                    </Link>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">Inquiries</p>
                  {marketplaceInquiries.slice(0, 5).map((item) => (
                    <Link
                      key={item.id}
                      href={`${toLocale('/services/marketplace/inbox')}?inquiry=${encodeURIComponent(item.id)}`}
                      className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-app-text transition hover:border-fuchsia-400/50"
                    >
                      <p>{item.subject || 'Inquiry'}</p>
                      <p className="text-[11px] text-app-muted">{new Date(item.updated_at).toLocaleString()}</p>
                    </Link>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">Favorites</p>
                  {marketplaceFavorites.slice(0, 5).map((item) => (
                    <Link
                      key={item.listing_id}
                      href={`${toLocale('/services/marketplace/listings')}/${item.listing_id}`}
                      className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-app-text transition hover:border-fuchsia-400/50"
                    >
                      <p>{item.listing_id}</p>
                      <p className="text-[11px] text-app-muted">{new Date(item.created_at).toLocaleString()}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 text-right">
              <Link href={toLocale('/services/marketplace/my')} className="text-sm text-cyan-300 hover:text-cyan-200">Open seller dashboard</Link>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Agent G tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {agentGTasks.length === 0 ? (
              <EmptyState title="No Agent G tasks" description="Run Agent G orchestration and task history appears here." />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {agentGTasks.slice(0, 9).map((task) => (
                  <Link
                    key={task.id}
                    href={`${toLocale('/services/agent-g/dashboard')}?task=${encodeURIComponent(task.id)}`}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 transition hover:border-cyan-400/50"
                  >
                    <p className="text-sm text-app-text line-clamp-2">{task.goal}</p>
                    <p className="text-[11px] text-app-muted">{task.status} • {new Date(task.created_at).toLocaleString()}</p>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-3 text-right">
              <Link href={toLocale('/services/agent-g')} className="text-sm text-cyan-300 hover:text-cyan-200">Open Agent G</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}