'use client'

import { useState } from 'react'
import type { ServiceId } from '@/lib/services/registry'

type GridLocale = 'ka' | 'en' | 'ru'

interface Artifact {
  bucket: string
  path: string
  mimeType: string
  sizeBytes: number
  label: string
  url?: string
}

interface ArtifactGridLabels {
  title: string
  emptyState: string
  sizeUnit: string
}

interface Props {
  userId?: string
  serviceId?: ServiceId
  locale?: GridLocale
  labels?: Partial<ArtifactGridLabels>
  artifacts?: Artifact[]
}

const COPY_BY_LOCALE: Record<GridLocale, ArtifactGridLabels> = {
  ka: {
    title: 'არტიფაქტები',
    emptyState: 'დასრულებული შედეგები აქ გამოჩნდება.',
    sizeUnit: 'კბ',
  },
  en: {
    title: 'Artifacts',
    emptyState: 'Completed outputs will appear here.',
    sizeUnit: 'KB',
  },
  ru: {
    title: 'Артефакты',
    emptyState: 'Готовые результаты появятся здесь.',
    sizeUnit: 'КБ',
  },
}

export function ArtifactGrid({
  userId: _userId = 'guest',
  serviceId: _serviceId,
  locale = 'ka',
  labels,
  artifacts,
}: Props) {
  const [internalArtifacts, _setArtifacts] = useState<Artifact[]>([])

  const activeLocale: GridLocale = locale === 'en' || locale === 'ru' ? locale : 'ka'
  const t = { ...COPY_BY_LOCALE[activeLocale], ...(labels ?? {}) }
  const resolvedArtifacts = artifacts ?? internalArtifacts

  // Placeholder: in production, artifacts come from completed job results
  // via realtime subscription or polling

  if (resolvedArtifacts.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
          {t.title}
        </h3>
        <div className="border-2 border-dashed border-white/[0.06] rounded-xl p-8 text-center">
          <p className="text-sm text-white/30">
            {t.emptyState}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
        {t.title}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {resolvedArtifacts.map((artifact, i) => (
          <div
            key={i}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 hover:border-white/20 transition-colors cursor-pointer"
          >
            <div className="aspect-video bg-white/[0.02] rounded-lg mb-2 flex items-center justify-center">
              {artifact.mimeType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={artifact.url ?? '#'}
                  alt={artifact.label}
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <span className="text-xs text-white/20">{artifact.mimeType}</span>
              )}
            </div>
            <p className="text-xs text-white truncate">{artifact.label}</p>
            <p className="text-xs text-white/30">{(artifact.sizeBytes / 1024).toFixed(0)} {t.sizeUnit}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
