'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  HelpCircle,
  ImageIcon,
  Loader2,
  Music,
  Sparkles,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { fetchJson } from '@/lib/api/clientFetch';
import { createBrowserClient } from '@/lib/supabase/browser';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';
import { fallbackSmmTemplates, generateSmmPlan } from '@/lib/smm/generator';
import type {
  SmmAudienceLang,
  SmmBrandVoice,
  SmmGeneratedPost,
  SmmGoal,
  SmmPlatform,
  SmmPost,
  SmmProject,
} from '@/lib/smm/types';

type WizardState = {
  goal: SmmGoal;
  audienceLang: SmmAudienceLang;
  persona: string;
  platforms: SmmPlatform[];
  brandVoice: SmmBrandVoice;
  brandSample: string;
  timeframeDays: 7 | 14 | 30;
  projectTitle: string;
};

const DRAFT_KEY = 'smm_wizard_draft_v1';
const GOALS: Array<{ id: SmmGoal; ka: string; en: string }> = [
  { id: 'grow_followers', ka: 'მომწერების ზრდა', en: 'Grow followers' },
  { id: 'sell_product', ka: 'პროდუქტის გაყიდვა', en: 'Sell product' },
  { id: 'build_brand', ka: 'ბრენდის გაძლიერება', en: 'Build brand' },
  { id: 'announce_event', ka: 'ღონისძიების ანონსი', en: 'Announce event' },
  { id: 'recruit', ka: 'რეკრუტინგი', en: 'Recruit' },
  { id: 'tourism_promo', ka: 'ტურიზმის პრომო', en: 'Tourism promo' },
];
const PERSONAS = ['business', 'cafe', 'freelancer', 'realtor', 'tourism', 'music-artist'];
const PLATFORMS: SmmPlatform[] = ['instagram', 'tiktok', 'youtube_shorts', 'facebook', 'telegram', 'linkedin'];
const BRAND_VOICES: SmmBrandVoice[] = ['luxury', 'friendly', 'corporate', 'noir', 'energetic'];

function defaultWizardState(isEn: boolean): WizardState {
  return {
    goal: 'grow_followers',
    audienceLang: isEn ? 'en' : 'ka',
    persona: 'business',
    platforms: ['instagram', 'facebook'],
    brandVoice: 'friendly',
    brandSample: '',
    timeframeDays: 7,
    projectTitle: isEn ? 'My social media growth plan' : 'ჩემი სოციალური მედიის გეგმა',
  };
}

function toIcal(posts: SmmGeneratedPost[], title: string) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Avatar G//SMM//EN'];

  posts.forEach((post, idx) => {
    if (!post.scheduled_at) return;
    const dt = new Date(post.scheduled_at).toISOString().replace(/[-:]/g, '').replace('.000Z', 'Z');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:smm-${idx}-${Date.now()}@myavatar.ge`);
    lines.push(`SUMMARY:${title} - ${post.title}`);
    lines.push(`DTSTART:${dt}`);
    lines.push(`DESCRIPTION:${post.caption}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\n');
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function SocialMediaManagerPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = getLocaleFromPathname(pathname);
  const isEn = locale === 'en';

  const [wizardOpen, setWizardOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(defaultWizardState(isEn));
  const [posts, setPosts] = useState<SmmGeneratedPost[]>([]);
  const [projects, setProjects] = useState<SmmProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectPosts, setActiveProjectPosts] = useState<SmmPost[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  const progress = Math.round((step / 8) * 100);
  const projectDeepLink = activeProjectId ? `project=${activeProjectId}&from=smm` : 'from=smm';

  const integrationLinks = useMemo(
    () => [
      {
        title: 'Avatar Builder',
        desc: isEn ? 'Create creator avatar' : 'შექმენი კონტენტ-ავატარი',
        href: withLocalePath('/services/avatar-builder', locale) + '?intent=creator-avatar&lang=' + locale,
      },
      {
        title: 'Video Studio',
        desc: isEn ? 'Generate reels' : 'დააგენერირე რილსები',
        href:
          withLocalePath('/services/video-studio', locale) +
          `?intent=reel&topic=${encodeURIComponent(state.projectTitle)}&lang=${locale}`,
      },
      {
        title: 'Image Architect',
        desc: isEn ? 'Create post visuals' : 'შექმენი პოსტის ვიზუალები',
        href:
          withLocalePath('/services/image-architect', locale) +
          `?intent=post-image&style=${state.brandVoice}&lang=${locale}`,
      },
      {
        title: 'Music Studio',
        desc: isEn ? 'Background music for reels' : 'ფონური მუსიკა რილსებისთვის',
        href:
          withLocalePath('/services/music-studio', locale) +
          `?intent=bg-music&mood=${state.brandVoice}&lang=${locale}`,
      },
      {
        title: 'Workspace',
        desc: isEn ? 'Project hub & approvals' : 'პროექტების ჰაბი',
        href: withLocalePath('/workspace', locale) + `?${projectDeepLink}`,
      },
    ],
    [isEn, locale, projectDeepLink, state.brandVoice, state.projectTitle]
  );

  const requestHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (!authenticated) {
      headers['x-demo-mode'] = '1';
    }

    return headers;
  }, [authenticated]);

  useEffect(() => {
    const boot = async () => {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setAuthenticated(Boolean(user));

      const rawDraft = localStorage.getItem(DRAFT_KEY);
      if (rawDraft) {
        try {
          const parsed = JSON.parse(rawDraft) as { state?: WizardState; posts?: SmmGeneratedPost[]; step?: number };
          if (parsed.state) setState(parsed.state);
          if (Array.isArray(parsed.posts)) setPosts(parsed.posts);
          if (typeof parsed.step === 'number') setStep(parsed.step);
        } catch {
          localStorage.removeItem(DRAFT_KEY);
        }
      }

      if (searchParams.get('create') === 'true') {
        setWizardOpen(true);
      }
    };

    void boot();
  }, [searchParams]);

  useEffect(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        state,
        posts,
        step,
      })
    );
  }, [state, posts, step]);

  useEffect(() => {
    const loadProjects = async () => {
      setLoadingProjects(true);
      setError(null);
      try {
        const data = await fetchJson<{ projects: SmmProject[] }>('/api/smm/projects' + (authenticated ? '' : '?demo=1'), {
          headers: requestHeaders,
          cache: 'no-store',
        });
        setProjects(data.projects || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      } finally {
        setLoadingProjects(false);
      }
    };

    void loadProjects();
  }, [authenticated, requestHeaders]);

  const generatePlan = async () => {
    setGenerating(true);
    setError(null);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      const generated = generateSmmPlan({
        goal: state.goal,
        audienceLang: state.audienceLang,
        platforms: state.platforms,
        brandVoice: state.brandVoice,
        persona: state.persona,
        timeframeDays: state.timeframeDays,
      });
      setPosts(generated);
    } catch {
      setPosts(fallbackSmmTemplates());
      setError(isEn ? 'AI planning fallback loaded.' : 'AI დაგეგმვის ნაცვლად ჩატვირთულია საბაზო შაბლონები.');
    } finally {
      setGenerating(false);
    }
  };

  const saveProject = async () => {
    if (posts.length === 0) {
      setError(isEn ? 'Generate plan first.' : 'ჯერ დააგენერირე კონტენტ-გეგმა.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await fetchJson<{ project: SmmProject }>('/api/smm/projects', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          title: state.projectTitle,
          goal: state.goal,
          audience_lang: state.audienceLang,
          platforms: state.platforms,
          brand_voice: state.brandVoice,
        }),
      });

      const projectId = created.project.id;

      const savedPosts = await fetchJson<{ posts: SmmPost[] }>(`/api/smm/projects/${projectId}/posts`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ posts }),
      });

      setActiveProjectId(projectId);
      setActiveProjectPosts(savedPosts.posts || []);
      setProjects((prev) => [created.project, ...prev.filter((item) => item.id !== created.project.id)]);
      setStep(8);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  const loadProjectDashboard = async (projectId: string) => {
    setLoadingProjects(true);
    try {
      const data = await fetchJson<{ project: SmmProject | null; posts: SmmPost[] }>(
        `/api/smm/projects/${projectId}${authenticated ? '' : '?demo=1'}`,
        { headers: requestHeaders, cache: 'no-store' }
      );

      if (data.project) {
        setActiveProjectId(data.project.id);
        setActiveProjectPosts(data.posts || []);
        setWizardOpen(true);
        setStep(8);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoadingProjects(false);
    }
  };

  const exportPosts = async (format: 'csv' | 'json') => {
    try {
      const payload = activeProjectId ? { projectId: activeProjectId, format } : { format, posts };
      const data = await fetchJson<{ format: 'csv' | 'json'; content: string }>('/api/smm/export' + (authenticated ? '' : '?demo=1'), {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(payload),
      });

      if (data.format === 'csv') {
        downloadText('smm-plan.csv', data.content, 'text/csv;charset=utf-8;');
      } else {
        downloadText('smm-plan.json', data.content, 'application/json;charset=utf-8;');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const exportIcal = () => {
    const source = activeProjectPosts.length > 0
      ? activeProjectPosts.map((post) => ({
          day_index: post.day_index,
          title: post.title,
          hook: post.hook,
          caption: post.caption,
          hashtags: post.hashtags,
          status: post.status,
          scheduled_at: post.scheduled_at,
        }))
      : posts;

    const content = toIcal(source, state.projectTitle);
    downloadText('smm-plan.ics', content, 'text/calendar;charset=utf-8;');
  };

  const copyNotionTable = async () => {
    const source = activeProjectPosts.length > 0 ? activeProjectPosts : posts;
    const header = '| Day | Title | Hook | CTA | Status |\n|---|---|---|---|---|';
    const rows = source.map(
      (post) =>
        `| ${post.day_index} | ${post.title.replace(/\|/g, ' ')} | ${post.hook.replace(/\|/g, ' ')} | ${(post.caption || '').slice(0, 70).replace(/\|/g, ' ')} | ${post.status} |`
    );
    await navigator.clipboard.writeText([header, ...rows].join('\n'));
  };

  const openAssetTool = async (post: SmmGeneratedPost | SmmPost, type: 'image' | 'video' | 'music' | 'avatar') => {
    if (activeProjectPosts.length > 0 && 'id' in post && post.id) {
      try {
        await fetchJson('/api/smm/posts/' + post.id + '/assets' + (authenticated ? '' : '?demo=1'), {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify({ type, provider: 'avatar-g', status: 'pending', meta: { from: 'smm' } }),
        });
      } catch {
        // Keep navigation non-blocking.
      }
    }

    const title = encodeURIComponent(post.title);
    const lang = state.audienceLang;
    const map: Record<typeof type, string> = {
      image: `${withLocalePath('/services/image-creator', locale)}?intent=post-image&topic=${title}&style=${state.brandVoice}&lang=${lang}`,
      video: `${withLocalePath('/services/video-studio', locale)}?intent=reel&topic=${title}&lang=${lang}`,
      music: `${withLocalePath('/services/music-studio', locale)}?intent=bg-music&mood=${state.brandVoice}&lang=${lang}`,
      avatar: `${withLocalePath('/services/avatar-builder', locale)}?intent=creator-avatar&topic=${title}&lang=${lang}`,
    };

    router.push(map[type]);
  };

  return (
    <main className="relative min-h-screen bg-[#05070A]">
      <SpaceBackground />

      <div className="relative z-10 px-4 pb-16 pt-24">
        <div className="mx-auto max-w-7xl space-y-8">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-2 text-xs text-fuchsia-200">
              <Sparkles className="h-3.5 w-3.5" /> {isEn ? 'Social Media Manager' : 'სოციალური მედიის მენეჯერი'}
            </div>
            <h1 className="mt-4 text-3xl font-bold text-white sm:text-5xl">
              {isEn ? 'Plan, create and scale social content in one workflow' : 'დაგეგმე, შექმენი და გაზარდე სოციალური კონტენტი ერთ სივრცეში'}
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-gray-300 sm:text-lg">
              {isEn
                ? 'A simple guided wizard for non-technical teams: content plan, assets, scheduling, and performance dashboard.'
                : 'არატექნიკური გუნდებისთვის მარტივი, ნაბიჯ-ნაბიჯ ვორქფლო: კონტენტ-გეგმა, ასეტები, დაგეგმვა და შედეგები.'}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" className="min-h-[48px] bg-gradient-to-r from-fuchsia-500 to-rose-500" onClick={() => setWizardOpen(true)}>
                {isEn ? 'Start in 1 minute' : 'დაიწყე 1-წუთში'}
              </Button>
              <Button size="lg" variant="secondary" className="min-h-[48px]" onClick={() => document.getElementById('examples')?.scrollIntoView({ behavior: 'smooth' })}>
                {isEn ? 'See examples' : 'ნახე მაგალითები'}
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              {['AI-ით', 'მარტივად', 'პროფესიონალურად'].map((badge) => (
                <span key={badge} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-200">
                  {badge}
                </span>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3" id="examples">
            {[
              { title: isEn ? 'Choose goal' : 'აირჩიე მიზანი', desc: isEn ? 'Growth, sales, brand, events.' : 'ზრდა, გაყიდვა, ბრენდი, ღონისძიებები.' },
              { title: isEn ? 'Generate plan' : 'დააგენერირე გეგმა', desc: isEn ? '7/14/30 day ready-to-edit calendar.' : '7/14/30 დღიანი რედაქტირებადი კალენდარი.' },
              { title: isEn ? 'Publish + track' : 'გამოაქვეყნე + აკონტროლე', desc: isEn ? 'Schedule, export and monitor.' : 'დაგეგმე, გააქპორტე და აკონტროლე.' },
            ].map((item, index) => (
              <Card key={item.title} className="border-white/10 bg-white/5 p-5">
                <div className="mb-2 text-xs text-fuchsia-200">0{index + 1}</div>
                <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm text-gray-300">{item.desc}</p>
              </Card>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              ['Content Calendar', '7/14/30 day content timeline'],
              ['Post Generator', 'Georgian / English / Russian copy'],
              ['Brand Voice Presets', 'Luxury, friendly, corporate and more'],
              ['Asset Pipeline', 'Video, image, music and avatar flow'],
              ['Scheduling', 'Store now, publish integrations soon'],
              ['Analytics Dashboard', 'Track status and next actions'],
            ].map(([title, desc]) => (
              <Card key={title} className="border-white/10 bg-white/5 p-5">
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <p className="mt-1 text-sm text-gray-300">{desc}</p>
              </Card>
            ))}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">{isEn ? 'Integrations' : 'ინტეგრაციები'}</h2>
              <Link href={withLocalePath('/workspace', locale)} className="text-sm text-cyan-300 hover:text-cyan-200">
                {isEn ? 'Open workspace hub' : 'გახსენი Workspace'}
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              {integrationLinks.map((item) => (
                <Card key={item.title} className="border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                  <p className="mt-1 text-xs text-gray-300">{item.desc}</p>
                  <Link href={item.href} className="mt-3 inline-flex text-sm text-fuchsia-300 hover:text-fuchsia-200">
                    Open
                  </Link>
                </Card>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { name: 'Free', feature: '3 planned posts/week' },
              { name: 'Pro', feature: 'Unlimited + scheduling + analytics' },
              { name: 'Enterprise', feature: 'Team workflows + approvals' },
            ].map((plan) => (
              <Card key={plan.name} className="border-white/10 bg-white/5 p-5">
                <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                <p className="mt-1 text-sm text-gray-300">{plan.feature}</p>
              </Card>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">FAQ</h2>
            {[
              {
                q: isEn ? 'Can I use this without login?' : 'შემიძლია ლოგინის გარეშე გამოყენება?',
                a: isEn ? 'Yes. Demo mode stores draft and lets you finish wizard.' : 'კი. დემო რეჟიმი ინახავს დრაფტს და გაძლევს wizard-ის დასრულებას.',
              },
              {
                q: isEn ? 'Is scheduling live?' : 'არის თუ არა scheduling უკვე ჩართული?',
                a: isEn ? 'Schedules are stored now; direct publishing integrations are next.' : 'ამ ეტაპზე გრაფიკი ინახება; პირდაპირი გამოქვეყნების ინტეგრაციები მალე დაემატება.',
              },
              {
                q: isEn ? 'Can I generate assets from plan?' : 'შეგიძლია თუ არა გეგმიდან ასეტების გენერაცია?',
                a: isEn ? 'Yes, each post has deep links to Video, Image, Music and Avatar tools.' : 'კი, თითო პოსტიდან პირდაპირ შეგიძლია გახსნა Video, Image, Music და Avatar სერვისები.',
              },
            ].map((faq) => (
              <Card key={faq.q} className="border-white/10 bg-white/5 p-4">
                <h3 className="text-sm font-semibold text-white">{faq.q}</h3>
                <p className="mt-1 text-sm text-gray-300">{faq.a}</p>
              </Card>
            ))}
          </section>

          <section className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 p-6 text-center">
            <h2 className="text-2xl font-semibold text-white">{isEn ? 'Ready to ship social content every week?' : 'მზად ხარ ყოველ კვირა სტაბილური კონტენტი გამოაქვეყნო?'}</h2>
            <Button className="mt-4 min-h-[48px] bg-gradient-to-r from-fuchsia-500 to-rose-500" onClick={() => setWizardOpen(true)}>
              {isEn ? 'Start wizard now' : 'დაიწყე wizard ახლავე'}
            </Button>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">{isEn ? 'Projects' : 'პროექტები'}</h2>
              <Button variant="secondary" onClick={() => setWizardOpen(true)}>
                {isEn ? 'New project' : 'ახალი პროექტი'}
              </Button>
            </div>

            {loadingProjects ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {[1, 2].map((item) => (
                  <Card key={item} className="h-24 animate-pulse border-white/10 bg-white/5" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <Card className="border-white/10 bg-white/5 p-6 text-center">
                <p className="text-sm text-gray-300">{isEn ? 'No projects yet.' : 'პროექტები ჯერ არ გაქვს.'}</p>
                <Button className="mt-3" onClick={() => setWizardOpen(true)}>
                  {isEn ? 'Create your first project' : 'შექმენი პირველი პროექტი'}
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {projects.map((project) => (
                  <Card key={project.id} className="border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">{project.title}</div>
                    <p className="mt-1 text-xs text-gray-300">{project.goal} • {project.audience_lang.toUpperCase()} • {project.platforms.join(', ')}</p>
                    <Button className="mt-3" variant="secondary" onClick={() => void loadProjectDashboard(project.id)}>
                      {isEn ? 'Open dashboard' : 'დაფის ნახვა'}
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/20 px-4 py-3 text-sm text-cyan-100 shadow-lg backdrop-blur"
      >
        <HelpCircle className="h-4 w-4" /> Help
      </button>

      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <Card className="w-full max-w-md border-white/10 bg-[#0B1020] p-5 text-white">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Quick Tips</h3>
              <button type="button" onClick={() => setHelpOpen(false)}>
                <X className="h-5 w-5 text-gray-300" />
              </button>
            </div>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>• Start with a clear goal.</li>
              <li>• Keep 2-3 platforms for better consistency.</li>
              <li>• Generate 7-day plan first, then expand.</li>
              <li>• Use integrations per post to speed asset production.</li>
            </ul>
            <Button className="mt-4 w-full" onClick={() => setHelpOpen(false)}>Close</Button>
          </Card>
        </div>
      )}

      {wizardOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4">
          <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#0A0F1C] p-5 sm:p-7">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">{isEn ? 'Social Media Wizard' : 'Social Media Wizard'}</h2>
                <p className="text-xs text-gray-300">{isEn ? `Step ${step}/8` : `ნაბიჯი ${step}/8`}</p>
              </div>
              <button type="button" onClick={() => setWizardOpen(false)} className="rounded-full border border-white/20 p-2 text-gray-300 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-6 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-500" style={{ width: `${progress}%` }} />
            </div>

            {error && <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

            {step === 1 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-white">{isEn ? 'Choose goal' : 'აირჩიე მიზანი'}</h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {GOALS.map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => setState((prev) => ({ ...prev, goal: goal.id }))}
                      className={`rounded-xl border px-4 py-3 text-left text-sm transition ${state.goal === goal.id ? 'border-fuchsia-500 bg-fuchsia-500/15 text-white' : 'border-white/15 text-gray-300 hover:border-white/30'}`}
                    >
                      {isEn ? goal.en : goal.ka}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">{isEn ? 'Audience' : 'აუდიტორია'}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(['ka', 'en', 'ru'] as SmmAudienceLang[]).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setState((prev) => ({ ...prev, audienceLang: lang }))}
                      className={`rounded-lg border px-3 py-2 text-sm ${state.audienceLang === lang ? 'border-fuchsia-500 bg-fuchsia-500/15 text-white' : 'border-white/15 text-gray-300'}`}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>
                <select
                  value={state.persona}
                  onChange={(event) => setState((prev) => ({ ...prev, persona: event.target.value }))}
                  className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                >
                  {PERSONAS.map((persona) => (
                    <option key={persona} value={persona}>{persona}</option>
                  ))}
                </select>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">{isEn ? 'Platforms' : 'პლატფორმები'}</h3>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {PLATFORMS.map((platform) => {
                    const active = state.platforms.includes(platform);
                    return (
                      <button
                        key={platform}
                        type="button"
                        onClick={() =>
                          setState((prev) => ({
                            ...prev,
                            platforms: active
                              ? prev.platforms.filter((item) => item !== platform)
                              : [...prev.platforms, platform],
                          }))
                        }
                        className={`rounded-lg border px-3 py-2 text-sm ${active ? 'border-fuchsia-500 bg-fuchsia-500/15 text-white' : 'border-white/15 text-gray-300'}`}
                      >
                        {platform}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">{isEn ? 'Brand voice' : 'ბრენდის ხმა'}</h3>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  {BRAND_VOICES.map((voice) => (
                    <button
                      key={voice}
                      type="button"
                      onClick={() => setState((prev) => ({ ...prev, brandVoice: voice }))}
                      className={`rounded-lg border px-3 py-2 text-sm capitalize ${state.brandVoice === voice ? 'border-fuchsia-500 bg-fuchsia-500/15 text-white' : 'border-white/15 text-gray-300'}`}
                    >
                      {voice}
                    </button>
                  ))}
                </div>
                <textarea
                  value={state.brandSample}
                  onChange={(event) => setState((prev) => ({ ...prev, brandSample: event.target.value }))}
                  className="h-28 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                  placeholder={isEn ? 'Paste existing text to match tone...' : 'ჩასვი არსებული ტექსტი ტონის მისამსგავსებლად...'}
                />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">{isEn ? 'Content plan' : 'კონტენტ-გეგმა'}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {[7, 14, 30].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setState((prev) => ({ ...prev, timeframeDays: days as 7 | 14 | 30 }))}
                      className={`rounded-lg border px-3 py-2 text-sm ${state.timeframeDays === days ? 'border-fuchsia-500 bg-fuchsia-500/15 text-white' : 'border-white/15 text-gray-300'}`}
                    >
                      {days} დღე
                    </button>
                  ))}
                  <Button type="button" onClick={() => void generatePlan()} disabled={generating || state.platforms.length === 0}>
                    {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                    {isEn ? 'Generate plan' : 'გეგმის გენერაცია'}
                  </Button>
                </div>

                {generating ? (
                  <div className="grid grid-cols-1 gap-2">
                    {[1, 2, 3].map((item) => (
                      <div key={item} className="h-20 animate-pulse rounded-lg border border-white/10 bg-white/5" />
                    ))}
                  </div>
                ) : posts.length === 0 ? (
                  <Card className="border-white/10 bg-white/5 p-4 text-sm text-gray-300">
                    {isEn ? 'Generate plan to start editing post titles, hooks, CTA and hashtags.' : 'დააგენერირე გეგმა, შემდეგ შეცვალე სათაური, hook, CTA და ჰეშთეგები.'}
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {posts.map((post, index) => (
                      <Card key={`${post.day_index}-${index}`} className="border-white/10 bg-white/5 p-4">
                        <div className="mb-2 text-xs text-cyan-300">Day {post.day_index}</div>
                        <input
                          value={post.title}
                          onChange={(event) => {
                            const value = event.target.value;
                            setPosts((prev) => prev.map((row, idx) => (idx === index ? { ...row, title: value } : row)));
                          }}
                          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                        <textarea
                          value={post.caption}
                          onChange={(event) => {
                            const value = event.target.value;
                            setPosts((prev) => prev.map((row, idx) => (idx === index ? { ...row, caption: value } : row)));
                          }}
                          className="mt-2 h-20 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 6 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">{isEn ? 'Asset generation' : 'ასეტების გენერაცია'}</h3>
                {posts.length === 0 ? (
                  <Card className="border-white/10 bg-white/5 p-4 text-sm text-gray-300">{isEn ? 'Generate posts first.' : 'ჯერ დააგენერირე პოსტები.'}</Card>
                ) : (
                  <div className="space-y-2">
                    {(activeProjectPosts.length > 0 ? activeProjectPosts : posts).map((post) => {
                      const postId = (post as unknown as { id?: string }).id;
                      return (
                      <Card key={postId || `${post.day_index}-${post.title}`} className="border-white/10 bg-white/5 p-4">
                        <div className="text-sm font-semibold text-white">{post.title}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => void openAssetTool(post, 'image')}><ImageIcon className="mr-1 h-4 w-4" />Generate Image</Button>
                          <Button size="sm" variant="secondary" onClick={() => void openAssetTool(post, 'video')}><Video className="mr-1 h-4 w-4" />Generate Video Reel</Button>
                          <Button size="sm" variant="secondary" onClick={() => void openAssetTool(post, 'music')}><Music className="mr-1 h-4 w-4" />Generate Music</Button>
                          <Button size="sm" variant="secondary" onClick={() => void openAssetTool(post, 'avatar')}><Sparkles className="mr-1 h-4 w-4" />Use Avatar</Button>
                        </div>
                      </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {step === 7 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">{isEn ? 'Scheduling' : 'დაგეგმვა'}</h3>
                <p className="text-sm text-amber-200">{isEn ? 'Publishing integrations coming soon.' : 'Publishing integrations coming soon.'}</p>

                <div className="grid grid-cols-1 gap-2">
                  {posts.map((post, index) => (
                    <Card key={`${post.day_index}-${index}`} className="border-white/10 bg-white/5 p-3">
                      <div className="text-sm text-white">{post.title}</div>
                      <input
                        type="datetime-local"
                        value={post.scheduled_at ? new Date(post.scheduled_at).toISOString().slice(0, 16) : ''}
                        onChange={(event) => {
                          const value = event.target.value;
                          setPosts((prev) => prev.map((row, idx) => (idx === index ? { ...row, scheduled_at: value ? new Date(value).toISOString() : null, status: value ? 'scheduled' : row.status } : row)));
                        }}
                        className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                      />
                    </Card>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void exportPosts('csv')}>Export CSV</Button>
                  <Button variant="secondary" onClick={() => void exportPosts('json')}>Export JSON</Button>
                  <Button variant="secondary" onClick={exportIcal}>Export iCal</Button>
                  <Button variant="secondary" onClick={() => void copyNotionTable()}>Copy Notion Table</Button>
                </div>
              </div>
            )}

            {step === 8 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">{isEn ? 'Dashboard' : 'დაფა'}</h3>
                <Card className="border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {isEn ? 'Plan is ready' : 'გეგმა მზად არის'}</div>
                  <p className="mt-1 text-sm">{state.projectTitle}</p>
                </Card>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Card className="border-white/10 bg-white/5 p-4"><Calendar className="mb-2 h-4 w-4 text-cyan-300" /><div className="text-sm text-gray-300">Posts: {(activeProjectPosts.length || posts.length)}</div></Card>
                  <Card className="border-white/10 bg-white/5 p-4"><Wand2 className="mb-2 h-4 w-4 text-cyan-300" /><div className="text-sm text-gray-300">Voice: {state.brandVoice}</div></Card>
                  <Card className="border-white/10 bg-white/5 p-4"><BarChart3 className="mb-2 h-4 w-4 text-cyan-300" /><div className="text-sm text-gray-300">Platforms: {state.platforms.length}</div></Card>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => router.push(withLocalePath('/workspace', locale) + `?${projectDeepLink}`)}>
                    {isEn ? 'Open Workspace' : 'Workspace-ში გახსნა'}
                  </Button>
                  <Button variant="secondary" onClick={() => setStep(5)}>
                    {isEn ? 'Edit plan' : 'გეგმის რედაქტირება'}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <Button variant="secondary" onClick={() => setStep((prev) => Math.max(1, prev - 1))} disabled={step === 1 || saving || generating}>
                {isEn ? 'Back' : 'უკან'}
              </Button>

              <div className="flex flex-wrap gap-2">
                {step === 5 && (
                  <Button onClick={() => void generatePlan()} disabled={generating || saving}>
                    {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isEn ? 'Regenerate' : 'ხელახალი გენერაცია'}
                  </Button>
                )}
                {step >= 5 && step < 8 && (
                  <Button onClick={() => void saveProject()} disabled={saving || posts.length === 0}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isEn ? 'Save & continue' : 'შენახვა და გაგრძელება'}
                  </Button>
                )}
                <Button onClick={() => setStep((prev) => Math.min(8, prev + 1))} disabled={step === 8 || saving || generating}>
                  {isEn ? 'Next' : 'შემდეგი'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual QA checklist:
         1) /ka/services/social-media-manager და /en/services/social-media-manager იხსნება 404 გარეშე
         2) Wizard სრულდება demo რეჟიმშიც და auth რეჟიმშიც
         3) Export CSV/JSON/iCal მუშაობს
         4) Integration buttons ხსნის შესაბამის სერვისებს query params-ით
         5) npm run lint && npm run typecheck && npm run build */}
    </main>
  );
}
