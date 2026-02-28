'use client'
import { useState } from 'react'
import { ExecutionTraceWidget } from '@/components/service/ExecutionTraceWidget'

const BUNDLE_OPTIONS = [
  { id: 'business_plan', label: 'Business Plan', desc: 'Generates complete plan + brand kit visuals' },
  { id: 'product_analysis', label: 'Product Analysis', desc: 'Profit model + product brief' },
  { id: 'resell_pipeline', label: 'Resell Pipeline', desc: 'Sourcing → logistics → listing → shop' },
  { id: 'marketplace_listing_pack', label: 'Marketplace Listing Pack', desc: 'Compliance + copy + images + video + listing' },
] as const

interface Props { userId: string }

export function PipelineBuilder({ userId }: Props) {
  const [selectedBundle, setSelectedBundle] = useState<string | null>(null)
  const [projectId, setProjectId] = useState('')
  const [goal, setGoal] = useState('')
  const [running, setRunning] = useState(false)
  const [rootJobId, setRootJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inputClass = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20'

  const runPipeline = async () => {
    if (!selectedBundle || !projectId.trim()) return
    setRunning(true)
    setError(null)
    setRootJobId(null)
    try {
      const res = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: 'agent-g',
          intake: {
            goal: goal.trim(),
            business_intent: selectedBundle,
            project_id: projectId.trim(),
          },
          mode: 'bundle',
          bundle_type: selectedBundle,
          project_id: projectId.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Pipeline execution failed')
      } else {
        setRootJobId(json.rootJobId ?? json.plan?.rootJobId ?? null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Bundle selector */}
      <div>
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Select Pipeline</h3>
        <div className="grid grid-cols-2 gap-3">
          {BUNDLE_OPTIONS.map(bundle => (
            <button
              key={bundle.id}
              onClick={() => setSelectedBundle(bundle.id)}
              className={`
                text-left p-4 rounded-xl border transition-all
                ${selectedBundle === bundle.id
                  ? 'border-white/30 bg-white/[0.08]'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'}
              `}
            >
              <p className="text-sm font-medium text-white">{bundle.label}</p>
              <p className="text-xs text-white/40 mt-1">{bundle.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Config */}
      {selectedBundle && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Configure</h3>
          <div>
            <label className="text-xs text-white/40 block mb-1">Project ID *</label>
            <input value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="Paste your project UUID" className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-white/40 block mb-1">Goal / Brief</label>
            <textarea value={goal} onChange={e => setGoal(e.target.value)} placeholder="Describe what you want to achieve..." rows={3} className={inputClass} />
          </div>
          <button
            onClick={runPipeline}
            disabled={running || !projectId.trim()}
            className="w-full bg-white text-[#050510] font-semibold text-sm py-2.5 rounded-xl hover:bg-white/90 transition-colors disabled:opacity-40"
          >
            {running ? 'Running Pipeline...' : 'Run Pipeline'}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}

      {/* Execution trace */}
      {rootJobId && (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
          <ExecutionTraceWidget userId={userId} rootJobId={rootJobId} />
        </div>
      )}
    </div>
  )
}
