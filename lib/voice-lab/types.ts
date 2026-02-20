export type VoiceLocale = 'ka' | 'en';

export type VoiceProjectStatus = 'draft' | 'active';
export type VoiceAssetKind = 'recording' | 'upload' | 'generated';
export type VoiceJobType = 'cleanup' | 'clone' | 'generate';
export type VoiceJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type VoiceProfile = {
  id: string;
  owner_id: string;
  name: string;
  language: VoiceLocale;
  gender_hint: string | null;
  provider: string;
  provider_voice_id: string;
  created_at: string;
};

export type VoiceProject = {
  id: string;
  owner_id: string;
  title: string;
  status: VoiceProjectStatus;
  created_at: string;
  updated_at: string;
};

export type VoiceAsset = {
  id: string;
  owner_id: string;
  project_id: string | null;
  kind: VoiceAssetKind;
  mime: string;
  storage_path: string | null;
  url: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type VoiceJob = {
  id: string;
  owner_id: string;
  project_id: string | null;
  type: VoiceJobType;
  status: VoiceJobStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type VoiceStudioDraft = {
  locale: VoiceLocale;
  step: 1 | 2 | 3 | 4 | 5 | 6;
  projectTitle: string;
  sourceText: string;
  cleanup: {
    trim: boolean;
    normalize: boolean;
    noiseReduction: boolean;
  };
  selectedVoiceProfileId: string | null;
  voiceProfileName: string;
  voiceProfileLanguage: VoiceLocale;
  voiceProfileGenderHint: string;
  generationText: string;
  notes: string;
};
