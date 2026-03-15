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
      <div
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium"
        style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text-secondary)',
          border: '1px solid var(--color-border)',
        }}
      >
        {isActive ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ backgroundColor: 'var(--color-accent)' }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
          </span>
        ) : (
          <span>{icon}</span>
        )}
        {message.text}
      </div>
    </div>
  )
}
