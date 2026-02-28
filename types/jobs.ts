/**
 * Job Queue Type Definitions
 * Central types for the job queue system, worker infrastructure, and agent execution.
 * Imports core enums from types/core.ts — the single source of truth.
 */

import type { JobStatus, ArtifactRef, QAReport } from './core'

// Re-export for convenience
export type { JobStatus } from './core'
/** @deprecated Use ArtifactRef from types/core instead */
export type ArtifactReference = ArtifactRef
export { type ArtifactRef } from './core'

// ─── Job Record ──────────────────────────────────────────
export interface JobRecord {
  id: string
  user_id: string
  agent_id: string
  parent_job_id: string | null
  status: JobStatus
  priority: number
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  error_message: string | null
  attempt_count: number
  max_attempts: number
  worker_id: string | null
  claimed_at: string | null
  started_at: string | null
  completed_at: string | null
  next_retry_at: string | null
  timeout_seconds: number
  idempotency_key: string | null
  created_at: string
  updated_at: string
}

// ─── Agent Result ────────────────────────────────────────
export interface AgentResult {
  success: boolean
  data?: Record<string, unknown>
  artifacts?: ArtifactRef[]
  qaReport?: QAReport
  error?: string
  metadata?: Record<string, unknown>
}

// ─── Worker Config ───────────────────────────────────────
export interface WorkerConfig {
  workerId: string
  workerType: 'cpu' | 'gpu'
  supportedAgents: string[]
  pollIntervalMs: number
  heartbeatIntervalMs: number
  maxConcurrentJobs: number
}

// ─── API Request / Response ──────────────────────────────
export interface CreateJobRequest {
  agent_id: string
  payload?: Record<string, unknown>
  idempotency_key?: string
  priority?: number
}

export interface CreateJobResponse {
  jobId: string
  status: JobStatus
}

// ─── Job Log Entry ───────────────────────────────────────
export interface JobLogEntry {
  id: string
  job_id: string
  worker_id: string | null
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  data: Record<string, unknown> | null
  created_at: string
}

// ─── Job Status Response (polling endpoint) ──────────────
export interface JobStatusResponse {
  id: string
  status: JobStatus
  result: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// ─── Editing Agent Types ─────────────────────────────────
export interface EditingJobPayload {
  source_assets: Array<{ bucket: string; path: string }>
  operations: Array<{ op: string; [key: string]: unknown }>
  export_formats: string[]
  output_path_prefix: string
}

export interface EditingJobResult {
  exports: Array<{
    format: string
    bucket: string
    path: string
    size_bytes: number
    duration_sec: number
    resolution: string
    codec: string
  }>
  metadata: {
    pipeline_version: string
    total_duration_sec: number
    steps_completed: string[]
    processing_time_ms: number
    gpu_utilized: boolean
  }
}
