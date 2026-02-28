/**
 * GPU Worker Entry Point
 * Polls the job queue for GPU-intensive tasks.
 * Supported agents: avatar, video, image, editing, music, photo, visual-intel, creative-engine.
 * IMPORTANT: maxConcurrentJobs = 1 for GPU workers (GPU is single-threaded per job).
 */

import { claimNextJob, processJob, markJobFailed } from '../shared/queue'
import { startHeartbeat } from '../shared/heartbeat'
import { structuredLog } from '../shared/logger'
import type { WorkerConfig, AgentResult } from '../shared/types'

// ── Agent Handlers ──────────────────────────────────────
const agentHandlers: Record<
  string,
  (payload: Record<string, unknown>) => Promise<AgentResult>
> = {
  'avatar-agent': async (payload) => {
    structuredLog('info', 'avatar_agent_start', { payload })
    // Real implementation: calls Python subprocess or HTTP GPU service
    return { success: true, data: { output: 'Avatar generated' } }
  },
  'video-agent': async (payload) => {
    structuredLog('info', 'video_agent_start', { payload })
    return { success: true, data: { output: 'Video rendered' } }
  },
  'image-agent': async (payload) => {
    structuredLog('info', 'image_agent_start', { payload })
    return { success: true, data: { output: 'Image created' } }
  },
  'editing-agent': async (payload) => {
    structuredLog('info', 'editing_agent_start', { payload })
    return { success: true, data: { output: 'Editing pipeline complete' } }
  },
  'music-agent': async (payload) => {
    structuredLog('info', 'music_agent_start', { payload })
    return { success: true, data: { output: 'Track generated' } }
  },
  'photo-agent': async (payload) => {
    structuredLog('info', 'photo_agent_start', { payload })
    return { success: true, data: { output: 'Photo processed' } }
  },
  'visual-intel-agent': async (payload) => {
    structuredLog('info', 'visual_intel_agent_start', { payload })
    return { success: true, data: { output: 'Visual analysis complete' } }
  },
  'creative-engine-agent': async (payload) => {
    structuredLog('info', 'creative_engine_agent_start', { payload })
    return { success: true, data: { output: 'Creative content generated' } }
  },
  'media-agent': async (payload) => {
    structuredLog('info', 'media_agent_start', { payload })
    return { success: true, data: { output: 'Media production complete' } }
  },
}

function getAgentFn(
  agentId: string
): ((payload: Record<string, unknown>) => Promise<AgentResult>) | null {
  return agentHandlers[agentId] ?? null
}

// ── Worker Config ───────────────────────────────────────
const CONFIG: WorkerConfig = {
  workerId: process.env.WORKER_ID ?? `gpu-${process.pid}`,
  workerType: 'gpu',
  supportedAgents: [
    'avatar-agent',
    'video-agent',
    'image-agent',
    'editing-agent',
    'music-agent',
    'photo-agent',
    'visual-intel-agent',
    'creative-engine-agent',
    'media-agent',
  ],
  pollIntervalMs: 2000,
  heartbeatIntervalMs: 10000,
  maxConcurrentJobs: 1, // GPU: single job at a time
}

// ── Bootstrap ───────────────────────────────────────────
async function bootstrap(): Promise<void> {
  structuredLog('info', 'worker_starting', { config: CONFIG })
  startHeartbeat(CONFIG)

  let activeJobs = 0

  const poll = async () => {
    if (activeJobs >= CONFIG.maxConcurrentJobs) return

    const job = await claimNextJob(CONFIG.workerId, CONFIG.supportedAgents)
    if (!job) return

    activeJobs++
    const agentFn = getAgentFn(job.agent_id)

    if (!agentFn) {
      await markJobFailed(
        job.id,
        `No handler for agent: ${job.agent_id}`,
        job.attempt_count,
        job.max_attempts
      )
      activeJobs--
      return
    }

    processJob(job, agentFn).finally(() => {
      activeJobs--
    })
  }

  setInterval(poll, CONFIG.pollIntervalMs)

  // Graceful shutdown
  process.on('SIGTERM', () => {
    structuredLog('info', 'worker_draining', { workerId: CONFIG.workerId })
    setTimeout(() => process.exit(0), 30_000)
  })
}

bootstrap().catch((err) => {
  structuredLog('error', 'worker_bootstrap_failed', {
    error: (err as Error).message,
  })
  process.exit(1)
})
