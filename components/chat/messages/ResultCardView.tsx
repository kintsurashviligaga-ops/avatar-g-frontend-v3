'use client';

/**
 * components/chat/messages/ResultCardView.tsx
 * =============================================
 * Renders a normalized ResultCard with preview, title,
 * metadata, action buttons, and export options.
 */

import { Download } from 'lucide-react';
import type { ResultCard } from '@/lib/chat/types';

interface Props {
  card: ResultCard;
  onAction: (action: string) => void;
}

export function ResultCardView({ card, onAction }: Props) {
  const isMedia = ['avatar', 'video', 'image', 'poster', 'thumbnail', 'music'].includes(card.resultType);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* Preview */}
      {card.preview && isMedia && (
        <div className="relative aspect-video bg-black/20">
          {card.resultType === 'video' ? (
            <video src={card.preview} className="w-full h-full object-cover" controls />
          ) : card.resultType === 'music' ? (
            <div className="w-full h-full flex items-center justify-center">
              <audio src={card.preview} controls className="w-4/5" />
            </div>
          ) : (
            <img src={card.preview} alt={card.title} className="w-full h-full object-cover" />
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
              {card.title}
            </h4>
            {card.subtitle && (
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                {card.subtitle}
              </p>
            )}
          </div>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium capitalize"
            style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
          >
            {card.resultType}
          </span>
        </div>

        {/* QA Score */}
        {card.qaScore !== undefined && (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
              Quality: {card.qaScore}/100
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5">
          {card.actions.map((action) => (
            <button
              key={action.label}
              onClick={() => onAction(action.action)}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-xl transition-colors"
              style={{
                backgroundColor: action.variant === 'primary' ? 'var(--color-accent)' : 'var(--color-surface)',
                color: action.variant === 'primary' ? '#fff' : 'var(--color-text-secondary)',
                border: action.variant === 'primary' ? 'none' : '1px solid var(--color-border)',
              }}
            >
              {action.icon && <span>{action.icon}</span>}
              {action.label}
            </button>
          ))}

          {/* Suggestions as secondary actions */}
          {card.suggestions.map((sug) => (
            <button
              key={sug.label}
              onClick={() => onAction(sug.action)}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-xl transition-colors"
              style={{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              {sug.icon && <span>{sug.icon}</span>}
              {sug.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
