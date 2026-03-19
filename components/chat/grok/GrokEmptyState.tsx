'use client'

interface GrokEmptyStateProps {
  serviceIcon: string
  onSuggestionClick?: (text: string) => void
}

const SUGGESTIONS = [
  { icon: '🎨', text: 'Create an avatar in my style' },
  { icon: '🎬', text: 'Generate a cinematic video' },
  { icon: '📝', text: 'Write marketing copy' },
  { icon: '🎵', text: 'Compose background music' },
]

export function GrokEmptyState({ serviceIcon, onSuggestionClick }: GrokEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      {/* Animated logo with 4D glow */}
      <div className="grok-empty-logo">
        <div className="grok-empty-glow" />
        <span className="text-[56px] relative z-10">{serviceIcon}</span>
      </div>

      {/* Welcome text */}
      <h2 className="text-[22px] font-bold mt-6 mb-1" style={{ color: '#fff' }}>
        What can I help with?
      </h2>
      <p className="text-[14px] mb-8" style={{ color: 'rgba(255,255,255,0.4)' }}>
        Ask anything or create with AI
      </p>

      {/* Suggestion pills */}
      <div className="grok-suggestions">
        {SUGGESTIONS.map((s, i) => (
          <button key={i} className="grok-suggestion-pill" onClick={() => onSuggestionClick?.(s.text)}>
            <span className="text-[16px]">{s.icon}</span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
