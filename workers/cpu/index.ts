/**
 * CPU Worker Entry Point
 * Polls the job queue for CPU-compatible tasks.
 * Supported agents: text, prompt, workflow, social, shop.
 */

import { claimNextJob, processJob, markJobFailed } from '../shared/queue'
import { startHeartbeat } from '../shared/heartbeat'
import { structuredLog } from '../shared/logger'
import type { WorkerConfig, AgentResult } from '../shared/types'

// ── Agent Handlers ──────────────────────────────────────
// Each agent module exports an async function matching:
//   (payload: Record<string, unknown>) => Promise<AgentResult>

const agentHandlers: Record<
  string,
  (payload: Record<string, unknown>) => Promise<AgentResult>
> = {
  'text-agent': async (payload) => {
    structuredLog('info', 'text_agent_start', { payload })
    // Placeholder: real implementation connects to LLM API
    return { success: true, data: { output: 'Text generation complete' } }
  },
  'prompt-agent': async (payload) => {
    structuredLog('info', 'prompt_agent_start', { payload })
    return { success: true, data: { output: 'Prompt optimized' } }
  },
  'workflow-agent': async (payload) => {
    structuredLog('info', 'workflow_agent_start', { payload })
    return { success: true, data: { output: 'Workflow executed' } }
  },
  'social-agent': async (payload) => {
    structuredLog('info', 'social_agent_start', { payload })
    return { success: true, data: { output: 'Social content generated' } }
  },
  'shop-agent': async (payload) => {
    structuredLog('info', 'shop_agent_start', { payload })
    return { success: true, data: { output: 'Shop action completed' } }
  },
}

function getAgentFn(
  agentId: string
): ((payload: Record<string, unknown>) => Promise<AgentResult>) | null {
  return agentHandlers[agentId] ?? null
}

// ── Worker Config ───────────────────────────────────────
const CONFIG: WorkerConfig = {
  workerId: process.env.WORKER_ID ?? `cpu-${process.pid}`,
  workerType: 'cpu',
  supportedAgents: [
    'text-agent',
    'prompt-agent',
    'workflow-agent',
    'social-agent',
    'shop-agent',
  ],
  pollIntervalMs: 2000,
  heartbeatIntervalMs: 10000,
  maxConcurrentJobs: 4,
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
