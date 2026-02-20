'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import {
  Briefcase,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileUp,
  Link2,
  Loader2,
  RefreshCcw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { createBrowserClient } from '@/lib/supabase/browser';
import { ApiClientError, fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { generateBusinessPack } from '@/lib/business-agent/generator';
import type {
  BusinessAgentFileMeta,
  BusinessAgentGoal,
  BusinessAgentInputs,
  BusinessAgentMode,
  BusinessAgentProject,
  BusinessGeneratedPack,
  BusinessProfile,
} from '@/lib/business-agent/types';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type DemoProject = {
  id: string;
  title: string;
  locale: 'ka' | 'en';
  business_profile: BusinessProfile;
  goals: BusinessAgentGoal[];
  mode: BusinessAgentMode;
  inputs: BusinessAgentInputs;
  generated_pack: BusinessGeneratedPack | null;
  created_at: string;
  updated_at: string;
};

const DRAFT_KEY = 'business_agent_draft_v1';
const DEMO_LIST_KEY = 'business_agent_demo_projects_v1';

const GOAL_OPTIONS: Array<{
  id: BusinessAgentGoal;
  en: string;
  ka: string;
  enDesc: string;
  kaDesc: string;
}> = [
  {
    id: 'get_clients',
    en: 'Get clients',
    ka: 'კლიენტების მოზიდვა',
    enDesc: 'Lead acquisition and qualification playbook',
    kaDesc: 'ლიდების მოზიდვის და კვალიფიკაციის playbook',
  },
  {
    id: 'increase_sales',
    en: 'Increase sales',
    ka: 'გაყიდვების ზრდა',
    enDesc: 'Improve conversion and offer structure',
    kaDesc: 'კონვერსიის და შეთავაზების სტრუქტურის გაუმჯობესება',
  },
  {
    id: 'build_brand',
    en: 'Build brand',
    ka: 'ბრენდის გაძლიერება',
    enDesc: 'Positioning and trust-building content',
    kaDesc: 'პოზიციონირება და ნდობის გამაძლიერებელი კონტენტი',
  },
  {
    id: 'automate_ops',
    en: 'Automate ops',
    ka: 'ოპერაციების ავტომატიზაცია',
    enDesc: 'SOPs, checklists, and workflow clarity',
    kaDesc: 'SOP-ები, ჩეკლისტები და workflow-ის გამართვა',
  },
  {
    id: 'content_plan',
    en: 'Content plan',
    ka: 'კონტენტ გეგმა',
    enDesc: '30-day multi-channel content pipeline',
    kaDesc: '30-დღიანი მრავალარხიანი კონტენტ pipeline',
  },
  {
    id: 'customer_support',
    en: 'Customer support',
    ka: 'მომხმარებელთა მხარდაჭერა',
    enDesc: 'FAQ, response templates, and tone rules',
    kaDesc: 'FAQ, პასუხების შაბლონები და tone წესები',
  },
];

const MODE_OPTIONS: Array<{ id: BusinessAgentMode; en: string; ka: string; enDesc: string; kaDesc: string }> = [
  {
    id: 'sales_agent',
    en: 'Sales Agent',
    ka: 'გაყიდვების აგენტი',
    enDesc: 'Lead qualification, scripts, objections',
    kaDesc: 'ლიდების კვალიფიკაცია, სკრიპტები, objections',
  },
  {
    id: 'marketing_agent',
    en: 'Marketing Agent',
    ka: 'მარკეტინგის აგენტი',
    enDesc: 'Campaigns, ads, offers',
    kaDesc: 'კამპანიები, რეკლამა, შეთავაზებები',
  },
  {
    id: 'operations_agent',
    en: 'Operations Agent',
    ka: 'ოპერაციების აგენტი',
    enDesc: 'SOPs, checklists, automation plan',
    kaDesc: 'SOP-ები, ჩეკლისტები, ავტომატიზაციის გეგმა',
  },
  {
    id: 'support_agent',
    en: 'Customer Support Agent',
    ka: 'მხარდაჭერის აგენტი',
    enDesc: 'FAQ drafts, tone rules, escalation map',
    kaDesc: 'FAQ drafts, tone წესები, escalation რუკა',
  },
  {
    id: 'strategy_agent',
    en: 'Strategy Agent',
    ka: 'სტრატეგიის აგენტი',
    enDesc: '90-day plan and KPI architecture',
    kaDesc: '90-დღიანი გეგმა და KPI არქიტექტურა',
  },
];

function defaultProfile(locale: 'ka' | 'en'): BusinessProfile {
  return {
    business_name: '',
    category: '',
    location: '',
    language: locale,
    target_audience: '',
    offer_type: 'service',
    price_range: '',
    working_hours: '',
    website_url: '',
    instagram_url: '',
  };
}

function defaultInputs(): BusinessAgentInputs {
  return {
    files: [],
    products_services_text: '',
    faq_text: '',
    policies_text: '',
  };
}

function parseDemoProjects(): DemoProject[] {
  const raw = localStorage.getItem(DEMO_LIST_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DemoProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDemoProjects(projects: DemoProject[]) {
  localStorage.setItem(DEMO_LIST_KEY, JSON.stringify(projects));
}

function packToMarkdown(pack: BusinessGeneratedPack, title: string) {
  return [
    `# ${title}`,
    '',
    '## Offer + Positioning',
    pack.offer_positioning.summary,
    ...pack.offer_positioning.key_points.map((item) => `- ${item}`),
    '',
    '## Customer Persona',
    `- Primary persona: ${pack.customer_persona.primary_persona}`,
    ...pack.customer_persona.pain_points.map((item) => `- Pain point: ${item}`),
    ...pack.customer_persona.decision_triggers.map((item) => `- Decision trigger: ${item}`),
    '',
    '## 30-Day Action Plan',
    '### Week 1',
    ...pack.action_plan_30_day.week_1.map((item) => `- ${item}`),
    '### Week 2',
    ...pack.action_plan_30_day.week_2.map((item) => `- ${item}`),
    '### Week 3',
    ...pack.action_plan_30_day.week_3.map((item) => `- ${item}`),
    '### Week 4',
    ...pack.action_plan_30_day.week_4.map((item) => `- ${item}`),
    '',
    '## Scripts',
    `- DM: ${pack.scripts.dm_script}`,
    `- Call: ${pack.scripts.call_script}`,
    `- Email: ${pack.scripts.email_script}`,
    '',
    '## Content Ideas',
    ...pack.content_ideas.map((item) => `- ${item}`),
    '',
    '## KPI Dashboard Suggestions',
    ...pack.kpi_dashboard_suggestions.map((item) => `- ${item}`),
  ].join('\n');
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function BusinessAgentPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = getLocaleFromPathname(pathname) === 'ka' ? 'ka' : 'en';
  const isEn = locale === 'en';

  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [profile, setProfile] = useState<BusinessProfile>(defaultProfile(locale));
  const [goals, setGoals] = useState<BusinessAgentGoal[]>(['get_clients']);
  const [inputs, setInputs] = useState<BusinessAgentInputs>(defaultInputs());
  const [mode, setMode] = useState<BusinessAgentMode>('strategy_agent');
  const [generatedPack, setGeneratedPack] = useState<BusinessGeneratedPack | null>(null);

  const [authenticated, setAuthenticated] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projects, setProjects] = useState<BusinessAgentProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [invalidProjectState, setInvalidProjectState] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const progress = Math.round((step / 6) * 100);
  const projectTitle = profile.business_name || (isEn ? 'Business Agent Project' : 'Business Agent პროექტი');

  const integrationLinks = useMemo(() => {
    const goalsParam = encodeURIComponent(goals.join(','));
    const businessNameParam = encodeURIComponent(profile.business_name || projectTitle);

    return [
      {
        title: 'Social Media Manager',
        href:
          withLocalePath('/services/social-media-manager', locale) +
          `?create=true&business_name=${businessNameParam}&goals=${goalsParam}`,
      },
      {
        title: 'Video Studio',
        href:
          withLocalePath('/services/video-studio', locale) +
          `?intent=promo-brief&topic=${businessNameParam}&lang=${locale}`,
      },
      {
        title: 'Image Architect',
        href:
          withLocalePath('/services/image-architect', locale) +
          `?intent=brand-visuals&style=${encodeURIComponent(mode)}&lang=${locale}`,
      },
      {
        title: 'Workspace',
        href:
          withLocalePath('/workspace', locale) +
          `?from=business-agent&project=${encodeURIComponent(activeProjectId ?? projectTitle)}`,
      },
    ];
  }, [activeProjectId, goals, locale, mode, profile.business_name, projectTitle]);

  useEffect(() => {
    const payload = {
      step,
      profile,
      goals,
      inputs,
      mode,
      generatedPack,
      activeProjectId,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  }, [activeProjectId, generatedPack, goals, inputs, mode, profile, step]);

  const loadProjects = useCallback(async (isAuthed: boolean) => {
    setLoadingProjects(true);
    try {
      if (isAuthed) {
        const data = await fetchJson<{ projects: BusinessAgentProject[] }>('/api/business-agent/projects', {
          cache: 'no-store',
        });
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      } else {
        const demo = parseDemoProjects();
        setProjects(demo as unknown as BusinessAgentProject[]);
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const markDirty = () => {
    setDirty(true);
    setSavedAt(null);
  };

  const updateProfile = <K extends keyof BusinessProfile>(field: K, value: BusinessProfile[K]) => {
    setProfile((current) => ({ ...current, [field]: value }));
    markDirty();
  };

  const updateInputs = <K extends keyof BusinessAgentInputs>(field: K, value: BusinessAgentInputs[K]) => {
    setInputs((current) => ({ ...current, [field]: value }));
    markDirty();
  };

  const toggleGoal = (goal: BusinessAgentGoal) => {
    setGoals((current) => {
      if (current.includes(goal)) {
        const next = current.filter((item) => item !== goal);
        markDirty();
        return next.length === 0 ? [goal] : next;
      }
      markDirty();
      return [...current, goal];
    });
  };

  const handleFileMetaUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newMeta: BusinessAgentFileMeta[] = Array.from(files).map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      size: file.size,
      type: file.type || 'unknown',
      uploaded_at: new Date().toISOString(),
    }));

    setInputs((current) => ({
      ...current,
      files: [...current.files, ...newMeta],
    }));
    markDirty();
  };

  const normalizeProjectFromApi = (project: BusinessAgentProject) => {
    setProfile(project.business_profile);
    setGoals(project.goals as BusinessAgentGoal[]);
    setMode(project.mode as BusinessAgentMode);
    setInputs(project.inputs);
    setGeneratedPack(project.generated_pack);
    setActiveProjectId(project.id);
    setInvalidProjectState(null);
    setDirty(false);
    setSavedAt(project.updated_at);
  };

  const openProjectById = useCallback(async (projectId: string, isAuthedOverride?: boolean) => {
    const isAuthed = typeof isAuthedOverride === 'boolean' ? isAuthedOverride : authenticated;
    setError(null);

    try {
      if (isAuthed) {
        const data = await fetchJson<{ project: BusinessAgentProject | null }>(`/api/business-agent/projects/${projectId}`, {
          cache: 'no-store',
        });
        if (!data.project) {
          setInvalidProjectState(
            isEn ? 'Project not found. You can create a new one below.' : 'პროექტი ვერ მოიძებნა. ქვემოთ შექმენი ახალი პროექტი.'
          );
          return;
        }
        normalizeProjectFromApi(data.project);
        return;
      }

      const demoProjects = parseDemoProjects();
      const project = demoProjects.find((item) => item.id === projectId);
      if (!project) {
        setInvalidProjectState(
          isEn ? 'Local demo project not found. Start a new demo project.' : 'ლოკალური დემო პროექტი ვერ მოიძებნა. დაიწყე ახალი დემო.'
        );
        return;
      }

      normalizeProjectFromApi(project as unknown as BusinessAgentProject);
    } catch (err) {
      setError(toUserMessage(err));
    }
  }, [authenticated, isEn]);

  useEffect(() => {
    const boot = async () => {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const isAuthed = Boolean(user);
      setAuthenticated(isAuthed);

      const rawDraft = localStorage.getItem(DRAFT_KEY);
      if (rawDraft) {
        try {
          const parsed = JSON.parse(rawDraft) as {
            step?: WizardStep;
            profile?: BusinessProfile;
            goals?: BusinessAgentGoal[];
            inputs?: BusinessAgentInputs;
            mode?: BusinessAgentMode;
            generatedPack?: BusinessGeneratedPack | null;
            activeProjectId?: string | null;
          };

          if (parsed.step) setStep(parsed.step);
          if (parsed.profile) setProfile(parsed.profile);
          if (Array.isArray(parsed.goals) && parsed.goals.length > 0) setGoals(parsed.goals);
          if (parsed.inputs) setInputs(parsed.inputs);
          if (parsed.mode) setMode(parsed.mode);
          if (parsed.generatedPack) setGeneratedPack(parsed.generatedPack);
          if (parsed.activeProjectId) setActiveProjectId(parsed.activeProjectId);
        } catch {
          localStorage.removeItem(DRAFT_KEY);
        }
      }

      if (searchParams.get('create') === 'true') {
        setWizardOpen(true);
      }

      const voiceProfile = searchParams.get('voice_profile');
      const usageNotes = searchParams.get('usage_notes');
      if (voiceProfile || usageNotes) {
        setWizardOpen(true);
        if (voiceProfile) {
          setProfile((current) => ({
            ...current,
            business_name: current.business_name || voiceProfile,
          }));
        }
        if (usageNotes) {
          setInputs((current) => ({
            ...current,
            products_services_text: [current.products_services_text, `Voice notes: ${usageNotes}`].filter(Boolean).join('\n'),
          }));
        }
      }

      await loadProjects(isAuthed);

      const requestedProjectId = searchParams.get('project');
      if (requestedProjectId) {
        await openProjectById(requestedProjectId, isAuthed);
        setWizardOpen(true);
      }
    };

    void boot();
  }, [loadProjects, openProjectById, searchParams]);

  const saveProject = async (): Promise<string | null> => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: projectTitle,
        locale,
        business_profile: profile,
        goals,
        mode,
        inputs,
        generated_pack: generatedPack,
      };

      if (authenticated) {
        let savedId: string;
        if (activeProjectId) {
          const data = await fetchJson<{ project: BusinessAgentProject }>(`/api/business-agent/projects/${activeProjectId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          normalizeProjectFromApi(data.project);
          savedId = data.project.id;
        } else {
          const data = await fetchJson<{ project: BusinessAgentProject }>('/api/business-agent/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          normalizeProjectFromApi(data.project);
          savedId = data.project.id;
        }

        await loadProjects(true);
        return savedId;
      } else {
        const now = new Date().toISOString();
        const projectId = activeProjectId || `demo-${Date.now()}`;
        const project: DemoProject = {
          id: projectId,
          title: projectTitle,
          locale,
          business_profile: profile,
          goals,
          mode,
          inputs,
          generated_pack: generatedPack,
          created_at: now,
          updated_at: now,
        };

        const demoProjects = parseDemoProjects();
        const index = demoProjects.findIndex((row) => row.id === projectId);
        if (index >= 0) {
          const existingProject = demoProjects[index];
          if (existingProject) {
            demoProjects[index] = { ...existingProject, ...project, created_at: existingProject.created_at };
          }
        } else {
          demoProjects.unshift(project);
        }

        saveDemoProjects(demoProjects);
        setProjects(demoProjects as unknown as BusinessAgentProject[]);
        setActiveProjectId(projectId);
        setSavedAt(now);
        setDirty(false);
        return projectId;
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setError(isEn ? 'Login to save project to cloud.' : 'Cloud-ში შესანახად გაიარე ავტორიზაცია.');
      } else {
        setError(toUserMessage(err));
      }
      return null;
    } finally {
      setSaving(false);
    }
  };

  const runAgent = async () => {
    setRunning(true);
    setError(null);
    try {
      if (authenticated) {
        let projectId = activeProjectId;
        if (!projectId || dirty) {
          projectId = await saveProject();
        }

        if (!projectId) {
          throw new Error(isEn ? 'Project was not saved yet.' : 'პროექტი ჯერ არ შენახულა.');
        }

        const data = await fetchJson<{ generated_pack: BusinessGeneratedPack; project: BusinessAgentProject }>(
          '/api/business-agent/run',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId }),
          }
        );

        setGeneratedPack(data.generated_pack);
        setDirty(false);
        setSavedAt(data.project.updated_at);
      } else {
        const generated = generateBusinessPack({
          locale,
          profile,
          goals,
          mode,
          inputs,
        });
        setGeneratedPack(generated);
        setDirty(true);
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const resetProject = () => {
    setStep(1);
    setProfile(defaultProfile(locale));
    setGoals(['get_clients']);
    setMode('strategy_agent');
    setInputs(defaultInputs());
    setGeneratedPack(null);
    setActiveProjectId(null);
    setInvalidProjectState(null);
    setDirty(false);
    setSavedAt(null);
    setError(null);
  };

  const exportMarkdown = () => {
    if (!generatedPack) return;
    const content = packToMarkdown(generatedPack, projectTitle);
    downloadFile(`${projectTitle.replace(/\s+/g, '-').toLowerCase()}-business-pack.md`, content, 'text/markdown');
  };

  const exportText = () => {
    if (!generatedPack) return;
    const content = packToMarkdown(generatedPack, projectTitle).replaceAll('#', '').replaceAll('*', '');
    downloadFile(`${projectTitle.replace(/\s+/g, '-').toLowerCase()}-business-pack.txt`, content, 'text/plain');
  };

  const copyPack = async () => {
    if (!generatedPack) return;
    const content = packToMarkdown(generatedPack, projectTitle);
    await navigator.clipboard.writeText(content);
  };

  const canProceedToGenerate = profile.business_name.trim().length > 1 && goals.length > 0 && mode;

  const saveStateLabel = saving
    ? isEn
      ? 'Saving...'
      : 'ინახება...'
    : dirty
      ? isEn
        ? 'Unsaved'
        : 'უშენახავი'
      : savedAt
        ? isEn
          ? 'Saved'
          : 'შენახულია'
        : isEn
          ? 'Draft'
          : 'დრაფტი';

  return (
    <main className="relative min-h-screen bg-[#05070A] px-4 pb-10 pt-24 sm:px-6 lg:px-8">
      <SpaceBackground />

      <div className="relative z-10 mx-auto max-w-7xl space-y-4">
        <Card className="border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                <Briefcase className="h-3.5 w-3.5" /> Business Agent
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                {isEn ? 'Business Agent Studio' : 'Business Agent სტუდია'}
              </h1>
              <p className="mt-1 text-sm text-gray-300">
                {isEn
                  ? 'Create your AI business pack with guided steps, integrations, and cloud-ready persistence.'
                  : 'შექმენი AI ბიზნეს პაკეტი ნაბიჯ-ნაბიჯ, ინტეგრაციებით და cloud შენახვით.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={dirty ? 'warning' : 'success'}>{saveStateLabel}</Badge>
              <Button onClick={() => setWizardOpen(true)}>
                <Sparkles className="mr-1 h-4 w-4" /> {isEn ? 'Start Business Agent' : 'Business Agent დაწყება'}
              </Button>
              <Button variant="secondary" onClick={resetProject}>
                <RefreshCcw className="mr-1 h-4 w-4" /> {isEn ? 'New Project' : 'ახალი პროექტი'}
              </Button>
            </div>
          </div>
        </Card>

        {!authenticated && (
          <Card className="border-cyan-500/30 bg-cyan-500/10 p-4">
            <p className="text-sm text-cyan-100">
              {isEn
                ? 'Guest mode is active. Your project stays in localStorage. Login to save to cloud.'
                : 'აქტიურია Guest რეჟიმი. პროექტი ინახება localStorage-ში. Cloud-ში შესანახად გაიარე ავტორიზაცია.'}
            </p>
          </Card>
        )}

        {invalidProjectState && (
          <Card className="border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">{invalidProjectState}</Card>
        )}

        {error && <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</Card>}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card className="border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  {isEn ? 'Business Agent Wizard' : 'Business Agent ვიზარდი'}
                </h2>
                <span className="text-xs text-gray-300">{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-2 text-xs text-gray-400">
                {isEn ? `Step ${step} of 6` : `ნაბიჯი ${step} / 6`}
              </div>

              {!wizardOpen ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-5 text-sm text-gray-300">
                  {isEn
                    ? 'Use “Start Business Agent” to open the guided studio.'
                    : 'ვიზარდის გასახსნელად გამოიყენე „Business Agent დაწყება“ ღილაკი.'}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {step === 1 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input value={profile.business_name} onChange={(e) => updateProfile('business_name', e.target.value)} placeholder={isEn ? 'Business name' : 'ბიზნესის სახელი'} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                      <input value={profile.category} onChange={(e) => updateProfile('category', e.target.value)} placeholder={isEn ? 'Category' : 'კატეგორია'} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                      <input value={profile.location} onChange={(e) => updateProfile('location', e.target.value)} placeholder={isEn ? 'Location' : 'ლოკაცია'} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                      <select value={profile.language} onChange={(e) => updateProfile('language', e.target.value as 'ka' | 'en')} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                        <option value="ka">ქართული</option>
                        <option value="en">English</option>
                      </select>
                      <input value={profile.target_audience} onChange={(e) => updateProfile('target_audience', e.target.value)} placeholder={isEn ? 'Target audience' : 'სამიზნე აუდიტორია'} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white sm:col-span-2" />
                      <select value={profile.offer_type} onChange={(e) => updateProfile('offer_type', e.target.value as 'service' | 'product')} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                        <option value="service">{isEn ? 'Service' : 'სერვისი'}</option>
                        <option value="product">{isEn ? 'Product' : 'პროდუქტი'}</option>
                      </select>
                      <input value={profile.price_range} onChange={(e) => updateProfile('price_range', e.target.value)} placeholder={isEn ? 'Price range' : 'ფასის დიაპაზონი'} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                      <input value={profile.working_hours} onChange={(e) => updateProfile('working_hours', e.target.value)} placeholder={isEn ? 'Working hours' : 'სამუშაო საათები'} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                      <input value={profile.website_url} onChange={(e) => updateProfile('website_url', e.target.value)} placeholder={isEn ? 'Website (optional)' : 'ვებსაიტი (არასავალდებულო)'} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                      <input value={profile.instagram_url} onChange={(e) => updateProfile('instagram_url', e.target.value)} placeholder={isEn ? 'Instagram (optional)' : 'Instagram (არასავალდებულო)'} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white sm:col-span-2" />
                    </div>
                  )}

                  {step === 2 && (
                    <div className="grid grid-cols-1 gap-2">
                      {GOAL_OPTIONS.map((goal) => {
                        const active = goals.includes(goal.id);
                        return (
                          <button
                            key={goal.id}
                            type="button"
                            onClick={() => toggleGoal(goal.id)}
                            className={`rounded-xl border p-3 text-left ${active ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/10 bg-black/25'}`}
                          >
                            <div className="text-sm font-medium text-white">{isEn ? goal.en : goal.ka}</div>
                            <div className="text-xs text-gray-300">{isEn ? goal.enDesc : goal.kaDesc}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {step === 3 && (
                    <div className="space-y-3">
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/25 px-4 py-6 text-sm text-gray-200">
                        <FileUp className="h-4 w-4" />
                        {isEn ? 'Upload PDF/DOC/IMG (metadata only for now)' : 'ატვირთე PDF/DOC/IMG (ჯერ მხოლოდ მეტამონაცემები)'}
                        <input type="file" multiple accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={handleFileMetaUpload} />
                      </label>

                      {inputs.files.length > 0 ? (
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <p className="mb-2 text-xs text-amber-200">
                            {isEn ? 'Upload backend coming soon. File metadata is saved now.' : 'Upload backend მალე დაემატება. ახლა ინახება ფაილის მეტამონაცემები.'}
                          </p>
                          <div className="space-y-1">
                            {inputs.files.map((file) => (
                              <div key={file.id} className="text-xs text-gray-300">
                                {file.name} • {Math.round(file.size / 1024)} KB
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <textarea value={inputs.products_services_text} onChange={(e) => updateInputs('products_services_text', e.target.value)} placeholder={isEn ? 'Products/services list' : 'პროდუქტების/სერვისების სია'} className="h-24 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                      <textarea value={inputs.faq_text} onChange={(e) => updateInputs('faq_text', e.target.value)} placeholder={isEn ? 'FAQ text' : 'FAQ ტექსტი'} className="h-24 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                      <textarea value={inputs.policies_text} onChange={(e) => updateInputs('policies_text', e.target.value)} placeholder={isEn ? 'Policies / terms' : 'პოლიტიკები / პირობები'} className="h-24 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white" />
                    </div>
                  )}

                  {step === 4 && (
                    <div className="grid grid-cols-1 gap-2">
                      {MODE_OPTIONS.map((entry) => {
                        const active = mode === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => {
                              setMode(entry.id);
                              markDirty();
                            }}
                            className={`rounded-xl border p-3 text-left ${active ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 bg-black/25'}`}
                          >
                            <div className="text-sm font-medium text-white">{isEn ? entry.en : entry.ka}</div>
                            <div className="text-xs text-gray-300">{isEn ? entry.enDesc : entry.kaDesc}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {step === 5 && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-gray-200">
                        {isEn
                          ? 'Generate a full Business Pack: positioning, persona, 30-day plan, scripts, content ideas, KPI dashboard.'
                          : 'დააგენერირე სრული Business Pack: პოზიციონირება, პერსონა, 30-დღიანი გეგმა, სკრიპტები, კონტენტ იდეები, KPI დეშბორდი.'}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => void runAgent()} disabled={running || !canProceedToGenerate}>
                          {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
                          {isEn ? 'Generate Business Pack' : 'Business Pack გენერაცია'}
                        </Button>
                        <Button variant="secondary" onClick={() => void saveProject()} disabled={saving}>
                          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                          {isEn ? 'Save + Resume later' : 'შენახვა + გაგრძელება შემდეგ'}
                        </Button>
                      </div>

                      {!generatedPack ? (
                        <Card className="border-white/10 bg-white/5 p-4">
                          <EmptyState
                            title={isEn ? 'No generated pack yet' : 'გენერირებული პაკეტი ჯერ არ არის'}
                            description={isEn ? 'Run generation to produce outputs.' : 'გაუშვი გენერაცია, რომ მიიღო შედეგები.'}
                          />
                        </Card>
                      ) : (
                        <Card className="border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-50">
                          <div className="font-semibold">{generatedPack.offer_positioning.summary}</div>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                            {generatedPack.offer_positioning.key_points.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" onClick={() => void copyPack()}>
                              <ClipboardCopy className="mr-1 h-4 w-4" /> {isEn ? 'Copy' : 'კოპირება'}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={exportText}>
                              <Download className="mr-1 h-4 w-4" /> TXT
                            </Button>
                            <Button size="sm" variant="secondary" onClick={exportMarkdown}>
                              <Download className="mr-1 h-4 w-4" /> MD
                            </Button>
                          </div>
                        </Card>
                      )}
                    </div>
                  )}

                  {step === 6 && (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-300">
                        {isEn
                          ? 'Launch your Business Pack into connected services with one click.'
                          : 'ერთ ღილაკზე გაუშვი Business Pack დაკავშირებულ სერვისებში.'}
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {integrationLinks.map((link) => (
                          <Link key={link.title} href={link.href} className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white transition hover:border-cyan-400/40">
                            <div className="flex items-center gap-2">
                              <Link2 className="h-4 w-4 text-cyan-300" /> {link.title}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                    <Button variant="secondary" onClick={() => setStep((current) => Math.max(1, current - 1) as WizardStep)} disabled={step === 1}>
                      {isEn ? 'Back' : 'უკან'}
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => void saveProject()} disabled={saving}>
                        {isEn ? 'Save' : 'შენახვა'}
                      </Button>
                      <Button onClick={() => setStep((current) => Math.min(6, current + 1) as WizardStep)} disabled={step === 6}>
                        {isEn ? 'Next' : 'შემდეგ'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {generatedPack && (
              <Card className="border-white/10 bg-white/5 p-4 text-sm text-gray-200">
                <h3 className="text-base font-semibold text-white">{isEn ? 'Generated Output Preview' : 'გენერირებული შედეგის პრევიუ'}</h3>
                <div className="mt-2 space-y-2 text-xs text-gray-300">
                  <p><span className="text-white">{isEn ? 'Persona:' : 'პერსონა:'}</span> {generatedPack.customer_persona.primary_persona}</p>
                  <p><span className="text-white">{isEn ? 'DM Script:' : 'DM სკრიპტი:'}</span> {generatedPack.scripts.dm_script}</p>
                  <p><span className="text-white">{isEn ? 'Content ideas:' : 'კონტენტ იდეები:'}</span> {generatedPack.content_ideas.slice(0, 2).join(' • ')}</p>
                </div>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card className="border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 text-base font-semibold text-white">{isEn ? 'Saved Projects' : 'შენახული პროექტები'}</h3>
              {loadingProjects ? (
                <div className="space-y-2">
                  <div className="h-10 animate-pulse rounded-lg bg-white/10" />
                  <div className="h-10 animate-pulse rounded-lg bg-white/10" />
                  <Spinner label={isEn ? 'Loading projects...' : 'პროექტების ჩატვირთვა...'} />
                </div>
              ) : projects.length === 0 ? (
                <EmptyState
                  title={isEn ? 'No projects yet' : 'პროექტები ჯერ არ არის'}
                  description={isEn ? 'Save your first Business Agent project to resume later.' : 'შეინახე პირველი Business Agent პროექტი გასაგრძელებლად.'}
                />
              ) : (
                <div className="space-y-2">
                  {projects.slice(0, 6).map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => void openProjectById(project.id)}
                      className={`w-full rounded-xl border p-3 text-left ${activeProjectId === project.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/10 bg-black/25'}`}
                    >
                      <div className="text-sm font-medium text-white">{project.title}</div>
                      <div className="text-xs text-gray-400">{new Date(project.updated_at).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card className="border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 text-base font-semibold text-white">{isEn ? 'Quick Actions' : 'სწრაფი ქმედებები'}</h3>
              <div className="space-y-2">
                <Button className="w-full" onClick={() => setWizardOpen(true)}>
                  <Sparkles className="mr-1 h-4 w-4" /> {isEn ? 'Open Studio' : 'სტუდიის გახსნა'}
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => void saveProject()} disabled={saving}>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> {isEn ? 'Save Project' : 'პროექტის შენახვა'}
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => void runAgent()} disabled={running || !canProceedToGenerate}>
                  <Wand2 className="mr-1 h-4 w-4" /> {isEn ? 'Generate Pack' : 'პაკეტის გენერაცია'}
                </Button>
              </div>
              </Card>

              {!authenticated && (
                <p className="mt-3 text-xs text-amber-200">
                  {isEn ? 'Login to save Business Agent projects to cloud.' : 'Cloud-ში შესანახად გაიარე ავტორიზაცია.'}
                </p>
              )}
            </div>
          </div>
        </div>
    </main>
  );
}
