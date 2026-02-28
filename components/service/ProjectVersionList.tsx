'use client'

import { useState, useEffect } from 'react'
import type { ServiceId } from '@/lib/services/registry'

interface ProjectItem {
  id: string
  title: string
  service_id: string
  active_version: number
  created_at: string
  project_versions?: { id: string; version: number; status: string; qa_score: number | null }[]
}

interface Props {
  serviceId: ServiceId
  userId: string
}

const statusColor: Record<string, string> = {
  draft: 'text-white/40',
  running: 'text-yellow-400',
  done: 'text-green-400',
  failed: 'text-red-400',
}

export function ProjectVersionList({ serviceId, userId: _userId }: Props) {
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/projects')
        if (!res.ok) return
        const data = await res.json()
        setProjects(
          (data.projects ?? []).filter((p: ProjectItem) => p.service_id === serviceId)
        )
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [serviceId])

  if (loading) {
    return (
      <div className="text-sm text-white/30 py-4">Loading projects...</div>
    )
  }

  if (projects.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-2">
          Projects
        </h3>
        <p className="text-sm text-white/30">No projects yet. Submit a brief to get started.</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
        Projects
      </h3>
      <div className="space-y-2">
        {projects.map((project) => (
          <div
            key={project.id}
            className="p-3 bg-white/[0.04] border border-white/[0.08] rounded-xl hover:border-white/20 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{project.title}</span>
              <span className="text-xs text-white/40">v{project.active_version}</span>
            </div>
            {project.project_versions && project.project_versions.length > 0 && (
              <div className="mt-1.5 flex gap-2 flex-wrap">
                {project.project_versions.slice(0, 5).map((v) => (
                  <span
                    key={v.id}
                    className={`text-xs ${statusColor[v.status] ?? 'text-white/40'}`}
                  >
                    v{v.version} {v.status}
                    {v.qa_score !== null && ` (${v.qa_score}%)`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
