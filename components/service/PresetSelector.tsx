'use client'

import { useState } from 'react'
import type { ServiceId } from '@/lib/services/registry'
import { STYLE_PRESETS, type ServicePreset } from '@/types/services'

interface Props {
  serviceId: ServiceId
  onSelect?: (preset: ServicePreset) => void
}

export function PresetSelector({ serviceId: _serviceId, onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
        Quick Presets
      </h3>
      <div className="flex flex-wrap gap-2">
        {STYLE_PRESETS.map((preset) => (
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
