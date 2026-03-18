'use client'

import type { FCSystemMessage } from './types'

interface Props {
  message: FCSystemMessage
}

const STATUS_ICONS: Record<string, string> = {
  uploading: '📤',
  listening: '🎙️',
  processing: '⚙️',
  generating: '✨',
  complete: '✅',
  error: '❌',
}

export function SystemStatusCard({ message }: Props) {
  const icon = STATUS_ICONS[message.statusType] || '💬'
  const isActive = message.statusType === 'processing' || message.statusType === 'generating' || message.statusType === 'uploading' || message.statusType === 'listening'

  return (
    <div className="flex justify-center">
      <div className="chat-status-badge">
        {isActive ? (
          <span className="pulse-dot" />
        ) : (
          <span>{icon}</span>
        )}
        {message.text}
      </div>
    </div>
  )
}
