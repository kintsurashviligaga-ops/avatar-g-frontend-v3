'use client'

import Image from 'next/image'

interface GrokEmptyStateProps {
  serviceIcon: string
  onSuggestionClick?: (text: string) => void
}

export function GrokEmptyState({ serviceIcon }: GrokEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      {/* Animated logo with 4D glow */}
      <div className="grok-empty-logo">
        <div className="grok-empty-glow" />
        <Image
          src="/brand/gemini-rocket-clean.png"
          alt="MyAvatar.ge"
          width={64}
          height={64}
          className="object-contain relative z-10"
        />
      </div>
    </div>
  )
}
