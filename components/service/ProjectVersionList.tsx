'use client'

import { useState, useEffect } from 'react'
import type { ServiceId } from '@/lib/services/registry'

type ProjectLocale = 'ka' | 'en' | 'ru'

interface ProjectItem {
  id: string
  title: string
  service_id: string
  active_version: number
  created_at: string
  project_versions?: { id: string; version: number; status: string; qa_score: number | null }[]
}

interface Props {
  serviceId?: ServiceId
  userId?: string
  locale?: ProjectLocale
  labels?: Partial<ProjectListLabels>
  endpoint?: string
}

interface ProjectListLabels {
  title: string
  loading: string
  empty: string
  versionPrefix: string
  statusDraft: string
  statusRunning: string
  statusDone: string
  statusFailed: string
}

const statusColor: Record<string, string> = {
  draft: 'text-white/40',
  running: 'text-yellow-400',
  done: 'text-green-400',
  failed: 'text-red-400',
}

const COPY_BY_LOCALE: Record<ProjectLocale, ProjectListLabels> = {
  ka: {
    title: 'პროექტები',
    loading: 'პროექტები იტვირთება...',
    empty: 'პროექტები ჯერ არ არის. დასაწყებად გაგზავნე ბრიფი.',
    versionPrefix: 'ვ',
    statusDraft: 'დრაფტი',
    statusRunning: 'მიმდინარეობს',
    statusDone: 'დასრულდა',
    statusFailed: 'ვერ შესრულდა',
  },
  en: {
    title: 'Projects',
    loading: 'Loading projects...',
    empty: 'No projects yet. Submit a brief to get started.',
    versionPrefix: 'v',
    statusDraft: 'draft',
    statusRunning: 'running',
    statusDone: 'done',
    statusFailed: 'failed',
  },
  ru: {
    title: 'Проекты',
    loading: 'Загрузка проектов...',
    empty: 'Проектов пока нет. Отправьте бриф, чтобы начать.',
    versionPrefix: 'в',
    statusDraft: 'черновик',
    statusRunning: 'выполняется',
    statusDone: 'готово',
    statusFailed: 'ошибка',
  },
}

export function ProjectVersionList({
  serviceId,
  userId: _userId = 'guest',
  locale = 'ka',
  labels,
  endpoint = '/api/projects',
}: Props) {
  const activeLocale: ProjectLocale = locale === 'en' || locale === 'ru' ? locale : 'ka'
  const t = { ...COPY_BY_LOCALE[activeLocale], ...(labels ?? {}) }

  const statusLabelMap: Record<string, string> = {
    draft: t.statusDraft,
    running: t.statusRunning,
    done: t.statusDone,
    failed: t.statusFailed,
  }

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(endpoint)
        if (!res.ok) return
        const data = await res.json()

        setProjects(
          (data.projects ?? []).filter((p: ProjectItem) => !serviceId || p.service_id === serviceId)
        )
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [endpoint, serviceId])

  if (loading) {
    return (
      <div className="text-sm text-white/30 py-4">{t.loading}</div>
    )
  }

  if (projects.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-2">
          {t.title}
        </h3>
        <p className="text-sm text-white/30">{t.empty}</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
        {t.title}
      </h3>
      <div className="space-y-2">
        {projects.map((project) => (
          <div
            key={project.id}
            className="p-3 bg-white/[0.04] border border-white/[0.08] rounded-xl hover:border-white/20 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{project.title}</span>
              <span className="text-xs text-white/40">{t.versionPrefix}{project.active_version}</span>
            </div>
            {project.project_versions && project.project_versions.length > 0 && (
              <div className="mt-1.5 flex gap-2 flex-wrap">
                {project.project_versions.slice(0, 5).map((v) => (
                  <span
                    key={v.id}
                    className={`text-xs ${statusColor[v.status] ?? 'text-white/40'}`}
                  >
                    {t.versionPrefix}{v.version} {statusLabelMap[v.status] ?? v.status}
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
