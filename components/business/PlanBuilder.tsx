'use client'
import { useState, useEffect } from 'react'

interface BusinessProject {
  id: string
  title: string
  description: string | null
  status: string
  niche: string | null
  target_market: string | null
  brand_name: string | null
  created_at: string
}

export function PlanBuilder({ userId: _userId }: { userId: string }) {
  const [projects, setProjects] = useState<BusinessProject[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [niche, setNiche] = useState('')
  const [targetMarket, setTargetMarket] = useState('')
  const [brandName, setBrandName] = useState('')

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/business/projects')
      if (!res.ok) return
      const json = await res.json()
      setProjects(json.projects ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProjects() }, [])

  const createProject = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/business/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          niche: niche.trim() || undefined,
          target_market: targetMarket.trim() || undefined,
          brand_name: brandName.trim() || undefined,
        }),
      })
      if (res.ok) {
        setTitle('')
        setDescription('')
        setNiche('')
        setTargetMarket('')
        setBrandName('')
        await loadProjects()
      }
    } finally {
      setCreating(false)
    }
  }

  const inputClass = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20'

  return (
    <div className="space-y-6">
      {/* Create project form */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">New Business Project</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-white/40 block mb-1">Project Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Phone Accessories Import" className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-white/40 block mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief project description..." rows={2} className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-white/40 block mb-1">Niche</label>
            <input value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g. Electronics" className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-white/40 block mb-1">Target Market</label>
            <input value={targetMarket} onChange={e => setTargetMarket(e.target.value)} placeholder="e.g. Georgia" className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-white/40 block mb-1">Brand Name</label>
            <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Optional brand name" className={inputClass} />
          </div>
        </div>
        <button
          onClick={createProject}
          disabled={creating || !title.trim()}
          className="w-full bg-white text-[#050510] font-semibold text-sm py-2.5 rounded-xl hover:bg-white/90 transition-colors disabled:opacity-40"
        >
          {creating ? 'Creating...' : 'Create Project'}
        </button>
      </div>

      {/* Project list */}
      <div>
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Your Projects</h3>
        {loading ? (
          <p className="text-sm text-white/30">Loading...</p>
        ) : projects.length === 0 ? (
          <div className="border-2 border-dashed border-white/[0.06] rounded-xl p-8 text-center">
            <p className="text-sm text-white/30">No projects yet. Create your first one above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map(p => (
              <div key={p.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.12] transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-white">{p.title}</h4>
                    {p.description && <p className="text-xs text-white/40 mt-0.5">{p.description}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.status === 'active' ? 'bg-green-500/20 text-green-400' :
                    p.status === 'completed' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-white/10 text-white/40'
                  }`}>
                    {p.status}
                  </span>
                </div>
                <div className="flex gap-3 mt-2 text-xs text-white/30">
                  {p.niche && <span>Niche: {p.niche}</span>}
                  {p.target_market && <span>Market: {p.target_market}</span>}
                  {p.brand_name && <span>Brand: {p.brand_name}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
