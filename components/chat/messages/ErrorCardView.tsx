'use client';

/**
 * components/chat/messages/ErrorCardView.tsx
 * ============================================
 * Shows error with user-friendly message, recovery actions,
 * and alternative suggestions.
 */

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  code?: string;
  userMessage: string;
  recoverable?: boolean;
  retryAction?: string;
  alternatives?: Array<{ label: string; action: string }>;
  onAction: (action: string) => void;
}

export function ErrorCardView({ code, userMessage, recoverable, retryAction, alternatives, onAction }: Props) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm" style={{ color: 'var(--color-text)' }}>
            {userMessage}
          </p>
          {code && (
            <p className="text-[10px] mt-1 font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
              Error: {code}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {recoverable && retryAction && (
              <button
                onClick={() => onAction(retryAction)}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-xl transition-colors"
                style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            )}
            {alternatives?.map((alt) => (
              <button
                key={alt.label}
                onClick={() => onAction(alt.action)}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-xl transition-colors"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {alt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
