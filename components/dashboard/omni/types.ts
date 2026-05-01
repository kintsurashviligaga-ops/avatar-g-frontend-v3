import type { LucideIcon } from 'lucide-react';

export type ServiceId =
  | 'avatar'
  | 'video'
  | 'image'
  | 'music'
  | 'game-creation'
  | 'interior-design'
  | 'prompt-builder'
  | 'terminal-coding';

export type PreviewKind = 'image' | 'video' | 'audio' | 'text' | 'workflow';

export type ServiceStatus = 'idle' | 'ready' | 'running' | 'error';

export type CommandLanguage = 'ka' | 'en' | 'ru';

export type ExternalInputKind = 'file' | 'voice' | 'camera' | 'text';

export interface OmniServiceDescriptor {
  id: ServiceId;
  title: string;
  subtitle: string;
  short: string;
  worker: string;
  accent: string;
  previewKind: PreviewKind;
  defaultPrompt: string;
  icon: LucideIcon;
}

export interface PreviewArtifact {
  id: string;
  serviceId: ServiceId;
  kind: PreviewKind;
  title: string;
  summary: string;
  createdAt: number;
  sourceUrl?: string;
  textBody?: string;
  audioUrl?: string;
}

export interface ExternalCommandInput {
  id: string;
  kind: ExternalInputKind;
  title: string;
  createdAt: number;
  fileName?: string;
  mimeType?: string;
  size?: number;
  textContent?: string;
  sourceUrl?: string;
}

export interface ExpertSettings {
  seed: number;
  sampling: number;
  weights: number;
  temperature: number;
}

export interface ServiceRuntimeState {
  enabled: boolean;
  autopilot: boolean;
  syncPreview: boolean;
  fidelity: number;
  intensity: number;
  expert: ExpertSettings;
  moduleSettings: Record<string, string | number | boolean>;
  status: ServiceStatus;
  queueDepth: number;
  lastPrompt: string;
  outputs: PreviewArtifact[];
  referenceIds: string[];
}

export type ActivityLevel = 'api' | 'agent' | 'worker' | 'system';

export interface ActivityItem {
  id: string;
  level: ActivityLevel;
  message: string;
  ts: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

export interface AuthSnapshot {
  status: 'authenticated' | 'guest';
  displayName: string;
  tierLabel: string;
}
