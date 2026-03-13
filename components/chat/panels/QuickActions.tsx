'use client';

/**
 * components/chat/panels/QuickActions.tsx
 * =========================================
 * Config-driven quick action cards shown in welcome or empty states.
 */

import { getVisibleQuickActions } from '@/lib/chat/config/quickActionConfig';

interface Props {
  language: string;
  hasProject: boolean;
  onAction: (action: string) => void;
}

export function QuickActions({ language, hasProject, onAction }: Props) {
  const actions = getVisibleQuickActions(hasProject);
  const lang = (language === 'ka' || language === 'ru') ? language : 'en';

  if (!actions.length) return null;

  return (
    <div className="space-y-2">
      {actions.slice(0, 6).map((qa) => (
        <button
          key={qa.id}
          onClick={() => onAction(qa.intent)}
          className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all hover:scale-[1.005] active:scale-[0.995]"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <span className="text-lg flex-shrink-0">{qa.icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>
              {qa.label[lang]}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
