import type { LucideIcon } from 'lucide-react';

export type ServiceId =
  | 'agent-g'
  | 'business-strategy'
  | 'executive-ops'
  | 'avatar-studio'
  | 'image-gen'
  | 'video-gen'
  | 'voice-synth'
  | 'music-lab'
  | 'copy-engine'
  | 'workflow-automation'
  | 'analytics-hub'
  | 'commerce-pilot'
  | 'fulfillment-hq';

export type PreviewKind = 'image' | 'video' | 'audio' | 'text' | 'workflow';

export type ServiceStatus = 'idle' | 'ready' | 'running' | 'error';

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
}

export interface ServiceRuntimeState {
  enabled: boolean;
  autopilot: boolean;
  syncPreview: boolean;
  fidelity: number;
  intensity: number;
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
