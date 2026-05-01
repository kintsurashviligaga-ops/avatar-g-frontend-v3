'use client'

/**
 * UploadPreviewTray — shows attachment previews above the composer.
 * Allows removal before sending.
 */

import type { FCAttachment } from './types'
import Image from 'next/image'

interface Props {
  attachments: FCAttachment[]
  onRemove: (id: string) => void
}

export function UploadPreviewTray({ attachments, onRemove }: Props) {
  if (attachments.length === 0) return null

  return (
    <div className="px-4 sm:px-6 py-2" style={{ borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
      <div className="max-w-2xl mx-auto flex gap-2 overflow-x-auto no-scrollbar">
        {attachments.map(att => (
          <div key={att.id} className="chat-attachment">
            {att.kind === 'image' && att.localPreviewUrl ? (
              <Image src={att.localPreviewUrl} alt={att.fileName} width={56} height={56} unoptimized className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}>
                {att.kind === 'video' ? '🎬' : att.kind === 'audio' ? '🎵' : '📎'}
              </div>
            )}
            <button onClick={() => onRemove(att.id)} className="remove-btn" aria-label="Remove">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
