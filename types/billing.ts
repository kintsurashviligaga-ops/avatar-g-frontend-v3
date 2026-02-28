// types/billing.ts

import type { PlanId, CreditPackId, CreditOperation } from '@/lib/billing/pricingConfig'

export type { PlanId, CreditPackId, CreditOperation }

// ─── DB ROW SHAPES ────────────────────────────────────────────────────────────

export interface UserCreditsRow {
  user_id: string
  plan_id: PlanId
  balance: number
  period_start: string
  period_end: string
  flagged_soft_cap: boolean
  updated_at: string
}

export interface CreditsLedgerEntry {
  id: string
  user_id: string
  delta: number
  reason: string
  meta: Record<string, unknown>
  created_at: string
}

export interface ExecutiveTaskLog {
  id: string
  user_id: string
  input_channel: 'phone' | 'sms' | 'email' | 'dashboard'
  input_text: string | null
  phone_e164: string | null
  detected_intent: string | null
  workflow: Record<string, unknown>
  outputs: ExecutiveOutputs
  credits_used: number
  status: 'queued' | 'running' | 'completed' | 'failed'
  error: string | null
  created_at: string
  updated_at: string
}

// ─── API RESPONSE SHAPES ──────────────────────────────────────────────────────

export interface CreditsResponse {
  plan_id: PlanId
  balance: number
  period_start: string
  period_end: string
  soft_cap: number | null
  flagged_soft_cap: boolean
  recent: CreditsLedgerEntry[]
}

export interface TopupResponse {
  balance: number
}

// ─── EXECUTIVE TYPES ──────────────────────────────────────────────────────────

export interface ExecutiveTaskInput {
  userId: string
  channel: 'phone' | 'sms' | 'email' | 'dashboard'
  text: string
  phone?: string
}

export interface ExecutiveWorkflowStep {
  agentId: string
  label: string
  creditsEstimate: number
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  durationMs?: number
  error?: string
}

export interface ExecutiveWorkflowPlan {
  objective: string
  detected_intent: string
  requiredAgents: ExecutiveWorkflowStep[]
  priority: 'executive'
  createdAt: string
}

export interface ExecutiveOutputs {
  summaryText: string
  artifacts: ExecutiveArtifact[]
  deliveries: DeliveryRecord[]
}

export interface ExecutiveArtifact {
  label: string
  type: 'pdf' | 'docx' | 'txt' | 'mp4' | 'mp3' | 'zip' | 'json'
  url: string
  expiresAt: string // ISO — always 24h from generation
  sizeBytes?: number
}

export interface DeliveryRecord {
  channel: 'email' | 'sms' | 'dashboard'
  status: 'sent' | 'pending' | 'failed'
  sentAt?: string
  detail?: string
}

// ─── TELEPHONY ────────────────────────────────────────────────────────────────

export interface IncomingCallPayload {
  from: string        // E.164 caller number
  to: string          // E.164 destination number
  callSid: string     // Provider call identifier
  direction: 'inbound' | 'outbound'
}

export interface OutboundCallRequest {
  to: string          // E.164 destination
  userId: string
  taskId?: string
}

export interface OutboundCallResult {
  callSid: string
  status: string
}
