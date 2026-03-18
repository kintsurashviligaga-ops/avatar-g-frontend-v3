'use client'

import type { FCAgentMessage } from './types'

interface Props {
  message: FCAgentMessage
}

export function AgentBubble({ message }: Props) {
  return (
    <div className="flex justify-start">
      <div className="flex gap-2.5 max-w-[85%] sm:max-w-[75%] md:max-w-[70%]">
        <div className="chat-agent-avatar mt-0.5">🤖</div>
        <div className="chat-bubble-agent">
          {message.isStreaming && !message.text ? (
            <div className="chat-bounce-dots">
              <span /><span /><span />
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          )}
          {message.suggestions && message.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
              {message.suggestions.map((s, i) => (
                <span key={i} className="chat-suggestion primary">{s}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
