'use client'

import type { FCUserMessage } from './types'

interface Props {
  message: FCUserMessage
}

export function UserBubble({ message }: Props) {
  return (
    <div className="flex justify-end">
      <div className="chat-bubble-user">
        {message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.attachments.map(att => (
              <span key={att.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                {att.kind === 'image' ? '📷' : att.kind === 'video' ? '🎬' : att.kind === 'audio' ? '🎵' : '📎'}
                {att.fileName.length > 20 ? att.fileName.slice(0, 18) + '…' : att.fileName}
              </span>
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        {message.status === 'sending' && (
          <p className="text-[10px] mt-1 opacity-60">…</p>
        )}
      </div>
    </div>
  )
}
