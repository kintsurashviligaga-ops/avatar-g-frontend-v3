// ─── ENUMS ───────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'queued' | 'claimed' | 'processing' | 'completed' | 'failed' | 'dead'

export type AvatarStatus = 'none' | 'processing' | 'ready' | 'failed'
export type PlanId = 'free' | 'pro' | 'premium' | 'enterprise'
export type LocaleCode = 'ka' | 'en' | 'ru'
export type WorkerType = 'cpu' | 'gpu' | 'hybrid'
export type AgentType = 'director' | 'specialist' | 'integration'

export type Platform =
  | 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'website' | 'other'

export type StylePreset =
  | 'Business Pro' | 'Creator Viral' | 'Luxury' | 'Minimal' | 'Noir'

export type ProjectStatus = 'draft' | 'running' | 'done' | 'failed'
export type MessageRole = 'user' | 'assistant' | 'system'

// ─── INTAKE ──────────────────────────────────────────────────────────────────

export interface SmartIntake {
  goal: string
  audience: string
  platform: Platform
  language: LocaleCode
  stylePreset: StylePreset
  deadline?: string // ISO datetime
  budgetPlan: PlanId
  notes?: string
}

// ─── ARTIFACT ────────────────────────────────────────────────────────────────

export interface ArtifactRef {
  bucket: string
  path: string
  mimeType: string
  sizeBytes: number
  label: string
  url?: string // signed URL, ephemeral
}

// ─── EXECUTION ───────────────────────────────────────────────────────────────

export interface ExecutionStep {
  stepIndex: number
  agentId: string
  label: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  jobId?: string
  durationMs?: number
  qaScore?: number
}

export interface ExecutionPlan {
  rootJobId: string
  steps: ExecutionStep[]
  bundleType?: string
  createdAt: string
}

// ─── QA ──────────────────────────────────────────────────────────────────────

export interface QAReport {
  score: number // 0–100
  passed: boolean
  checks: {
    formatCompliance: boolean
    textReadability: boolean
    audioClean: boolean
    safeMargins: boolean
    logoPresent: boolean
    exportComplete: boolean
  }
  failReasons: string[]
  fixSuggestions: string[]
}
