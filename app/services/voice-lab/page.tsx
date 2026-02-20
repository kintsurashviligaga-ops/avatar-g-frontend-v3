'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import {
  CheckCircle2,
  ClipboardCopy,
  Download,
  Link2,
  Loader2,
  Mic,
  MicOff,
  RefreshCcw,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import SpaceBackground from '@/components/SpaceBackground';
import { createBrowserClient } from '@/lib/supabase/browser';
import { ApiClientError, fetchJson, toUserMessage } from '@/lib/api/clientFetch';
import { getLocaleFromPathname, withLocalePath } from '@/lib/i18n/localePath';
import { buildMockVoiceOutput, SILENT_WAV_DATA_URL } from '@/lib/voice-lab/mock';
import type {
  VoiceAsset,
  VoiceAssetKind,
  VoiceJob,
  VoiceLocale,
  VoiceProfile,
  VoiceProject,
  VoiceStudioDraft,
} from '@/lib/voice-lab/types';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type LocalVoiceAsset = VoiceAsset & {
  local_only?: boolean;
};

type VoiceDiagnostics = {
  secureContext: boolean;
  permissionState: string;
  deviceCount: number;
  recorderState: string;
  lastError: string | null;
};

const DRAFT_KEY = 'voice_lab_draft_v1';
const DEMO_PROJECTS_KEY = 'voice_lab_demo_projects_v1';
const DEMO_ASSETS_KEY = 'voice_lab_demo_assets_v1';
const DEMO_JOBS_KEY = 'voice_lab_demo_jobs_v1';
const DEMO_PROFILES_KEY = 'voice_lab_demo_profiles_v1';

function defaultDraft(locale: VoiceLocale): VoiceStudioDraft {
  return {
    locale,
    step: 1,
    projectTitle: locale === 'ka' ? 'ჩემი ხმის პროექტი' : 'My voice project',
    sourceText: '',
    cleanup: {
      trim: true,
      normalize: true,
      noiseReduction: false,
    },
    selectedVoiceProfileId: null,
    voiceProfileName: '',
    voiceProfileLanguage: locale,
    voiceProfileGenderHint: '',
    generationText: '',
    notes: '',
  };
}

function safeLocalRead<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return fallback;
  }
}

function saveBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function VoiceLabPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = getLocaleFromPathname(pathname) === 'ka' ? 'ka' : 'en';
  const isEn = locale === 'en';

  const [draft, setDraft] = useState<VoiceStudioDraft>(defaultDraft(locale));
  const [wizardOpen, setWizardOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<VoiceProject[]>([]);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [assets, setAssets] = useState<LocalVoiceAsset[]>([]);
  const [jobs, setJobs] = useState<VoiceJob[]>([]);

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [playbackUrl, setPlaybackUrl] = useState<string>(SILENT_WAV_DATA_URL);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<VoiceDiagnostics>({
    secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    permissionState: 'unknown',
    deviceCount: 0,
    recorderState: 'inactive',
    lastError: null,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const progress = Math.round((draft.step / 6) * 100);
  const latestJob = jobs[0];
  const latestCaption = String(latestJob?.output?.caption_suggestion ?? '');
  const selectedProfile = profiles.find((profile) => profile.id === draft.selectedVoiceProfileId) ?? null;

  const integrations = useMemo(() => {
    const audioAssetId = assets.find((asset) => asset.kind === 'generated')?.id || '';
    const encodedCaption = encodeURIComponent(latestCaption || draft.generationText.slice(0, 120));
    const profileName = encodeURIComponent(selectedProfile?.name || draft.voiceProfileName || 'Voice Profile');

    return [
      {
        title: 'Social Media Manager',
        href:
          withLocalePath('/services/social-media-manager', locale) +
          `?create=true&audio_asset_id=${encodeURIComponent(audioAssetId)}&caption=${encodedCaption}`,
      },
      {
        title: 'Business Agent',
        href:
          withLocalePath('/services/business-agent', locale) +
          `?create=true&voice_profile=${profileName}&usage_notes=${encodeURIComponent(draft.notes || latestCaption)}`,
      },
      {
        title: 'Marketplace',
        href:
          withLocalePath('/services/marketplace/browse', locale) +
          `?q=${encodedCaption}&category=Voice%20Packs&tags=voice,audio`,
      },
      {
        title: 'Workspace',
        href:
          withLocalePath('/workspace', locale) +
          `?from=voice-lab&project=${encodeURIComponent(activeProjectId || draft.projectTitle)}`,
      },
    ];
  }, [activeProjectId, assets, draft.generationText, draft.notes, draft.projectTitle, draft.voiceProfileName, latestCaption, locale, selectedProfile?.name]);

  const updateDraft = <K extends keyof VoiceStudioDraft>(field: K, value: VoiceStudioDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setSavedAt(null);
  };

  const updateCleanup = (field: keyof VoiceStudioDraft['cleanup'], value: boolean) => {
    setDraft((current) => ({
      ...current,
      cleanup: {
        ...current.cleanup,
        [field]: value,
      },
    }));
    setDirty(true);
    setSavedAt(null);
  };

  const refreshDiagnostics = useCallback(async (lastError?: string | null) => {
    const hasMedia = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices);
    if (!hasMedia) {
      setMicSupported(false);
      setDiagnostics((current) => ({ ...current, lastError: lastError ?? current.lastError }));
      return;
    }

    let permissionState = 'unknown';
    try {
      if ('permissions' in navigator && navigator.permissions?.query) {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        permissionState = result.state;
      }
    } catch {
      permissionState = 'unknown';
    }

    let deviceCount = 0;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      deviceCount = devices.filter((device) => device.kind === 'audioinput').length;
    } catch {
      deviceCount = 0;
    }

    setDiagnostics((current) => ({
      secureContext: window.isSecureContext,
      permissionState,
      deviceCount,
      recorderState: recorderRef.current?.state || (recording ? 'recording' : 'inactive'),
      lastError: lastError ?? current.lastError,
    }));
  }, [recording]);

  const loadCloudData = useCallback(async (projectIdHint?: string | null) => {
    setLoadingProjects(true);
    try {
      const [projectResponse, profileResponse] = await Promise.all([
        fetchJson<{ guest: boolean; projects: VoiceProject[] }>('/api/voice-lab/projects', { cache: 'no-store' }),
        fetchJson<{ guest: boolean; profiles: VoiceProfile[] }>('/api/voice-lab/profiles', { cache: 'no-store' }),
      ]);

      const cloudProjects = Array.isArray(projectResponse.projects) ? projectResponse.projects : [];
      setProjects(cloudProjects);
      setProfiles(Array.isArray(profileResponse.profiles) ? profileResponse.profiles : []);

      const candidateId = projectIdHint || activeProjectId || cloudProjects[0]?.id;
      if (candidateId) {
        const [singleProject, jobsResponse] = await Promise.all([
          fetchJson<{ guest: boolean; project: VoiceProject | null }>(`/api/voice-lab/projects/${candidateId}`, { cache: 'no-store' }),
          fetchJson<{ guest: boolean; jobs: VoiceJob[] }>(`/api/voice-lab/jobs?project_id=${candidateId}`, { cache: 'no-store' }),
        ]);

        if (singleProject.project) {
          setActiveProjectId(singleProject.project.id);
          setDraft((current) => ({ ...current, projectTitle: singleProject.project?.title || current.projectTitle }));
          setJobs(Array.isArray(jobsResponse.jobs) ? jobsResponse.jobs : []);

          if (jobsResponse.jobs[0]?.output?.audio_url) {
            setPlaybackUrl(String(jobsResponse.jobs[0].output.audio_url));
          }
        }
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoadingProjects(false);
    }
  }, [activeProjectId]);

  const loadGuestData = useCallback(() => {
    setProjects(safeLocalRead<VoiceProject[]>(DEMO_PROJECTS_KEY, []));
    setProfiles(safeLocalRead<VoiceProfile[]>(DEMO_PROFILES_KEY, []));
    setAssets(safeLocalRead<LocalVoiceAsset[]>(DEMO_ASSETS_KEY, []));
    setJobs(safeLocalRead<VoiceJob[]>(DEMO_JOBS_KEY, []));
  }, []);

  useEffect(() => {
    const boot = async () => {
      const draftFromLocal = safeLocalRead<VoiceStudioDraft | null>(DRAFT_KEY, null);
      if (draftFromLocal) {
        setDraft({ ...defaultDraft(locale), ...draftFromLocal, locale });
      }

      const importAssetUrl = searchParams.get('import_asset_url');
      const importTitle = searchParams.get('title');
      if (importTitle) {
        setDraft((current) => ({ ...current, projectTitle: importTitle }));
      }
      if (importAssetUrl) {
        setPlaybackUrl(importAssetUrl);
        setAssets((current) => [
          {
            id: `import-${Date.now()}`,
            owner_id: 'guest',
            project_id: null,
            kind: 'upload',
            mime: 'audio/*',
            storage_path: null,
            url: importAssetUrl,
            duration_ms: null,
            created_at: new Date().toISOString(),
            local_only: true,
          },
          ...current,
        ]);
      }

      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const isAuthed = Boolean(user);
      setAuthenticated(isAuthed);

      if (isAuthed) {
        await loadCloudData(searchParams.get('project'));
      } else {
        loadGuestData();
      }

      if (searchParams.get('create') === 'true' || searchParams.get('project')) {
        setWizardOpen(true);
      }

      await refreshDiagnostics();
    };

    void boot();
  }, [loadCloudData, loadGuestData, locale, refreshDiagnostics, searchParams]);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const saveGuestCollections = (nextProjects: VoiceProject[], nextProfiles: VoiceProfile[], nextAssets: LocalVoiceAsset[], nextJobs: VoiceJob[]) => {
    localStorage.setItem(DEMO_PROJECTS_KEY, JSON.stringify(nextProjects));
    localStorage.setItem(DEMO_PROFILES_KEY, JSON.stringify(nextProfiles));
    localStorage.setItem(DEMO_ASSETS_KEY, JSON.stringify(nextAssets));
    localStorage.setItem(DEMO_JOBS_KEY, JSON.stringify(nextJobs));
  };

  const saveProject = async (): Promise<string | null> => {
    setSaving(true);
    setError(null);
    try {
      if (authenticated) {
        if (activeProjectId) {
          const updated = await fetchJson<{ guest: boolean; project: VoiceProject | null }>(`/api/voice-lab/projects/${activeProjectId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: draft.projectTitle, status: 'active' }),
          });

          if (updated.project) {
            setSavedAt(updated.project.updated_at);
            setDirty(false);
          }
          await loadCloudData(activeProjectId);
          return activeProjectId;
        }

        const created = await fetchJson<{ guest: boolean; project: VoiceProject | null }>('/api/voice-lab/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: draft.projectTitle, status: 'active' }),
        });

        if (created.project) {
          setActiveProjectId(created.project.id);
          setSavedAt(created.project.updated_at);
          setDirty(false);
          await loadCloudData(created.project.id);
          return created.project.id;
        }

        return null;
      }

      const now = new Date().toISOString();
      const projectId = activeProjectId || `voice-demo-${Date.now()}`;
      const project: VoiceProject = {
        id: projectId,
        owner_id: 'guest',
        title: draft.projectTitle,
        status: 'active',
        created_at: now,
        updated_at: now,
      };

      const nextProjects = [...projects.filter((item) => item.id !== projectId), project].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setProjects(nextProjects);
      setActiveProjectId(projectId);
      setSavedAt(now);
      setDirty(false);
      saveGuestCollections(nextProjects, profiles, assets, jobs);
      return projectId;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        setError(isEn ? 'Login required to save to cloud.' : 'Cloud-ში შენახვისთვის გაიარე ავტორიზაცია.');
      } else {
        setError(toUserMessage(err));
      }
      return null;
    } finally {
      setSaving(false);
    }
  };

  const startMic = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setMicSupported(false);
        setDiagnostics((current) => ({ ...current, lastError: 'MediaRecorder is not supported in this browser.' }));
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const now = new Date().toISOString();

        const localAsset: LocalVoiceAsset = {
          id: `record-${Date.now()}`,
          owner_id: authenticated ? 'pending' : 'guest',
          project_id: activeProjectId,
          kind: 'recording',
          mime: 'audio/webm',
          storage_path: null,
          url,
          duration_ms: null,
          created_at: now,
          local_only: !authenticated,
        };

        setAssets((current) => [localAsset, ...current]);
        setPlaybackUrl(url);
        setDirty(true);

        if (authenticated) {
          try {
            const response = await fetchJson<{ guest: boolean; asset: VoiceAsset }>(
              '/api/voice-lab/assets',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  project_id: activeProjectId,
                  kind: 'recording',
                  mime: 'audio/webm',
                  storage_path: null,
                  url,
                  duration_ms: null,
                }),
              }
            );

            if (response.asset) {
              setAssets((current) => [response.asset as LocalVoiceAsset, ...current.filter((item) => item.id !== localAsset.id)]);
            }
          } catch {
            setDiagnostics((current) => ({ ...current, lastError: isEn ? 'Cloud asset save failed, kept locally.' : 'Cloud შენახვა ვერ შესრულდა, შენახულია ლოკალურად.' }));
          }
        }

        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        await refreshDiagnostics();
      };

      recorder.start();
      setRecording(true);
      await refreshDiagnostics();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Microphone permission was denied.';
      setDiagnostics((current) => ({ ...current, lastError: message }));
      await refreshDiagnostics(message);
    }
  };

  const stopMic = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
    setRecording(false);
    await refreshDiagnostics();
  };

  const onAudioUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const localAsset: LocalVoiceAsset = {
      id: `upload-${Date.now()}`,
      owner_id: authenticated ? 'pending' : 'guest',
      project_id: activeProjectId,
      kind: 'upload',
      mime: file.type || 'audio/*',
      storage_path: null,
      url,
      duration_ms: null,
      created_at: new Date().toISOString(),
      local_only: !authenticated,
    };

    setAssets((current) => [localAsset, ...current]);
    setPlaybackUrl(url);
    setDirty(true);

    if (authenticated) {
      try {
        const response = await fetchJson<{ guest: boolean; asset: VoiceAsset }>('/api/voice-lab/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: activeProjectId,
            kind: 'upload',
            mime: file.type || 'audio/*',
            storage_path: null,
            url,
            duration_ms: null,
          }),
        });

        if (response.asset) {
          setAssets((current) => [response.asset as LocalVoiceAsset, ...current.filter((item) => item.id !== localAsset.id)]);
        }
      } catch {
        setDiagnostics((current) => ({ ...current, lastError: isEn ? 'Cloud upload metadata failed, kept locally.' : 'Cloud მეტამონაცემების შენახვა ვერ შესრულდა.' }));
      }
    }
  };

  const createVoiceProfile = async () => {
    if (!draft.voiceProfileName.trim()) {
      setError(isEn ? 'Enter profile name first.' : 'ჯერ შეიყვანე პროფილის სახელი.');
      return;
    }

    const profileCandidate: VoiceProfile = {
      id: `profile-${Date.now()}`,
      owner_id: authenticated ? 'pending' : 'guest',
      name: draft.voiceProfileName,
      language: draft.voiceProfileLanguage,
      gender_hint: draft.voiceProfileGenderHint || null,
      provider: 'mock-provider',
      provider_voice_id: `voice_${Date.now()}`,
      created_at: new Date().toISOString(),
    };

    if (!authenticated) {
      const next = [profileCandidate, ...profiles];
      setProfiles(next);
      updateDraft('selectedVoiceProfileId', profileCandidate.id);
      saveGuestCollections(projects, next, assets, jobs);
      return;
    }

    try {
      const response = await fetchJson<{ guest: boolean; profile: VoiceProfile | null }>('/api/voice-lab/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileCandidate.name,
          language: profileCandidate.language,
          gender_hint: profileCandidate.gender_hint,
          provider: profileCandidate.provider,
          provider_voice_id: profileCandidate.provider_voice_id,
        }),
      });

      if (response.profile) {
        setProfiles((current) => [response.profile as VoiceProfile, ...current]);
        updateDraft('selectedVoiceProfileId', response.profile.id);
      }
    } catch (err) {
      setError(toUserMessage(err));
    }
  };

  const runGenerate = async () => {
    setRunning(true);
    setError(null);

    try {
      const projectId = activeProjectId || (await saveProject());
      const effectiveProjectId = projectId || activeProjectId;
      const profileName = selectedProfile?.name || draft.voiceProfileName || 'Default Voice';

      if (authenticated) {
        const response = await fetchJson<{ guest: boolean; job: VoiceJob | null }>('/api/voice-lab/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: effectiveProjectId,
            type: 'generate',
            input: {
              title: draft.projectTitle,
              text: draft.generationText || draft.sourceText,
              language: draft.voiceProfileLanguage,
              profile_name: profileName,
              cleanup: draft.cleanup,
            },
          }),
        });

        if (response.job) {
          setJobs((current) => [response.job as VoiceJob, ...current]);
          const outputAudio = String(response.job.output?.audio_url || SILENT_WAV_DATA_URL);
          setPlaybackUrl(outputAudio);

          await fetchJson('/api/voice-lab/assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_id: effectiveProjectId,
              kind: 'generated' as VoiceAssetKind,
              mime: 'audio/wav',
              storage_path: null,
              url: outputAudio,
              duration_ms: null,
            }),
          });
        }
      } else {
        const output = buildMockVoiceOutput('generate', {
          text: draft.generationText || draft.sourceText,
          title: draft.projectTitle,
          language: draft.voiceProfileLanguage,
          profileName,
        });

        const job: VoiceJob = {
          id: `job-${Date.now()}`,
          owner_id: 'guest',
          project_id: effectiveProjectId || null,
          type: 'generate',
          status: 'done',
          input: {
            title: draft.projectTitle,
            text: draft.generationText,
            cleanup: draft.cleanup,
          },
          output,
          error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const generatedAsset: LocalVoiceAsset = {
          id: `asset-generated-${Date.now()}`,
          owner_id: 'guest',
          project_id: effectiveProjectId || null,
          kind: 'generated',
          mime: 'audio/wav',
          storage_path: null,
          url: String(output.audio_url),
          duration_ms: null,
          created_at: new Date().toISOString(),
          local_only: true,
        };

        const nextJobs = [job, ...jobs];
        const nextAssets = [generatedAsset, ...assets];
        setJobs(nextJobs);
        setAssets(nextAssets);
        setPlaybackUrl(String(output.audio_url));
        saveGuestCollections(projects, profiles, nextAssets, nextJobs);
      }

      setDirty(true);
      updateDraft('step', 5);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const exportJson = () => {
    const payload = {
      draft,
      profiles,
      assets,
      jobs,
      exported_at: new Date().toISOString(),
    };
    saveBlob(`voice-lab-${draft.projectTitle.replace(/\s+/g, '-').toLowerCase()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  const importJson = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '{}');
        const parsed = JSON.parse(text) as {
          draft?: VoiceStudioDraft;
          profiles?: VoiceProfile[];
          assets?: LocalVoiceAsset[];
          jobs?: VoiceJob[];
        };

        if (parsed.draft) setDraft(parsed.draft);
        if (Array.isArray(parsed.profiles)) setProfiles(parsed.profiles);
        if (Array.isArray(parsed.assets)) setAssets(parsed.assets);
        if (Array.isArray(parsed.jobs)) setJobs(parsed.jobs);
        setDirty(true);
      } catch {
        setError(isEn ? 'Invalid JSON file.' : 'JSON ფაილი არასწორია.');
      }
    };
    reader.readAsText(file);
  };

  const downloadAudio = () => {
    const link = document.createElement('a');
    link.href = playbackUrl || SILENT_WAV_DATA_URL;
    link.download = `${draft.projectTitle.replace(/\s+/g, '-').toLowerCase()}-voice.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyShareLink = async () => {
    const url =
      window.location.origin +
      withLocalePath('/services/voice-lab', locale) +
      `?title=${encodeURIComponent(draft.projectTitle)}&import_asset_url=${encodeURIComponent(playbackUrl)}`;
    await navigator.clipboard.writeText(url);
  };

  const resetStudio = () => {
    setDraft(defaultDraft(locale));
    setAssets([]);
    setJobs([]);
    setActiveProjectId(null);
    setPlaybackUrl(SILENT_WAV_DATA_URL);
    setDirty(false);
    setSavedAt(null);
    setError(null);
  };

  const canGenerate = (draft.generationText || draft.sourceText).trim().length > 0;
  const saveState = saving
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
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                <Mic className="h-3.5 w-3.5" /> Voice Lab
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                {isEn ? 'Voice Lab Studio' : 'Voice Lab სტუდია'}
              </h1>
              <p className="mt-1 text-sm text-gray-300">
                {isEn
                  ? 'Record, clean, clone, and generate voice outputs with guided steps and cloud/local persistence.'
                  : 'ჩაწერე, გაასუფთავე, დააგენერირე ხმა ნაბიჯ-ნაბიჯ cloud/local შენახვით.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={dirty ? 'warning' : 'success'}>{saveState}</Badge>
              <Button onClick={() => setWizardOpen(true)}>
                <Sparkles className="mr-1 h-4 w-4" /> {isEn ? 'Start Voice Lab' : 'Voice Lab დაწყება'}
              </Button>
              <Button variant="secondary" onClick={resetStudio}>
                <RefreshCcw className="mr-1 h-4 w-4" /> {isEn ? 'New Project' : 'ახალი პროექტი'}
              </Button>
            </div>
          </div>
        </Card>

        {!authenticated && (
          <Card className="border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100">
            {isEn
              ? 'Guest mode active: your Voice Lab data is saved locally. Login to save in cloud.'
              : 'Guest რეჟიმი აქტიურია: Voice Lab მონაცემები ინახება ლოკალურად. Cloud-ში შენახვისთვის გაიარე ავტორიზაცია.'}
          </Card>
        )}

        {error && <Card className="border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</Card>}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card className="border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{isEn ? 'Voice Lab Wizard' : 'Voice Lab ვიზარდი'}</h2>
                <span className="text-xs text-gray-300">{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-amber-400 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-2 text-xs text-gray-400">{isEn ? `Step ${draft.step} of 6` : `ნაბიჯი ${draft.step} / 6`}</div>

              {!wizardOpen ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-5 text-sm text-gray-300">
                  {isEn ? 'Open studio to start a voice workflow.' : 'სტუდიის გახსნით დაიწყე ხმის workflow.'}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {draft.step === 1 && (
                    <div className="space-y-3">
                      <input
                        value={draft.projectTitle}
                        onChange={(e) => updateDraft('projectTitle', e.target.value)}
                        placeholder={isEn ? 'Project title' : 'პროექტის სახელი'}
                        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                      />

                      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-sm text-white">{isEn ? 'Microphone source' : 'მიკროფონის წყარო'}</p>
                        <p className="text-xs text-gray-400">
                          {isEn
                            ? 'Tap once to enable microphone permission and start recording.'
                            : 'ერთჯერადად დააჭირე მიკროფონის ნებართვისთვის და ჩაწერის დასაწყებად.'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {!recording ? (
                            <Button onClick={() => void startMic()} disabled={!micSupported}>
                              <Mic className="mr-1 h-4 w-4" /> {isEn ? 'Tap to enable microphone' : 'დააჭირე მიკროფონის ჩასართავად'}
                            </Button>
                          ) : (
                            <Button variant="secondary" onClick={() => void stopMic()}>
                              <MicOff className="mr-1 h-4 w-4" /> {isEn ? 'Stop recording' : 'ჩაწერის გაჩერება'}
                            </Button>
                          )}
                        </div>
                      </div>

                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/25 px-4 py-5 text-sm text-gray-200">
                        <Upload className="h-4 w-4" />
                        {isEn ? 'Upload WAV / MP3 / M4A' : 'ატვირთე WAV / MP3 / M4A'}
                        <input type="file" accept="audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/*" className="hidden" onChange={onAudioUpload} />
                      </label>

                      <textarea
                        value={draft.sourceText}
                        onChange={(e) => updateDraft('sourceText', e.target.value)}
                        placeholder={isEn ? 'Optional source transcript / voice notes' : 'არასავალდებულო ტექსტი / ხმოვანი შენიშვნები'}
                        className="h-24 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                      />
                    </div>
                  )}

                  {draft.step === 2 && (
                    <div className="space-y-3">
                      <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white">
                        <span>{isEn ? 'Trim silence' : 'სიჩუმის მოჭრა'}</span>
                        <input type="checkbox" checked={draft.cleanup.trim} onChange={(e) => updateCleanup('trim', e.target.checked)} />
                      </label>
                      <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white">
                        <span>{isEn ? 'Normalize levels' : 'დონის ნორმალიზაცია'}</span>
                        <input type="checkbox" checked={draft.cleanup.normalize} onChange={(e) => updateCleanup('normalize', e.target.checked)} />
                      </label>
                      <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white">
                        <span>{isEn ? 'Noise reduction' : 'ხმაურის შემცირება'}</span>
                        <input type="checkbox" checked={draft.cleanup.noiseReduction} onChange={(e) => updateCleanup('noiseReduction', e.target.checked)} />
                      </label>
                      <p className="text-xs text-amber-200">
                        {isEn
                          ? 'Preprocessing is currently deterministic mock mode while provider pipeline is being finalized.'
                          : 'Preprocessing ამ ეტაპზე მუშაობს deterministic mock რეჟიმში provider pipeline-ის მომზადებამდე.'}
                      </p>
                    </div>
                  )}

                  {draft.step === 3 && (
                    <div className="space-y-3">
                      <input
                        value={draft.voiceProfileName}
                        onChange={(e) => updateDraft('voiceProfileName', e.target.value)}
                        placeholder={isEn ? 'Voice profile name' : 'Voice profile სახელი'}
                        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select value={draft.voiceProfileLanguage} onChange={(e) => updateDraft('voiceProfileLanguage', e.target.value as VoiceLocale)} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white">
                          <option value="ka">ქართული</option>
                          <option value="en">English</option>
                        </select>
                        <input
                          value={draft.voiceProfileGenderHint}
                          onChange={(e) => updateDraft('voiceProfileGenderHint', e.target.value)}
                          placeholder={isEn ? 'Gender hint (optional)' : 'Gender მინიშნება (არჩევითი)'}
                          className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <Button variant="secondary" onClick={() => void createVoiceProfile()}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> {isEn ? 'Create Voice ID' : 'Voice ID შექმნა'}
                      </Button>

                      {profiles.length === 0 ? (
                        <EmptyState title={isEn ? 'No voice profiles yet' : 'Voice profile ჯერ არ არის'} description={isEn ? 'Create one to continue.' : 'გასაგრძელებლად შექმენი Voice profile.'} />
                      ) : (
                        <div className="space-y-2">
                          {profiles.slice(0, 6).map((profile) => (
                            <button
                              key={profile.id}
                              type="button"
                              onClick={() => updateDraft('selectedVoiceProfileId', profile.id)}
                              className={`w-full rounded-xl border p-3 text-left ${draft.selectedVoiceProfileId === profile.id ? 'border-amber-400 bg-amber-500/10' : 'border-white/10 bg-black/25'}`}
                            >
                              <div className="text-sm font-medium text-white">{profile.name}</div>
                              <div className="text-xs text-gray-300">{profile.language.toUpperCase()} • {profile.provider}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {draft.step === 4 && (
                    <div className="space-y-3">
                      <textarea
                        value={draft.generationText}
                        onChange={(e) => updateDraft('generationText', e.target.value)}
                        placeholder={isEn ? 'Enter text for generated narration...' : 'შეიყვანე ტექსტი გენერირებული ნარაციისთვის...'}
                        className="h-28 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                      />
                      <textarea
                        value={draft.notes}
                        onChange={(e) => updateDraft('notes', e.target.value)}
                        placeholder={isEn ? 'Usage notes (campaign, platform, style...)' : 'გამოყენების შენიშვნები (კამპანია, პლატფორმა, სტილი...)'}
                        className="h-20 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                      />
                      <Button onClick={() => void runGenerate()} disabled={running || !canGenerate}>
                        {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
                        {isEn ? 'Generate Voice Job' : 'Voice Job-ის გენერაცია'}
                      </Button>
                    </div>
                  )}

                  {draft.step === 5 && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-white">{isEn ? 'Playback & status' : 'დაკვრა და სტატუსი'}</p>
                          <Badge variant={latestJob?.status === 'done' ? 'success' : latestJob?.status === 'failed' ? 'danger' : 'warning'}>
                            {latestJob?.status || 'idle'}
                          </Badge>
                        </div>
                        <div className="mb-2 h-14 rounded-lg border border-white/10 bg-gradient-to-r from-white/5 via-white/10 to-white/5" />
                        <p className="mb-2 text-xs text-gray-300">
                          {isEn ? 'Waveform preview placeholder (stable UI for all states).' : 'Waveform პრევიუ placeholder (სტაბილური UI ყველა მდგომარეობაში).' }
                        </p>
                        <audio controls src={playbackUrl} className="w-full" />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={downloadAudio}><Download className="mr-1 h-4 w-4" /> {isEn ? 'Download audio' : 'აუდიოს გადმოწერა'}</Button>
                        <Button variant="secondary" onClick={() => void copyShareLink()}><ClipboardCopy className="mr-1 h-4 w-4" /> {isEn ? 'Copy share link' : 'ბმულის კოპირება'}</Button>
                        <Button variant="secondary" onClick={exportJson}><Download className="mr-1 h-4 w-4" /> {isEn ? 'Export pack JSON' : 'პაკეტის ექსპორტი JSON'}</Button>
                        <label className="inline-flex cursor-pointer items-center rounded-md border border-white/20 px-3 py-2 text-sm text-white">
                          {isEn ? 'Import JSON' : 'JSON იმპორტი'}
                          <input type="file" accept="application/json" className="hidden" onChange={importJson} />
                        </label>
                      </div>
                    </div>
                  )}

                  {draft.step === 6 && (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-300">
                        {isEn ? 'Send output to related services with locale-safe deep links.' : 'გადაგზავნე შედეგი დაკავშირებულ სერვისებში locale-safe deep-link-ებით.'}
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {integrations.map((target) => (
                          <Link key={target.title} href={target.href} className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white transition hover:border-cyan-400/40">
                            <div className="flex items-center gap-2">
                              <Link2 className="h-4 w-4 text-cyan-300" /> {target.title}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                    <Button variant="secondary" onClick={() => updateDraft('step', Math.max(1, draft.step - 1) as WizardStep)} disabled={draft.step === 1}>
                      {isEn ? 'Back' : 'უკან'}
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => void saveProject()} disabled={saving}>
                        {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                        {isEn ? 'Save + resume later' : 'შენახვა + გაგრძელება შემდეგ'}
                      </Button>
                      <Button onClick={() => updateDraft('step', Math.min(6, draft.step + 1) as WizardStep)} disabled={draft.step === 6}>
                        {isEn ? 'Next' : 'შემდეგ'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 text-base font-semibold text-white">{isEn ? 'Voice projects' : 'Voice პროექტები'}</h3>
              {loadingProjects ? (
                <Spinner label={isEn ? 'Loading projects...' : 'პროექტების ჩატვირთვა...'} />
              ) : projects.length === 0 ? (
                <EmptyState title={isEn ? 'No projects yet' : 'პროექტები ჯერ არ არის'} description={isEn ? 'Create and save your first Voice Lab project.' : 'შექმენი და შეინახე პირველი Voice Lab პროექტი.'} />
              ) : (
                <div className="space-y-2">
                  {projects.slice(0, 8).map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        setActiveProjectId(project.id);
                        setDraft((current) => ({ ...current, projectTitle: project.title }));
                        setWizardOpen(true);
                      }}
                      className={`w-full rounded-xl border p-3 text-left ${activeProjectId === project.id ? 'border-amber-400 bg-amber-500/10' : 'border-white/10 bg-black/25'}`}
                    >
                      <div className="text-sm font-medium text-white">{project.title}</div>
                      <div className="text-xs text-gray-400">{new Date(project.updated_at).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card className="border-white/10 bg-white/5 p-4">
              <button type="button" onClick={() => setShowDiagnostics((current) => !current)} className="mb-2 text-left text-base font-semibold text-white">
                {isEn ? 'Diagnostics' : 'დიაგნოსტიკა'}
              </button>
              {showDiagnostics ? (
                <div className="space-y-1 text-xs text-gray-300">
                  <p>secureContext: {String(diagnostics.secureContext)}</p>
                  <p>permission: {diagnostics.permissionState}</p>
                  <p>audio devices: {diagnostics.deviceCount}</p>
                  <p>recorder: {diagnostics.recorderState}</p>
                  <p>last error: {diagnostics.lastError || 'none'}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400">{isEn ? 'Collapsed. Open for microphone and recorder details.' : 'დახურულია. გახსენი მიკროფონის და recorder-ის დეტალებისთვის.'}</p>
              )}
            </Card>

            <Card className="border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 text-base font-semibold text-white">{isEn ? 'Quick actions' : 'სწრაფი ქმედებები'}</h3>
              <div className="space-y-2">
                <Button className="w-full" onClick={() => setWizardOpen(true)}>
                  <Sparkles className="mr-1 h-4 w-4" /> {isEn ? 'Open studio' : 'სტუდიის გახსნა'}
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => void saveProject()} disabled={saving}>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> {isEn ? 'Save project' : 'პროექტის შენახვა'}
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => void runGenerate()} disabled={running || !canGenerate}>
                  <Wand2 className="mr-1 h-4 w-4" /> {isEn ? 'Generate' : 'გენერაცია'}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
