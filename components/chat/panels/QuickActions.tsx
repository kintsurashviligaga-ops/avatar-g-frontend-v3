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
          className="chat-chip"
          style={{ width: '100%', justifyContent: 'flex-start' }}
        >
          <span className="text-lg flex-shrink-0">{qa.icon}</span>
          <span className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>
            {qa.label[lang]}
          </span>
        </button>
      ))}
    </div>
  );
}
