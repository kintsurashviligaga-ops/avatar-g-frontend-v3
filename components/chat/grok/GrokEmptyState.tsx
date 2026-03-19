'use client'

interface GrokEmptyStateProps {
  serviceIcon: string
}

export function GrokEmptyState({ serviceIcon }: GrokEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="grok-empty-logo">
        <span className="text-[48px] opacity-30">{serviceIcon}</span>
      </div>
    </div>
  )
}
