'use client'

import type { FCAgentMessage } from './types'

interface Props {
  message: FCAgentMessage
}

export function AgentBubble({ message }: Props) {
  return (
    <div className="flex justify-start">
      <div className="flex gap-2.5 max-w-[85%] sm:max-w-[75%] md:max-w-[70%]">
        {/* Agent avatar */}
        <div
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm mt-0.5"
          style={{ backgroundColor: 'var(--color-accent-soft)', border: '1px solid rgba(34,211,238,0.2)' }}
        >
          🤖
        </div>

        {/* Bubble */}
        <div
          className="rounded-2xl rounded-tl-md px-4 py-3 text-sm sm:text-[15px] leading-relaxed"
          style={{
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          {message.isStreaming && !message.text ? (
            <div className="flex items-center gap-1.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-accent)', animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-accent)', animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--color-accent)', animationDelay: '300ms' }} />
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          )}

          {/* Suggestion chips */}
          {message.suggestions && message.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
              {message.suggestions.map((s, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium"
                  style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
