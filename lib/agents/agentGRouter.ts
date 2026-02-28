import { createServiceRoleClient } from '@/lib/supabase/server'
import { AGENT_G_BUNDLES } from '@/types/agents'
import { SERVICE_REGISTRY } from '@/lib/services/registry'
import { structuredLog } from '@/lib/logger'
import type { BundleType } from '@/types/agents'
import type { ExecutionPlan } from '@/types/core'

function supabase() {
  return createServiceRoleClient()
}

class AgentGRouter {
  // ─── Chat routing ──────────────────────────────────────────────────────────
  async routeChat(params: {
    userId: string
    agentId: string
    conversationId: string
    projectId?: string
    message: string
    attachments: unknown[]
  }): Promise<{ jobId: string }> {
    const db = supabase()
    const { data: job, error } = await db
      .from('jobs')
      .insert({
        user_id: params.userId,
        agent_id: params.agentId,
        status: 'queued',
        priority: 5,
        payload: {
          type: 'chat',
          conversation_id: params.conversationId,
          project_id: params.projectId ?? null,
          message: params.message,
          attachments: params.attachments,
          task_memory: await this.getTaskMemory(params.userId),
        },
      })
      .select('id')
      .single()

    if (error) throw error
    structuredLog('info', 'agent_g_chat_routed', { jobId: job.id, agentId: params.agentId })
    return { jobId: job.id }
  }

  // ─── Pipeline dispatch ─────────────────────────────────────────────────────
  async buildAndDispatch(params: {
    userId: string
    serviceId: string
    intake: Record<string, unknown>
    mode: 'single' | 'bundle'
    bundleType?: BundleType
    projectId?: string
  }): Promise<ExecutionPlan> {
    const db = supabase()
    const taskMemory = await this.getTaskMemory(params.userId)

    // Create root job (agent-g is director, status=queued triggers worker)
    const { data: rootJob, error: rootError } = await db
      .from('jobs')
      .insert({
        user_id: params.userId,
        agent_id: 'agent-g',
        status: 'queued',
        priority: 8,
        payload: {
          type: 'orchestrate',
          service_id: params.serviceId,
          intake: params.intake,
          mode: params.mode,
          bundle_type: params.bundleType,
          project_id: params.projectId ?? null,
          task_memory: taskMemory,
        },
      })
      .select('id')
      .single()

    if (rootError) throw rootError

    const steps = params.mode === 'bundle' && params.bundleType
      ? this.getBundleSteps(params.bundleType)
      : this.getSingleAgentStep(params.serviceId)

    // Create execution_trace rows
    const traceRows = steps.map((step, index) => ({
      root_job_id: rootJob.id,
      step_index: index,
      agent_id: step.agentId,
      label: step.label,
      status: 'pending' as const,
    }))

    const { error: traceError } = await db.from('execution_trace').insert(traceRows)
    if (traceError) throw traceError

    structuredLog('info', 'agent_g_plan_dispatched', {
      rootJobId: rootJob.id,
      steps: steps.length,
      bundleType: params.bundleType,
    })

    return {
      rootJobId: rootJob.id,
      steps: steps.map((s, i) => ({ stepIndex: i, ...s, status: 'pending' as const })),
      bundleType: params.bundleType,
      createdAt: new Date().toISOString(),
    }
  }

  // ─── QA Gate ───────────────────────────────────────────────────────────────
  async handleQAFail(params: {
    rootJobId: string
    stepIndex: number
    agentId: string
    qaScore: number
    userId: string
    payload: Record<string, unknown>
  }): Promise<void> {
    structuredLog('warn', 'qa_fail_fix_pass', {
      rootJobId: params.rootJobId, qaScore: params.qaScore
    })
    const db = supabase()
    // Enqueue fix pass job for same agent
    await db.from('jobs').insert({
      user_id: params.userId,
      agent_id: params.agentId,
      parent_job_id: params.rootJobId,
      status: 'queued',
      priority: 9,
      payload: {
        ...params.payload,
        type: 'fix_pass',
        qa_score: params.qaScore,
        fix_iteration: ((params.payload.fix_iteration as number) ?? 0) + 1,
      },
    })
  }

  // ─── Task Memory ───────────────────────────────────────────────────────────
  private async getTaskMemory(userId: string): Promise<Record<string, unknown>> {
    const db = supabase()
    const { data: profile } = await db
      .from('profiles')
      .select('display_name, avatar_url, metadata')
      .eq('id', userId)
      .maybeSingle()

    return {
      brand_name: profile?.display_name ?? 'MyAvatar.ge',
      language: 'ka',
      avatar_url: profile?.avatar_url ?? null,
      ...(profile?.metadata as Record<string, unknown> ?? {}),
    }
  }

  private getBundleSteps(bundleType: BundleType) {
    const bundle = AGENT_G_BUNDLES.find(b => b.type === bundleType)
    if (!bundle) throw new Error(`Unknown bundle type: ${bundleType}`)
    return bundle.steps
  }

  private getSingleAgentStep(serviceId: string) {
    const service = SERVICE_REGISTRY.find(s => s.id === serviceId)
    if (!service) throw new Error(`Unknown service: ${serviceId}`)
    return [{ agentId: service.agentId, label: `Run ${service.name}` }]
  }
}

export const agentGRouter = new AgentGRouter()
