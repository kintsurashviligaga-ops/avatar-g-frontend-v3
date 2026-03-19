'use client'

interface ChatActionChipsProps {
  onAction: (action: string) => void
}

const CHIPS = [
  { id: 'image', icon: '🖼️', label: 'Image' },
  { id: 'voice', icon: '🎙️', label: 'Voice Mode' },
  { id: 'camera', icon: '📷', label: 'Open Camera' },
  { id: 'document', icon: '📄', label: 'Document' },
  { id: 'code', icon: '💻', label: 'Code' },
]

export function ChatActionChips({ onAction }: ChatActionChipsProps) {
  return (
    <div className="grok-action-chips-scroll">
      <div className="grok-action-chips">
        {CHIPS.map(chip => (
          <button
            key={chip.id}
            onClick={() => onAction(chip.id)}
            className="grok-action-chip"
            type="button"
          >
            <span className="text-[14px]">{chip.icon}</span>
            <span>{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
