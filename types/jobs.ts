/**
 * Job Queue Type Definitions
 * Central types for the job queue system, worker infrastructure, and agent execution.
 */

// ─── Job Status ──────────────────────────────────────────
export type JobStatus = 'queued' | 'claimed' | 'processing' | 'completed' | 'failed' | 'dead'
export type AgentType = 'director' | 'specialist' | 'integration'
export type WorkerType = 'cpu' | 'gpu' | 'hybrid'

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
  artifacts?: ArtifactReference[]
  error?: string
  metadata?: Record<string, unknown>
}

export interface ArtifactReference {
  bucket: string
  path: string
  mimeType: string
  sizeBytes: number
  label: string
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

// ─── Execution Trace ─────────────────────────────────────
export type ExecutionStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface ExecutionTraceStep {
  id: string
  root_job_id: string
  step_index: number
  agent_id: string
  sub_job_id: string | null
  status: ExecutionStepStatus
  input_snapshot: Record<string, unknown> | null
  output_snapshot: Record<string, unknown> | null
  duration_ms: number | null
  created_at: string
  updated_at: string
}

// ─── Job Log ─────────────────────────────────────────────
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface JobLog {
  id: string
  job_id: string
  worker_id: string | null
  level: LogLevel
  message: string
  data: Record<string, unknown> | null
  created_at: string
}

// ─── Worker Heartbeat ────────────────────────────────────
export type WorkerStatus = 'idle' | 'busy' | 'draining' | 'offline'

export interface WorkerHeartbeat {
  worker_id: string
  worker_type: 'cpu' | 'gpu'
  agent_ids: string[]
  status: WorkerStatus
  current_job_id: string | null
  jobs_processed: number
  jobs_failed: number
  last_seen_at: string
  started_at: string
  version: string | null
  metadata: Record<string, unknown>
}

// ─── Agent Definition ────────────────────────────────────
export interface AgentDefinition {
  id: string
  name: string
  description: string | null
  agent_type: AgentType
  parent_id: string | null
  worker_type: WorkerType
  timeout_seconds: number
  max_attempts: number
  active: boolean
  config: Record<string, unknown>
  created_at: string
}

// ─── API Request/Response Types ──────────────────────────
export interface CreateJobRequest {
  agent_id: string
  payload: Record<string, unknown>
  idempotency_key?: string
  priority?: number
}

export interface CreateJobResponse {
  jobId: string
  status: JobStatus
  estimatedSteps?: number
}

export interface JobStatusResponse {
  id: string
  status: JobStatus
  progress?: number
  result: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// ─── Health Check ────────────────────────────────────────
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down'
  timestamp: string
  version: string
  checks: {
    database: 'ok' | 'fail'
    workers_alive: number
    workers_dead: number
    queue_depth: number
    dead_letter_count: number
  }
}

// ─── Editing Agent Types ─────────────────────────────────
export interface SubtitleStyle {
  fontFamily: string
  fontSize: number
  color: string
  backgroundColor: string
  position: 'bottom' | 'top'
}

export interface AudioTrack {
  path: string
  volume: number
  startAt: number
  fadeIn?: number
  fadeOut?: number
}

export type EditingOperation =
  | { op: 'trim'; start_sec: number; end_sec: number }
  | { op: 'transition'; type: 'fade' | 'cut' | 'dissolve' | 'wipe'; duration_frames: number }
  | { op: 'subtitle'; mode: 'auto' | 'manual'; language: string; style: SubtitleStyle }
  | { op: 'lip_sync'; audio_path: string; model: 'wav2lip' | 'sadtalker' }
  | { op: 'color_grade'; preset: 'cinematic' | 'warm' | 'cool' | 'bw' | 'custom'; lut_path?: string }
  | { op: 'speed'; factor: number }
  | { op: 'audio_mix'; tracks: AudioTrack[]; normalize: boolean }
  | { op: 'watermark'; image_path: string; position: 'br' | 'bl' | 'tr' | 'tl'; opacity: number }

export interface EditingJobPayload {
  source_assets: {
    type: 'video' | 'image_sequence' | 'audio'
    bucket: string
    path: string
  }[]
  operations: EditingOperation[]
  export_formats: ('mp4_1080p' | 'mp4_4k' | 'webm_1080p' | 'gif_720p')[]
  output_path_prefix: string
}

export interface EditingJobResult {
  exports: {
    format: string
    bucket: string
    path: string
    size_bytes: number
    duration_sec: number
    resolution: string
    codec: string
  }[]
  subtitle_file?: {
    bucket: string
    path: string
    language: string
    word_count: number
  }
  metadata: {
    pipeline_version: string
    total_duration_sec: number
    steps_completed: string[]
    processing_time_ms: number
    gpu_utilized: boolean
  }
}
