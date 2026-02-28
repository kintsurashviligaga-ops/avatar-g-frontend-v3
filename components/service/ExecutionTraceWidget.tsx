'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'

interface TraceStep {
  id: string
  root_job_id: string
  step_index: number
  agent_id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  qa_score: number | null
  duration_ms: number | null
}

interface Props {
  userId: string
  rootJobId?: string
}

const statusIcon: Record<string, string> = {
  pending: '○',
  running: '◐',
  done: '●',
  failed: '✕',
  skipped: '—',
}

const statusColor: Record<string, string> = {
  pending: 'text-white/30',
  running: 'text-yellow-400',
  done: 'text-green-400',
  failed: 'text-red-400',
  skipped: 'text-white/20',
}

export function ExecutionTraceWidget({ userId: _userId, rootJobId }: Props) {
  const [steps, setSteps] = useState<TraceStep[]>([])

  const fetchSteps = useCallback(async () => {
    if (!rootJobId) return
    const supabase = createBrowserClient()
    const { data } = await supabase
      .from('execution_trace')
      .select('*')
      .eq('root_job_id', rootJobId)
      .order('step_index', { ascending: true })

    if (data) setSteps(data as TraceStep[])
  }, [rootJobId])

  useEffect(() => {
    fetchSteps()

    if (!rootJobId) return

    const supabase = createBrowserClient()
    const channel = supabase
      .channel(`trace-${rootJobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'execution_trace',
          filter: `root_job_id=eq.${rootJobId}`,
        },
        () => fetchSteps()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [rootJobId, fetchSteps])

  if (steps.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
          Execution Trace
        </h3>
        <p className="text-sm text-white/30">No active execution. Submit a project brief to begin.</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
        Execution Trace
      </h3>
      <div className="space-y-1">
        {steps.map((step) => (
          <div
            key={step.id}
            className="flex items-center gap-3 px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg"
          >
            <span className={`text-lg ${statusColor[step.status]}`}>
              {statusIcon[step.status]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">{step.label}</div>
              <div className="text-xs text-white/30">{step.agent_id}</div>
            </div>
            {step.qa_score !== null && (
              <span className={`text-xs font-mono ${step.qa_score >= 85 ? 'text-green-400' : 'text-yellow-400'}`}>
                QA: {step.qa_score}
              </span>
            )}
            {step.duration_ms !== null && (
              <span className="text-xs text-white/30 font-mono">
                {(step.duration_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
