import type { SmartIntake, StylePreset, ArtifactRef } from './core'

export interface Project {
  id: string
  user_id: string
  service_id: string
  title: string
  active_version: number
  created_at: string
}

export interface ProjectVersion {
  id: string
  project_id: string
  version: number
  intake: SmartIntake
  status: 'draft' | 'running' | 'done' | 'failed'
  root_job_id: string | null
  artifacts: ArtifactRef[]
  qa_score: number | null
  created_at: string
}

export interface Conversation {
  id: string
  user_id: string
  agent_id: string
  project_id: string | null
  title: string | null
  created_at: string
}

export interface ChatMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments: ArtifactRef[]
  metadata: Record<string, unknown>
  created_at: string
}

export interface ServicePreset {
  id: StylePreset
  label: string
  description: string
  intake: Partial<SmartIntake>
  config: Record<string, unknown>
}

export const STYLE_PRESETS: ServicePreset[] = [
  {
    id: 'Business Pro',
    label: 'Business Pro',
    description: 'Clean, authoritative, conversion-focused',
    intake: { stylePreset: 'Business Pro', platform: 'website', budgetPlan: 'pro' },
    config: { tone: 'professional', colorScheme: 'corporate', typography: 'sans-serif' },
  },
  {
    id: 'Creator Viral',
    label: 'Creator Viral',
    description: 'High energy, fast cuts, trend-native',
    intake: { stylePreset: 'Creator Viral', platform: 'tiktok', budgetPlan: 'pro' },
    config: { tone: 'energetic', pacing: 'fast', captionStyle: 'bold-outline' },
  },
  {
    id: 'Luxury',
    label: 'Luxury',
    description: 'Slow, cinematic, aspirational',
    intake: { stylePreset: 'Luxury', platform: 'instagram', budgetPlan: 'premium' },
    config: { tone: 'elevated', colorGrade: 'warm-cinematic', typography: 'serif' },
  },
  {
    id: 'Minimal',
    label: 'Minimal',
    description: 'White space, precision, editorial',
    intake: { stylePreset: 'Minimal', platform: 'website', budgetPlan: 'free' },
    config: { tone: 'clean', colorScheme: 'monochrome', density: 'low' },
  },
  {
    id: 'Noir',
    label: 'Noir',
    description: 'Dark, dramatic, cinematic noir',
    intake: { stylePreset: 'Noir', platform: 'youtube', budgetPlan: 'premium' },
    config: { tone: 'dramatic', colorGrade: 'cold-noir', lighting: 'chiaroscuro' },
  },
]
