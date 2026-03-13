'use client';

/**
 * components/chat/input/AttachmentTray.tsx
 * ==========================================
 * Preview row of attached files with remove buttons.
 */

import { X } from 'lucide-react';
import type { ChatAttachment } from '@/lib/chat/types';

interface Props {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}

export function AttachmentTray({ attachments, onRemove }: Props) {
  if (!attachments.length) return null;

  return (
    <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
      {attachments.map(att => (
        <div key={att.attachmentId} className="relative flex-shrink-0 group">
          {att.previewUrl ? (
            <img
              src={att.previewUrl}
              alt={att.fileName}
              className="w-14 h-14 rounded-xl object-cover"
              style={{ border: '1px solid var(--color-border)' }}
            />
          ) : (
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-xs"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {att.type === 'video' ? '🎬' : att.type === 'audio' ? '🎵' : '📄'}
            </div>
          )}
          <button
            onClick={() => onRemove(att.attachmentId)}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
