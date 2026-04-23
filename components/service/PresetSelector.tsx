'use client'

import { useState } from 'react'
import type { ServiceId } from '@/lib/services/registry'
import { STYLE_PRESETS, type ServicePreset } from '@/types/services'

type PresetLocale = 'ka' | 'en' | 'ru'

interface PresetSelectorLabels {
  title: string
}

interface Props {
  serviceId?: ServiceId
  locale?: PresetLocale
  labels?: Partial<PresetSelectorLabels>
  presets?: ServicePreset[]
  onSelect?: (preset: ServicePreset) => void
}

const COPY_BY_LOCALE: Record<PresetLocale, PresetSelectorLabels> = {
  ka: {
    title: 'სწრაფი პრესეტები',
  },
  en: {
    title: 'Quick Presets',
  },
  ru: {
    title: 'Быстрые пресеты',
  },
}

export function PresetSelector({
  serviceId: _serviceId,
  locale = 'ka',
  labels,
  presets,
  onSelect,
}: Props) {
  const activeLocale: PresetLocale = locale === 'en' || locale === 'ru' ? locale : 'ka'
  const t = { ...COPY_BY_LOCALE[activeLocale], ...(labels ?? {}) }

  const [selected, setSelected] = useState<string | null>(null)
  const resolvedPresets = presets ?? STYLE_PRESETS

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
        {t.title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {resolvedPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              setSelected(preset.id)
              onSelect?.(preset)
            }}
            className={`
              px-3 py-1.5 text-xs rounded-lg border transition-all
              ${selected === preset.id
                ? 'border-white/30 bg-white/10 text-white'
                : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:text-white hover:border-white/20'}
            `}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}
