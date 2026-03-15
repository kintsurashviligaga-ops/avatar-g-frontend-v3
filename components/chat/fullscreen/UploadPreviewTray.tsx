'use client'

/**
 * UploadPreviewTray — shows attachment previews above the composer.
 * Allows removal before sending.
 */

import type { FCAttachment } from './types'

interface Props {
  attachments: FCAttachment[]
  onRemove: (id: string) => void
}

export function UploadPreviewTray({ attachments, onRemove }: Props) {
  if (attachments.length === 0) return null

  return (
    <div
      className="px-4 sm:px-6 py-2"
      style={{ borderTop: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}
    >
      <div className="max-w-2xl mx-auto flex gap-2 overflow-x-auto no-scrollbar">
        {attachments.map(att => (
          <div
            key={att.id}
            className="relative shrink-0 group"
          >
            {att.kind === 'image' && att.localPreviewUrl ? (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                <img src={att.localPreviewUrl} alt={att.fileName} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {att.kind === 'video' ? '🎬' : att.kind === 'audio' ? '🎵' : '📎'}
                <span className="max-w-[100px] truncate">{att.fileName}</span>
              </div>
            )}

            {/* Remove button */}
            <button
              onClick={() => onRemove(att.id)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm"
              style={{ backgroundColor: 'var(--color-text)', color: 'var(--color-bg)' }}
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
