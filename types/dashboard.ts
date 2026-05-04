import type { ElementType } from 'react';

export type SupportedLocale = 'en' | 'ka' | 'ru';

export type ServiceMode =
  | 'overview'
  | 'voice'
  | 'avatar'
  | 'video'
  | 'image'
  | 'photo'
  | 'music'
  | 'editing'
  | 'text'
  | 'prompt'
  | 'workflow'
  | 'agent-g'
  | 'media'
  | 'visual-intel'
  | 'shop'
  | 'software'
  | 'business'
  | 'tourism'
  | 'game'
  | 'interior'
  | 'code';

export type ServiceGroup = 'featured' | 'create' | 'intelligence' | 'automation' | 'business';
export type NativeWorkspaceServiceMode = 'photo' | 'editing' | 'software' | 'business';
export type DashboardOutputKind = 'text' | 'image' | 'video' | 'audio';

export type LocalizedText = Record<SupportedLocale, string>;

export type ServiceDefinition = {
  id: ServiceMode;
  icon: ElementType;
  accent: string;
  group: ServiceGroup;
  cost: number;
  featured?: boolean;
  label: LocalizedText;
  description: LocalizedText;
  related: ServiceMode[];
  searchTerms: string[];
};

export type DashboardServiceGroup = {
  group: ServiceGroup;
  services: ServiceDefinition[];
};

export type SessionItem = {
  id: string;
  service: ServiceMode;
  title: string;
  detail: string;
  timestamp: string;
};

export type DashboardRecentRun = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  muted?: boolean;
};

export type DashboardJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type DashboardJobStatusLabels = Partial<Record<DashboardJobStatus, string>>;

export type DashboardJob = {
  id: string;
  serviceId: ServiceMode;
  label: string;
  progress: number;
  status: DashboardJobStatus;
  detail?: string;
};

export type WorkspaceResult = {
  kind: DashboardOutputKind;
  title?: string;
  detail?: string;
  text?: string;
  url?: string;
  viewerUrl?: string;
  modelUrl?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
};

export type DashboardPreview = WorkspaceResult & {
  serviceId: ServiceMode;
  updatedAt: string;
};

export type PanelRunCallbacks = {
  onJobStart: (service: ServiceMode, label: string) => string;
  onJobProgress: (jobId: string, progress: number) => void;
  onJobComplete: (jobId: string, service: ServiceMode, title: string, detail: string, preview?: WorkspaceResult) => void;
  onJobError: (jobId: string, message: string) => void;
};
